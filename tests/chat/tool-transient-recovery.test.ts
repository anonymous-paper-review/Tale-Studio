// 채팅 도구의 일시 저장 실패는 남은 대상만 한 번 재확인하고 승인·권한·실행 상한을 지킨다.
import { expect, it, vi } from 'vitest'
import { runChatToolLoop, type ChatToolResponse } from '@/lib/chat-tools/loop'
import type { ToolCall, ToolMessage, ToolResult } from '@/lib/chat-tools/protocol'
import { createChatToolExecutor } from '@/lib/chat-tools/executor'
import { guardChatToolReply } from '@/lib/chat-tools/receipt'

const failedId = 'person-temporary-failure'
const savedId = 'person-already-saved'
const patch = { description: '사용자가 요청한 인물 설명' }
const transientFailure: ToolResult = { status: 'failed', retryable: true, message: 'HTTP 503' }
const scope = () => ({ signal: new AbortController().signal, isCurrent: () => true })
const read = (callId: string, id = failedId): ToolCall => ({ type: 'tool_use', id: callId, name: 'read_project', input: { resource: 'characters', id } })
const edit = (callId: string, revision = 'r1', id = failedId): ToolCall => ({ type: 'tool_use', id: callId, name: 'edit_project', input: { resource: 'characters', id, revision, patch } })
const turn = (...calls: ToolCall[]): ChatToolResponse => ({ toolTurn: { content: calls, stopReason: 'tool_use' } })

function modelSequence(responses: ChatToolResponse[]) {
  const sent: ToolMessage[][] = []
  const queue = [...responses]
  const request = vi.fn(async (messages: ToolMessage[]) => {
    // 왜: 대화 배열은 다음 단계에서 바뀌므로 각 요청 시점의 복사본으로 재확인 횟수와 대상 범위를 검사한다.
    sent.push(structuredClone(messages))
    const next = queue.shift()
    if (!next) throw new Error('준비하지 않은 추가 모델 호출')
    return next
  })
  return { request, sent }
}

function recoveryHints(messages: ToolMessage[]) {
  return messages.filter(message => message.role === 'user').flatMap(message => message.content)
    .filter(block => block.type === 'text' && typeof block.text === 'string' && block.text.includes('Recovery check:'))
    .map(block => String(block.text))
}

it('일시 실패 뒤 모델이 포기하면 한 번 재확인하고 실패한 대상만 조회한 뒤 원래 변경을 저장한다', async () => {
  // 왜: 일부 인물은 이미 저장됐는데 다른 인물의 일시 오류 때문에 끝나거나 성공한 인물을 다시 바꾸면 안 된다.
  const initialReads = [read('read-saved', savedId), read('read-failed')]
  const initialEdits = [edit('edit-saved', 'r1', savedId), edit('edit-failed', 'r2')]
  const recoveryRead = read('read-failed-again')
  const recoveryEdit = edit('edit-failed-again', 'r3')
  const { request, sent } = modelSequence([
    turn(...initialReads), turn(...initialEdits), { reply: '오류 때문에 남은 인물은 변경할 수 없습니다.' },
    turn(recoveryRead), turn(recoveryEdit), { reply: '남은 인물 설명도 저장했습니다.' },
  ])
  const saved = new Map<string, unknown>()
  const execute = vi.fn(async (call: ToolCall): Promise<ToolResult> => {
    const input = call.input as { id: string; patch?: unknown }
    if (call.name === 'read_project') return { status: 'ok', records: [{ id: input.id, values: saved.get(input.id) ?? { description: '원래 설명' } }] }
    if (call.id === 'edit-failed') return transientFailure
    saved.set(input.id, input.patch)
    return { status: 'ok', saved: input.patch }
  })

  const result = await runChatToolLoop({ request, execute, ...scope() })

  expect(request).toHaveBeenCalledTimes(6)
  expect(execute.mock.calls.map(([call]) => call)).toEqual([...initialReads, ...initialEdits, recoveryRead, recoveryEdit])
  const hints = recoveryHints(sent[3])
  expect(hints).toHaveLength(1)
  expect(hints[0]).toContain(failedId)
  expect(hints[0]).not.toContain(savedId)
  expect(hints[0]).toContain('read_project')
  expect(hints[0]).toContain('edit_project')
  expect(recoveryHints(sent.at(-1)!)).toHaveLength(1)
  expect(saved).toEqual(new Map([[savedId, patch], [failedId, patch]]))
  expect(result.results.at(-1)).toMatchObject({ call: recoveryEdit, result: { status: 'ok' } })
  expect(result.stopped).toBeUndefined()
})

it('일시 실패를 재확인한 뒤 모델이 다시 포기하면 재확인을 반복하지 않는다', async () => {
  // 왜: 모델이 복구 요청에 응하지 않을 때 같은 안내만 계속 보내며 호출과 대기 시간을 늘리면 안 된다.
  const { request, sent } = modelSequence([
    turn(edit('failed-once')), { reply: '지금은 바꿀 수 없습니다.' }, { reply: '다시 확인해도 변경하지 못했습니다.' },
  ])
  const execute = vi.fn(async (): Promise<ToolResult> => transientFailure)

  const result = await runChatToolLoop({ request, execute, ...scope() })

  expect(request).toHaveBeenCalledTimes(3)
  expect(execute).toHaveBeenCalledTimes(1)
  expect(recoveryHints(sent.at(-1)!)).toHaveLength(1)
  expect(result.results).toHaveLength(1)
  expect(result.results[0].result).toEqual(transientFailure)
})

