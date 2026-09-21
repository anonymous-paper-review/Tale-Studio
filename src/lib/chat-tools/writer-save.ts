import { createClient } from '@/lib/supabase/client'
import { sameToolValue } from './executor'
import type { ToolResult } from './protocol'

export const SCENE_TOOL_FIELDS: Record<string, string[]> = {
  location: ['location'], timeOfDay: ['time_of_day'], mood: ['mood', 'mood_native'],
  narrativeSummary: ['narrative_summary', 'narrative_summary_native'], originalTextQuote: ['original_text_quote'], charactersPresent: ['characters_present'], estimatedDurationSeconds: ['estimated_duration_seconds'],
}
export const SHOT_TOOL_FIELDS: Record<string, string[]> = {
  shotType: ['shot_type'], actionDescription: ['action_description', 'action_description_native'],
  characters: ['characters'], durationSeconds: ['duration_seconds'], dialogueLines: ['dialogue_lines'],
}
export function writerToolRowPatch(resource: string, patch: Record<string, unknown>): Record<string, unknown> {
  const fields = resource === 'scenes' ? SCENE_TOOL_FIELDS : SHOT_TOOL_FIELDS
  return Object.fromEntries(Object.entries(patch).flatMap(([key, value]) => (fields[key] ?? []).map(column => [column, value])))
}

export async function saveWriterToolPatch(options: {
  projectId: string; resource: 'scenes' | 'shots' | 'dialogue'; id: string
  patch: Record<string, unknown>; before: Record<string, unknown>; stored?: Record<string, unknown>
  isCurrent: () => boolean; hasPendingEdit: () => boolean
  applySaved: () => void
  syncDuration?: () => Promise<void>
}): Promise<ToolResult> {
  const check = () => { if (!options.isCurrent()) throw new DOMException('Chat stopped', 'AbortError') }
  check()
  if (options.hasPendingEdit()) return { status: 'stale_state', message: 'A screen edit is still saving. Read again once that save finishes.' }
  const table = options.resource === 'scenes' ? 'scenes' : 'shots'
  const idColumn = table === 'scenes' ? 'scene_id' : 'shot_id'
  const patch = writerToolRowPatch(options.resource, options.patch)
  if (!Object.keys(patch).length) return { status: 'invalid_input', message: 'No supported edit fields.' }
  let query = createClient().from(table).update(patch).eq('project_id', options.projectId).eq(idColumn, options.id)
  // Compare the actual edited columns, not updated_at (older writers do not always update it).
  const before = options.stored ?? writerToolRowPatch(options.resource, options.before)
  for (const column of Object.keys(patch)) {
    const old = before[column]
    if (old == null) query = query.is(column, null)
    else if (column === 'characters' || column === 'characters_present') {
      const literal = `{${(old as string[]).map(value => JSON.stringify(value)).join(',')}}`
      query = query.eq(column, literal)
    } else query = query.eq(column, typeof old === 'object' ? JSON.stringify(old) : old)
  }
  const { data, error } = await query.select('*').maybeSingle()
  check()
  if (error) throw new Error(error.message)
  if (!data) return { status: 'stale_state', message: 'The saved target changed or no longer exists. Read it again.' }
  if (!Object.entries(patch).every(([key, value]) => sameToolValue(data[key], value))) return { status: 'unverified', message: 'The returned saved fields do not match.' }
  // A screen edit made during the request keeps its own display and subsequent save.
  if (options.hasPendingEdit()) return { status: 'stale_state', message: 'A newer screen edit is saving. Read the target again.' }
  options.applySaved()
  if (options.syncDuration) {
    try { await options.syncDuration() } catch (error) { check(); return { status: 'partial', message: `The shot was saved, but the scene duration needs repair: ${String(error)}` } }
    check()
  }
  return { status: 'ok' }
}
