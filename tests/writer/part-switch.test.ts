// Writer 화면 위 [씬 스토리 | 콘티] 두 칸이 어디에 보이고, 누르면 어디로 가고, 언제 막히는지 검사한다 (D1 오너 2026-11-22)
import { readFileSync } from 'node:fs'
import { createElement, isValidElement, type ReactElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  locale: 'ko' as 'ko' | 'en',
  contiOpen: true,
  aiBusy: false,
  push: vi.fn(),
}))

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: state.push, replace: vi.fn() }), usePathname: () => '/studio/producer' }))
vi.mock('@/lib/i18n', async () => {
  const { translate } = await import('@/lib/i18n/translate')
  return { translate, useT: () => (text: string, params?: Record<string, string | number>) => translate(state.locale, text, params) }
})
vi.mock('@/stores/project-store', () => ({
  useProjectStore: (select: (s: unknown) => unknown) =>
    select({ projectTitle: '자판기의 반란', canNavigateTo: (stage: string) => stage !== 'writer' || state.contiOpen }),
}))
vi.mock('@/stores/ai-busy-store', async (original) => ({
  ...(await original<typeof import('@/stores/ai-busy-store')>()),
  useAiBusyStore: (select: (s: unknown) => unknown) => select({ tokens: state.aiBusy ? ['work'] : [] }),
  aiBusyNow: () => state.aiBusy,
}))
vi.mock('@/features/entry/project-title-field', () => ({ ProjectTitleField: ({ title }: { title: string }) => title }))

import { StudioTopBar } from '@/components/layout/studio-top-bar'
import { WriterPartSwitch } from '@/features/writer/writer-part-switch'
import { writerPartSlide, writerPartTarget } from '@/lib/writer/parts'
import { translate } from '@/lib/i18n/translate'

const open = { contiOpen: true, aiBusy: false }
const render = (stage: 'producer' | 'writer') => renderToStaticMarkup(createElement(WriterPartSwitch, { stage }))
/** 칸 하나의 단추(<button …>…</button>) — data-testid 로 찾는다. */
const trigger = (html: string, part: 'scene' | 'conti') => html.match(new RegExp(`<button[^>]*data-testid="writer-part-${part}"[^>]*>`))?.[0] ?? ''

/** 렌더 없이 컴포넌트가 돌려준 칸 묶음(Tabs)의 onValueChange 를 찾는다 — 이 컴포넌트는 React 상태 훅을 쓰지 않는다. */
function tabsOf(node: ReactNode): ReactElement<{ onValueChange: (value: string) => void }> | null {
  if (!isValidElement(node)) return null
  const props = node.props as { onValueChange?: unknown; children?: ReactNode }
  if (typeof props.onValueChange === 'function') return node as ReactElement<{ onValueChange: (value: string) => void }>
  const children = Array.isArray(props.children) ? props.children : [props.children]
  for (const child of children) {
    const found = tabsOf(child)
    if (found) return found
  }
  return null
}
const press = (stage: 'producer' | 'writer', part: 'scene' | 'conti') =>
  tabsOf((WriterPartSwitch as (props: { stage: 'producer' | 'writer' }) => ReactNode)({ stage }))?.props.onValueChange(part)

beforeEach(() => {
  state.locale = 'ko'
  state.contiOpen = true
  state.aiBusy = false
  state.push.mockReset()
})

