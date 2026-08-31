import { supabaseAdmin } from '@/lib/supabase/admin'
import type {
  ChatGenerationJobStatus,
  ChatGenerationJobTrace,
  ChatGenerationStatus,
  ChatTrace,
} from '@/lib/chat-trace'

export type ChatTracePatch = Partial<
  Pick<
    ChatTrace,
    | 'durationMs'
    | 'inputTokens'
    | 'outputTokens'
    | 'cacheReadInputTokens'
    | 'cacheCreationInputTokens'
    | 'stopReason'
    | 'parseStatus'
    | 'rawUpdateCount'
    | 'validUpdateCount'
    | 'appliedCount'
    | 'skippedCount'
    | 'pendingProposal'
    | 'choicesMarkerFound'
    | 'choicesCount'
    | 'generationHttpStatus'
    | 'jobId'
    | 'generationStatus'
    | 'requestStatus'
    | 'error'
  >
>

const TRACE_COLUMNS = [
  'trace_id',
  'project_id',
  'stage',
  'route',
  'model',
  'duration_ms',
  'input_tokens',
  'output_tokens',
  'cache_read_input_tokens',
  'cache_creation_input_tokens',
  'stop_reason',
  'history_count',
  'history_chars',
  'context_chars',
  'prompt_chars',
  'parse_status',
  'raw_update_count',
  'valid_update_count',
  'applied_count',
  'skipped_count',
  'pending_proposal',
  'choices_marker_found',
  'choices_count',
  'generation_http_status',
  'generation_status',
  'request_status',
  'error',
  'created_at',
  'updated_at',
].join(',')

const JOB_COLUMNS = 'id,kind,status,result_url,error'

function traceRow(projectId: string, trace: ChatTrace): Record<string, unknown> {
  return {
    trace_id: trace.traceId,
    project_id: projectId,
    stage: trace.stage,
    route: trace.route,
    model: trace.model,
    duration_ms: Math.max(0, Math.round(trace.durationMs)),
    input_tokens: Math.max(0, Math.round(trace.inputTokens)),
    output_tokens: Math.max(0, Math.round(trace.outputTokens)),
    cache_read_input_tokens: Math.max(0, Math.round(trace.cacheReadInputTokens)),
    cache_creation_input_tokens: Math.max(0, Math.round(trace.cacheCreationInputTokens)),
    stop_reason: trace.stopReason,
    history_count: trace.historyCount,
    history_chars: trace.historyChars,
    context_chars: trace.contextChars,
    prompt_chars: trace.promptChars,
    parse_status: trace.parseStatus ?? null,
    raw_update_count: trace.rawUpdateCount ?? null,
    valid_update_count: trace.validUpdateCount ?? null,
    applied_count: trace.appliedCount ?? null,
    skipped_count: trace.skippedCount ?? null,
    pending_proposal: trace.pendingProposal ?? null,
    choices_marker_found: trace.choicesMarkerFound ?? null,
    choices_count: trace.choicesCount ?? null,
    generation_http_status: trace.generationHttpStatus ?? null,
    generation_status: trace.generationStatus ?? null,
    request_status: trace.requestStatus ?? null,
    error: trace.error ?? null,
    updated_at: new Date().toISOString(),
  }
}

export async function upsertChatTrace(projectId: string, trace: ChatTrace): Promise<void> {
  const { error } = await supabaseAdmin
    .from('chat_traces')
    .upsert(traceRow(projectId, trace), { onConflict: 'trace_id' })
  if (error) throw error
}

export async function chatTraceBelongsToProject(
  projectId: string,
  traceId: string,
): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from('chat_traces')
    .select('trace_id')
    .eq('trace_id', traceId)
    .eq('project_id', projectId)
    .maybeSingle()
  if (error) throw error
  return !!data
}

/** 관측 저장 장애가 채팅 성공을 되돌리지 않도록 서버 라우트에서 사용할 best-effort 래퍼. */
export async function persistChatTraceBestEffort(
  projectId: string | null | undefined,
  trace: ChatTrace,
): Promise<void> {
  if (!projectId) return
  try {
    await upsertChatTrace(projectId, trace)
  } catch (error) {
    console.error('[chat-trace] persist failed:', error)
  }
}

export async function patchChatTrace(
  projectId: string,
  traceId: string,
  patch: ChatTracePatch,
): Promise<void> {
  const values: Record<string, unknown> = { updated_at: new Date().toISOString() }
  const fields: Array<[keyof ChatTracePatch, string]> = [
    ['durationMs', 'duration_ms'],
    ['inputTokens', 'input_tokens'],
    ['outputTokens', 'output_tokens'],
    ['cacheReadInputTokens', 'cache_read_input_tokens'],
    ['cacheCreationInputTokens', 'cache_creation_input_tokens'],
    ['stopReason', 'stop_reason'],
    ['parseStatus', 'parse_status'],
    ['rawUpdateCount', 'raw_update_count'],
    ['validUpdateCount', 'valid_update_count'],
    ['appliedCount', 'applied_count'],
    ['skippedCount', 'skipped_count'],
    ['pendingProposal', 'pending_proposal'],
    ['choicesMarkerFound', 'choices_marker_found'],
    ['choicesCount', 'choices_count'],
    ['generationHttpStatus', 'generation_http_status'],
    ['generationStatus', 'generation_status'],
    ['requestStatus', 'request_status'],
    ['error', 'error'],
  ]
  for (const [source, target] of fields) {
    if (patch[source] !== undefined) values[target] = patch[source]
  }
  const { error } = await supabaseAdmin
    .from('chat_traces')
    .update(values)
    .eq('trace_id', traceId)
    .eq('project_id', projectId)
  if (error) throw error
}

