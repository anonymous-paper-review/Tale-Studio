// Editor 영상 줄 여러 개(V1 · V2 · V3 …)와 줄 자물쇠 · 눈 · M · S — 클립을 다른 줄로 옮기고, 위 줄이 아래 줄을 가리며, 잠근 줄은 고칠 수 없고, 저장 · 다시 열기에도 그 줄 그 자리인지 검사한다 (2단계 ②, 시안 E1 · E3, 2026-11-14)
import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  ;(globalThis as { window?: unknown }).window = globalThis
  return { projectId: 'project-tracks' as string | null }
})
vi.mock('@/stores/project-store', () => ({
  useProjectStore: { getState: () => ({ projectId: mocks.projectId }) },
}))

import { saveEditorNow, selectProgramLayout, selectTimelineLayout, selectVideoLayout, useEditorStore } from '@/stores/editor-store'
import { audibleTrackIds, draftAudioClips } from '@/lib/editor-draft-render'
import type { PersistedEditor } from '@/lib/editor-persistence'
import type { AudioTrackClip, Shot, VideoClip } from '@/types'

const LOCAL_KEY = 'tale:editor:v1:project-tracks'
const api = () => useEditorStore.getState()
const read = (file: string) => readFileSync(file, 'utf8')
const shot = (shotId: string, durationSeconds = 4): Shot => ({ shotId, sceneId: 'sc_1', shotType: 'MS', actionDescription: '', characters: [], durationSeconds, generationMethod: 'T2V', dialogueLines: [], camera: {}, lighting: {}, referenceImageUrl: null }) as unknown as Shot
const clip = (shotId: string): VideoClip => ({ shotId, url: `https://video.test/${shotId}.mp4`, status: 'completed', thumbnailUrl: null })
const linked = (shotId: string, startSec: number): AudioTrackClip => ({
  id: `a_${shotId}`, name: `${shotId} audio`, url: `https://video.test/${shotId}.mp4`, startSec, durationSec: 4, volume: 1, muted: false,
  sourceOffsetSec: 0, sourceDurationSec: 4, trackId: 'atrack_1', linkedShotId: shotId,
})

/** A · B · C · D 네 샷(4초씩)을 V1 에 빈 곳 없이 깔고 소리를 잇는다. */
function seed(ids = ['A', 'B', 'C', 'D']) {
  api().reset()
  useEditorStore.setState({
    shots: ids.map((id) => shot(id)),
    videoClips: ids.map((id) => clip(id)),
    clipOrder: { sc_1: [...ids] },
    audioClips: ids.map((id, i) => linked(id, i * 4)),
    selectedSceneId: 'sc_1',
    loadStatus: 'ready',
  })
}
/** loadData 가 DB 에서 다시 만든 모습 — 원본 샷만 V1 에. */
function canonical(ids = ['A', 'B', 'C', 'D']) {
  api().reset()
  useEditorStore.setState({ shots: ids.map((id) => shot(id)), videoClips: ids.map((id) => clip(id)), clipOrder: { sc_1: [...ids] }, loadStatus: 'ready' })
}
const v1 = () => selectTimelineLayout(api()).map((l) => [l.shotId, l.startSec])
const on = (trackId: string) => selectVideoLayout(api()).filter((l) => l.trackId === trackId).map((l) => [l.shotId, l.startSec, l.durationSec])
const program = () => selectProgramLayout(api()).map((l) => [l.shotId, l.startSec, l.startSec + l.durationSec, l.clipStartSec])
const audioAt = (shotId: string) => api().audioClips.find((a) => a.linkedShotId === shotId)?.startSec
const trackFlags = () => ({ v: api().videoTracks, a: api().audioTracks })

beforeEach(() => {
  localStorage.clear()
  mocks.projectId = 'project-tracks'
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 })))
  seed()
})
afterEach(() => {
  vi.unstubAllGlobals()
  ;(globalThis as { window?: unknown }).window = globalThis
  localStorage.clear()
})

