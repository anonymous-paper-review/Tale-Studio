'use client'

// 실사 일괄 생성 클라 러너(#real-grid-auto 2026-08-06) — 수동 버튼(RealBatchBar)과 director
//   진입 자동 채움이 공유. 진행 상태는 director-store.realBatchBusy 단일 플래그 — 이 플래그가
//   개별 이미지 생성(generateStoryboardImage)과 UI 버튼을 함께 잠근다.
//   서버 라우트가 멱등(미생성만)이라 자동 호출은 architecture §5 "빈칸 자율 채움" 그대로.

import { toast } from 'sonner'
import { useDirectorCanvasStore } from '@/stores/director-store'
import { refreshGenerationQueue } from '@/lib/generation-queue'
import { notifyQuotaExceeded } from '@/lib/generation-quota-toast'
import { translate } from '@/lib/i18n'
import { useLocaleStore } from '@/stores/locale-store'
import type { GenerationJobObserver } from '@/lib/generation-jobs-client'

export interface RealBatchResult {
  generated: number
  quotaBlocked: boolean
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
        data?: { submitted: Array<{ jobId: string; shotIds: string[] }>; remaining: number }
        error?: string
      } | null
      if (!res.ok || !j?.data) throw new Error(j?.error ?? `HTTP ${res.status}`)
      const { submitted, remaining } = j.data
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
    if (generated > 0) {
      await store.getState().hydrateFromDb(projectId)
      toast.success(
        translate(useLocaleStore.getState().locale, 'Generated {count} live-action storyboard shots', {
          count: generated,
        }),
      )
    } else if (!opts?.silent && !quotaBlocked) {
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
