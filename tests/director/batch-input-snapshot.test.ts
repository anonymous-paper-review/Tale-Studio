// 일괄 영상 생성을 시작하면 그 순간의 그림·설정을 요청으로 고정하고, 이후 사용자 수정은 이미 저장된 요청을 바꾸지 않는다 (#batch-resume, 2026-09-09)
//
//   오너 결정: 시작 버튼을 누른 순간 화면에 보이는 노드 상태(카메라·모델·프롬프트·배선)를 그대로 서버에
//   보내 저장하고, 그 뒤 사용자가 원본 노드를 계속 고쳐도 이미 저장된 요청은 흔들리지 않는다. 사람이
//   START/END/REF나 영상체인으로 배선한 그림은 그 URL과 역할 그대로 고정하고, 해석할 수 없는 배선은
//   다른 그림으로 몰래 대체하지 않고 그 샷을 skipped 로 남긴다. Writer shot id 가 없는 샷도 skipped.
//   아직 완성 영상이 없는 수동 배선 take 가 있으면 가장 최근 take 의 입력과 override 를 그대로 쓰고,
//   배선하지 않은 일반 샷은 frameSource 를 'auto' 로 남겨 서버가 시작 시 DB 참조를 확정하게 한다.
import { describe, expect, it } from 'vitest'
import type { DirectorNode } from '@/types/director'
import { buildVideoBatchInputs } from '@/lib/director/video-batch-inputs'

function node(id: string, data: Record<string, unknown>): DirectorNode {
  return { id, type: String(data.kind), position: { x: 0, y: 0 }, data } as unknown as DirectorNode
}

const CAMERA = { horizontal: 0, vertical: 0, pan: 0, tilt: 0, roll: 0, zoom: 0 }
const LIGHTING = { position: 'front', brightness: 50, colorTemp: 5600 }
const CAMERA_PRESET = { brand: 'arri', focalLength: 35, aperture: 2.8, whiteBalance: 5600 }

function shot(id: string, overrides: Record<string, unknown> = {}): DirectorNode {
  return node(id, {
    kind: 'shot',
    writerShotId: `writer-${id}`,
    prompt: 'base prompt',
    camera: { ...CAMERA },
    lighting: { ...LIGHTING },
    cameraPreset: { ...CAMERA_PRESET },
    provider: 'seedance',
    durationSeconds: 5,
    storyboardImage: null,
    referenceImages: [],
    imageInputs: [],
    ...overrides,
  })
}

function video(id: string, parentShotNodeId: string, overrides: Record<string, unknown> = {}): DirectorNode {
  return node(id, {
    kind: 'video',
    parentShotNodeId,
    standaloneVideoKey: null,
    takeNumber: 1,
    createdAt: '2026-09-01T00:00:00Z',
    status: 'pending',
    videoUrl: null,
    frameInputs: { start: null, end: null, refs: [] },
    videoChainInputId: null,
    videoChainFrameUrl: null,
    override: {},
    ...overrides,
  })
}

function asset(id: string, imageUrl: string): DirectorNode {
  return node(id, { kind: 'asset', imageUrl })
}

