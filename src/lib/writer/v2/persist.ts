import { supabaseAdmin } from '@/lib/supabase/admin'
import { triggerAssetDrafts } from '@/lib/artist/draft-trigger'
import { normalizeCameraMotion } from '@/lib/writer/motion-vocabulary'
import type { PipelineInput, ShotDynamicSpec } from '@/lib/writer/types/pipeline'
import type { WriterV2Package, WriterV2SemanticUnit } from '@/lib/writer/v2/semantic-unit'

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const DEFAULT_PALETTE = {
  primary: '#1f2937',
  secondary: '#f3f4f6',
  accent: '#f59e0b',
  forbidden: [],
}

function assertDbOk(op: string, error: { message: string } | null): void {
  if (error) throw new Error(`[writer-v2] ${op} failed: ${error.message}`)
}

function canonicalSceneId(index: number): string {
  return `sc_${String(index + 1).padStart(2, '0')}`
}

function canonicalShotId(sceneIndex: number, shotIndex: number): string {
  return `sh_${String(sceneIndex + 1).padStart(2, '0')}_${String(shotIndex + 1).padStart(2, '0')}`
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))]
}

function dialogueLines(unit: WriterV2SemanticUnit) {
  return unit.story.dialogue.map((line) => ({
    characterId: line.character_id,
    text: line.line,
    emotion: unit.story.emotion,
    delivery: line.delivery ?? '',
    durationHint: 0,
    plannedTiming: line.timing,
  }))
}

function shotPrompt(unit: WriterV2SemanticUnit, shotIndex: number): string {
  const shot = unit.shots[shotIndex]
  return [
    unit.visual.direction_intent,
    `Story intent: ${unit.story.intent}`,
    `Action: ${unit.story.action}`,
    `Reaction: ${unit.story.reaction}`,
    `Composition: ${shot.composition}`,
    `Camera: ${shot.camera}`,
    `Blocking: ${shot.blocking}`,
    `Transition: ${shot.transition}`,
  ].join('. ')
}

function sceneRows(pkg: WriterV2Package) {
  return pkg.units.map((unit, index) => {
    const sceneId = canonicalSceneId(index)
    const duration = unit.shots.reduce(
      (sum, shot) => sum + Math.max(1, Math.round(shot.duration_seconds)),
      0,
    )
    const characters = unique([
      ...unit.visual.character_refs,
      ...unit.story.dialogue.map((line) => line.character_id),
    ])
    return {
      scene_id: sceneId,
      narrative_summary: `${unit.story.intent} ${unit.story.action} ${unit.story.reaction}`.trim(),
      narrative_summary_native: `${unit.story.intent} ${unit.story.action} ${unit.story.reaction}`.trim(),
      original_text_quote: unit.story.dialogue.map((line) => line.line).join(' '),
      location: unit.visual.background_ref ?? '',
      time_of_day: '',
      mood: unit.story.emotion,
      mood_native: unit.story.emotion,
      characters_present: characters,
      estimated_duration_seconds: duration,
      sort_order: index,
      source: 'pipeline',
      i18n_provenance: {},
    }
  })
}

/**
 * writer-v2 의 자유 문장 연출을 `ShotDynamicSpec` 모양으로 세운다.
 *
 * v2 스키마는 camera/blocking 을 문장 하나로만 받는다(`semantic-unit.ts:18-19`). 그런데
 * 하류(`compileMotionContract`)는 camera_motion 객체와 character_motion 배열을 기대한다.
 * 예전에는 문장을 그대로 넣어 두 가지가 동시에 났다 — character_motion 문자열에 `.forEach`
 * 가 걸려 TypeError, camera_motion 문자열은 `raw.type` 이 undefined 라 조용히 `static` 으로
 * 접혀 "LOCKED tripod" 계약문이 나갔다. 문장은 버리지 않고 정본 어휘로 번역해 넘긴다.
 */
function v2DynamicSpec(
  shotId: string,
  shot: { camera: string; blocking: string; transition: string },
  characters: string[],
): ShotDynamicSpec {
  const { motion } = normalizeCameraMotion(shot.camera)
  const blocking = shot.blocking.trim()
  return {
    shot_id: shotId,
    camera_motion: {
      type: motion.type as ShotDynamicSpec['camera_motion']['type'],
      direction: motion.direction,
      speed: motion.speed,
      magnitude: motion.magnitude,
    },
    // v2 는 인물별로 쪼개 주지 않는다. 문장 하나를 통째로 한 항목에 담되 인물 지목은
    //   등장인물이 정확히 한 명일 때만 한다 — 여럿이면 누구의 동작인지 코드가 알 수 없다.
    character_motion: blocking
      ? [
          {
            character_id: characters.length === 1 ? characters[0] : '',
            verb: blocking,
            magnitude: 'medium',
          },
        ]
      : [],
    motion_prompt: blocking,
  }
}

