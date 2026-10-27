// 산문 재점검(2026-10-27 오너 · 디자이너 QA 2차, 프로토타입 WT · WTm) — AI가 확정 산문에서 뽑은 인물 · 장소 목록을
//   산문 기준으로 바로잡는다. 산문은 잠긴 채 그대로이고, 목록의 이름(다른 이름 포함)이 나오는 자리만 표시한다.
//   빠진 말은 산문에서 골라 넣고, 이름이 틀렸으면 고치며, 이미 있는 이름으로 고치면 하나로 합친다. 빼기는 없다(오너 결정 3).
//   여기는 화면 · 서버가 같이 쓰는 규칙(순수)만 둔다 — 표시 자리, 고른 말 검사, 고친 것 쌓기, 창 상태.
//   실행 기록 · 목록에 반영하는 쪽은 src/lib/writer/breakdown-recheck.ts.
//   약속: tests/artist/recheck.test.ts
import { breakdownRows, type BreakdownRow } from '@/lib/artist/breakdown'
import { replaceSlugs } from '@/lib/script-lines'

export type RecheckKind = 'person' | 'background'

export interface RecheckEntity {
  /** 목록 줄 번호(localId). 창에서 새로 넣은 것은 `new:<순번>`. */
  key: string
  kind: RecheckKind
  name: string
  /** 산문에 나오는 다른 이름(또는). 이름 자신은 넣지 않는다. */
  aliases: string[]
}

export interface RecheckEntry extends RecheckEntity {
  /** 창에서 새로 넣었다. */
  added: boolean
  /** 이 줄로 합쳐 사라진 줄 번호(합친 순서대로). */
  merged: string[]
}

export type RecheckOp =
  | { op: 'add'; kind: RecheckKind; name: string }
  | { op: 'rename'; key: string; name: string }
  | { op: 'merge'; from: string; into: string }

export type RecheckIssue = 'invalid_name' | 'already_listed' | 'word_not_in_prose' | 'unknown_entry' | 'name_taken' | 'kind_mismatch'

export interface ProseScene {
  sceneId: string
  text: string
}

export interface MentionSegment {
  text: string
  /** 표시한 줄 번호. 표시하지 않은 글은 null. */
  key: string | null
}

/** 산문에서 고른 말의 길이 상한(프로토타입 — 14자 · 한 줄). */
export const RECHECK_PICK_MAX = 14
/** 고쳐 쓰는 이름의 길이 상한. */
export const RECHECK_NAME_MAX = 40

/** 브레이크다운 목록 줄 → 창이 고칠 줄. */
export function recheckEntitiesOf(rows: ReadonlyArray<Pick<BreakdownRow, 'id' | 'kind' | 'name' | 'aliases'>>): RecheckEntity[] {
  return rows.map((row) => ({ key: row.id, kind: row.kind, name: row.name, aliases: [...row.aliases] }))
}

/** 목록 카드 → 창이 고칠 줄. 사물은 목록에 없어 넣지 않는다(breakdownRows 와 같은 줄). */
export function recheckBase(
  cast: Parameters<typeof breakdownRows>[0],
  backgrounds: Parameters<typeof breakdownRows>[1],
): RecheckEntity[] {
  return recheckEntitiesOf(breakdownRows(cast, backgrounds))
}

/** Writer 화면과 같은 산문(S1 · S2 …) — 미리 보기의 씬 비트를 이어 붙이고 남은 번호를 이름으로 바꾼다(use-prose 와 같은 규칙). */
export function proseScenesFromPreview(
  preview: { scenes?: ReadonlyArray<{ sceneId: string; beats: string[] }>; roster?: ReadonlyArray<{ slug: string; name: string }> } | null | undefined,
): ProseScene[] {
  const roster = [...(preview?.roster ?? [])]
  return (preview?.scenes ?? [])
    .filter((scene) => scene.beats.length > 0)
    .map((scene) => ({ sceneId: scene.sceneId, text: replaceSlugs(scene.beats.join(' '), roster, '') }))
}

const LATIN_WORD_CHAR = /[A-Za-z0-9_]/

