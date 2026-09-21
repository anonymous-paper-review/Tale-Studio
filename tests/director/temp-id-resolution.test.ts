// 같은 응답에서 추가한 씬·샷을 뒤의 실행에서 정확히 참조한다.
import { beforeEach, expect, it } from 'vitest'
import { useDirectorCanvasStore } from '@/stores/director-store'

beforeEach(() => {
  useDirectorCanvasStore.getState().reset()
})

it('같은 응답에서 추가한 씬·샷을 뒤의 실행에서 정확히 참조한다', () => {
  // 왜: 샷 추가와 생성 승인을 나누어 처리해도 임시 이름이 실제 대상을 잃으면 안 된다.
  const added = useDirectorCanvasStore.getState().applyUpdates([
    { type: 'addScene', label: '새 씬', tempId: 'S1' },
    { type: 'addShot', sceneId: 'S1', label: '같은 이름', tempId: 'H1' },
    { type: 'addShot', sceneId: 'S1', label: '같은 이름', tempId: 'H2' },
    { type: 'addShot', sceneId: '없는 씬', tempId: 'missing' },
  ])

  expect(added.applied).toBe(3)
  expect(added.skipped).toHaveLength(1)
  expect(added.resolvedIds).toEqual({
    S1: expect.any(String),
    H1: expect.any(String),
    H2: expect.any(String),
  })
  const resolvedIds = added.resolvedIds!
  expect(new Set(Object.values(resolvedIds)).size).toBe(3)

  const nodes = useDirectorCanvasStore.getState().nodes
  expect(nodes.find((node) => node.id === resolvedIds.S1)?.data.kind).toBe('scene')
  expect(nodes.find((node) => node.id === resolvedIds.H1)?.data).toMatchObject({
    kind: 'shot',
    parentSceneNodeId: resolvedIds.S1,
  })

  const later = useDirectorCanvasStore.getState().applyUpdates([
    { type: 'updateShot', id: resolvedIds.H1, patch: { prompt: '첫 번째 샷의 새 지시' } },
    { type: 'selectNode', id: resolvedIds.H2 },
  ])
  expect(later.applied).toBe(2)
  expect(later.skipped).toEqual([])
  expect(later.resolvedIds).toEqual({})
  expect(useDirectorCanvasStore.getState().selectedNodeId).toBe(resolvedIds.H2)
  expect(useDirectorCanvasStore.getState().nodes.find((node) => node.id === resolvedIds.H1)?.data)
    .toMatchObject({ promptOverride: '첫 번째 샷의 새 지시' })
})
