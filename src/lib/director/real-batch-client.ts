'use client'

// 실사 일괄 생성 클라 러너(#real-grid-auto 2026-08-06) — 수동 버튼(RealBatchBar)과 director
//   진입 자동 채움이 공유. 진행 상태는 director-store.realBatchBusy 단일 플래그 — 이 플래그가
//   개별 이미지 생성(generateStoryboardImage)과 UI 버튼을 함께 잠근다.
//   서버 라우트가 멱등(미생성만)이라 자동 호출은 architecture §5 "빈칸 자율 채움" 그대로.

import { toast } from 'sonner'
import { useDirectorCanvasStore } from '@/stores/director-store'

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
      for (const s of submitted) {
        for (let i = 0; i < 60; i++) {
          const st = (await (
            await fetch(`/api/generation-jobs/${encodeURIComponent(s.jobId)}`)
          ).json()) as { status?: string }
          if (st.status === 'completed' || st.status === 'failed') break
          await new Promise((r) => setTimeout(r, 5000))
        }
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
