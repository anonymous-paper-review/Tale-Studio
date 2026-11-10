// Editor 에서 영상 클립을 숨기거나 자르거나 옮기면 그 샷의 소리도 같이 움직이고, 소리 조각을 직접 만질 때만 영상에서 떨어지는지 검사한다 (오너 2026-11-10 결정 4 "같이 움직인다 — 따로 떼고 싶을 때만 나눈다")
import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { selectTimelineLayout, useEditorStore } from '@/stores/editor-store'
import { useProjectStore } from '@/stores/project-store'
import { finishEditorOpen } from '@/features/editor/open-editor'
import type { PersistedEditor } from '@/lib/editor-persistence'
import type { AudioTrackClip, Shot, VideoClip } from '@/types'

const read = (file: string) => readFileSync(file, 'utf8')
const api = () => useEditorStore.getState()
const PROJECT_ID = 'proj-audio-link'

function shot(shotId: string, durationSeconds = 5): Shot {
  return {
    shotId, sceneId: 'sc_01', shotType: 'MS', actionDescription: shotId, characters: [], durationSeconds,
    generationMethod: 'I2V', dialogueLines: [], camera: {} as Shot['camera'], lighting: {} as Shot['lighting'], referenceImageUrl: null,
  } as Shot
}
function clip(shotId: string, patch: Partial<VideoClip> = {}): VideoClip {
  return { shotId, url: `https://video.test/${shotId}.mp4`, status: 'completed', thumbnailUrl: null, ...patch }
}
/** 5초 영상 셋과, 처음 열 때처럼 영상마다 이어 놓은 소리 셋. 소리 id 를 샷 이름으로 돌려준다. */
function seed() {
  api().reset()
  useEditorStore.setState({
    shots: [shot('sh_1'), shot('sh_2'), shot('sh_3')],
    videoClips: [clip('sh_1'), clip('sh_2'), clip('sh_3')],
    clipOrder: { sc_01: ['sh_1', 'sh_2', 'sh_3'] },
    selectedSceneId: 'sc_01',
    loadStatus: 'ready',
  })
  const ids: Record<string, string> = {}
  for (const item of selectTimelineLayout(api())) {
    ids[item.shotId] = api().addAudioClip({
      name: `${item.shotId} audio`, url: `https://video.test/${item.shotId}.mp4`, startSec: item.startSec, durationSec: item.durationSec,
      peaks: [0.5], sourceOffsetSec: 0, sourceDurationSec: 5, trackId: 'atrack_1', linkedShotId: item.shotId,
    })
  }
  useEditorStore.setState({ past: [], future: [] })
  return ids
}
const audio = (id: string) => api().audioClips.find((a) => a.id === id)
const linkedTo = (shotId: string) => api().audioClips.filter((a) => a.linkedShotId === shotId)

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 })))
  useProjectStore.setState({ projectId: PROJECT_ID })
})
afterEach(() => {
  vi.unstubAllGlobals()
  localStorage.clear()
})

