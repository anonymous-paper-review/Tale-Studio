// Producer 시작 화면의 AI 추천(리뉴얼 1차 2026-10-19) — 모델 답 검사 · 규칙 추천 · 모델에게 보낼 글. 순수 함수만.
//   모델은 장르·분위기 · 길이 · 바꿈 정도 · 자료 종류 · 이유 두 줄 · 임시 제목을 한 번에 JSON 으로 답한다.
//   답이 목록 밖이거나 모델이 실패하면 프로토타입 recommend()/recLevel() 를 옮긴 규칙으로 고른다.
//   이유 · 제목은 프로젝트 언어로 쓴다(모델은 지시로, 규칙은 사전 번역으로). 지시문은 영어로 둔다.
//   약속: tests/producer/entry-recommend.test.ts
import { translate } from '@/lib/i18n/translate'
import type { AppLocale } from '@/lib/locale'
import { detectScript } from '@/lib/writer/script/parse'
import { preservedRuntimeSeconds } from '@/lib/writer/script/preserve'
import {
  KEEP_MIN_IDEA_CHARS,
  LEVELS,
  MOODS,
  RUNTIMES,
  fileHasText,
  ideaLength,
  isLevelKey,
  isMaterialKind,
  isMoodKey,
  isRuntimeKey,
  levelAvailable,
  moodWordIn,
  runtimeKeyFromSeconds,
  runtimeSpanIn,
  type LevelKey,
  type MaterialKind,
  type MoodKey,
  type RuntimeKey,
} from '@/features/entry/options'
import type { EntryFileMeta, EntryRec } from './draft'

export interface RecommendInput {
  idea: string
  file: EntryFileMeta | null
  locale: AppLocale
}

export type RecommendationCore = Omit<EntryRec, 'basis'>

// ── 규칙 추천 ─────────────────────────────────────────────────────────────────

// 이야기 낱말 → 장르(프로토타입 H 목록 순서). "시간"은 너무 흔한 말이라 시간 여행 · 타임머신만 본다.
const THEME_PATTERNS: Array<{ re: RegExp; mood: MoodKey; why: string }> = [
  { re: /고장|자판기|웃기|엉뚱|vending machine|funny|silly/i, mood: 'comedy', why: 'An odd incident, so I read it as comedy' }, // i18n-ok: 이야기 낱말 알아듣기
  { re: /귀신|무서|밤 열|CCTV|ghost|haunted|scary/i, mood: 'horror', why: 'There is a scary scene, so I read it as horror' }, // i18n-ok: 이야기 낱말 알아듣기
  { re: /사랑|설레|옥상에서 마주|in love|\bcrush\b/i, mood: 'romance', why: "The two people's feelings are at the center, so I read it as romance" }, // i18n-ok: 이야기 낱말 알아듣기
  { re: /가족|아버지|엄마|딸|아들|\bfather\b|\bmother\b|daughter|\bson\b/i, mood: 'human_family', why: 'A family story, so I read it as human and family' }, // i18n-ok: 이야기 낱말 알아듣기
  { re: /로봇|우주|미래|타임머신|시간 여행|robot|outer space|the future|time travel/i, mood: 'scifi_fantasy', why: 'An imagined setting, so I read it as sci-fi and fantasy' }, // i18n-ok: 이야기 낱말 알아듣기
  { re: /범인|단서|사라진|culprit|\bclue|disappear/i, mood: 'mystery', why: 'A story chasing a hidden secret, so I read it as mystery' }, // i18n-ok: 이야기 낱말 알아듣기
]

/** 자료 종류마다 추천 바꿈 정도(프로토타입 KINDS.rec): 대본은 그대로, 사진 찍은 글은 다듬기, 메모는 새롭게 키우기. */
const KIND_LEVEL: Record<MaterialKind, LevelKey> = { '1-1': 'keep', '1-2': 'keep', '1-3': 'grow', img: 'polish' }
/** 대본이 아닌 파일의 길이(프로토타입 KINDS.rt = 15~60초). */
const NOTES_RUNTIME: RuntimeKey = 'r60'
/** 대본 분량을 못 셀 때: 한 쪽(약 1분)을 글자 700자쯤으로 본다. */
const CHARS_PER_SECOND = 12

function fileTextOf(file: EntryFileMeta | null): string {
  return fileHasText(file) ? (file!.text ?? '').trim() : ''
}

/** 글 파일 → 자료 종류. 이미지는 언제나 글이 담긴 이미지다. */
function kindOf(file: EntryFileMeta | null, fileText: string): MaterialKind {
  if (file?.kind === 'image') return 'img'
  if (!fileText) return '1-3'
  const detected = detectScript(fileText).kind
  if (detected === 'screenplay') return '1-1'
  if (detected === 'stage_play' || detected === 'radio') return '1-2'
  return '1-3'
}

