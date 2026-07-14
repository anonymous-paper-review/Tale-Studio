'use client'

import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useProjectStore } from '@/stores/project-store'
import { useChatUiStore } from '@/stores/chat-ui-store'
import { useGlobalChatStore } from '@/stores/global-chat-store'
import { Sidebar } from '@/components/layout/sidebar'
import { GlobalChat } from '@/components/layout/global-chat'
import { useIdleTimeout } from '@/hooks/use-idle-timeout'
import { useArtistLockPoll } from '@/hooks/use-artist-lock-poll'
import { readLastProjectId, writeLastProjectId } from '@/lib/session-restore'
import { STAGES } from '@/lib/constants'
import type { StageId } from '@/types'
import { installDemoFetchGuard } from '@/lib/demo/fetch-guard'
import { DemoBanner } from '@/components/demo/demo-banner'

// 데모(공유) 세션이면 첫 클라 진입 시 window.fetch 를 가드로 교체(멱등, 내부에서 isDemoSession 판정).
//   초기 effect fetch(verifyWriterGate 등)보다 먼저 걸리도록 모듈 로드 시점에 설치.
installDemoFetchGuard()

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
  const verifyWriterGate = useProjectStore((s) => s.verifyWriterGate)
  const pathname = usePathname()
  const router = useRouter()
  const chatWidth = useChatUiStore((s) => s.chatWidth)
  const chatCollapsed = useChatUiStore((s) => s.collapsed)
  useIdleTimeout()
  useArtistLockPoll()

  // mount: URL ?projectId 힌트로 프로젝트 복원 → 없으면 localStorage 마지막 본 프로젝트
  // → 그것도 없으면 store가 최신 fallback. 어느 경로든 서버(/api/project/init)가
  // 본인 워크스페이스 범위로만 조회하므로 미소유 id 는 자동으로 최신 fallback 된다.
  useEffect(() => {
    const hint =
      typeof window !== 'undefined'
        ? new URLSearchParams(window.location.search).get('projectId')
        : null
    initProject(hint ?? readLastProjectId() ?? undefined)
  }, [initProject])

  // writer 산출물 게이트: projectId 확정 시 1회 검증 → 씬 없으면 producer 로 게이트백.
  //   양쪽 진입 경로를 모두 커버 — 새로고침(initProject 가 projectId 세팅) /
  //   홈 클릭(switchProject 가 projectId 세팅). initProject 의 early-return 과 무관하게 동작.
  useEffect(() => {
    if (!projectId) return
    void verifyWriterGate(projectId)
  }, [projectId, verifyWriterGate])

  // store.projectId ↔ URL ?projectId 동기화. 프로젝트 전환·stage 이동으로
  // 쿼리가 빠지면 history.replaceState로 다시 채워 새로고침 복원을 보장.
  // (router 네비게이션을 트리거하지 않도록 replaceState 사용 — stage-sync effect와 무충돌)
  useEffect(() => {
    if (!projectId || typeof window === 'undefined') return
    // 마지막 본 프로젝트 기록 — 쿼리 없는 재진입(북마크/홈) 시 복원 힌트
    writeLastProjectId(projectId)
    const params = new URLSearchParams(window.location.search)
    if (params.get('projectId') === projectId) return
    params.set('projectId', projectId)
    window.history.replaceState(null, '', `${pathname}?${params.toString()}`)
  }, [projectId, pathname])

  // URL ↔ currentStage 동기화 + 잠긴 stage 리다이렉트.
  // Sidebar 클릭이나 직접 URL 진입 시에도 GlobalChat이 올바른 stage로 동작하도록.
  useEffect(() => {
    // projectId가 확정되기 전(초기 로드/새로고침/북마크 진입)에는 게이트를 판단하지 않는다.
    // reachedStage는 initProject가 DB current_stage에서 복원하므로, 그 전에 평가하면
    // 초기값 'producer'를 보고 이미 도달한 단계(예: director)까지 producer로 잘못 튕긴다.
    // (도달 안 한 단계 잠금은 init 완료 후 평가에서 그대로 유지된다.)
    if (initLoading || !projectId) return
    const stage = STAGES.find((s) => pathname.startsWith(s.path))
    if (!stage) return
    if (!canNavigateTo(stage.id as StageId)) {
      router.replace('/studio/producer')
      return
    }
    if (useProjectStore.getState().currentStage !== stage.id) {
      setStage(stage.id as StageId)
    }
    // 진입한 stage의 완료 알림 배지 클리어 (chat-proactive-copilot Phase 2)
    useGlobalChatStore.getState().clearStageBadge(stage.id as StageId)
  }, [pathname, canNavigateTo, initLoading, projectId, router, setStage])

  return (
    <>
      <DemoBanner />
      <Sidebar />
      <main
        className="ml-16 min-h-screen transition-[margin] duration-350 ease-out"
        // 접힘 시 44px = 채팅 열기 레일(global-chat w-11) 전용 폭 — 페이지 우상단 버튼과 겹침 방지.
        style={{ marginRight: chatCollapsed ? 44 : chatWidth }}
      >
        {/* h-screen으로 높이 고정 + overflow-y-auto: 내용이 화면을 넘치면
            세로 스크롤 자동 생성. 캔버스 페이지(director)는 flex-1로 딱 채워
            넘치지 않으므로 스크롤 미발생 — 카드 페이지만 스크롤된다. */}
        <div className="flex h-screen flex-col overflow-y-auto">{children}</div>
      </main>
      <GlobalChat />
    </>
  )
}
