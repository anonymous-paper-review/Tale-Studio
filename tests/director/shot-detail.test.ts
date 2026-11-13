// Director 샷 상세(D6 · D7)의 규칙 — 탭 이름 · 시작/끝 그림 · 실제로 도는 이미지 모델 · Take 쌓기와 ★ 최종(자동) · 바꿀 점 (디자이너 11/13 시안 · 오너 2026-11-14)
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  detailImageModels,
  imageChangedForTake,
  imageChangedSinceTake,
  latestShotTake,
  newTakeRequest,
  promptWithChange,
  shotDetailFrames,
  shotDetailTakes,
  takeImageVersions,
  takePhaseOf,
  takeSettings,
  videoTabLabelKey,
} from '@/lib/director/shot-detail'
import { withStoryboardVersion } from '@/lib/director/storyboard-image-versions'
import type { DirectorNode, ShotNodeData, VideoNodeData } from '@/types/director'

const shot = (over: Partial<ShotNodeData> = {}): ShotNodeData => ({
  kind: 'shot',
  label: 'Shot 1',
  writerShotId: 'sh_01_01',
  parentSceneNodeId: null,
  prompt: 'A girl shivers under the eaves.',
  referenceImages: [],
  imageInputs: [],
  storyboardImage: null,
  characterAssetIds: [],
  worldAssetIds: [],
  camera: {} as ShotNodeData['camera'],
  lighting: {} as ShotNodeData['lighting'],
  cameraPreset: {} as ShotNodeData['cameraPreset'],
  provider: 'seedance-2' as ShotNodeData['provider'],
  durationSeconds: 3,
  generationMethod: 'I2V' as ShotNodeData['generationMethod'],
  stale: false,
  ...over,
})

function take(id: string, n: number, over: Partial<VideoNodeData> = {}): DirectorNode {
  return {
    id,
    type: 'video',
    position: { x: 0, y: 0 },
    data: {
      kind: 'video', label: `Take ${n}`, videoClipId: `clip-${id}`, takeNumber: n, generationJobId: null,
      lastAttemptStatus: 'completed', lastAttemptError: null, lastAttemptAt: null, createdAt: `2026-11-14T0${n}:00:00Z`,
      frameInputs: { start: null, end: null, refs: [] }, videoChainInputId: null, videoChainFrameUrl: null,
      videoUrl: `https://media.test/${id}.mp4`, thumbnailUrl: null, status: 'completed', errorMessage: null,
      final: false, stale: false, parentShotNodeId: 'shot-1', standaloneVideoKey: null, override: {},
      ...over,
    } as VideoNodeData,
  } as DirectorNode
}

