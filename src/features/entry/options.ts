// Producer 시작 화면(리뉴얼 1차 2026-10-19, 프로토타입 20261013 E1~E5 · EB1~EB7)의 선택지와 순수 규칙.
//   화면에서 고르기(1안) · 채팅으로 만들기(2안) 두 탭과 서버 라우트가 같은 값 · 같은 규칙을 쓴다.
//   라벨은 영어 원문 = i18n 키이고 한국어는 messages-ko 사전에 있다(렌더 지점이 t() 로 번역한다).
//   약속: tests/producer/entry-options.test.ts
import { translate } from '@/lib/i18n/translate'
import type { AppLocale } from '@/lib/locale'
import type { ProjectFormat } from '@/types/project'

/** 글만 있을 때 다음으로 가는 최소 글자 수(프로토타입 MIN_LEN). */
export const MIN_IDEA_CHARS = 20
/** "그대로"가 지킬 원문으로 치는 글 길이(프로토타입 hasText: 60자 이상). */
export const KEEP_MIN_IDEA_CHARS = 60
/** 파일 하나 상한. */
export const ENTRY_FILE_MAX_BYTES = 10 * 1024 * 1024
/** 아이디어 글 상한(초안 칸이 한없이 커지지 않게). */
export const IDEA_MAX_CHARS = 20_000

// ── 장르·분위기 ──────────────────────────────────────────────────────────────
export type MoodKey =
  | 'comedy'
  | 'drama'
  | 'romance'
  | 'thriller'
  | 'horror'
  | 'action'
  | 'scifi_fantasy'
  | 'mystery'
  | 'human_family'
  | 'slice_of_life'

export interface MoodOption {
  key: MoodKey
  label: string
}

export const MOODS: readonly MoodOption[] = [
  { key: 'comedy', label: 'Comedy' },
  { key: 'drama', label: 'Drama' },
  { key: 'romance', label: 'Romance' },
  { key: 'thriller', label: 'Thriller' },
  { key: 'horror', label: 'Horror' },
  { key: 'action', label: 'Action' },
  { key: 'scifi_fantasy', label: 'Sci-fi and fantasy' },
  { key: 'mystery', label: 'Mystery' },
  { key: 'human_family', label: 'Human and family' },
  { key: 'slice_of_life', label: 'Slice of life' },
]

// ── 길이 ──────────────────────────────────────────────────────────────────────
export type RuntimeKey = 'r15' | 'r60' | 'r300' | 'r1200'

export interface RuntimeOption {
  key: RuntimeKey
  label: string
  sub: string
  seconds: number
}

export const RUNTIMES: readonly RuntimeOption[] = [
  { key: 'r15', label: '15 seconds or less', sub: 'Short form', seconds: 15 },
  { key: 'r60', label: '15 to 60 seconds', sub: 'Ad · Teaser', seconds: 60 },
  { key: 'r300', label: '1 to 5 minutes', sub: 'Music video · Web drama', seconds: 300 },
  { key: 'r1200', label: '5 to 20 minutes', sub: 'Short piece', seconds: 1200 },
]

// ── 바꿈 정도 ─────────────────────────────────────────────────────────────────
export type LevelKey = 'keep' | 'polish' | 'grow'

export interface LevelOption {
  key: LevelKey
  label: string
  sub: string
  keeps: string
  changes: string
}

export const LEVELS: readonly LevelOption[] = [
  { key: 'keep', label: 'Keep as is', sub: 'Uses your text as it is', keeps: 'Sentences · dialogue · plot · ending', changes: 'Only scene splits and missing direction' },
  { key: 'polish', label: 'Polish', sub: 'Keeps the material and fixes the wording', keeps: 'Subject · characters · plot · ending', changes: 'Sentences · dialogue · scene order' },
  { key: 'grow', label: 'Grow it new', sub: 'Starts from the material and adds ideas', keeps: 'Subject · genre and mood · length', changes: 'New ideas for plot · characters · ending' },
]

