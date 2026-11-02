// Director 캔버스 · 격자 · 채팅 @멘션 · 채팅 모델에 보내는 캔버스 목록이 샷과 씬을 보드와 같은 전체 번호로 부르는지 검사한다
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { boardNodeNames, directorMentionTargets, directorNodeLabel, sortByBoard } from '@/features/director/node-label'
import { sceneShotMentions } from '@/lib/card-mention'
import { serializeDirectorCanvasContext } from '@/stores/director-store'
import { CHAT_OUTPUT_FORMAT_GUIDE } from '@/lib/chat-format'
import type { DirectorNode } from '@/types/director'

// 씬 2 를 나중에 끼워 넣은 보드 — 씬 id 숫자(03)와 보드 씬 번호(2)가 다르고, 샷 id 숫자와 보드 샷 번호도 다르다.
const manifest = { scenes: [{ sceneId: 'sc_01' }, { sceneId: 'sc_03' }, { sceneId: 'sc_02' }] }
const writerShots = [
  { shotId: 'sh_01_01', sceneId: 'sc_01' },
  { shotId: 'sh_01_04', sceneId: 'sc_01' },
  { shotId: 'sh_03_05', sceneId: 'sc_03' },
  { shotId: 'sh_02_02', sceneId: 'sc_02' },
  { shotId: 'sh_02_03', sceneId: 'sc_02' },
]
const names = boardNodeNames(manifest, writerShots)

function sceneNode(id: string, writerSceneId: string | null, label = writerSceneId ?? 'New Scene'): DirectorNode {
  return { id, type: 'scene', position: { x: 0, y: 0 }, data: { kind: 'scene', label, writerSceneId, location: '', timeOfDay: '', mood: '', description: '' } } as unknown as DirectorNode
}
function shotNode(id: string, writerShotId: string | null, parentSceneNodeId: string | null, label = writerShotId ?? 'New Shot'): DirectorNode {
  return {
    id, type: 'shot', position: { x: 0, y: 0 },
    data: {
      kind: 'shot', label, writerShotId, parentSceneNodeId, prompt: 'p', referenceImages: [], imageInputs: [], storyboardImage: null, characterAssetIds: [], worldAssetIds: [],
      camera: { horizontal: 0, vertical: 0, pan: 0, tilt: 0, roll: 0, zoom: 0 }, lighting: { position: 'front', brightness: 50, colorTemp: 5000 }, cameraPreset: {}, provider: 'seedance', durationSeconds: 4, generationMethod: 'I2V',
    },
  } as unknown as DirectorNode
}

