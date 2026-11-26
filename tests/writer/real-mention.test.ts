// Storyboard 카드 · 씬 이름을 ⌘/Ctrl+클릭하면 채팅에 "@샷 N" · "@씬 N"을 넣고 빼며 누른 자리 ↔ 입력칸으로 날아가는지, 이름이 채팅 @ 목록과 같은지 검사한다
import { beforeEach, describe, expect, it, vi } from 'vitest'

const calls = vi.hoisted(() => ({
  toggle: vi.fn(),
  flight: vi.fn(),
  inputHas: vi.fn((_label: string) => false),
}))
vi.mock('@/lib/mention-flight', () => ({ chatInputHasMention: calls.inputHas, launchMentionFlight: calls.flight }))
vi.mock('@/stores/chat-ui-store', () => ({ useChatUiStore: { getState: () => ({ requestMentionToggle: calls.toggle }) } }))

import { mentionOnModifierClick, storyboardMentionLabels, storyboardMentionRef } from '@/lib/storyboard/mention'
import { writerSceneShotMentions } from '@/lib/script-lines'
import type { SceneManifest, Shot } from '@/types'

// 이 시험을 위해 지은 보드 — 씬 둘, 샷 셋.
const manifest = { scenes: [{ sceneId: 's1' }, { sceneId: 's2' }], characters: [], locations: [] } as unknown as SceneManifest
const shots = [
  { shotId: 'a1', sceneId: 's1' },
  { shotId: 'a2', sceneId: 's1' },
  { shotId: 'b1', sceneId: 's2' },
] as unknown as Shot[]

function click(mods: { ctrlKey?: boolean; metaKey?: boolean } = {}) {
  return { ctrlKey: !!mods.ctrlKey, metaKey: !!mods.metaKey, clientX: 40, clientY: 80, preventDefault: vi.fn(), stopPropagation: vi.fn() }
}

beforeEach(() => {
  for (const fn of Object.values(calls)) fn.mockClear()
  calls.inputHas.mockReturnValue(false)
})

describe('Storyboard 카드 ⌘/Ctrl+클릭 멘션', () => {
  // 왜(오너 G3 "Alt 좌클릭 storyboard 탭에서 애니메이션 없음" · dev D9 "모든 탭에서 같은 연출"): 카드에서 입력칸까지 눈으로 잇게 날아간다.
  it('카드를 ⌘/Ctrl+클릭하면 상세를 열지 않고 채팅에 "@샷 N"을 넣고 누른 자리에서 입력칸으로 날아간다', () => {
    const event = click({ metaKey: true })
    expect(mentionOnModifierClick(event, '샷 2')).toBe(true)
    expect(event.preventDefault).toHaveBeenCalled()
    expect(event.stopPropagation).toHaveBeenCalled()
    expect(calls.toggle).toHaveBeenCalledWith('샷 2')
    expect(calls.flight).toHaveBeenCalledWith({ label: '샷 2', clickX: 40, clickY: 80, toChat: true })
  })

  // 왜(#b2 · #b5): 같은 조작으로 붙이고 뗀다 — 방향은 넣고 빼기 전의 입력칸 글로 본다(뺀 뒤에 보면 늘 "없음"이라 반대로 난다).
  it('이미 붙은 카드를 다시 ⌘/Ctrl+클릭하면 "@샷 N"이 빠지며 입력칸에서 누른 자리로 돌아온다', () => {
    calls.inputHas.mockReturnValue(true)
    mentionOnModifierClick(click({ ctrlKey: true }), '샷 2')
    expect(calls.inputHas.mock.invocationCallOrder[0]).toBeLessThan(calls.toggle.mock.invocationCallOrder[0])
    expect(calls.flight).toHaveBeenCalledWith(expect.objectContaining({ toChat: false }))
  })

  // 왜(정상 경로 고정): 조작키 없이 누르면 카드는 원래 일(샷 상세 열기)을 한다 — 멘션 · 비행은 없다.
  it('조작키 없이 누르면 멘션 · 비행 없이 카드의 원래 일을 하게 둔다', () => {
    const event = click()
    expect(mentionOnModifierClick(event, '샷 2')).toBe(false)
    expect(event.preventDefault).not.toHaveBeenCalled()
    expect(calls.toggle).not.toHaveBeenCalled()
    expect(calls.flight).not.toHaveBeenCalled()
  })

  // 왜: 채팅이 이름으로 샷을 찾는다 — 카드가 넣는 이름과 @ 고르기 목록의 이름(보드 전체 번호 · 화면 언어)이 같아야 같은 샷이다.
  it('카드 · 씬 머리의 멘션 이름과 붙음 표시 ref 는 채팅 @ 고르기 목록과 같다', () => {
    const labels = storyboardMentionLabels(manifest, shots, 'ko')
    const list = writerSceneShotMentions(manifest, shots, 'ko')
    for (const [shotId, label] of labels.shots) expect(list).toContainEqual(expect.objectContaining({ ref: storyboardMentionRef('shot', shotId), label }))
    for (const [sceneId, label] of labels.scenes) expect(list).toContainEqual(expect.objectContaining({ ref: storyboardMentionRef('scene', sceneId), label }))
    expect(labels.shots.get('b1')).toBe('샷 3')
    expect(labels.scenes.get('s2')).toBe('씬 2')
  })

  // 왜: 이름을 모르는 카드(보드에 없는 샷)는 입력칸을 건드리지 않는다 — 엉뚱한 글이 들어가지 않게.
  it('이름을 모르는 카드는 ⌘/Ctrl+클릭해도 채팅 입력을 건드리지 않는다', () => {
    expect(mentionOnModifierClick(click({ metaKey: true }), undefined)).toBe(false)
    expect(calls.toggle).not.toHaveBeenCalled()
  })
})