// 대본 파일이면 유저 플로우 정리본(1-1 · 1-2)의 말로 묻는다: 바로 영상화 / 조금 다듬어서 / 완전 새롭게. 자리(값)는 LEVELS 와 같다.
const SCRIPT_POLISH: LevelOption = { key: 'polish', label: 'With a little polish', sub: 'Rewrites only the changed parts', keeps: 'Scenes and dialogue you did not change', changes: 'Only the parts you changed' }
const SCRIPT_GROW: LevelOption = { key: 'grow', label: 'Completely new', sub: 'Makes a new video based on the script', keeps: 'Subject · character settings', changes: 'Plot · scenes · dialogue' }

export const SCRIPT_LEVELS: Record<'1-1' | '1-2', readonly LevelOption[]> = {
  '1-1': [
    { key: 'keep', label: 'Make it into video right away', sub: 'Splits the script into shots as it is', keeps: 'The whole script', changes: 'Only the shot splits' },
    SCRIPT_POLISH,
    SCRIPT_GROW,
  ],
  '1-2': [
    { key: 'keep', label: 'Make it into video right away', sub: 'Keeps the original and fills only what the video lacks', keeps: 'The whole script', changes: 'Only missing direction · characters · backgrounds' },
    SCRIPT_POLISH,
    SCRIPT_GROW,
  ],
}

// ── 화면 비율 ─────────────────────────────────────────────────────────────────
export type RatioKey = '16:9' | '9:16' | '1:1' | '2.39:1'

export interface RatioOption {
  key: RatioKey
  sub: string
  format: ProjectFormat
}

export const RATIOS: readonly RatioOption[] = [
  { key: '16:9', sub: 'Landscape', format: 'horizontal_16:9' },
  { key: '9:16', sub: 'Portrait · Short form', format: 'vertical_9:16' },
  { key: '1:1', sub: 'Square', format: 'square_1:1' },
  { key: '2.39:1', sub: 'Cinema', format: 'cinema_2.39:1' },
]

/** 프로토타입은 화면 비율 추천을 늘 9:16(세로 · 숏폼)으로 표시한다. */
export const RECOMMENDED_RATIO: RatioKey = '9:16'

// ── 자료 종류 ─────────────────────────────────────────────────────────────────
// 지금 읽는 자료: 글 파일과 글이 담긴 이미지. 웹툰 · 캐릭터 시트 · 참조 사진은 다음 버전.
export type MaterialKind = '1-1' | '1-2' | '1-3' | 'img'

export const MATERIAL_KINDS: Record<MaterialKind, { label: string }> = {
  '1-1': { label: 'Script written for video' },
  '1-2': { label: 'General script (stage or classic script)' },
  '1-3': { label: 'Idea notes' },
  img: { label: 'Image with text (photographed script or memo)' },
}

export function isMaterialKind(v: unknown): v is MaterialKind {
  return v === '1-1' || v === '1-2' || v === '1-3' || v === 'img'
}
export function isMoodKey(v: unknown): v is MoodKey {
  return MOODS.some((m) => m.key === v)
}
export function isRuntimeKey(v: unknown): v is RuntimeKey {
  return RUNTIMES.some((r) => r.key === v)
}
export function isLevelKey(v: unknown): v is LevelKey {
  return v === 'keep' || v === 'polish' || v === 'grow'
}
export function isRatioKey(v: unknown): v is RatioKey {
  return RATIOS.some((r) => r.key === v)
}

export function moodOf(key: MoodKey): MoodOption {
  return MOODS.find((m) => m.key === key) ?? MOODS[1]
}
export function runtimeOf(key: RuntimeKey): RuntimeOption {
  return RUNTIMES.find((r) => r.key === key) ?? RUNTIMES[1]
}
export function ratioOf(key: RatioKey): RatioOption {
  return RATIOS.find((r) => r.key === key) ?? RATIOS[0]
}

// ── 파일 ──────────────────────────────────────────────────────────────────────
export const TEXT_FILE_EXTENSIONS = ['txt', 'md', 'markdown', 'docx', 'pdf', 'hwp', 'hwpx'] as const
export const IMAGE_FILE_EXTENSIONS = ['png', 'jpg', 'jpeg'] as const
export const ENTRY_FILE_ACCEPT = [...TEXT_FILE_EXTENSIONS, ...IMAGE_FILE_EXTENSIONS].map((x) => `.${x}`).join(',')
/** 화면에 보이는 확장자 목록 — 번역하지 않는 표기라 사전 밖 상수로 둔다. */
export const TEXT_EXT_LABEL = 'txt · md · docx · pdf · hwp'
export const IMAGE_EXT_LABEL = 'png · jpg'

