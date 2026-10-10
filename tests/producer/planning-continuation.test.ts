// 기획 질문에 답하면 남은 기획을 이어가고, 별도로 요청한 설정 변경에는 다른 질문을 붙이지 않는다.
import { describe, expect, it } from 'vitest'
import { buildProducerSystem } from '@/app/api/produce/chat/system-prompt'
import { CHAT_TOOL_GUIDE } from '@/lib/chat-tools/protocol'

describe('Producer 기획 질문의 다음 단계', () => {
  it('기획 중 물은 질문에 답하면 저장 뒤에도 남은 필수 항목으로 대화를 이어간다', () => {
    // 왜: 대사 언어 질문의 답을 독립적인 편집으로 오인하면 저장 확인만 남고 기획이 멈춘다.
    const prompt = buildProducerSystem('ko')
    expect(prompt).toContain('An answer to your preceding planning question continues the existing planning goal')
    expect(prompt).toContain('After saving that answer, ask one focused question about the next remaining required item')
    expect(CHAT_TOOL_GUIDE).toContain('An answer to an ongoing planning question is not a standalone settings edit')
  })

  it('별도로 요청한 설정 변경은 처리한 뒤 다른 기획 질문을 시작하지 않는다', () => {
    // 왜: 기획 답변의 예외를 넓히면 단순 언어 변경에도 새로운 인터뷰를 강요하게 된다.
    expect(buildProducerSystem('ko')).toContain('A specific query or edit is not a request to resume the planning interview.')
    expect(CHAT_TOOL_GUIDE).toContain('Do not introduce unrelated planning questions or choices after a tool result.')
  })
})
