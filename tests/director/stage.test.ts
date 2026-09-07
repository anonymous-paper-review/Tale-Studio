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

describe('asset-backed Image template', () => {
  it('캐릭터 원본을 editable Image로 만들고 rebuild 뒤 편집값을 보존한다', () => {
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

describe('getShotStage (파생 단계: video > live > rough)', () => {
  it('storyboardImage 없으면 rough', () => {
    const shotId = makeShot()
    expect(getShotStage(api(), shotId)).toBe('rough')
  })

  it('storyboardImage completed면 live', () => {
    const shotId = makeShot()
    api().updateNodeData<'shot'>(shotId, { storyboardImage: completedImage })
    expect(getShotStage(api(), shotId)).toBe('live')
  })

  it('storyboardImage가 generating이면 아직 rough (완료만 live)', () => {
    const shotId = makeShot()
    api().updateNodeData<'shot'>(shotId, {
      storyboardImage: { url: '', status: 'generating', errorMessage: null, generatedAt: 0 },
    })
    expect(getShotStage(api(), shotId)).toBe('rough')
  })

  it('자식 Video가 있으면 video — storyboardImage가 generating이어도 우선', () => {
    const shotId = makeShot()
    api().updateNodeData<'shot'>(shotId, {
      storyboardImage: { url: '', status: 'generating', errorMessage: null, generatedAt: 0 },
    })
    api().addVideoTake(shotId)
    expect(getShotStage(api(), shotId)).toBe('video')
  })

  it('존재하지 않는 노드는 rough', () => {
    expect(getShotStage(api(), 'no_such_node')).toBe('rough')
  })
})

describe('addPromptNode / wirePromptToShot', () => {
  it('addPromptNode가 prompt 노드를 추가', () => {
    const id = api().addPromptNode({ x: 0, y: 0 }, '텍스트')
    const node = api().nodes.find((n) => n.id === id)
    expect(node?.type).toBe('prompt')
    expect((node?.data as PromptNodeData).text).toBe('텍스트')
    expect((node?.data as PromptNodeData).targetShotNodeId).toBeNull()
  })

  it('wirePromptToShot이 prompt 엣지를 추가하고 Shot.promptOverride를 동기', () => {
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

  it('대상이 Shot이 아니면 no-op', () => {
    const promptId = api().addPromptNode({ x: 0, y: 0 }, 't')
    const before = api().edges.length
    api().wirePromptToShot(promptId, 'no_such_shot')
    expect(api().edges.length).toBe(before)
  })

  it('prompt 엣지는 rebuildAssetNodes 후에도 생존 (references와 달리 wipe 안 됨)', () => {
    const shotId = makeShot()
    const promptId = api().addPromptNode({ x: 0, y: 0 }, '유지되어야 함')
    api().wirePromptToShot(promptId, shotId)
    expect(api().edges.some((e) => e.data?.category === 'prompt')).toBe(true)

    api().rebuildAssetNodes()

    expect(api().edges.some((e) => e.data?.category === 'prompt')).toBe(true)
    expect(api().nodes.some((n) => n.id === promptId)).toBe(true)
  })
})

describe('selectRoughStoryboard (writerShotId 스코프 셀렉터)', () => {
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

  it('해당 writerShotId의 roughStoryboard 반환', () => {
    expect(selectRoughStoryboard(shots, 's1')).toBe(rough)
  })

  it('roughStoryboard 없는 샷은 null', () => {
    expect(selectRoughStoryboard(shots, 's2')).toBeNull()
  })

  it('null id는 null', () => {
    expect(selectRoughStoryboard(shots, null)).toBeNull()
  })

  it('없는 샷은 null', () => {
    expect(selectRoughStoryboard(shots, 'nope')).toBeNull()
  })

  it('참조 안정 — 같은 입력은 같은 객체 참조', () => {
    expect(selectRoughStoryboard(shots, 's1')).toBe(selectRoughStoryboard(shots, 's1'))
  })
})
