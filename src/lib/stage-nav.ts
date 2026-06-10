import { STAGES } from '@/lib/constants'
import { useProjectStore } from '@/stores/project-store'
import { createClient } from '@/lib/supabase/client'
import type { StageId } from '@/types'

/**
 * 스테이지 핸드오프 공통 로직 — HandoffButton 과 채팅 프로액티브 제안(chat-proactive-copilot)이 공유.
 *   게이트(`canNavigateTo`)가 잠겨 있으면 DB `current_stage` 를 올려 해제하고 `setStage` 한다.
 *   라우팅(`router.push`)은 컴포넌트 책임이므로 target 경로를 반환만 한다(없으면 null).
 *   DB update 는 await 하되 실패는 non-blocking(최악의 경우 새로고침 전까지 사이드바 잠김).
 */
export async function handoffToStage(
  targetStage: StageId,
): Promise<string | null> {
  const target = STAGES.find((s) => s.id === targetStage)
  if (!target) return null

  const { projectId, setStage, canNavigateTo } = useProjectStore.getState()
  if (projectId && !canNavigateTo(targetStage)) {
    try {
      const supabase = createClient()
      await supabase
        .from('projects')
        .update({ current_stage: targetStage })
        .eq('id', projectId)
    } catch {
      // non-blocking
    }
  }

  setStage(targetStage)
  return target.path
}
