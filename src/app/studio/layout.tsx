'use client'

import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useProjectStore } from '@/stores/project-store'
import { useChatUiStore } from '@/stores/chat-ui-store'
import { Sidebar } from '@/components/layout/sidebar'
import { Samantha } from '@/components/layout/samantha'
import { GlobalChat } from '@/components/layout/global-chat'
import { useIdleTimeout } from '@/hooks/use-idle-timeout'
import { STAGES } from '@/lib/constants'
import type { StageId } from '@/types'

export default function StudioLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const initProject = useProjectStore((s) => s.initProject)
  const canNavigateTo = useProjectStore((s) => s.canNavigateTo)
  const setStage = useProjectStore((s) => s.setStage)
  const initLoading = useProjectStore((s) => s.initLoading)
  const projectId = useProjectStore((s) => s.projectId)
  const pathname = usePathname()
  const router = useRouter()
  const chatWidth = useChatUiStore((s) => s.chatWidth)
  const chatCollapsed = useChatUiStore((s) => s.collapsed)
  useIdleTimeout()

  // mount: URL ?projectId 힌트로 프로젝트 복원 (없으면 store가 최신 fallback).
  // 새로고침해도 보던 프로젝트가 유지되도록 하는 진입점.
  useEffect(() => {
    const hint =
      typeof window !== 'undefined'
        ? new URLSearchParams(window.location.search).get('projectId')
        : null
    initProject(hint ?? undefined)
  }, [initProject])

  // store.projectId ↔ URL ?projectId 동기화. 프로젝트 전환·stage 이동으로
  // 쿼리가 빠지면 history.replaceState로 다시 채워 새로고침 복원을 보장.
  // (router 네비게이션을 트리거하지 않도록 replaceState 사용 — stage-sync effect와 무충돌)
  useEffect(() => {
    if (!projectId || typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    if (params.get('projectId') === projectId) return
    params.set('projectId', projectId)
    window.history.replaceState(null, '', `${pathname}?${params.toString()}`)
  }, [projectId, pathname])

  // URL ↔ currentStage 동기화 + 잠긴 stage 리다이렉트.
  // Sidebar 클릭이나 직접 URL 진입 시에도 GlobalChat/Samantha가 올바른 stage로 동작하도록.
  useEffect(() => {
    if (initLoading) return
    const stage = STAGES.find((s) => pathname.startsWith(s.path))
    if (!stage) return
    if (!canNavigateTo(stage.id as StageId)) {
      router.replace('/studio/producer')
      return
    }
    if (useProjectStore.getState().currentStage !== stage.id) {
      setStage(stage.id as StageId)
    }
  }, [pathname, canNavigateTo, initLoading, router, setStage])

  return (
    <>
      <Sidebar />
      <main
        className="ml-16 min-h-screen transition-[margin] duration-350 ease-out"
        style={{ marginRight: chatCollapsed ? 0 : chatWidth }}
      >
        {/* h-screen으로 높이 고정 + overflow-y-auto: 내용이 화면을 넘치면
            세로 스크롤 자동 생성. 캔버스 페이지(director)는 flex-1로 딱 채워
            넘치지 않으므로 스크롤 미발생 — 카드 페이지만 스크롤된다. */}
        <div className="flex h-screen flex-col overflow-y-auto">{children}</div>
      </main>
      <GlobalChat />
      <Samantha />
    </>
  )
}