/** text 의 index 자리에서 word 가 시작하나. 영어 · 숫자로 시작하거나 끝나는 말은 낱말 경계에서만(Tom ≠ Tomorrow) —
 *  한국어는 이름 뒤에 조사가 붙으므로 경계를 따지지 않는다. */
function wordAt(text: string, index: number, word: string): boolean {
  if (!word || !text.startsWith(word, index)) return false
  const before = index > 0 ? text[index - 1] : ''
  const after = text[index + word.length] ?? ''
  if (LATIN_WORD_CHAR.test(word[0]) && LATIN_WORD_CHAR.test(before)) return false
  if (LATIN_WORD_CHAR.test(word[word.length - 1]) && LATIN_WORD_CHAR.test(after)) return false
  return true
}

/** 산문에 그 말이 나오나(표시와 같은 경계 규칙). */
export function mentionsWord(text: string, word: string): boolean {
  const target = word.trim()
  if (!target) return false
  for (let index = text.indexOf(target); index >= 0; index = text.indexOf(target, index + 1)) {
    if (wordAt(text, index, target)) return true
  }
  return false
}

/** 줄 하나가 산문에서 표시되는 말 — 이름 · 다른 이름(빈 말 · 겹침 없이). */
export function entityWords(entity: Pick<RecheckEntity, 'name' | 'aliases'>): string[] {
  const words: string[] = []
  for (const raw of [entity.name, ...entity.aliases]) {
    const word = raw?.trim()
    if (word && !words.includes(word)) words.push(word)
  }
  return words
}

/** 산문 한 씬을 표시 자리로 나눈다 — 긴 말부터, 한 자리는 한 번만(같은 길이면 목록 앞쪽이 먼저). 목록에 없는 말은 표시하지 않는다. */
export function markMentions(text: string, entities: readonly RecheckEntity[]): MentionSegment[] {
  const words = entities
    .flatMap((entity, order) => entityWords(entity).map((word) => ({ word, key: entity.key, order })))
    .sort((a, b) => b.word.length - a.word.length || a.order - b.order)
  const segments: MentionSegment[] = []
  let plain = ''
  let index = 0
  while (index < text.length) {
    const hit = words.find(({ word }) => wordAt(text, index, word))
    if (!hit) {
      plain += text[index]
      index += 1
      continue
    }
    if (plain) segments.push({ text: plain, key: null })
    plain = ''
    segments.push({ text: hit.word, key: hit.key })
    index += hit.word.length
  }
  if (plain) segments.push({ text: plain, key: null })
  return segments
}

/** 산문에서 고른 말 — 14자 이하 · 한 줄 · 글자가 있고 산문에 나오는 말만. 아니면 null(고른 것으로 치지 않는다). */
export function pickWord(selection: string, prose: readonly ProseScene[]): string | null {
  const word = selection.trim()
  if (!word || /[\r\n]/.test(word) || [...word].length > RECHECK_PICK_MAX || !/[\p{L}\p{N}]/u.test(word)) return null
  return prose.some((scene) => mentionsWord(scene.text, word)) ? word : null
}

/** 그 말을 이름이나 다른 이름으로 가진 줄. kind 를 주면 같은 종류만, exceptKey 줄은 빼고 본다. */
export function listedOwner<T extends RecheckEntity>(entries: readonly T[], word: string, kind?: RecheckKind, exceptKey?: string): T | null {
  const target = word.trim()
  if (!target) return null
  return entries.find((entry) => entry.key !== exceptKey && (!kind || entry.kind === kind) && entityWords(entry).includes(target)) ?? null
}

function uniqueWords(words: readonly string[], exclude: string): string[] {
  const out: string[] = []
  for (const raw of words) {
    const word = raw.trim()
    if (word && word !== exclude && !out.includes(word)) out.push(word)
  }
  return out
}

