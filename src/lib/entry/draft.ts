// Producer 시작 화면 초안(projects.entry_draft, 리뉴얼 1차 2026-10-19) — 모양 · 읽기 · 합치기의 단일 출처.
//   화면에서 고르기(1안)와 채팅으로 만들기(2안) 두 탭이 이 초안 하나를 같이 쓴다: 아이디어 글 · 올린 파일(읽은 글) ·
//   AI 추천과 이유 · 고른 값 · 채팅 진행 · 시작 시각. 탭(어느 쪽을 보고 있나)은 브라우저에만 둔다.
//   서버 라우트와 클라이언트 저장소가 같이 쓴다 — 서버 전용 모듈을 import 하지 않는다.
import {
  CHAT_QUESTION_KEYS,
  IDEA_MAX_CHARS,
  PICK_KEYS,
  fileHasText,
  isLevelKey,
  isMaterialKind,
  isMoodKey,
  isRatioKey,
  isRuntimeKey,
  type ChatQuestionKey,
  type LevelKey,
  type MaterialKind,
  type MoodKey,
  type PickKey,
  type RatioKey,
  type RuntimeKey,
} from '@/features/entry/options'

export const ENTRY_DRAFT_VERSION = 1
/** 초안에 두는 파일 글 상한(바이트) — 예전 첨부(TEXT_MAX_BYTES)와 같다. */
export const ENTRY_TEXT_MAX_BYTES = 100 * 1024

export interface EntryFileMeta {
  name: string
  /** 소문자 확장자(점 없음). */
  ext: string
  kind: 'text' | 'image'
  size: number
  /** 읽은 글의 글자 수(이미지는 글자 읽기 전 0). */
  chars: number
  /** 꺼낸 글 · 이미지에서 읽은 글(100KB 상한). */
  text?: string
  truncated?: boolean
  /** 글을 찾지 못했다 — 화면은 "다른 파일 올리기 / 파일 빼고 진행"을 고르게 한다. */
  noText?: boolean
  /** 이미지 원본(media 버킷 경로). */
  storagePath?: string
  /** 글자 읽기용 조각(media 버킷 경로, 위에서 아래로). */
  slicePaths?: string[]
  /** 올린 시각 — 같은 이름 · 크기로 다시 올려도 다른 재료로 본다. */
  uploadedAt: string
}

export interface EntryRec {
  kind: MaterialKind
  mood: MoodKey
  moodWhy: string
  runtime: RuntimeKey
  runtimeWhy: string
  level: LevelKey
  title: string
  /** 이 추천을 만든 재료(아이디어 글 + 파일)의 지문. 재료가 바뀌면 추천은 지난 것이 된다. */
  basis: string
  source: 'llm' | 'rules'
}

export interface EntryPicks {
  mood: MoodKey | null
  runtime: RuntimeKey | null
  level: LevelKey | null
  ratio: RatioKey | null
}

export interface EntryChatProgress {
  /** 채팅에서 정한 질문(1안에서 직접 고른 값도 정한 것으로 친다). */
  answered: Partial<Record<ChatQuestionKey, boolean>>
  /** 처음 보낸 글에서 읽어 정한 질문 — "말씀에서 … 읽었어요" 안내에 쓴다. */
  pre: Partial<Record<ChatQuestionKey, boolean>>
}

export interface EntryDraft {
  version: number
  idea: string
  file: EntryFileMeta | null
  rec: EntryRec | null
  picks: EntryPicks
  chat: EntryChatProgress
  /** 시작한 시각 — 있으면 화면 비율이 잠겼고 Producer 는 완료 화면이다. */
  startedAt: string | null
}

export function emptyPicks(): EntryPicks {
  return { mood: null, runtime: null, level: null, ratio: null }
}

export function emptyEntryDraft(): EntryDraft {
  return { version: ENTRY_DRAFT_VERSION, idea: '', file: null, rec: null, picks: emptyPicks(), chat: { answered: {}, pre: {} }, startedAt: null }
}

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const str = (v: unknown, max = 4000): string | undefined => (typeof v === 'string' ? v.slice(0, max) : undefined)

