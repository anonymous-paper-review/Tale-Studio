// 대사 탭에서 줄을 눌러 고치고 끝내는 흐름(누르기 · Enter · Esc · 칸 밖 누르기 · 저장되는 글 · 포커스 · 연필 단추)을, 대사 탭 화면 함수를 직접 불러 검사한다
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isValidElement, type ReactElement, type ReactNode } from 'react'
import type { StateCreator } from 'zustand/vanilla'

// 화면 함수를 직접 부른다(브라우저 없이) — 훅은 자리 순서대로 값을 지키고, 효과는 바뀐 deps 만 다시 돈다(React 와 같은 규칙).
const hooks = vi.hoisted(() => ({
  slots: [] as unknown[],
  cursor: 0,
  /** 그린 뒤 상태가 바뀌었다 — 한 번 더 그려야 한다. */
  dirty: false,
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
        const next = typeof value === 'function' ? (value as (prev: unknown) => unknown)(hooks.slots[slot]) : value
        if (Object.is(next, hooks.slots[slot])) return
        hooks.slots[slot] = next
        hooks.dirty = true
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

import { toast } from 'sonner'
import { Textarea } from '@/components/ui/textarea'
import { useBoardUiStore } from '@/features/writer/board-ui-store'
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
function textOf(node: ReactNode): string {
  if (node == null || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join('')
  if (isValidElement<{ children?: ReactNode }>(node)) return textOf(node.props.children)
  return ''
}
/** 대사 탭을 한 번 그린다(효과는 돌리지 않는다). */
function render(): Element[] {
  hooks.cursor = 0
  hooks.effects = []
  return elements(DialogueView())
}
/** 그린 뒤 화면에 붙인다 — deps 가 바뀐 효과만 (앞 정리 뒤) 다시 돌고, 그 사이 상태가 바뀌면 가라앉을 때까지 다시 그린다. */
function commit() {
  const same = (a?: readonly unknown[], b?: readonly unknown[]) => !!a && !!b && a.length === b.length && a.every((value, i) => Object.is(value, b[i]))
  for (let pass = 0; pass < 10; pass++) {
    hooks.dirty = false
    render()
    hooks.effects.forEach(({ effect, deps }, index) => {
      const prev = hooks.mounted[index]
      if (prev && same(prev.deps, deps)) return
      if (typeof prev?.cleanup === 'function') prev.cleanup()
      hooks.mounted[index] = { deps, cleanup: effect() }
    })
    if (!hooks.dirty) return
  }
  throw new Error('the dialogue tab kept re-rendering')
}
/** 대사 한 줄(DialogueLineRow)만 따로 그린다 — 대사 탭의 훅 자리와 섞이지 않게 제 자리에서. */
function rowElements(rowProps: Parameters<typeof DialogueLineRow>[0]): Element[] {
  const saved = { slots: hooks.slots, cursor: hooks.cursor, effects: hooks.effects }
  hooks.slots = []
  hooks.cursor = 0
  hooks.effects = []
  try {
    return elements(DialogueLineRow(rowProps))
  } finally {
    Object.assign(hooks, saved)
  }
}
const keyEvent = (key: string, extra: Record<string, unknown> = {}) =>
  ({ key, shiftKey: false, keyCode: 0, nativeEvent: { isComposing: false }, preventDefault: vi.fn(), stopPropagation: vi.fn(), ...extra })
const settle = () => new Promise((resolve) => setTimeout(resolve, 0))
/** 읽어 주는 이름이 같은 대사 줄. */
function lineRow(label: string): Element {
  const found = render().find((node) => node.type === DialogueLineRow && node.props.label === label)
  if (!found) throw new Error(`line ${label} not rendered`)
  return found
}
type RowProps = Parameters<typeof DialogueLineRow>[0]
const props = (node: Element) => node.props as unknown as RowProps

const FIRST = '샷 1의 대사 1 (민호) 고치기'
const rowBase = {
  speaker: '민호', speakerClassName: '', rowClassName: '', text: '아, 또야?', label: FIRST,
  onStart: () => {}, onDraftChange: () => {}, onCommit: () => {}, onCancel: () => {}, onRetry: () => {}, onRevert: () => {},
}
const shot = (shotId: string, text: string): Shot => ({
  shotId, sceneId: 'sc_01', sortOrder: 0, shotType: 'MS', actionDescription: '민호가 자판기 앞에 선다.', characters: ['min_ho'], durationSeconds: 5,
  generationMethod: 'T2V', dialogueLines: [{ characterId: 'min_ho', text, emotion: 'annoyed', delivery: '', durationHint: 1 }],
  camera: { horizontal: 0, vertical: 0, pan: 0, tilt: 0, roll: 0, zoom: 0 }, lighting: { position: 'front', brightness: 50, colorTemp: 5000 },
})

beforeEach(() => {
  hooks.slots = []
  hooks.mounted = []
  saves.calls.length = 0
  vi.mocked(toast.info).mockClear()
  useBoardUiStore.getState().setShotEditId(null)
  useLocaleStore.setState({ locale: 'ko' })
  useProjectStore.setState({ projectId: 'project-dialogue', currentStage: 'writer' })
  useWriterStore.setState({
    sceneManifest: {
      scenes: [{ sceneId: 'sc_01', sortOrder: 0, location: '복도', timeOfDay: 'night', mood: '', narrativeSummary: '', originalTextQuote: '', charactersPresent: ['min_ho'], estimatedDurationSeconds: 5 }],
      characters: [{ characterId: 'min_ho', name: '민호', role: 'protagonist', description: '', fixedPrompt: '', referenceImages: [] }],
      locations: [],
    },
    // 파이프라인이 글 안에 인물 id 를 그대로 남긴 줄 — 대사 탭은 이름으로 바꿔 보인다(#id-leak).
    shots: [shot('sh_01_01', '아, min_ho는 또야?'), { ...shot('sh_01_02', ''), sortOrder: 1, dialogueLines: [] }],
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

describe('대사 탭 바로 고치기 — 누르기 · 끝내기', () => {
  // 왜: 2026-11-02 오너가 고른 방식 "탭 안에서 바로 고치기"(대사 글을 탭 안에서 바로 고치고 저장해요). 예전에는 샷을 누르면 팝업이 열렸다(2026-10-31 QA).
  it('대사 탭에서 대사 줄을 누르면 그 자리에서 대사 글을 고치는 칸이 열린다', () => {
    const onStart = vi.fn()
    const idle = rowElements({ ...rowBase, state: { kind: 'idle' }, onStart }).find((node) => node.props.role === 'button')!
    ;(idle.props.onClick as () => void)()
    for (const key of ['Enter', ' ', 'a']) (idle.props.onKeyDown as (event: unknown) => void)(keyEvent(key))
    expect(onStart).toHaveBeenCalledTimes(3)
    props(lineRow(FIRST)).onStart()
    const editing = rowElements(props(lineRow(FIRST)))
    expect(editing.find((node) => node.type === Textarea)?.props.value).toBe('아, min_ho는 또야?')
    expect(textOf(editing[0])).toContain('Enter 저장 · Esc 취소')
  })

  // 왜: 앱의 다른 바로 고치기(프로젝트 제목 등)와 같은 조작이다 — Enter 나 바깥을 누르면 저장, Esc 는 고치기 전 글로 돌아간다(혼자 정한 것).
  it('Enter 를 누르거나 칸 밖을 누르면 저장하고 Esc 를 누르면 고치기 전 글로 돌아간다', async () => {
    const onCommit = vi.fn()
    const onCancel = vi.fn()
    const textarea = rowElements({ ...rowBase, state: { kind: 'editing', draft: '아, 또 먹었어?' }, onCommit, onCancel }).find((node) => node.type === Textarea)!
    const press = textarea.props.onKeyDown as (event: unknown) => void
    press(keyEvent('Enter'))
    ;(textarea.props.onBlur as () => void)()
    press(keyEvent('Escape'))
    press(keyEvent('Enter', { nativeEvent: { isComposing: true } }))
    expect(onCommit.mock.calls).toEqual([['key'], ['blur']])
    expect(onCancel).toHaveBeenCalledOnce()
    for (const via of ['key', 'blur'] as const) {
      props(lineRow(FIRST)).onStart()
      props(lineRow(FIRST)).onDraftChange(`아, 또 먹었어? (${via})`)
      props(lineRow(FIRST)).onCommit(via)
      await settle()
    }
    expect(saves.calls.map((call) => call.lines[0].text)).toEqual(['아, 또 먹었어? (key)', '아, 또 먹었어? (blur)'])
    props(lineRow(FIRST)).onStart()
    props(lineRow(FIRST)).onDraftChange('버릴 글')
    props(lineRow(FIRST)).onCancel()
    expect(saves.calls).toHaveLength(2)
    expect(props(lineRow(FIRST))).toMatchObject({ state: { kind: 'idle' }, text: '아, 민호는 또야?' })
  })

  // 왜: 리드 지시(빈 글은 저장하지 않고 원래 글로) — 실수로 다 지운 것과 줄 지우기를 구분한다. 줄 지우기는 샷 고치기 창에서 한다.
  it('대사 글을 다 지우고 끝내면 저장하지 않고 원래 글로 되돌린다', () => {
    props(lineRow(FIRST)).onStart()
    props(lineRow(FIRST)).onDraftChange('   ')
    props(lineRow(FIRST)).onCommit('key')
    expect(saves.calls).toEqual([])
    expect(toast.info).toHaveBeenCalledWith('빈 대사는 저장하지 않아요. 줄을 지우려면 연필 단추로 샷 고치기 창을 여세요.')
    expect(props(lineRow(FIRST))).toMatchObject({ state: { kind: 'idle' }, text: '아, 민호는 또야?' })
  })

  // 왜(혼자 정한 것): 고치는 동안 채팅이 같은 샷의 대사를 바꾸면 줄 순서가 달라질 수 있다 — 엉뚱한 줄을 덮어쓰지 않는다.
  it('고치는 동안 그 대사가 다른 곳에서 바뀌었으면 덮어쓰지 않고 다시 눌러 고쳐 달라고 알린다', () => {
    props(lineRow(FIRST)).onStart()
    props(lineRow(FIRST)).onDraftChange('아, 또 먹었어?')
    const [first, second] = useWriterStore.getState().shots
    useWriterStore.setState({ shots: [{ ...first, dialogueLines: [{ ...first.dialogueLines[0], text: '어? 나왔다!' }] }, second] })
    props(lineRow(FIRST)).onCommit('key')
    expect(saves.calls).toEqual([])
    expect(toast.info).toHaveBeenCalledWith('고치는 동안 이 대사가 바뀌었어요. 다시 눌러 고쳐 주세요.')
  })
})

describe('대사 탭 바로 고치기 — 포커스 · 연필 단추', () => {
  // 왜: 저장한 뒤 키보드 사용자가 같은 자리에서 이어 갈 수 있어야 한다(리드 지시) — Enter · Esc 로 끝내면 그 줄로 포커스를 돌린다.
  it('Enter 로 저장하거나 Esc 로 취소하면 포커스가 그 대사 줄로 돌아온다', async () => {
    commit()
    const box = { focus: vi.fn() }
    props(lineRow(FIRST)).rowRef?.(box as unknown as HTMLDivElement)
    props(lineRow(FIRST)).onStart()
    props(lineRow(FIRST)).onDraftChange('아, 또 먹었어?')
    props(lineRow(FIRST)).onCommit('key')
    commit()
    expect(box.focus).toHaveBeenCalledOnce()
    await settle()
    props(lineRow(FIRST)).onStart()
    props(lineRow(FIRST)).onCancel()
    commit()
    expect(box.focus).toHaveBeenCalledTimes(2)
  })

  // 왜(혼자 정한 것): 칸 밖을 누른 사람은 다른 곳(다른 줄 · 채팅 칸)으로 가려는 것이다 — 저장하되 포커스를 그 줄로 끌어오지 않는다.
  it('칸 밖을 눌러 저장하면 포커스를 그 대사 줄로 끌어오지 않는다', () => {
    commit()
    const box = { focus: vi.fn() }
    props(lineRow(FIRST)).rowRef?.(box as unknown as HTMLDivElement)
    props(lineRow(FIRST)).onStart()
    props(lineRow(FIRST)).onDraftChange('아, 또 먹었어?')
    props(lineRow(FIRST)).onCommit('blur')
    commit()
    expect(saves.calls).toHaveLength(1)
    expect(box.focus).not.toHaveBeenCalled()
  })

  // 왜(혼자 정한 것): 화자 바꾸기 · 줄 더하기 · 빼기는 샷 고치기 창에 있다(프로토타입 대본 보기의 ✎) — 대사가 없는 샷도 여기서 대사를 더한다.
  it('샷마다 연필 단추가 있고 누르면 그 샷 고치기 창이 열린다', () => {
    const pencils = render().filter((node) => typeof node.props.onClick === 'function' && /고치기 창 열기$/.test(String(node.props['aria-label'] ?? '')))
    expect(pencils.map((node) => node.props['aria-label'])).toEqual(['샷 1 고치기 창 열기', '샷 2 고치기 창 열기'])
    ;(pencils[1].props.onClick as () => void)()
    expect(useBoardUiStore.getState().shotEditId).toBe('sh_01_02')
  })
})
