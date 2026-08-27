// Writer observability events. This module is server-only because it uses the
// service-role Supabase client; browser callers must go through an API route.
import { supabaseAdmin } from '@/lib/supabase/admin'

export const WRITER_OBSERVABILITY_EVENTS = [
  'auto_check',
  'auto_submit_started',
  'auto_submit_response',
  'auto_submit_blocked',
  'route_entered',
  'route_classified',
  'route_failed',
  'asset_trigger_started',
  'asset_trigger_blocked',
  'asset_trigger_completed',
  'fal_submit_started',
  'fal_submit_accepted',
  'fal_submit_failed',
  'finalize_completed',
  'finalize_failed',
  'stage_started',
  'stage_completed',
  'stage_failed',
  'cache_read',
  'cache_invalidated',
  // generation lifecycle coordinates (#a2-observability 2026-08-26) - a 429 rejection happens
  // *before* a generation_jobs row exists, so without this event the refusal leaves no trace
  // anywhere (owner autopsy 08-26: the "everything died" session had zero failed jobs in the
  // ledger; the invisible losses were unrecorded quota rejections).
  'generation_submit_rejected_quota',
  // #f4(2026-08-27): refusal because the project's total video budget (100) is spent — same
  //   pre-ledger trace rationale as the quota rejection above.
  'generation_submit_rejected_video_budget',
  // Coordinate (4) of the generation lifecycle: the client actually folded a settled job's
  // result into visible UI state (store rehydrate after the job left the active queue).
  // A completed job with no ui_reflected row = "finished but the screen never showed it".
  'ui_reflected',
] as const

export type WriterObservabilityEvent = (typeof WRITER_OBSERVABILITY_EVENTS)[number]

const MAX_PAYLOAD_BYTES = 8_192
const MAX_DEPTH = 4
const MAX_KEYS = 40
const MAX_ARRAY_ITEMS = 40
const MAX_STRING_LENGTH = 256
const SENSITIVE_KEYS = new Set([
  'prompt',
  'story',
  'content',
  'response',
  'input',
  'output',
  'text',
  'messages',
])

function boundedValue(value: unknown, depth: number): unknown {
  if (depth > MAX_DEPTH) return '[truncated]'
  if (typeof value === 'string') {
    return value.length > MAX_STRING_LENGTH
      ? `${value.slice(0, MAX_STRING_LENGTH - 1)}…`
      : value
  }
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'boolean' || value === null) return value
  if (Array.isArray(value)) {
    return value.slice(0, MAX_ARRAY_ITEMS).map((item) => boundedValue(item, depth + 1))
  }
  if (typeof value === 'object') {
    const output: Record<string, unknown> = {}
    for (const [key, child] of Object.entries(value).slice(0, MAX_KEYS)) {
      if (SENSITIVE_KEYS.has(key.toLowerCase())) continue
      output[key.slice(0, MAX_STRING_LENGTH)] = boundedValue(child, depth + 1)
    }
    return output
  }
  return null
}

function sanitizePayload(payload: Record<string, unknown> | undefined): Record<string, unknown> {
  try {
    const bounded = boundedValue(payload ?? {}, 0)
    if (!bounded || typeof bounded !== 'object' || Array.isArray(bounded)) return {}
    const encoded = JSON.stringify(bounded)
    if (encoded.length > MAX_PAYLOAD_BYTES) return { truncated: true }
    return JSON.parse(encoded) as Record<string, unknown>
  } catch {
    return { truncated: true }
  }
}

/** Best-effort persistence: diagnostics must never change generation behavior. */
export async function recordWriterObservabilityEvent(
  projectId: string,
  event: WriterObservabilityEvent,
  payload?: Record<string, unknown>,
  refs?: { runId?: string | null; generationJobId?: string | null },
): Promise<void> {
  try {
    const { error } = await supabaseAdmin.from('writer_observability_events').insert({
      project_id: projectId,
      event,
      payload: sanitizePayload(payload),
      run_id: refs?.runId ?? null,
      generation_job_id: refs?.generationJobId ?? null,
    })
    if (error) throw error
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.warn('[writer-observability] persistence failed:', message.slice(0, 200))
  }
}
