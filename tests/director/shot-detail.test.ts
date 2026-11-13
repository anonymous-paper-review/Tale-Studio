// Director 샷 상세(D6 · D7)의 규칙 — 탭 이름 · 시작/끝 그림 · 실제로 도는 이미지 모델 · Take 쌓기와 ★ 최종(자동) · 바꿀 점 (디자이너 11/13 시안 · 오너 2026-11-14)
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  detailImageModels,
  promptWithChange,
  shotDetailFrames,
  shotDetailTakes,
  videoTabLabelKey,
} from '@/lib/director/shot-detail'
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
})
