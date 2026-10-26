// 시리즈 다음 화가 앞 화에서 받은 것(projects.series, 2026-10-26 오너 승인 · 방향 문서 .claude/docs/2026-10-22/series-brief.html).
//   [다음 화 만들기] 때 서버가 한 번 쓰고(앞 화 인물 · 배경 · 복사한 그림 · 말투 · 화풍 · 화면 비율 · 대사 언어), 그 뒤 Producer 시작 ·
//   Writer · Artist 가 읽는다. 앞 화 줄거리는 여기 두지 않는다 — Writer 가 매번 앞 화에서 다시 읽는다.
//   모양 · 읽기 · 순수 규칙의 단일 출처. 서버 · 클라이언트가 같이 쓴다 — 서버 전용 모듈을 import 하지 않는다.
import type { VoiceProfile } from '@/lib/writer/types/pipeline'
import type { DialogueLanguage } from '@/lib/writer/pipeline/util/output-language'
import type { ProjectFormat } from '@/types/project'

export const SERIES_VERSION = 1

/** 앞 화 확정 산문을 Writer 에 넣을 때의 상한(글자). 넘으면 앞부분을 줄이고 끝부분을 더 남긴다. */
export const SERIES_PROSE_MAX_CHARS = 8000

export interface SeriesCharacter {
  /** 앞 화의 인물 번호(slug) 그대로 — 같은 인물이 두 줄로 생기지 않고, 말투가 같은 인물에 붙는다. */
  characterId: string
  name: string
  role: string
  /** 표시 언어 외모 설명(appearance_native, 없으면 appearance). */
  appearance: string
  /** 앞 화 Writer 가 정한 성격. 아크 · 동기 · 의상은 이번 화 사건에 묶여 넘기지 않는다. */
  personality: string[]
  /** 이 프로젝트 보관함으로 복사한 기본 모습 시트. 앞 화에 없었거나 복사에 실패했으면 null. */
  sheetUrl: string | null
  /** 이 프로젝트 보관함으로 복사한 대표 사진. */
  portraitUrl: string | null
  /** 시트를 그린 그림체(style_anchor_key). 그림체가 다르면 이 그림을 참고해 다시 그린다. */
  styleId: string | null
}

export interface SeriesLocation {
  /** 앞 화의 배경 번호 그대로. */
  locationId: string
  name: string
  /** 표시 언어 모습 설명. 이번 화에서 정할 목적은 넘기지 않는다. */
  description: string
  /** 이 프로젝트 보관함으로 복사한 와이드샷. */
  wideShotUrl: string | null
  styleId: string | null
}

export interface SeriesSnapshot {
  version: typeof SERIES_VERSION
  /** 기록용. 앞 화를 지우면 projects.reference_project_id 가 null 이 되고, 이 값으로는 앞 화를 읽지 않는다. */
  prevProjectId: string
  /** 앞 화를 지워도 카드 · 띠에 보이는 앞 화 제목. */
  prevTitle: string
  copiedAt: string
  characters: SeriesCharacter[]
  locations: SeriesLocation[]
  /** 앞 화가 대사까지 끝났을 때만 있다. character_id 로 이 화 인물에 붙는다. */
  voices: VoiceProfile[]
  /** 앞 화 그림체(style_anchor_key). Artist 스타일 팝업이 이 그림체로 시작한다. */
  styleId: string | null
  /** 앞 화 화면 비율 — 시작 화면의 기본값일 뿐 바꿀 수 있다. */
  format: ProjectFormat | null
  /** 앞 화 대사 언어 — 다음 화도 같은 언어로 잠근다. */
  dialogueLanguage: DialogueLanguage | null
  /** [다음 화 만들기]에서 "앞 화 마지막 장면에서 이어 시작하기"를 골랐다. 그림은 projects.optional_reference_frame_url. */
  continuesLastScene: boolean
  /** 복사하지 못한 그림의 이름(인물 · 배경). 카드는 넘어왔고 그림은 Artist 에서 새로 그린다. */
  copyFailures: string[]
}

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const strOrNull = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null)
const strList = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0) : [])
const DIALOGUE_LANGUAGES: readonly DialogueLanguage[] = ['ko', 'en', 'ja', 'zh']
const FORMATS: readonly ProjectFormat[] = ['horizontal_16:9', 'vertical_9:16', 'cinema_2.39:1', 'square_1:1']

