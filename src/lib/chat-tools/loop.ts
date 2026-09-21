import { translate } from '@/lib/i18n/translate'
import type { ToolCall, ToolMessage, ToolOutcome, ToolResult, ToolTurn } from './protocol'
import { toolValueKey } from './executor'

export interface ChatToolResponse { toolTurn?: ToolTurn; reply?: string; [key: string]: unknown }

function failureKeyFor(call: ToolCall): string {
  const input = call.input && typeof call.input === 'object' ? { ...call.input, revision: undefined } : call.input
  return toolValueKey([call.name, input])
}

export async function runChatToolLoop(options: {
  request: (messages: ToolMessage[]) => Promise<ChatToolResponse>
  execute: (call: ToolCall) => Promise<ToolResult>
  signal: AbortSignal
  isCurrent: () => boolean
  maxRounds?: number
  maxCalls?: number
  maxSameFailure?: number
  onResult?: (outcome: ToolOutcome) => void
  requireEdit?: boolean
  /** The user explicitly asked to look up an image; a text answer must follow a storage read. */
  requireInspection?: boolean
  locale?: 'ko' | 'en'
}): Promise<{ data: ChatToolResponse; results: ToolOutcome[]; stopped?: string }> {
  const messages: ToolMessage[] = []
  const results: ToolOutcome[] = []
  const cached = new Map<string, { signature: string; result: ToolResult }>()
  const failures = new Map<string, number>()
  const check = () => {
    if (options.signal.aborted || !options.isCurrent()) throw new DOMException('Chat stopped', 'AbortError')
  }
  let calls = 0
  let checkedMissingEdit = false
  let checkedMissingInspection = false
  let checkedRecovery = false
  for (let round = 0; round < (options.maxRounds ?? 6); round++) {
    check()
    let data: ChatToolResponse
    try { data = await options.request(messages) } catch (error) {
      check()
      if (!results.length) throw error
      return { data: { reply: translate(options.locale ?? 'ko', 'The follow-up reply failed. Completed operations are listed below.') }, results, stopped: 'model_error' }
    }
    check()
    const turn = data.toolTurn
    if (!turn) {
      // A text-only refusal can follow a recoverable result. Give the model one
      // chance to inspect it, within the same budgets; never replay writes here.
      if (!checkedRecovery && round + 2 < (options.maxRounds ?? 6) && calls + 2 <= (options.maxCalls ?? 16)) {
        const latest = new Map<string, ToolOutcome>()
        for (const outcome of results) {
          if (outcome.call.name !== 'edit_project') continue
          if (!outcome.call.input || typeof outcome.call.input !== 'object' || Array.isArray(outcome.call.input)) continue
          const input = outcome.call.input as Record<string, unknown>
          latest.set(toolValueKey([input.resource, input.id]), outcome)
        }
        const recoverable = [...latest.values()].filter(({ call, result }) =>
          result.status === 'failed' && result.retryable === true &&
          (failures.get(failureKeyFor(call)) ?? 0) < (options.maxSameFailure ?? 2))
        if (recoverable.length) {
          checkedRecovery = true
          const targets = recoverable.map(({ call }) => {
            const { resource, id, patch } = call.input as Record<string, unknown>
            return { resource, id, patch }
          })
          messages.push({ role: 'assistant', content: [{ type: 'text', text: data.reply || 'The edit did not complete.' }] },
            { role: 'user', content: [{ type: 'text', text: `Recovery check: these requested edits received a transient server failure and still have recovery budget: ${JSON.stringify(targets)}. Use read_project to check their current saved values, then edit_project with a fresh revision and only the original requested changes. edit_project also verifies already-matching saved values without issuing a duplicate write; use that confirmation before claiming completion. Leave successful and approval-pending targets alone. Do not bypass approval or access restrictions. If recovery is blocked, report the remaining target and exact reason without claiming completion.` }] })
          continue
        }
      }
      if (options.requireEdit && (data.toolSupport === true || results.length > 0) && !results.some(outcome => outcome.call.name === 'edit_project')) {
        if (!checkedMissingEdit) {
          checkedMissingEdit = true
          messages.push({ role: 'assistant', content: [{ type: 'text', text: data.reply || 'No edit was executed.' }] },
            { role: 'user', content: [{ type: 'text', text: 'Execution check: the original user explicitly requested an edit supported by the app tools, but no edit was executed. Use read_project to inspect the target and edit_project to carry out the request. If the request is ambiguous or blocked, ask or explain the exact reason; do not claim completion without an edit result.' }] })
          continue
        }
        return { data: { reply: translate(options.locale ?? 'ko', 'The requested edit was not executed. Please specify the target and the change.'), trace: data.trace, contentLocale: data.contentLocale }, results, stopped: 'no_edit' }
      }
      if (options.requireInspection && (data.toolSupport === true || results.length > 0) && !results.some(outcome => outcome.call.name === 'inspect_project')) {
        // The canvas summary is a send-time screen snapshot, not current storage. A read-only
        // inspection has no side effect, so one confirmation round is safe within the same budgets.
        if (!checkedMissingInspection && round + 1 < (options.maxRounds ?? 6)) {
          checkedMissingInspection = true
          messages.push({ role: 'assistant', content: [{ type: 'text', text: data.reply || 'No inspection was executed.' }] },
            { role: 'user', content: [{ type: 'text', text: 'Inspection check: the user explicitly asked to look up an image, but inspect_project was not called. The canvas summary is a screen snapshot taken when the message was sent; it does not establish whether an image exists now. Call inspect_project with includeImage:true and the exact target and appearanceKey the user named (or the last explicit selection), then answer from the tool result. If the target is ambiguous, ask which one. Do not state that an image exists or is missing without a tool result, and do not edit or generate.' }] })
          continue
        }
        // Keep a clarifying answer, but never let a screen-summary answer pass as a verified read.
        return { data: { ...data, reply: [data.reply, translate(options.locale ?? 'ko', 'The image was not actually inspected; this answer relies on the screen summary only.')].filter(Boolean).join('\n\n') }, results, stopped: 'no_inspection' }
      }
      return { data, results }
    }
    // Preserve server search/compaction blocks as well as text and client tool calls.
    messages.push({ role: 'assistant', content: turn.content })
    const toolCalls = turn.content.filter((b): b is ToolCall => b.type === 'tool_use')
    if (turn.stopReason === 'max_tokens') break // incomplete tool arguments must not execute
    if (toolCalls.length === 0) {
      if (turn.stopReason === 'pause_turn') continue
      break
    }
    const returned: ToolMessage['content'] = []
    let limited = false
    for (const call of toolCalls) {
      check()
      const signature = toolValueKey([call.name, call.input])
      const failureKey = failureKeyFor(call)
      const prior = cached.get(call.id)
      let result: ToolResult
      if (prior) {
        result = prior.signature === signature ? prior.result : { status: 'invalid_input', message: 'A tool ID was reused with different arguments.' }
      } else if (limited || calls >= (options.maxCalls ?? 16) || (failures.get(failureKey) ?? 0) >= (options.maxSameFailure ?? 2)) {
        limited = true
        result = { status: 'limit', message: 'This operation reached its recovery limit. Report the remaining target and stop.' }
      } else {
        calls++
        try { result = await options.execute(call) } catch (error) {
          if ((call.name === 'edit_project' || (call.name === 'project_workflow' && (call.input as Record<string, unknown>)?.action === 'resume')) && (options.signal.aborted || !options.isCurrent())) {
            options.onResult?.({ call, result: { status: 'unknown_result', message: call.name === 'edit_project' ? 'The request stopped while saving. Read the target to confirm whether that save completed.' : 'The request stopped during execution submission. The server may still be running. Query project status before resubmitting.' } })
          }
          throw error
        }
        check()
        cached.set(call.id, { signature, result })
        if (!['ok', 'approval_required', 'navigation_requested', 'queued'].includes(result.status)) failures.set(failureKey, (failures.get(failureKey) ?? 0) + 1)
      }
      results.push({ call, result })
      options.onResult?.({ call, result })
      returned.push({ type: 'tool_result', tool_use_id: call.id, content: JSON.stringify(result), is_error: !['ok', 'approval_required', 'navigation_requested', 'queued'].includes(result.status) })
    }
    messages.push({ role: 'user', content: returned })
    if (limited) break
  }
  return { data: { reply: translate(options.locale ?? 'ko', 'Processing stopped before completion. Check the remaining targets and reasons below.') }, results, stopped: 'limit' }
}