export function fileExtension(name: string): string {
  const dot = name.lastIndexOf('.')
  if (dot < 0 || dot === name.length - 1) return ''
  return name.slice(dot + 1).toLowerCase()
}

export function entryFileKind(name: string): 'text' | 'image' | null {
  const ext = fileExtension(name)
  if ((TEXT_FILE_EXTENSIONS as readonly string[]).includes(ext)) return 'text'
  if ((IMAGE_FILE_EXTENSIONS as readonly string[]).includes(ext)) return 'image'
  return null
}

/** 시작 화면의 파일 고르기 — 그림 파일은 사용 동의를 받은 뒤에만 올린다(채팅 · Director · Editor 의 그림 올리기와 같은 약속).
 *  약속: tests/producer/entry-image-consent.test.ts */
export async function pickEntryFile(
  file: File,
  deps: { requestConsent: (files: File[]) => Promise<boolean>; upload: (file: File) => Promise<unknown> },
): Promise<'uploaded' | 'declined'> {
  if (entryFileKind(file.name) === 'image' && !(await deps.requestConsent([file]))) return 'declined'
  await deps.upload(file)
  return 'uploaded'
}

export type FileProblem = { code: 'bad_ext' } | { code: 'too_large' } | { code: 'empty' }

/** 고르는 순간의 검사(서버도 같은 검사를 한다). 통과면 null. */
export function checkEntryFile(name: string, size: number): FileProblem | null {
  if (!entryFileKind(name)) return { code: 'bad_ext' }
  if (size > ENTRY_FILE_MAX_BYTES) return { code: 'too_large' }
  if (size <= 0) return { code: 'empty' }
  return null
}

const FILE_PROBLEM_KEY: Record<FileProblem['code'], string> = {
  bad_ext: "This file can't be uploaded. You can upload txt · md · docx · pdf · hwp, or png · jpg that contain text.",
  too_large: '"{name}" is larger than 10MB. Please upload one of 10MB or less.',
  empty: '"{name}" is empty.',
}

export function fileProblemMessage(problem: FileProblem, name: string, locale: AppLocale): string {
  return translate(locale, FILE_PROBLEM_KEY[problem.code], { name })
}

// ── 이야기 재료 ───────────────────────────────────────────────────────────────
/** 재료 판단에 필요한 파일 정보만(초안의 파일 · 서버 응답 어느 쪽이든). */
export interface MaterialFileLike {
  kind: 'text' | 'image'
  chars?: number
  text?: string
  noText?: boolean
}

/** 글자 수 — 앞뒤 공백은 세지 않고, 한글 · 이모지도 한 글자로 센다. */
export function ideaLength(idea: string): number {
  return Array.from((idea ?? '').trim()).length
}

/** 파일에 읽은 글이 있나(글 파일의 글 · 이미지에서 읽은 글). */
export function fileHasText(file: MaterialFileLike | null | undefined): boolean {
  return !!file && !file.noText && typeof file.text === 'string' && file.text.trim().length > 0
}

/** 다음으로 가도 되나. 파일이 있으면 글은 비워도 된다. 통과면 null. */
export function materialProblem(idea: string, file: MaterialFileLike | null | undefined): { code: 'too_short'; length: number } | null {
  if (file) return null
  const length = ideaLength(idea)
  return length >= MIN_IDEA_CHARS ? null : { code: 'too_short', length }
}

export const TOO_SHORT_KEY = 'Write a little more. With {min} or more characters, AI can shape the story. (Now {n} characters)'

export function tooShortMessage(locale: AppLocale, length: number): string {
  return translate(locale, TOO_SHORT_KEY, { min: MIN_IDEA_CHARS, n: length })
}

/** "그대로"가 지킬 원문: 글이 담긴 파일 또는 60자 넘는 글. */
export function hasOriginalText(idea: string, file: MaterialFileLike | null | undefined): boolean {
  return fileHasText(file) || ideaLength(idea) >= KEEP_MIN_IDEA_CHARS
}

export function levelAvailable(level: LevelKey, idea: string, file: MaterialFileLike | null | undefined): boolean {
  return level !== 'keep' || hasOriginalText(idea, file)
}

