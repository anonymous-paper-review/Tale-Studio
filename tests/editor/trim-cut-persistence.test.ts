import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useEditorStore, isSyntheticShotId, baseShotIdOf } from '@/stores/editor-store'
import { useProjectStore } from '@/stores/project-store'
import type { PersistedEditor } from '@/lib/editor-persistence'
import type { Shot, VideoClip } from '@/types'

// #a3-state-loss (2026-08-26) — "컷/트림 해놓고 다른 탭 다녀오면 원복" 재현(evidence/a3-0*.png)의 회귀 잠금.
//   컷 조각(__c)·드래그 인스턴스(__i)는 DB shots 에 행이 없어 loadData 재구성에서 증발했고,
//   loadPersisted 는 shots/videoClips 를 의도적으로 복원하지 않았다(삭제 부활 방지).
//   수리: base 샷이 canonical 에 살아있는 조각만 editor_states 스냅샷에서 복원 + 트림은 DB write-through.

const PROJECT_ID = 'proj-a3-test'
const LS_KEY = `tale:editor:v1:${PROJECT_ID}`

function shot(shotId: string, sceneId = 'sc_01', durationSeconds = 6): Shot {
  return {
    shotId,
    sceneId,
    shotType: 'MCU',
    actionDescription: '',
    characters: [],
    durationSeconds,
    generationMethod: 'I2V',
    dialogueLines: [],
    camera: {},
    lighting: {},
    referenceImageUrl: null,
  } as unknown as Shot
}

function clip(shotId: string, patch: Partial<VideoClip> = {}): VideoClip {
  return {
    shotId,
    url: `https://media.example/${shotId}.mp4`,
    status: 'completed',
    thumbnailUrl: null,
    ...patch,
  } as VideoClip
}

function persistedSnapshot(overrides: Partial<PersistedEditor>): PersistedEditor {
  return {
    version: 1,
    shots: [],
    clipOrder: {},
    videoClips: [],
    audioClips: [],
    audioSources: [],
    audioTracks: [{ id: 'atrack_1' }],
    panelSizes: { sourceW: 260, previewH: 240 },
    ...overrides,
  }
}

beforeEach(() => {
  vi.stubGlobal('window', {})
  localStorage.clear()
  useProjectStore.setState({ projectId: PROJECT_ID })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  localStorage.clear()
})

describe('synthetic shot id helpers', () => {
  it('classifies cut pieces and drag instances', () => {
    expect(isSyntheticShotId('sh_01_02__cab12cd34')).toBe(true)
    expect(isSyntheticShotId('sh_01_02__i99ffee00')).toBe(true)
    expect(isSyntheticShotId('sh_01_02')).toBe(false)
    expect(baseShotIdOf('sh_01_02__cab12cd34')).toBe('sh_01_02')
    expect(baseShotIdOf('sh_01_02')).toBe('sh_01_02')
  })
})

