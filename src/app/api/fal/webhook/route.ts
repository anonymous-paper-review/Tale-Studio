// POST /api/fal/webhook — FAL 비동기 생성 완료 콜백 수신.
//
// FAL이 작업 완료 시 이 엔드포인트로 결과를 POST한다. ED25519 서명으로 위조를 차단하고,
// request_id로 generation_jobs 행을 찾아 서버사이드에서 결과를 영속화(storage/DB)한다.
// → 사용자가 브라우저를 닫아도 결과가 유실되지 않는다(동기/클라폴링 대비 핵심 이점).
//
// 멱등: 같은 request_id 재전송 대비 status==='queued'일 때만 처리. 빠르게 2xx 반환(FAL 15s 타임아웃).
import { NextResponse, after } from 'next/server'
import {
  readFalWebhookHeaders,
  verifyFalWebhook,
} from '@/lib/fal/verify-webhook'
import {
  getGenerationJobByRequestId,
  failGenerationJob,
  classifyFalFailure,
  GenerationJobTerminalTransitionError,
} from '@/lib/generation-jobs'
import { markDirectorVideoAttemptFailed } from '@/lib/director-video-takes'
import {
  DirectorVideoCompletionPersistenceError,
  finalizeGenerationJob,
} from '@/lib/fal/finalize'
import { reconcileJobFromFal } from '@/lib/fal/reconcile'
import { describeFinalizeError } from '@/lib/fal/error-evidence'
import { releaseTakesForJob } from '@/lib/billing/take-hold'

// #payments-phase-2 #gen-quota-atomic-gate: 영상 잍(shot_video 레거시 unlinked 포함/shot_previz_video)이
//   failGenerationJob 경로로 종결될 때만 hold 반환을 함께 부른다. markDirectorVideoAttemptFailed 는 자체적으로
//   반환을 물고 있어 이족이 필요 없다.
function isTakeBilledVideoKind(kind: string): boolean {
  return kind === 'shot_video' || kind === 'shot_previz_video'
}

export const runtime = 'nodejs'
export const maxDuration = 60

interface FalWebhookBody {
  request_id?: string
  gateway_request_id?: string
  status?: string // 'OK' | 'ERROR'
  payload?: unknown
  payload_error?: string
}

function extractImageUrl(payload: unknown): string {
  const data = payload as {
    images?: Array<{ url?: string }>
    image?: { url?: string }
  }
  return data?.images?.[0]?.url ?? data?.image?.url ?? ''
}

function extractVideoUrl(payload: unknown): string {
  const data = payload as { video?: { url?: string } }
  return data?.video?.url ?? ''
}

/**
 * 응답을 보낸 뒤 실행한다(#webhook-answers-fast 2026-09-08).
 *
 * after() 는 요청 컨텍스트 안에서만 쓸 수 있다 — 테스트처럼 컨텍스트 밖이면 던진다.
 *   그때는 그냥 그 자리에서 실행한다. 프로덕션에서는 after() 가 잡아 응답 뒤로 미룬다.
 */
async function runAfterResponse(work: () => Promise<void>): Promise<void> {
  try {
    after(work)
  } catch {
    await work()
  }
}