function numberOrZero(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function statusOf(value: unknown): ChatGenerationJobStatus {
  return value === 'completed' || value === 'failed' ? value : 'queued'
}

function summarizeGenerationStatus(
  jobs: ChatGenerationJobTrace[],
  fallback: ChatGenerationStatus | null,
): ChatGenerationStatus | null {
  if (jobs.length === 0) return fallback
  const completed = jobs.filter((job) => job.status === 'completed').length
  const failed = jobs.filter((job) => job.status === 'failed').length
  if (completed === jobs.length) return 'completed'
  if (failed === jobs.length) return 'failed'
  if (completed > 0 && failed > 0) return 'partial'
  return 'queued'
}

function toTrace(row: Record<string, unknown>, jobs: ChatGenerationJobTrace[]): ChatTrace {
  const fallbackStatus =
    row.generation_status === 'not_started' ||
    row.generation_status === 'awaiting_approval' ||
    row.generation_status === 'queued' ||
    row.generation_status === 'completed' ||
    row.generation_status === 'failed' ||
    row.generation_status === 'partial' ||
    row.generation_status === 'skipped' ||
    row.generation_status === 'deduped' ||
    row.generation_status === 'timed_out'
      ? row.generation_status
      : null

  return {
    traceId: String(row.trace_id),
    stage: String(row.stage),
    route: String(row.route),
    model: String(row.model),
    durationMs: numberOrZero(row.duration_ms),
    inputTokens: numberOrZero(row.input_tokens),
    outputTokens: numberOrZero(row.output_tokens),
    cacheReadInputTokens: numberOrZero(row.cache_read_input_tokens),
    cacheCreationInputTokens: numberOrZero(row.cache_creation_input_tokens),
    stopReason: typeof row.stop_reason === 'string' ? row.stop_reason : null,
    historyCount: numberOrZero(row.history_count),
    historyChars: numberOrZero(row.history_chars),
    contextChars: numberOrZero(row.context_chars),
    promptChars: numberOrZero(row.prompt_chars),
    parseStatus: typeof row.parse_status === 'string' ? row.parse_status : null,
    rawUpdateCount: typeof row.raw_update_count === 'number' ? row.raw_update_count : null,
    validUpdateCount: typeof row.valid_update_count === 'number' ? row.valid_update_count : null,
    appliedCount: typeof row.applied_count === 'number' ? row.applied_count : null,
    skippedCount: typeof row.skipped_count === 'number' ? row.skipped_count : null,
    pendingProposal:
      jobs.length > 0
        ? false
        : typeof row.pending_proposal === 'boolean'
          ? row.pending_proposal
          : null,
    choicesMarkerFound:
      typeof row.choices_marker_found === 'boolean' ? row.choices_marker_found : null,
    choicesCount: typeof row.choices_count === 'number' ? row.choices_count : null,
    generationHttpStatus:
      typeof row.generation_http_status === 'number' ? row.generation_http_status : null,
    jobId: jobs[0]?.jobId ?? null,
    generationStatus: summarizeGenerationStatus(jobs, fallbackStatus),
    generationJobs: jobs,
    requestStatus: typeof row.request_status === 'number' ? row.request_status : null,
    error: typeof row.error === 'string' ? row.error : null,
  }
}

export async function getChatTrace(
  projectId: string,
  traceId?: string | null,
): Promise<ChatTrace | null> {
  let query = supabaseAdmin
    .from('chat_traces')
    .select(TRACE_COLUMNS)
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(1)
  if (traceId) query = query.eq('trace_id', traceId)
  const { data, error } = await query.maybeSingle()
  if (error) throw error
  if (!data) return null

  const row = data as unknown as Record<string, unknown>
  const { data: jobRows, error: jobError } = await supabaseAdmin
    .from('generation_jobs')
    .select(JOB_COLUMNS)
    .eq('project_id', projectId)
    .eq('chat_trace_id', String(row.trace_id))
    .order('created_at', { ascending: true })
  if (jobError) throw jobError
  const jobs = ((jobRows ?? []) as Array<Record<string, unknown>>).map(
    (job): ChatGenerationJobTrace => ({
      jobId: String(job.id),
      kind: String(job.kind),
      status:
        statusOf(job.status) === 'completed' &&
        !(typeof job.result_url === 'string' && job.result_url.length > 0)
          ? 'failed'
          : statusOf(job.status),
      resultReady: typeof job.result_url === 'string' && job.result_url.length > 0,
      error:
        typeof job.error === 'string'
          ? job.error
          : statusOf(job.status) === 'completed' &&
              !(typeof job.result_url === 'string' && job.result_url.length > 0)
            ? 'Completed, but no result URL'
            : null,
    }),
  )
  return toTrace(row, jobs)
}
