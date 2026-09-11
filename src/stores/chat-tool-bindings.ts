import { translate } from '@/lib/i18n/translate'
import { contentLocale } from '@/lib/i18n/content'
import { createClient } from '@/lib/supabase/client'
import { createPendingProposal, type PendingProposal } from '@/lib/pending-proposal'
import { sameToolValue, type ToolResource } from '@/lib/chat-tools/executor'
import { toolResourcesForStage, type ToolResult } from '@/lib/chat-tools/protocol'
import { SCENE_TOOL_FIELDS, SHOT_TOOL_FIELDS, saveWriterToolPatch } from '@/lib/chat-tools/writer-save'
import { validateWriterUpdates } from '@/lib/writer-chat-updates'
import { invalidateShots } from '@/lib/shots-cache'
import { useProducerStore, type ExtractedSettings } from './producer-store'
import { useWriterStore, hasPendingWriterEdit } from './writer-store'
import { useArtistStore } from './artist-store'
import type { Scene, Shot } from '@/types'
import { parseProjectFormat } from '@/types/project'

const SETTINGS_FIELDS = ['playtime', 'genre', 'subGenre', 'format', 'tone', 'dialogueLanguage'] as const
const pickSettings = (value: object) => Object.fromEntries(SETTINGS_FIELDS.map(key => [key, (value as Record<string, unknown>)[key]]))
function objectPatch(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('patch must be an object')
  const patch = value as Record<string, unknown>
  if (!Object.keys(patch).length || Object.keys(patch).some(key => !keys.includes(key))) throw new Error(`Allowed fields: ${keys.join(', ')}`)
  if (JSON.stringify(patch).length > 60_000) throw new Error('The edit is too large; split it into smaller targets.')
  return patch
}
const requireText = (value: unknown, key: string, allowEmpty = false) => {
  if (typeof value !== 'string' || (!allowEmpty && !value.trim()) || value.length > 2000) throw new Error(`${key} must be text of 1–2000 characters`)
}

