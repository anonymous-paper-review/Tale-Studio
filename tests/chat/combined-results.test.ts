// 도구와 기존 JSON의 같은 변경을 함께 판단하되 다른 필드의 실패는 보존한다
import { describe, expect, it } from 'vitest'
import { guardChatToolReply } from '@/lib/chat-tools/receipt'
import type { ToolOutcome } from '@/lib/chat-tools/protocol'
const edit = (patch: Record<string, unknown>, status: string, source = 'tool'): ToolOutcome => ({
  call: { type: 'tool_use', id: source, name: 'edit_project', input: { resource: 'settings', id: 'settings', patch } },
  result: { status, source },
})
describe('작업별 최종 결과', () => {
  it('도구 실패 뒤 같은 변경이 JSON 경로로 저장되면 최종 안내는 저장 결과를 따른다', () => {
    // 왜: 그림체는 수채화로 저장됐는데 도구의 입력 오류가 최종 답변에 남은 실제 사례.
    const reply = guardChatToolReply('그림체를 변경하지 못했어요.', [edit({ styleAnchorKey: 'watercolor' }, 'invalid_input'), edit({ styleAnchorKey: 'watercolor' }, 'ok', 'json')], true)
    expect(reply).toContain('저장 확인')
    expect(reply).not.toContain('변경하지 못')
    expect(reply).not.toContain('잘못된 입력')
  })
  it('같은 설정에서 다른 필드가 성공해도 앞선 필드의 실패를 지우지 않는다', () => {
    // 왜: 한 요청에서 그림체와 언어를 바꿀 때 마지막 성공이 전체 성공으로 표시되면 안 된다.
    const reply = guardChatToolReply('모두 변경했어요.', [edit({ dialogueLanguage: 'ko' }, 'failed'), edit({ styleAnchorKey: 'watercolor' }, 'ok', 'json')], true)
    expect(reply).toContain('저장 실패')
    expect(reply).toContain('저장 확인')
    expect(reply).not.toContain('모두 변경')
  })
})