/** 고친 것 하나를 줄 목록에 얹는다(제자리). 받지 않는 요청이면 그 까닭. */
function applyOne(entries: RecheckEntry[], op: RecheckOp, at: number, prose: readonly ProseScene[]): RecheckIssue | null {
  if (op.op === 'add') {
    const word = pickWord(op.name, prose)
    const trimmed = op.name.trim()
    if (!trimmed || /[\r\n]/.test(trimmed) || [...trimmed].length > RECHECK_PICK_MAX) return 'invalid_name'
    if (listedOwner(entries, trimmed)) return 'already_listed'
    if (!word) return 'word_not_in_prose'
    entries.push({ key: `new:${at}`, kind: op.kind, name: word, aliases: [], added: true, merged: [] })
    return null
  }
  if (op.op === 'rename') {
    const entry = entries.find((item) => item.key === op.key)
    if (!entry) return 'unknown_entry'
    const name = op.name.trim()
    if (!name || /[\r\n]/.test(name) || [...name].length > RECHECK_NAME_MAX) return 'invalid_name'
    if (name === entry.name) return null
    if (listedOwner(entries, name, entry.kind, entry.key)) return 'name_taken'
    // 산문 글은 그대로라 예전 이름이 계속 나온다 — 산문에 나오면 다른 이름(또는)으로 남겨 그 자리가 계속 이 줄로 표시되게 한다.
    const keepOld = !!entry.name.trim() && prose.some((scene) => mentionsWord(scene.text, entry.name))
    entry.aliases = uniqueWords([...entry.aliases, ...(keepOld ? [entry.name] : [])], name)
    entry.name = name
    return null
  }
  const from = entries.find((item) => item.key === op.from)
  const into = entries.find((item) => item.key === op.into)
  if (!from || !into || from === into) return 'unknown_entry'
  // 인물과 장소는 서로 합치지 않는다(프로토타입) — 합치면 인물 그림이나 배경 그림 하나가 사라진다.
  if (from.kind !== into.kind) return 'kind_mismatch'
  into.aliases = uniqueWords([...into.aliases, from.name, ...from.aliases], into.name)
  into.merged = [...into.merged, from.key, ...from.merged]
  entries.splice(entries.indexOf(from), 1)
  return null
}

function startEntries(base: readonly RecheckEntity[]): RecheckEntry[] {
  return base.map((entity) => ({ ...entity, aliases: [...entity.aliases], added: false, merged: [] }))
}

/** 고친 것을 차례로 얹은 줄 목록 — 서버가 반영할 때 쓴다. 하나라도 받지 않는 요청이면 그 자리와 까닭을 돌려준다. */
export function applyRecheckOps(
  base: readonly RecheckEntity[],
  ops: readonly RecheckOp[],
  prose: readonly ProseScene[],
): { ok: true; entries: RecheckEntry[] } | { ok: false; issue: RecheckIssue; at: number } {
  const entries = startEntries(base)
  for (const [at, op] of ops.entries()) {
    const issue = applyOne(entries, op, at, prose)
    if (issue) return { ok: false, issue, at }
  }
  return { ok: true, entries }
}

// ── 창 상태(화면) ─────────────────────────────────────────────

export interface RecheckSession {
  /** 창을 연 때의 목록. 창에서 고친 것은 ops 로만 쌓는다 — [취소]하면 그대로 버린다. */
  base: RecheckEntity[]
  ops: RecheckOp[]
  /** 산문에서 고른 말. */
  pick: string | null
  /** [추가하기]를 눌러 인물로 · 장소로를 고르는 중. */
  adding: boolean
  /** 이름을 고치는 줄과 입력칸의 글. */
  editing: { key: string; value: string } | null
  /** 이미 있는 이름으로 고쳐 합칠지 묻는 중. */
  merge: { from: string; into: string } | null
}

export type RecheckAction =
  | { type: 'select'; text: string }
  | { type: 'clearPick' }
  | { type: 'startAdd' }
  | { type: 'add'; kind: RecheckKind }
  | { type: 'edit'; key: string }
  | { type: 'editValue'; value: string }
  | { type: 'cancelEdit' }
  | { type: 'saveEdit' }
  | { type: 'cancelMerge' }
  | { type: 'confirmMerge' }