describe('줄', () => {
  it('타임라인은 처음에 영상 줄 V1 · V2 · V3과 소리 줄 A1 · A2 · A3을 갖는다 — 예전 저장본을 열어도 빈 줄을 채운다', async () => {
    // 왜: 시안 E1 기본 배치(V3–V1 · A1–A3). 예전 저장본에는 영상 줄 칸이 없고 소리 줄이 하나뿐이다.
    expect(api().videoTracks.map((t) => t.id)).toEqual(['v1', 'v2', 'v3'])
    expect(api().audioTracks).toHaveLength(3)
    localStorage.setItem(LOCAL_KEY, JSON.stringify({
      version: 1, shots: ['A', 'B'].map((id) => shot(id)), clipOrder: { sc_1: ['A', 'B'] }, videoClips: ['A', 'B'].map(clip),
      audioClips: [], audioSources: [], audioTracks: [{ id: 'atrack_1' }], panelSizes: { sourceW: 560, previewH: 360 },
    }))
    canonical(['A', 'B'])
    await api().loadPersisted()
    expect(api().videoTracks.map((t) => t.id)).toEqual(['v1', 'v2', 'v3'])
    expect(api().audioTracks.map((t) => t.id)[0]).toBe('atrack_1')
    expect(api().audioTracks).toHaveLength(3)
  })

  it('[+ V 트랙]은 영상 줄을 하나 더하고, 줄을 지우면 그 줄 클립도 빠지며 되돌리기로 돌아온다 — V1 과 마지막 소리 줄은 지울 수 없다', () => {
    // 왜: 시안 E1 409:4800. 지금 소리 줄 지우기와 같은 규칙(클립도 함께 빠지고 되돌리기로 돌아온다).
    api().addVideoTrack()
    expect(api().videoTracks.map((t) => t.id)).toEqual(['v1', 'v2', 'v3', 'v4'])
    api().moveClipToTrack('B', 'v4', 10)
    api().removeVideoTrack('v4')
    expect(api().videoTracks.map((t) => t.id)).toEqual(['v1', 'v2', 'v3'])
    expect(selectVideoLayout(api()).some((l) => l.shotId === 'B')).toBe(false)
    api().undo()
    expect(on('v4')).toEqual([['B', 10, 4]])
    api().removeVideoTrack('v1')
    expect(api().videoTracks[0].id).toBe('v1')
  })
})

describe('클립을 다른 줄로', () => {
  it('V1 클립을 V2 로 옮기면 그 시각 그 줄에 놓이고 V1 의 원래 자리는 빈 곳으로 남는다 — 이어진 소리는 따라간다', () => {
    // 왜: 시안 E3 "샷을 V2 로 올리고 V1 에 배경". 빼기와 같이 원래 자리를 당기지 않는다(S3). 소리는 오너 결정 4.
    api().moveClipToTrack('B', 'v2', 10)
    expect(on('v2')).toEqual([['B', 10, 4]])
    expect(v1()).toEqual([['A', 0], ['C', 8], ['D', 12]])
    expect(audioAt('B')).toBe(10)
    expect(audioAt('C')).toBe(8)
  })

  it('V2 에 놓을 때 그 줄의 뒤 클립과 겹치면 겹치는 만큼 민다', () => {
    // 왜: 같은 줄의 클립은 겹치지 않는다 — V1 의 빈 곳에 놓기와 같은 규칙.
    api().moveClipToTrack('B', 'v2', 10)
    api().moveClipToTrack('C', 'v2', 8)
    expect(on('v2')).toEqual([['C', 8, 4], ['B', 12, 4]])
  })

  it('V2 클립을 V1 로 내리면 놓은 시각에 V1 에 놓이고 뒤 클립과 겹치면 민다', () => {
    // 왜: 끌어 놓은 자리가 곧 시각이다 — V1 의 빈 곳에 놓기와 같다.
    api().moveClipToTrack('B', 'v2', 20)
    api().moveClipToTrack('B', 'v1', 4)
    expect(on('v2')).toEqual([])
    expect(v1()).toEqual([['A', 0], ['B', 4], ['C', 8], ['D', 12]])
  })

  it('다른 줄에 올린 원본 샷도 저장하고 다시 열면 그 줄 그 자리에 놓이고, V1 에 또 들어오지 않는다', async () => {
    // 왜: 오너 답 1 "모든 클립이 줄 + 시작 초". 재검토 H2 · H3 처럼 V1 에 한 번 더 깔리면 안 된다.
    api().moveClipToTrack('B', 'v2', 10)
    await saveEditorNow('project-tracks')
    canonical()
    await api().loadPersisted()
    expect(on('v2')).toEqual([['B', 10, 4]])
    expect(v1()).toEqual([['A', 0], ['C', 8], ['D', 12]])
  })
})

