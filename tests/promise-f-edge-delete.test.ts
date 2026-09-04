// 약속 F — 선을 지우면 연결이 실제로 끊기고 되살아나지 않는다 (_tdd.md F, 2026-09-04 오너 확정)
//
//   오너 결정: F1 = Delete 키 + 선 위의 X, F3 = 참조 선을 지우면 그 샷의 참조 목록에서도 빠져 다음 실사 생성에 쓰이지 않는다,
//   F4 = 확인창 없음(Ctrl+Z 로 되돌린다). 문장 하나 = 테스트 하나.
import { beforeEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { useDirectorCanvasStore, directorRefsOf } from '@/stores/director-store'
import { useAssetStorageStore, type RegisterCharacterInput } from '@/stores/asset-storage-store'
import { isAssetData, isShotData, isVideoData } from '@/types/director'
import { applyDirectorRefs, directorRefsExcludeWorld, parseDirectorRefs, planShotCharacterRefs } from '@/lib/director/shot-references'

const ROOT = process.cwd()
const read = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8')
const api = () => useDirectorCanvasStore.getState()

function registerAsset(kind: 'character' | 'world', id: string, name: string) {
  const input: RegisterCharacterInput = {
    projectId: 'project-f',
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

/** 인물 2명·배경 1곳을 참조하는 샷 하나가 있는 캔버스. 참조 선 3개가 그려진다. */
function seedReferencedShot() {
  api().setProjectId('project-f')
  registerAsset('character', 'char-a', '용족 수장')
  registerAsset('character', 'char-b', '수인 수장')
  registerAsset('world', 'loc-1', '겨울 산맥')
  const sceneId = api().addSceneNode({ x: 400, y: 0 }, 'S1')
  const shotId = api().addShotNode(sceneId, { x: 700, y: 0 }, 'Shot1')
  api().updateNodeData<'shot'>(shotId, {
    writerShotId: 'sh_01_01',
    characterAssetIds: ['char-a', 'char-b'],
    worldAssetIds: ['loc-1'],
  })
  api().rebuildAssetNodes()
  return { sceneId, shotId }
}

const referenceEdges = () => api().edges.filter((e) => e.data?.category === 'references')
const shotData = (shotId: string) => {
  const node = api().nodes.find((n) => n.id === shotId)
  if (!node || !isShotData(node.data)) throw new Error('shot missing')
  return node.data
}

beforeEach(() => {
  api().reset()
  useAssetStorageStore.getState().reset()
})

describe('약속 F — 선 지우기', () => {
  it('선을 고른 뒤 Delete 키를 누르거나 선 위의 X를 누르면 선이 지워진다', () => {
    const page = read('src/app/studio/director/page.tsx')
    // Delete/Backspace: 고른 노드가 없으면 고른 선을 지운다 — 확인창 없이 deleteEdge 로 바로.
    expect(page).toMatch(/const selectedEdgeIds = st\.edges\.filter\(\(edge\) => edge\.selected\)/)
    expect(page).toMatch(/for \(const edgeId of edgeIds\) st\.deleteEdge\(edgeId\)/)
    const edge = read('src/features/director/canvas-edges/CategoryEdge.tsx')
    expect(edge).toMatch(/selected && DELETABLE_CATEGORIES\.has\(category\) && \(\s*<EdgeLabelRenderer>/)
    expect(edge).toMatch(/aria-label=\{t\('Delete connection'\)\}/)
    expect(edge).toMatch(/deleteEdge\(id\)/)
    expect(read('src/lib/i18n/messages-ko.ts')).toMatch(/'Delete connection': '연결 지우기'/)
  })

  it('이미지·프레임·영상 연결 선을 지우면 받는 쪽 카드에서 그 입력이 빠지고 새로고침해도 지워진 채다', () => {
    api().setProjectId('project-f')
    const sceneId = api().addSceneNode({ x: 0, y: 0 }, 'S')
    const source = api().addShotNode(sceneId, { x: 300, y: 0 }, 'Src')
    api().updateNodeData<'shot'>(source, { writerShotId: 'sh_src', storyboardImage: { status: 'completed', url: 'https://x/src.png' } as never })
    const target = api().addShotNode(sceneId, { x: 300, y: 500 }, 'Tgt')
    api().updateNodeData<'shot'>(target, { writerShotId: 'sh_tgt' })
    const video = api().addVideoTake(target)!
    const upstreamVideo = api().addVideoTake(source)!
    api().updateNodeData<'video'>(upstreamVideo, { status: 'completed', videoUrl: 'https://x/up.mp4', videoClipId: 'clip-up' })
    // 이미지 입력 선, 프레임 입력 선, 영상 체인 선을 잇는다.
    api().updateNodeData<'shot'>(target, { imageInputs: [source] })
    api().rebuildImageEdges()
    api().updateNodeData<'video'>(video, { frameInputs: { start: source, end: null, refs: [] }, videoChainInputId: upstreamVideo })
    api().rebuildFrameEdges()
    api().rebuildVideoChainEdges()
    const imageEdge = api().edges.find((e) => e.data?.category === 'image' && e.target === target)
    const frameEdge = api().edges.find((e) => e.data?.category === 'frame' && e.target === video)
    const chainEdge = api().edges.find((e) => e.data?.category === 'video-chain' && e.target === video)
    expect(imageEdge && frameEdge && chainEdge).toBeTruthy()

    api().deleteEdge(imageEdge!.id)
    api().deleteEdge(frameEdge!.id)
    api().deleteEdge(chainEdge!.id)
    expect(shotData(target).imageInputs).toEqual([])
    const v = api().nodes.find((n) => n.id === video)
    if (!v || !isVideoData(v.data)) throw new Error('video missing')
    expect(v.data.frameInputs.start).toBeNull()
    expect(v.data.videoChainInputId).toBeNull()
    // 다시 그려도(새로고침 = 노드 입력에서 선을 다시 만든다) 선은 돌아오지 않는다.
    api().rebuildImageEdges()
    api().rebuildFrameEdges()
    api().rebuildVideoChainEdges()
    expect(api().edges.filter((e) => ['image', 'frame', 'video-chain'].includes(String(e.data?.category)))).toEqual([])
    // DB 에는 스윅이 같은 입력을 쓴다(빈 입력 → 비움).
    const store = read('src/stores/director-store.ts')
    expect(store).toMatch(/removedEdge\.data\?\.category === 'video-chain' \|\|\s*refAsset\s*\) \{\s*scheduleWiringSweepToDb\(get\)/)
  })

  it('참조 선을 지우면 그 샷의 참조 목록에서도 빠져 다음 실사 생성에 쓰이지 않는다', () => {
    const { shotId } = seedReferencedShot()
    expect(referenceEdges()).toHaveLength(3)
    const charAEdge = referenceEdges().find((e) => {
      const src = api().nodes.find((n) => n.id === e.source)
      return src && isAssetData(src.data) && src.data.assetId === 'char-a'
    })!
    api().deleteEdge(charAEdge.id)
    // 목록에서 빠지고, 사람이 손댄 목록이 된다.
    expect(shotData(shotId).characterAssetIds).toEqual(['char-b'])
    expect(shotData(shotId).referenceOverride).toBe(true)
    // 파생 선을 다시 그려도(동기화·새로고침) 되살아나지 않는다.
    api().rebuildAssetNodes()
    expect(referenceEdges()).toHaveLength(2)
    // DB 페이로드 = 남은 목록. 서버는 shots.characters ∩ 이 목록만 붙인다.
    expect(directorRefsOf(shotData(shotId))).toEqual({ characters: ['char-b'], locations: ['loc-1'] })
    const refs = parseDirectorRefs({ characters: ['char-b'], locations: ['loc-1'] })
    expect(applyDirectorRefs(['char-a', 'char-b', 'char-c'], refs)).toEqual(['char-b'])
    expect(directorRefsExcludeWorld(refs)).toBe(false)
    expect(directorRefsExcludeWorld(parseDirectorRefs({ characters: ['char-b'], locations: [] }))).toBe(true)
    expect(parseDirectorRefs(null)).toBeNull()
    // 단건 실사 계획도 같은 규칙으로 인물을 고른다.
    const plan = planShotCharacterRefs(
      { shot_id: 'sh_01_01', characters: ['char-a', 'char-b'], character_appearance_keys: { 'char-a': 'current', 'char-b': 'current' }, director_refs: { characters: ['char-b'], locations: ['loc-1'] } },
      {
        characterById: new Map([['char-a', { name: 'A' }], ['char-b', { name: 'B' }]]),
        sheetByPair: new Map([['char-a current', 'https://x/a.png'], ['char-b current', 'https://x/b.png']]),
        defaultKeyById: new Map(),
      },
    )
    expect(plan.characterRefs.map((r) => r.characterId)).toEqual(['char-b'])
    // Writer 동기화는 손댄 목록을 덮지 않고, 스윅은 director_refs 로 남기며, 새로고침은 그것을 읽는다.
    expect(read('src/features/director/hooks/use-writer-director-sync.ts')).toMatch(/!d\.referenceOverride &&/)
    const store = read('src/stores/director-store.ts')
    expect(store).toMatch(/director_refs: refs as unknown as Json/)
    expect(store).toMatch(/parseDirectorRefs\(\(r as \{ director_refs\?: unknown \}\)\.director_refs\)/)
    // 배치 실사도 같은 목록을 쓴다.
    const batch = read('src/app/api/director/generate-storyboard-batch/route.ts')
    expect(batch).toMatch(/characters: applyDirectorRefs\(characters, directorRefs\)/)
    expect(batch).toMatch(/group\.every\(\(s\) => s\.excludeWorld\) \? null/)
  })

  it('선을 지우기 전에 확인창이 뜨지 않는다. 대신 Ctrl+Z로 되돌릴 수 있다', () => {
    const { shotId } = seedReferencedShot()
    const before = referenceEdges().length
    const edge = referenceEdges()[0]!
    api().deleteEdge(edge.id)
    expect(referenceEdges()).toHaveLength(before - 1)
    api().undo()
    expect(shotData(shotId).characterAssetIds).toEqual(['char-a', 'char-b'])
    expect(referenceEdges()).toHaveLength(before)
    // 선 삭제 경로에는 확인창이 없다.
    const store = read('src/stores/director-store.ts')
    const fn = store.slice(store.indexOf('      deleteEdge: (id) => {'), store.indexOf('      setVideoFinal: (videoNodeId, final) => {'))
    expect(fn).not.toMatch(/openDeleteConfirm|deleteConfirmInfo|confirm\(/)
    expect(fn).toMatch(/get\(\)\.commitHistory\(\)/)
  })
})