export function startRecheck(base: readonly RecheckEntity[]): RecheckSession {
  return { base: base.map((entity) => ({ ...entity, aliases: [...entity.aliases] })), ops: [], pick: null, adding: false, editing: null, merge: null }
}

/** 지금 창에 보이는 줄 목록. 산문이 늦게 와 맞지 않게 된 고침은 건너뛴다(화면이 멈추지 않게). */
export function recheckEntries(session: RecheckSession, prose: readonly ProseScene[]): RecheckEntry[] {
  const entries = startEntries(session.base)
  for (const [at, op] of session.ops.entries()) {
    const trial = entries.map((entry) => ({ ...entry, aliases: [...entry.aliases], merged: [...entry.merged] }))
    if (!applyOne(trial, op, at, prose)) entries.splice(0, entries.length, ...trial)
  }
  return entries
}

export type PickState = 'none' | 'listed' | 'picked' | 'adding'

/** 고른 말 줄의 상태 — 없음 · 이미 목록에 있음 · 고름 · 인물로/장소로 고르는 중. */
export function pickState(session: RecheckSession, prose: readonly ProseScene[]): PickState {
  if (!session.pick) return 'none'
  if (listedOwner(recheckEntries(session, prose), session.pick)) return 'listed'
  return session.adding ? 'adding' : 'picked'
}

/** 고친 것 하나를 더해 본다 — 받으면 고르기 · 고치기 · 합치기를 닫은 새 상태, 받지 않으면 null. */
function withOp(session: RecheckSession, op: RecheckOp, prose: readonly ProseScene[]): RecheckSession | null {
  const ops = [...session.ops, op]
  if (!applyRecheckOps(session.base, ops, prose).ok) return null
  return { ...session, ops, pick: null, adding: false, editing: null, merge: null }
}

export function recheckReducer(session: RecheckSession, action: RecheckAction, prose: readonly ProseScene[]): RecheckSession {
  switch (action.type) {
    case 'select': {
      // 산문에서 고른 말이 규칙(14자 · 한 줄 · 산문에 있음)에 맞을 때만 고른 것으로 본다 — 아니면 지금 상태 그대로.
      const word = pickWord(action.text, prose)
      return word ? { ...session, pick: word, adding: false, editing: null, merge: null } : session
    }
    case 'clearPick':
      return { ...session, pick: null, adding: false }
    case 'startAdd':
      return pickState(session, prose) === 'picked' ? { ...session, adding: true } : session
    case 'add': {
      if (pickState(session, prose) !== 'adding' || !session.pick) return session
      return withOp(session, { op: 'add', kind: action.kind, name: session.pick }, prose) ?? { ...session, pick: null, adding: false }
    }
    case 'edit': {
      if (session.editing?.key === action.key) return { ...session, editing: null, merge: null }
      const entry = recheckEntries(session, prose).find((item) => item.key === action.key)
      return entry ? { ...session, editing: { key: entry.key, value: entry.name }, pick: null, adding: false, merge: null } : session
    }
    case 'editValue':
      return session.editing ? { ...session, editing: { ...session.editing, value: action.value } } : session
    case 'cancelEdit':
      return { ...session, editing: null, merge: null }
    case 'saveEdit': {
      const editing = session.editing
      if (!editing) return session
      const entries = recheckEntries(session, prose)
      const entry = entries.find((item) => item.key === editing.key)
      if (!entry) return { ...session, editing: null }
      const name = editing.value.trim()
      if (!name) return session
      // 같은 종류의 이미 있는 이름 · 다른 이름이면 바로 고치지 않고 합칠지 묻는다(프로토타입 WTm).
      const owner = listedOwner(entries, name, entry.kind, entry.key)
      if (owner) return { ...session, merge: { from: entry.key, into: owner.key } }
      if (name === entry.name) return { ...session, editing: null }
      return withOp(session, { op: 'rename', key: entry.key, name }, prose) ?? session
    }
    case 'cancelMerge':
      return { ...session, merge: null }
    case 'confirmMerge':
      if (!session.merge) return session
      return withOp(session, { op: 'merge', from: session.merge.from, into: session.merge.into }, prose) ?? { ...session, merge: null }
  }
}