function shortTitle(text: string, max = 20): string {
  const t = text.trim()
  if (Array.from(t).length <= max) return t
  const cut = Array.from(t).slice(0, max).join('')
  const space = cut.lastIndexOf(' ')
  return (space >= 8 ? cut.slice(0, space) : cut).trim()
}

/** 임시 제목: 아이디어 첫 마디, 없으면 파일 이름(확장자 · 밑줄 정리). */
function fallbackTitle(input: RecommendInput): string {
  const first = input.idea.trim().split(/[.!?。,\n]/)[0]?.trim() ?? ''
  if (first) return shortTitle(first)
  if (input.file) return shortTitle(input.file.name.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' '), 40)
  return ''
}

export function fallbackRecommendation(input: RecommendInput): RecommendationCore {
  const t = (key: string, params?: Record<string, string | number>) => translate(input.locale, key, params)
  const idea = input.idea ?? ''
  const fileText = fileTextOf(input.file)
  const kind = kindOf(input.file, fileText)

  // 장르·분위기: 글에 적힌 장르 이름 → 이야기 낱말 → 드라마.
  let mood: MoodKey = 'drama'
  let moodWhy = t('No clear genre, so I picked drama')
  const named = moodWordIn(idea)
  const theme = THEME_PATTERNS.find((p) => p.re.test(idea) || (!!fileText && p.re.test(fileText.slice(0, 4000))))
  if (named) {
    mood = named.mood
    moodWhy = t('Your text says "{word}"', { word: named.word })
  } else if (theme) {
    mood = theme.mood
    moodWhy = t(theme.why)
  }

  // 길이: 글에 적힌 길이 → 대본 분량 → 자료 분량 → 줄거리 분량.
  let runtime: RuntimeKey
  let runtimeWhy: string
  const span = runtimeSpanIn(idea)
  if (span) {
    runtime = runtimeKeyFromSeconds(span.seconds)
    runtimeWhy = t('Your text says "{word}"', { word: span.span })
  } else if (fileText && (kind === '1-1' || kind === '1-2')) {
    const estimate = preservedRuntimeSeconds(fileText) ?? Math.round(Array.from(fileText).length / CHARS_PER_SECOND)
    runtime = runtimeKeyFromSeconds(estimate)
    runtimeWhy = t('Estimated from the script length')
  } else if (fileText) {
    runtime = NOTES_RUNTIME
    runtimeWhy = t('Estimated from the material length')
  } else if (ideaLength(idea) < KEEP_MIN_IDEA_CHARS) {
    runtime = 'r60'
    runtimeWhy = t('A short idea, so I kept it short')
  } else {
    runtime = 'r300'
    runtimeWhy = t('Estimated from the plot length')
  }

  // 바꿈 정도: 파일이면 자료 종류대로, 글만 있으면 60자 넘는 줄거리는 다듬기 · 짧은 아이디어는 새롭게 키우기.
  const level: LevelKey = fileText ? KIND_LEVEL[kind] : ideaLength(idea) >= KEEP_MIN_IDEA_CHARS ? 'polish' : 'grow'

  return { kind, mood, moodWhy, runtime, runtimeWhy, level, title: fallbackTitle(input), source: 'rules' }
}

// ── 모델 답 검사 ──────────────────────────────────────────────────────────────

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

function cleanLine(v: unknown, max: number): string {
  if (typeof v !== 'string') return ''
  // 이유 · 제목은 화면 문구다 — 줄바꿈 · 긴 대시를 걷는다(약속 A).
  return v.replace(/\s+/g, ' ').replace(/\s*[—–―]\s*/g, ', ').trim().slice(0, max)
}

/** 모델 JSON → 추천. 장르 · 길이 · 바꿈 정도 · 종류가 목록 밖이면 null(규칙으로 간다). */
export function parseRecommendation(raw: unknown): Omit<RecommendationCore, 'source'> | null {
  let value = raw
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value)
    } catch {
      return null
    }
  }
  if (!isObject(value)) return null
  if (!isMaterialKind(value.kind) || !isMoodKey(value.mood) || !isRuntimeKey(value.runtime) || !isLevelKey(value.level)) return null
  return {
    kind: value.kind,
    mood: value.mood,
    moodWhy: cleanLine(value.moodWhy, 160),
    runtime: value.runtime,
    runtimeWhy: cleanLine(value.runtimeWhy, 160),
    level: value.level,
    title: cleanLine(value.title, 60),
  }
}

