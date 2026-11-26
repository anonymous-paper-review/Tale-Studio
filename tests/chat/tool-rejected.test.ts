// 서버가 거절한 도구 호출과 그 화면에서 쓸 수 없는 고치기 호출을 화면이 실행하지 않고, 쓸 수 없다는 결과를 모델에 돌려주는지 검사한다 (검토 rev-flow 리드 2, 오너 2026-11-27 N3)
import { describe, expect, it, vi } from 'vitest'
import { runChatToolLoop } from '@/lib/chat-tools/loop'
import { toolCallAllowedOnStage } from '@/lib/chat-tools/protocol'

const scope = () => ({ signal: new AbortController().signal, isCurrent: () => true })

describe('거절된 도구 호출', () => {
  // 왜(리드 2): 모델이 주지 않은 도구(고치기)를 부르면 서버가 거절 목록에 담는다 — 화면이 그대로 실행하면 Storyboard 에서 글이 바뀐다.
  //   실행한 고치기가 아니므로 실행 결과(영수증 · 고치기 확인)에도 넣지 않는다 — 넣으면 "실행 결과 - …: unsupported" 줄이 사람 말 대신 남는다.
  it('서버가 거절한 도구 호출은 화면이 실행하지 않고, 쓸 수 없다는 결과를 모델에 돌려주며 실행 결과로 세지 않는다', async () => {
    const edit = { type: 'tool_use', id: 'e1', name: 'edit_project', input: { resource: 'dialogue', id: 'sh_01_02', revision: 'r', patch: { text: '잘 가' } } }
    const sent: unknown[] = []
    const request = vi.fn(async (messages: unknown[]) => {
      sent.push(structuredClone(messages))
      return sent.length === 1
        ? { toolTurn: { content: [edit], stopReason: 'tool_use' }, rejectedToolCalls: ['e1'] }
        : { toolSupport: true, reply: '대사는 Writer 콘티에서 고칠 수 있어요.' }
    })
    const execute = vi.fn()
    const result = await runChatToolLoop({ request, execute, requireEdit: false, ...scope() })
    expect(execute).not.toHaveBeenCalled()
    expect(result.results).toEqual([])
    expect(result.data.reply).toBe('대사는 Writer 콘티에서 고칠 수 있어요.')
    const returned = (sent[1] as Array<{ role: string; content: Array<{ type: string; tool_use_id?: string; is_error?: boolean; content?: string }> }>).at(-1)!.content[0]
    expect(returned).toMatchObject({ type: 'tool_result', tool_use_id: 'e1', is_error: true })
    expect(returned.content).toContain('unsupported')
  })

  // 왜(리드 2 · 오너 N3): 서버 목록과 따로, Storyboard 화면은 고치기 도구를 실행하지 않는다 — 콘티 · Artist 는 그대로 실행한다.
  it('Storyboard 화면은 고치기 도구 호출을 실행하지 않고, 콘티 · Artist 화면은 지금처럼 실행한다', () => {
    expect(toolCallAllowedOnStage('writer', 'edit_project')).toBe(false)
    expect(toolCallAllowedOnStage('writer', 'read_project')).toBe(true)
    expect(toolCallAllowedOnStage('conti', 'edit_project')).toBe(true)
    expect(toolCallAllowedOnStage('artist', 'edit_project')).toBe(true)
  })
})