/** 대본 파일로 읽은 자료인가(글이 담긴 파일 + 종류 1-1 · 1-2). */
export function isScriptMaterial(kind: MaterialKind | null | undefined, fileWithText: boolean): kind is '1-1' | '1-2' {
  return fileWithText && (kind === '1-1' || kind === '1-2')
}

export function levelOptionsFor(kind: MaterialKind | null | undefined, fileWithText: boolean): readonly LevelOption[] {
  return isScriptMaterial(kind, fileWithText) ? SCRIPT_LEVELS[kind] : LEVELS
}

export function levelQuestion(isScript: boolean): string {
  return isScript ? 'How shall we use the script?' : 'How much may AI change your text?'
}

/** "그대로"를 고를 수 없을 때의 이유 — 화면(1안)은 여는 방법을, 채팅(2안)은 다른 단계를 권한다. */
export function keepUnavailableNote(where: 'form' | 'chat'): string {
  return where === 'form'
    ? '"Keep as is" needs original text to keep. It opens when you upload a script file or write more than 60 characters of plot.'
    : '"Keep as is" needs original text to keep. Please choose polish or grow it new for now.'
}

export function runtimeSeconds(key: RuntimeKey): number {
  return runtimeOf(key).seconds
}

export function runtimeKeyFromSeconds(seconds: number): RuntimeKey {
  if (seconds <= 15) return 'r15'
  if (seconds <= 60) return 'r60'
  if (seconds <= 300) return 'r300'
  return 'r1200'
}

export function formatFromRatio(ratio: RatioKey): ProjectFormat {
  return ratioOf(ratio).format
}

export function ratioFromFormat(format: unknown): RatioKey | null {
  return RATIOS.find((r) => r.format === format)?.key ?? null
}

// ── 채팅으로 만들기: 질문 순서 ─────────────────────────────────────────────────
export type PickKey = 'mood' | 'runtime' | 'level' | 'ratio'
export type ChatQuestionKey = 'file' | PickKey
export const PICK_KEYS: readonly PickKey[] = ['mood', 'runtime', 'level', 'ratio']
export const CHAT_QUESTION_KEYS: readonly ChatQuestionKey[] = ['file', 'mood', 'runtime', 'level', 'ratio']

/** 파일을 올린 사람은 "어떻게 쓸까요"(= 바꿈 정도)를 먼저, 글만 쓴 사람은 장르 → 길이 → 바꿈 정도. 화면 비율은 마지막. */
export function chatQuestionOrder(hasFile: boolean): ChatQuestionKey[] {
  return hasFile ? ['file', 'mood', 'runtime', 'ratio'] : ['mood', 'runtime', 'level', 'ratio']
}

export function nextChatQuestion(order: readonly ChatQuestionKey[], answered: Partial<Record<ChatQuestionKey, boolean>>): ChatQuestionKey | 'confirm' {
  return order.find((k) => !answered[k]) ?? 'confirm'
}

/** 질문 이름(요약 칩 · 읽었어요 안내). */
export const QUESTION_NAME: Record<PickKey, string> = {
  mood: 'Genre and mood',
  runtime: 'Length',
  level: 'Change level',
  ratio: 'Screen ratio',
}

export const CHAT_QUESTION: Record<'mood' | 'runtime' | 'level' | 'ratio', string> = {
  mood: 'What genre and mood shall we go with?',
  runtime: 'About how long shall it be?',
  level: 'How much may AI change your writing?',
  ratio: 'Choose the screen ratio.',
}

// ── 말로 답하기 (프로토타입 parseInto 포팅 + 영어 낱말) ──────────────────────────
export interface ParsedAnswer {
  mood?: MoodKey
  runtime?: RuntimeKey
  level?: LevelKey
  ratio?: RatioKey
}