describe('미리 보기 · 내보내기', () => {
  it('위 줄 클립이 가리는 동안 미리 보기와 내보내기는 위 줄 클립을 보이고, 끝나면 아래 줄 클립의 그 자리부터 이어진다', () => {
    // 왜: 시안 E3 — 위 줄이 아래 줄을 가린다. 아래 클립은 가려진 동안에도 시간이 흐른다(다시 보일 때 그 자리부터).
    api().moveClipToTrack('D', 'v2', 6)
    expect(program()).toEqual([['A', 0, 4, 0], ['B', 4, 6, 4], ['D', 6, 10, 6], ['C', 10, 12, 8]])
    expect(read('src/features/editor/video-previewer.tsx')).toMatch(/selectProgramLayout\(st\)/)
    expect(read('src/app/studio/editor/page.tsx')).toMatch(/const layout = selectProgramLayout\(st\)/)
  })

  it('눈을 끈 영상 줄은 미리 보기와 내보내기에서 빠진다', () => {
    // 왜: 시안 E1 줄 머리의 눈(G15 · H11) — 미리 보기에서만 빼면 내보낸 영상과 달라진다.
    api().moveClipToTrack('D', 'v2', 6)
    api().toggleTrackVisible('v2')
    expect(program()).toEqual([['A', 0, 4, 0], ['B', 4, 8, 4], ['C', 8, 12, 8]])
    api().toggleTrackVisible('v2')
    api().toggleTrackVisible('v1')
    expect(program()).toEqual([['D', 6, 10, 6]])
  })

  it('S 를 켠 소리 줄이 있으면 그 줄만 들리고, M 을 켠 줄은 들리지 않는다 — 내보내기도 같다', () => {
    // 왜: 시안 E1 줄 머리 M · S(G15 · H11). 재생과 내보내기가 같은 규칙을 쓴다.
    const tracks = [{ id: 'atrack_1' }, { id: 'atrack_2', solo: true }, { id: 'atrack_3', muted: true, solo: true }]
    expect([...audibleTrackIds(tracks)]).toEqual(['atrack_2'])
    expect([...audibleTrackIds([{ id: 'atrack_1' }, { id: 'atrack_2', muted: true }])]).toEqual(['atrack_1'])
    const clips = [linked('A', 0), { ...linked('B', 4), trackId: 'atrack_2' }]
    expect(draftAudioClips(clips, tracks).map((a) => a.id)).toEqual(['a_B'])
    expect(read('src/features/editor/audio-meter.tsx')).toMatch(/audibleTrackIds\(/)
  })
})

describe('자물쇠', () => {
  it('자물쇠를 잠근 줄의 클립은 옮기기 · 길이 · 빼기 · 놓기가 되지 않는다', () => {
    // 왜: 시안 E1 줄 머리의 자물쇠(G15 · H11) — 맞춰 둔 줄을 실수로 건드리지 않게. 재생 · 내보내기에는 그대로 나온다.
    api().moveClipToTrack('D', 'v2', 20)
    api().toggleTrackLock('v1')
    const before = JSON.stringify([v1(), on('v2'), api().videoClips])
    api().deleteClip('A')
    api().rippleDeleteClip('B')
    api().setTrim('A', 1, 4)
    api().setSpeed('C', 2)
    api().moveClipToTrack('A', 'v2', 30)
    api().moveClipToTrack('D', 'v1', 16)
    api().splitVideoClipAt('A', 2)
    expect(api().addClipInstanceAt('A', 2)).toBeNull()
    expect(JSON.stringify([v1(), on('v2'), api().videoClips])).toBe(before)
    expect(program()[0]).toEqual(['A', 0, 4, 0])
  })

  it('프로젝트 판에서 [타임라인에 추가]를 누르면 더한 새 클립에 그 샷 소리가 이어진다', () => {
    // 왜: 검토 c((B) 낮음) — 화면은 돌려받은 새 클립에만 소리를 잇는다. 돌려받지 못하면 소리가 말없이 안 붙는데, 화면 코드 글자 시험은
    //   그대로 통과한다. 정상 경로 고정.
    api().seek(1)
    const id = api().addClipAtPlayhead('C')
    expect(id).toMatch(/^C__i/)
    api().addAudioClip({ name: 'C audio', url: 'https://video.test/C.mp4', startSec: 0, durationSec: 1, linkedShotId: id })
    const placed = selectTimelineLayout(api()).find((l) => l.shotId === id)
    expect(api().audioClips.find((a) => a.linkedShotId === id)).toMatchObject({ startSec: placed?.startSec, durationSec: placed?.durationSec })
  })

  it('V1 을 잠근 채 프로젝트 판에서 [타임라인에 추가]를 누르면 영상도 소리도 들어가지 않는다', () => {
    // 왜: 검토 c(② 보통 2) — 영상은 막혔는데 화면이 지금 고른 V1 클립에 그 샷의 소리를 붙여, 소리가 둘 겹친 채 저장 · 내보내기까지 갔다.
    //   더한 클립이 있을 때만(새 클립 id) 그 클립에 소리를 잇는다.
    api().seek(1)
    api().toggleTrackLock('v1')
    expect(api().addClipAtPlayhead('C')).toBeNull()
    expect(read('src/app/studio/editor/page.tsx')).toMatch(/const id = addClipAtPlayhead\(shotId\)\s*if \(id\) void attachVideoAudio\(shotId, id\)/)
  })

  it('잠근 소리 줄의 조각은 앞 · 뒤를 끌어 줄여도 바뀌지 않는다 — 열 때 채우는 파형 · 원본 길이는 잠가도 채운다', () => {
    // 왜: 자물쇠는 사람이 그 줄을 고치지 못하게 한다(시안 E1 줄 머리). 파형 · 원본 길이 채우기는 사람 고침이 아니다 — 1단계 "끌어 줄이기는
    //   사람 고침"(de1113-set a643a806)과 합친 자리(리드 2026-11-14).
    api().toggleTrackLock('atrack_1')
    const before = api().audioClips.find((a) => a.id === 'a_A')
    api().updateAudioClip('a_A', { startSec: 1, durationSec: 3, sourceOffsetSec: 1 })
    expect(api().audioClips.find((a) => a.id === 'a_A')).toEqual(before)
    api().updateAudioClip('a_A', { peaks: [0.5, 0.2], sourceDurationSec: 4.2 })
    expect(api().audioClips.find((a) => a.id === 'a_A')).toMatchObject({ peaks: [0.5, 0.2], sourceDurationSec: 4.2, startSec: 0, durationSec: 4, linkedShotId: 'A' })
  })
})

describe('되돌리기와 줄 표시', () => {
  it('편집 뒤에 잠근 줄은 Ctrl+Z 를 눌러도 잠긴 채다 — 눈 · S · M 도 지금 값 그대로다', () => {
    // 왜: 검토 c(② 보통 1) — 되돌리기가 줄 자물쇠 · 눈 · S · M 까지 편집 전으로 되돌려, 잠갔다고 믿는 줄의 클립을 그대로 지울 수 있었다.
    //   줄 표시는 보기 설정이라 되돌리기 칸에 들어가지 않는다(저장 시험과 같은 약속) — 편집만 되돌리고 표시는 지금 값을 이어 붙인다.
    api().moveClipToTrack('B', 'v2', 10)
    api().toggleTrackLock('v1')
    api().toggleTrackVisible('v2')
    api().toggleAudioTrackSolo('atrack_2')
    api().toggleAudioTrackMute('atrack_3')
    const now = trackFlags()
    api().undo()
    expect(on('v2')).toEqual([])
    expect(trackFlags()).toEqual(now)
    api().deleteClip('A')
    expect(v1()[0]).toEqual(['A', 0])
    api().redo()
    expect(on('v2')).toEqual([['B', 10, 4]])
    expect(trackFlags()).toEqual(now)
  })

  it('편집 뒤에 푼 자물쇠는 Ctrl+Z 를 눌러도 다시 잠기지 않는다', () => {
    // 왜: 검토 c(② 보통 1, R1b) — 거꾸로도 같다. 풀어 둔 줄이 되돌리기로 몰래 잠기면 왜 안 고쳐지는지 모른다.
    api().toggleTrackLock('v2')
    api().moveClipToTrack('B', 'v3', 10)
    api().toggleTrackLock('v2')
    api().undo()
    expect(api().videoTracks.find((t) => t.id === 'v2')?.locked).toBeFalsy()
  })

  it('지운 줄을 Ctrl+Z 로 되살리면 지울 때의 눈 · 자물쇠 그대로 돌아오고, 더한 줄은 Ctrl+Z 로 없어진다', () => {
    // 왜: 줄을 더하고 지우는 것(줄 목록)은 편집이라 되돌린다 — 지금 없는 줄은 지울 때 모습으로 돌아온다.
    api().toggleTrackVisible('v3')
    api().removeVideoTrack('v3')
    api().undo()
    expect(api().videoTracks.find((t) => t.id === 'v3')).toEqual({ id: 'v3', hidden: true })
    api().addVideoTrack()
    api().undo()
    expect(api().videoTracks.map((t) => t.id)).toEqual(['v1', 'v2', 'v3'])
  })
})

describe('V2 · V3 클립 고치기', () => {
  it('V2 클립의 잔물결 삭제는 V2 줄만 당긴다', () => {
    // 왜: 결정 페이지 추천 "잔물결 삭제는 그 줄만 당김" — 배경 · 음악이 깔린 다른 줄은 그대로다.
    api().moveClipToTrack('B', 'v2', 4)
    api().moveClipToTrack('C', 'v2', 10)
    api().rippleDeleteClip('B')
    expect(on('v2')).toEqual([['C', 6, 4]])
    expect(v1()).toEqual([['A', 0], ['D', 12]])
  })

  it('V2 클립도 자르기 · 가장자리 길이 · 속도를 바꿀 수 있다 — 앞 가장자리를 줄이면 끝은 그대로다', () => {
    // 왜: V1 클립과 같은 편집 기본기(시안 N 353:351). 앞 가장자리는 V1 과 같이 끝을 두고 시작이 옮겨진다.
    api().moveClipToTrack('B', 'v2', 10)
    api().setTrim('B', 1, 4)
    expect(on('v2')).toEqual([['B', 11, 3]])
    api().setSpeed('B', 2)
    expect(on('v2')).toEqual([['B', 11, 1.5]])
    api().splitVideoClipAt('B', 11.5)
    const pieces = on('v2')
    expect(pieces).toHaveLength(2)
    expect(pieces[0]).toEqual(['B', 11, 0.5])
    expect(pieces[1].slice(1)).toEqual([11.5, 1])
    expect(audioAt('B')).toBe(11)
  })
})

describe('저장', () => {
  it('줄 자물쇠 · 눈 · M · S 는 저장본에 남고 되돌리기 칸에는 들어가지 않는다', async () => {
    // 왜: 지금 줄 음소거와 같다 — 보기 설정이라 편집을 되돌릴 때 같이 돌아가지 않는다.
    const pastBefore = api().past.length
    api().toggleTrackLock('v2')
    api().toggleTrackVisible('v3')
    api().toggleAudioTrackSolo(api().audioTracks[1].id)
    expect(api().past.length).toBe(pastBefore)
    await saveEditorNow('project-tracks')
    const saved = JSON.parse(localStorage.getItem(LOCAL_KEY) ?? 'null') as PersistedEditor
    expect(saved.videoTracks).toEqual([{ id: 'v1' }, { id: 'v2', locked: true }, { id: 'v3', hidden: true }])
    expect(saved.audioTracks?.[1]).toMatchObject({ solo: true })
  })
})
