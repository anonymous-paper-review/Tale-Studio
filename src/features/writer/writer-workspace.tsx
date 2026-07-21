'use client'

// Writer 워크스페이스 — 탭 뷰를 동시에 마운트해 내부 상태를 보존한다.

import { useEffect, useState } from 'react'
import { RoughStoryboardView } from '@/features/writer/rough-storyboard-view'
import { ScriptView } from '@/features/writer/script-view'
import { WriterGenerationView } from '@/features/writer/writer-generation-view'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { useWriterStatus } from '@/lib/writer/use-writer-status'
import { useProjectStore } from '@/stores/project-store'
import { useWriterUiStore } from '@/stores/writer-ui-store'

// 생성 화면 디버그 진입(#gen-debug 2026-07-21): ?debug=generation + admin 계정일 때만
//   실행 중이 아니어도 WriterGenerationView 를 강제 렌더 — 스트림/사이드바 UI 를
//   실제 run 없이 마지막 run 데이터로 디버깅한다. 표시 전용(파이프라인 무관).
//   admin 판별은 use-idle-timeout 의 이메일 화이트리스트 패턴과 동일.
const GENERATION_DEBUG_EMAILS = new Set(['admin@tale.studio'])

function useGenerationDebug(): boolean {
  const [enabled, setEnabled] = useState(false)
  useEffect(() => {
    // 디버그 전용이라 useSearchParams(Suspense 경계 필요) 대신 마운트 시 1회 직접 읽기.
    const requested =
      new URLSearchParams(window.location.search).get('debug') === 'generation'
    if (!requested) return
    let cancelled = false
    createClient()
      .auth.getUser()
      .then(({ data }) => {
        if (!cancelled && GENERATION_DEBUG_EMAILS.has(data.user?.email ?? '')) {
          setEnabled(true)
        }
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])
  return enabled
}

export function WriterWorkspace() {
  const activeTab = useWriterUiStore((state) => state.activeTab)
  const visibleTab = activeTab === 'script' ? 'script' : 'storyboard'
  const projectId = useProjectStore((state) => state.projectId)
  const { status } = useWriterStatus(projectId)
  const debugGeneration = useGenerationDebug()

  // 실행 중(생성 진행)엔 탭 뷰 대신 점진적 스토리 뷰어 + 하단 진행바(#story-stream 2026-07-21).
  //   완료/실패/미실행이면 기존 탭 워크스페이스로 복귀한다.
  const running = !!(
    status?.started &&
    !status.pipeline_completed &&
    !status.pipeline_failed
  )
  if ((running || debugGeneration) && projectId) {
    return (
      <WriterGenerationView
        projectId={projectId}
        status={status}
        debug={debugGeneration && !running}
      />
    )
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