function shotRows(pkg: WriterV2Package) {
  return pkg.units.flatMap((unit, sceneIndex) => {
    const sceneId = canonicalSceneId(sceneIndex)
    const characters = unique([
      ...unit.visual.character_refs,
      ...unit.story.dialogue.map((line) => line.character_id),
    ])
    const dialogue = dialogueLines(unit)

    return unit.shots.map((shot, shotIndex) => ({
      scene_id: sceneId,
      shot_id: canonicalShotId(sceneIndex, shotIndex),
      shot_type: 'MS',
      action_description: `${unit.story.action} ${unit.story.reaction}`.trim(),
      action_description_native: `${unit.story.action} ${unit.story.reaction}`.trim(),
      characters,
      duration_seconds: Math.max(1, Math.round(shot.duration_seconds)),
      generation_method: 'I2V',
      dialogue_lines: dialogue,
      prompt: shotPrompt(unit, shotIndex),
      location_ids: unit.visual.background_ref
        ? [unit.visual.background_ref]
        : null,
      static_spec: {
        engine: 'writer-v2',
        contract_version: pkg.contract_version,
        revision_id: pkg.revision_id,
        unit_id: unit.unit_id,
        shot_id: shot.shot_id,
        intent: unit.story.intent,
        emotion: unit.story.emotion,
        composition: shot.composition,
        camera: shot.camera,
        blocking: shot.blocking,
        transition: shot.transition,
      },
      dynamic_spec: v2DynamicSpec(
        canonicalShotId(sceneIndex, shotIndex),
        shot,
        characters,
      ),
      design_ref: `writer-v2:${pkg.revision_id}:${unit.unit_id}:${shot.shot_id}`,
      check_notes: [
        {
          category: 'writer-v2-semantic-unit',
          severity: 'info',
          constraint: 'story-visual-unit',
          constraint_target: unit.unit_id,
        },
      ],
      sort_order: sceneIndex * 1000 + shotIndex,
      source: 'pipeline',
    }))
  })
}

function formatFromInput(input: PipelineInput) {
  const aspectRatio = input.genre?.format?.includes('9:16')
    ? 'vertical_9:16'
    : input.genre?.format?.includes('2.39')
      ? 'cinema_2.39:1'
      : 'horizontal_16:9'
  const [width, height] =
    aspectRatio === 'vertical_9:16'
      ? [1080, 1920]
      : aspectRatio === 'cinema_2.39:1'
        ? [1920, 804]
        : [1920, 1080]

  return {
    medium: input.styleAnchor?.medium ?? 'live_action',
    resolution: { width, height },
    fps: 24,
    aspect_ratio: aspectRatio,
    rendering_method: 'downstream',
  }
}

async function ensureV2DesignTokens(projectId: string, input: PipelineInput): Promise<void> {
  const { data, error } = await supabaseAdmin
    .from('projects')
    .select('design_tokens')
    .eq('id', projectId)
    .maybeSingle()
  assertDbOk('design token lookup', error)
  if (data?.design_tokens) return

  const style = input.styleAnchor?.label ?? 'cinematic previz'
  const design_tokens = {
    l0: formatFromInput(input),
    l1: {
      art_style: style,
      shape_language: 'naturalistic',
      line_quality: 'photographic',
      character_proportion: 'realistic',
      texture_philosophy: 'grounded detail',
    },
    palette: DEFAULT_PALETTE,
    color_meaning: {},
    vfx_approach: 'only when required by the previz direction',
  }
  const { error: updateError } = await supabaseAdmin
    .from('projects')
    .update({ design_tokens })
    .eq('id', projectId)
  assertDbOk('design token persist', updateError)
}

