// 씬 단추 줄(Director · Cinema 공용)이 씬 이름을 순서대로 보이고, 누르면 그 씬을 고르고, ⌘/Ctrl+클릭이면 씬은 그대로 두고 @이름을 채팅에 넣는지 검사한다 (오너 D8 · D9 2026-11-22)
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const cycle = vi.hoisted(() => ({ calls: [] as Array<{ views: readonly string[]; current: string; onChange: (next: string) => void }> }))
vi.mock('@/lib/use-alt-arrow-cycle', () => ({
  useAltArrowCycle: (views: readonly string[], current: string, onChange: (next: string) => void) => {
    cycle.calls.push({ views, current, onChange })
  },
}))

// 화면 말 — 서버 그리기는 스토어의 처음 값(영어)을 읽으므로 번역 훅을 직접 고른 말로 돌린다(pick-shots 시험과 같은 방법).
const lang = vi.hoisted(() => ({ locale: 'ko' as 'ko' | 'en' }))
vi.mock('@/lib/i18n', async () => {
  const { translate } = await import('@/lib/i18n/translate')
  return { translate, useT: () => (text: string, params?: Record<string, string | number>) => translate(lang.locale, text, params) }
})

import { SceneButtons, sceneButtonPress, type SceneButtonItem } from '@/components/scene-buttons'

const ITEMS: SceneButtonItem[] = [
  { key: 'sc_01', label: '씬 1', title: '씬 1 · 부엌 · 샷 3개', mentionLabel: '실사 씬 1' },
  { key: 'sc_02', label: '씬 2', title: '씬 2 · 골목 · 샷 4개', mentionLabel: '실사 씬 2' },
  { key: 'sc_03', label: '씬 3', mentionLabel: null },
]
const plain = { metaKey: false, ctrlKey: false }

function render(props: Partial<Parameters<typeof SceneButtons>[0]> = {}): string {
  return renderToStaticMarkup(createElement(SceneButtons, { items: ITEMS, value: 'sc_02', onChange: () => {}, ...props }))
}

beforeEach(() => {
  cycle.calls.length = 0
  lang.locale = 'ko'
})

