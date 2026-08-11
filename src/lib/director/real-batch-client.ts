'use client'

// 실사 일괄 생성 클라 러너(#real-grid-auto 2026-08-06) — 수동 버튼(RealBatchBar)과 director
//   진입 자동 채움이 공유. 진행 상태는 director-store.realBatchBusy 단일 플래그 — 이 플래그가
//   개별 이미지 생성(generateStoryboardImage)과 UI 버튼을 함께 잠근다.
//   서버 라우트가 멱등(미생성만)이라 자동 호출은 architecture §5 "빈칸 자율 채움" 그대로.

import { toast } from 'sonner'
import { useDirectorCanvasStore } from '@/stores/director-store'
import { refreshGenerationQueue } from '@/lib/generation-queue'

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
  store.setState({ realBatchBusy: true })
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
        if (!opts?.silent) toast.info('생성 대기열이 가득 찼어요 — 잠시 후 다시 시도해 주세요.')
        break
      }
      const j = (await res.json().catch(() => null)) as {
        data?: { submitted: Array<{ jobId: string; shotIds: string[] }>; remaining: number }
        error?: string
      } | null
      if (!res.ok || !j?.data) throw new Error(j?.error ?? `HTTP ${res.status}`)
      const { submitted, remaining } = j.data
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
      toast.success(`실사 스토리보드 ${generated}샷 일괄 생성 완료`)
    } else if (!opts?.silent && !quotaBlocked) {
      toast.info('생성할 샷이 없어요 — 러프가 준비된 미생성 샷이 대상이에요.')
    }
  } catch (e) {
    if (!opts?.silent) toast.error(e instanceof Error ? e.message : '일괄 생성에 실패했어요')
    else console.error('[real-batch] 자동 일괄 생성 실패:', e)
  } finally {
    store.setState({ realBatchBusy: false })
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
