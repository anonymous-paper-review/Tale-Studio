'use client'

// 실사 일괄 생성 클라 러너(#real-grid-auto 2026-08-06) — 수동 버튼(RealBatchBar)과 director
//   진입 자동 채움이 공유. 진행 상태는 director-store.realBatchBusy 단일 플래그 — 이 플래그가
//   개별 이미지 생성(generateStoryboardImage)과 UI 버튼을 함께 잠근다.
//   서버 라우트가 멱등(미생성만)이라 자동 호출은 architecture §5 "빈칸 자율 채움" 그대로.

import { toast } from 'sonner'
import { useDirectorCanvasStore } from '@/stores/director-store'
import { refreshGenerationQueue } from '@/lib/generation-queue'
import { notifyQuotaExceeded } from '@/lib/generation-quota-toast'
import { waitForPrerequisite, type PrerequisiteBody, type PrerequisiteCode } from '@/lib/generation-prerequisite-toast'
import { translate } from '@/lib/i18n'
import { useLocaleStore } from '@/stores/locale-store'
import type { GenerationJobObserver } from '@/lib/generation-jobs-client'

export interface RealBatchResult {
  generated: number
  quotaBlocked: boolean
}

type BatchSkipped = {
  shotId: string
  reason: PrerequisiteCode
  missing?: Array<{ characterId: string; appearanceKey: string; name: string }>
}

// #ref-gate(오너 결정 1번): 건너뛴 샷의 선행 산출물(러프·시트)이 나타나면 배치를 다시 돌린다(멱등 — 빈칸만).
//   프로젝트당 재개 체인 1개, 최대 5회. 탭을 닫으면 끊긴다.
const resumeDepthByProject = new Map<string, number>()
function scheduleRealBatchResume(projectId: string, skipped: BatchSkipped[], opts?: { traceId?: string; onJob?: GenerationJobObserver }) {
  const depth = resumeDepthByProject.get(projectId) ?? 0
  if (!skipped.length || depth >= 5) return
  resumeDepthByProject.set(projectId, depth + 1)
  const bodies: Array<PrerequisiteBody & { code: PrerequisiteCode }> = skipped.map((s) =>
    s.reason === 'missing_character_sheets'
      ? { code: s.reason, shotId: s.shotId, missing: s.missing ?? [] }
      : { code: s.reason, shotId: s.shotId },
  )
  let settled = false
  const isCancelled = () => settled || useDirectorCanvasStore.getState().projectId !== projectId
  // 하나라도 준비되면 재실행 — 나머지 대기는 settled 로 함께 끝내고, 남은 샷은 재실행의 skipped 로 다시 예약된다.
  void Promise.race(bodies.map((b) => waitForPrerequisite(projectId, b, { isCancelled }))).then((outcome) => {
    const projectChanged = useDirectorCanvasStore.getState().projectId !== projectId
    settled = true
    if (outcome !== 'ready' || projectChanged) {
      resumeDepthByProject.delete(projectId)
      return
    }
    void runRealBatch(projectId, { silent: true, traceId: opts?.traceId, onJob: opts?.onJob })
  })
}