describe('Director 샷 상세', () => {
  it('영상이 없는 샷의 상세 영상 탭 이름은 "영상 · 없음"이다', () => {
    // 왜: D6 — 영상이 아직 없으면 탭에서 바로 알 수 있게 한다.
    expect(videoTabLabelKey(0)).toEqual({ key: 'Video · none', params: {} })
    expect(videoTabLabelKey(2)).toEqual({ key: 'Video', params: {} })
  })

  it('이미지 탭은 시작 · 끝 그림을 나란히 보이고, 끝 그림이 없으면 끝 자리는 비운다', () => {
    // 왜: D6 — 시작 · 끝을 나란히 놓는다. 끝 그림이 없는 한 장짜리 옛 그림을 끝 자리에 다시 보이면 같은 그림이 둘로 보인다.
    const image = { url: 'https://media.test/a.png', status: 'completed', errorMessage: null, generatedAt: 1, frames: { start: 'https://media.test/s.png', direction: 'https://media.test/d.png', end: 'https://media.test/e.png' } }
    expect(shotDetailFrames(image as ShotNodeData['storyboardImage'])).toEqual({ start: 'https://media.test/s.png', end: 'https://media.test/e.png' })
    const single = { url: 'https://media.test/a.png', status: 'completed', errorMessage: null, generatedAt: 1 }
    expect(shotDetailFrames(single as ShotNodeData['storyboardImage'])).toEqual({ start: 'https://media.test/a.png', end: null })
    expect(shotDetailFrames(null)).toEqual({ start: null, end: null })
  })

  it('Writer 샷의 이미지 모델 칸에는 실제로 도는 GPT Image 2 · Seedream 4 만 보인다', () => {
    // 왜: 오너 답 5번 "모델 칸에는 실제로 도는 것만" — Writer 샷은 러프 세 장을 한 장에서 다시 칠하는 길이라 이 둘만 돌고,
    //   나머지는 말없이 GPT Image 2 로 바뀌었다.
    expect(detailImageModels(shot())).toEqual(['gpt-image-2', 'seedream-4'])
  })

  it('Writer 샷이 아닌 캔버스 샷의 이미지 모델 칸에는 모든 모델이 보인다', () => {
    // 왜: 캔버스에서 직접 만든 샷은 한 장 생성 길이라 고른 모델이 그대로 돈다(혼자 정한 것).
    expect(detailImageModels(shot({ writerShotId: null })).length).toBe(6)
  })

  it('영상 탭은 그 샷의 Take 를 새것부터 쌓아 보이고, 고른 ★ 가 없으면 가장 최근 완성 Take 를 "★ 최종 (자동)"으로 보인다', () => {
    // 왜: D7 · D8 · R — Take 는 덮어쓰지 않고 쌓이고, ★ 최종 Take 가 Editor 로 간다(고르지 않았으면 가장 최근 완성).
    const nodes = [take('v1', 1), take('v2', 2, { status: 'generating', videoUrl: null, lastAttemptStatus: 'generating' }), take('other', 1, { parentShotNodeId: 'shot-2' })]
    const view = shotDetailTakes(nodes, 'shot-1')
    expect(view.takes.map((t) => t.id)).toEqual(['v2', 'v1'])
    expect(view.final).toEqual({ id: 'v1', auto: true })
  })

  it('★ 를 고른 Take 가 있으면 그 Take 가 최종이다', () => {
    // 왜: 정상 경로 고정 — 사람이 고른 ★ 가 자동보다 먼저다.
    const nodes = [take('v1', 1, { final: true }), take('v2', 2)]
    expect(shotDetailTakes(nodes, 'shot-1').final).toEqual({ id: 'v1', auto: false })
  })

  it('바꿀 점을 적고 다시 만들면 이번 생성 프롬프트 끝에 바꿀 점을 붙이고, 비워 두면 프롬프트 그대로다', () => {
    // 왜: D6 "비워 두면 아래 설정 그대로 다시 만들어요" — 바꿀 점은 이번 생성에만 붙고 샷 프롬프트는 바꾸지 않는다(혼자 정한 것).
    expect(promptWithChange('A girl under the eaves.', '  show the umbrella handle ')).toBe('A girl under the eaves.\n\nChange from the previous image: show the umbrella handle')
    expect(promptWithChange('A girl under the eaves.', '   ')).toBe('A girl under the eaves.')
    // 상점은 다시 만들기 요청에 실린 바꿀 점을 이 규칙으로 붙여 보낸다.
    const store = readFileSync('src/stores/director-store.ts', 'utf8')
    expect(store).toMatch(/changeNote\?: string/)
    expect(store).toMatch(/promptWithChange\(effectivePrompt\(data\) \|\| data\.label, options\?\.changeNote \?\? ''\)/)
  })

  it('영상 탭에서 Take 를 만들면 늘 새 Take 를 만들고, 보고 있던 Take 의 설정을 이어받으며 앞 Take 는 그대로 둔다', () => {
    // 왜: 1단계 담당표 · D7 — "Take 는 덮어쓰지 않고 쌓인다", [다시 만들기]는 늘 새 Take 다(같은 Take 를 덮던 지금 상세의 다시 만들기를 쓰지 않는다).
    const current = take('v1', 1, { override: { provider: 'seedance', resolution: '1080p' } as VideoNodeData['override'] }).data as VideoNodeData
    expect(newTakeRequest({ takeId: 'v1', take: current, shotPrompt: 'A girl shivers.', change: '' })).toEqual({ inheritFromVideoNodeId: 'v1' })
    const tab = readFileSync('src/features/director/shot-detail/shot-video-tab.tsx', 'utf8')
    expect(tab).toMatch(/generateVideoForShot\(shotNodeId, newTakeRequest\(/)
    expect(tab).not.toMatch(/regenerateVideo|VideoDetailPanel/)
  })

  it('실패한 Take 를 다시 만들면 그 Take 의 마지막 모델 · 해상도로 새 Take 를 만든다', () => {
    // 왜: 1단계 담당표 "실패 다시 만들기는 마지막 모델 · 해상도로" — 실패한 Take 의 설정을 그대로 이어받는다.
    const failed = take('v2', 2, { status: 'failed', videoUrl: null, override: { provider: 'kling-o3', resolution: '720p' } as VideoNodeData['override'] }).data as VideoNodeData
    expect(newTakeRequest({ takeId: 'v2', take: failed, shotPrompt: 'A girl shivers.', change: '' })).toEqual({ inheritFromVideoNodeId: 'v2' })
  })

  it('영상 고치기에서 모델 · 해상도를 바꾸거나 바꿀 점을 적으면 새 Take 에만 실리고, 바꿀 점은 보고 있던 Take 의 프롬프트 끝에 붙는다', () => {
    // 왜: D7 "움직임·카메라에서 바꿀 점" — 고친 것은 새 Take 의 설정이 되고 보고 있던 Take 는 바뀌지 않는다.
    //   바꿀 점은 보고 있던 영상에서 고칠 것이라, 그 Take 를 만들 때 바꾼 점도 이어진다(혼자 정한 것).
    const current = take('v1', 1).data as VideoNodeData
    expect(newTakeRequest({ takeId: 'v1', take: current, shotPrompt: 'A girl shivers.', change: ' slow push in ', provider: 'veo', resolution: '1080p' })).toEqual({
      inheritFromVideoNodeId: 'v1',
      videoOverride: { provider: 'veo', resolution: '1080p', prompt: 'A girl shivers.\n\nChange from the previous video: slow push in' },
    })
    const changed = take('v2', 2, { override: { prompt: 'A girl shivers.\n\nChange from the previous video: slow push in' } as VideoNodeData['override'] }).data as VideoNodeData
    expect(newTakeRequest({ takeId: 'v2', take: changed, shotPrompt: 'A girl shivers.', change: 'darker' })).toEqual({
      inheritFromVideoNodeId: 'v2',
      videoOverride: { prompt: 'A girl shivers.\n\nChange from the previous video: slow push in\n\nChange from the previous video: darker' },
    })
  })

  it('영상이 없는 샷에서 모델 · 해상도를 골라 만들면 첫 Take 에 그 설정만 실린다', () => {
    // 왜: 영상 탭에서 첫 Take 를 만들 때 — 이어받을 Take 가 없으니 고른 모델 · 해상도만 싣고, 고르지 않았으면 샷 설정 그대로다(혼자 정한 것).
    expect(newTakeRequest({ takeId: null, take: null, shotPrompt: 'A girl shivers.', change: '', provider: 'happy-horse' })).toEqual({ videoOverride: { provider: 'happy-horse' } })
    expect(newTakeRequest({ takeId: null, take: null, shotPrompt: 'A girl shivers.', change: '' })).toEqual({})
  })

  it('마지막 Take 를 만든 뒤 시작 · 끝 이미지를 다시 만들었으면 "이미지가 바뀌었어요"로 본다', () => {
    // 왜: D7 "시작 이미지가 바뀌었어요 · 새 Take를 만들면 반영돼요" — 이미지가 Take 보다 새로우면 그 Take 는 옛 이미지로 만든 것이다.
    const made = take('v1', 1, { createdAt: '2026-11-14T01:00:00.000Z' }).data as VideoNodeData
    expect(imageChangedSinceTake(Date.parse('2026-11-14T02:00:00.000Z'), made)).toBe(true)
    expect(imageChangedSinceTake(Date.parse('2026-11-14T00:30:00.000Z'), made)).toBe(false)
    expect(imageChangedSinceTake(undefined, made)).toBe(false)
  })

  it('다시 만들기는 가장 최근 Take 의 모델 · 해상도로 새 Take 를 만들고, Take 가 없으면 샷 설정(720p)으로 만든다', () => {
    // 왜: 담당표 "실패 다시 만들기는 마지막 모델 · 해상도로" — D8 [다시 만들기 · Take X] · Lumi "실패한 샷 다시 만들어 줘"도 같은 규칙을 쓴다.
    const nodes = [
      take('v1', 1, { override: { provider: 'veo', resolution: '1080p' } as VideoNodeData['override'] }),
      take('v2', 2, { status: 'failed', videoUrl: null, override: { provider: 'kling-o3', resolution: '720p' } as VideoNodeData['override'] }),
    ]
    const latest = latestShotTake(nodes, 'shot-1')
    expect(latest?.id).toBe('v2')
    expect(takeSettings(shot({ provider: 'seedance' }), latest!.data)).toEqual({ model: 'kling-o3', resolution: '720p' })
    expect(latestShotTake([], 'shot-1')).toBeNull()
    expect(takeSettings(shot({ provider: 'seedance' }), null)).toEqual({ model: 'seedance', resolution: '720p' })
  })

  it('Take 가 쓴 이미지 버전이 지금 버전과 다르면 "이미지가 바뀌었어요"로 보고, 그 버전으로 되돌리면 바뀌지 않은 것으로 본다', () => {
    // 왜: D7 · 리드 B — v2 로 만든 Take 를 보다가 v1 로 되돌리면 시각으로는 "안 바뀜"이지만 실제로는 다른 그림이다. 버전이 시각보다 먼저다.
    const v = (id: string, tag: string, at: number) => ({ id, url: `https://media.test/${tag}-s.png`, frames: { start: `https://media.test/${tag}-s.png`, direction: `https://media.test/${tag}-d.png`, end: `https://media.test/${tag}-e.png` }, generatedAt: at, source: 'generated' as const })
    const two = withStoryboardVersion(withStoryboardVersion(null, v('job-1', 'a', Date.parse('2026-11-14T00:00:00Z')), { select: true }), v('job-2', 'b', Date.parse('2026-11-14T01:00:00Z')), { select: true })
    const madeWithV2 = take('t1', 1, { createdAt: '2026-11-14T02:00:00Z', madeFrames: { start: 'https://media.test/b-s.png?v=1', end: 'https://media.test/b-e.png' } }).data as VideoNodeData
    expect(takeImageVersions(two, madeWithV2)).toEqual({ start: 2, end: 2 })
    expect(imageChangedForTake(two, madeWithV2)).toBe(false)
    const backToV1 = withStoryboardVersion(two, v('job-1', 'a', Date.parse('2026-11-14T00:00:00Z')), { select: true })
    expect(imageChangedForTake(backToV1, madeWithV2)).toBe(true)
    // 버전을 모르는 옛 Take 는 시각으로 본다.
    const legacyTake = take('t0', 1, { createdAt: '2026-11-14T00:30:00Z' }).data as VideoNodeData
    expect(imageChangedForTake(two, legacyTake)).toBe(true)
  })

  it('이미지를 다시 만드는 동안에도 상세의 시작 · 끝 자리에는 지금 그림이 그대로 보인다', () => {
    // 왜: 실제 화면(개발 DB, 11/14)에서 다시 만드는 동안 시작 · 끝 자리가 비었다 — 지금 그림은 바뀌지 않았으니 그대로 보인다.
    const frames = { start: 'https://media.test/s.png', direction: 'https://media.test/d.png', end: 'https://media.test/e.png' }
    const making = { url: frames.start, frames, status: 'generating', errorMessage: null, generatedAt: 1, versions: [{ id: 'legacy', n: 1, url: frames.start, frames, generatedAt: 1, source: 'generated' }], versionId: 'legacy' }
    expect(shotDetailFrames(making as ShotNodeData['storyboardImage'])).toEqual({ start: frames.start, end: frames.end })
  })

  it('화면에서 멈춘 Take 는 만드는 중이 아니라 "멈춤"이고, 뒤늦게 끝나도 ★ 자동으로 고르지 않는다', () => {
    // 왜: 오너 7번 — 멈춘 Take 는 만드는 중으로 세지 않아 새 Take 를 바로 만들 수 있고, 늦게 끝난 영상은 기록에만 있다(★ 로 고르면 간다).
    expect(takePhaseOf({ status: 'generating', lastAttemptStatus: 'generating', videoUrl: null, cancelledAt: '2026-11-14T03:00:00Z' })).toBe('stopped')
    const nodes = [take('v1', 1), take('v2', 2, { cancelledAt: '2026-11-14T03:00:00Z' })]
    expect(takePhaseOf(nodes[1]!.data as VideoNodeData)).toBe('done')
    expect(shotDetailTakes(nodes, 'shot-1').final).toEqual({ id: 'v1', auto: true })
    const picked = [take('v1', 1), take('v2', 2, { cancelledAt: '2026-11-14T03:00:00Z', final: true })]
    expect(shotDetailTakes(picked, 'shot-1').final).toEqual({ id: 'v2', auto: false })
  })
})