describe('영상을 고치면 그 샷의 소리도 같이 움직인다', () => {
  it('처음 열 때 나누어 놓은 소리는 저마다 그 영상 클립에 이어진다', async () => {
    // 왜: 정상 경로 고정 — 이어져 있어야 뒤에서 영상을 고칠 때 소리가 따라온다. 처음 Editor 에 들어올 때마다 일어난다.
    api().reset()
    useEditorStore.setState({ shots: [shot('sh_1'), shot('sh_2')], videoClips: [clip('sh_1'), clip('sh_2')], clipOrder: { sc_01: ['sh_1', 'sh_2'] }, loadStatus: 'ready' })
    await finishEditorOpen({
      projectId: PROJECT_ID, restored: false, isCancelled: () => false, audioName: () => 'audio',
      measureClips: async () => {}, decodeAudio: async () => ({ durationSec: 5, peaks: [0.5] }),
    })
    expect(api().audioClips.map((a) => [a.linkedShotId, a.startSec])).toEqual([['sh_1', 0], ['sh_2', 5]])
  })

  it('영상 클립을 숨기면 그 샷의 소리도 같이 빠지고, 뒤 샷의 소리는 영상처럼 앞으로 당겨진다', () => {
    // 왜: 예전에는 영상만 당겨지고 소리는 제자리라, 숨긴 샷 소리가 남고 뒤 소리가 어긋났다 — 내보낸 영상에서 샷 3 · 4 · 5 소리가 그림보다 5.8초 늦었다(11/10 점검 L1#4).
    const ids = seed()
    api().deleteClip('sh_2')
    expect(audio(ids.sh_2)).toBeUndefined()
    expect(audio(ids.sh_3)?.startSec).toBe(5)
    // 여러 클립을 한꺼번에 숨겨도 같다.
    const again = seed()
    api().setClipSelection(['sh_1', 'sh_2'])
    api().deleteSelectedClips()
    expect(api().audioClips.map((a) => a.id)).toEqual([again.sh_3])
    expect(audio(again.sh_3)?.startSec).toBe(0)
  })

  it('영상 클립의 앞 · 뒤를 자르면 그 샷의 소리도 같은 구간으로 잘리고, 뒤 샷의 소리는 영상을 따라 움직인다', () => {
    // 왜: 점검 재현 — 첫 클립 끝을 6초 → 4.4초로 끌었더니 영상 줄만 당겨지고 소리 줄은 그대로였다.
    const ids = seed()
    api().setTrim('sh_1', 1, 4.4)
    expect(audio(ids.sh_1)).toMatchObject({ startSec: 0, sourceOffsetSec: 1 })
    expect(audio(ids.sh_1)?.durationSec).toBeCloseTo(3.4, 5)
    expect(audio(ids.sh_2)?.startSec).toBeCloseTo(3.4, 5)
    expect(audio(ids.sh_3)?.startSec).toBeCloseTo(8.4, 5)
    // 손잡이를 끄는 동안(놓기 전)에도 소리가 따라온다.
    api().updateVideoClip('sh_2', { trimEnd: 4 })
    expect(audio(ids.sh_2)?.durationSec).toBe(4)
    expect(audio(ids.sh_3)?.startSec).toBeCloseTo(7.4, 5)
  })

  it('영상 클립 순서를 바꾸면 그 샷의 소리도 클립을 따라 옮겨진다', () => {
    // 왜: 끌어서 순서를 바꾸면 소리가 다른 샷 그림 아래에 남았다.
    const ids = seed()
    api().moveClipToIndex('sh_3', 0)
    expect([audio(ids.sh_3)?.startSec, audio(ids.sh_1)?.startSec, audio(ids.sh_2)?.startSec]).toEqual([0, 5, 10])
  })

  it('영상 속도를 바꾸면 그 샷의 소리도 같은 빠르기로 재생되고, 길이와 뒤 샷 소리 자리도 따라간다', () => {
    // 왜: 속도를 바꾸면 영상 길이가 달라져 뒤 샷 소리가 어긋나고, 그 샷 소리는 그림과 다른 빠르기로 났다.
    const ids = seed()
    api().setSpeed('sh_1', 2)
    expect(audio(ids.sh_1)).toMatchObject({ startSec: 0, durationSec: 2.5, playbackRate: 2 })
    expect(audio(ids.sh_2)?.startSec).toBe(2.5)
    // 미리 보기 · 내보내기는 소리 조각의 빠르기로 재생하고, 원본에서 그만큼 빨리 나아간다.
    expect(read('src/features/editor/audio-meter.tsx')).toMatch(/const srcTime = local \* rate \+ \(clip\.sourceOffsetSec \?\? 0\)/)
    expect(read('src/features/editor/audio-meter.tsx')).toMatch(/entry\.el\.playbackRate = rate/)
    expect(read('src/lib/editor-draft-render.ts')).toMatch(/a\.el\.currentTime = \(a\.clip\.sourceOffsetSec \?\? 0\) \+ \(clock - a\.clip\.startSec\) \* a\.rate/)
    expect(read('src/lib/editor-draft-render.ts')).toMatch(/el\.playbackRate = rate/)
  })

  it('자르기 도구로 영상 클립을 둘로 나누면 소리도 같은 자리에서 둘로 나뉘어 각 조각을 따라간다', () => {
    // 왜: 자른 뒷조각에는 소리가 없고, 앞 조각 소리가 원래 길이로 남아 뒷조각 그림 아래까지 이어졌다.
    const ids = seed()
    api().splitVideoClipAt('sh_1', 2)
    const piece = api().clipOrder.sc_01[1]
    expect(audio(ids.sh_1)).toMatchObject({ startSec: 0, durationSec: 2, sourceOffsetSec: 0 })
    expect(linkedTo(piece)).toHaveLength(1)
    expect(linkedTo(piece)[0]).toMatchObject({ startSec: 2, durationSec: 3, sourceOffsetSec: 2, url: 'https://video.test/sh_1.mp4' })
    // 뒷조각을 숨기면 그 소리만 빠지고 뒤 샷 소리가 당겨진다.
    api().deleteClip(piece)
    expect(linkedTo(piece)).toHaveLength(0)
    expect(audio(ids.sh_2)?.startSec).toBe(2)
  })

  it('타이틀 카드를 끼우면 뒤 샷의 소리는 카드 길이만큼 영상과 함께 밀리고, 앞 샷의 소리는 그대로다', () => {
    // 왜: 정상 경로 고정(9/8 오너 지시 1번 "오디오도 영상처럼 밀린다") — 이어진 소리는 이제 그 클립을 따라 밀린다.
    const ids = seed()
    api().addTitleCard(5)
    expect(audio(ids.sh_1)?.startSec).toBe(0)
    expect(audio(ids.sh_2)?.startSec).toBe(10)
    expect(audio(ids.sh_3)?.startSec).toBe(15)
  })

  it('되돌리기 한 번이면 영상과, 영상을 따라 움직인 소리가 함께 되돌아간다', () => {
    // 왜: 영상만 되돌아가고 소리가 따로 남으면 다시 어긋난다. 고장: 숨기기 · 자르기 뒤 되돌릴 때.
    const ids = seed()
    api().deleteClip('sh_2')
    api().undo()
    expect(api().clipOrder.sc_01).toEqual(['sh_1', 'sh_2', 'sh_3'])
    expect([audio(ids.sh_2)?.startSec, audio(ids.sh_3)?.startSec]).toEqual([5, 10])
  })

  it('내보내기는 숨긴 샷의 소리를 넣지 않고, 뒤 샷의 소리를 그림이 시작하는 자리에서 넣는다', () => {
    // 왜: 11/10 점검 — 샷 2 를 숨기고 내보낸 파일에서 숨긴 샷 소리가 4.4초부터 6초 동안 남고, 뒤 샷 소리가 그림보다 5.8 · 5.8 · 5.9초 늦었다.
    //   내보내기는 편집 상태의 소리 조각을 각자 자리에서 재생한다 — 그 자리를 영상에 맞춰 두면 내보낸 파일도 맞는다.
    const ids = seed()
    api().deleteClip('sh_2')
    const layout = selectTimelineLayout(api())
    const pictureStart = layout.find((l) => l.shotId === 'sh_3')?.startSec
    expect(api().audioClips.map((a) => a.id)).not.toContain(ids.sh_2)
    expect(audio(ids.sh_3)?.startSec).toBe(pictureStart)
    expect(read('src/lib/editor-draft-render.ts')).toMatch(/audioClips\.filter\(/)
  })
})

describe('소리 조각을 직접 만질 때만 영상에서 떨어진다', () => {
  it('소리 조각을 직접 끌어 옮기면 그 소리는 영상에서 떨어져, 그 뒤 영상을 고쳐도 옮긴 자리에 그대로 있다', () => {
    // 왜: 오너가 고른 답 "따로 떼고 싶을 때만 나눈다" — 사람이 소리를 직접 옮긴 자리는 지킨다.
    const ids = seed()
    api().moveAudioClip(ids.sh_2, 12)
    expect(audio(ids.sh_2)?.linkedShotId).toBeNull()
    api().deleteClip('sh_1')
    expect(audio(ids.sh_2)?.startSec).toBe(12)
    expect(audio(ids.sh_3)?.startSec).toBe(5)
  })

  it('소리 조각을 직접 자르거나 앞 · 뒤를 끌어 줄이면 그 소리도 영상에서 떨어진다', () => {
    // 왜: 사람이 소리 구간을 직접 고른 뒤 영상을 고쳤다고 그 구간이 바뀌면 안 된다.
    const ids = seed()
    api().splitAudioClipAt(ids.sh_1, 2)
    expect(api().audioClips.filter((a) => a.url === 'https://video.test/sh_1.mp4').map((a) => a.linkedShotId)).toEqual([null, null])
    api().updateAudioClip(ids.sh_2, { durationSec: 3 })
    expect(audio(ids.sh_2)?.linkedShotId).toBeNull()
    api().setTrim('sh_1', 0, 4)
    expect(audio(ids.sh_2)).toMatchObject({ startSec: 5, durationSec: 3 })
    expect(audio(ids.sh_3)?.startSec).toBe(9)
  })

  it('소리 조각을 누르기만 하거나 같은 자리에 놓거나 음량만 바꾸면 영상에서 떨어지지 않는다', () => {
    // 왜: 고르려고 누르거나 끌다가 제자리에 놓은 것, 음량 조절은 떼려는 것이 아니다. 고장: 소리를 고르다 살짝 끈 때.
    const ids = seed()
    api().moveAudioClip(ids.sh_2, 5)
    api().setAudioVolume(ids.sh_2, 0.4)
    api().toggleAudioMute(ids.sh_2)
    api().updateAudioClip(ids.sh_2, { peaks: [0.9], sourceDurationSec: 5 })
    expect(audio(ids.sh_2)?.linkedShotId).toBe('sh_2')
    api().deleteClip('sh_1')
    expect(audio(ids.sh_2)?.startSec).toBe(0)
  })
})

describe('다시 열 때 · 새로 더할 때', () => {
  it('이미 나눠 둔 프로젝트를 다시 열면 영상과 자리가 맞는 소리(같은 파일 · 같은 시작 · 같은 길이)만 잇고, 어긋난 소리는 옮기지 않는다', async () => {
    // 왜: 이번 고침 전에 저장한 편집에는 이음 칸이 없다. 이미 어긋난 소리를 몰래 옮기면 사람이 맞춘 자리일 수도 있는 것을 바꾼다.
    //   고장 재현 모양: 샷 2 를 숨겨 영상은 당겨졌는데 샷 3 소리가 10초에 남은 저장본(11/10 점검 C01).
    vi.stubGlobal('window', {})
    api().reset()
    useEditorStore.setState({ shots: [shot('sh_1'), shot('sh_2'), shot('sh_3')], videoClips: [clip('sh_1'), clip('sh_2'), clip('sh_3')], clipOrder: { sc_01: ['sh_1', 'sh_2', 'sh_3'] } })
    const old = (name: string, startSec: number): AudioTrackClip => ({ id: `a_${name}`, name, url: `https://video.test/${name}.mp4`, startSec, durationSec: 5, peaks: [0.5], sourceOffsetSec: 0, sourceDurationSec: 5, volume: 1, muted: false, trackId: 'atrack_1' })
    const saved: PersistedEditor = {
      version: 1,
      shots: [shot('sh_1'), shot('sh_2'), shot('sh_3')],
      clipOrder: { sc_01: ['sh_1', 'sh_3'] },
      videoClips: [clip('sh_1'), clip('sh_2'), clip('sh_3')],
      audioClips: [old('sh_1', 0), old('sh_2', 5), old('sh_3', 10)],
      audioSources: [],
      audioTracks: [{ id: 'atrack_1' }],
      panelSizes: { sourceW: 260, previewH: 240 },
    }
    localStorage.setItem(`tale:editor:v1:${PROJECT_ID}`, JSON.stringify(saved))
    expect(await api().loadPersisted()).toBe(true)
    expect(audio('a_sh_1')).toMatchObject({ linkedShotId: 'sh_1', startSec: 0 })
    expect(audio('a_sh_3')).toMatchObject({ linkedShotId: null, startSec: 10 })
    expect(audio('a_sh_2')).toMatchObject({ linkedShotId: null, startSec: 5 })
    // 이은 소리만 영상을 따라간다.
    api().setTrim('sh_1', 0, 4)
    expect(audio('a_sh_1')?.durationSec).toBe(4)
    expect(audio('a_sh_3')?.startSec).toBe(10)
  })

  it('다시 열어 영상 실제 길이를 재어 계획보다 짧으면, 이어진 소리도 그 길이로 맞춰지고 뒤 소리가 당겨진다', () => {
    // 왜: 영상은 실제 길이로 줄어드는데 소리가 계획 길이로 남으면 뒤 샷 소리가 밀린다. 고장: 영상이 계획보다 짧게 나온 프로젝트.
    const ids = seed()
    api().updateVideoClip('sh_1', { actualDurationSec: 4 })
    expect(audio(ids.sh_1)?.durationSec).toBe(4)
    expect(audio(ids.sh_2)?.startSec).toBe(4)
  })

  it('소스 칸에서 끌어 놓거나 플레이헤드에 더한 영상 클립에 따라 붙는 소리도 그 클립에 이어진다', () => {
    // 왜: 새로 더한 클립의 소리가 이어져 있지 않으면 그 클립을 옮기거나 숨길 때 소리만 남는다.
    seed()
    const instance = api().addClipInstanceAt('sh_1', 15)
    expect(instance).toMatch(/^sh_1__i/)
    const id = api().addAudioClip({ name: 'copy', url: 'https://video.test/sh_1.mp4', startSec: 0, durationSec: 1, linkedShotId: instance })
    expect(audio(id)).toMatchObject({ startSec: 15, durationSec: 5 })
    api().deleteClip(instance as string)
    expect(audio(id)).toBeUndefined()
    // 화면: 끌어 놓기 · 플레이헤드에 더하기 모두 새 클립 id 에 소리를 잇는다.
    const page = read('src/app/studio/editor/page.tsx')
    expect(page).toMatch(/const instanceId = addClipInstanceAt\(shotId, atSec\)\s*if \(instanceId\) void attachVideoAudio\(shotId, instanceId\)/)
    expect(page).toMatch(/if \(item\) void attachVideoAudio\(shotId, item\.shotId\)/)
    expect(page).toMatch(/linkedShotId: linkTo/)
  })
})
