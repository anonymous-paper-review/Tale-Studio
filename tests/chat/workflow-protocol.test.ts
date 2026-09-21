// 공통 상태 도구는 세 단계에만 열리고 생성·이동 결과를 저장 성공과 구분한다
import { expect, it } from 'vitest'
import { prepareChatTools } from '@/lib/chat-tools/protocol'
import { guardChatToolReply } from '@/lib/chat-tools/receipt'
it('명시적으로 켠 Producer·Writer·Artist에 공통 상태 도구를 제공한다', () => {
  // 왜: 단계별 데이터 편집 권한은 그대로 두고 공통 상태만 확인할 수 있어야 한다.
  for (const stage of ['producer', 'writer', 'artist']) expect(prepareChatTools(stage, true, [], true)?.tools.map(t => t.name)).toContain('project_workflow')
  expect(prepareChatTools('director', true, [], true)).toBeUndefined()
})
it('이동 요청을 실제 화면 도착이나 저장 완료로 안내하지 않는다', () => {
  // 왜: 라우터가 거절할 수 있으므로 경로 준비만으로 도착을 확정하면 안 된다.
  const reply = guardChatToolReply('Artist 화면을 열었어요.', [{ call: { type: 'tool_use', id: 'm', name: 'project_workflow', input: { action: 'open', targetStage: 'artist' } }, result: { status: 'navigation_requested' } }], true)
  expect(reply).toContain('화면 이동 요청')
  expect(reply).not.toContain('열었어요')
  expect(reply).not.toContain('저장 확인')
})
it('실패한 상태 조회가 다음 조회에서 복구되면 지난 오류로 답변을 덮지 않는다', () => {
  // 왜: 실제 재조회가 성공했는데 처음 실패만 표시하면 복구가 무의미하다.
  const call = { type: 'tool_use' as const, id: 's', name: 'project_workflow', input: { action: 'status' } }
  const reply = guardChatToolReply('Writer가 완료 상태예요.', [{ call, result: { status: 'read_failed' } }, { call: { ...call, id: 's2' }, result: { status: 'ok' } }], true)
  expect(reply).toBe('Writer가 완료 상태예요.')
})
