// 영상의 끝(END) 입력이 없어진 뒤 — 노드에 끝 구멍이 없고, 손 · 채팅 어느 길로도 끝 칸에 새로 잇지 않으며, 저장된 끝 배선은 지우지 않되 선으로 그리지 않고 채팅 문맥에도 싣지 않는다 (오너 dev 때 "Start, End 프레임 생성 방식은 일단 폐기" · 2026-11-27 N4a)
import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it } from 'vitest'

import { connectRouteForTargetHandle } from '@/features/director/canvas-interaction'
import { serializeDirectorCanvasContext, useDirectorCanvasStore } from '@/stores/director-store'
import { isVideoData } from '@/types/director'

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
const frameHandlesInto = (videoId: string) =>
  api().edges.filter((edge) => edge.data?.category === 'frame' && edge.target === videoId).map((edge) => edge.targetHandle).sort()

describe('같이 정한 것', () => {
  // 왜: 오너 "시작 · 끝 프레임 방식 폐기" — 영상은 끝 그림을 쓰지 않는다. 끝 칸을 남겨 두면 이어도 아무 일이 없는 구멍이 되고,
  //   잇는 규칙은 스토어 한 곳(wireFrameToVideo)이 정한다. 이미 저장된 끝 배선은 되돌릴 때를 위해 지우지 않는다.
  it('영상의 끝(END) 칸으로는 새로 잇지 않는다 — 저장된 끝 배선은 지우지 않되 그리지 않고 채팅 문맥에도 싣지 않는다', () => {
    const node = read('src/features/director/canvas-nodes/VideoNode.tsx')
    expect(node).toContain('id="video-chain"')
    expect(node).toContain('id="frame-start"')
    expect(node).toContain('id="frame-ref"')
    expect(node).not.toContain('id="frame-end"')

    const { sourceShotId, videoId } = seedVideo()
    api().wireFrameToVideo(sourceShotId, videoId, 'frame-end')
    expect(frameInputsOf(videoId)).toEqual({ start: null, end: null, refs: [] })
    api().wireFrameToVideo(sourceShotId, videoId, 'frame-start')
    expect(frameInputsOf(videoId)).toEqual({ start: sourceShotId, end: null, refs: [] })

    api().updateNodeData<'video'>(videoId, { frameInputs: { start: sourceShotId, end: sourceShotId, refs: [] } })
    api().rebuildFrameEdges()
    expect(frameInputsOf(videoId)).toEqual({ start: sourceShotId, end: sourceShotId, refs: [] })
    expect(frameHandlesInto(videoId)).toEqual(['frame-start'])
    const context = serializeDirectorCanvasContext(api())
    expect(context).toContain(`START=${sourceShotId}`)
    expect(context).not.toContain('END=')
  })
})

describe('혼자 정한 것', () => {
  // 왜: 끝 구멍이 없어진 자리로 참조 구멍을 한 칸 올린다 — 구멍 사이 20px 그대로(dev 2fe85ee8 와 같다).
  it('영상 노드에는 이전 영상 · 시작 · 참조 세 입력 구멍만 있고, 참조 구멍이 끝 구멍 자리로 올라온다', () => {
    const node = read('src/features/director/canvas-nodes/VideoNode.tsx')
    expect(node).toMatch(/id="frame-ref"\s*label=\{t\('Reference'\)\}\s*top=\{86\}/)
  })

  // 왜: 구멍이 없어 보통은 생기지 않지만, 옛 끝 칸으로 연결이 들어와도 엉뚱한 관계 선을 묻지 않는다.
  it('옛 끝 칸으로 들어오는 연결은 아무 일도 하지 않고 관계 선택 창도 열지 않는다', () => {
    expect(connectRouteForTargetHandle('frame-end')).toBe('ignore')
    const page = read('src/app/studio/director/page.tsx')
    expect(page).toMatch(/if \(route === 'ignore'\) return/)
    expect(page).not.toContain("targetHandle === 'frame-end'")
  })

  // 왜: 서버가 거르지만 화면도 한 번 더 거른다 — 옛 답 · 잘못된 답이 끝 칸을 다시 살리지 않게.
  it('채팅 답이 끝 칸 잇기를 보내도 화면은 적용하지 않는다', () => {
    const { sourceShotId, videoId } = seedVideo()
    const result = api().applyUpdates([{ type: 'connectFrame', sourceId: sourceShotId, targetId: videoId, targetHandle: 'frame-end' }])
    expect(result.applied).toBe(0)
    expect(frameInputsOf(videoId)).toEqual({ start: null, end: null, refs: [] })
  })

  // 왜: 모델이 끝 그림을 잇겠다고 약속하지 않게 Director 채팅 안내에서 빼고, 허용 목록에서도 뺀다.
  it('Director 채팅 안내는 시작 · 참조 칸만 알리고 끝 칸 잇기 요청은 받지 않는다', () => {
    const route = read('src/app/api/director/chat/route.ts')
    expect(route).not.toContain('frame-end')
    expect(route).toContain('"targetHandle":"frame-start"|"frame-ref"')
    expect(route).toMatch(/const VALID_FRAME_TARGET_HANDLES = new Set<DirectorVideoFrameTargetHandle>\(\[\s*'frame-start',\s*'frame-ref',\s*\]\)/)
  })
})
