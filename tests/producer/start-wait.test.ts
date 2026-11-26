// Producer 시작 화면이 시작 화면을 읽는 동안 작은 "불러오는 중…" 줄 대신 Producer 기다리는 카드를 보이고, 다 읽기 전에는 탭을 보이지 않는지 검사한다 (오너 2026-11-26 m1126 G1)
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/studio/start',
}))

import { EntryWorkspace } from '@/features/entry/entry-workspace'
import { useEntryStore } from '@/features/entry/entry-store'
import { emptyEntryDraft } from '@/lib/entry/draft'
import { useLocaleStore } from '@/stores/locale-store'
import { useProjectStore } from '@/stores/project-store'

// 서버 그리기(renderToStaticMarkup)는 zustand 의 처음 상태(getInitialState)를 읽는다 — 시험은 지금 상태를 처음 상태에 덮어 그린다.
function serveCurrent(store: { getState: () => object; getInitialState: () => object }) {
  Object.assign(store.getInitialState(), store.getState())
}
function screen(entry: Partial<ReturnType<typeof useEntryStore.getState>>) {
  useEntryStore.setState({ projectId: 'project-1', locale: 'ko', draft: emptyEntryDraft(), ...entry })
  for (const store of [useEntryStore, useLocaleStore, useProjectStore]) serveCurrent(store)
  return renderToStaticMarkup(createElement(EntryWorkspace))
}

beforeEach(() => {
  useEntryStore.getState().reset()
  useLocaleStore.setState({ locale: 'ko' })
  useProjectStore.setState({ projectId: 'project-1', initLoading: false, reachedStage: 'editor', currentStage: 'entry', projectTitle: '자판기의 밤' })
})

describe('시작 화면을 읽는 동안', () => {
  // 왜: 레일로 Producer 에 오거나 새로 고친 직후 시작 화면을 읽는 0.2~0.4초 동안 가운데 작은 "불러오는 중…" 한 줄만 보였다(2026-11-26 실측) — 다른 단계 · Editor 와 같은 카드로.
  it('Producer 시작 화면은 시작 화면을 읽는 동안 작은 "불러오는 중…" 줄 대신 Producer 기다리는 카드를 보인다', () => {
    const out = screen({ status: 'loading' })
    expect(out).toContain('data-testid="stage-wait"')
    expect(out).toContain('data-stage-wait="entry"')
    expect(out).toContain('시작 화면을 불러오는 중…')
    expect(out).not.toMatch(/<p[^>]*role="status"[^>]*>(?:(?!<\/p>)[\s\S])*불러오는 중…/)
    // 다른 프로젝트의 시작 화면을 읽어 둔 채면 그것도 아직 읽는 중이다.
    expect(screen({ status: 'ready', projectId: 'other-project' })).toContain('data-testid="stage-wait"')
    // 다 읽으면 카드는 내려간다(정상 경로 고정).
    expect(screen({ status: 'ready' })).not.toContain('data-testid="stage-wait"')
  })

  // 왜: Writer 단계까지 온(산문을 시작한) 프로젝트의 Producer 를 열면 읽는 동안에는 "아직 시작 전"으로 보여 위 막대에
  //   [화면에서 고르기 · 채팅으로 만들기] 탭이 잠깐 보였다 사라졌다(Artist 를 넘긴 프로젝트는 원래 숨는다).
  it('Producer 시작 화면은 시작 화면을 다 읽기 전에는 위 막대에 [화면에서 고르기 · 채팅으로 만들기] 탭을 보이지 않는다', () => {
    useProjectStore.setState({ reachedStage: 'producer' })
    const loading = screen({ status: 'loading' })
    expect(loading).not.toContain('화면에서 고르기')
    expect(loading).not.toContain('채팅으로 만들기')
    // 시작 전 프로젝트를 다 읽으면 탭이 그대로 보인다(정상 경로 고정).
    useProjectStore.setState({ reachedStage: 'entry' })
    const ready = screen({ status: 'ready' })
    expect(ready).toContain('화면에서 고르기')
    expect(ready).toContain('채팅으로 만들기')
  })
})
