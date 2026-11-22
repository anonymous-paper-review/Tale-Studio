// 좁은 화면에서 Cinema 를 쓸 수 있는지 — 화면 폭이 1100px 보다 좁으면 채팅이 닫힌 채 시작하고, 판이 좁으면 이력 판이 샷 줄 아래로 내려와 다 보이며, 위쪽 만들기 줄 · 씬 단추 · [다음: Director로]가 잘리지 않는지 검사한다 (fb-camera QA C · 리드 2026-11-23, 시안 없음)
import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// 화면이 붙을 때 하는 일은 바로 돌리고, 떠날 때 할 일은 모아 둔다 — 시험이 "떠나기"를 직접 부른다(chat-closed 시험과 같은 방법).
const effects = vi.hoisted(() => ({ cleanups: [] as Array<() => void> }))
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useEffect: (effect: () => void | (() => void)) => {
    const cleanup = effect()
    if (typeof cleanup === 'function') effects.cleanups.push(cleanup)
  },
}))

import { useHoldChatClosed } from '@/hooks/use-hold-chat-closed'
import { useChatUiStore } from '@/stores/chat-ui-store'

const read = (path: string) => readFileSync(path, 'utf8')
/** 채팅을 닫아 두는 약속만 쓰는 Cinema 화면(좁은 화면인지 함께). */
function CinemaScreen({ narrow }: { narrow: boolean }) {
  useHoldChatClosed('camera', narrow)
  return null
}
/** Cinema 화면에 들어간다 — 떠날 때 할 일을 돌려준다. */
function enterCinema(narrow: boolean): () => void {
  const from = effects.cleanups.length
  CinemaScreen({ narrow })
  const mine = effects.cleanups.splice(from)
  return () => mine.reverse().forEach((cleanup) => cleanup())
}
const chatClosed = () => useChatUiStore.getState().collapsed

beforeEach(() => {
  effects.cleanups = []
  useChatUiStore.setState({ collapsed: false, chatHolds: [], collapsedBeforeHold: null })
})

describe('같이 정한 것(리드 11/23)', () => {
  it('화면 폭이 1100px 보다 좁으면 Cinema 는 채팅이 닫힌 채로 시작하고, 떠나면 들어오기 전 모습으로 돌아간다', () => {
    // 왜: 400 폭에서 채팅이 열린 채 시작하면 채팅이 판을 다 가리고 왼쪽 레일이 채팅 글을 덮었다(QA C). 기준 폭은 앱의 좁은 화면 기준
    //   (use-narrow-screen, 1100px 보다 좁음 — Director · Editor 에서 연 채팅이 판 위에 덮이는 기준과 같다, 오너 11/14).
    expect(read('src/hooks/use-narrow-screen.ts')).toContain("const NARROW_QUERY = '(max-width: 1099px)'")
    const page = read('src/app/studio/camera/page.tsx')
    expect(page).toMatch(/const narrowScreen = useNarrowScreen\(\)/)
    expect(page).toMatch(/useHoldChatClosed\('camera', narrowScreen\)/)
    const leave = enterCinema(true)
    expect(chatClosed()).toBe(true)
    // 닫혀 있어도 사람이 열 수 있다(접힌 레일의 열기 단추 — 다른 단계와 같다).
    useChatUiStore.getState().setCollapsed(false)
    expect(chatClosed()).toBe(false)
    leave()
    expect(chatClosed()).toBe(false)
  })

  it('넓은 화면(1100px 이상)에서는 Cinema 채팅을 닫아 두지 않는다 — 지금 그대로', () => {
    // 왜: 넓으면 채팅과 판이 나란히 선다(리드 "넓은 화면은 지금 그대로").
    const leave = enterCinema(false)
    expect(chatClosed()).toBe(false)
    leave()
    expect(chatClosed()).toBe(false)
  })

  it('판이 좁으면 이력 판(그림 · Take)이 샷 줄 아래로 내려와 접혀 다 보이고, 넓으면 지금처럼 샷 줄 옆에 서서 옆으로 민다', () => {
    // 왜: 400 폭에서 샷 줄 폭이 220px 이라 옆의 이력 칸 폭이 0 이 되어 그림 · Take 판이 안 보였다(QA C).
    //   기준은 화면이 아니라 판 폭(30rem = 480px) — 채팅을 연 1024 폭(판 528px)은 지금처럼 옆에 선다.
    expect(read('src/features/camera/camera-board.tsx')).toMatch(/className="@container flex flex-col gap-3 \[contain:inline-size\]"/)
    const row = read('src/features/camera/shot-row.tsx')
    expect(row).toMatch(/'flex flex-col gap-3 @min-\[30rem\]:flex-row @min-\[30rem\]:gap-4 rounded-2xl/)
    expect(row).toMatch(/className="flex w-full shrink-0 flex-col gap-2 @min-\[30rem\]:w-60"/)
    expect(row).toMatch(/className="flex min-w-0 flex-1 flex-wrap items-start gap-3 pb-1 @min-\[30rem\]:flex-nowrap @min-\[30rem\]:overflow-x-auto"/)
  })

  it('좁은 화면에서도 위쪽 만들기 줄의 단추는 줄을 바꿔 잘리지 않고, 씬 단추는 옆으로 밀어서 닿으며, [다음: Director로]는 위 막대 다음 줄로 내려온다', () => {
    // 왜: 400 폭에서 [영상 만들기] · 씬 4 · "다음: Director로"가 오른쪽에서 잘렸다(QA C).
    const bar = read('src/features/camera/work-bar.tsx')
    expect(bar).toMatch(/<div className="ml-auto flex min-w-0 max-w-full flex-col items-end gap-1">/)
    expect(bar).toMatch(/<div className="flex flex-wrap items-center justify-end gap-2">/)
    // 씬 단추는 원래 옆으로 민다(scene-buttons overflow-x-auto).
    expect(read('src/components/scene-buttons.tsx')).toMatch(/overflow-x-auto/)
    // 위 막대는 Cinema 에서만 줄을 바꿀 수 있다 — 다른 단계 위 막대는 지금 그대로.
    expect(read('src/app/studio/layout.tsx')).toMatch(/<StudioTopBar stage=\{shownStage\} className=\{shownStage === 'camera' \? 'flex-wrap' : undefined\} \/>/)
  })
})