function normalizeFile(raw: unknown): EntryFileMeta | null {
  if (!isObject(raw)) return null
  const name = str(raw.name, 300)
  const kind = raw.kind === 'text' || raw.kind === 'image' ? raw.kind : null
  if (!name || !kind) return null
  const file: EntryFileMeta = {
    name,
    ext: str(raw.ext, 16) ?? '',
    kind,
    size: typeof raw.size === 'number' && Number.isFinite(raw.size) ? raw.size : 0,
    chars: typeof raw.chars === 'number' && Number.isFinite(raw.chars) ? raw.chars : 0,
    uploadedAt: str(raw.uploadedAt, 40) ?? '',
  }
  const text = str(raw.text, ENTRY_TEXT_MAX_BYTES)
  if (text !== undefined) file.text = text
  if (raw.truncated === true) file.truncated = true
  if (raw.noText === true) file.noText = true
  const storagePath = str(raw.storagePath, 500)
  if (storagePath) file.storagePath = storagePath
  if (Array.isArray(raw.slicePaths)) {
    const slices = raw.slicePaths.filter((p): p is string => typeof p === 'string' && p.length > 0 && p.length <= 500).slice(0, 40)
    if (slices.length) file.slicePaths = slices
  }
  return file
}

function normalizeRec(raw: unknown): EntryRec | null {
  if (!isObject(raw)) return null
  if (!isMaterialKind(raw.kind) || !isMoodKey(raw.mood) || !isRuntimeKey(raw.runtime) || !isLevelKey(raw.level)) return null
  return {
    kind: raw.kind,
    mood: raw.mood,
    moodWhy: str(raw.moodWhy, 300) ?? '',
    runtime: raw.runtime,
    runtimeWhy: str(raw.runtimeWhy, 300) ?? '',
    level: raw.level,
    title: str(raw.title, 120) ?? '',
    basis: str(raw.basis, 64) ?? '',
    source: raw.source === 'llm' ? 'llm' : 'rules',
  }
}

const PICK_GUARDS: Record<PickKey, (v: unknown) => boolean> = {
  mood: isMoodKey,
  runtime: isRuntimeKey,
  level: isLevelKey,
  ratio: isRatioKey,
}

function normalizePicks(raw: unknown): EntryPicks {
  const picks = emptyPicks()
  if (!isObject(raw)) return picks
  for (const key of PICK_KEYS) {
    if (PICK_GUARDS[key](raw[key])) (picks as Record<PickKey, unknown>)[key] = raw[key]
  }
  return picks
}

function normalizeFlags(raw: unknown): Partial<Record<ChatQuestionKey, boolean>> {
  const out: Partial<Record<ChatQuestionKey, boolean>> = {}
  if (!isObject(raw)) return out
  for (const key of CHAT_QUESTION_KEYS) if (raw[key] === true) out[key] = true
  return out
}

/** jsonb 값을 초안으로 — 모르는 칸은 버리고 틀린 값은 빈 값으로 둔다(null · 옛 값도 안전하게 읽는다). */
export function normalizeEntryDraft(raw: unknown): EntryDraft {
  if (!isObject(raw)) return emptyEntryDraft()
  const chat = isObject(raw.chat) ? raw.chat : {}
  return {
    version: ENTRY_DRAFT_VERSION,
    idea: str(raw.idea, IDEA_MAX_CHARS) ?? '',
    file: normalizeFile(raw.file),
    rec: normalizeRec(raw.rec),
    picks: normalizePicks(raw.picks),
    chat: { answered: normalizeFlags(chat.answered), pre: normalizeFlags(chat.pre) },
    startedAt: str(raw.startedAt, 40) || null,
  }
}