it('이미 성공했거나 승인·권한·영구 오류로 멈춘 대상은 일시 실패 재확인에서 제외한다', async () => {
  // 왜: 이전 실패 기록이나 잘못 붙은 재시도 표시 때문에 완료된 변경을 반복하거나 승인을 우회하면 안 된다.
  const scenarios: Array<{ label: string; outcomes: ToolResult[] }> = [
    { label: '성공', outcomes: [{ status: 'ok', retryable: true }] },
    { label: '승인 대기', outcomes: [{ status: 'approval_required', retryable: true }] },
    { label: '권한 거절', outcomes: [{ status: 'forbidden', retryable: true }] },
    { label: '영구 오류', outcomes: [{ status: 'failed', retryable: false }] },
    { label: '일시 오류로 확인되지 않음', outcomes: [{ status: 'failed' }] },
    { label: '앞선 일시 실패 뒤 저장 완료', outcomes: [transientFailure, { status: 'ok' }] },
  ]
  for (const scenario of scenarios) {
    const { request, sent } = modelSequence([
      ...scenario.outcomes.map((_, index) => turn(edit(`call-${index}`, `r${index}`))), { reply: '실행 결과를 안내합니다.' },
    ])
    const queue = [...scenario.outcomes]
    const execute = vi.fn(async (): Promise<ToolResult> => queue.shift()!)

    await runChatToolLoop({ request, execute, ...scope() })

    expect(request, scenario.label).toHaveBeenCalledTimes(scenario.outcomes.length + 1)
    expect(execute, scenario.label).toHaveBeenCalledTimes(scenario.outcomes.length)
    expect(recoveryHints(sent.at(-1)!), scenario.label).toEqual([])
  }
})

it('일시 실패 재확인도 같은 입력의 실패 횟수와 응답·도구 호출 상한을 넘지 않는다', async () => {
  // 왜: 낡은 상태와 일시 오류가 겹치거나 남은 호출이 없을 때 복구 안내가 기존 중단 상한을 우회하면 안 된다.
  const scenarios: Array<{ label: string; outcomes: ToolResult[]; limits: { maxSameFailure?: number; maxRounds?: number; maxCalls?: number } }> = [
    { label: '호출자가 정한 동일 실패 한 번', outcomes: [transientFailure], limits: { maxSameFailure: 1 } },
    { label: '낡은 상태와 일시 오류로 기본 실패 두 번 소진', outcomes: [{ status: 'stale_state' }, transientFailure], limits: {} },
    { label: '응답 횟수 소진', outcomes: [transientFailure], limits: { maxRounds: 2 } },
    { label: '도구 호출 횟수 소진', outcomes: [transientFailure], limits: { maxCalls: 1 } },
  ]
  for (const scenario of scenarios) {
    const { request, sent } = modelSequence([
      ...scenario.outcomes.map((_, index) => turn(edit(`limited-${index}`, `r${index}`))), { reply: '남은 변경을 완료하지 못했습니다.' },
    ])
    const queue = [...scenario.outcomes]
    const execute = vi.fn(async (): Promise<ToolResult> => queue.shift()!)

    await runChatToolLoop({ request, execute, ...scenario.limits, ...scope() })

    expect(request, scenario.label).toHaveBeenCalledTimes(scenario.outcomes.length + 1)
    expect(execute, scenario.label).toHaveBeenCalledTimes(scenario.outcomes.length)
    expect(recoveryHints(sent.at(-1)!), scenario.label).toEqual([])
  }
})

it('잘못된 편집 입력은 실패 안내를 유지하고 복구 검사에서 예외를 내지 않는다', async () => {
  // 왜: 모델이 비어 있는 입력을 보내도 원래 입력 오류를 처리하다 채팅 자체가 실패하면 안 된다.
  for (const input of [null, undefined, [], 'bad']) {
    const { request } = modelSequence([turn({ ...edit('bad-input'), input }), { reply: '입력을 확인해 주세요.' }])
    const execute = vi.fn(async () => ({ status: 'invalid_input' }))
    const result = await runChatToolLoop({ request, execute, ...scope() })
    expect(request).toHaveBeenCalledTimes(2)
    expect(result.results[0].result.status).toBe('invalid_input')
  }
})

it('실제 저장 뒤 오류 응답을 받아도 복구 확인에서는 중복 저장 없이 완료를 알린다', async () => {
  // 왜: 서버가 이미 반영한 변경을 다시 저장하거나 실패로만 남기는 일을 막아야 한다.
  let values = { description: '원래 설명' }
  const write = vi.fn(async (_id: string, next: Record<string, unknown>) => {
    values = next as typeof values
    return transientFailure
  })
  const current = scope()
  const execute = createChatToolExecutor({ ...current, resources: { characters: {
    read: async () => [{ id: failedId, values }], validate: value => value as Record<string, unknown>, write,
  } } })
  const { request } = modelSequence([
    turn(read('initial-read')), turn(edit('initial-edit')), { reply: '저장 응답이 실패했어요.' },
    turn(read('verify-read')), turn(edit('verify-edit', 'r2')), { reply: '저장된 값을 확인했어요.' },
  ])
  const result = await runChatToolLoop({ request, execute, ...current })
  expect(write).toHaveBeenCalledTimes(1)
  expect(values).toEqual(patch)
  expect(result.results.at(-1)?.result).toMatchObject({ status: 'ok', unchanged: true })
  expect(guardChatToolReply(result.data.reply!, result.results, true)).toContain('저장 확인')
})
