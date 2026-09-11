// 설명·인용·부정 요청을 실행 재개 허락으로 사용하지 않는다
import { expect, it } from 'vitest'
import { workflowPermission } from '@/stores/chat-workflow-bindings'
it.each(['재개할 수 있는지 알려줘', '실행 재시도는 어떻게 해?', '"실행 재개해줘"라는 예시를 설명해줘', '재개하지 마', 'Can you explain how to resume?'])('설명 요청은 실행을 시작하지 않는다: %s', message => {
  // 왜: 도구를 잘못 선택한 모델이 실제 생성 실행까지 시작하지 못하게 한다.
  expect(workflowPermission(message, 'resume')).toBe(false)
})
it('명시적으로 기존 실행을 재개해 달라고 하면 허용한다', () => {
  // 왜: 복구 경로는 실제 사용자가 요청한 실행 재개를 처리해야 한다.
  expect(workflowPermission('중단된 Writer 실행을 재개해줘', 'resume')).toBe(true)
})
it('이미지 생성 금지는 별도로 요청한 기존 Artist 화면 이동을 막지 않는다', () => {
  // 왜: 비용을 제한한 복합 요청도 저장 확인 후 기존 화면을 열 수 있어야 한다.
  expect(workflowPermission('샷을 9초로 바꾼 다음 Artist로 이동해줘. 이미지 생성은 하지 마.', 'open', 'artist')).toBe(true)
  expect(workflowPermission('Artist로 이동하지 마. 이미지 생성은 하지 마.', 'open', 'artist')).toBe(false)
  expect(workflowPermission('실행을 재개해줘. 이미지 생성은 하지 마.', 'resume')).toBe(false)
})
