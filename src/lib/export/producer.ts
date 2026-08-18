import { createClient } from '@/lib/supabase/client'
import { mergeDraftWithDb, parseProducerDraft, type ProducerBoardState } from '@/stores/producer-store'
import type { ProjectSettings } from '@/types'
import type { BackgroundSource, CastArc, CastMember, CastMotivation } from '@/lib/producer-gate'
import { translate } from '@/lib/i18n'
import { DEFAULT_LOCALE, type AppLocale } from '@/lib/locale'

import { h1, isRecord, kvSection, labelPart, nativeText, textOrUnset } from './md'
import type { ArtifactFile } from './types'

export interface ProducerArtifactBoard {
  storyText: string
  projectSettings: ProjectSettings
  cast: CastMember[]
  backgrounds: BackgroundSource[]
}

const DEFAULT_PRODUCER_SETTINGS: ProjectSettings = {
  playtime: 0,
  genre: '',
  format: 'horizontal_16:9',
  tone: [],
  dialogueLanguage: '',
}

const PRODUCER_PROJECT_SELECT = 'story_text,settings,last_writer_run_id,producer_draft'
const PRODUCER_CHARACTER_SELECT =
  'id,character_id,name,role,entity_type,appearance,appearance_native,arc,motivation,origin'
const PRODUCER_LOCATION_SELECT =
  'id,location_id,name,visual_description,visual_description_native,style_description,purpose,origin,user_edited,last_writer_run_id'

// Plan divergence #4: background image files are a future Producer export capability; BackgroundSource has no image field today.
export async function loadProducerBoard(projectId: string): Promise<ProducerArtifactBoard> {
  const normalizedProjectId = projectId.trim()
  if (!normalizedProjectId) throw new Error('projectId is required')

  const supabase = createClient()
  const [projectRes, charactersRes, locationsRes] = await Promise.all([
    supabase
      .from('projects')
      .select(PRODUCER_PROJECT_SELECT)
      .eq('id', normalizedProjectId)
      .single(),
    supabase
      .from('characters')
      .select(PRODUCER_CHARACTER_SELECT)
      .eq('project_id', normalizedProjectId),
    supabase
      .from('locations')
      .select(PRODUCER_LOCATION_SELECT)
      .eq('project_id', normalizedProjectId),
  ])

  if (projectRes.error) throw new Error(`producer project load failed: ${projectRes.error.message}`)
  if (charactersRes.error) throw new Error(`producer characters load failed: ${charactersRes.error.message}`)
  if (locationsRes.error) throw new Error(`producer locations load failed: ${locationsRes.error.message}`)

  const project = recordValue(projectRes.data)
  if (!project) throw new Error(`producer project load failed: project ${normalizedProjectId} not found`)

  const storyText = stringValue(project.story_text) ?? ''
  const draft = parseProducerDraft(project.producer_draft)
  const dbBoard: ProducerBoardState = {
    storyText,
    storyReady: storyText.trim().length > 0,
    settings: normalizeSettingsFromProject(project.settings),
    cast: recordArray(charactersRes.data).map(mapCharacterRow),
    backgrounds: recordArray(locationsRes.data).map((location, index) =>
      mapBackgroundRow(location, index, project.last_writer_run_id),
    ),
  }
  const restored = mergeDraftWithDb(draft, dbBoard)

  return {
    storyText: restored.storyText,
    projectSettings: restored.settings,
    cast: restored.cast,
    backgrounds: restored.backgrounds,
  }
}

export function collectProducerArtifacts(
  board: ProducerArtifactBoard,
  locale: AppLocale = DEFAULT_LOCALE,
): ArtifactFile[] {
  const record = recordValue(board) ?? {}
  const cast = recordArray(record.cast)
  const backgrounds = recordArray(record.backgrounds)

  return [
    { path: 'producer/story.md', kind: 'text', content: renderStory(record.storyText, locale) },
    { path: 'producer/settings.md', kind: 'text', content: renderSettings(record.projectSettings, locale) },
    { path: 'producer/cast.md', kind: 'text', content: renderCast(cast, locale) },
    { path: 'producer/backgrounds.md', kind: 'text', content: renderBackgrounds(backgrounds, locale) },
  ]
}


function renderStory(storyText: unknown, locale: AppLocale): string {
  const story = stringValue(storyText)?.trim() ?? ''
  return `${h1(translate(locale, 'Story'))}${story || translate(locale, 'Story not written yet')}\n`
}

function renderSettings(settingsValue: unknown, locale: AppLocale): string {
  const settings = recordValue(settingsValue) ?? {}
  return `${h1(translate(locale, 'Producer Settings'))}${kvSection(translate(locale, 'Project Settings'), [
    [translate(locale, 'Genre'), textOrUnset(settings.genre, locale)],
    [translate(locale, 'Sub-genre'), textOrUnset(settings.subGenre, locale)],
    [translate(locale, 'Tone'), listOrUnset(settings.tone, locale)],
    [translate(locale, 'Format'), textOrUnset(settings.format, locale)],
    [translate(locale, 'Runtime'), playtimeLabel(settings.playtime, locale)],
    [translate(locale, 'Dialogue language'), textOrUnset(settings.dialogueLanguage, locale)],
    [translate(locale, 'Target emotion'), listOrUnset(settings.targetEmotion, locale)],
  ])}`
}

