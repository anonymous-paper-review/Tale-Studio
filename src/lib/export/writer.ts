import { h1, h2, isRecord, kvSection, labelPart, nativeText, table, textOrUnset } from './md'
import type { ArtifactFile } from './types'

export interface WriterExportProjection {
  storyBible: WriterStoryBibleProjection | null
  scenes: unknown[] | null
  shotDesign: unknown[] | null
  renderPrompts: Record<string, unknown> | null
}

export interface WriterStoryBibleProjection {
  genre: unknown | null
  narrativeStructure: unknown | null
  characters: unknown | null
}

export interface WriterDbFallback {
  scenes?: WriterDbSceneRow[]
  shots?: WriterDbShotRow[]
}

export type WriterDbSceneRow = Record<string, unknown>
export type WriterDbShotRow = Record<string, unknown>

export interface WriterExportFetchResponse {
  ok: boolean
  status: number
  json(): Promise<unknown>
}

export type WriterExportFetch = (
  input: string,
  init?: { method?: 'GET' },
) => Promise<WriterExportFetchResponse>

export interface CollectWriterArtifactsOptions {
  fetchFn?: WriterExportFetch
  loadDbFallback?: (projectId: string) => Promise<WriterDbFallback>
}

/**
 * Browser-context collector: the relative API URL relies on auth cookies, and the
 * default DB fallback performs no DB access; inject fallback rows explicitly.
 */
export async function collectWriterArtifacts(
  projectId: string,
  options: CollectWriterArtifactsOptions = {},
): Promise<ArtifactFile[]> {
  const fetchFn = options.fetchFn ?? defaultFetch
  const response = await fetchFn(`/api/writer/export/${encodeURIComponent(projectId)}`, { method: 'GET' })
  if (!response.ok) {
    throw new Error(`writer export failed: ${response.status}`)
  }

  const projection = normalizeProjection(await response.json())
  const fallback = needsFallback(projection)
    ? await (options.loadDbFallback ?? defaultDbFallback)(projectId)
    : {}

  return [
    { path: 'writer/story-bible.md', kind: 'text', content: renderStoryBible(projection) },
    { path: 'writer/scenes.md', kind: 'text', content: renderScenes(projection, fallback) },
    { path: 'writer/shots.md', kind: 'text', content: renderShots(projection, fallback) },
    { path: 'writer/prompts.md', kind: 'text', content: renderPrompts(projection, fallback) },
  ]
}

/** Browser-context fetch only: relative URLs rely on ambient auth cookies. */
async function defaultFetch(
  input: string,
  init?: { method?: 'GET' },
): Promise<WriterExportFetchResponse> {
  if (typeof fetch !== 'function') throw new Error('global fetch is not available')
  return fetch(input, init)
}

/** Performs no DB access; inject loadDbFallback to provide fallback rows. */
async function defaultDbFallback(): Promise<WriterDbFallback> {
  return { scenes: [], shots: [] }
}

function normalizeProjection(value: unknown): WriterExportProjection {
  const record = isRecord(value) ? value : {}
  const storyBible = isRecord(record.storyBible) ? record.storyBible : null

  return {
    storyBible: storyBible
      ? {
          genre: storyBible.genre ?? null,
          narrativeStructure: storyBible.narrativeStructure ?? null,
          characters: storyBible.characters ?? null,
        }
      : null,
    scenes: Array.isArray(record.scenes) ? record.scenes : null,
    shotDesign: Array.isArray(record.shotDesign) ? record.shotDesign : null,
    renderPrompts: isRecord(record.renderPrompts) ? record.renderPrompts : null,
  }
}

function needsFallback(projection: WriterExportProjection): boolean {
  return (
    projection.storyBible === null ||
    projection.scenes === null ||
    projection.shotDesign === null ||
    projection.renderPrompts === null
  )
}

function renderStoryBible(projection: WriterExportProjection): string {
  const storyBible = projection.storyBible
  let body = h1('Writer Story Bible')
  if (!storyBible) return body + incompleteSection('storyBible 산출물이 없습니다.')

  if (!storyBible.genre || !storyBible.narrativeStructure || !storyBible.characters) {
    body += incompleteSection('storyBible 산출물이 일부 누락되었습니다.')
  }

  body += renderGenre(storyBible.genre)
  body += renderNarrativeStructure(storyBible.narrativeStructure)
  body += renderCharacters(storyBible.characters)
  return body
}

