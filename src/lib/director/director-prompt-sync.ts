// Director 고친 샷 글(shots.director_prompt)을 다시 읽을 때 이 브라우저의 고친 글과 맞추는 규칙 — 순수 함수(검토 rev-billing · 리드 2026-11-26).
//   옛 규칙("DB 값으로 늘 덮는다")은 ① 운영 마이그레이션 전(칸 없음) ② 이 기능 전에 브라우저에만 남은 고친 글 ③ 저장이 한 번 실패한 고친 글을
//   말없이 지웠다. 이제:
//   - 행에 칸이 없거나 저장 대기 중(0.5초 안)이면 건드리지 않는다.
//   - 못 올린 고친 글(저장 실패 · 처음 맞춤 대기)은, 그 글을 쓸 때 본 Writer 지문이 지금 Writer 지문과 같으면 다시 올리고 다르면 버린다(Writer 가 다시 씀 — 방아쇠와 같은 규칙).
//   - 이 브라우저가 이 프로젝트를 처음 맞출 때 DB 는 비었는데 브라우저에 고친 글이 있으면 같은 판정으로 올리거나 버린다.
//   - 그 밖에는 DB 가 진실이다(이미 맞춘 프로젝트에서 DB 가 비었으면 누군가 비운 것).
//   약속: tests/director/director-prompt-persist.test.ts
export interface DirectorPromptRow {
  director_prompt?: unknown
  prompt?: unknown
  action_description?: unknown
  action_description_native?: unknown
}

/** 못 올린 고친 글 — base = 그 글을 쓸 때 이 브라우저가 본 Writer 지문(writerFingerprint). null = 모름(지문을 받기 전). */
export interface UnsavedDirectorPrompt {
  base: string | null
}

export interface LocalDirectorPrompt {
  promptOverride?: string | null
  derivedPrompt?: string
  /** 이 브라우저가 마지막으로 읽은 Writer 지문(재수화마다 새로 적는다). */
  writerFingerprint?: string
  unsaved?: UnsavedDirectorPrompt
}

export const KEEP = Symbol('keep')

export interface DirectorPromptHydrate {
  promptOverride: string | undefined | typeof KEEP
  unsaved: UnsavedDirectorPrompt | undefined | typeof KEEP
  /** true = 이 브라우저의 고친 글을 DB 로 (다시) 올린다. */
  upload: boolean
  writerFingerprint: string
}

const text = (value: unknown): string => (typeof value === 'string' ? value : '')

/**
 * Writer 지문 — DB 방아쇠(shots_clear_director_prompt)가 보는 두 칸(prompt · action_description). 번역 칸(_native)은 보지 않는다.
 *   노드에 짧게 남기려고 FNV-1a 32비트 해시(16진 8자리)로 줄인다 — 같은 글이면 같은 지문.
 */
export function writerFingerprint(row: DirectorPromptRow): string {
  const source = `${text(row.prompt)}\u0000${text(row.action_description)}`
  let hash = 0x811c9dc5
  for (let i = 0; i < source.length; i++) {
    hash ^= source.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

/** 화면의 Writer 글(derivedPrompt)과 같은 규칙 — prompt 가 있으면 그것, 없으면 샷 이야기(화면 말 우선). 지문을 모를 때의 비교용. */
export function writerTextOfRow(row: DirectorPromptRow): string {
  const action = typeof row.action_description_native === 'string' ? row.action_description_native : text(row.action_description)
  return text(row.prompt) || action || ''
}

export function decideDirectorPromptHydrate(input: {
  row: DirectorPromptRow
  local: LocalDirectorPrompt
  /** 고친 글 저장이 0.5초 대기 중이다(곧 올라간다). */
  savePending: boolean
  /** 이 브라우저가 이 프로젝트를 아직 DB 와 맞춘 적이 없다(칸이 있는 행을 처음 읽음). */
  firstSync: boolean
}): DirectorPromptHydrate {
  const { row, local } = input
  const fingerprint = writerFingerprint(row)
  const keep: DirectorPromptHydrate = { promptOverride: KEEP, unsaved: KEEP, upload: false, writerFingerprint: fingerprint }
  if (!('director_prompt' in row) || input.savePending) return keep
  const db = typeof row.director_prompt === 'string' && row.director_prompt.trim() ? row.director_prompt : null
  const sameWriter = (base: string | null | undefined) =>
    base != null ? base === fingerprint : (local.derivedPrompt ?? '') === writerTextOfRow(row)
  const fromDb: DirectorPromptHydrate = { promptOverride: db ?? undefined, unsaved: undefined, upload: false, writerFingerprint: fingerprint }
  if (local.unsaved) return sameWriter(local.unsaved.base) ? { ...keep, upload: true } : fromDb
  const localEdit = local.promptOverride != null && local.promptOverride !== (local.derivedPrompt ?? undefined)
  if (input.firstSync && localEdit && db === null) {
    return sameWriter(local.writerFingerprint)
      ? { promptOverride: KEEP, unsaved: { base: fingerprint }, upload: true, writerFingerprint: fingerprint }
      : fromDb
  }
  return fromDb
}
