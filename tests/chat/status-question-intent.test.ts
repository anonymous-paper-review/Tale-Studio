// 이동 가능 여부를 묻는 실측 문장을 실제 이동 요청으로 처리하지 않는다
import { expect, it } from 'vitest'
import { matchHandoffIntent } from '@/lib/handoff-intent'
import { workflowPermission } from '@/stores/chat-workflow-bindings'
it('Artist로 이동할 수 있는지 조회만 요청하면 화면을 이동하지 않는다', () => {
  // 왜: DEV 실측에서 이 질문이 모델 호출 없이 Artist로 이동했다.
  const message = '지금 이 프로젝트의 Writer 실행 상태와 Artist로 이동할 수 있는지 확인해서 짧게 알려줘. 조회만 해줘.'
  expect(matchHandoffIntent(message, 'writer')).toBeNull()
  expect(workflowPermission(message, 'open', 'artist')).toBe(false)
})
