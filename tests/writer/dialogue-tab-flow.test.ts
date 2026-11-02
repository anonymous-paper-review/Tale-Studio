// 대사 탭에서 줄을 눌러 고치고 끝내는 흐름(고치는 칸에 들어가는 글 · 저장되는 글)을, 대사 탭 화면 함수를 직접 불러 검사한다
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isValidElement, type ReactElement, type ReactNode } from 'react'
import type { StateCreator } from 'zustand/vanilla'

// 화면 함수를 직접 부른다(브라우저 없이) — 훅은 자리 순서대로 값을 지키고, 효과는 바뀐 deps 만 다시 돈다(React 와 같은 규칙).
const hooks = vi.hoisted(() => ({
  slots: [] as unknown[],
  cursor: 0,
  effects: [] as Array<{ effect: () => void | (() => void); deps?: readonly unknown[] }>,
  mounted: [] as Array<{ deps?: readonly unknown[]; cleanup: void | (() => void) } | undefined>,
}))
vi.mock('react', async (original) => {
  const react = await original<typeof import('react')>()
  const same = (a?: readonly unknown[], b?: readonly unknown[]) => !!a && !!b && a.length === b.length && a.every((value, i) => Object.is(value, b[i]))
  const memo = (factory: () => unknown, deps?: readonly unknown[]) => {
    const slot = hooks.cursor++
    const prev = hooks.slots[slot] as { deps?: readonly unknown[]; value: unknown } | undefined
    if (prev && same(prev.deps, deps)) return prev.value
    const value = factory()
    hooks.slots[slot] = { deps, value }
    return value
  }
  const effect = (run: () => void | (() => void), deps?: readonly unknown[]) => { hooks.effects.push({ effect: run, deps }) }
  return {
    ...react,
    useState: (initial: unknown) => {
      const slot = hooks.cursor++
      if (!(slot in hooks.slots)) hooks.slots[slot] = typeof initial === 'function' ? (initial as () => unknown)() : initial
      return [hooks.slots[slot], (value: unknown) => {
        hooks.slots[slot] = typeof value === 'function' ? (value as (prev: unknown) => unknown)(hooks.slots[slot]) : value
      }]
    },
    useRef: (initial: unknown) => {
      const slot = hooks.cursor++
      if (!(slot in hooks.slots)) hooks.slots[slot] = { current: initial }
      return hooks.slots[slot]
    },
    useCallback: (callback: unknown, deps?: readonly unknown[]) => memo(() => callback, deps),
    useMemo: (factory: () => unknown, deps?: readonly unknown[]) => memo(factory, deps),
    useEffect: effect,
    useLayoutEffect: effect,
    useSyncExternalStore: (_subscribe: unknown, snapshot: () => unknown) => snapshot(),
    useDebugValue: () => {},
    useId: () => ':line:',
  }
})
vi.mock('zustand', async () => {
  const { createStore } = await import('zustand/vanilla')
  const create = (initializer?: StateCreator<unknown>) => {
    if (!initializer) return create
    const store = createStore(initializer)
    return Object.assign((selector?: (state: unknown) => unknown) => (selector ? selector(store.getState()) : store.getState()), store)
  }
  return { create }
})
// 저장은 샷 고치기 팝업과 같은 길(dialogue-line-save) — 무엇을 저장하려 했는지만 받는다.
const saves = vi.hoisted(() => ({ calls: [] as Array<{ shotId: string; lines: Array<{ text: string }> }> }))
vi.mock('@/features/writer/dialogue-line-save', async (original) => ({
  ...(await original<typeof import('@/features/writer/dialogue-line-save')>()),
  saveShotDialogue: vi.fn(async (shotId: string, lines: Array<{ text: string }>) => { saves.calls.push({ shotId, lines }) }),
}))
vi.mock('@/hooks/use-guarded-action', () => ({ useGuardedAction: () => ({ run: vi.fn(), locked: false }) }))
vi.mock('sonner', () => ({ toast: { info: vi.fn(), error: vi.fn(), success: vi.fn(), warning: vi.fn() } }))

import { DialogueView } from '@/features/writer/dialogue-view'
import { DialogueLineRow } from '@/features/writer/dialogue-line-row'
import { useLocaleStore } from '@/stores/locale-store'
import { useProjectStore } from '@/stores/project-store'
import { useWriterStore } from '@/stores/writer-store'
import type { Shot } from '@/types'

