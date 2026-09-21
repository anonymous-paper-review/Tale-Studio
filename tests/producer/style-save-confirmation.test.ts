// 그림체 변경은 실제 저장값을 확인하며 저장 실패나 프로젝트 전환을 성공으로 표시하지 않는다
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const db = vi.hoisted(() => ({ write: vi.fn(), read: vi.fn() }))
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ from: () => ({
  update: () => ({ eq: () => db.write() }),
  select: () => ({ eq: () => ({ maybeSingle: () => db.read() }) }),
}) }), createCatalogClient: vi.fn() }))
vi.mock('@/lib/chat-persistence', () => ({ saveChatMessage: vi.fn(), saveChatTrace: vi.fn(), saveChatTracePatch: vi.fn(), loadLatestChatTrace: vi.fn() }))
import { useProducerStore as producer } from '@/stores/producer-store'
import { useProjectStore as project } from '@/stores/project-store'
import { useGlobalChatStore as chat } from '@/stores/global-chat-store'
import { useLocaleStore } from '@/stores/locale-store'
beforeEach(() => {
  vi.clearAllMocks();project.getState().resetProject();producer.getState().reset();chat.getState().reset()
  useLocaleStore.setState({ locale: 'ko' })
  project.setState({ projectId: 'style-save', currentStage: 'producer', reachedStage: 'producer', projectLocale: 'ko' })
  producer.setState({ styleAnchors: [{ key: 'watercolor', label: '수채화' }] as never, styleAnchorKey: 'old' })
  db.write.mockResolvedValue({ error: null })
  db.read.mockResolvedValue({ data: { style_anchor_key: 'watercolor', custom_style_anchor: null }, error: null })
})
afterEach(() => vi.unstubAllGlobals())
it('도구 입력 오류 뒤 JSON 그림체 저장이 끝나면 채팅에도 저장 확인을 표시한다', async () => {
  // 왜: 실제 DEV에서 저장은 수채화인데 답변에는 도구 입력 오류가 남았던 경로를 재현한다.
  let count = 0
  vi.stubGlobal('fetch', vi.fn(async () => {
    if (++count === 1) return Response.json({ toolTurn: { stopReason: 'tool_use', content: [{ type: 'tool_use', id: 'style', name: 'edit_project', input: { resource: 'settings', id: 'settings', revision: 'unused', patch: { styleAnchorKey: 'watercolor' } } }] } })
    return Response.json({ reply: '그림체를 변경하지 못했어요.', extractedSettings: { styleAnchorKey: 'watercolor' } })
  }))
  await chat.getState().sendMessage('그림체를 수채화로 바꿔줘')
  expect(db.read).toHaveBeenCalledOnce()
  expect(chat.getState().messages.at(-1)?.content).toContain('저장 확인')
  expect(chat.getState().messages.at(-1)?.content).not.toContain('변경하지 못')
  expect(chat.getState().messages.at(-1)?.content).not.toContain('Invalid input')
})
it('그림체를 저장한 뒤 저장값이 일치할 때만 적용 완료를 반환한다', async () => {
  // 왜: 정상 경로 고정. 로컬 선택 표시와 실제 저장을 구분한다.
  expect(await producer.getState().applyStyleAnchorKeyFromChat('watercolor')).toBe('applied')
  expect(db.read).toHaveBeenCalledOnce()
})
it('그림체 저장이 거절되면 적용 완료를 반환하지 않는다', async () => {
  // 왜: 하위 저장 함수가 오류를 잡아도 상위 채팅이 성공으로 처리하면 안 된다.
  db.write.mockResolvedValue({ error: { message: 'save rejected' } })
  expect(await producer.getState().applyStyleAnchorKeyFromChat('watercolor')).toBe('failed')
  expect(producer.getState().styleAnchorKey).toBe('old')
})
it('저장된 그림체가 요청과 다르면 적용 완료를 반환하지 않는다', async () => {
  // 왜: 대상 행 누락이나 변경 충돌을 성공 응답만으로 놓치면 안 된다.
  db.read.mockResolvedValue({ data: { style_anchor_key: 'old' }, error: null })
  expect(await producer.getState().applyStyleAnchorKeyFromChat('watercolor')).toBe('failed')
})
it('그림체 저장 중 프로젝트가 바뀌면 새 프로젝트의 선택값을 되돌리지 않는다', async () => {
  // 왜: 이전 요청의 늦은 오류가 새 프로젝트를 덮는 상황을 막는다.
  db.write.mockImplementation(async () => {
    project.setState({ projectId: 'new-project' });producer.setState({ styleAnchorKey: 'new-project-style' })
    return { error: { message: 'old error' } }
  })
  expect(await producer.getState().applyStyleAnchorKeyFromChat('watercolor')).toBe('failed')
  expect(producer.getState().styleAnchorKey).toBe('new-project-style')
})
