'use client'

// 오른쪽 채팅 패널을 닫은 화면(Producer 시작 화면 · Writer 채팅 탭, 리뉴얼 1차 2026-10-19)에서도
//   채팅 기록을 싣고, 채팅이 남긴 이동 경로를 소비한다 — 패널(GlobalChat)이 하던 두 일만 따로 한다.
import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { navigateWithStageSlide } from '@/lib/stage-transition'
import { useGlobalChatStore } from '@/stores/global-chat-store'
import { useProjectStore } from '@/stores/project-store'

export function ChatBackground() {
  const router = useRouter()
  const pathname = usePathname()
  const projectId = useProjectStore((s) => s.projectId)
  const loadMessages = useGlobalChatStore((s) => s.loadMessages)
  const pendingNavigatePath = useGlobalChatStore((s) => s.pendingNavigatePath)

  useEffect(() => {
    if (projectId) void loadMessages(projectId)
  }, [projectId, loadMessages])

  useEffect(() => {
    if (!pendingNavigatePath) return
    useGlobalChatStore.setState({ pendingNavigatePath: null })
    const navigationProject = useProjectStore.getState().projectId
    navigateWithStageSlide(pathname, pendingNavigatePath, () => {
      if (useProjectStore.getState().projectId === navigationProject) router.push(pendingNavigatePath)
    })
  }, [pendingNavigatePath, router, pathname])

  return null
}