type Element = ReactElement<Record<string, unknown>>
function elements(node: ReactNode): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements)
  if (!isValidElement<Record<string, unknown>>(node)) return []
  return [node, ...elements(node.props.children as ReactNode)]
}
/** 대사 탭을 한 번 그린다(효과는 돌리지 않는다). */
function render(): Element[] {
  hooks.cursor = 0
  hooks.effects = []
  return elements(DialogueView())
}
/** 읽어 주는 이름이 같은 대사 줄. */
function lineRow(label: string): Element {
  const found = render().find((node) => node.type === DialogueLineRow && node.props.label === label)
  if (!found) throw new Error(`line ${label} not rendered`)
  return found
}
type RowProps = Parameters<typeof DialogueLineRow>[0]
const props = (node: Element) => node.props as unknown as RowProps

const FIRST = '샷 1의 대사 1 (민호) 고치기'
const shot = (shotId: string, text: string): Shot => ({
  shotId, sceneId: 'sc_01', sortOrder: 0, shotType: 'MS', actionDescription: '민호가 자판기 앞에 선다.', characters: ['min_ho'], durationSeconds: 5,
  generationMethod: 'T2V', dialogueLines: [{ characterId: 'min_ho', text, emotion: 'annoyed', delivery: '', durationHint: 1 }],
  camera: { horizontal: 0, vertical: 0, pan: 0, tilt: 0, roll: 0, zoom: 0 }, lighting: { position: 'front', brightness: 50, colorTemp: 5000 },
})

beforeEach(() => {
  hooks.slots = []
  hooks.mounted = []
  saves.calls.length = 0
  useLocaleStore.setState({ locale: 'ko' })
  useProjectStore.setState({ projectId: 'project-dialogue', currentStage: 'writer' })
  useWriterStore.setState({
    sceneManifest: {
      scenes: [{ sceneId: 'sc_01', sortOrder: 0, location: '복도', timeOfDay: 'night', mood: '', narrativeSummary: '', originalTextQuote: '', charactersPresent: ['min_ho'], estimatedDurationSeconds: 5 }],
      characters: [{ characterId: 'min_ho', name: '민호', role: 'protagonist', description: '', fixedPrompt: '', referenceImages: [] }],
      locations: [],
    },
    // 파이프라인이 글 안에 인물 id 를 그대로 남긴 줄 — 대사 탭은 이름으로 바꿔 보인다(#id-leak).
    shots: [shot('sh_01_01', '아, min_ho는 또야?')],
    loadProject: vi.fn(async () => {}),
  })
})
afterEach(() => {
  for (const mounted of hooks.mounted) if (typeof mounted?.cleanup === 'function') mounted.cleanup()
})

describe('대사 탭 바로 고치기 — 고치는 글', () => {
  // 왜: 2026-11-02 리뷰 R8 — 고치는 칸이 이름으로 바꿔 보인 글에서 시작해, 무엇을 고치든 이름 바꾸기 · 괄호 이름 빼기 · 조사 고르기까지
  //   함께 저장됐다. 샷 고치기 창의 대사 칸은 저장된 글을 그대로 고친다 — 두 곳이 같은 글을 고친다.
  it('대사 줄을 고치기 시작하면 고치는 칸에 저장된 대사 글이 그대로 들어간다 — 샷 고치기 창의 대사 칸과 같다', () => {
    expect(props(lineRow(FIRST)).text).toBe('아, 민호는 또야?')
    props(lineRow(FIRST)).onStart()
    expect(props(lineRow(FIRST)).state).toEqual({ kind: 'editing', draft: '아, min_ho는 또야?' })
  })

  // 왜: 리뷰 R8 — 고친 곳만 저장해야 한다. 보이는 글만 이름으로 바꿔 보이고(저장값 불변, #id-leak), 저장하는 동안의 줄도 이름으로 보인다.
  it('고친 대사를 저장하면 고친 글만 저장하고, 화면에서 이름으로 바꿔 보인 글은 저장하지 않는다', () => {
    props(lineRow(FIRST)).onStart()
    const editing = props(lineRow(FIRST)).state
    props(lineRow(FIRST)).onDraftChange(`${editing.kind === 'editing' ? editing.draft : ''} 진짜?`)
    props(lineRow(FIRST)).onCommit('key')
    expect(saves.calls).toEqual([{ shotId: 'sh_01_01', lines: [expect.objectContaining({ characterId: 'min_ho', text: '아, min_ho는 또야? 진짜?', emotion: 'annoyed' })] }])
    expect(props(lineRow(FIRST)).state).toEqual({ kind: 'saving', draft: '아, 민호는 또야? 진짜?' })
  })
})