// 장르 낱말 — 목록 순서대로 보고 마지막에 맞은 것이 이긴다(프로토타입과 같다: "가족 드라마"는 휴먼·가족).
//   names = 장르 이름(프로토타입은 이름의 앞 낱말: 코미디 … SF · 휴먼 · 일상). 처음 아이디어 글과 규칙 추천은 이름만 본다.
//   extra = 대답에서만 더 알아듣는 말(코믹 · 공포 · 가족 …). "SF" 는 대문자 낱말로만 본다(transfer 같은 영어 낱말 속 sf 제외).
const MOOD_WORDS: Array<{ mood: MoodKey; names: RegExp[]; extra?: RegExp[] }> = [
  { mood: 'comedy', names: [/코미디/, /\bcomedy\b/i], extra: [/코믹/, /comedic|funny/i] }, // i18n-ok: 장르 낱말 알아듣기
  { mood: 'drama', names: [/드라마/, /\bdrama\b/i] }, // i18n-ok: 장르 낱말 알아듣기
  { mood: 'romance', names: [/로맨스/, /\bromance\b/i], extra: [/멜로(?!디)/, /romantic/i] }, // i18n-ok: 장르 낱말 알아듣기
  { mood: 'thriller', names: [/스릴러/, /\bthriller\b/i] }, // i18n-ok: 장르 낱말 알아듣기
  { mood: 'horror', names: [/호러/, /\bhorror\b/i], extra: [/공포/, /\bscary\b/i] }, // i18n-ok: 장르 낱말 알아듣기
  { mood: 'action', names: [/액션/, /\baction\b/i] }, // i18n-ok: 장르 낱말 알아듣기
  { mood: 'scifi_fantasy', names: [/\bSF\b/, /판타지/, /\bsci-?fi\b|science fiction|\bfantasy\b/i] }, // i18n-ok: 장르 낱말 알아듣기
  { mood: 'mystery', names: [/미스터리/, /\bmystery\b/i], extra: [/추리/] }, // i18n-ok: 장르 낱말 알아듣기
  { mood: 'human_family', names: [/휴먼/], extra: [/가족/, /\bfamily\b/i] }, // i18n-ok: 장르 낱말 알아듣기
  { mood: 'slice_of_life', names: [/일상/, /slice of life/i], extra: [/잔잔/] }, // i18n-ok: 장르 낱말 알아듣기
]

/** 글에 적힌 장르 낱말 — 맞은 장르와 실제로 적힌 말. loose 면 대답용 낱말까지 본다. */
export function moodWordIn(text: string, opts: { loose?: boolean } = {}): { mood: MoodKey; word: string } | null {
  let found: { mood: MoodKey; word: string } | null = null
  for (const entry of MOOD_WORDS) {
    const patterns = opts.loose ? [...entry.names, ...(entry.extra ?? [])] : entry.names
    for (const re of patterns) {
      const m = text.match(re)
      if (m) {
        found = { mood: entry.mood, word: m[0] }
        break
      }
    }
  }
  return found
}

// "30초" · "2분" · "30 seconds" · "2 minutes" — 처음 나온 길이.
const SPAN_KO = /(\d+)\s*(초|분)/ // i18n-ok: 길이 낱말 알아듣기
const SPAN_EN = /(\d+)\s*-?\s*(seconds?|secs?|minutes?|mins?)\b/i

/** 글에 적힌 길이(초)와 그 말. */
export function runtimeSpanIn(text: string): { seconds: number; span: string } | null {
  const ko = text.match(SPAN_KO)
  const en = text.match(SPAN_EN)
  const m = ko && en ? ((ko.index ?? 0) <= (en.index ?? 0) ? ko : en) : ko ?? en
  if (!m) return null
  const n = Number(m[1])
  const unit = m[2].toLowerCase()
  const minutes = unit === '분' || unit.startsWith('min') // i18n-ok: 분 단위 알아듣기
  return { seconds: n * (minutes ? 60 : 1), span: m[0] }
}

const SHORT_FORM_WORDS = /숏폼|쇼츠|shorts|short form|short-form/i // i18n-ok: 길이 낱말 알아듣기
const SHORT_FILM_WORDS = /단편|short film/i // i18n-ok: 길이 낱말 알아듣기

