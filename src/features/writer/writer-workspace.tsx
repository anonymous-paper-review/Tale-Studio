'use client'

// Writer 워크스페이스 — 탭 뷰를 동시에 마운트해 내부 상태를 보존한다.

import { RoughStoryboardView } from '@/features/writer/rough-storyboard-view'
import { ScriptView } from '@/features/writer/script-view'
import { WriterGenerationView } from '@/features/writer/writer-generation-view'
import { cn } from '@/lib/utils'
import { useWriterStatus } from '@/lib/writer/use-writer-status'
import { useProjectStore } from '@/stores/project-store'
import { useWriterUiStore } from '@/stores/writer-ui-store'

export function WriterWorkspace() {
  const activeTab = useWriterUiStore((state) => state.activeTab)
  const visibleTab = activeTab === 'script' ? 'script' : 'storyboard'
  const projectId = useProjectStore((state) => state.projectId)
  const { status } = useWriterStatus(projectId)

  // 실행 중(생성 진행)엔 탭 뷰 대신 점진적 스토리 뷰어 + 하단 진행바(#story-stream 2026-07-21).
  //   완료/실패/미실행이면 기존 탭 워크스페이스로 복귀한다.
  const running = !!(
    status?.started &&
    !status.pipeline_completed &&
    !status.pipeline_failed
  )
  if (running && projectId) {
    return <WriterGenerationView projectId={projectId} status={status} />
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        aria-hidden={visibleTab !== 'storyboard'}
        className={cn(visibleTab === 'storyboard' ? 'flex min-h-0 flex-1 flex-col' : 'hidden')}
      >
        <RoughStoryboardView />
      </div>
      <div
        aria-hidden={visibleTab !== 'script'}
        className={cn(visibleTab === 'script' ? 'flex min-h-0 flex-1 flex-col' : 'hidden')}
      >
        <ScriptView />
      </div>
    </div>
  )
}
