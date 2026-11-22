// 영상의 끝(END) 입력이 없어진 뒤 — 노드에 끝 구멍이 없고, 손 · 채팅 어느 길로도 끝 칸에 새로 잇지 않으며, 저장된 끝 배선은 지우지 않되 선으로 그리지 않고 채팅 문맥에도 싣지 않는지 검사한다 (오너 2026-11-22 밤 "Start, End 프레임 생성 방식은 일단 폐기", 리드 11/23)
import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it } from 'vitest'

import { connectRouteForTargetHandle } from '@/features/director/canvas-interaction'
import { sceneCanvas } from '@/features/director/scene-view'
import { serializeDirectorCanvasContext, useDirectorCanvasStore } from '@/stores/director-store'
import { isVideoData, type DirectorEdge } from '@/types/director'

const read = (file: string) => readFileSync(file, 'utf8')
const api = () => useDirectorCanvasStore.getState()

beforeEach(() => {
  api().reset()
})

function seedVideo() {
  const sceneId = api().addSceneNode({ x: 0, y: 0 }, 'Scene')
  const sourceShotId = api().addShotNode(sceneId, { x: 360, y: 0 }, 'Source')
  const targetShotId = api().addShotNode(sceneId, { x: 360, y: 560 }, 'Target')
  const videoId = api().addVideoTake(targetShotId)!
  return { sceneId, sourceShotId, targetShotId, videoId }
}
const frameInputsOf = (videoId: string) => {
  const video = api().nodes.find((node) => node.id === videoId)
  return video && isVideoData(video.data) ? video.data.frameInputs : null
}

describe('영상 노드의 입력 구멍', () => {
  it('영상 노드에는 이전 영상 · 시작 · 참조 세 입력 구멍만 있고 끝 구멍은 없다', () => {
    // 왜: 오너 11/22 밤 "시작 · 끝 프레임 방식 폐기" — 영상은 끝 그림을 쓰지 않는다(fb-video H1). 없는 칸을 보이면 이어도 아무 일이 없는 구멍이 된다.
    const node = read('src/features/director/canvas-nodes/VideoNode.tsx')
    expect(node).toContain('id="video-chain"')
    expect(node).toContain('id="frame-start"')
    expect(node).toContain('id="frame-ref"')
    expect(node).not.toContain('id="frame-end"')
    // 참조 구멍은 끝 구멍 자리로 한 칸 올린다 — 구멍 사이 20px 그대로(혼자 정한 것 h3).
    expect(node).toMatch(/id="frame-ref"\s*label=\{t\('Reference'\)\}\s*top=\{86\}/)
  })
})

