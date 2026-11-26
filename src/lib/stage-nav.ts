import { STAGES } from '@/lib/constants'
import { stageIndex } from '@/lib/stage-gate'
import { useProjectStore } from '@/stores/project-store'
import { createClient } from '@/lib/supabase/client'
import type { StageId } from '@/types'
import { withDemoShare } from '@/lib/demo/context'

/**
 * 스테이지 핸드오프 공통 로직 — HandoffButton 과 채팅 프로액티브 제안(chat-proactive-copilot)이 공유.
 *   DB `current_stage` 가 그 단계보다 앞이면 그 단계로 올리고 `setStage` 한다 — 화면에서 이미 열렸어도 올린다
 *   (검토 rev-flow 2026-11-26 2번: 화면만 앞서 열린 콘티에서 [Artist로 가기]가 저장 단계를 올리지 않았다). 더 뒤 단계는 낮추지 않는다.
 *   라우팅(`router.push`)은 컴포넌트 책임이므로 target 경로를 반환만 한다(없으면 null).
 *   DB update 는 await 하되 실패는 non-blocking(최악의 경우 새로고침 전까지 사이드바 잠김).
 */
export async function handoffToStage(
  targetStage: StageId,
  options?: { verify: boolean },
): Promise<string | null> {
  const target = STAGES.find((s) => s.id === targetStage)
  if (!target) return null

  const { projectId, setStage } = useProjectStore.getState()
  // 그 단계보다 앞 단계로 저장돼 있을 때만 바꾼다 — 다른 창 · 예전 흐름으로 더 뒤에 간 저장 단계를 되돌리지 않는다(맨 앞 단계는 올릴 것이 없다).
  const before = STAGES.slice(0, stageIndex(targetStage)).map((stage) => stage.id)
  if (projectId && before.length > 0) {
    try {
      const supabase = createClient()
      const result = await supabase
        .from('projects')
        .update({ current_stage: targetStage })
        .eq('id', projectId)
        .in('current_stage', before)
      if (options?.verify) {
        if (result.error || useProjectStore.getState().projectId !== projectId) return null
        const saved = await supabase.from('projects').select('current_stage').eq('id', projectId).maybeSingle()
        // 저장 단계가 그 단계이거나 더 뒤면 넘김이 된 것이다.
        const savedStage = saved.data?.current_stage as StageId | undefined
        if (saved.error || !savedStage || stageIndex(savedStage) < stageIndex(targetStage) || useProjectStore.getState().projectId !== projectId) return null
      }
    } catch {
      if (options?.verify) return null
      // non-blocking
    }
  }

  if (options?.verify && useProjectStore.getState().projectId !== projectId) return null
  setStage(targetStage)
  // 데모(URL 티켓): 반환 경로에 share 쿼리 유지 — 쿠키 차단 브라우저에서도 이동 생존.
  return withDemoShare(target.path)
}
