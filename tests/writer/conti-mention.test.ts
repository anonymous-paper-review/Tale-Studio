// 콘티(카드 · 씬 머리 · 대사 줄)를 ⌘/Ctrl+클릭하면 채팅에 붙고 날아가는 연출이 나오는지, 그냥 누르면 지금처럼 동작하는지 검사한다 (D9 오너 2026-11-22 · G3 2026-11-26, dev eadbb00e 를 옮김 — 씬 스토리 문단은 이 갈래 밖)
import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  inputHas: new Set<string>(),
  toggle: vi.fn(),
  flight: vi.fn(),
}))
vi.mock('@/lib/mention-flight', () => ({
  chatInputHasMention: (label: string) => state.inputHas.has(label),
  launchMentionFlight: state.flight,
}))
vi.mock('@/stores/chat-ui-store', () => ({
  useChatUiStore: Object.assign(() => null, { getState: () => ({ requestMentionToggle: state.toggle }) }),
}))

import { writerSceneShotMentions } from '@/lib/script-lines'
import {
  contiMentionLabels,
  contiMentionRef,
  mentionOnModifierClick,
  stopModifierPointerDown,
} from '@/lib/writer/conti-mention'
import type { SceneManifest, Shot } from '@/types'

const manifest = {
  scenes: [{ sceneId: 'sc_a' }, { sceneId: 'sc_b' }],
  characters: [],
  locations: [],
} as unknown as SceneManifest
const shots = [
  { shotId: 'a1', sceneId: 'sc_a' },
  { shotId: 'a2', sceneId: 'sc_a' },
  { shotId: 'b1', sceneId: 'sc_b' },
] as unknown as Shot[]

function click(mods: { metaKey?: boolean; ctrlKey?: boolean } = {}) {
  return { metaKey: false, ctrlKey: false, ...mods, clientX: 120, clientY: 340, preventDefault: vi.fn(), stopPropagation: vi.fn() }
}
const read = (file: string) => readFileSync(file, 'utf8')

beforeEach(() => {
  state.inputHas.clear()
  state.toggle.mockReset()
  state.flight.mockReset()
})