describe('buildVideoBatchInputs — 일괄 시작 시 요청을 그 순간 값으로 고정한다', () => {
  it('요청을 만든 뒤 원본 노드의 카메라·모델·프롬프트를 바꿔도 이미 만든 요청은 바뀌지 않는다 (깊은 복사)', () => {
    const nodes = [shot('shot-1')]
    const result = buildVideoBatchInputs('project-1', nodes, ['shot-1'])
    expect(result.items).toHaveLength(1)
    const before = JSON.parse(JSON.stringify(result.items[0]!.request))

    const shotData = nodes[0]!.data as Record<string, unknown>
    ;(shotData.camera as Record<string, unknown>).horizontal = 999
    shotData.provider = 'kling'
    shotData.prompt = 'changed prompt'
    shotData.promptOverride = 'changed override'

    expect(result.items[0]!.request).toEqual(before)
  })

  it('전달한 shotNodeIds 순서만 그대로 담고, 목록에 없는 샷은 결과에 넣지 않는다', () => {
    const nodes = [shot('shot-1'), shot('shot-2'), shot('shot-3')]
    const result = buildVideoBatchInputs('project-1', nodes, ['shot-3', 'shot-1'])
    expect(result.items.map((item) => item.shotId)).toEqual(['writer-shot-3', 'writer-shot-1'])
  })

  it('사람이 배선한 시작·참고 그림은 그 URL과 역할 그대로 고정한다', () => {
    const motherShot = shot('shot-1')
    const startAsset = asset('asset-start', 'https://cdn/start.png')
    const refAsset = asset('asset-ref', 'https://cdn/ref.png')
    const take = video('video-1', 'shot-1', {
      frameInputs: { start: 'asset-start', end: null, refs: ['asset-ref'] },
    })

    const result = buildVideoBatchInputs('project-1', [motherShot, take, startAsset, refAsset], ['shot-1'])

    expect(result.items).toHaveLength(1)
    const req = result.items[0]!.request
    expect(req.frameSource).toBe('manual')
    expect(req.referenceImageUrls).toEqual(['https://cdn/start.png', 'https://cdn/ref.png'])
    expect(req.referenceImageRoles).toEqual(['start', 'ref'])
  })

  it('수동 배선된 소스를 해석할 수 없으면 다른 그림으로 대체하지 않고 그 샷을 skipped에 남긴다', () => {
    const motherShot = shot('shot-1')
    const take = video('video-1', 'shot-1', {
      frameInputs: { start: 'missing-node', end: null, refs: [] },
    })

    const result = buildVideoBatchInputs('project-1', [motherShot, take], ['shot-1'])

    expect(result.items).toHaveLength(0)
    expect(result.skipped).toEqual([
      { shotId: 'writer-shot-1', reason: 'unresolvable_manual_wiring' },
    ])
  })

  it('Writer shot id가 없는 샷은 skipped에 남고 다른 그림으로 대체하지 않는다', () => {
    const noWriterShot = shot('shot-1', { writerShotId: null })

    const result = buildVideoBatchInputs('project-1', [noWriterShot], ['shot-1'])

    expect(result.items).toEqual([])
    expect(result.skipped).toEqual([{ shotId: 'shot-1', reason: 'missing_writer_shot_id' }])
  })

  it('배선하지 않은 일반 샷은 frameSource를 auto로 남겨 서버가 시작 시 DB 참조를 확정하게 한다', () => {
    const plainShot = shot('shot-1')

    const result = buildVideoBatchInputs('project-1', [plainShot], ['shot-1'])

    expect(result.items).toHaveLength(1)
    const req = result.items[0]!.request
    expect(req.frameSource).toBe('auto')
    expect(req.referenceImageUrl).toBeNull()
    expect(req.referenceImageUrls).toBeUndefined()
  })

  it('아직 완성 영상이 없는 수동 배선 take가 있으면 가장 최근 take의 입력과 override를 그대로 쓴다', () => {
    const motherShot = shot('shot-1', { prompt: 'mother prompt', camera: { ...CAMERA, horizontal: 1 } })
    const startAsset = asset('asset-start', 'https://cdn/start.png')
    const oldTake = video('video-old', 'shot-1', {
      takeNumber: 1,
      createdAt: '2026-09-01T00:00:00Z',
      override: { prompt: 'old override' },
    })
    const recentTake = video('video-recent', 'shot-1', {
      takeNumber: 2,
      createdAt: '2026-09-05T00:00:00Z',
      status: 'pending',
      videoUrl: null,
      frameInputs: { start: 'asset-start', end: null, refs: [] },
      override: { prompt: 'recent override', camera: { ...CAMERA, horizontal: 9 } },
    })

    const result = buildVideoBatchInputs(
      'project-1',
      [motherShot, oldTake, recentTake, startAsset],
      ['shot-1'],
    )

    expect(result.items).toHaveLength(1)
    const req = result.items[0]!.request
    expect(req.prompt).toBe('recent override')
    expect(req.camera).toEqual({ ...CAMERA, horizontal: 9 })
    expect(req.frameSource).toBe('manual')
    expect(req.referenceImageUrls).toEqual(['https://cdn/start.png'])
  })
})