/**
 * 모델 답(없으면 null)과 재료로 최종 추천을 정한다.
 *   - 이미지만 올린 자료는 종류를 글이 담긴 이미지로 둔다.
 *   - 지킬 원문이 없는데 "그대로"면 가장 가까운 다듬기로 바꾼다(고를 수 없는 값을 미리 골라 두지 않는다).
 *   - 비어 있는 이유 · 제목은 규칙 값으로 채운다.
 */
export function resolveRecommendation(raw: unknown, input: RecommendInput): RecommendationCore {
  const rules = fallbackRecommendation(input)
  const parsed = parseRecommendation(raw)
  const rec: RecommendationCore = parsed ? { ...parsed, source: 'llm' } : rules
  if (input.file?.kind === 'image') rec.kind = 'img'
  if (!levelAvailable(rec.level, input.idea, input.file)) rec.level = 'polish'
  if (!rec.moodWhy) rec.moodWhy = rec.mood === rules.mood ? rules.moodWhy : translate(input.locale, 'Picked after reading your story material')
  if (!rec.runtimeWhy) rec.runtimeWhy = rec.runtime === rules.runtime ? rules.runtimeWhy : translate(input.locale, 'Picked after reading your story material')
  if (!rec.title) rec.title = rules.title
  return rec
}

// ── 모델에게 보내는 글 ─────────────────────────────────────────────────────────

const LANGUAGE_NAME: Record<AppLocale, string> = { ko: 'Korean', en: 'English' }
const IDEA_PROMPT_MAX = 4_000
const FILE_PROMPT_MAX = 12_000

function head(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max)}\n[... ${text.length - max} more characters]`
}

export function buildRecommendPrompt(input: RecommendInput): { system: string; prompt: string } {
  const lang = LANGUAGE_NAME[input.locale] ?? 'English'
  const fileText = fileTextOf(input.file)
  const file = input.file && fileText
    ? `<file name="${input.file.name.replace(/"/g, "'")}" source="${input.file.kind === 'image' ? 'text read from an image' : 'text file'}" characters="${input.file.chars || Array.from(fileText).length}">\n${head(fileText, FILE_PROMPT_MAX)}\n</file>`
    : '<file>(none)</file>'
  const system = 'You read the story material a user brought to a video production tool and recommend the starting settings. Reply with one JSON object only, no markdown and no commentary.'
  const prompt = [
    `Project language: ${lang}. Write moodWhy, runtimeWhy and title in ${lang}.`,
    '',
    `<idea>\n${head((input.idea ?? '').trim(), IDEA_PROMPT_MAX) || '(none)'}\n</idea>`,
    file,
    '',
    'Choose:',
    '- kind: what the uploaded file is. "1-1" = a script already written for video (scene headings, shot or camera directions). "1-2" = a general script (stage play, radio play or classic script with dialogue cues). "1-3" = idea notes or prose. Without a file, judge the idea text.',
    `- mood: exactly one of ${MOODS.map((m) => m.key).join(', ')}.`,
    `- runtime: exactly one of ${RUNTIMES.map((r) => `${r.key} (${r.label.toLowerCase()})`).join(', ')}. If the material states a length, follow it. For a script, estimate from its length (about one minute per page).`,
    `- level: how much AI should change the material, exactly one of ${LEVELS.map((l) => l.key).join(', ')}. keep = use the text as it is (only when there is a script or a full original text worth keeping), polish = keep the material and fix the wording, grow = start from the material and add new ideas.`,
    `- moodWhy and runtimeWhy: one short, friendly sentence each in ${lang} that tells the user why you chose it, without dashes.`,
    `- title: a short working title of 2 to 6 words in ${lang}.`,
    '',
    'Return: {"kind": "...", "mood": "...", "moodWhy": "...", "runtime": "...", "runtimeWhy": "...", "level": "...", "title": "..."}',
  ].join('\n')
  return { system, prompt }
}

// ── 이미지 글자 읽기(OCR) ──────────────────────────────────────────────────────

export const OCR_NO_TEXT = 'NO_TEXT'
export const OCR_PROMPT = [
  'These images are consecutive parts of one picture, from top to bottom.',
  'Transcribe all the text you can read in them exactly as written, in reading order, keeping line breaks.',
  'Do not translate, summarize, describe the pictures or add any comment.',
  `If there is no readable text, reply with exactly ${OCR_NO_TEXT}.`,
].join(' ')

/** 글자 읽기 답 → 글. 글이 없다는 답 · 빈 답은 ''(글 없음). */
export function cleanOcrText(text: string): string {
  const t = (text ?? '')
    .replace(/^\s*```[a-z]*\s*\n?/i, '')
    .replace(/\n?\s*```\s*$/, '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  if (!t || new RegExp(`^${OCR_NO_TEXT}\\.?$`, 'i').test(t)) return ''
  return t
}
