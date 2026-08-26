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

export interface RealBatchResult {
  generated: number
  quotaBlocked: boolean
}

/** 라운드 반복 일괄 생성 — 완료 시 캔버스 rehydrate. 이미 진행 중이면 no-op. */
export async function runRealBatch(
  projectId: string,
  opts?: { silent?: boolean },
): Promise<RealBatchResult> {
  const store = useDirectorCanvasStore
  if (store.getState().realBatchBusy) return { generated: 0, quotaBlocked: false }
  store.setState({ realBatchBusy: true, realBatchRemaining: null })
  let generated = 0
  let quotaBlocked = false
  try {
    for (let round = 0; round < 10; round++) {
      const res = await fetch('/api/director/generate-storyboard-batch', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ projectId }),
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
        for (let i = 0; i < 60; i++) {
          // 응답은 {ok, data:{status}} 봉투(#real-grid-fix 실측: 최상위 status 읽기로 8잡×300s 헛대기)
          const envelope = (await (
            await fetch(`/api/generation-jobs/${encodeURIComponent(s.jobId)}`)
          ).json().catch(() => null)) as { data?: { status?: string } } | null
          const status = envelope?.data?.status
          if (status === 'completed' || status === 'failed') break
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

// 진입 자동 채움의 프로젝트당 1회 가드(#real-grid-auto) — 옛 자리는 sync 훅 Pass 2.7 로컬이었는데,
//   hydration 패스들이 끝나야 발사돼 "탭에 들어왔는데 한동안 아무 일도 없는" 공백이 있었다.
//   서버 라우트는 DB 만 읽으므로(캔버스 hydration 과 무관) director 진입 즉시 쏴도 안전하다.
//   가드를 여기로 옮겨 페이지 mount 와 sync 훅 어느 쪽이 먼저 불러도 1회만 나간다.
const autofillTriggered = new Set<string>()

/** director 진입 시 실사 보드 자율 채움 — 프로젝트당 1회, 멱등(서버가 미생성만 채운다). */
export function triggerRealBatchAutofill(projectId: string): void {
  if (autofillTriggered.has(projectId)) return
  autofillTriggered.add(projectId)
  void runRealBatch(projectId, { silent: true })
}
