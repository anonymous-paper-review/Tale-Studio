'use client'

// Writer 워크스페이스 — 탭 뷰를 동시에 마운트해 내부 상태를 보존한다.

import { RoughStoryboardView } from '@/features/writer/rough-storyboard-view'
import { ScriptView } from '@/features/writer/script-view'
import { cn } from '@/lib/utils'
import { useWriterUiStore } from '@/stores/writer-ui-store'

export function WriterWorkspace() {
  const activeTab = useWriterUiStore((state) => state.activeTab)
  const visibleTab = activeTab === 'script' ? 'script' : 'storyboard'

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