export function createStudioToolResources(options: {
  stage: string; projectId: string; traceId: string; signal: AbortSignal; isCurrent: () => boolean
  offerProposal?: (proposal: PendingProposal) => void
  markProducerApproval?: () => void
  approved?: { resource: string; id: string; patch: Record<string, unknown>; before: Record<string, unknown> }
}): Record<string, ToolResource> {
  const check = () => { if (options.signal.aborted || !options.isCurrent()) throw new DOMException('Chat stopped', 'AbortError') }
  const readTable = async (table: string, columns: string) => {
    check()
    const { data, error } = await createClient().from(table).select(columns).eq('project_id', options.projectId)
    check()
    if (error) throw new Error(error.message)
    return (data ?? []) as unknown as Record<string, unknown>[]
  }
  const requestApproval = (resource: string, id: string, patch: Record<string, unknown>, before: Record<string, unknown>, kind: PendingProposal['kind'], payload: Record<string, unknown>): ToolResult | null => {
    const approved = options.approved
    if (approved && approved.resource === resource && approved.id === id && sameToolValue(approved.patch, patch) && sameToolValue(approved.before, before)) return null
    if (!options.offerProposal) return { status: 'approval_required', message: 'User approval is required; no edit was executed.' }
    const proposal = createPendingProposal({ traceId: options.traceId, stage: ['scenes', 'shots', 'dialogue'].includes(resource) ? 'writer' : 'artist', kind,
      target: String(before.name ?? id), action: translate(contentLocale(), 'Apply the requested change'), impact: [translate(contentLocale(), 'Approval saves the description or dialogue. No image or video will be generated.')],
      payload: { ...payload, toolEdit: { resource, id, patch, before } },
    })
    proposal.projectId = options.projectId
    options.offerProposal(proposal)
    return { status: 'approval_required', proposalId: proposal.id, message: 'The edit is waiting in the approval list. Nothing was saved or generated.' }
  }
  const settings: ToolResource = {
    read: async () => { check(); return [{ id: 'settings', values: pickSettings(useProducerStore.getState().projectSettings) }] },
    readSaved: async () => {
      const { data, error } = await createClient().from('projects').select('producer_draft').eq('id', options.projectId).maybeSingle()
      check()
      if (error) throw new Error(error.message)
      if (!data?.producer_draft?.settings) throw new Error('Saved Producer settings could not be read')
      return [{ id: 'settings', values: pickSettings(data.producer_draft.settings) }]
    },
    validate: value => {
      const patch = objectPatch(value, [...SETTINGS_FIELDS])
      for (const [key, v] of Object.entries(patch)) {
        if (key === 'playtime') { if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) throw new Error('playtime must be a positive number of seconds') }
        else if (key === 'tone') { if (!Array.isArray(v) || v.some(t => typeof t !== 'string' || !t.trim())) throw new Error('tone must be an array of text labels') }
        else if (key === 'dialogueLanguage') { if (!['ko', 'en', 'ja', 'zh'].includes(String(v))) throw new Error('dialogueLanguage must be ko, en, ja or zh') }
        else if (key === 'format') { if (!parseProjectFormat(v)) throw new Error('format must be horizontal_16:9, vertical_9:16, cinema_2.39:1 or square_1:1') }
        else requireText(v, key, key === 'subGenre')
      }
      return patch
    },
    write: async (_id, patch) => {
      check()
      const result = useProducerStore.getState().applyExtractedSettings(patch as ExtractedSettings, options.traceId)
      if (result === 'pending') {
        options.markProducerApproval?.()
        return { status: 'approval_required', message: 'Producer source approval is required.' }
      }
      if (result !== 'applied') return { status: 'invalid_input', message: 'The Producer change could not be applied.' }
      const saved = await useProducerStore.getState().saveDraftNow()
      check()
      return saved ? { status: 'ok' } : { status: 'failed', message: useProducerStore.getState().error ?? 'The settings were not saved.' }
    },
  }

  const stored = new Map<string, Record<string, unknown>>()
  let characterIds = new Set<string>()
  const writerResource = (resource: 'scenes' | 'shots' | 'dialogue'): ToolResource => ({
    reconcileUnchanged: resource === 'shots', // a previous partial duration save may still need its scene total repaired
    read: async () => {
      const scene = resource === 'scenes'
      const fields = scene ? SCENE_TOOL_FIELDS : resource === 'dialogue' ? { dialogueLines: ['dialogue_lines'] } : SHOT_TOOL_FIELDS
      const [rows, characters] = await Promise.all([
        readTable(scene ? 'scenes' : 'shots', '*'), readTable('characters', 'character_id'),
      ])
      characterIds = new Set(characters.map(c => String(c.character_id)))
      return rows.map(row => {
        const id = String(row[scene ? 'scene_id' : 'shot_id'])
        stored.set(`${resource}:${id}`, row)
        const values: Record<string, unknown> = Object.fromEntries(Object.entries(fields).map(([key, columns]) => [key, row[columns.at(-1)!] ?? row[columns[0]] ?? (key === 'dialogueLines' ? [] : '')]))
        if (!scene) values.sceneId = row.scene_id
        return { id, values }
      })
    },
    validate: value => {
      const fields = resource === 'scenes' ? SCENE_TOOL_FIELDS : resource === 'dialogue' ? { dialogueLines: ['dialogue_lines'] } : SHOT_TOOL_FIELDS
      const patch = objectPatch(value, Object.keys(fields))
      const update = validateWriterUpdates([{ type: resource === 'scenes' ? 'updateScene' : 'updateShot', id: 'target', patch }], characterIds)[0]
      if (!update || typeof update !== 'object' || !('patch' in update) || !sameToolValue(update.patch, patch)) throw new Error('Invalid fields or character IDs. Preserve complete dialogue metadata and use the registered character IDs (null for narration).')
      return patch
    },
    write: async (id, patch, before) => {
      check()
      const statusResponse = await fetch(`/api/writer/status/${options.projectId}`, { signal: options.signal })
      if (!statusResponse.ok) return { status: 'read_failed', message: 'Draft generation status could not be confirmed.' }
      const status = await statusResponse.json()
      check()
      if (status.started && !status.pipeline_completed && !status.pipeline_failed) return { status: 'blocked', message: 'Draft generation is still running. Editing can resume after it finishes.' }
      if (Array.isArray(patch.dialogueLines) && Array.isArray(before.dialogueLines) && patch.dialogueLines.length < before.dialogueLines.length) {
        if (Object.keys(patch).length > 1) return { status: 'invalid_input', message: 'Request dialogue removal separately from other shot changes so its approval is preserved.' }
        const pending = requestApproval(resource, id, patch, before, 'writerShrinkDialogue', { shotId: id, dialogueLines: patch.dialogueLines })
        if (pending) return pending
      }
      const row = stored.get(`${resource}:${id}`)
      const result = await saveWriterToolPatch({ projectId: options.projectId, resource, id, patch, before, stored: row,
        isCurrent: () => options.isCurrent() && !options.signal.aborted,
        hasPendingEdit: () => hasPendingWriterEdit(resource, id),
        applySaved: () => {
          if (resource === 'scenes') useWriterStore.setState(state => ({ sceneManifest: state.sceneManifest ? { ...state.sceneManifest, scenes: state.sceneManifest.scenes.map(scene => scene.sceneId === id ? { ...scene, ...patch } as Scene : scene) } : null }))
          else useWriterStore.setState(state => ({ shots: state.shots.map(shot => shot.shotId === id ? { ...shot, ...patch } as Shot : shot) }))
        },
        ...('durationSeconds' in patch ? { syncDuration: async () => {
          const sceneId = String(row?.scene_id ?? '')
          const rows = await readTable('shots', 'scene_id,duration_seconds')
          const seconds = rows.filter(shot => shot.scene_id === sceneId).reduce((sum, shot) => sum + Number(shot.duration_seconds ?? 0), 0)
          check()
          const { data, error } = await createClient().from('scenes').update({ estimated_duration_seconds: seconds }).eq('project_id', options.projectId).eq('scene_id', sceneId).select('estimated_duration_seconds').maybeSingle()
          check()
          if (error || !data || data.estimated_duration_seconds !== seconds) throw new Error(error?.message ?? 'Scene duration save was not confirmed')
          useWriterStore.setState(state => ({ sceneManifest: state.sceneManifest ? { ...state.sceneManifest, scenes: state.sceneManifest.scenes.map(scene => scene.sceneId === sceneId ? { ...scene, estimatedDurationSeconds: seconds } : scene) } : null }))
        } } : {}),
      })
      if (result.status === 'ok') await invalidateShots(options.projectId)
      check()
      return result
    },
  })

  const characters: ToolResource = {
    read: async () => {
      const [people, appearances, props] = await Promise.all([
        readTable('characters', 'character_id,name,role,description,entity_type'),
        readTable('character_appearances', 'character_id,is_default,appearance,appearance_native'),
        readTable('props', 'prop_id,name,description,appearance,appearance_native'),
      ])
      return [...people.filter(row => row.entity_type === 'person').map(row => {
        const appearance = appearances.find(a => a.character_id === row.character_id && a.is_default)
        return { id: String(row.character_id), values: { name: row.name, role: row.role, description: row.description ?? '', appearance: appearance?.appearance_native ?? appearance?.appearance ?? '' } }
      }), ...props.map(row => ({ id: String(row.prop_id), values: { name: row.name, description: row.description ?? '', appearance: row.appearance_native ?? row.appearance ?? '' } }))]
    },
    validate: value => {
      const patch = objectPatch(value, ['name', 'role', 'description', 'appearance'])
      for (const [key, v] of Object.entries(patch)) requireText(v, key, key === 'description')
      if ('role' in patch && !['protagonist', 'antagonist', 'supporting'].includes(String(patch.role))) throw new Error('role must be protagonist, antagonist or supporting')
      if ('appearance' in patch && Object.keys(patch).length > 1) throw new Error('Request appearance separately from identity edits so source approval is preserved.')
      return patch
    },
    write: async (id, patch, before) => {
      check()
      if ('role' in patch && !('role' in before)) return { status: 'invalid_input', message: 'Props do not have a character role. Edit their name, description or appearance instead.' }
      if ('appearance' in patch) {
        const pending = requestApproval('characters', id, patch, before, 'artistSourceAppearancePatch', { characterId: id, appearance: patch.appearance })
        if (pending) return pending
      }
      const res = await fetch('appearance' in patch ? '/api/artist/appearance' : '/api/artist/character', { method: 'appearance' in patch ? 'POST' : 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId: options.projectId, characterId: id, ...patch }), signal: options.signal })
      const body = await res.json()
      check()
      if (!res.ok) return { status: res.status === 403 ? 'forbidden' : 'failed', message: body.error ?? `HTTP ${res.status}`, retryable: res.status === 429 || res.status >= 500 }
      if ('appearance' in patch) useArtistStore.getState().applyAppearancePatch(id, body.appearance, body.appearanceNative)
      else {
        useArtistStore.setState(state => ({ characterAssets: state.characterAssets.map(c => c.characterId === id ? { ...c, ...patch } : c) }))
        useWriterStore.setState(state => ({ sceneManifest: state.sceneManifest ? { ...state.sceneManifest, characters: state.sceneManifest.characters.map(c => c.characterId === id ? { ...c, ...patch } : c) } : null }))
      }
      return { status: 'ok' }
    },
  }
  const backgrounds: ToolResource = {
    read: async () => (await readTable('locations', 'location_id,name,visual_description,visual_description_native')).map(row => ({ id: String(row.location_id), values: { name: row.name, visualDescription: row.visual_description_native ?? row.visual_description ?? '' } })),
    validate: value => { const patch = objectPatch(value, ['visualDescription']); requireText(patch.visualDescription, 'visualDescription'); return patch },
    write: async (id, patch, before) => {
      check()
      const pending = requestApproval('backgrounds', id, patch, before, 'artistSourceLocationPatch', { locationId: id, visualDescription: patch.visualDescription })
      if (pending) return pending
      await useArtistStore.getState().updateLocationDescription(id, String(patch.visualDescription))
      check()
      useWriterStore.setState(state => ({ sceneManifest: state.sceneManifest ? { ...state.sceneManifest, locations: state.sceneManifest.locations.map(location => location.locationId === id ? { ...location, visualDescription: String(patch.visualDescription) } : location) } : null }))
      return { status: 'ok' }
    },
  }
  // Appearance rows use `${entityId}/${appearanceKey}` ids; keys never contain '/'.
  const splitAppearanceId = (id: string) => { const at = id.lastIndexOf('/'); return at > 0 ? [id.slice(0, at), id.slice(at + 1)] as const : [id, ''] as const }
  const NARRATIVE_TIMES = ['present', 'past', 'future']
  const validateNarrativeTime = (v: unknown) => { if (v !== null && !NARRATIVE_TIMES.includes(String(v))) throw new Error('narrativeTime must be present, past, future or null') }
  const requireCandidate = (patch: Record<string, unknown>, before: Record<string, unknown>): ToolResult | null => {
    if (!('selectedCandidateId' in patch)) return null
    if (Object.keys(patch).length > 1) return { status: 'invalid_input', message: 'Request the candidate restore separately from other appearance edits.' }
    if (!Array.isArray(before.candidateIds) || !before.candidateIds.includes(patch.selectedCandidateId)) return { status: 'invalid_input', message: 'selectedCandidateId must be one of candidateIds for this appearance.' }
    return null
  }
  const postJson = async (path: string, method: string, body: Record<string, unknown>): Promise<{ ok: true; body: Record<string, unknown> } | { ok: false; result: ToolResult }> => {
    const res = await fetch(path, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId: options.projectId, ...body }), signal: options.signal })
    const json = await res.json().catch(() => ({}))
    check()
    if (!res.ok) return { ok: false, result: { status: res.status === 403 ? 'forbidden' : 'failed', message: json.error ?? `HTTP ${res.status}`, retryable: res.status === 429 || res.status >= 500 } }
    return { ok: true, body: json }
  }
  const candidateIds = (rows: Record<string, unknown>[]) => [...rows].sort((a, b) => String(b.generated_at ?? '').localeCompare(String(a.generated_at ?? ''))).map(row => String(row.id))
  const appearances: ToolResource = {
    read: async () => {
      const [rows, candidates] = await Promise.all([
        readTable('character_appearances', 'character_id,appearance_key,label,is_default,narrative_time,appearance,appearance_native,sheet_url'),
        readTable('character_image_candidates', 'id,character_id,appearance_key,view,is_selected,generated_at'),
      ])
      return rows.map(row => {
        const slot = candidates.filter(c => c.character_id === row.character_id && c.appearance_key === row.appearance_key && c.view === 'main')
        return { id: `${row.character_id}/${row.appearance_key}`, values: {
          characterId: row.character_id, appearanceKey: row.appearance_key, label: row.label ?? '', narrativeTime: row.narrative_time ?? null, isDefault: !!row.is_default,
          appearance: row.appearance_native ?? row.appearance ?? '', hasImage: typeof row.sheet_url === 'string' && !!row.sheet_url,
          selectedCandidateId: slot.find(c => c.is_selected)?.id ?? null, candidateIds: candidateIds(slot),
        } }
      })
    },
    validate: value => {
      const patch = objectPatch(value, ['label', 'narrativeTime', 'isDefault', 'appearance', 'selectedCandidateId'])
      if ('label' in patch) requireText(patch.label, 'label')
      if ('narrativeTime' in patch) validateNarrativeTime(patch.narrativeTime)
      if ('isDefault' in patch && patch.isDefault !== true) throw new Error('isDefault can only be set to true; choose another appearance to change the default')
      if ('appearance' in patch) { requireText(patch.appearance, 'appearance'); if (Object.keys(patch).length > 1) throw new Error('Request the appearance description separately from label, narrativeTime or default changes.') }
      if ('selectedCandidateId' in patch) requireText(patch.selectedCandidateId, 'selectedCandidateId')
      return patch
    },
    write: async (id, patch, before) => {
      check()
      const [characterId, appearanceKey] = splitAppearanceId(id)
      const candidateError = requireCandidate(patch, before)
      if (candidateError) return candidateError
      if ('selectedCandidateId' in patch) {
        const response = await postJson('/api/artist/select-candidate', 'POST', { characterId, appearanceKey, view: 'main', candidateId: patch.selectedCandidateId })
        if (!response.ok) return response.result
        const url = String(response.body.url ?? '')
        useArtistStore.setState(state => ({ characterAssets: state.characterAssets.map(c => c.characterId !== characterId ? c : { ...c, appearances: c.appearances.map(a => a.appearanceKey !== appearanceKey ? a : { ...a, sheetUrl: url, viewCandidates: { ...a.viewCandidates, main: (a.viewCandidates.main ?? []).map(cand => ({ ...cand, isSelected: cand.id === patch.selectedCandidateId })) } }) }) }))
        return { status: 'ok' }
      }
      if ('appearance' in patch && before.isDefault === true) {
        const pending = requestApproval('appearances', id, patch, before, 'artistSourceAppearancePatch', { characterId, appearanceKey, appearance: patch.appearance })
        if (pending) return pending
      }
      if ('appearance' in patch) {
        await useArtistStore.getState().updateCharacterAppearance(characterId, appearanceKey, String(patch.appearance))
        check()
        return { status: 'ok' }
      }
      const response = await postJson('/api/artist/character-appearance', 'PATCH', { characterId, appearanceKey, ...patch })
      if (!response.ok) return response.result
      const row = response.body as { label?: string; narrativeTime?: string | null }
      useArtistStore.setState(state => ({ characterAssets: state.characterAssets.map(c => c.characterId !== characterId ? c : { ...c, appearances: c.appearances.map(a => {
        if (a.appearanceKey === appearanceKey) return { ...a, ...('label' in patch ? { label: row.label ?? String(patch.label) } : {}), ...('narrativeTime' in patch ? { narrativeTime: (row.narrativeTime ?? patch.narrativeTime) as typeof a.narrativeTime } : {}), ...(patch.isDefault === true ? { isDefault: true } : {}) }
        return patch.isDefault === true ? { ...a, isDefault: false } : a
      }) }) }))
      return { status: 'ok' }
    },
  }
  const backgroundAppearances: ToolResource = {
    read: async () => {
      const [locations, variants, candidates] = await Promise.all([
        readTable('locations', 'location_id,name,visual_description,visual_description_native,wide_shot'),
        readTable('location_appearances', 'location_id,appearance_key,label,narrative_time,visual_description,visual_description_native,wide_shot'),
        readTable('location_image_candidates', 'id,location_id,variant_key,view,is_selected,generated_at'),
      ])
      const slotOf = (locationId: unknown, variant: string | null) => candidates.filter(c => c.location_id === locationId && (c.variant_key ?? null) === variant && c.view === 'wide_shot')
      return locations.flatMap(location => {
        const base = slotOf(location.location_id, null)
        return [{ id: `${location.location_id}/default`, values: {
          locationId: location.location_id, appearanceKey: 'default', label: String(location.name ?? ''), narrativeTime: null, isDefault: true,
          visualDescription: location.visual_description_native ?? location.visual_description ?? '', hasImage: typeof location.wide_shot === 'string' && !!location.wide_shot,
          selectedCandidateId: base.find(c => c.is_selected)?.id ?? null, candidateIds: candidateIds(base),
        } }, ...variants.filter(v => v.location_id === location.location_id).map(v => {
          const slot = slotOf(location.location_id, String(v.appearance_key))
          return { id: `${location.location_id}/${v.appearance_key}`, values: {
            locationId: location.location_id, appearanceKey: v.appearance_key, label: v.label ?? '', narrativeTime: v.narrative_time ?? null, isDefault: false,
            visualDescription: v.visual_description_native ?? v.visual_description ?? '', hasImage: typeof v.wide_shot === 'string' && !!v.wide_shot,
            selectedCandidateId: slot.find(c => c.is_selected)?.id ?? null, candidateIds: candidateIds(slot),
          } }
        })]
      })
    },
    validate: value => {
      const patch = objectPatch(value, ['label', 'narrativeTime', 'visualDescription', 'selectedCandidateId'])
      if ('label' in patch) requireText(patch.label, 'label')
      if ('narrativeTime' in patch) validateNarrativeTime(patch.narrativeTime)
      if ('visualDescription' in patch) requireText(patch.visualDescription, 'visualDescription')
      if ('selectedCandidateId' in patch) requireText(patch.selectedCandidateId, 'selectedCandidateId')
      return patch
    },
    write: async (id, patch, before) => {
      check()
      const [locationId, appearanceKey] = splitAppearanceId(id)
      const candidateError = requireCandidate(patch, before)
      if (candidateError) return candidateError
      if ('selectedCandidateId' in patch) {
        await useArtistStore.getState().selectLocationCandidate(locationId, String(patch.selectedCandidateId), appearanceKey)
        check()
        return { status: 'ok' }
      }
      if (before.isDefault === true) {
        if ('label' in patch || 'narrativeTime' in patch) return { status: 'invalid_input', message: 'The base background has no label or narrativeTime; edit its name through the backgrounds resource or a variant appearance instead.' }
        const pending = requestApproval('background_appearances', id, patch, before, 'artistSourceLocationPatch', { locationId, visualDescription: patch.visualDescription })
        if (pending) return pending
        await useArtistStore.getState().updateLocationDescription(locationId, String(patch.visualDescription))
        check()
        useWriterStore.setState(state => ({ sceneManifest: state.sceneManifest ? { ...state.sceneManifest, locations: state.sceneManifest.locations.map(location => location.locationId === locationId ? { ...location, visualDescription: String(patch.visualDescription) } : location) } : null }))
        return { status: 'ok' }
      }
      const response = await postJson('/api/artist/location-appearance', 'PATCH', { locationId, appearanceKey, ...patch })
      if (!response.ok) return response.result
      const row = response.body as { label?: string; narrativeTime?: string | null; visualDescription?: string | null; visualDescriptionNative?: string | null }
      useArtistStore.setState(state => ({ worldAssets: state.worldAssets.map(w => w.locationId !== locationId ? w : { ...w, appearances: (w.appearances ?? []).map(a => a.appearanceKey !== appearanceKey ? a : { ...a,
        ...('label' in patch ? { label: row.label ?? String(patch.label) } : {}), ...('narrativeTime' in patch ? { narrativeTime: (row.narrativeTime ?? patch.narrativeTime) as typeof a.narrativeTime } : {}),
        ...('visualDescription' in patch ? { visualDescription: row.visualDescription ?? String(patch.visualDescription), visualDescriptionNative: row.visualDescriptionNative ?? String(patch.visualDescription) } : {}),
      }) }) }))
      return { status: 'ok' }
    },
  }
  const all: Record<string, ToolResource> = { settings, scenes: writerResource('scenes'), shots: writerResource('shots'), dialogue: writerResource('dialogue'), characters, backgrounds, appearances, background_appearances: backgroundAppearances }
  return Object.fromEntries(toolResourcesForStage(options.stage).map(resource => [resource, all[resource]]))
}
