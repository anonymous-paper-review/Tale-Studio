// 약속 G — 카드에 그려진 선은 실제 입력과 같다 (_tdd.md G, 2026-09-04)
//
//   선은 노드 데이터(참조 목록·이미지 입력·프레임 입력·영상 체인)에서만 파생된다. 없는 입력에는 선이 없고, 목록이 바뀌면
//   선이 바로 따라간다. 문장 하나 = 테스트 하나.
import { beforeEach, describe, expect, it } from 'vitest'
import { useDirectorCanvasStore } from '@/stores/director-store'
import { useAssetStorageStore, type RegisterCharacterInput } from '@/stores/asset-storage-store'
import { isAssetData, isShotData } from '@/types/director'

const api = () => useDirectorCanvasStore.getState()

function registerAsset(kind: 'character' | 'world', id: string, name: string) {
  const input: RegisterCharacterInput = {
    projectId: 'project-g',
    sourceCanvasNodeId: `artist-${id}`,
    name,
    alias: '',
    background: '',
    description: name,
    prompt: name,
    referenceImages: [],
    views: {
      single: [{ id: `img-${id}`, url: `https://example.com/${id}.png`, prompt: name, modelId: 'imagen', createdAt: 1 }],
      fiveView: [],
      sixteenAngle: [],
    },
    statusVariants: [],
  }
  if (kind === 'character') useAssetStorageStore.getState().registerCharacter(id, input)
  else useAssetStorageStore.getState().registerWorld(id, input)
}

/** 샷의 참조 선 상대(에셋 id)를 종류별로 모은다. */
function referencePartners(shotId: string): { characters: string[]; worlds: string[] } {
  const out = { characters: [] as string[], worlds: [] as string[] }
  for (const e of api().edges) {
    if (e.data?.category !== 'references' || e.target !== shotId) continue
    const src = api().nodes.find((n) => n.id === e.source)
    if (!src || !isAssetData(src.data)) continue
    ;(src.data.assetKind === 'character' ? out.characters : out.worlds).push(src.data.assetId)
  }
  out.characters.sort()
  out.worlds.sort()
  return out
}

beforeEach(() => {
  api().reset()
  useAssetStorageStore.getState().reset()
  api().setProjectId('project-g')
  registerAsset('character', 'char-a', 'A')
  registerAsset('character', 'char-b', 'B')
  registerAsset('world', 'loc-1', 'L')
})

describe('약속 G — 선은 실제 입력과 같다', () => {
  it('샷 카드에 그려진 참조 선의 상대(캐릭터·배경)는 그 샷이 실제로 참조하는 목록과 하나도 어긋나지 않는다', () => {
    const sceneId = api().addSceneNode({ x: 0, y: 0 }, 'S')
    const shot1 = api().addShotNode(sceneId, { x: 300, y: 0 }, 'Shot1')
    const shot2 = api().addShotNode(sceneId, { x: 300, y: 400 }, 'Shot2')
    api().updateNodeData<'shot'>(shot1, { characterAssetIds: ['char-a', 'char-b'], worldAssetIds: ['loc-1'] })
    // 등록되지 않은 에셋 id(char-zzz)는 참조 목록에 있어도 선을 그릴 상대가 없다 — 선도 없다.
    api().updateNodeData<'shot'>(shot2, { characterAssetIds: ['char-b', 'char-zzz'], worldAssetIds: [] })
    api().rebuildAssetNodes()
    expect(referencePartners(shot1)).toEqual({ characters: ['char-a', 'char-b'], worlds: ['loc-1'] })
    expect(referencePartners(shot2)).toEqual({ characters: ['char-b'], worlds: [] })
    const shot2Data = api().nodes.find((n) => n.id === shot2)!.data
    if (!isShotData(shot2Data)) throw new Error('shot2 missing')
    expect(shot2Data.characterAssetIds).toEqual(['char-b', 'char-zzz']) // 목록 자체는 건드리지 않는다
  })

  it('이미지·프레임·영상 입력 선은 그 카드가 실제로 받는 입력 칸에 하나씩 대응하고, 없는 입력에는 선이 그려지지 않는다', () => {
    const sceneId = api().addSceneNode({ x: 0, y: 0 }, 'S')
    const src = api().addShotNode(sceneId, { x: 300, y: 0 }, 'Src')
    api().updateNodeData<'shot'>(src, { storyboardImage: { status: 'completed', url: 'https://x/src.png' } as never })
    const tgt = api().addShotNode(sceneId, { x: 300, y: 500 }, 'Tgt')
    const video = api().addVideoTake(tgt)!
    const upstream = api().addVideoTake(src)!
    api().updateNodeData<'video'>(upstream, { status: 'completed', videoUrl: 'https://x/up.mp4', videoClipId: 'clip-up' })
    api().updateNodeData<'shot'>(tgt, { imageInputs: [src, 'ghost-node'] })
    api().updateNodeData<'video'>(video, {
      frameInputs: { start: src, end: null, refs: ['ghost-node'] },
      videoChainInputId: upstream,
    })
    api().rebuildImageEdges()
    api().rebuildFrameEdges()
    api().rebuildVideoChainEdges()
    const edgesTo = (target: string, category: string) =>
      api().edges.filter((e) => e.target === target && e.data?.category === category)
    // 이미지 입력: 있는 상대 하나만, 유령 입력에는 선 없음.
    expect(edgesTo(tgt, 'image').map((e) => [e.source, e.targetHandle])).toEqual([[src, 'image-reference']])
    // 프레임 입력: START 칸 하나. END 없음 → 선 없음. 유령 REF 없음.
    expect(edgesTo(video, 'frame').map((e) => [e.source, e.targetHandle])).toEqual([[src, 'frame-start']])
    // 영상 체인: 완료된 앞 영상 → 이 영상의 PREV 칸.
    expect(edgesTo(video, 'video-chain').map((e) => e.source)).toEqual([upstream])
  })

  it('팝업에서 참조를 빼면 선도 같이 사라지고, 넣으면 선도 생긴다', () => {
    const sceneId = api().addSceneNode({ x: 0, y: 0 }, 'S')
    const shot = api().addShotNode(sceneId, { x: 300, y: 0 }, 'Shot')
    api().updateNodeData<'shot'>(shot, { characterAssetIds: ['char-a', 'char-b'], worldAssetIds: ['loc-1'] })
    expect(referencePartners(shot)).toEqual({ characters: ['char-a', 'char-b'], worlds: ['loc-1'] })
    // 팝업 토글과 같은 호출 — 선이 바로 따라간다(별도 rebuild 호출 없이).
    api().updateNodeData<'shot'>(shot, { characterAssetIds: ['char-b'], referenceOverride: true })
    expect(referencePartners(shot)).toEqual({ characters: ['char-b'], worlds: ['loc-1'] })
    api().updateNodeData<'shot'>(shot, { worldAssetIds: [], referenceOverride: true })
    expect(referencePartners(shot)).toEqual({ characters: ['char-b'], worlds: [] })
    api().updateNodeData<'shot'>(shot, { characterAssetIds: ['char-a', 'char-b'], referenceOverride: true })
    expect(referencePartners(shot)).toEqual({ characters: ['char-a', 'char-b'], worlds: [] })
  })
})
