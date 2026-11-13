// Editor 를 나갔다 다시 들어와도 타임라인에서 지운 클립 · 자른 클립이 고친 그대로인지 검사한다 (오너 2026-11-10 "수정하면 수정 내역 없어지는데")
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useEditorStore } from '@/stores/editor-store'
import { useProjectStore } from '@/stores/project-store'
import type { PersistedEditor } from '@/lib/editor-persistence'
import type { Shot, VideoClip } from '@/types'

const PROJECT_ID = 'proj-reopen-test'
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
  return { shotId, url: `https://media.example/${shotId}.mp4`, status: 'completed', thumbnailUrl: null, ...patch } as VideoClip
}
function saved(overrides: Partial<PersistedEditor>): PersistedEditor {
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
/** loadData 가 DB 에서 다시 만든 모습(원본 샷만, 구간은 DB 값). */
function canonical(ids: string[]) {
  useEditorStore.setState({
    shots: ids.map((id) => shot(id)),
    videoClips: ids.map((id) => clip(id)),
    clipOrder: { sc_01: [...ids] },
  })
}

beforeEach(() => {
  vi.stubGlobal('window', {})
  localStorage.clear()
  useProjectStore.setState({ projectId: PROJECT_ID })
  useEditorStore.getState().reset()
})
afterEach(() => {
  vi.unstubAllGlobals()
  localStorage.clear()
})

describe('다시 들어와도 지운 클립은 지운 그대로다', () => {
  it('다시 들어와도 타임라인에서 지운 클립은 되살아나지 않는다', async () => {
    // 왜: 예전에는 다시 열 때 저장한 순서에 없는 원본 샷을 모두 "새로 생긴 샷"으로 보고 씬 끝에 붙여, 지운 클립이 되살아났다.
    //   고장: 클립을 지우고 다른 단계에 다녀오거나 새로고침할 때(2026-11-10 개발 DB 재현).
    canonical(['sh_01_01', 'sh_01_02', 'sh_01_03'])
    localStorage.setItem(LS_KEY, JSON.stringify(saved({
      shots: [shot('sh_01_01'), shot('sh_01_02'), shot('sh_01_03')],
      videoClips: [clip('sh_01_01'), clip('sh_01_02'), clip('sh_01_03')],
      clipOrder: { sc_01: ['sh_01_01', 'sh_01_03'] },
    })))
    await useEditorStore.getState().loadPersisted()
    expect(useEditorStore.getState().clipOrder.sc_01).toEqual(['sh_01_01', 'sh_01_03'])
  })

  it('저장한 뒤에 새로 생긴 샷은 다시 들어오면 씬 끝에 붙는다', async () => {
    // 왜: 정상 경로 고정 — Director 에서 샷을 더 만든 뒤 Editor 에 오면 새 샷이 타임라인에 들어온다.
    canonical(['sh_01_01', 'sh_01_02', 'sh_01_04'])
    localStorage.setItem(LS_KEY, JSON.stringify(saved({
      shots: [shot('sh_01_01'), shot('sh_01_02')],
      videoClips: [clip('sh_01_01'), clip('sh_01_02')],
      clipOrder: { sc_01: ['sh_01_02', 'sh_01_01'] },
    })))
    await useEditorStore.getState().loadPersisted()
    expect(useEditorStore.getState().clipOrder.sc_01).toEqual(['sh_01_02', 'sh_01_01', 'sh_01_04'])
  })
})

describe('다시 들어와도 자른 클립은 자른 그대로다', () => {
  it('클립을 자른 뒤 다시 들어와도 앞 조각은 자른 길이 그대로다', async () => {
    // 왜: 자르기는 앞 조각(원본 샷)의 끝을 바꾸지만 그 값은 DB 에 쓰지 않아, 다시 열면 앞 조각이 원래 길이로 돌아가 뒷조각과 겹쳤다.
    //   고장: 클립을 자르고 다른 단계에 다녀오거나 새로고침할 때(2026-11-10 개발 DB 재현).
    canonical(['sh_01_01', 'sh_01_02'])
    localStorage.setItem(LS_KEY, JSON.stringify(saved({
      shots: [shot('sh_01_01'), shot('sh_01_01__cab12'), shot('sh_01_02')],
      videoClips: [clip('sh_01_01', { trimStart: 0, trimEnd: 2.5 }), clip('sh_01_01__cab12', { trimStart: 2.5, trimEnd: 6 }), clip('sh_01_02')],
      clipOrder: { sc_01: ['sh_01_01', 'sh_01_01__cab12', 'sh_01_02'] },
    })))
    await useEditorStore.getState().loadPersisted()
    const st = useEditorStore.getState()
    expect(st.clipOrder.sc_01).toEqual(['sh_01_01', 'sh_01_01__cab12', 'sh_01_02'])
    expect(st.videoClips.find((c) => c.shotId === 'sh_01_01')).toMatchObject({ trimStart: 0, trimEnd: 2.5 })
    expect(st.videoClips.find((c) => c.shotId === 'sh_01_01__cab12')).toMatchObject({ trimStart: 2.5, trimEnd: 6 })
  })

  it('자른 조각을 또 잘라도 다시 들어오면 세 조각이 그대로다', async () => {
    // 왜: 자른 뒷조각을 또 자르면 조각 이름이 두 겹이 되는데, 예전에는 그 원본을 찾지 못해 다시 열 때 셋째 조각을 버렸다.
    canonical(['sh_01_01'])
    localStorage.setItem(LS_KEY, JSON.stringify(saved({
      shots: [shot('sh_01_01'), shot('sh_01_01__cab12'), shot('sh_01_01__cab12__ccd34')],
      videoClips: [
        clip('sh_01_01', { trimStart: 0, trimEnd: 2 }),
        clip('sh_01_01__cab12', { trimStart: 2, trimEnd: 4 }),
        clip('sh_01_01__cab12__ccd34', { trimStart: 4, trimEnd: 6 }),
      ],
      clipOrder: { sc_01: ['sh_01_01', 'sh_01_01__cab12', 'sh_01_01__cab12__ccd34'] },
    })))
    await useEditorStore.getState().loadPersisted()
    const st = useEditorStore.getState()
    expect(st.clipOrder.sc_01).toEqual(['sh_01_01', 'sh_01_01__cab12', 'sh_01_01__cab12__ccd34'])
    expect(st.videoClips.find((c) => c.shotId === 'sh_01_01')).toMatchObject({ trimEnd: 2 })
    expect(st.videoClips.find((c) => c.shotId === 'sh_01_01__cab12__ccd34')).toMatchObject({ trimStart: 4, trimEnd: 6, url: 'https://media.example/sh_01_01.mp4' })
  })
})

describe('다시 들어와도 넣은 전환은 그대로다', () => {
  it('원본 클립에 넣은 디졸브도 다시 들어오면 그대로 남는다', async () => {
    // 왜: 다시 열 때 잘라 낸 조각 · 타이틀 카드의 디졸브만 되살리고 원본 클립의 디졸브는 버렸다 — 약속 "디졸브는 … 새로고침해도 남는다"가
    //   원본 클립에서는 지켜지지 않았다. 고장: 원본 클립에 디졸브를 넣고 다른 단계에 다녀오거나 새로고침할 때(2026-11-14 E2b 시험 중 발견).
    canonical(['sh_01_01', 'sh_01_02'])
    localStorage.setItem(LS_KEY, JSON.stringify(saved({
      shots: [shot('sh_01_01'), shot('sh_01_02')],
      videoClips: [clip('sh_01_01'), clip('sh_01_02', { transitionIn: { type: 'dissolve', durationSec: 2 } })],
      clipOrder: { sc_01: ['sh_01_01', 'sh_01_02'] },
    })))
    await useEditorStore.getState().loadPersisted()
    const st = useEditorStore.getState()
    expect(st.videoClips.find((c) => c.shotId === 'sh_01_02')?.transitionIn).toEqual({ type: 'dissolve', durationSec: 2 })
    expect(st.videoClips.find((c) => c.shotId === 'sh_01_01')?.transitionIn ?? null).toBeNull()
  })
})