function renderGenre(value: unknown): string {
  const genre = isRecord(value) ? value : null
  if (!genre) return `${h2('Genre')}미설정\n\n`

  return kvSection('Genre', [
    ['장르', nativeText(genre, 'genre')],
    ['세부 장르', nativeText(genre, 'subGenre')],
    ['톤', listText(genre.tone)],
    ['목표 감정', listText(genre.targetEmotion)],
    ['러닝타임', numberLabel(genre.runtime_seconds, '초')],
    ['Depth', textValue(genre.depth_level)],
    ['포맷', textValue(genre.format)],
  ])
}

function renderNarrativeStructure(value: unknown): string {
  const structure = isRecord(value) ? value : null
  if (!structure) return `${h2('Narrative Structure')}미설정\n\n`

  let body = kvSection('Narrative Structure', [
    ['구조', nativeText(structure, 'structure_type')],
    ['시점', nativeText(structure, 'pov')],
    ['주제', nativeText(structure, 'theme')],
    ['중심 극적 질문', nativeText(structure, 'central_dramatic_question')],
    ['전환점 위치', numberLabel(structure.turning_point_position, '')],
  ])

  const acts = Array.isArray(structure.acts) ? structure.acts.filter(isRecord) : []
  if (acts.length) {
    body += table(
      ['Act', 'Purpose', 'Proportion'],
      acts.map((act) => [
        textOrUnset(textValue(act.act_id)),
        textOrUnset(nativeText(act, 'purpose')),
        textOrUnset(numberLabel(act.proportion, '')),
      ]),
    )
  }

  return body
}

function renderCharacters(value: unknown): string {
  const characters = characterList(value)
  if (characters.length === 0) return `${h2('Characters')}캐릭터 없음\n\n`

  return `${h2('Characters')}${table(
    ['ID', 'Name', 'Role', 'Arc', 'Motivation', 'Appearance'],
    characters.map((character) => [
      textOrUnset(textValue(character.id) || textValue(character.character_id)),
      textOrUnset(nativeText(character, 'name')),
      textOrUnset(nativeText(character, 'role')),
      textOrUnset(arcText(character.arc)),
      textOrUnset(motivationText(character.motivation)),
      textOrUnset(nativeText(character, 'appearance_description') || nativeText(character, 'appearance')),
    ]),
  )}`
}

function renderScenes(projection: WriterExportProjection, fallback: WriterDbFallback): string {
  let body = h1('Writer Scenes')
  if (projection.scenes) {
    body += sceneTable(projection.scenes)
    return body
  }

  body += incompleteSection('scenes 산출물이 없습니다.')
  const fallbackScenes = fallback.scenes ?? []
  if (fallbackScenes.length) body += h2('DB Fallback Scenes') + sceneTable(fallbackScenes)
  return body
}

function sceneTable(scenes: unknown[]): string {
  const rows = scenes.filter(isRecord).map((scene) => [
    textOrUnset(textValue(scene.scene_id) || textValue(scene.id)),
    textOrUnset(scenePlaceText(scene)),
    textOrUnset(sceneCharactersText(scene)),
    textOrUnset(sceneSummaryText(scene)),
    textOrUnset(sceneEmotionText(scene)),
    textOrUnset(sceneDialogueText(scene)),
  ])

  if (!rows.length) return '씬 없음\n\n'
  return table(['Scene', 'Location / Time', 'Characters', 'Summary', 'Emotional Beat', 'Dialogue / Actions'], rows)
}

function renderShots(projection: WriterExportProjection, fallback: WriterDbFallback): string {
  let body = h1('Writer Shots')
  if (projection.shotDesign) {
    body += shotDesignTable(projection.shotDesign)
    return body
  }

  body += incompleteSection('shotDesign 산출물이 없습니다.')
  const fallbackShots = fallback.shots ?? []
  if (fallbackShots.length) body += h2('DB Fallback Shots') + fallbackShotTable(fallbackShots)
  return body
}