describe('loadPersisted synthetic piece restore', () => {
  it('restores a cut piece whose base shot is canonical, replaying the base clip current url', async () => {
    // canonical state as loadData would leave it (base shot only, fresh url after regen)
    useEditorStore.setState({
      shots: [shot('sh_01_02')],
      videoClips: [clip('sh_01_02', { url: 'https://media.example/regenerated.mp4' })],
      clipOrder: { sc_01: ['sh_01_02'] },
    })
    localStorage.setItem(
      LS_KEY,
      JSON.stringify(
        persistedSnapshot({
          shots: [shot('sh_01_02'), shot('sh_01_02__cdeadbeef')],
          videoClips: [
            clip('sh_01_02', { trimStart: 0, trimEnd: 3.2 }),
            clip('sh_01_02__cdeadbeef', { url: 'https://media.example/stale.mp4', trimStart: 3.2, trimEnd: 6 }),
          ],
          clipOrder: { sc_01: ['sh_01_02', 'sh_01_02__cdeadbeef'] },
        }),
      ),
    )

    await useEditorStore.getState().loadPersisted()

    const state = useEditorStore.getState()
    const restored = state.videoClips.find((c) => c.shotId === 'sh_01_02__cdeadbeef')
    expect(state.shots.map((s) => s.shotId)).toContain('sh_01_02__cdeadbeef')
    expect(restored).toBeDefined()
    // piece keeps its trim window but follows the base clip's *current* media
    expect(restored?.trimStart).toBe(3.2)
    expect(restored?.trimEnd).toBe(6)
    expect(restored?.url).toBe('https://media.example/regenerated.mp4')
    expect(state.clipOrder.sc_01).toEqual(['sh_01_02', 'sh_01_02__cdeadbeef'])
  })

  it('drops a piece whose base shot no longer exists (deleted media must not resurrect)', async () => {
    useEditorStore.setState({
      shots: [shot('sh_01_05')],
      videoClips: [clip('sh_01_05')],
      clipOrder: { sc_01: ['sh_01_05'] },
    })
    localStorage.setItem(
      LS_KEY,
      JSON.stringify(
        persistedSnapshot({
          shots: [shot('sh_01_09__c11223344')],
          videoClips: [clip('sh_01_09__c11223344', { trimStart: 1, trimEnd: 2 })],
          clipOrder: { sc_01: ['sh_01_05', 'sh_01_09__c11223344'] },
        }),
      ),
    )

    await useEditorStore.getState().loadPersisted()

    const state = useEditorStore.getState()
    expect(state.shots.map((s) => s.shotId)).toEqual(['sh_01_05'])
    expect(state.videoClips.map((c) => c.shotId)).toEqual(['sh_01_05'])
    expect(state.clipOrder.sc_01).toEqual(['sh_01_05'])
  })
})

describe('setTrim write-through', () => {
  it('updates the clip locally and persists canonical trims to /api/editor/trim (debounced)', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    useEditorStore.setState({
      shots: [shot('sh_02_03')],
      videoClips: [clip('sh_02_03')],
      clipOrder: { sc_02: ['sh_02_03'] },
    })

    useEditorStore.getState().setTrim('sh_02_03', 1.25, 4.5)

    const local = useEditorStore.getState().videoClips.find((c) => c.shotId === 'sh_02_03')
    expect(local?.trimStart).toBe(1.25)
    expect(local?.trimEnd).toBe(4.5)
    expect(fetchMock).not.toHaveBeenCalled() // debounce pending

    await vi.advanceTimersByTimeAsync(350)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/editor/trim')
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      projectId: PROJECT_ID,
      shotId: 'sh_02_03',
      trimStart: 1.25,
      trimEnd: 4.5,
    })
    vi.useRealTimers()
  })

  it('never sends synthetic piece trims to the shots table route', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    useEditorStore.setState({
      shots: [shot('sh_02_03'), shot('sh_02_03__c55667788')],
      videoClips: [clip('sh_02_03'), clip('sh_02_03__c55667788')],
      clipOrder: { sc_02: ['sh_02_03', 'sh_02_03__c55667788'] },
    })

    useEditorStore.getState().setTrim('sh_02_03__c55667788', 2, 5)

    const local = useEditorStore
      .getState()
      .videoClips.find((c) => c.shotId === 'sh_02_03__c55667788')
    expect(local?.trimStart).toBe(2)
    expect(local?.trimEnd).toBe(5)

    await vi.advanceTimersByTimeAsync(350)
    expect(fetchMock).not.toHaveBeenCalled()
    vi.useRealTimers()
  })

  it('rejects degenerate ranges', () => {
    useEditorStore.setState({
      shots: [shot('sh_02_04')],
      videoClips: [clip('sh_02_04', { trimStart: 1, trimEnd: 2 })],
      clipOrder: { sc_02: ['sh_02_04'] },
    })
    useEditorStore.getState().setTrim('sh_02_04', 3, 3) // end <= start → ignored
    const local = useEditorStore.getState().videoClips.find((c) => c.shotId === 'sh_02_04')
    expect(local?.trimStart).toBe(1)
    expect(local?.trimEnd).toBe(2)
  })
})