/** 라운드 반복 일괄 생성 — 완료 시 캔버스 rehydrate. 이미 진행 중이면 no-op. */
export async function runRealBatch(
  projectId: string,
  opts?: {
    silent?: boolean
    force?: boolean
    traceId?: string
    onJob?: GenerationJobObserver
  },
): Promise<RealBatchResult> {
  const store = useDirectorCanvasStore
  if (store.getState().realBatchBusy) return { generated: 0, quotaBlocked: false }
  store.setState({ realBatchBusy: true, realBatchRemaining: null })
  let generated = 0
  let quotaBlocked = false
  let lastSkipped: BatchSkipped[] = []
  try {
    for (let round = 0; round < 10; round++) {
      const requestBody: { projectId: string; force?: boolean; traceId?: string } =
        opts?.force ? { projectId, force: true } : { projectId }
      if (opts?.traceId) requestBody.traceId = opts.traceId
      const res = await fetch('/api/director/generate-storyboard-batch', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(requestBody),
      })
      if (res.status === 429) {
        quotaBlocked = true
        // 한도 안내는 공용 헬퍼로 — 문구·중복억제·locale 을 7개 진입점이 공유한다(#quota-toast).
        // silent(auto-fill) included - owner policy 2026-08-26: swallowing 429 silently was the
        // prime suspect behind "everything died after a tab round-trip" (#a2-observability).
        // Duplicate toasts are suppressed by the shared toast id inside notifyQuotaExceeded.
        notifyQuotaExceeded(await res.json().catch(() => null))
        break
      }
      const j = (await res.json().catch(() => null)) as {
        data?: { submitted: Array<{ jobId: string; shotIds: string[] }>; remaining: number; skipped?: BatchSkipped[] }
        error?: string
      } | null
      if (!res.ok || !j?.data) throw new Error(j?.error ?? `HTTP ${res.status}`)
      const { submitted, remaining } = j.data
      lastSkipped = j.data.skipped ?? []
      // #batch-backlog: 아직 제출 안 된 잔량을 알림바 분모에 태운다 — "fal 큐 수만 보인다"(오너
      //   2026-08-25)의 수리. 라운드마다 갱신되고 러너 종료 시 finally 가 지운다.
      store.setState({ realBatchRemaining: remaining })
      if (!submitted.length) break
      generated += submitted.reduce((n, s) => n + s.shotIds.length, 0)
      // 잡이 큐에 앉는 즉시 진행 표시(알림바·카드 스피너)가 켜지게 — 폴링 틱을 기다리지 않는다.
      refreshGenerationQueue()
      for (const s of submitted) {
        opts?.onJob?.({ jobId: s.jobId, status: 'queued', httpStatus: res.status })
        for (let i = 0; i < 60; i++) {
          // 응답은 {ok, data:{status}} 봉투(#real-grid-fix 실측: 최상위 status 읽기로 8잡×300s 헛대기)
          const envelope = (await (
            await fetch(`/api/generation-jobs/${encodeURIComponent(s.jobId)}`)
          ).json().catch(() => null)) as { data?: { status?: string } } | null
          const status = envelope?.data?.status
          if (status === 'completed' || status === 'failed') {
            const resultUrl =
              (envelope?.data as { resultUrl?: unknown } | undefined)?.resultUrl
            opts?.onJob?.({
              jobId: s.jobId,
              status,
              resultUrl: typeof resultUrl === 'string' ? resultUrl : null,
            })
            break
          }
          await new Promise((r) => setTimeout(r, 5000))
        }
        // 시트 하나가 끝날 때마다 즉시 반영(#live-refresh 2026-08-11) — 옛 코드는 전체 라운드가
        //   끝나야 1회 재수화라, 첫 시트가 완성돼도 화면은 새로고침 전까지 빈 카드였다.
        await store.getState().hydrateFromDb(projectId).catch(() => {})
        refreshGenerationQueue()
      }
      if (remaining <= 0) break
    }
    if (lastSkipped.length > 0) {
      // #ref-gate: 이유별로 한 줄 안내 + 자동 재개 예약(과금 없음 — 준비될 때까지 폴링만).
      const sheetNames = [...new Set(lastSkipped.flatMap((s) => (s.missing ?? []).map((m) => m.name)))]
      const roughCount = lastSkipped.filter((s) => s.reason === 'missing_rough_storyboard').length
      const what = [
        sheetNames.length ? translate(useLocaleStore.getState().locale, 'character sheets for {names}', { names: sheetNames.join(', ') }) : null,
        roughCount ? translate(useLocaleStore.getState().locale, 'rough storyboards for {count} shots', { count: roughCount }) : null,
      ].filter(Boolean).join(' · ')
      toast.info(
        translate(useLocaleStore.getState().locale, '{count} shots skipped — waiting for {what}. The batch resumes automatically.', {
          count: lastSkipped.length,
          what,
        }),
        { id: 'generation-prerequisite' },
      )
      scheduleRealBatchResume(projectId, lastSkipped, { traceId: opts?.traceId, onJob: opts?.onJob })
    } else {
      resumeDepthByProject.delete(projectId)
    }
    if (generated > 0) {
      await store.getState().hydrateFromDb(projectId)
      toast.success(
        translate(useLocaleStore.getState().locale, 'Generated {count} live-action storyboard shots', {
          count: generated,
        }),
      )
    } else if (!opts?.silent && !quotaBlocked && lastSkipped.length === 0) {
      toast.info(
        translate(
          useLocaleStore.getState().locale,
          'No shots to generate — only shots with a rough panel and no image yet are eligible.',
        ),
      )
    }
  } catch (e) {
    if (!opts?.silent) {
      toast.error(
        e instanceof Error
          ? e.message
          : translate(useLocaleStore.getState().locale, 'Batch generation failed'),
      )
    } else console.error('[real-batch] auto batch generation failed:', e)
  } finally {
    store.setState({ realBatchBusy: false, realBatchRemaining: null })
  }
  return { generated, quotaBlocked }
}

// 진입 자동 채움(triggerRealBatchAutofill)은 제거됐다 (#c5 2026-08-27 오너 지시).
//   Director 진입만으로 실사 i2i 가 발사돼 previz 를 손볼 틈 없이 과금이 먼저 났다.
//   실사 생성은 사람의 명시적 행동 셋 중 하나로만 시작한다 — 전체 버튼 / 개별 버튼 / 채팅.
//   셋 다 아래 runRealBatch(전체) 또는 generateStoryboardImage(개별)로 들어온다.