function shotDesignTable(shots: unknown[]): string {
  const rows = shots.filter(isRecord).map((shot) => {
    const intent = recordValue(shot.intent)
    const staticSpec = recordValue(shot.static_spec) || recordValue(shot.staticSpec)
    const dynamicSpec = recordValue(shot.dynamic_spec) || recordValue(shot.dynamicSpec)

    return [
      textOrUnset(
        textValue(intent?.shot_id) || textValue(staticSpec?.shot_id) || textValue(dynamicSpec?.shot_id),
      ),
      textOrUnset(textValue(intent?.scene_id)),
      textOrUnset(intentText(intent)),
      textOrUnset(staticSpecText(staticSpec)),
      textOrUnset(dynamicSpecText(dynamicSpec)),
    ]
  })

  if (!rows.length) return '샷 없음\n\n'
  return table(['Shot', 'Scene', 'Intent', 'Static Spec', 'Dynamic Spec'], rows)
}

function fallbackShotTable(shots: unknown[]): string {
  const rows = shots.filter(isRecord).map((shot) => [
    textOrUnset(textValue(shot.shot_id) || textValue(shot.id)),
    textOrUnset(textValue(shot.scene_id)),
    textOrUnset(nativeText(shot, 'action_description')),
    textOrUnset(textValue(shot.shot_type)),
    textOrUnset(numberLabel(shot.duration_seconds ?? shot.duration, '초')),
    textOrUnset(dialogueText(shot.dialogue_lines)),
  ])

  if (!rows.length) return '샷 없음\n\n'
  return table(['Shot', 'Scene', 'Action', 'Type', 'Duration', 'Dialogue'], rows)
}

function renderPrompts(projection: WriterExportProjection, fallback: WriterDbFallback): string {
  let body = h1('Writer Render Prompts')
  if (projection.renderPrompts) {
    body += promptTable(projection.renderPrompts)
    return body
  }

  body += incompleteSection('renderPrompts 산출물이 없습니다.')
  const fallbackShots = fallback.shots ?? []
  if (fallbackShots.length) body += h2('DB Fallback Prompts') + fallbackPromptTable(fallbackShots)
  return body
}

function promptTable(renderPrompts: Record<string, unknown>): string {
  const shots = Array.isArray(renderPrompts.shots) ? renderPrompts.shots.filter(isRecord) : []
  const rows = shots.map((shot) => {
    const t2i = recordValue(shot.t2i)
    const ti2v = recordValue(shot.ti2v)
    return [
      textOrUnset(textValue(shot.shot_id)),
      textOrUnset(textValue(shot.scene_id)),
      textOrUnset(textValue(t2i?.prompt)),
      textOrUnset(textValue(ti2v?.motion_prompt)),
      textOrUnset(numberLabel(shot.duration_seconds ?? ti2v?.duration_seconds, '초')),
    ]
  })

  if (!rows.length) return '프롬프트 없음\n\n'
  return table(['Shot', 'Scene', 'T2I Prompt (EN)', 'TI2V Motion Prompt (EN)', 'Duration'], rows)
}

function fallbackPromptTable(shots: unknown[]): string {
  const rows = shots
    .filter(isRecord)
    .filter((shot) => textValue(shot.prompt))
    .map((shot) => [
      textOrUnset(textValue(shot.shot_id) || textValue(shot.id)),
      textOrUnset(textValue(shot.scene_id)),
      textOrUnset(textValue(shot.prompt)),
    ])

  if (!rows.length) return '프롬프트 없음\n\n'
  return table(['Shot', 'Scene', 'Prompt (EN)'], rows)
}

function incompleteSection(reason: string): string {
  return `${h2('¶파이프라인 미완료')}${reason}\n\n`
}

function characterList(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.filter(isRecord)
  const record = recordValue(value)
  if (!record) return []
  return Array.isArray(record.characters) ? record.characters.filter(isRecord) : []
}

function scenePlaceText(scene: Record<string, unknown>): string {
  return joinParts([
    nativeText(scene, 'location'),
    nativeText(scene, 'time_of_day') || nativeText(scene, 'timeOfDay'),
  ])
}

function sceneCharactersText(scene: Record<string, unknown>): string {
  return (
    listText(scene.characters_in_scene) ||
    listText(scene.characters_present) ||
    listText(scene.characters)
  )
}

function sceneSummaryText(scene: Record<string, unknown>): string {
  return (
    nativeText(scene, 'narrative_summary') ||
    nativeText(scene, 'narrativeSummary') ||
    nativeText(scene, 'purpose') ||
    listText(scene.scene_actions)
  )
}