describe('Director 도 보드와 같은 전체 번호', () => {
  // 왜: 오너 2026-11-02 전체 번호로 통일 — Director 카드는 id 숫자로 "Shot 2"(sh_02_02)라 불렀는데 보드에서는 "Scene 3 · Shot 4"였다.
  //   씬도 id 숫자(sc_03 → "Scene 3")가 아니라 보드 순서로 센다.
  it('Director 캔버스 샷 카드 · 노드 이름은 보드와 같은 전체 번호로 "Shot 8"처럼 부른다', () => {
    expect(directorNodeLabel(shotNode('n1', 'sh_02_02', null).data, names)).toBe('Shot 4')
    expect(directorNodeLabel(shotNode('n2', 'sh_03_05', null).data, names)).toBe('Shot 3')
    expect(directorNodeLabel(sceneNode('s3', 'sc_03').data, names)).toBe('Scene 2')
    for (const file of ['src/features/director/canvas-views/StoryboardGridView.tsx', 'src/features/director/canvas-nodes/ShotNode.tsx', 'src/features/director/canvas-nodes/VideoNode.tsx', 'src/features/director/canvas-popups/CanvasContextMenu.tsx']) {
      const src = readFileSync(file, 'utf8')
      expect(src).toContain('directorNodeLabel(')
      expect(src).not.toMatch(/prettyNodeLabel\((node\.)?data\.label\)/)
    }
  })

  // 왜: 이름은 보여 줄 때만 바꾼다 — 사람이 바꾼 이름이나 Director 에서 직접 만든 노드는 보드에 없으니 지금 이름을 그대로 둔다.
  it('이름을 바꾼 노드나 Director 에서 만든 노드는 지금 이름을 그대로 보인다', () => {
    expect(directorNodeLabel(shotNode('n1', 'sh_02_02', null, 'river_gaze').data, names)).toBe('river_gaze')
    expect(directorNodeLabel(shotNode('n9', null, null).data, names)).toBe('New Shot')
    expect(directorNodeLabel(sceneNode('s9', null, 'Opening').data, names)).toBe('Opening')
  })

  // 왜: 오너 2026-11-02 전체 번호로 통일 — @멘션도 카드와 같은 이름이어야 "@Previz Shot 4"가 그 카드를 가리킨다. 옛 이름(id 숫자)은 씬이 달라도 "Shot 2"가 겹쳤다.
  it('Director 채팅 @멘션도 보드와 같은 전체 번호로 "Previz Shot 8"처럼 부른다', () => {
    const nodes = [sceneNode('s1', 'sc_01'), sceneNode('s3', 'sc_03'), shotNode('n1', 'sh_02_02', 's2'), shotNode('n2', 'sh_01_04', 's1')]
    const labels = sceneShotMentions(directorMentionTargets(nodes, names), 'previz').map((m) => m.label)
    expect(labels).toEqual(['Previz Scene 1', 'Previz Scene 2', 'Previz Shot 4', 'Previz Shot 2'])
    const chat = readFileSync('src/components/layout/global-chat.tsx', 'utf8')
    expect(chat).toMatch(/directorMentionTargets\(directorNodes, directorNames\)/)
  })

  // 왜: 멘션 이름이 보드 번호가 되면 모델은 id(sh_02_02)만 보고는 "Shot 4"를 찾을 수 없다 — 캔버스 목록에 보드 이름을 붙이고, 그 이름으로 찾고 답하라고 알린다.
  it('Director 채팅 모델에 보내는 캔버스 목록에 보드 이름이 붙고, 그 이름으로 찾고 답하라고 알린다', () => {
    const context = serializeDirectorCanvasContext(
      { nodes: [sceneNode('s3', 'sc_03'), shotNode('n2', 'sh_03_05', 's3')], edges: [], selectedNodeId: null },
      names,
    )
    expect(context).toContain('Scene "sc_03" (board: Scene 2)')
    expect(context).toContain('Shot "sh_03_05" (board: Scene 2 · Shot 3)')
    expect(readFileSync('src/app/api/director/chat/route.ts', 'utf8')).toContain('<shot-numbers>')
    expect(readFileSync('src/stores/global-chat-store.ts', 'utf8')).toMatch(/serializeDirectorCanvasContext\([\s\S]{0,160}?boardNodeNames\(/)
    // 모든 단계가 함께 쓰는 답 쓰기 규칙도 id 숫자 이름("Scene 2 · Shot 7")을 가르치지 않는다.
    expect(CHAT_OUTPUT_FORMAT_GUIDE).not.toContain('"Scene 2 · Shot 7"')
    expect(CHAT_OUTPUT_FORMAT_GUIDE).toContain('보드 이름')
  })

  // 왜: 이름이 보드 번호가 되면, 나중에 끼워 넣은 샷이 격자 끝에 붙어 "Shot 1, 2, 4, 5, 3"처럼 보였다 — 격자도 보드 순서로 늘어놓는다.
  it('Director 격자는 씬과 샷을 보드 순서대로 늘어놓고, 보드에 없는 노드는 원래 순서대로 뒤에 둔다', () => {
    const scenes = [sceneNode('s2', 'sc_02'), sceneNode('sx', null, 'Extra'), sceneNode('s1', 'sc_01'), sceneNode('s3', 'sc_03')]
    expect(sortByBoard(scenes, names).map((n) => n.id)).toEqual(['s1', 's3', 's2', 'sx'])
    const shots = [shotNode('a', 'sh_01_04', 's1'), shotNode('m', null, 's1'), shotNode('b', 'sh_01_01', 's1')]
    expect(sortByBoard(shots, names).map((n) => n.id)).toEqual(['b', 'a', 'm'])
    expect(readFileSync('src/features/director/canvas-views/StoryboardGridView.tsx', 'utf8')).toContain('sortByBoard(')
  })
})
