// Director 채팅에 보내는 캔버스 글에 "지금 보는 씬" 한 줄이 들어가 "이 씬"이 그 씬을 뜻하는지 검사한다 (오너 D8 · 리드 11/22 답 e)
import { beforeEach, describe, expect, it } from 'vitest'

import { boardNodeNames } from '@/features/director/node-label'
import { useCurrentSceneStore } from '@/stores/current-scene-store'
import { serializeDirectorCanvasContext } from '@/stores/director-store'
import type { DirectorNode } from '@/types/director'

const names = boardNodeNames({ scenes: [{ sceneId: 'sc_01' }, { sceneId: 'sc_02' }] }, [{ shotId: 'sh_02_01', sceneId: 'sc_02' }], 'ko')
const nodes = [
  { id: 'S1', position: { x: 0, y: 0 }, data: { kind: 'scene', label: 'sc_01', writerSceneId: 'sc_01', location: '', timeOfDay: '', mood: '' } },
  { id: 'S2', position: { x: 0, y: 0 }, data: { kind: 'scene', label: 'sc_02', writerSceneId: 'sc_02', location: '', timeOfDay: '', mood: '' } },
] as unknown as DirectorNode[]

beforeEach(() => useCurrentSceneStore.setState({ sceneByProject: {} }))

describe('채팅 문맥의 지금 보는 씬', () => {
  it('Director 채팅에 지금 보는 씬을 알려 "이 씬"이 그 씬을 뜻하게 한다', () => {
    // 왜: 캔버스가 한 씬만 보이니 사용자는 "이 씬 영상 만들어줘"처럼 말한다 — 모델이 어느 씬인지 알아야 한다(리드 답 e, 혼자 정한 것).
    useCurrentSceneStore.getState().setCurrentScene('p1', 'sc_02')
    const context = serializeDirectorCanvasContext({ projectId: 'p1', nodes, edges: [], selectedNodeId: null }, names)
    expect(context).toContain('The user is looking at [S2] (board: 씬 2)')
    expect(context).toContain('"this scene"')
  })

  it('기억한 씬이 없으면 화면이 여는 첫 씬을 지금 보는 씬으로 알린다', () => {
    // 왜: 화면과 채팅이 같은 규칙(기억한 씬 > 첫 씬)으로 씬을 정해야 서로 다른 씬을 말하지 않는다.
    const context = serializeDirectorCanvasContext({ projectId: 'p1', nodes, edges: [], selectedNodeId: null }, names)
    expect(context).toContain('The user is looking at [S1] (board: 씬 1)')
  })

  it('씬이 없거나 프로젝트를 모르면 지금 보는 씬 줄을 쓰지 않는다', () => {
    // 왜: 없는 씬을 말하지 않는다.
    expect(serializeDirectorCanvasContext({ projectId: 'p1', nodes: [], edges: [], selectedNodeId: null }, names)).not.toContain('The user is looking at')
    expect(serializeDirectorCanvasContext({ nodes, edges: [], selectedNodeId: null }, names)).not.toContain('The user is looking at')
  })
})