// 바꿈 정도 — 대답(카드 질문 뒤)은 낱말만으로, 처음 아이디어 글은 지시하는 말일 때만 읽는다("그대로 얼어붙었다"는 이야기다).
const KEEP_LOOSE = /그대로|바로 영상화|as it is|\bas is\b/i // i18n-ok: 바꿈 정도 낱말 알아듣기
const POLISH_LOOSE = /다듬|polish/i // i18n-ok: 바꿈 정도 낱말 알아듣기
const GROW_LOOSE = /새롭게|키워|새로|grow|brand new/i // i18n-ok: 바꿈 정도 낱말 알아듣기
const KEEP_STRICT = /바로 영상화|(?:원문|대본|글)\s*그대로|그대로\s*(?:써|쓰|만들|영상화|살려|옮겨)|keep it as it is/i // i18n-ok: 바꿈 정도 지시 알아듣기
const POLISH_STRICT = /다듬어\s*(?:서|줘|주)|조금 다듬|polish it/i // i18n-ok: 바꿈 정도 지시 알아듣기
const GROW_STRICT = /새롭게 키워|완전 새롭게|새롭게 바꿔|grow it new/i // i18n-ok: 바꿈 정도 지시 알아듣기

// 화면 비율 — 숫자 비율이 먼저. 대답은 낱말만으로, 처음 글은 비율을 말하는 꼴일 때만("가로등"은 이야기다).
const RATIO_NUMBER = /16:9|9:16|1:1|2\.39:1/
const RATIO_LOOSE: Array<[RatioKey, RegExp]> = [
  ['9:16', /세로|portrait|vertical/i], // i18n-ok: 비율 낱말 알아듣기
  ['16:9', /가로|landscape|horizontal/i], // i18n-ok: 비율 낱말 알아듣기
  ['1:1', /정방형|정사각|square/i], // i18n-ok: 비율 낱말 알아듣기
  ['2.39:1', /시네마|와이드|cinema|widescreen/i], // i18n-ok: 비율 낱말 알아듣기
]
const RATIO_STRICT: Array<[RatioKey, RegExp]> = [
  ['9:16', /세로\s*(?:영상|화면|비율|형|로)|portrait video|vertical video/i], // i18n-ok: 비율 지시 알아듣기
  ['16:9', /가로\s*(?:영상|화면|비율|형|로)|landscape video|horizontal video/i], // i18n-ok: 비율 지시 알아듣기
  ['1:1', /정방형|정사각형|square video/i], // i18n-ok: 비율 지시 알아듣기
  ['2.39:1', /시네마\s*(?:비율|스코프)|시네마스코프|widescreen|cinemascope/i], // i18n-ok: 비율 지시 알아듣기
]

/**
 * 말에서 장르·분위기 · 길이 · 바꿈 정도 · 화면 비율을 읽는다(정해진 규칙만 — 모델 없음).
 *   strict = 처음 아이디어 글: 이야기 속 낱말(가로등 · 새로운 · 그대로 멈췄다)을 설정으로 읽지 않는다.
 *   keepAllowed = 지킬 원문이 있을 때만 "그대로"를 읽는다.
 */
export function parseChatAnswer(text: string, opts: { keepAllowed: boolean; strict?: boolean }): ParsedAnswer {
  const t = (text ?? '').trim()
  const out: ParsedAnswer = {}
  if (!t) return out
  const mood = moodWordIn(t, { loose: !opts.strict })
  if (mood) out.mood = mood.mood
  const span = runtimeSpanIn(t)
  if (span) out.runtime = runtimeKeyFromSeconds(span.seconds)
  else if (SHORT_FORM_WORDS.test(t)) out.runtime = 'r15'
  else if (SHORT_FILM_WORDS.test(t)) out.runtime = 'r1200'
  const [keep, polish, grow] = opts.strict ? [KEEP_STRICT, POLISH_STRICT, GROW_STRICT] : [KEEP_LOOSE, POLISH_LOOSE, GROW_LOOSE]
  if (keep.test(t) && opts.keepAllowed) out.level = 'keep'
  else if (polish.test(t)) out.level = 'polish'
  else if (grow.test(t)) out.level = 'grow'
  const ratioNumber = t.match(RATIO_NUMBER)
  if (ratioNumber) out.ratio = ratioNumber[0] as RatioKey
  else {
    const hit = (opts.strict ? RATIO_STRICT : RATIO_LOOSE).find(([, re]) => re.test(t))
    if (hit) out.ratio = hit[0]
  }
  return out
}

// ── 예시 ──────────────────────────────────────────────────────────────────────
export interface ExampleIdea {
  title: string
  text: string
}

