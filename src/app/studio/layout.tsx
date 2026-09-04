'use client'

import { useEffect, useRef } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useProjectStore } from '@/stores/project-store'
import { useChatUiStore } from '@/stores/chat-ui-store'
import { useGlobalChatStore } from '@/stores/global-chat-store'
import { markStageSeen } from '@/lib/stage-seen'
import { useProducerStore } from '@/stores/producer-store'
import { useWriterStore } from '@/stores/writer-store'
import { useArtistStore } from '@/stores/artist-store'
import { Sidebar } from '@/components/layout/sidebar'
import { GlobalChat } from '@/components/layout/global-chat'
import { useIdleTimeout } from '@/hooks/use-idle-timeout'
import { useArtistLockPoll } from '@/hooks/use-artist-lock-poll'
import { readLastProjectId, writeLastProjectId } from '@/lib/session-restore'
import {
  STAGES,
  SHELL_INSET,
  SHELL_RAIL_WIDTH,
  CHAT_COLLAPSED_RAIL,
} from '@/lib/constants'
import type { StageId } from '@/types'
import { installDemoFetchGuard } from '@/lib/demo/fetch-guard'
import { isDemoSession, readDemoToken, withDemoShare } from '@/lib/demo/context'
import { DemoBanner } from '@/components/demo/demo-banner'

// 데모(공유) 세션이면 첫 클라 진입 시 window.fetch 를 가드로 교체(멱등, 내부에서 isDemoSession 판정).
//   초기 effect fetch(verifyWriterGate 등)보다 먼저 걸리도록 모듈 로드 시점에 설치.
installDemoFetchGuard()

export default function StudioLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // 렌더 시점 재시도(멱등): 모듈 eval 이 프리페치 등으로 데모 판정 확정(URL 티켓/시드) 전에
  //   일어났을 수 있어, 컴포넌트 렌더에서 한 번 더 설치를 시도한다 — effect fetch 보다 선행.
  installDemoFetchGuard()
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
    // 데모(URL 티켓): share 쿼리도 함께 유지 — 쿠키 차단 브라우저에서 새로고침 생존.
    const demoToken = readDemoToken()
    const projectSynced = params.get('projectId') === projectId
    const shareSynced = !demoToken || params.get('share') === demoToken
    if (projectSynced && shareSynced) return
    params.set('projectId', projectId)
    if (demoToken) params.set('share', demoToken)
    window.history.replaceState(null, '', `${pathname}?${params.toString()}`)
  }, [projectId, pathname])

  // Alt(Option)+↑/↓ = 메인 섹션 스크롤 (#keyboard-only 2026-08-12).
  //   탭 전환마다 채팅 입력창이 포커스를 가져가므로(전 스테이지 공통) 키보드로 본문을 내리는
  //   길이 없어졌다 — 입력창 포커스 여부와 무관하게 Alt+상하로 본문 스크롤러를 움직인다.
  //   Alt+좌우(뷰 순환)·Alt+QWERT(스테이지 전환)와 같은 모디파이어 가족.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return
      if (e.code !== 'ArrowUp' && e.code !== 'ArrowDown') return
      const el = document.querySelector('[data-stage-content]')
      if (!el) return
      e.preventDefault()
      e.stopPropagation()
      const dir = e.code === 'ArrowDown' ? 1 : -1
      el.scrollBy({ top: dir * Math.round(window.innerHeight * 0.6), behavior: 'smooth' })
    }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [])

  // 스테이지 데이터 워밍(#tab-slide 2026-08-03) — 탭 최초 진입의 "빈 화면 + 스피너" 구간 축소.
  //   다섯 뷰를 동시에 마운트하는 대신(저사양에서 부담) 각 store 의 데이터만 미리 채운다:
  //   뷰 마운트는 클릭 시점 그대로지만 렌더에 필요한 진실이 이미 store 에 있어 첫 프레임부터
  //   내용이 나온다. director 는 writer store 를 재료로 mount 시 조립하므로 writer 워밍이 곧
  //   director 워밍이다. 규칙:
  //   - 현재 stage 는 자기 페이지가 직접 로드 → 건너뜀 (중복 fetch 방지)
  //   - demo 세션은 스냅샷이 진실 — DB 를 읽으면 빈 값으로 덮어써 데모가 깨진다 → 전면 skip
  //   - 프로젝트당 1회, 진입 1.5s 뒤(현재 페이지의 자체 로딩과 대역폭 경합하지 않게)
  const warmedProjectRef = useRef<string | null>(null)
  useEffect(() => {
    if (!projectId || initLoading || isDemoSession()) return
    if (warmedProjectRef.current === projectId) return
    warmedProjectRef.current = projectId
    const t = setTimeout(() => {
      const stage = useProjectStore.getState().currentStage
      if (stage !== 'producer') void useProducerStore.getState().loadProject()
      if (stage !== 'writer') void useWriterStore.getState().loadProject()
      if (stage !== 'artist') void useArtistStore.getState().loadData()
    }, 1500)
    return () => clearTimeout(t)
  }, [projectId, initLoading])

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
      router.replace(withDemoShare('/studio/producer'))
      return
    }
    if (useProjectStore.getState().currentStage !== stage.id) {
      setStage(stage.id as StageId)
    }
    // 진입한 stage의 완료 알림 배지 클리어 (chat-proactive-copilot Phase 2)
    useGlobalChatStore.getState().clearStageBadge(stage.id as StageId)
    // 약속 D3: 서버 파생 배지의 기준점 — 이 스테이지를 지금 봤다.
    if (projectId) markStageSeen(projectId, stage.id as StageId)
  }, [pathname, canNavigateTo, initLoading, projectId, router, setStage])

  return (
    <>
      <DemoBanner />
      <Sidebar />
      <main
        className="min-h-screen transition-[margin] duration-350 ease-out"
        // 좌우 패널은 INSET 만큼 띄운 둥근 패널(#shell-lift) — 본문 여백은
        //   바깥 INSET + 패널폭 + 패널↔본문 INSET. 접힘 시 폭은 열기 레일(w-11) 전용.
        style={{
          marginLeft: SHELL_INSET * 2 + SHELL_RAIL_WIDTH,
          marginRight:
            SHELL_INSET * 2 + (chatCollapsed ? CHAT_COLLAPSED_RAIL : chatWidth),
        }}
      >
        {/* h-screen으로 높이 고정 + overflow-y-auto: 내용이 화면을 넘치면
            세로 스크롤 자동 생성. 캔버스 페이지(director)는 flex-1로 딱 채워
            넘치지 않으므로 스크롤 미발생 — 카드 페이지만 스크롤된다.
            overflow-x-hidden: 전환 슬라이드(#tab-slide, template.tsx)가 24px 를 밀고
            들어오는 동안 가로 스크롤바가 깜빡이지 않게.
            data-stage-content: 세로 연속 스트립(#tab-slide-v2)의 view-transition-name 대상 —
            h-screen 고정 높이라 스냅샷이 뷰포트 크기로 안정된다(globals.css §stage-strip). */}
        <div
          data-stage-content
          className="flex h-screen flex-col overflow-x-hidden overflow-y-auto"
        >
          {children}
        </div>
      </main>
      <GlobalChat />
    </>
  )
}
