// POST /api/fal/webhook — FAL 비동기 생성 완료 콜백 수신.
//
// FAL이 작업 완료 시 이 엔드포인트로 결과를 POST한다. ED25519 서명으로 위조를 차단하고,
// request_id로 generation_jobs 행을 찾아 서버사이드에서 결과를 영속화(storage/DB)한다.
// → 사용자가 브라우저를 닫아도 결과가 유실되지 않는다(동기/클라폴링 대비 핵심 이점).
//
// 멱등: 같은 request_id 재전송 대비 status==='queued'일 때만 처리. 빠르게 2xx 반환(FAL 15s 타임아웃).
import { NextResponse } from 'next/server'
import {
  readFalWebhookHeaders,
  verifyFalWebhook,
} from '@/lib/fal/verify-webhook'
import {
  getGenerationJobByRequestId,
  failGenerationJob,
} from '@/lib/generation-jobs'
import {
  finalizeCharacterViewJob,
  finalizeWorldShotJob,
  finalizeShotStoryboardJob,
  finalizeShotRoughStoryboardJob,
  finalizeShotVideoJob,
} from '@/lib/fal/finalize'

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
  if (!requestId) return NextResponse.json({ ok: true }) // 식별 불가 → 무시

  const job = await getGenerationJobByRequestId(requestId)
  if (!job) return NextResponse.json({ ok: true }) // 추적 안 하는 작업 → 무시
  if (job.status !== 'queued') return NextResponse.json({ ok: true }) // 멱등: 이미 처리됨

  if (body.status !== 'OK') {
    await failGenerationJob(job.id, body.payload_error ?? 'fal webhook reported ERROR')
    return NextResponse.json({ ok: true })
  }

  try {
    if (job.kind === 'shot_video') {
      const url = extractVideoUrl(body.payload)
      if (!url) throw new Error('no video url in webhook payload')
      await finalizeShotVideoJob(job, url)
    } else {
      // 이미지 계열 (character_view / world_shot / shot_storyboard / shot_rough_storyboard)
      const url = extractImageUrl(body.payload)
      if (!url) throw new Error('no image url in webhook payload')
      if (job.kind === 'character_view') await finalizeCharacterViewJob(job, url)
      else if (job.kind === 'world_shot') await finalizeWorldShotJob(job, url)
      else if (job.kind === 'shot_storyboard') await finalizeShotStoryboardJob(job, url)
      else if (job.kind === 'shot_rough_storyboard')
        await finalizeShotRoughStoryboardJob(job, url)
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[fal/webhook] finalize failed:', msg)
    await failGenerationJob(job.id, msg)
  }

  return NextResponse.json({ ok: true })
}
