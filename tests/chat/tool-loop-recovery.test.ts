// 응답 복구 중 저장을 중복 실행하지 않고 중단 전에 확인한 결과와 미완성 답변을 보존한다.
import { describe, expect, it, vi } from 'vitest'
import { runChatToolLoop, type ChatToolResponse } from '@/lib/chat-tools/loop'
import type { ToolCall, ToolMessage, ToolOutcome, ToolResult } from '@/lib/chat-tools/protocol'

const edit = (id: string, patch: Record<string, unknown>, revision = 'r1'): ToolCall => ({
  type: 'tool_use', id, name: 'edit_project', input: { resource: 'settings', id: 'settings', revision, patch },
})
const read = (id: string): ToolCall => ({ type: 'tool_use', id, name: 'read_project', input: { resource: 'settings', id: 'settings' } })
const turn = (...content: ToolCall[]): ChatToolResponse => ({ toolTurn: { content, stopReason: 'tool_use' } })
const scope = () => ({ signal: new AbortController().signal, isCurrent: () => true })

function sequence(responses: ChatToolResponse[]) {
  const queue = [...responses]
  const sent: ToolMessage[][] = []
  const request = vi.fn(async (messages: ToolMessage[]) => {
    sent.push(structuredClone(messages))
    const next = queue.shift()
    if (!next) throw new Error('준비되지 않은 추가 모델 요청')
    return next
  })
  return { request, sent }
}

