/**
 * Usage reported by a chat LLM response.
 *
 * Anthropic reports `input_tokens` separately from the cache token counts.
 * Keep those values separate so callers can preserve the provider's meaning.
 */
export type ChatLlmUsage = {
  model: string
  durationMs: number
  inputTokens: number
  outputTokens: number
  cacheReadInputTokens: number
  cacheCreationInputTokens: number
  stopReason: string | null
}

/**
 * End-to-end metadata for one chat request.
 *
 * Parser and client-application fields are optional because not every chat
 * route parses updates or applies a proposal.
 */
export interface ChatTrace extends ChatLlmUsage {
  traceId: string
  stage: string
  route: string
  historyCount: number
  historyChars: number
  contextChars: number
  promptChars: number
  parseStatus?: string | null
  rawUpdateCount?: number | null
  validUpdateCount?: number | null
  appliedCount?: number | null
  skippedCount?: number | null
  pendingProposal?: boolean | null
  choicesMarkerFound?: boolean | null
  choicesCount?: number | null
  generationHttpStatus?: number | null
  jobId?: string | null
  requestStatus?: number | null
  error?: string | null
}

export interface ChatTraceInput {
  traceId: string
  stage: string
  route: string
  system: string
  history: ReadonlyArray<{ content: string }>
  contextMessage: string
  usage?: ChatLlmUsage | null
  parseStatus?: string | null
  rawUpdateCount?: number | null
  validUpdateCount?: number | null
  choicesMarkerFound?: boolean | null
  choicesCount?: number | null
}

export function createChatTraceId(candidate?: unknown): string {
  return typeof candidate === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(candidate)
    ? candidate
    : crypto.randomUUID()
}

/**
 * Build a safe, prompt-free trace for the chat UI and server response.
 * Character counts are intentionally a cheap request-shape metric; token usage
 * comes from Anthropic when a live response is available.
 */
export function buildChatTrace(input: ChatTraceInput): ChatTrace {
  const historyChars = input.history.reduce(
    (total, message) => total + message.content.length,
    0,
  )
  const usage: ChatLlmUsage = input.usage ?? {
    model: 'unknown',
    durationMs: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadInputTokens: 0,
    cacheCreationInputTokens: 0,
    stopReason: null,
  }

  return {
    ...usage,
    traceId: input.traceId,
    stage: input.stage,
    route: input.route,
    historyCount: input.history.length,
    historyChars,
    contextChars: input.contextMessage.length,
    promptChars: input.system.length + historyChars + input.contextMessage.length,
    parseStatus: input.parseStatus ?? null,
    rawUpdateCount: input.rawUpdateCount ?? null,
    validUpdateCount: input.validUpdateCount ?? null,
    choicesMarkerFound: input.choicesMarkerFound ?? null,
    choicesCount: input.choicesCount ?? null,
    appliedCount: null,
    skippedCount: null,
    pendingProposal: null,
    generationHttpStatus: null,
    jobId: null,
    requestStatus: null,
    error: null,
  }
}

export function totalInputTokens(trace: ChatTrace): number {
  return (
    trace.inputTokens +
    trace.cacheReadInputTokens +
    trace.cacheCreationInputTokens
  )
}