function parseCharacter(raw: unknown): SeriesCharacter | null {
  if (!isObject(raw)) return null
  const characterId = str(raw.characterId).trim()
  const name = str(raw.name).trim()
  if (!characterId || !name) return null
  return {
    characterId,
    name,
    role: str(raw.role) || 'supporting',
    appearance: str(raw.appearance),
    personality: strList(raw.personality),
    sheetUrl: strOrNull(raw.sheetUrl),
    portraitUrl: strOrNull(raw.portraitUrl),
    styleId: strOrNull(raw.styleId),
  }
}

function parseLocation(raw: unknown): SeriesLocation | null {
  if (!isObject(raw)) return null
  const locationId = str(raw.locationId).trim()
  const name = str(raw.name).trim()
  if (!locationId || !name) return null
  return {
    locationId,
    name,
    description: str(raw.description),
    wideShotUrl: strOrNull(raw.wideShotUrl),
    styleId: strOrNull(raw.styleId),
  }
}

function parseVoice(raw: unknown): VoiceProfile | null {
  if (!isObject(raw)) return null
  const characterId = str(raw.character_id).trim()
  if (!characterId) return null
  return {
    character_id: characterId,
    name: str(raw.name),
    speech_style: str(raw.speech_style),
    formality: str(raw.formality),
    sentence_length: str(raw.sentence_length),
    verbal_tics: strList(raw.verbal_tics),
    emotional_expression: str(raw.emotional_expression),
    taboo: str(raw.taboo),
    example_lines: strList(raw.example_lines),
  }
}

/** projects.series(jsonb) → 시리즈 정보. 시리즈가 아니거나 모양이 틀리면 null. */
export function parseSeries(raw: unknown): SeriesSnapshot | null {
  if (!isObject(raw) || raw.version !== SERIES_VERSION) return null
  const prevProjectId = str(raw.prevProjectId).trim()
  const prevTitle = str(raw.prevTitle).trim()
  if (!prevProjectId || !prevTitle) return null
  const list = <T>(v: unknown, parse: (x: unknown) => T | null): T[] =>
    Array.isArray(v) ? v.map(parse).filter((x): x is T => x !== null) : []
  const dialogueLanguage = DIALOGUE_LANGUAGES.find((lang) => lang === raw.dialogueLanguage) ?? null
  return {
    version: SERIES_VERSION,
    prevProjectId,
    prevTitle,
    copiedAt: str(raw.copiedAt),
    characters: list(raw.characters, parseCharacter),
    locations: list(raw.locations, parseLocation),
    voices: list(raw.voices, parseVoice),
    styleId: strOrNull(raw.styleId),
    format: FORMATS.find((f) => f === raw.format) ?? null,
    dialogueLanguage,
    continuesLastScene: raw.continuesLastScene === true,
    copyFailures: strList(raw.copyFailures),
  }
}

/** 그림체 정체 — 프리셋은 키, 사용자가 올린 그림체도 프로젝트마다 custom_<uuid> 키를 갖는다(복사하면 키도 같이 넘어간다). */
export function styleIdOf(project: { style_anchor_key?: string | null; custom_style_anchor?: unknown }): string | null {
  const key = typeof project.style_anchor_key === 'string' ? project.style_anchor_key.trim() : ''
  if (key) return key
  return isObject(project.custom_style_anchor) && typeof project.custom_style_anchor.url === 'string' ? 'custom' : null
}

/** 이어받은 그림을 이 화에서 어떻게 쓰나 — 그대로 쓴다 / 그 그림을 참고해 이 화 그림체로 다시 그린다 / 그림이 없어 새로 그린다. */
export type SeriesImageUse = 'reuse' | 'redraw' | 'none'

/**
 * Q5(10-22): 같은 그림체면 그대로 쓰고, 다르면 앞 화 그림을 참고해 다시 그린다.
 *   이번 화 산문에 안 나오는 이어받은 인물 · 배경은 보관만 한다 — 그림체가 달라도 다시 그리지 않고 다음 화로 넘긴다.
 */
export function seriesImageUse(item: { styleId: string | null; image: string | null }, input: { currentStyleId: string | null; appears: boolean }): SeriesImageUse {
  if (!item.image) return 'none'
  if (!input.appears) return 'reuse'
  return item.styleId === input.currentStyleId ? 'reuse' : 'redraw'
}

/** 앞 화 확정 산문을 상한 안으로 줄인다 — 다음 화로 이어지는 끝부분을 더 남긴다. */
export function trimSeriesProse(text: string, max = SERIES_PROSE_MAX_CHARS): string {
  const clean = text.trim()
  if (clean.length <= max) return clean
  const marker = '\n\n(…)\n\n'
  const head = Math.floor((max - marker.length) / 4)
  const tail = max - marker.length - head
  return `${clean.slice(0, head).trimEnd()}${marker}${clean.slice(clean.length - tail).trimStart()}`
}
