import type { ChatLlmUsage } from './chat-trace'
import { CHAT_PROGRESS_TYPE, CHAT_RESPONSE_TIMEOUT_MS } from './chat-response'
import { CHAT_OUTPUT_BUDGET, CHAT_RECOVERY_ATTEMPTS, ChatOutputRecoveryError, type ChatOutputRecoveryOptions } from './chat-output-recovery'

export interface ChatRecoveryContext {
  signal: AbortSignal
  start: () => void
  recovery: ChatOutputRecoveryOptions
  onUsage: (usage: ChatLlmUsage) => void
}

export function chatRecoveryErrorPayload(error: unknown): Record<string, unknown> {
  if (error instanceof ChatOutputRecoveryError) return { partialReply: error.partialText, recoveryStopped: error.reason }
  return {}
}

function remaining(request: Request, name: string, maximum: number) {
  const raw = request.headers.get(name)
  if (raw === null) return maximum
  if (!/^\d+$/.test(raw)) throw new Error('Invalid chat recovery budget')
  const value = Number(raw)
  if (!Number.isSafeInteger(value)) throw new Error('Invalid chat recovery budget')
  return Math.min(value, maximum)
}

/** Keep existing JSON clients working; the chat UI opts into progress envelopes. */
export async function withChatRecovery(request: Request, handler: (context: ChatRecoveryContext) => Promise<Response>): Promise<Response> {
  let maxAttempts: number, maxOutputTokens: number, timeoutMs: number
  try {
    maxAttempts = remaining(request, 'x-chat-recovery-remaining', CHAT_RECOVERY_ATTEMPTS)
    maxOutputTokens = remaining(request, 'x-chat-output-remaining', CHAT_OUTPUT_BUDGET)
    timeoutMs = remaining(request, 'x-chat-time-remaining', CHAT_RESPONSE_TIMEOUT_MS)
  } catch { return Response.json({ error: 'Invalid chat recovery budget' }, { status: 400 }) }
  if (maxOutputTokens === 0 || timeoutMs === 0) return Response.json({ error: 'Chat reached its request limit. Completed changes are preserved.' }, { status: 429 })
  const controller = new AbortController()
  const abort = () => controller.abort(request.signal.reason)
  request.signal.addEventListener('abort', abort, { once: true })
  if (request.signal.aborted) abort()
  const timeout = setTimeout(() => controller.abort(new DOMException('Chat time limit', 'TimeoutError')), timeoutMs)
  const usages: ChatLlmUsage[] = []
  const execute = async (send: (event: unknown) => void, start: () => void = () => undefined) => {
    try {
      controller.signal.throwIfAborted()
      const response = await handler({
        signal: controller.signal,
        start,
        recovery: { maxAttempts, maxOutputTokens, onRecovery: event => { controller.signal.throwIfAborted(); send({ type: 'recovery', ...event }) } },
        onUsage: usage => { usages.push(usage); send({ type: 'usage', usage }) },
      })
      const body = await response.json()
      if (controller.signal.aborted && !request.signal.aborted) return { status: 504, body: {
        error: 'Chat reached its time limit. Completed changes are preserved.',
        ...(typeof body.partialReply === 'string' ? { partialReply: body.partialReply } : {}),
      } }
      return { status: response.status, body }
    } catch (error) {
      return { status: controller.signal.aborted ? 504 : 500, body: {
        error: controller.signal.aborted ? 'Chat reached its time limit. Completed changes are preserved.' : (error instanceof Error ? error.message : 'Chat failed'),
        ...chatRecoveryErrorPayload(error),
      } }
    } finally { clearTimeout(timeout); request.signal.removeEventListener('abort', abort) }
  }
  if (!request.headers.get('accept')?.includes(CHAT_PROGRESS_TYPE)) {
    const result = await execute(() => undefined)
    return Response.json({ ...result.body, ...(usages.length ? { modelUsages: usages } : {}) }, { status: result.status })
  }
  // Keep preflight authentication/validation failures as their original HTTP status.
  let release: () => void = () => undefined
  const started = new Promise<void>(resolve => { release = resolve })
  const buffered: unknown[] = []
  let sendEvent = (event: unknown) => { buffered.push(event); release() }
  const completed = execute(event => sendEvent(event), release)
  const first = await Promise.race([completed.then(result => ({ result })), started.then(() => null)])
  if (first) return Response.json(first.result.body, { status: first.result.status })
  const encoder = new TextEncoder()
  let closed = false
  return new Response(new ReadableStream({
    start(stream) {
      const send = (event: unknown) => { if (!closed) stream.enqueue(encoder.encode(JSON.stringify(event) + '\n')) }
      sendEvent = send
      for (const event of buffered) send(event)
      void completed.then(result => {
        if (closed) return
        send({ type: 'result', ...result })
        closed = true
        stream.close()
      }).catch(() => { if (!closed) { closed = true; stream.close() } })
    },
    cancel() { closed = true; controller.abort(new DOMException('Chat stopped', 'AbortError')) },
  }), { headers: { 'Content-Type': CHAT_PROGRESS_TYPE, 'Cache-Control': 'no-store' } })
}
