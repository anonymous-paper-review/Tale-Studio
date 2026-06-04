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
  const pathname = usePathname()
  const router = useRouter()
  const chatWidth = useChatUiStore((s) => s.chatWidth)
  const chatCollapsed = useChatUiStore((s) => s.collapsed)
  useIdleTimeout()

  useEffect(() => {
    initProject()
  }, [initProject])

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
