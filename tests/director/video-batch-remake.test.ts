// 모든 샷 영상 만들기 · Lumi 의 "실패한 샷 다시 만들어 줘"도 실패한 샷은 그 샷의 마지막 Take 모델 · 해상도로 만든다 (디자이너 11/13 담당표 · 오너 2026-11-14)
import { describe, expect, it } from 'vitest'
import type { DirectorNode } from '@/types/director'
import { buildVideoBatchInputs } from '@/lib/director/video-batch-inputs'
import { videoBatchTakeCosts } from '@/lib/director/video-batch-plan'

function node(id: string, data: Record<string, unknown>): DirectorNode {
  return { id, type: String(data.kind), position: { x: 0, y: 0 }, data } as unknown as DirectorNode
}
const shot = (id: string) => node(id, {
  kind: 'shot',
  writerShotId: `writer-${id}`,
  prompt: 'base prompt',
  camera: { horizontal: 0, vertical: 0, pan: 0, tilt: 0, roll: 0, zoom: 0 },
  lighting: { position: 'front', brightness: 50, colorTemp: 5600 },
  cameraPreset: { brand: 'arri', focalLength: 35, aperture: 2.8, whiteBalance: 5600 },
  provider: 'seedance',
  durationSeconds: 5,
  storyboardImage: null,
  referenceImages: [],
  imageInputs: [],
})
/** 그림을 잇지 않은 채 실패한 Take — 일괄이 지금은 샷 설정(720p)으로 만들던 경우. */
const failedTake = (id: string, parentShotNodeId: string, takeNumber: number, override: Record<string, unknown>) => node(id, {
  kind: 'video',
  parentShotNodeId,
  standaloneVideoKey: null,
  takeNumber,
  createdAt: `2026-11-14T0${takeNumber}:00:00Z`,
  status: 'failed',
  videoUrl: null,
  frameInputs: { start: null, end: null, refs: [] },
  videoChainInputId: null,
  videoChainFrameUrl: null,
  override,
})

describe('일괄 다시 만들기', () => {
  it('실패한 Take 만 있는 샷을 일괄로 다시 만들면 가장 최근 Take 의 모델 · 해상도로 만들고, Take 합계도 그 값으로 센다', () => {
    // 왜: 담당표 "실패 다시 만들기는 마지막 모델 · 해상도로" — Lumi 는 실패한 샷을 일괄(runVideoBatch)로 다시 보낸다.
    //   바꿀 점(프롬프트)은 일괄 요청에 쓰이지 않으니 새 Take 설정에도 싣지 않는다(혼자 정한 것).
    const nodes = [
      shot('shot-1'),
      failedTake('take-1', 'shot-1', 1, { provider: 'veo', resolution: '720p' }),
      failedTake('take-2', 'shot-1', 2, { provider: 'happy-horse', resolution: '1080p', prompt: 'base prompt\n\nChange from the previous video: slower' }),
    ]
    const { items } = buildVideoBatchInputs('project-1', nodes, ['shot-1'])

    expect(items).toHaveLength(1)
    expect(items[0]!.request).toMatchObject({ model: 'happy-horse', resolution: '1080p', override: { provider: 'happy-horse', resolution: '1080p' } })
    expect(items[0]!.request.override).not.toHaveProperty('prompt')
    expect(videoBatchTakeCosts(nodes, ['shot-1'])).toEqual([2])
  })
})