describe('씬 단추 줄', () => {
  it('씬 단추는 받은 순서대로 씬 이름을 보이고 고른 씬만 눌린 모양이다', () => {
    // 왜: 오너 D8 — 옛 [스토리보드 | 노드] 자리에 씬 단추. 고른 씬은 segmented 탭처럼 눌린 칸(design.md §2.11, aria-pressed).
    const html = render()
    expect(html.indexOf('씬 1')).toBeLessThan(html.indexOf('씬 2'))
    expect(html.indexOf('씬 2')).toBeLessThan(html.indexOf('씬 3'))
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1)
    expect(html).toMatch(/aria-pressed="true"[^>]*data-scene-key="sc_02"|data-scene-key="sc_02"[^>]*aria-pressed="true"/)
  })

  it('씬 단추를 누르면 그 씬을 고르고, 이미 보고 있는 씬을 다시 누르면 아무 일도 없다', () => {
    // 왜: 오너 D8 "scene 별로 누르면 로딩되게". 같은 씬을 또 누르면 화면을 다시 맞추지 않는다.
    expect(sceneButtonPress(plain, ITEMS[0]!, 'sc_02')).toEqual({ kind: 'select', key: 'sc_01' })
    expect(sceneButtonPress(plain, ITEMS[1]!, 'sc_02')).toBeNull()
  })

  it('⌘/Ctrl 을 누른 채 씬 단추를 누르면 씬은 그대로고 그 씬의 @이름을 채팅에 넣는다', () => {
    // 왜: 오너 D9 — ⌘/Ctrl+클릭은 모든 탭에서 채팅 @멘션이다. 멘션하려던 누름이 보는 씬을 바꾸면 안 된다.
    expect(sceneButtonPress({ metaKey: true, ctrlKey: false }, ITEMS[0]!, 'sc_02')).toEqual({ kind: 'mention', label: '실사 씬 1' })
    expect(sceneButtonPress({ metaKey: false, ctrlKey: true }, ITEMS[1]!, 'sc_02')).toEqual({ kind: 'mention', label: '실사 씬 2' })
  })

  it('멘션 이름이 없는 씬은 ⌘/Ctrl+클릭해도 씬도 채팅도 바뀌지 않는다', () => {
    // 왜: 채팅이 알아보지 못하는 이름을 넣지 않는다(card-mention mentionLabelForModifierClick 과 같은 규칙).
    expect(sceneButtonPress({ metaKey: true, ctrlKey: false }, ITEMS[2]!, 'sc_02')).toBeNull()
  })

  it('⌘/Ctrl+클릭은 누른 자리에서 채팅으로 @이름이 날아가는 다른 탭과 같은 길을 쓰고, 단추의 다른 동작은 캡처 단계에서 끊는다', () => {
    // 왜: 오너 D9 "애니메이션도 동일하게" — Producer 카드(readiness-board.tsx)와 같은 길: 멘션 토글 요청 + 비행. 포커스 · 고르기가 같이 일어나지 않게 캡처에서 끊는다.
    const source = readFileSync('src/components/scene-buttons.tsx', 'utf8')
    expect(source).toMatch(/onPointerDownCapture=/)
    expect(source).toMatch(/onClickCapture=/)
    expect(source).toMatch(/requestMentionToggle\(/)
    expect(source).toMatch(/launchMentionFlight\(\{/)
    expect(source).toMatch(/chatInputHasMention\(/)
  })

  it('씬이 없으면 씬 단추 줄을 그리지 않는다', () => {
    // 왜: 씬이 아직 없는 프로젝트에 빈 알약을 두지 않는다.
    expect(render({ items: [] })).toBe('')
  })

  it('씬 단추에 마우스를 올리면 그 씬 설명 한 줄을 보인다', () => {
    // 왜: 단추에는 "씬 2"만 써서 줄을 짧게 두고, 장소 · 샷 수는 마우스를 올리면 본다(씬이 많아도 한 줄에 들어가게).
    expect(render()).toContain('title="씬 2 · 골목 · 샷 4개"')
  })

  it('씬 단추 묶음은 화면 말로 이름을 단다(한국어 "씬", 영어 "Scenes")', () => {
    // 왜: 화면 읽기 프로그램이 이 단추 묶음을 무엇이라 읽는지 — 영어 화면에 한국어가 나오면 안 된다(오너 2026-11-14 답 7).
    expect(render()).toContain('aria-label="씬"')
    lang.locale = 'en'
    expect(render()).toContain('aria-label="Scenes"')
  })

  it('Alt+←/→ 를 켠 씬 단추 줄은 씬 순서대로 앞 · 뒤 씬으로 넘긴다', () => {
    // 왜: Director 의 옛 보기 순환(Alt+←/→) 자리를 앞 · 뒤 씬이 쓴다(혼자 정한 것 h19). 끝에서 처음으로 도는 것은 공용 훅의 약속.
    const onChange = vi.fn()
    render({ cycleWithAltArrows: true, onChange })
    const last = cycle.calls.at(-1)!
    expect(last.views).toEqual(['sc_01', 'sc_02', 'sc_03'])
    expect(last.current).toBe('sc_02')
    last.onChange('sc_03')
    expect(onChange).toHaveBeenCalledWith('sc_03')
  })

  it('Alt+←/→ 를 켜지 않은 씬 단추 줄은 그 키를 가로채지 않는다', () => {
    // 왜: Camera 처럼 그 키를 다른 데 쓰는 화면이 있을 수 있다 — 켠 화면에서만 씬을 넘긴다.
    render()
    expect(cycle.calls.at(-1)!.views).toEqual([])
  })
})