describe('콘티 ⌘/Ctrl+클릭 멘션', () => {
  it('콘티의 샷 카드를 ⌘/Ctrl+클릭하면 상세 창 대신 채팅 입력에 "@샷 N"이 들어가고 카드에서 입력칸으로 날아가는 연출이 나온다', () => {
    // 왜: D9 — ⌘(맥) · Ctrl+클릭 멘션이 모든 탭에서 되고 날아가는 연출도 같아야 한다. 콘티 카드는 리뉴얼 1차에 일부러 뺐던 자리다.
    const labels = contiMentionLabels(manifest, shots, 'ko')
    expect(labels.shots.get('b1')).toBe('샷 3')
    const event = click({ metaKey: true })
    expect(mentionOnModifierClick(event, labels.shots.get('b1'))).toBe(true)
    expect(event.preventDefault).toHaveBeenCalled()
    expect(event.stopPropagation).toHaveBeenCalled()
    expect(state.toggle).toHaveBeenCalledWith('샷 3')
    expect(state.flight).toHaveBeenCalledWith({ label: '샷 3', clickX: 120, clickY: 340, toChat: true })
    // Ctrl 도 같다(윈도 · 리눅스).
    expect(mentionOnModifierClick(click({ ctrlKey: true }), '샷 1')).toBe(true)
    expect(state.toggle).toHaveBeenLastCalledWith('샷 1')
  })

  it('카드 · 씬 머리의 멘션 이름은 채팅 @ 고르기 목록의 이름과 같다(한국어 · 영어)', () => {
    // 왜: 채팅이 이름으로 그 샷을 찾는다(activeMentionRefs) — 카드가 다른 이름을 넣으면 붙은 글이 아무 샷도 가리키지 않는다.
    for (const locale of ['ko', 'en'] as const) {
      const labels = contiMentionLabels(manifest, shots, locale)
      const chat = new Map(writerSceneShotMentions(manifest, shots, locale).map((m) => [m.ref, m.label]))
      for (const shot of shots) expect(labels.shots.get(shot.shotId)).toBe(chat.get(contiMentionRef('shot', shot.shotId)))
      expect(labels.scenes.get('sc_b')).toBe(chat.get(contiMentionRef('scene', 'sc_b')))
    }
    expect(contiMentionLabels(manifest, shots, 'en').shots.get('a2')).toBe('Shot 2')
  })

  it('입력에 이미 있는 샷을 다시 ⌘/Ctrl+클릭하면 "@샷 N"이 빠지고 입력칸에서 카드로 돌아오는 연출이 나온다', () => {
    // 왜: 이미 있는 약속(#b6) — 같은 조작으로 붙이고 뗀다. 연출 방향은 입력칸 글이 진실이다(#b2).
    state.inputHas.add('샷 3')
    mentionOnModifierClick(click({ metaKey: true }), '샷 3')
    expect(state.toggle).toHaveBeenCalledWith('샷 3')
    expect(state.flight).toHaveBeenCalledWith(expect.objectContaining({ label: '샷 3', toChat: false }))
  })

  it('콘티의 씬 머리를 ⌘/Ctrl+클릭하면 접히지 않고 "@씬 N"이 들어간다', () => {
    // 왜: D9 — 씬 머리를 누르면 접히는데, ⌘/Ctrl 를 함께 누르면 그 씬을 채팅에 붙이는 뜻이다.
    const labels = contiMentionLabels(manifest, shots, 'ko')
    const event = click({ ctrlKey: true })
    mentionOnModifierClick(event, labels.scenes.get('sc_b'))
    expect(state.toggle).toHaveBeenCalledWith('씬 2')
    expect(event.stopPropagation).toHaveBeenCalled()
    const board = read('src/features/writer/rough-storyboard-view.tsx')
    expect(board).toMatch(/onClickCapture=\{\(e\) => mentionOnModifierClick\(e, mentionLabels\.scenes\.get\(scene\.sceneId\)\)\}/)
  })

  it('⌘/Ctrl 없이 누르면 지금처럼 상세 창 · 씬 접기 · 대사 고치기가 열린다', () => {
    // 왜: 정상 경로 고정 — 그냥 누르는 동작은 바뀌지 않는다.
    const event = click()
    expect(mentionOnModifierClick(event, '샷 3')).toBe(false)
    expect(stopModifierPointerDown(event)).toBe(false)
    expect(event.preventDefault).not.toHaveBeenCalled()
    expect(state.toggle).not.toHaveBeenCalled()
    const board = read('src/features/writer/rough-storyboard-view.tsx')
    expect(board).toContain('onClick={() => openDetail(shot.shotId)}')
  })

  it('⌘/Ctrl 를 누른 채 누르기 시작하면 카드 안 단추 · 입력칸이 먼저 반응하지 않는다', () => {
    // 왜: 포커스 · 메뉴 열림은 누르기 시작(pointerdown)에서 일어난다 — 멘션하려던 누르기가 카드 안 단추를 누르면 안 된다(Producer 카드와 같은 규칙).
    const event = click({ metaKey: true })
    expect(stopModifierPointerDown(event)).toBe(true)
    expect(event.preventDefault).toHaveBeenCalled()
    expect(event.stopPropagation).toHaveBeenCalled()
  })

  it('콘티 대사 탭의 샷 줄 · 대사 줄을 ⌘/Ctrl+클릭하면 고치기 칸이 열리지 않고 "@샷 N"이 들어간다', () => {
    // 왜(혼자 정한 것 m): D9 — 대사 탭에서도 같은 조작. 대사 줄도 "@L12" 대신 그 샷 이름으로 붙인다 — 카드 · 줄 어디서나 같은 이름.
    const dialogue = read('src/features/writer/dialogue-view.tsx')
    expect(dialogue).toMatch(/data-shot-id=\{shot\.shotId\}[\s\S]{0,400}onClickCapture=\{\(e\) => mentionOnModifierClick\(e, mentionLabels\.shots\.get\(shot\.shotId\)\)\}/)
    expect(dialogue).toMatch(/onPointerDownCapture=\{stopModifierPointerDown\}/)
  })

  it('입력에 @샷 N 이 붙어 있는 카드는 하늘색 테두리로 보인다', () => {
    // 왜(혼자 정한 것 n): Producer · Artist 카드와 같은 표시 — 붙은 샷이 보드 어디 있는지 보인다.
    expect(contiMentionRef('shot', 'b1')).toBe('writer:shot:b1')
    const board = read('src/features/writer/rough-storyboard-view.tsx')
    expect(board).toMatch(/mentionedRefs\.includes\(contiMentionRef\('shot', shot\.shotId\)\)[\s\S]{0,200}ring-sky-400/)
  })
})
