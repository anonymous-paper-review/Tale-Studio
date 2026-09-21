import { supabaseAdmin } from '@/lib/supabase/admin'
import { loadShotDesignByMainId, resolveShotDesign, type ShotDesignRunSource } from '@/lib/writer/shot-design-state'
import { isOwnMediaUrl } from '@/lib/storage/media-url'
import type { ToolResult } from './protocol'
import { inspectionImageRevision, type InspectionRequest } from './inspect'

type Row = Record<string, unknown>
async function rows(projectId: string, table: string, filters: Record<string, string> = {}, columns = '*'): Promise<Row[]> {
  let query = supabaseAdmin.from(table).select(columns).eq('project_id', projectId)
  for (const [key, value] of Object.entries(filters)) query = query.eq(key, value)
  const { data, error } = await query
  if (error) throw new Error(`Could not read ${table}`)
  return (data ?? []) as unknown as Row[]
}
const native = (row: Row, field: string) => row[`${field}_native`] ?? row[field] ?? null

/** Called only after project ownership is established. No writes or generation. */
export async function loadProjectInspection(projectId: string, request: InspectionRequest): Promise<{ result: ToolResult; imageUrl?: string }> {
  const { target, id, appearanceKey, includeImage } = request
  if (target === 'scene' || target === 'shot') {
    const table = target === 'scene' ? 'scenes' : 'shots'
    const row = (await rows(projectId, table, { [`${target}_id`]: id }))[0]
    if (!row) return { result: { status: 'not_found', target, id } }
    if (target === 'scene') return { result: { status: 'ok', target, id, source: 'scenes', current: {
      narrativeSummary: native(row, 'narrative_summary'), originalTextQuote: row.original_text_quote ?? null,
      location: row.location, mood: native(row, 'mood'), stage: row.stage ?? null,
      stageStatus: row.stage == null ? 'not_recorded' : 'recorded',
    } } }
    const scene = (await rows(projectId, 'scenes', { scene_id: String(row.scene_id) }))[0]
    let generation: Row
    let selectedRun: ShotDesignRunSource | null = null
    try {
      const [designs, projectShots] = await Promise.all([
        loadShotDesignByMainId(projectId, { strict: true, onSource: source => { selectedRun = source } }), rows(projectId, 'shots', {}, 'shot_id,design_ref'),
      ])
      const usesRefs = projectShots.some(s => !!s.design_ref) || row.source === 'manual'
      const spec = resolveShotDesign(designs, { shotId: id, designRef: row.design_ref as string | null }, usesRefs)
      generation = spec ? { status: 'recorded', source: 'writer_runs.state.shotDesign', timing: 'generation-time; may differ from current edited values', ...spec }
        : { status: usesRefs && !row.design_ref ? 'not_linked' : row.design_ref ? 'not_found' : 'not_recorded', source: 'writer_runs.state.shotDesign' }
    } catch {
      generation = { status: 'read_failed', source: 'writer_runs.state.shotDesign', message: 'Generation intent could not be checked. Do not infer that it was never recorded.' }
    }
    generation = { ...generation, selectedRun, searchScope: 'latest_5_runs_completed_preferred', currentShotRunLink: 'unverified' }
    return { result: { status: 'ok', target, id, source: 'shots', current: {
      sceneId: row.scene_id, shotType: row.shot_type, actionDescription: native(row, 'action_description'),
      durationSeconds: row.duration_seconds, dialogueLines: row.dialogue_lines ?? [], designRef: row.design_ref ?? null,
      staticSpec: row.static_spec ?? null, dynamicSpec: row.dynamic_spec ?? null, checkNotes: row.check_notes ?? null,
      specStatus: row.static_spec == null && row.dynamic_spec == null ? 'not_recorded' : 'recorded',
    }, scene: scene ? { id: scene.scene_id, stage: scene.stage ?? null, source: 'scenes.stage' } : { status: 'not_found' }, generation } }
  }

  const character = target === 'character'
  const entityColumn = character ? 'character_id' : 'location_id'
  const entity = (await rows(projectId, character ? 'characters' : 'locations', { [entityColumn]: id }))[0]
  if (!entity) return { result: { status: 'not_found', target, id } }
  const appearanceRows = await rows(projectId, character ? 'character_appearances' : 'location_appearances', { [entityColumn]: id })
  const appearances = [
    ...(!character ? [{ appearanceKey: 'default', label: 'Default', isDefault: true, narrativeTime: null, description: native(entity, 'visual_description'), imageUrl: entity.wide_shot, source: 'locations.wide_shot' }] : []),
    ...appearanceRows.map(a => ({ appearanceKey: a.appearance_key, label: a.label, isDefault: !!a.is_default,
      narrativeTime: a.narrative_time ?? null, description: native(a, character ? 'appearance' : 'visual_description'),
      imageUrl: character ? a.sheet_url : a.wide_shot, source: character ? 'character_appearances.sheet_url' : 'location_appearances.wide_shot',
    })),
  ]
  const visible = appearances.map(({ imageUrl, ...a }) => ({ ...a, hasImage: typeof imageUrl === 'string' && !!imageUrl }))
  const selected = appearanceKey ? appearances.find(a => a.appearanceKey === appearanceKey) : undefined
  if (appearanceKey && !selected) return { result: { status: 'not_found', target, id, appearanceKey, appearances: visible } }
  const result: ToolResult = { status: 'ok', target, id, name: entity.name, appearances: visible,
    ...(selected ? { selectedAppearance: visible.find(a => a.appearanceKey === selected.appearanceKey) } : {}),
  }
  if (!includeImage) return { result }
  const imageRevision = inspectionImageRevision(selected?.imageUrl)
  if (request.expectedImageRevision && request.expectedImageRevision !== imageRevision) return { result: { ...result, status: 'stale_state', message: 'The image changed after UI selection. Select the current image again; no replacement image was supplied.' } }
  if (!selected || !isOwnMediaUrl(selected.imageUrl)) return { result: { ...result, status: 'image_unavailable', message: 'The selected sheet/background is missing or cannot be safely supplied. No image was observed; do not substitute another appearance or portrait.' } }
  const candidates = await rows(projectId, character ? 'character_image_candidates' : 'location_image_candidates', { [entityColumn]: id })
  const matches = candidates.filter(c => c.is_selected && c.view === (character ? 'main' : 'wide_shot') &&
    (character ? c.appearance_key === appearanceKey : (c.variant_key ?? 'default') === appearanceKey))
  return { imageUrl: selected.imageUrl, result: { ...result, imageRevision, image: { source: selected.source, appearanceKey,
    candidateIds: matches.filter(c => c.url === selected.imageUrl).map(c => c.id),
    candidateStatus: matches.length === 0 ? 'not_recorded' : matches.some(c => c.url === selected.imageUrl) ? 'matched' : 'mismatch',
    note: 'Only the server-supplied image block establishes visual access. Source descriptions do not establish image contents.',
  } } }
}
