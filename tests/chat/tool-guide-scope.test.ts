// 채팅 도구 안내 · 도구 목록이 그 요청에 준 도구만 말하는지 — 고치기 도구가 없으면 고치기 문장도 없고, 화면 열기에 Writer 콘티가 있는지 검사한다 (검토 rev-flow 리드 2 · 6 · 7, 오너 2026-11-27 N3)
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { CHAT_TOOL_GUIDE, chatToolGuide, prepareChatTools, rejectedToolCallIds } from '@/lib/chat-tools/protocol'

const schemaOf = (tools: Array<{ name: string; input_schema?: unknown }>, name: string) =>
  (tools.find((tool) => tool.name === name)?.input_schema as { properties: Record<string, { enum?: string[] }> }).properties

describe('도구 안내는 준 도구만 말한다', () => {
  // 왜(리드 2): Storyboard 채팅은 고치기 도구가 없는데 안내가 "read_project 와 edit_project 로 고친다"고 하면 모델이 없는 도구를 부르거나 고쳤다고 말한다.
  it('고치기 도구를 주지 않은 채팅의 도구 안내에는 고치기 문장이 없다', () => {
    const tools = prepareChatTools('writer', true, [], true, true, { edit: false, resume: false })!.tools
    const guide = chatToolGuide(tools)
    expect(guide).not.toContain('edit_project')
    expect(guide).not.toMatch(/Before editing|Supported edits must use tools|compound edit-then-move/)
    expect(guide).toContain('read_project')
    expect(guide).toMatch(/read-only/i)
  })

  // 왜(리드 7): 실행 다시 돌리기(resume)를 주지 않은 채팅에 그 쓰임을 안내하면 모델이 다시 돌리겠다고 한다.
  it('실행 다시 돌리기를 주지 않은 채팅의 도구 안내에는 다시 돌리기 문장이 없다', () => {
    const tools = prepareChatTools('writer', true, [], true, true, { edit: false, resume: false })!.tools
    expect(chatToolGuide(tools)).not.toMatch(/resume restarts/)
  })

  // 왜(정상 경로 고정): 고치기 · 다시 돌리기 도구를 다 준 채팅(콘티 · Producer · Artist)은 안내 글자 하나 바뀌지 않는다.
  it('고치기 도구를 준 채팅의 도구 안내는 지금 그대로다', () => {
    for (const stage of ['conti', 'producer', 'artist']) {
      expect(chatToolGuide(prepareChatTools(stage, true, [], true, true)!.tools)).toBe(CHAT_TOOL_GUIDE)
    }
  })

  // 왜(리드 2): 안내를 고르는 곳이 모델 호출 한 곳이어야 모든 채팅이 같은 규칙을 쓴다.
  it('모델 호출은 그 요청에 준 도구로 도구 안내를 고른다', () => {
    expect(readFileSync('src/lib/claude.ts', 'utf8')).toMatch(/chatToolGuide\(opts\.appTools\.tools\)/)
  })
})

describe('도구 목록', () => {
  // 왜(리드 7 · 오너 N3): 씬 · 샷을 다시 나누는 실행 다시 돌리기는 콘티의 일이다 — Storyboard 요청의 화면 도구에는 그 동작이 없다.
  it('실행 다시 돌리기를 빼면 화면 도구의 동작 목록에 resume 이 없고, 빼지 않으면 지금처럼 있다', () => {
    expect(schemaOf(prepareChatTools('writer', true, [], true, true, { resume: false })!.tools, 'project_workflow').action.enum).not.toContain('resume')
    expect(schemaOf(prepareChatTools('conti', true, [], true, true)!.tools, 'project_workflow').action.enum).toContain('resume')
  })

  // 왜(리드 6): Storyboard 채팅이 "Writer 콘티에서 고쳐요"라고 안내한다 — 화면 열기 대상에 콘티가 있어야 사람이 부탁할 때 연다.
  it('화면 열기 도구의 대상에 Writer 콘티가 있다', () => {
    expect(schemaOf(prepareChatTools('conti', true, [], true, true)!.tools, 'project_workflow').targetStage.enum).toContain('conti')
    expect(CHAT_TOOL_GUIDE).toMatch(/"conti" is the rough storyboard/)
  })

  // 왜(리드 2 · architecture §3): 모델이 그 요청에 주지 않은 이름의 도구를 부르면 서버가 거절한다(화면은 실행하지 않는다).
  it('그 요청에 주지 않은 이름의 도구 호출만 거절 목록에 든다', () => {
    const tools = prepareChatTools('writer', true, [], true, true, { edit: false })!.tools
    const turn = { stopReason: 'tool_use', content: [
      { type: 'tool_use', id: 'a', name: 'edit_project', input: {} },
      { type: 'tool_use', id: 'b', name: 'read_project', input: { resource: 'shots' } },
      { type: 'text', text: '확인할게요.' },
    ] }
    expect(rejectedToolCallIds(turn, tools)).toEqual(['a'])
  })
})