export async function POST(req: Request) {
  // 서명 검증을 위해 raw body 그대로 읽음 (파싱 전 SHA-256 해시 대상).
  const rawBody = await req.text()
  const headers = readFalWebhookHeaders(req.headers)

  const valid = await verifyFalWebhook(headers, rawBody)
  if (!valid) {
    return NextResponse.json(
      { ok: false, error: { code: 'invalid_signature', message: 'signature verification failed' } },
      { status: 401 },
    )
  }

  let body: FalWebhookBody
  try {
    body = JSON.parse(rawBody) as FalWebhookBody
  } catch {
    return NextResponse.json(
      { ok: false, error: { code: 'bad_json', message: 'invalid body' } },
      { status: 400 },
    )
  }

  const requestId = body.request_id ?? body.gateway_request_id
  if (!requestId || typeof requestId !== 'string') {
    console.warn('[fal/webhook] signed payload missing request identifier')
    return NextResponse.json(
      { ok: false, error: { code: 'missing_request_id', message: 'request_id is required' } },
      { status: 400 },
    )
  }

  const job = await getGenerationJobByRequestId(requestId)
  if (!job) return NextResponse.json({ ok: true }) // 추적 안 하는 작업 → 무시
  if (job.status !== 'queued') return NextResponse.json({ ok: true }) // 멱등: 이미 처리됨

  if (body.status !== 'OK') {
    const raw = body.payload_error ?? 'fal webhook reported ERROR'
    const cls = classifyFalFailure(raw)
    // moderation(콘텐츠 차단)은 결정론적 실패 → 그대로 터미널 처리 (#A 태그로 generation-status 가 구분, 원본 보존).
    if (cls === 'moderation') {
      if (job.video_clip_id) {
        await markDirectorVideoAttemptFailed(job.project_id, job.id, `[moderation] ${raw}`)
      } else {
        await failGenerationJob(job.id, `[moderation] ${raw}`)
        if (isTakeBilledVideoKind(job.kind)) {
          try {
            await releaseTakesForJob(job.id)
          } catch (releaseError) {
            console.error('[fal/webhook] take release failed:', releaseError instanceof Error ? releaseError.message : releaseError)
          }
        }
      }
      return NextResponse.json({ ok: true })
    }
    // 사유(payload_error) 없는 generic 'ERROR' — 느린 i2i 의 fal webhook 조기/타임아웃일 수 있다
    //   (같은 입력을 폴링하면 완료됨, 실측 확인 2026-06-30). webhook 을 진실로 믿지 말고 FAL 큐 상태로
    //   reconcile: 완료면 회수, 진행 중이면 queued 유지(클라 5분 폴링 → /generation-jobs/[id] reconcile 이
    //   마저 회수), FAL 이 진짜 FAILED 면 그때 fail. (shot_storyboard 느린 샷이 영영 실패로 굳던 버그)
    await reconcileJobFromFal(job)
    return NextResponse.json({ ok: true })
  }

  // 여기서부터는 접수 완료 — 무거운 저장은 응답을 보낸 뒤에 한다(#webhook-answers-fast 2026-09-08).
  //   예전에는 finalize 를 응답 전에 await 했다. 영상 다운로드(최대 128MiB, 제한 45초) + 스토리지
  //   업로드 + DB 갱신이 fal 의 15초 대기(위 주석)를 넘기면 fal 이 실패로 보고 같은 알림을 다시 보냈고,
  //   그러면 128MiB 를 또 내려받았다. maxDuration 60 초마저 넘기면 함수가 죽어 잡은 queued 로 남고
  //   또 재전송 — 루프가 됐다. 게다가 위 멱등 가드(status==='queued')와 실제 상태 변경 사이가
  //   그만큼 벌어져 재전송 둘이 함께 통과할 수 있었다.
  //
  //   after() 는 응답을 보낸 뒤 같은 요청 컨텍스트에서 계속 실행한다(Next.js 16). fal 은 즉시 2xx 를
  //   받아 재전송하지 않고, 실패해도 잡은 queued 로 남아 폴링·유령 청소부가 회수한다.
  const result = job.kind === 'shot_video' || job.kind === 'shot_previz_video'
    ? { media: 'video' as const, url: extractVideoUrl(body.payload), payload: body.payload }
    : { media: 'image' as const, url: extractImageUrl(body.payload), payload: body.payload }
  if (!result.url) {
    const msg = `no ${result.media} url in webhook payload`
    console.error('[fal/webhook]', msg, job.id)
    // 결과 주소가 없으면 저장할 게 없다 — 그대로 실패 처리하고 잡아둔 Take 를 돌려준다.
    if (job.video_clip_id) {
      await markDirectorVideoAttemptFailed(job.project_id, job.id, msg)
    } else {
      await failGenerationJob(job.id, msg)
      if (isTakeBilledVideoKind(job.kind)) {
        try {
          await releaseTakesForJob(job.id)
        } catch (releaseError) {
          console.error('[fal/webhook] take release failed:', releaseError instanceof Error ? releaseError.message : releaseError)
        }
      }
    }
    return NextResponse.json({ ok: true })
  }

  await runAfterResponse(async () => {
  try {
    await finalizeGenerationJob(job, result)
  } catch (e) {
    const msg = `[finalize] ${describeFinalizeError(e)}`
    if (e instanceof GenerationJobTerminalTransitionError) {
      // 중복 finalize 경쟁(webhook ↔ 폴링 reconcile) — 다른 경로가 이미 종결한 잡.
      //   실패 아님: fail 마킹을 시도하면 같은 에러가 또 나서 500 이 됐다(2026-07-22 previz 실측).
      console.warn('[fal/webhook] duplicate finalize ignored (already terminal):', job.id)
      return
    }
    if (e instanceof DirectorVideoCompletionPersistenceError) {
      // 영상·이미지 공통(#image-persist-retryable 2026-09-08) — 일시적 저장 실패는 queued 로 두어
      //   다음 webhook·폴링이 다시 시도하게 한다. 결과는 fal 큐에 남아 있으므로 재시도가 공짜다.
      //   응답은 이미 나갔으므로 던져도 fal 에 전달되지 않는다 — 잡을 queued 로 남기는 것이 목적이고
      //   그건 finalize 가 이미 했다. 여기서는 기록만 남기고 끝낸다.
      console.error('[fal/webhook] media persistence failed; retaining queued attempt:', msg)
      return
    }
    console.error('[fal/webhook] finalize failed:', msg)
    if (job.video_clip_id) {
      await markDirectorVideoAttemptFailed(job.project_id, job.id, msg)
    } else {
      await failGenerationJob(job.id, msg)
      if (isTakeBilledVideoKind(job.kind)) {
        try {
          await releaseTakesForJob(job.id)
        } catch (releaseError) {
          console.error('[fal/webhook] take release failed:', releaseError instanceof Error ? releaseError.message : releaseError)
        }
      }
    }
  }
  })

  return NextResponse.json({ ok: true })
}