describe('출력 복구 뒤의 도구 실행 결과', () => {
  it('이미 완료한 변경을 새 도구 번호와 조회 번호로 다시 요청하면 저장을 반복하지 않는다', async () => {
    // 왜: 이어 쓰기에서 모델이 새 번호를 붙여 같은 변경을 내더라도 저장과 후속 갱신은 한 번만 실행해야 한다.
    const first = edit('first', { dialogueLanguage: 'ko', tone: 'warm' })
    const repeated = edit('repeated', { tone: 'warm', dialogueLanguage: 'ko' }, 'r2')
    const { request, sent } = sequence([turn(read('read-1'), first), turn(read('read-2'), repeated), { reply: '저장했어요.' }])
    const execute = vi.fn(async (call: ToolCall): Promise<ToolResult> => call.name === 'read_project'
      ? { status: 'ok', resource: 'settings', records: [{ id: 'settings', values: { dialogueLanguage: 'ko', tone: 'warm' }, revision: call.id }] }
      : { status: 'ok', resource: 'settings', id: 'settings', saved: { dialogueLanguage: 'ko', tone: 'warm' } })

    const result = await runChatToolLoop({ request, execute, ...scope() })

    expect(execute.mock.calls.map(([call]) => call.id)).toEqual(['read-1', 'first', 'read-2'])
    expect(result.results).toHaveLength(4)
    const returned = sent[2].at(-1)!.content.find(block => block.type === 'tool_result' && block.tool_use_id === 'repeated')
    expect(returned).toMatchObject({ type: 'tool_result', tool_use_id: 'repeated', content: JSON.stringify(result.results[1].result) })
  })

  it('같은 대상의 값을 다른 값으로 바꾼 뒤 원래 값으로 다시 바꾸면 마지막 변경도 실행한다', async () => {
    // 왜: A에서 B로 바꾼 뒤 A로 되돌리는 요청을 이전 성공의 중복으로 오인하면 안 된다.
    const edits = [edit('a', { dialogueLanguage: 'ko' }), edit('b', { dialogueLanguage: 'en' }), edit('back-to-a', { dialogueLanguage: 'ko' })]
    const { request } = sequence([...edits.map(call => turn(call)), { reply: '한국어로 되돌렸어요.' }])
    const execute = vi.fn<(_: ToolCall) => Promise<ToolResult>>(async () => ({ status: 'ok' }))

    await runChatToolLoop({ request, execute, ...scope() })

    expect(execute.mock.calls.map(([call]) => call)).toEqual(edits)
  })

  it('다시 조회한 값이 이전 저장 결과와 다르면 같은 변경도 현재 값에 다시 적용한다', async () => {
    // 왜: 사용자가 중간에 바꾼 값을 이전 저장 결과만 보고 이미 완료했다고 알리면 안 된다.
    const { request } = sequence([
      turn(edit('first', { dialogueLanguage: 'ko' })),
      turn(read('fresh-read')),
      turn(edit('after-external-edit', { dialogueLanguage: 'ko' }, 'r2')),
      { reply: '한국어로 저장했어요.' },
    ])
    const execute = vi.fn(async (call: ToolCall): Promise<ToolResult> => call.name === 'read_project'
      ? { status: 'ok', resource: 'settings', records: [{ id: 'settings', values: { dialogueLanguage: 'en' }, revision: 'r2' }] }
      : { status: 'ok' })

    await runChatToolLoop({ request, execute, ...scope() })

    expect(execute.mock.calls.map(([call]) => call.id)).toEqual(['first', 'fresh-read', 'after-external-edit'])
  })

  it.each(['failed', 'unknown_result', 'unverified', 'approval_required'])('결과가 %s이면 새 요청을 저장 완료로 간주하지 않고 실행기의 확인을 거친다', async status => {
    // 왜: 실패·미확인·승인 대기를 저장 성공으로 기억하면 필요한 확인이나 복구가 누락된다.
    const { request } = sequence([turn(edit('first', { dialogueLanguage: 'ko' })), turn(edit('second', { dialogueLanguage: 'ko' }, 'r2')), { reply: '결과를 확인해 주세요.' }])
    const execute = vi.fn(async (): Promise<ToolResult> => ({ status }))

    const result = await runChatToolLoop({ request, execute, ...scope() })

    expect(execute).toHaveBeenCalledTimes(2)
    expect(result.results.map(outcome => outcome.result.status)).toEqual([status, status])
  })

  it('저장을 완료한 뒤 후속 답변 복구가 실패하면 완료 결과와 작성된 답변을 함께 남긴다', async () => {
    // 왜: 출력 복구 한도에 도달해도 이미 저장한 변경과 사용자에게 보여줄 초안을 버리면 안 된다.
    const saved = edit('saved', { dialogueLanguage: 'ko' })
    const error = Object.assign(new Error('출력 복구 한도에 도달했습니다.'), { partialReply: '여기까지 작성한 설명입니다.' })
    const request = vi.fn<(_: ToolMessage[]) => Promise<ChatToolResponse>>()
      .mockResolvedValueOnce(turn(saved)).mockRejectedValueOnce(error)
    const execute = vi.fn(async (): Promise<ToolResult> => ({ status: 'ok', saved: { dialogueLanguage: 'ko' } }))

    const result = await runChatToolLoop({ request, execute, ...scope() })

    expect(result.stopped).toBe('model_error')
    expect(result.results).toEqual([{ call: saved, result: { status: 'ok', saved: { dialogueLanguage: 'ko' } } }])
    expect(result.data.reply).toContain('여기까지 작성한 설명입니다.')
    expect(result.data).not.toHaveProperty('updates')
    expect(execute).toHaveBeenCalledTimes(1)
  })

  it('저장 완료 응답과 중단 요청이 겹치면 완료 결과를 남기고 다음 실행을 멈춘다', async () => {
    // 왜: 중단 직전에 완료된 저장을 화면에서 누락하면 사용자가 같은 변경을 다시 요청할 수 있다.
    const controller = new AbortController()
    const saved = edit('saved', { dialogueLanguage: 'ko' })
    const { request } = sequence([turn(saved, edit('must-not-run', { tone: 'warm' }))])
    const completed: ToolOutcome[] = []
    const execute = vi.fn(async (): Promise<ToolResult> => {
      controller.abort()
      return { status: 'ok', saved: { dialogueLanguage: 'ko' } }
    })

    await expect(runChatToolLoop({ request, execute, signal: controller.signal, isCurrent: () => true, onResult: outcome => completed.push(outcome) }))
      .rejects.toMatchObject({ name: 'AbortError' })

    expect(completed).toEqual([{ call: saved, result: { status: 'ok', saved: { dialogueLanguage: 'ko' } } }])
    expect(execute).toHaveBeenCalledTimes(1)
    expect(request).toHaveBeenCalledTimes(1)
  })
})
