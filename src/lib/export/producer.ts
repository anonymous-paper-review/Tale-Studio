import { createClient } from '@/lib/supabase/client'
import { mergeDraftWithDb, parseProducerDraft, type ProducerBoardState } from '@/stores/producer-store'
import type { ProjectSettings } from '@/types'
import type { BackgroundSource, CastArc, CastMember, CastMotivation } from '@/lib/producer-gate'

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

export function collectProducerArtifacts(board: ProducerArtifactBoard): ArtifactFile[] {
  const record = recordValue(board) ?? {}
  const cast = recordArray(record.cast)
  const backgrounds = recordArray(record.backgrounds)

  return [
    { path: 'producer/story.md', kind: 'text', content: renderStory(record.storyText) },
    { path: 'producer/settings.md', kind: 'text', content: renderSettings(record.projectSettings) },
    { path: 'producer/cast.md', kind: 'text', content: renderCast(cast) },
    { path: 'producer/backgrounds.md', kind: 'text', content: renderBackgrounds(backgrounds) },
  ]
}


function renderStory(storyText: unknown): string {
  const story = stringValue(storyText)?.trim() ?? ''
  return `${h1('스토리')}${story || '스토리 작성 전'}\n`
}

function renderSettings(settingsValue: unknown): string {
  const settings = recordValue(settingsValue) ?? {}
  return `${h1('프로듀서 설정')}${kvSection('프로젝트 설정', [
    ['장르', textOrUnset(settings.genre)],
    ['세부 장르', textOrUnset(settings.subGenre)],
    ['톤', listOrUnset(settings.tone)],
    ['포맷', textOrUnset(settings.format)],
    ['러닝타임', playtimeLabel(settings.playtime)],
    ['대사 언어', textOrUnset(settings.dialogueLanguage)],
    ['목표 감정', listOrUnset(settings.targetEmotion)],
  ])}`
}

function renderCast(cast: Record<string, unknown>[]): string {
  if (cast.length === 0) return `${h1('캐스트')}캐스트 없음\n`

  return `${h1('캐스트')}${cast
    .map((member, index) =>
      kvSection(nativeText(member, 'name') || `이름 미정 캐스트 ${index + 1}`, [
        ['이름', textOrUnset(nativeText(member, 'name'))],
        ['역할', textOrUnset(nativeText(member, 'role'))],
        ['유형', entityTypeLabel(member.entityType)],
        ['외형', textOrUnset(nativeText(member, 'appearance'))],
        ['아크', castArcLabel(member.arc)],
        ['동기', castMotivationLabel(member.motivation)],
      ]),
    )
    .join('')}`
}

function renderBackgrounds(backgrounds: Record<string, unknown>[]): string {
  if (backgrounds.length === 0) return `${h1('배경')}배경 없음\n`

  return `${h1('배경')}${backgrounds
    .map((background, index) =>
      kvSection(nativeText(background, 'name') || `이름 미정 배경 ${index + 1}`, [
        ['이름', textOrUnset(nativeText(background, 'name'))],
        ['목적', textOrUnset(nativeText(background, 'purpose'))],
        ['시각 설명', textOrUnset(nativeText(background, 'visualDescription'))],
      ]),
    )
    .join('')}`
}

function listOrUnset(value: unknown): string {
  const items = Array.isArray(value)
    ? value.map((item) => stringValue(item)?.trim()).filter((item): item is string => Boolean(item))
    : []
  return items.length ? items.join(', ') : '미설정'
}

function playtimeLabel(seconds: unknown): string {
  return typeof seconds === 'number' && Number.isFinite(seconds) && seconds > 0
    ? `${seconds}초`
    : '미설정'
}

function entityTypeLabel(entityType: unknown): string {
  return entityType === 'object' ? '사물 (object)' : '인물 (person)'
}

function castArcLabel(arcValue: unknown): string {
  const arc = recordValue(arcValue)
  if (!arc) return '미설정'

  const parts = [
    labelPart('시작', arc.start_state),
    labelPart('끝', arc.end_state),
    labelPart('유형', arc.arc_type),
  ].filter(Boolean)
  return parts.length ? parts.join(' / ') : '미설정'
}

function castMotivationLabel(motivationValue: unknown): string {
  const motivation = recordValue(motivationValue)
  if (!motivation) return '미설정'

  const parts = [
    labelPart('원함', motivation.want),
    labelPart('필요', motivation.need),
    labelPart('상처', motivation.wound),
  ].filter(Boolean)
  return parts.length ? parts.join(' / ') : '미설정'
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