describe('Writer 위 막대의 [씬 스토리 | 콘티]', () => {
  it('씬 스토리 화면과 콘티 화면의 위 막대에는 [씬 스토리 | 콘티] 두 칸이 있고 지금 보는 칸이 눌려 있다', () => {
    // 왜: D1 — Storyboard 탭을 Writer 에 합쳐 Writer 탭 안에 씬 스토리 · 콘티 두 칸을 둔다(리드 단계 구조).
    const scene = render('producer')
    expect(scene).toContain('씬 스토리')
    expect(scene).toContain('콘티')
    expect(trigger(scene, 'scene')).toContain('data-state="active"')
    expect(trigger(scene, 'conti')).toContain('data-state="inactive"')
    const conti = render('writer')
    expect(trigger(conti, 'conti')).toContain('data-state="active"')
    expect(trigger(conti, 'scene')).toContain('data-state="inactive"')
  })

  it('다른 단계 화면의 위 막대에는 [씬 스토리 | 콘티]가 없다', () => {
    // 왜: 두 칸은 Writer 탭 안의 칸이다 — Artist · Director 같은 다른 단계 위 막대에 나오면 엉뚱한 화면으로 간다.
    const writerBar = renderToStaticMarkup(createElement(StudioTopBar, { stage: 'producer' }))
    expect(writerBar).toContain('data-testid="writer-part-conti"')
    for (const stage of ['entry', 'artist', 'director', 'editor'] as const) {
      expect(renderToStaticMarkup(createElement(StudioTopBar, { stage })), stage).not.toContain('writer-part-')
    }
  })

  it('[콘티]를 누르면 콘티 화면으로, [씬 스토리]를 누르면 씬 스토리 화면으로 간다', () => {
    // 왜: 정상 경로 고정 — 콘티는 옛 Storyboard 주소(/studio/writer), 씬 스토리는 옛 Writer 주소(/studio/producer) 그대로다(주소 · 단계 id 는 바꾸지 않는다).
    press('producer', 'conti')
    expect(state.push).toHaveBeenLastCalledWith('/studio/writer')
    press('writer', 'scene')
    expect(state.push).toHaveBeenLastCalledWith('/studio/producer')
    // 지금 보는 칸을 다시 누르면 아무 데도 가지 않는다.
    state.push.mockReset()
    press('writer', 'conti')
    expect(state.push).not.toHaveBeenCalled()
    expect(writerPartTarget('conti', { current: 'scene', ...open })).toBe('/studio/writer')
  })

  it('콘티가 아직 열리지 않았으면 [콘티]는 꺼져 있고 "Artist에서 완료하기를 누르면 열려요"가 보인다', () => {
    // 왜(혼자 정한 것 f): 콘티는 Artist [완료하기]로 열린다(10/20 약속) — 레일의 잠긴 칸과 같은 뜻을 이 칸에서도 말해 준다.
    state.contiOpen = false
    const html = render('producer')
    expect(trigger(html, 'conti')).toMatch(/disabled=""/)
    expect(html).toContain('title="Artist에서 완료하기를 누르면 열려요"')
    press('producer', 'conti')
    expect(state.push).not.toHaveBeenCalled()
    expect(writerPartTarget('conti', { current: 'scene', contiOpen: false, aiBusy: false })).toBeNull()
  })

  it('AI가 일하는 동안에는 [씬 스토리 | 콘티]를 눌러도 옮겨 가지 않는다', () => {
    // 왜(혼자 정한 것 g): 레일 단계 단추와 같은 규칙(디자이너 QA 1차 #07) — 그리는 중에 화면을 떠나는 길을 하나로 막는다.
    state.aiBusy = true
    const html = render('writer')
    expect(trigger(html, 'scene')).toMatch(/disabled=""/)
    expect(html).toContain('title="AI가 일하는 중이에요. 끝나면 옮겨 갈 수 있어요."')
    press('writer', 'scene')
    expect(state.push).not.toHaveBeenCalled()
  })

  it('칸 이름은 한국어 화면에서 "씬 스토리 | 콘티", 영어 화면에서 "Scene story | Storyboard"다', () => {
    // 왜(혼자 정한 것 h): D1 "storyboard란 명칭은 콘티로" — 한국어는 콘티, 영어 사용자에게 conti 는 낯선 말이라 영어는 Storyboard 를 그대로 쓴다.
    expect(translate('ko', 'Scene story')).toBe('씬 스토리')
    expect(translate('ko', 'Storyboard')).toBe('콘티')
    state.locale = 'en'
    const html = render('producer')
    expect(html).toContain('>Scene story<')
    expect(html).toContain('>Storyboard<')
    expect(html).not.toMatch(/[가-힣]/)
  })

  it('씬 스토리와 콘티를 오갈 때는 세로 단계 움직임 없이 옆으로 밀린다 — 씬 스토리 → 콘티는 오른쪽에서, 반대는 왼쪽에서 들어온다', () => {
    // 왜(혼자 정한 것 d): 두 칸은 레일의 같은 Writer 칸이다 — 단계를 옮길 때의 세로 움직임이 나오면 다른 단계로 간 것처럼 보인다.
    expect(writerPartSlide('producer', 'writer')).toBe('forward')
    expect(writerPartSlide('writer', 'producer')).toBe('back')
    expect(writerPartSlide('artist', 'writer')).toBe('none')
    expect(writerPartSlide('producer', 'artist')).toBe('none')
    expect(writerPartSlide(null, 'writer')).toBe('none')
    const template = readFileSync('src/app/studio/template.tsx', 'utf8')
    expect(template).toMatch(/writerPartSlide\(/)
    expect(template).toMatch(/slide-in-from-right-6/)
    expect(template).toMatch(/slide-in-from-left-6/)
  })
})