/** 라우트가 읽는 초안 — 리뉴얼 전 Producer 에 이야기만 적어 두고 시작하지 않은 프로젝트(단계 producer · 시작 화면 초안 없음)는
 *  그 이야기를 아이디어 칸에 채워 연다. [시작]은 아이디어로 이야기를 다시 저장하므로, 채우지 않으면 적어 둔 이야기를 덮어쓴다.
 *  새 프로젝트(단계 entry)는 채우지 않는다 — 아이디어는 사람이 쓴다. 약속: tests/producer/entry-legacy-story.test.ts */
export function entryDraftFor(row: { entryDraft: unknown; storyText?: string | null; stage?: string | null }): EntryDraft {
  const draft = normalizeEntryDraft(row.entryDraft)
  const story = typeof row.storyText === 'string' ? row.storyText.trim() : ''
  if (row.entryDraft == null && row.stage === 'producer' && story) return { ...draft, idea: story.slice(0, IDEA_MAX_CHARS) }
  return draft
}

/** 화면이 보내는 고침 — 고칠 수 있는 칸만. 파일은 빼기(null)만 여기서 하고 올리기는 파일 라우트가 한다. */
export interface EntryDraftPatch {
  idea?: string
  picks?: Partial<Record<PickKey, string | null>>
  chat?: { answered?: Record<string, unknown>; pre?: Record<string, unknown> }
  file?: null
}

/** 고침을 초안에 합친다 — 정해진 값 밖은 버린다. 시작한 초안인지는 부르는 쪽이 먼저 본다. */
export function applyEntryPatch(draft: EntryDraft, patch: unknown): EntryDraft {
  if (!isObject(patch)) return draft
  const next: EntryDraft = { ...draft, picks: { ...draft.picks }, chat: { answered: { ...draft.chat.answered }, pre: { ...draft.chat.pre } } }
  if (typeof patch.idea === 'string') next.idea = patch.idea.slice(0, IDEA_MAX_CHARS)
  if (isObject(patch.picks)) {
    for (const key of PICK_KEYS) {
      if (!(key in patch.picks)) continue
      const v = patch.picks[key]
      if (v === null) (next.picks as Record<PickKey, unknown>)[key] = null
      else if (PICK_GUARDS[key](v)) (next.picks as Record<PickKey, unknown>)[key] = v
    }
  }
  if (isObject(patch.chat)) {
    if (isObject(patch.chat.answered)) next.chat.answered = normalizeFlags(patch.chat.answered)
    if (isObject(patch.chat.pre)) next.chat.pre = normalizeFlags(patch.chat.pre)
  }
  if (patch.file === null) next.file = null
  return next
}

/** 재료 지문 — 아이디어 글(앞뒤 공백 제외)과 파일(이름 · 크기 · 올린 시각). 글자 읽기 결과는 넣지 않는다. */
export function materialBasis(draft: Pick<EntryDraft, 'idea' | 'file'>): string {
  const file = draft.file ? `${draft.file.name}\u0000${draft.file.size}\u0000${draft.file.uploadedAt}` : ''
  return fnv1a(`${(draft.idea ?? '').trim()}\u0001${file}`)
}

/** 추천이 지금 재료로 만든 것인가 — 아니면 다음을 누를 때 다시 묻는다. */
export function recIsCurrent(draft: EntryDraft): boolean {
  return !!draft.rec && !!draft.rec.basis && draft.rec.basis === materialBasis(draft)
}

export function picksComplete(picks: EntryPicks): boolean {
  return PICK_KEYS.every((k) => picks[k] !== null)
}

export { fileHasText }

function fnv1a(input: string): string {
  // 32비트 FNV-1a 두 번(앞 · 뒤 시드) — 지문 비교용이지 암호가 아니다.
  let h1 = 0x811c9dc5
  let h2 = 0x01000193 ^ input.length
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i)
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0
    h2 = Math.imul(h2 ^ c, 0x5bd1e995) >>> 0
  }
  return `${h1.toString(16).padStart(8, '0')}${h2.toString(16).padStart(8, '0')}`
}
