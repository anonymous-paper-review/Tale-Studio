import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  useDirectorCanvasStore,
  getShotStage,
  shotStageLabel,
} from '@/stores/director-store'
import { selectRoughStoryboard } from '@/features/director/hooks/use-rough-storyboard'
import type { ShotNodeData, PromptNodeData } from '@/types/director'
import type { Shot, RoughStoryboardImage } from '@/types'

beforeEach(() => {
  useDirectorCanvasStore.getState().reset()
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

describe('shotStageLabel (진행 버튼 라벨 = 다음 행동)', () => {
  it('단계별 라벨 매핑', () => {
    expect(shotStageLabel('rough')).toBe('실사화')
    expect(shotStageLabel('live')).toBe('영상 생성')
    expect(shotStageLabel('video')).toBe('새 영상 테이크')
  })
})

describe('advanceShot 라우팅', () => {
  it('rough → generateStoryboardImage 호출 (in-place 실사)', async () => {
    const shotId = makeShot()
    const gen = vi.fn().mockResolvedValue(undefined)
    const vid = vi.fn().mockResolvedValue(null)
    useDirectorCanvasStore.setState({ generateStoryboardImage: gen, generateVideoForShot: vid })

    await api().advanceShot(shotId)

    expect(gen).toHaveBeenCalledWith(shotId)
    expect(vid).not.toHaveBeenCalled()
  })

  it('live → generateVideoForShot 호출 (재진입해도 실사 재생성 안 함)', async () => {
    const shotId = makeShot()
    api().updateNodeData<'shot'>(shotId, { storyboardImage: completedImage })
    const gen = vi.fn().mockResolvedValue(undefined)
    const vid = vi.fn().mockResolvedValue(null)
    useDirectorCanvasStore.setState({ generateStoryboardImage: gen, generateVideoForShot: vid })

    await api().advanceShot(shotId)

    expect(vid).toHaveBeenCalledWith(shotId)
    expect(gen).not.toHaveBeenCalled()
  })

  it('video → generateVideoForShot 호출 (새 테이크)', async () => {
    const shotId = makeShot()
    api().addVideoTake(shotId)
    const gen = vi.fn().mockResolvedValue(undefined)
    const vid = vi.fn().mockResolvedValue(null)
    useDirectorCanvasStore.setState({ generateStoryboardImage: gen, generateVideoForShot: vid })

    await api().advanceShot(shotId)

    expect(vid).toHaveBeenCalledWith(shotId)
    expect(gen).not.toHaveBeenCalled()
  })

  it('Shot이 아닌 id는 no-op', async () => {
    const gen = vi.fn().mockResolvedValue(undefined)
    const vid = vi.fn().mockResolvedValue(null)
    useDirectorCanvasStore.setState({ generateStoryboardImage: gen, generateVideoForShot: vid })

    await api().advanceShot('no_such_node')

    expect(gen).not.toHaveBeenCalled()
    expect(vid).not.toHaveBeenCalled()
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

  it('wirePromptToShot이 prompt 엣지를 추가하고 Shot.prompt를 동기', () => {
    const shotId = makeShot()
    const promptId = api().addPromptNode({ x: 0, y: 0 }, '강아지가 소년 옆에 앉아있음')

    api().wirePromptToShot(promptId, shotId)

    const shot = api().nodes.find((n) => n.id === shotId)!
    expect((shot.data as ShotNodeData).prompt).toBe('강아지가 소년 옆에 앉아있음')

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