function sceneEmotionText(scene: Record<string, unknown>): string {
  const beat = recordValue(scene.emotion_beat) || recordValue(scene.emotionBeat)
  if (beat) {
    const start = nativeText(beat, 'start')
    const end = nativeText(beat, 'end')
    return joinParts([start, end], ' → ')
  }

  return nativeText(scene, 'mood')
}

function sceneDialogueText(scene: Record<string, unknown>): string {
  return nativeText(scene, 'dialogue_summary') || listText(scene.scene_actions)
}

function intentText(intent: Record<string, unknown> | null): string {
  if (!intent) return ''
  return joinParts([
    labelPart('Purpose', nativeText(intent, 'dramatic_purpose')),
    labelPart('Focus', nativeText(intent, 'audience_focus')),
    labelPart('Position', textValue(intent.shot_position_in_scene)),
    labelPart('Duration', numberLabel(intent.duration_seconds, '초')),
  ])
}

function staticSpecText(staticSpec: Record<string, unknown> | null): string {
  if (!staticSpec) return ''
  const framing = recordValue(staticSpec.framing)
  return joinParts([
    labelPart('Type', textValue(staticSpec.shot_type)),
    labelPart('Angle', textValue(staticSpec.camera_angle)),
    labelPart('Lens', numberLabel(staticSpec.lens_mm, 'mm')),
    labelPart('Focal', framing ? nativeText(framing, 'focal_point') : ''),
    labelPart('First frame', nativeText(staticSpec, 'first_frame_prompt')),
  ])
}

function dynamicSpecText(dynamicSpec: Record<string, unknown> | null): string {
  if (!dynamicSpec) return ''
  const motion = recordValue(dynamicSpec.camera_motion)
  return joinParts([
    labelPart('Camera', cameraMotionText(motion)),
    labelPart('Character', characterMotionText(dynamicSpec.character_motion)),
    labelPart('Motion prompt', nativeText(dynamicSpec, 'motion_prompt')),
  ])
}

function cameraMotionText(motion: Record<string, unknown> | null): string {
  if (!motion) return ''
  return joinParts([
    textValue(motion.type),
    textValue(motion.direction),
    textValue(motion.speed),
    textValue(motion.magnitude),
  ])
}

function characterMotionText(value: unknown): string {
  if (!Array.isArray(value)) return ''
  return value
    .filter(isRecord)
    .map((motion) => joinParts([textValue(motion.character_id), nativeText(motion, 'verb')], ': '))
    .filter(Boolean)
    .join('; ')
}

function arcText(value: unknown): string {
  const arc = recordValue(value)
  if (!arc) return ''
  return joinParts([
    labelPart('시작', nativeText(arc, 'start_state')),
    labelPart('끝', nativeText(arc, 'end_state')),
    labelPart('유형', nativeText(arc, 'arc_type')),
  ])
}

function motivationText(value: unknown): string {
  const motivation = recordValue(value)
  if (!motivation) return ''
  return joinParts([
    labelPart('원함', nativeText(motivation, 'want')),
    labelPart('필요', nativeText(motivation, 'need')),
    labelPart('상처', nativeText(motivation, 'wound')),
  ])
}

function dialogueText(value: unknown): string {
  if (typeof value === 'string') return value
  if (!Array.isArray(value)) return ''

  return value
    .map((line) => {
      if (typeof line === 'string') return line
      if (!isRecord(line)) return ''
      const speaker = textValue(line.characterId) || textValue(line.character_id)
      const text = nativeText(line, 'text')
      return joinParts([speaker, text], ': ')
    })
    .filter(Boolean)
    .join('; ')
}

function joinParts(parts: Array<string | undefined | null>, separator = ' / '): string {
  return parts.map((part) => part?.trim()).filter(Boolean).join(separator)
}

function listText(value: unknown): string {
  if (!Array.isArray(value)) return ''
  return value.map(listItemText).filter(Boolean).join(', ')
}

function listItemText(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (!isRecord(value)) return ''
  return (
    nativeText(value, 'name') ||
    textValue(value.id) ||
    textValue(value.character_id) ||
    textValue(value.scene_id) ||
    textValue(value.shot_id) ||
    nativeText(value, 'text')
  )
}

function numberLabel(value: unknown, suffix: string): string {
  return typeof value === 'number' && Number.isFinite(value) ? `${value}${suffix}` : ''
}

function textValue(value: unknown): string | undefined {
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return undefined
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null
}