function renderCast(cast: Record<string, unknown>[], locale: AppLocale): string {
  if (cast.length === 0) return `${h1(translate(locale, 'Cast'))}${translate(locale, 'No cast')}\n`

  return `${h1(translate(locale, 'Cast'))}${cast
    .map((member, index) =>
      kvSection(
        nativeText(member, 'name') || translate(locale, 'Unnamed cast {index}', { index: index + 1 }),
        [
          [translate(locale, 'Name'), textOrUnset(nativeText(member, 'name'), locale)],
          [translate(locale, 'Role'), textOrUnset(nativeText(member, 'role'), locale)],
          [translate(locale, 'Type'), entityTypeLabel(member.entityType, locale)],
          [translate(locale, 'Appearance'), textOrUnset(nativeText(member, 'appearance'), locale)],
          [translate(locale, 'Arc'), castArcLabel(member.arc, locale)],
          [translate(locale, 'Motivation'), castMotivationLabel(member.motivation, locale)],
        ],
      ),
    )
    .join('')}`
}

function renderBackgrounds(backgrounds: Record<string, unknown>[], locale: AppLocale): string {
  if (backgrounds.length === 0) return `${h1(translate(locale, 'Backgrounds'))}${translate(locale, 'No backgrounds')}\n`

  return `${h1(translate(locale, 'Backgrounds'))}${backgrounds
    .map((background, index) =>
      kvSection(
        nativeText(background, 'name') || translate(locale, 'Unnamed background {index}', { index: index + 1 }),
        [
          [translate(locale, 'Name'), textOrUnset(nativeText(background, 'name'), locale)],
          [translate(locale, 'Purpose'), textOrUnset(nativeText(background, 'purpose'), locale)],
          [translate(locale, 'Visual description'), textOrUnset(nativeText(background, 'visualDescription'), locale)],
        ],
      ),
    )
    .join('')}`
}

function listOrUnset(value: unknown, locale: AppLocale): string {
  const items = Array.isArray(value)
    ? value.map((item) => stringValue(item)?.trim()).filter((item): item is string => Boolean(item))
    : []
  return items.length ? items.join(', ') : translate(locale, 'Not set')
}

function playtimeLabel(seconds: unknown, locale: AppLocale): string {
  return typeof seconds === 'number' && Number.isFinite(seconds) && seconds > 0
    ? translate(locale, '{value}s', { value: seconds })
    : translate(locale, 'Not set')
}

function entityTypeLabel(entityType: unknown, locale: AppLocale): string {
  return entityType === 'object'
    ? `${translate(locale, 'Object')} (object)`
    : `${translate(locale, 'Person')} (person)`
}

function castArcLabel(arcValue: unknown, locale: AppLocale): string {
  const arc = recordValue(arcValue)
  if (!arc) return translate(locale, 'Not set')

  const parts = [
    labelPart(translate(locale, 'Start'), arc.start_state),
    labelPart(translate(locale, 'End'), arc.end_state),
    labelPart(translate(locale, 'Type'), arc.arc_type),
  ].filter(Boolean)
  return parts.length ? parts.join(' / ') : translate(locale, 'Not set')
}

function castMotivationLabel(motivationValue: unknown, locale: AppLocale): string {
  const motivation = recordValue(motivationValue)
  if (!motivation) return translate(locale, 'Not set')

  const parts = [
    labelPart(translate(locale, 'Want'), motivation.want),
    labelPart(translate(locale, 'Need'), motivation.need),
    labelPart(translate(locale, 'Wound'), motivation.wound),
  ].filter(Boolean)
  return parts.length ? parts.join(' / ') : translate(locale, 'Not set')
}

function normalizeSettingsFromProject(settings: unknown): ProjectSettings {
  const draft = parseProducerDraft({
    version: 1,
    savedAt: 0,
    storyText: '',
    storyReady: false,
    settings: recordValue(settings) ?? {},
    cast: [],
    backgrounds: [],
  })
  return draft?.settings ?? { ...DEFAULT_PRODUCER_SETTINGS, tone: [...DEFAULT_PRODUCER_SETTINGS.tone] }
}

function mapCharacterRow(row: Record<string, unknown>, index: number): CastMember {
  return {
    localId: stringValue(row.id) ?? stringValue(row.character_id) ?? `character-${index + 1}`,
    characterId: stringValue(row.character_id),
    name: stringValue(row.name) ?? '',
    entityType: row.entity_type === 'object' ? 'object' : 'person',
    appearance: stringValue(row.appearance_native) ?? stringValue(row.appearance) ?? '',
    role: stringValue(row.role),
    arc: (recordValue(row.arc) as CastArc | null) ?? undefined,
    motivation: (recordValue(row.motivation) as CastMotivation | null) ?? undefined,
    origin: row.origin === 'writer' ? 'writer' : 'producer',
    userEdited: false,
  }
}

function mapBackgroundRow(
  row: Record<string, unknown>,
  index: number,
  lastWriterRunId: unknown,
): BackgroundSource {
  const origin = row.origin === 'writer' ? 'writer' : 'producer'
  return {
    localId: stringValue(row.id) ?? stringValue(row.location_id) ?? `location-${index + 1}`,
    locationId: stringValue(row.location_id),
    name: stringValue(row.name) ?? '',
    visualDescription:
      stringValue(row.visual_description_native) ??
      stringValue(row.visual_description) ??
      stringValue(row.style_description) ??
      '',
    purpose: stringValue(row.purpose) ?? '',
    origin,
    userEdited: row.user_edited === true,
    stale: origin === 'writer' && Boolean(lastWriterRunId) && row.last_writer_run_id !== lastWriterRunId,
  }
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function recordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : []
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null
}