describe('끝 칸 잇기', () => {
  it('스토어는 끝 칸으로 새로 잇지 않는다 — 손으로 잇든 채팅으로 잇든 같다', () => {
    // 왜: 리드 "연결 규칙에서도 END 칸을 빼요" — 잇는 규칙은 스토어 한 곳(wireFrameToVideo)이 정한다. 시작 · 참조는 지금 그대로.
    const { sourceShotId, videoId } = seedVideo()
    api().wireFrameToVideo(sourceShotId, videoId, 'frame-end')
    expect(frameInputsOf(videoId)).toEqual({ start: null, end: null, refs: [] })
    api().wireFrameToVideo(sourceShotId, videoId, 'frame-start')
    expect(frameInputsOf(videoId)).toEqual({ start: sourceShotId, end: null, refs: [] })
    expect(api().edges.filter((edge) => edge.data?.category === 'frame' && edge.target === videoId).map((edge) => edge.targetHandle)).toEqual(['frame-start'])
  })

  it('옛 끝 칸으로 들어오는 연결은 아무 일도 하지 않고 관계 선택 창도 열지 않는다', () => {
    // 왜: 구멍이 없어 보통은 생기지 않지만, 생겨도 엉뚱한 관계 선을 묻지 않는다(혼자 정한 것 h2).
    expect(connectRouteForTargetHandle('frame-end')).toBe('ignore')
    const page = read('src/app/studio/director/page.tsx')
    expect(page).toMatch(/if \(route === 'ignore'\) return/)
    expect(page).not.toContain("targetHandle === 'frame-end'")
  })

  it('채팅 답이 끝 칸 잇기를 보내도 화면은 적용하지 않는다', () => {
    // 왜: 서버가 거르지만 화면도 한 번 더 거른다 — 옛 답 · 잘못된 답이 끝 칸을 다시 살리지 않게(혼자 정한 것 h5).
    const { sourceShotId, videoId } = seedVideo()
    const result = api().applyUpdates([{ type: 'connectFrame', sourceId: sourceShotId, targetId: videoId, targetHandle: 'frame-end' }])
    expect(result.applied).toBe(0)
    expect(result.skipped.map((item) => item.reason)).toEqual(['invalid frame target handle'])
    expect(frameInputsOf(videoId)).toEqual({ start: null, end: null, refs: [] })
  })

  it('Director 채팅 안내는 시작 · 참조 칸만 알리고 끝 칸 잇기 요청은 받지 않는다', () => {
    // 왜: 오너 11/22 밤 — 모델이 끝 그림을 잇겠다고 약속하지 않게 안내에서 빼고, 허용 목록에서도 뺀다.
    const route = read('src/app/api/director/chat/route.ts')
    expect(route).not.toContain('frame-end')
    expect(route).toContain('"targetHandle":"frame-start"|"frame-ref"')
    expect(route).toMatch(/const VALID_FRAME_TARGET_HANDLES = new Set<DirectorVideoFrameTargetHandle>\(\[\s*'frame-start',\s*'frame-ref',\s*\]\)/)
  })
})

describe('저장된 끝 배선', () => {
  it('이미 저장된 끝 배선은 지우지 않는다 — 다시 불러와도 그 값이 남는다', () => {
    // 왜: 리드 "이미 저장된 끝 배선은 지우지 않아요. 서버가 무시해요(fb-video H1)" — 되돌릴 때 사람 배선이 남아 있게.
    const { sourceShotId, videoId } = seedVideo()
    api().updateNodeData<'video'>(videoId, { frameInputs: { start: null, end: sourceShotId, refs: [] } })
    api().rebuildFrameEdges()
    expect(frameInputsOf(videoId)).toEqual({ start: null, end: sourceShotId, refs: [] })
  })

  it('저장된 끝 배선은 캔버스에 선으로 그리지 않는다', () => {
    // 왜: 끝 구멍이 없어 선이 닿을 곳이 없다 — 그대로 두면 React Flow 가 "구멍 없음" 경고를 찍는다(혼자 정한 것 h1). 데이터는 그대로.
    const { sourceShotId, videoId } = seedVideo()
    api().updateNodeData<'video'>(videoId, { frameInputs: { start: sourceShotId, end: sourceShotId, refs: [] } })
    api().rebuildFrameEdges()
    const store = api()
    const frameEdges = (edges: readonly DirectorEdge[]) => edges.filter((edge) => edge.data?.category === 'frame').map((edge) => edge.targetHandle).sort()
    expect(frameEdges(sceneCanvas(store.nodes, store.edges, null).edges)).toEqual(['frame-start'])
  })

  it('Director 채팅 문맥(캔버스 글)에는 영상의 끝 입력을 싣지 않는다', () => {
    // 왜: 영상은 끝 그림을 쓰지 않는다 — 문맥에 남으면 모델이 끝 그림대로 된다고 약속한다(혼자 정한 것 h4).
    const { sourceShotId, videoId } = seedVideo()
    api().updateNodeData<'video'>(videoId, { frameInputs: { start: sourceShotId, end: sourceShotId, refs: [] } })
    const context = serializeDirectorCanvasContext(api())
    expect(context).toContain(`START=${sourceShotId}`)
    expect(context).not.toContain('END=')
  })
})
