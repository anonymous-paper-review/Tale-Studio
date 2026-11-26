// Writer 화면 위 [씬 스토리 | 콘티] 두 칸이 어디에 보이고, 누르면 어디로 가고, 언제 막히는지 검사한다 (오너 2026-11-26 O1, 리드 구조 C — dev D1 의 두 칸을 콘티 단계에 맞춤)
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
    select({ projectTitle: '자판기의 반란', canNavigateTo: (stage: string) => stage !== 'conti' || state.contiOpen }),
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
const render = (stage: 'producer' | 'conti') => renderToStaticMarkup(createElement(WriterPartSwitch, { stage }))
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
const press = (stage: 'producer' | 'conti', part: 'scene' | 'conti') =>
  tabsOf((WriterPartSwitch as (props: { stage: 'producer' | 'conti' }) => ReactNode)({ stage }))?.props.onValueChange(part)

beforeEach(() => {
  state.locale = 'ko'
  state.contiOpen = true
  state.aiBusy = false
  state.push.mockReset()
})

describe('Writer 위 막대의 [씬 스토리 | 콘티]', () => {
  // 왜: O1 — Writer 는 씬 스토리 → 콘티 두 칸이다(dev D1 과 같은 자리: 위 막대 Writer 칩 바로 오른쪽).
  it('씬 스토리 화면과 콘티 화면의 위 막대에는 [씬 스토리 | 콘티] 두 칸이 있고 지금 보는 칸이 눌려 있다', () => {
    const scene = render('producer')
    expect(scene).toContain('씬 스토리')
    expect(scene).toContain('콘티')
    expect(trigger(scene, 'scene')).toContain('data-state="active"')
    expect(trigger(scene, 'conti')).toContain('data-state="inactive"')
    const conti = render('conti')
    expect(trigger(conti, 'conti')).toContain('data-state="active"')
    expect(trigger(conti, 'scene')).toContain('data-state="inactive"')
  })

  // 왜: 두 칸은 Writer 안의 칸이다 — Artist · Storyboard · Director 같은 다른 단계 위 막대에 나오면 엉뚱한 화면으로 간다.
  it('다른 단계 화면의 위 막대에는 [씬 스토리 | 콘티]가 없다', () => {
    expect(renderToStaticMarkup(createElement(StudioTopBar, { stage: 'producer' }))).toContain('data-testid="writer-part-conti"')
    expect(renderToStaticMarkup(createElement(StudioTopBar, { stage: 'conti' }))).toContain('data-testid="writer-part-scene"')
    for (const stage of ['entry', 'artist', 'writer', 'director', 'editor'] as const) {
      expect(renderToStaticMarkup(createElement(StudioTopBar, { stage })), stage).not.toContain('writer-part-')
    }
  })

  // 왜: 정상 경로 고정 — 씬 스토리는 지금 주소(/studio/producer), 콘티는 새 주소(/studio/conti)다.
  it('[콘티]를 누르면 콘티 화면으로, [씬 스토리]를 누르면 씬 스토리 화면으로 간다', () => {
    press('producer', 'conti')
    expect(state.push).toHaveBeenLastCalledWith('/studio/conti')
    press('conti', 'scene')
    expect(state.push).toHaveBeenLastCalledWith('/studio/producer')
    // 지금 보는 칸을 다시 누르면 아무 데도 가지 않는다.
    state.push.mockReset()
    press('conti', 'conti')
    expect(state.push).not.toHaveBeenCalled()
    expect(writerPartTarget('conti', { current: 'scene', ...open })).toBe('/studio/conti')
  })

  // 왜(혼자 정한 것): 콘티는 산문을 확정하면 열린다(O1) — 레일의 잠긴 칸과 같은 뜻을 이 칸에서도 말해 준다.
  it('콘티가 아직 열리지 않았으면 [콘티]는 꺼져 있고 "산문을 확정하면 열려요"가 보인다', () => {
    state.contiOpen = false
    const html = render('producer')
    expect(trigger(html, 'conti')).toMatch(/disabled=""/)
    expect(html).toContain('title="산문을 확정하면 열려요"')
    press('producer', 'conti')
    expect(state.push).not.toHaveBeenCalled()
    expect(writerPartTarget('conti', { current: 'scene', contiOpen: false, aiBusy: false })).toBeNull()
  })

  // 왜(혼자 정한 것): 레일 단계 단추와 같은 규칙(디자이너 QA 1차 #07) — 그리는 중에 화면을 떠나는 길을 하나로 막는다.
  it('AI가 일하는 동안에는 [씬 스토리 | 콘티]를 눌러도 옮겨 가지 않는다', () => {
    state.aiBusy = true
    const html = render('conti')
    expect(trigger(html, 'scene')).toMatch(/disabled=""/)
    expect(html).toContain('title="AI가 일하는 중이에요. 끝나면 옮겨 갈 수 있어요."')
    press('conti', 'scene')
    expect(state.push).not.toHaveBeenCalled()
  })

  // 왜(혼자 정한 것): 한국어는 오너 말 "콘티". 영어 화면에는 실사 단계 이름 Storyboard 가 따로 있어, 콘티는 지금 영어 이름 Rough storyboard 를 쓴다.
  it('칸 이름은 한국어 화면에서 "씬 스토리 | 콘티", 영어 화면에서 "Scene story | Rough storyboard"다', () => {
    expect(translate('ko', 'Scene story')).toBe('씬 스토리')
    expect(translate('ko', 'Rough storyboard')).toBe('콘티')
    state.locale = 'en'
    const html = render('producer')
    expect(html).toContain('>Scene story<')
    expect(html).toContain('>Rough storyboard<')
    expect(html).not.toMatch(/[가-힣]/)
  })

  // 왜(혼자 정한 것): 두 칸은 레일의 같은 Writer 칸이다 — 단계를 옮길 때의 세로 움직임이 나오면 다른 단계로 간 것처럼 보인다.
  it('씬 스토리와 콘티를 오갈 때는 세로 단계 움직임 없이 옆으로 밀린다 — 씬 스토리 → 콘티는 오른쪽에서, 반대는 왼쪽에서 들어온다', () => {
    expect(writerPartSlide('producer', 'conti')).toBe('forward')
    expect(writerPartSlide('conti', 'producer')).toBe('back')
    expect(writerPartSlide('artist', 'conti')).toBe('none')
    expect(writerPartSlide('producer', 'artist')).toBe('none')
    expect(writerPartSlide(null, 'conti')).toBe('none')
    const template = readFileSync('src/app/studio/template.tsx', 'utf8')
    expect(template).toMatch(/writerPartSlide\(/)
    expect(template).toMatch(/slide-in-from-right-6/)
    expect(template).toMatch(/slide-in-from-left-6/)
  })
})
