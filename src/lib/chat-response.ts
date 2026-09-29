import type { ChatLlmUsage } from './chat-trace'
import { CHAT_OUTPUT_BUDGET, CHAT_RECOVERY_ATTEMPTS } from './chat-output-recovery'

export const CHAT_PROGRESS_TYPE = 'application/x-ndjson'
export const CHAT_REQUEST_TIMEOUT_MS = 600_000
export const CHAT_RESPONSE_TIMEOUT_MS = 240_000
export type ChatRecoveryProgress = { attempt: number; mode: 'continue' | 'retry' }
type Payload = Record<string, unknown>
type ProgressCallbacks = {
  onUsage?: (usage: ChatLlmUsage) => void
  onRecovery?: (event: ChatRecoveryProgress) => void
}

export class ChatResponseError extends Error {
  constructor(message: string, public readonly partialReply = '') { super(message); this.name = 'ChatResponseError' }
}

function isUsage(value: unknown): value is ChatLlmUsage {
  if (!value || typeof value !== 'object') return false
  const usage = value as ChatLlmUsage
  return typeof usage.model === 'string' && Number.isFinite(usage.inputTokens) &&
    Number.isFinite(usage.outputTokens) && usage.inputTokens >= 0 && usage.outputTokens >= 0
}

/** Progress never becomes a parsed application action. Only the final result can be applied. */
export async function readChatResponse(response: Response, callbacks: ProgressCallbacks = {}) {
  if (!response.headers.get('content-type')?.includes(CHAT_PROGRESS_TYPE)) {
    const payload: Payload = await response.json().catch(() => ({}))
    const usages = Array.isArray(payload.modelUsages) ? payload.modelUsages : [payload.toolUsage ?? payload.trace]
    for (const usage of usages) if (isUsage(usage)) callbacks.onUsage?.(usage)
    return { status: response.status, payload }
  }
  if (!response.body) throw new ChatResponseError('Chat response was interrupted. Completed changes are preserved.')
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let pending = ''
  let result: { status: number; payload: Payload } | undefined
  const consume = (line: string) => {
    if (!line.trim()) return
    const event = JSON.parse(line)
    if (result) throw new ChatResponseError('Unexpected data after the completed chat response.')
    if (event.type === 'usage' && isUsage(event.usage)) callbacks.onUsage?.(event.usage)
    else if (event.type === 'recovery' && Number.isInteger(event.attempt) && ['continue', 'retry'].includes(event.mode)) {
      callbacks.onRecovery?.({ attempt: event.attempt, mode: event.mode })
    } else if (event.type === 'result' && Number.isInteger(event.status) && event.body && typeof event.body === 'object') {
      result = { status: event.status, payload: event.body }
    }
  }
  try {
    while (true) {
      const { done, value } = await reader.read()
      pending += decoder.decode(value, { stream: !done })
      if (pending.length > 8_000_000) throw new ChatResponseError('Chat response is too large.')
      let newline: number
      while ((newline = pending.indexOf('\n')) >= 0) { consume(pending.slice(0, newline)); pending = pending.slice(newline + 1) }
      if (done) { if (pending) consume(pending); break }
    }
  } finally { await reader.cancel().catch(() => undefined); reader.releaseLock() }
  if (!result) throw new ChatResponseError('Chat response was interrupted. Completed changes are preserved.')
  return result
}

/** One instance per user message, shared by every tool round. No budget resets on recovery. */
export function createChatRequestSession(options: ProgressCallbacks & {
  signal: AbortSignal
  fetch?: typeof fetch
  onStatus?: (status: number) => void
}) {
  const startedAt = Date.now()
  let outputUsed = 0
  let recoveriesUsed = 0
  return async (endpoint: string, body: Payload): Promise<Payload> => {
    options.signal.throwIfAborted()
    const remainingMs = CHAT_REQUEST_TIMEOUT_MS - (Date.now() - startedAt)
    if (remainingMs <= 0) throw new ChatResponseError('Chat reached its time limit. Completed changes are preserved.')
    if (outputUsed >= CHAT_OUTPUT_BUDGET) throw new ChatResponseError('Chat reached its output budget. Completed changes are preserved.')
    const controller = new AbortController()
    const abort = () => controller.abort(options.signal.reason)
    options.signal.addEventListener('abort', abort, { once: true })
    const timeout = setTimeout(() => controller.abort(new DOMException('Chat time limit', 'TimeoutError')), Math.min(remainingMs, CHAT_RESPONSE_TIMEOUT_MS) + 1000)
    try {
      const response = await (options.fetch ?? fetch)(endpoint, {
        signal: controller.signal, method: 'POST',
        headers: {
          'Content-Type': 'application/json', Accept: CHAT_PROGRESS_TYPE,
          'x-chat-recovery-remaining': String(Math.max(0, CHAT_RECOVERY_ATTEMPTS - recoveriesUsed)),
          'x-chat-output-remaining': String(Math.max(0, CHAT_OUTPUT_BUDGET - outputUsed)),
          'x-chat-time-remaining': String(Math.min(remainingMs, CHAT_RESPONSE_TIMEOUT_MS)),
        },
        body: JSON.stringify(body),
      })
      options.onStatus?.(response.status)
      const result = await readChatResponse(response, {
        onUsage: usage => { outputUsed += usage.outputTokens; options.onUsage?.(usage) },
        onRecovery: event => { recoveriesUsed++; options.onRecovery?.(event) },
      })
      options.signal.throwIfAborted()
      options.onStatus?.(result.status)
      if (result.status < 200 || result.status >= 300) {
        throw new ChatResponseError(
          typeof result.payload.error === 'string' ? result.payload.error : `HTTP ${result.status}`,
          typeof result.payload.partialReply === 'string' ? result.payload.partialReply : '',
        )
      }
      return result.payload
    } catch (error) {
      options.signal.throwIfAborted()
      if (controller.signal.aborted) throw new ChatResponseError('Chat reached its time limit. Completed changes are preserved.')
      throw error
    } finally { clearTimeout(timeout); options.signal.removeEventListener('abort', abort) }
  }
}
