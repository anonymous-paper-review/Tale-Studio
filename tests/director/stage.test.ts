// Director에서 만든 장면 자료와 설명 연결은 다시 정리해도 유지되고, 최신 작업 단계를 올바르게 보여준다
import { beforeEach, describe, expect, it } from 'vitest'
import {
  useDirectorCanvasStore,
  getShotStage,
  effectivePrompt,
} from '@/stores/director-store'
import { selectRoughStoryboard } from '@/features/director/hooks/use-rough-storyboard'
import type { ShotNodeData, PromptNodeData } from '@/types/director'
import { isAssetData } from '@/types/director'
import type { Shot, RoughStoryboardImage } from '@/types'
import { useAssetStorageStore } from '@/stores/asset-storage-store'

beforeEach(() => {
  useDirectorCanvasStore.getState().reset()
  useAssetStorageStore.getState().reset()
})

describe('원본 그림을 연결한 카드', () => {
  it('인물 원본을 편집 가능한 카드로 만들고 다시 정리해도 편집 내용을 보존한다', () => {
    api().setProjectId('project-1')
    const sceneId = api().addSceneNode({ x: 400, y: 0 }, 'S1')
    const shotId = api().addShotNode(sceneId, { x: 700, y: 0 }, 'Shot1')
    api().updateNodeData<'shot'>(shotId, {
      characterAssetIds: ['char-1'],
    })
    const secondSceneId = api().addSceneNode({ x: 1200, y: 0 }, 'S2')
    const secondShotId = api().addShotNode(
      secondSceneId,
      { x: 1500, y: 0 },
      'Shot2',
    )
    api().updateNodeData<'shot'>(secondShotId, {
      characterAssetIds: ['char-1'],
    })
    useAssetStorageStore.getState().registerCharacter('char-1', {
      projectId: 'project-1',
      sourceCanvasNodeId: 'artist-char-1',
      name: '주인공',
      alias: '',
      background: '',
      description: '검은 코트를 입은 탐정',
      prompt: 'detective in a black coat',
      referenceImages: [],
      views: {
        single: [
          {
            id: 'image-1',
            url: 'https://example.com/character.png',
            prompt: 'detective',
            modelId: 'imagen',
            createdAt: 1,
          },
        ],
        fiveView: [],
        sixteenAngle: [],
      },
      statusVariants: [],
    })

    api().rebuildAssetNodes()
    const assetNodes = api().nodes.filter((node) => isAssetData(node.data))
    expect(assetNodes).toHaveLength(1)
    const asset = assetNodes[0]
    expect(asset?.selectable).toBe(true)
    expect(asset && isAssetData(asset.data) ? asset.data : null).toMatchObject({
      assetKind: 'character',
      sourceImageUrl: 'https://example.com/character.png',
      imageUrl: 'https://example.com/character.png',
      prompt: 'detective in a black coat',
      locked: false,
    })
    if (!asset || !isAssetData(asset.data)) throw new Error('Asset Image missing')
    expect(
      api().edges.filter(
        (edge) =>
          edge.source === asset.id && edge.data?.category === 'references',
      ),
    ).toHaveLength(2)
    api().updateNodeData<'asset'>(asset.id, {
      prompt: 'edited in Director',
      imageModel: 'nano-banana',
    })
    api().rebuildAssetNodes()
    const rebuilt = api().nodes.find((node) => node.id === asset.id)
    expect(rebuilt && isAssetData(rebuilt.data) ? rebuilt.data : null).toMatchObject({
      prompt: 'edited in Director',
      imageModel: 'nano-banana',
    })
  })
})

function api() {
  return useDirectorCanvasStore.getState()
}

/** Scene + Shot 노드를 만들고 Shot 노드 id 반환 */
function makeShot(): string {
  const sceneId = api().addSceneNode({ x: 0, y: 0 }, 'S1')
  return api().addShotNode(sceneId, { x: 100, y: 0 }, 'Shot1')
}

const completedImage = {
  url: 'https://example.com/live.png',
  status: 'completed' as const,
  errorMessage: null,
  generatedAt: 1,
}