async function persistArtistSources(
  projectId: string,
  input: PipelineInput,
): Promise<{ characters: number; locations: number }> {
  const cast = input.cast?.characters ?? []
  const locations = input.background?.locations ?? []

  const [{ data: existingLocations, error: locationLookupError }] =
    await Promise.all([
      supabaseAdmin
        .from('locations')
        .select('location_id')
        .eq('project_id', projectId),
    ])
  assertDbOk('location source lookup', locationLookupError)

  const locationIds = new Set(
    (existingLocations ?? []).map((row) => row.location_id as string),
  )

  const people = cast
    .filter((character) => character.entity_type === 'person')
    .map((character) => ({
      character_id: character.character_id,
      name: character.name,
      role: character.role ?? 'supporting',
      appearance: character.appearance,
      appearance_native: character.appearance,
      description: null,
      arc: character.arc ?? null,
      motivation: character.motivation ?? null,
      origin: 'producer',
      costume: null,
      i18n_provenance: {},
    }))
  const props = cast
    .filter((character) => character.entity_type === 'object')
    .map((character) => ({
      project_id: projectId,
      prop_id: character.character_id,
      name: character.name,
      description: null,
      appearance: character.appearance,
      appearance_native: character.appearance,
      origin: 'producer',
    }))

  const locationRows = locations
    .filter((location) => !locationIds.has(location.id))
    .map((location) => ({
      project_id: projectId,
      location_id: location.id,
      name: location.name,
      visual_description: location.description,
      visual_description_native: location.description,
      purpose: input.background?.setting ?? '',
      origin: 'producer',
      user_edited: false,
    }))

  if (people.length) {
    const { error } = await supabaseAdmin.rpc('upsert_people_with_default_appearances', {
      p_project_id: projectId,
      p_people: people,
    })
    assertDbOk('people source persist', error)
  }
  if (props.length) {
    const { error } = await supabaseAdmin
      .from('props')
      .upsert(props, { onConflict: 'project_id,prop_id' })
    assertDbOk('prop source persist', error)
  }
  if (locationRows.length) {
    const { error } = await supabaseAdmin.from('locations').insert(locationRows)
    assertDbOk('location source persist', error)
  }

  return {
    characters: cast.length,
    locations: locations.length,
  }
}

/**
 * V2 결과를 기존 Artist/Director가 읽는 canonical scenes/shots 계약으로 적용한다.
 * 실행 직후 자동 반영하지 않고 관리자 명시적 Apply에서만 호출해 V1 결과를 보존한다.
 */
export async function applyWriterV2Package(
  projectId: string,
  pkg: WriterV2Package,
  input: PipelineInput,
): Promise<{
  scenes: number
  shots: number
  characters: number
  locations: number
  characters_submitted: number
  worlds_submitted: number
}> {
  if (!UUID_RE.test(projectId)) {
    throw new Error('writer-v2 downstream apply requires a database project')
  }
  if (pkg.engine !== 'v2' || !pkg.units.length) {
    throw new Error('writer-v2 package has no applicable semantic units')
  }

  const scenes = sceneRows(pkg)
  const shots = shotRows(pkg)
  await ensureV2DesignTokens(projectId, input)
  const artistSources = await persistArtistSources(projectId, input)

  const { error: deleteShotsError } = await supabaseAdmin
    .from('shots')
    .delete()
    .eq('project_id', projectId)
  assertDbOk('canonical shots delete', deleteShotsError)

  const { error: deleteScenesError } = await supabaseAdmin
    .from('scenes')
    .delete()
    .eq('project_id', projectId)
  assertDbOk('canonical scenes delete', deleteScenesError)

  const { error: sceneInsertError } = await supabaseAdmin
    .from('scenes')
    .insert(scenes.map((row) => ({ project_id: projectId, ...row })))
  assertDbOk('canonical scenes insert', sceneInsertError)

  const { error: shotInsertError } = await supabaseAdmin
    .from('shots')
    .insert(shots.map((row) => ({ project_id: projectId, ...row })))
  assertDbOk('canonical shots insert', shotInsertError)

  const { error: projectError } = await supabaseAdmin
    .from('projects')
    .update({ current_stage: 'artist' })
    .eq('id', projectId)
    .in('current_stage', ['producer', 'writer'])
  assertDbOk('project stage advance', projectError)

  const assetDrafts = await triggerAssetDrafts(projectId)
  return {
    scenes: scenes.length,
    shots: shots.length,
    ...artistSources,
    characters_submitted: assetDrafts.characters.submitted,
    worlds_submitted: assetDrafts.worlds.submitted,
  }
}
