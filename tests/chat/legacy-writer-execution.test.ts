// JSON 편집도 저장 결과를 기다리고 생성 뒤 편집 순서를 보존한다
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useWriterStore as writer } from '@/stores/writer-store'
import { useProjectStore as project } from '@/stores/project-store'
import type { Shot } from '@/types'
const original = writer.getState()
beforeEach(() => { writer.getState().reset(); project.getState().resetProject() })
afterEach(() => writer.setState({ addScene: original.addScene, addShot: original.addShot, updateShot: original.updateShot, updateScene: original.updateScene }))
it('저장 실패를 로컬 적용 완료로 세지 않는다', async () => {
  // 왜: 화면 값만 먼저 바뀌고 DB 저장이 실패하는 거짓 성공을 막는다.
  const local = vi.fn();writer.setState({ updateScene: local })
  const executeEdit = vi.fn(async () => ({ status: 'failed', message: 'save failed' }))
  const result = await writer.getState().applyChatUpdates([{ type: 'updateScene', id: 's1', patch: { mood: '긴장' } }], { executeEdit })
  expect(executeEdit).toHaveBeenCalledOnce();expect(local).not.toHaveBeenCalled()
  expect(result.applied).toBe(0);expect(result.skipped).toHaveLength(1)
})
it('새 씬과 샷을 만든 뒤 실제 식별자로 편집을 검증한다', async () => {
  // 왜: 편집을 배열 앞으로 옮기면 같은 응답에서 만든 임시 식별자를 찾을 수 없다.
  const order: string[] = []
  writer.setState({
    addScene: async () => { order.push('scene');return 'saved-scene' },
    addShot: async () => { order.push('shot');writer.setState({ shots: [{ shotId: 'saved-shot', sceneId: 'saved-scene', dialogueLines: [] } as unknown as Shot] });return 'saved-shot' },
  })
  const executeEdit = vi.fn(async (_resource, id) => { order.push(id);return { status: 'ok' } })
  await writer.getState().applyChatUpdates([{ type: 'addScene', tempId: 'temp-scene' }, { type: 'addShot', sceneId: 'temp-scene', tempId: 'temp-shot' }, { type: 'updateShot', id: 'temp-shot', patch: { durationSeconds: 9 } }], { executeEdit })
  expect(order).toEqual(['scene', 'shot', 'saved-shot'])
})