describe('장면 그림 단계 판단', () => {
  it('그림이 없으면 초안 단계로 본다', () => {
    const shotId = makeShot()
    expect(getShotStage(api(), shotId)).toBe('rough')
  })

  it('완성된 실사 그림이 있으면 실사 단계로 본다', () => {
    const shotId = makeShot()
    api().updateNodeData<'shot'>(shotId, { storyboardImage: completedImage })
    expect(getShotStage(api(), shotId)).toBe('live')
  })

  it('그림을 만드는 중이면 완성 전 단계로 본다', () => {
    const shotId = makeShot()
    api().updateNodeData<'shot'>(shotId, {
      storyboardImage: { url: '', status: 'generating', errorMessage: null, generatedAt: 0 },
    })
    expect(getShotStage(api(), shotId)).toBe('rough')
  })

  it('영상이 있으면 그림을 만드는 중이어도 영상 단계로 본다', () => {
    const shotId = makeShot()
    api().updateNodeData<'shot'>(shotId, {
      storyboardImage: { url: '', status: 'generating', errorMessage: null, generatedAt: 0 },
    })
    api().addVideoTake(shotId)
    expect(getShotStage(api(), shotId)).toBe('video')
  })

  it('없는 장면은 초안 단계로 본다', () => {
    expect(getShotStage(api(), 'no_such_node')).toBe('rough')
  })
})

describe('장면 설명 연결', () => {
  it('설명 카드를 만들면 새 카드가 추가된다', () => {
    const id = api().addPromptNode({ x: 0, y: 0 }, '텍스트')
    const node = api().nodes.find((n) => n.id === id)
    expect(node?.type).toBe('prompt')
    expect((node?.data as PromptNodeData).text).toBe('텍스트')
    expect((node?.data as PromptNodeData).targetShotNodeId).toBeNull()
  })

  it('설명 카드를 장면에 연결하면 장면 설명이 함께 바뀐다', () => {
    const shotId = makeShot()
    const promptId = api().addPromptNode({ x: 0, y: 0 }, '강아지가 소년 옆에 앉아있음')

    api().wirePromptToShot(promptId, shotId)

    const shot = api().nodes.find((n) => n.id === shotId)!
    expect((shot.data as ShotNodeData).promptOverride).toBe('강아지가 소년 옆에 앉아있음')
    expect(effectivePrompt(shot.data as ShotNodeData)).toBe('강아지가 소년 옆에 앉아있음')

    const edge = api().edges.find((e) => e.source === promptId && e.target === shotId)
    expect(edge).toBeDefined()
    expect(edge?.data?.category).toBe('prompt')

    const prompt = api().nodes.find((n) => n.id === promptId)!
    expect((prompt.data as PromptNodeData).targetShotNodeId).toBe(shotId)
  })

  it('장면이 아닌 대상에는 설명을 연결하지 않는다', () => {
    const promptId = api().addPromptNode({ x: 0, y: 0 }, 't')
    const before = api().edges.length
    api().wirePromptToShot(promptId, 'no_such_shot')
    expect(api().edges.length).toBe(before)
  })

  it('장면 설명 연결은 자료를 다시 정리해도 유지된다', () => {
    const shotId = makeShot()
    const promptId = api().addPromptNode({ x: 0, y: 0 }, '유지되어야 함')
    api().wirePromptToShot(promptId, shotId)
    expect(api().edges.some((e) => e.data?.category === 'prompt')).toBe(true)

    api().rebuildAssetNodes()

    expect(api().edges.some((e) => e.data?.category === 'prompt')).toBe(true)
    expect(api().nodes.some((n) => n.id === promptId)).toBe(true)
  })
})

describe('장면별 초안 그림 선택', () => {
  const rough: RoughStoryboardImage = {
    url: 'rough.png',
    status: 'completed',
    errorMessage: null,
    generatedAt: 1,
  }
  const shots = [
    { shotId: 's1', roughStoryboard: rough },
    { shotId: 's2' },
  ] as unknown as Shot[]

  it('지정한 장면의 초안 그림을 돌려준다', () => {
    expect(selectRoughStoryboard(shots, 's1')).toBe(rough)
  })

  it('초안 그림이 없는 장면은 비워 둔다', () => {
    expect(selectRoughStoryboard(shots, 's2')).toBeNull()
  })

  it('장면을 지정하지 않으면 비워 둔다', () => {
    expect(selectRoughStoryboard(shots, null)).toBeNull()
  })

  it('없는 장면은 비워 둔다', () => {
    expect(selectRoughStoryboard(shots, 'nope')).toBeNull()
  })

  it('같은 장면을 다시 찾아도 같은 그림을 가리킨다', () => {
    expect(selectRoughStoryboard(shots, 's1')).toBe(selectRoughStoryboard(shots, 's1'))
  })
})
