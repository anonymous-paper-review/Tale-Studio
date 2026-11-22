// Camera 위 씬 단추 — 고른 씬의 샷만 보드 차례대로 서고, 지금 보는 씬을 Director 노드 보기와 같이 기억하며, 씬 단추로 멘션 · 앞뒤 이동이 되는지 검사한다 (오너 2026-11-22 D2~D5 · D8 · D9, 리드 답 b · g)
import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it } from 'vitest'
import { cameraScene } from '@/features/camera/scene'
import { cameraMentionLabel } from '@/features/camera/mention'
import { boardNodeNames } from '@/features/director/node-label'
import { orderedScenes, sceneButtonItems } from '@/features/director/scene-view'
import { switchDirectorScene } from '@/features/director/hooks/use-scene-view'
import { resolveCurrentScene } from '@/lib/current-scene'
import { translate } from '@/lib/i18n/translate'
import { useCurrentSceneStore } from '@/stores/current-scene-store'
import type { DirectorNode } from '@/types/director'

const sceneNode = (id: string, writerSceneId: string) =>
  ({ id, data: { kind: 'scene', label: writerSceneId, writerSceneId, location: '', timeOfDay: '', mood: '', description: '' } }) as unknown as DirectorNode
const shotNode = (id: string, parentSceneNodeId: string, writerShotId: string) =>
  ({ id, data: { kind: 'shot', label: writerShotId, parentSceneNodeId, writerShotId } }) as unknown as DirectorNode

// 보드 차례: 씬 sc_a(샷 w1 · w2) → 씬 sc_b(샷 w3). 캔버스 노드는 일부러 뒤섞어 둔다.
const nodes = [
  shotNode('n-w2', 'n-sc-a', 'w2'),
  sceneNode('n-sc-b', 'sc_b'),
  shotNode('n-w3', 'n-sc-b', 'w3'),
  sceneNode('n-sc-a', 'sc_a'),
  shotNode('n-w1', 'n-sc-a', 'w1'),
]
const names = boardNodeNames(
  { scenes: [{ sceneId: 'sc_a' }, { sceneId: 'sc_b' }] },
  [{ shotId: 'w1', sceneId: 'sc_a' }, { shotId: 'w2', sceneId: 'sc_a' }, { shotId: 'w3', sceneId: 'sc_b' }],
  'ko',
)
const page = () => readFileSync('src/app/studio/camera/page.tsx', 'utf8')
const hook = () => readFileSync('src/features/camera/use-camera-scene.ts', 'utf8')
const board = () => readFileSync('src/features/camera/camera-board.tsx', 'utf8')

beforeEach(() => {
  useCurrentSceneStore.setState({ sceneByProject: {} })
})

describe('씬 단추와 한 씬 보기', () => {
  it('Camera 위에는 씬 단추가 있고, 고른 씬의 샷만 아래에 보드 차례대로 세로로 선다', () => {
    // 왜: 오너 D2~D5 "위에 씬별 버튼, 아래에 그 씬의 샷이 세로로" — 샷이 많은 프로젝트도 한 씬씩 본다.
    expect(cameraScene(nodes, names, 'sc_a')).toMatchObject({ key: 'sc_a', nodeId: 'n-sc-a', label: '씬 1' })
    expect(cameraScene(nodes, names, 'sc_a')?.shots.map((n) => n.id)).toEqual(['n-w1', 'n-w2'])
    expect(cameraScene(nodes, names, 'sc_b')?.shots.map((n) => n.id)).toEqual(['n-w3'])
    expect(cameraScene(nodes, names, 'gone')).toBeNull()
    expect(cameraScene(nodes, names, null)).toBeNull()
    expect(page()).toMatch(/<SceneButtons\s/)
    expect(page()).toMatch(/<CameraBoard scene=\{scene\}/)
  })

  it('Camera 와 Director 노드 보기는 지금 보는 씬을 같이 기억한다 — Camera 에서 씬을 바꾸면 Director 도 그 씬으로 열리고, 다시 들어와도 그 씬이다', () => {
    // 왜: 리드 11/22 답 b · g — 두 화면이 같은 샷을 씬별로 보므로 오가며 씬을 다시 고르지 않게 한다(프로젝트마다 하나, 이 브라우저에만).
    switchDirectorScene('p-1', 'sc_b')
    const remembered = useCurrentSceneStore.getState().sceneByProject['p-1']
    expect(resolveCurrentScene(orderedScenes(nodes, names).map((s) => s.key), remembered)).toBe('sc_b')
    expect(page()).toMatch(/onChange=\{\(key\) => \{ if \(sceneProjectId\) switchDirectorScene\(sceneProjectId, key\) \}\}/)
    expect(hook()).toMatch(/useCurrentScene\(projectId, keys, preferred\)/)
  })

  it('처음 여는 프로젝트는 만드는 중인 샷이 있는 씬을 먼저 보이고, 확인을 마치면 보인 씬을 기억한다 — 없으면 첫 씬이다', () => {
    // 왜: Director 노드 보기와 같은 규칙(fb-director scene-view) — 만들고 있던 결과를 바로 본다. 기억한 씬이 있으면 그 씬이 먼저다.
    expect(hook()).toMatch(/preferredSceneKey\(nodes, names, hint\.shotIds\)/)
    expect(hook()).toMatch(/const shouldRemember = hint\.settled && !!sceneKey && !remembered/)
    expect(resolveCurrentScene(['sc_a', 'sc_b'], undefined, null)).toBe('sc_a')
  })

  it('씬 단추를 ⌘/Ctrl+클릭하면 씬은 그대로이고 그 씬의 @이름(실사 씬 N)이 채팅에 들어가며, Alt+←/→ 로 앞 · 뒤 씬으로 간다', () => {
    // 왜: 오너 D9 — 씬 단추도 카드처럼 멘션한다. 이름은 Camera 씬 머리 · 채팅 고르기 목록과 같아야 넣고 빼기가 맞는다.
    const items = sceneButtonItems(orderedScenes(nodes, names), nodes, names, { t: (key, params) => translate('ko', key, params), locationName: (slug) => slug })
    expect(items.map((item) => item.mentionLabel)).toEqual([
      cameraMentionLabel({ kind: 'scene', label: '씬 1' }, 'ko'),
      cameraMentionLabel({ kind: 'scene', label: '씬 2' }, 'ko'),
    ])
    expect(page()).toMatch(/cycleWithAltArrows/)
  })

  it('고른 씬에 샷이 없으면 "이 씬에는 아직 샷이 없어요"가 보이고, 씬을 바꾸면 샷 줄 목록이 맨 위에서 시작한다', () => {
    // 왜: 빈 판만 보이면 고장인지 모른다. 앞 씬에서 내려간 자리가 새 씬에 남으면 첫 샷을 못 본다.
    expect(board()).toContain("t('No shots in this scene yet.')")
    expect(page()).toMatch(/<ScrollArea key=\{sceneKey \?\? 'none'\}/)
  })

  it('위쪽 만들기 줄은 씬을 바꿔도 오너 답 전까지 모든 씬의 샷을 센다', () => {
    // 왜: 리드 11/22 — 씬 범위로 좁힐지는 오너 답 뒤(Director 툴바와 한 질문). 그때 범위만 넘기면 된다(work-scope).
    expect(page()).toMatch(/<CameraWorkBar scope=\{null\} \/>/)
  })
})