export const EXAMPLES: readonly ExampleIdea[] = [
  { title: 'Office comedy', text: 'The hallway vending machine breaks and cans pour out, but Minho is the only one who does not get a single can' },
  { title: 'Family drama', text: "A daughter comes home after ten years and finds a half-shot roll of film in her father's old camera" },
  { title: 'Short horror', text: 'An employee working late sees the office CCTV feed on her monitor, and someone is standing behind her in it' },
  { title: 'Romance', text: "Two people who run into each other on the rooftop at the same time every day spend a year without knowing each other's names" },
  { title: 'Sci-fi', text: 'A broken delivery robot gets lost and spends a day following a child who is home alone' },
  { title: 'Mystery', text: "Every Friday, an unsigned letter appears on Minho's desk" },
]
export const EXAMPLES_PER_PAGE = 3

export function examplesPage(page: number): { page: number; items: ExampleIdea[] } {
  const pages = Math.ceil(EXAMPLES.length / EXAMPLES_PER_PAGE)
  const p = ((Math.floor(page) % pages) + pages) % pages
  return { page: p, items: EXAMPLES.slice(p * EXAMPLES_PER_PAGE, p * EXAMPLES_PER_PAGE + EXAMPLES_PER_PAGE) }
}

const EXAMPLE_WORDS = /예시|example/i // i18n-ok: "예시 보여줘" 알아듣기

/** "예시 보여줘"처럼 예시를 바라는 짧은 말(프로토타입: "예시" + 30자 미만). */
export function isExampleRequest(text: string): boolean {
  return EXAMPLE_WORDS.test(text ?? '') && ideaLength(text) < MIN_IDEA_CHARS + 10
}

// ── AI 작업 중 잠금 화면 ──────────────────────────────────────────────────────
export function readingSteps(isImage: boolean): string[] {
  return isImage
    ? ['Opening the file', 'Reading letters from the image', 'Making recommended settings']
    : ['Reading the text', 'Judging the kind of story', 'Making recommended settings']
}

export const WRITING_STEPS = ['Organizing the material', 'Story skeleton', 'Writing the scene stories']

/** /api/writer/status 응답에서 필요한 칸만. */
export interface WriterStatusLike {
  started?: boolean
  draft?: boolean
  pipeline_completed?: boolean
  pipeline_failed?: boolean
  current_stage?: string | null
  current_status?: string | null
}

/**
 * 산문 초안 진행: Writer 단계 → 잠금 화면 세 단계(자료 정리 · 이야기 뼈대 · 씬 스토리 쓰기).
 *   확정을 기다리는 초안(awaiting_confirmation)이나 끝난 실행이면 다 됐다(step 3).
 */
export function writerProgress(status: WriterStatusLike | null | undefined): { phase: 'writing' | 'ready' | 'failed'; step: number } {
  if (status?.pipeline_failed || status?.current_status === 'failed') return { phase: 'failed', step: stepOfStage(status?.current_stage) }
  if (status?.pipeline_completed || status?.current_status === 'awaiting_confirmation' || status?.current_status === 'completed') return { phase: 'ready', step: 3 }
  return { phase: 'writing', step: stepOfStage(status?.current_stage) }
}

function stepOfStage(stage: string | null | undefined): number {
  if (stage === 'narrativeStructure' || stage === 'structureScenesMerged') return 1
  if (stage === 'scenes' || stage === 'storyCheck') return 2
  return 0
}

// ── 탭 기억(브라우저마다) ──────────────────────────────────────────────────────
export type EntryTab = 'form' | 'chat'
const TAB_STORAGE_KEY = 'tale.entry.tab.v1'

interface TabStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

function defaultStorage(): TabStorage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null
  } catch {
    return null
  }
}

/** 저장소를 못 쓰면(사생활 보호 창 · 막힌 사이트 데이터) null — 기본 탭을 쓴다. */
export function readStoredTab(storage: TabStorage | null = defaultStorage()): EntryTab | null {
  try {
    const v = storage?.getItem(TAB_STORAGE_KEY)
    return v === 'form' || v === 'chat' ? v : null
  } catch {
    return null
  }
}

export function writeStoredTab(tab: EntryTab, storage: TabStorage | null = defaultStorage()): void {
  try {
    storage?.setItem(TAB_STORAGE_KEY, tab)
  } catch {
    // 기억은 편의일 뿐이다 — 못 써도 화면은 그대로 동작한다.
  }
}
