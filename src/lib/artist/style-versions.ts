// 작품 스타일 기록(버전) 규칙 — 화면 · 서버 · 시험이 함께 쓰는 순수 모듈(2026-10-28 오너, 프로토타입 A5 · A6 · AV · AY · A7).
//   버전 = 작품 스타일 하나 + 그때의 그림. [재생성하기]는 지금 버전을 남기고 새 버전을 열어 인물 · 배경의 모든 모습을 다시 그리고,
//   [불러오기]는 다시 그리지 않고 그 버전의 그림 · 스타일로 돌린다. 카드 기록의 그림은 그린 때로 어느 버전(스타일) 것인지 가린다.
//   서버 전용 모듈을 들이지 않는다(DB · 보관함은 style-versions-server.ts). 약속: tests/artist/style-versions.test.ts
import { translate } from '@/lib/i18n/translate'
import { directionParticle, objectParticle } from '@/lib/korean-particles'
import type { AppLocale } from '@/lib/locale'
import { styleAnchorName } from '@/lib/style-anchor-name'

/** 거절 까닭 코드 — 화면이 안내를 고른다. */
export const ARTIST_VERSION_CODES = {
  completed: 'artist_completed',
  regenPending: 'regen_pending',
  drawing: 'drawing',
  conflict: 'version_conflict',
  alreadyCurrent: 'already_current',
  notFound: 'version_not_found',
  unknownStyle: 'unknown_style',
  nothingToDraw: 'nothing_to_draw',
  otherStyle: 'other_style',
  restoring: 'version_restoring',
} as const

/** 그 버전이 지금이었던 때 — from 이 null 이면 기록 기능 전부터(v1). to 가 null 이면 지금도. */
export interface ActiveRange { from: string | null; to: string | null }

/** 버전에 남긴 그림 한 장 — 카드 기록 줄(후보)과 그때의 지문을 함께 둔다(되살릴 때 "바뀜" 판정이 그대로다).
 *  sourceUrl = 복사해 온 지금 그림 주소 — 다음에 떠날 때 지금 그림이 그대로면 복사본을 다시 쓴다(보관함이 커지지 않게). */
export interface VersionImage {
  url: string
  candidateId: string | null
  sourceHash: string | null
  appearanceHash: string | null
  generatedAt: string | null
  sourceUrl?: string | null
}
export interface VersionCharacterImage { characterId: string; appearanceKey: string; sheet: VersionImage; portraitUrl: string | null; portraitSourceUrl?: string | null }
export interface VersionLocationImage { locationId: string; appearanceKey: string | null; wideShot: VersionImage }
/** look.l1 = 그 버전 때의 그림 지시 그림체 값(design_tokens.l1) — 불러오면 이것으로 돌아간다(styleLookTokens). */
export interface VersionSnapshot { characters: VersionCharacterImage[]; locations: VersionLocationImage[]; look?: { l1: Record<string, unknown> | null } }

/** 판정이 쓰는 버전 모양. styleId = series/snapshot styleIdOf(키, 없으면 직접 올린 그림체 'custom'). */
export interface VersionSummary { n: number; styleId: string | null; current: boolean; active: ActiveRange[] }

export interface VersionCustomStyle { url: string; label: string; medium: string | null; locked?: boolean }

/** 화면이 받는 버전 한 줄(GET /api/artist/versions). */
export interface VersionView extends VersionSummary {
  styleKey: string | null
  customStyle: VersionCustomStyle | null
  createdAt: string
  thumbs: Array<{ kind: 'character' | 'location'; id: string; name: string; url: string | null }>
}

// ── 재생성 그림 그리기 ──────────────────────────────────────────────

/** 다시 그릴 칸 하나. phase 0 = 기본 모습, 1 = 다른 모습(그 인물 · 배경의 기본 모습이 끝난 뒤). fromUrl = 시작할 때의 그림. */
export interface RegenSlot { kind: 'character' | 'location'; id: string; appearanceKey: string | null; phase: 0 | 1; fromUrl: string | null }
/** 버전 행의 regen 칸 — 시작 시각 · 그릴 칸 · 접수 전에 막힌 칸(실패로 본다) · 다 그린 때(완료 알림을 한 번만 한다).
 *  fromN = 재생성 전 버전([이전 버전으로 돌아가기]가 불러온다). cancelledAt = 다 그리기 전에 그만둔 때(다시 와도 이어 그리지 않는다). */
export interface RegenRecord { startedAt: string; slots: RegenSlot[]; failed: string[]; doneAt: string | null; fromN?: number | null; cancelledAt?: string | null }
export type RegenSlotState = 'done' | 'failed' | 'drawing' | 'todo'
/** 칸 하나의 지금 사실 — jobs 는 시작 뒤에 만든 그 칸의 그림 작업들(fresh = 10분 안의 대기). */
export interface RegenSlotFacts {
  exists: boolean
  currentUrl: string | null
  jobs: ReadonlyArray<{ status: string; fresh: boolean }>
}
export interface RegenProgress {
  n: number
  startedAt: string
  /** 재생성 전 버전 — 모르면(이 칸이 생기기 전 기록) null. */
  fromN: number | null
  slots: RegenSlot[]
  states: Record<string, RegenSlotState>
  total: number
  done: number
  failed: number
  drawing: number
  complete: boolean
  announced: boolean
}

export function regenSlotKey(slot: Pick<RegenSlot, 'kind' | 'id' | 'appearanceKey'>): string {
  return `${slot.kind === 'character' ? 'c' : 'l'}:${slot.id}:${slot.appearanceKey ?? 'default'}`
}

/**
 * 재생성으로 다시 그릴 칸 — 인물 시트의 모든 모습 · 배경의 모든 모습(오너 "전체").
 *   사물 카드(예전 흐름에만 남음)는 다시 그리지 않는다 — 요약 줄이 인물 · 배경만 센다(혼자 정한 것).
 */
export function buildRegenPlan(input: {
  characters: ReadonlyArray<{ characterId: string; entityType: string | null }>
  appearances: ReadonlyArray<{ characterId: string; appearanceKey: string; isDefault: boolean; sheetUrl: string | null }>
  locations: ReadonlyArray<{ locationId: string; wideShot: string | null }>
  locationAppearances: ReadonlyArray<{ locationId: string; appearanceKey: string; wideShot: string | null }>
}): RegenSlot[] {
  const persons = new Set(input.characters.filter((c) => c.entityType !== 'object').map((c) => c.characterId))
  const places = new Set(input.locations.map((l) => l.locationId))
  const characters = input.appearances
    .filter((a) => persons.has(a.characterId))
    .map((a): RegenSlot => ({ kind: 'character', id: a.characterId, appearanceKey: a.appearanceKey, phase: a.isDefault ? 0 : 1, fromUrl: a.sheetUrl }))
  const locations = [
    ...input.locations.map((l): RegenSlot => ({ kind: 'location', id: l.locationId, appearanceKey: null, phase: 0, fromUrl: l.wideShot })),
    ...input.locationAppearances
      .filter((a) => places.has(a.locationId))
      .map((a): RegenSlot => ({ kind: 'location', id: a.locationId, appearanceKey: a.appearanceKey, phase: 1, fromUrl: a.wideShot })),
  ]
  return [...characters, ...locations]
}

/** 재생성 창 요약 줄의 "인물 N · 배경 M" — 모습은 따로 세지 않는다. */
export function regenCounts(plan: readonly RegenSlot[]): { persons: number; places: number } {
  return {
    persons: new Set(plan.filter((s) => s.kind === 'character').map((s) => s.id)).size,
    places: new Set(plan.filter((s) => s.kind === 'location').map((s) => s.id)).size,
  }
}

/** 고른 스타일이 지금 스타일과 같은가 — "(그대로)" / "작품 스타일이 이걸로 바뀌어요". */
export function regenStyleNote(chosenStyleId: string | null, currentStyleId: string | null): 'same' | 'changes' {
  return chosenStyleId === currentStyleId ? 'same' : 'changes'
}

/**
 * 칸 하나가 지금 어떤가 — 이어 그리기가 그릴 칸(todo)만 고른다.
 *   다 그림: 시작 뒤 끝난 작업이 있거나 그림이 바뀌었다(지운 칸도 끝난 것으로 본다).
 *   그리는 중: 10분 안의 대기 작업. 실패: 시작 뒤 실패했거나, 접수 전에 막혀 적어 둔 칸, 또는 10분 넘게 대기로 멈춘 작업 —
 *   9/11 규칙대로 자동으로 다시 그리지 않는다. 카드에서 사람이 다시 그려 성공하면 다 그린 칸이 된다.
 */
export function regenSlotState(slot: RegenSlot, record: Pick<RegenRecord, 'failed'>, facts: RegenSlotFacts): RegenSlotState {
  if (!facts.exists) return 'done'
  if (facts.jobs.some((job) => job.status === 'completed')) return 'done'
  if (facts.currentUrl && facts.currentUrl !== slot.fromUrl) return 'done'
  if (facts.jobs.some((job) => job.status === 'queued' && job.fresh)) return 'drawing'
  if (record.failed.includes(regenSlotKey(slot))) return 'failed'
  if (facts.jobs.some((job) => job.status === 'failed' || (job.status === 'queued' && !job.fresh))) return 'failed'
  return 'todo'
}

export function regenProgress(n: number, record: RegenRecord, factsOf: (slot: RegenSlot) => RegenSlotFacts): RegenProgress {
  const states: Record<string, RegenSlotState> = {}
  for (const slot of record.slots) states[regenSlotKey(slot)] = regenSlotState(slot, record, factsOf(slot))
  const values = record.slots.map((slot) => states[regenSlotKey(slot)])
  return {
    n,
    startedAt: record.startedAt,
    fromN: record.fromN ?? null,
    slots: record.slots,
    states,
    total: values.length,
    done: values.filter((s) => s === 'done').length,
    failed: values.filter((s) => s === 'failed').length,
    drawing: values.filter((s) => s === 'drawing').length,
    complete: values.every((s) => s === 'done' || s === 'failed'),
    announced: !!record.doneAt,
  }
}

/**
 * 지금 그릴 칸 — 남은(todo) 칸 중 기본 모습, 그리고 그 인물 · 배경의 기본 모습이 끝난(다 그림 · 실패) 다른 모습.
 *   다른 모습은 기본 모습 대표 얼굴 · 기본 배경 그림을 참고로 그린다 — 새 스타일 기본 모습이 먼저 있어야 덜 섞인다(혼자 정한 것).
 */
export function nextRegenTargets(record: Pick<RegenRecord, 'slots'>, states: Readonly<Record<string, RegenSlotState>>): RegenSlot[] {
  return record.slots.filter((slot) => {
    if (states[regenSlotKey(slot)] !== 'todo') return false
    if (slot.phase === 0) return true
    const base = record.slots.find((s) => s.phase === 0 && s.kind === slot.kind && s.id === slot.id)
    if (!base) return true
    const baseState = states[regenSlotKey(base)]
    return baseState === 'done' || baseState === 'failed'
  })
}

// ── 그림 지시의 그림체 값 ─────────────────────────────────────────

/**
 * 스타일 매체(style_anchors.medium)마다의 그림 지시 그림체 값 — 처음 만들 때(Writer v0 visual) 그 스타일로 정하는 값과 같은 쪽.
 *   실사는 처음부터 실사로 만든 작품들의 값(개발 DB 실측)과 같다. 등신은 실사만 정하고 나머지는 작품 값을 둔다.
 */
const LOOK_BY_MEDIUM: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  live_action: { art_style: 'live_action', line_quality: 'none', shape_language: 'natural', texture_philosophy: 'photorealistic', character_proportion: '7.5:1' },
  '3d': { art_style: '3d', line_quality: 'clean', shape_language: 'mixed', texture_philosophy: 'detailed_pbr' },
  '2d_anime': { art_style: '2d_anime', line_quality: 'clean', shape_language: 'mixed', texture_philosophy: 'flat' },
  '2d_cartoon': { art_style: '2d_cartoon', line_quality: 'clean', shape_language: 'round', texture_philosophy: 'flat' },
  stop_motion: { art_style: 'stop_motion', line_quality: 'none', shape_language: 'round', texture_philosophy: 'handcrafted' },
  watercolor: { art_style: 'watercolor', line_quality: 'variable_weight', shape_language: 'organic', texture_philosophy: 'painterly' },
}

/**
 * 다른 스타일로 다시 만들 때의 그림 지시 그림체 값(design_tokens.l1) — 매체 · 선 · 형태 · 질감을 새 스타일 것으로 바꾼다.
 *   그대로 두면 새 스타일로 다시 그려도 지시가 옛 그림체를 말해 옛 그림체로 나온다(2026-10-28 개발 DB e2e: 애니 → 실사가 애니로 나옴).
 *   매체를 모르면(직접 올린 그림체 등) 그대로 — 그 그림체는 그림과 분석이 정한다(styleFromUserAnalysis).
 */
export function styleLookTokens(medium: string | null | undefined, current: Readonly<Record<string, unknown>> | null | undefined): Record<string, unknown> {
  const look = medium ? LOOK_BY_MEDIUM[medium] : undefined
  return look ? { ...(current ?? {}), ...look } : { ...(current ?? {}) }
}

// ── 버전 · 기록 판정 ─────────────────────────────────────────────

const timeOf = (iso: string | null): number => (iso ? Date.parse(iso) : Number.NaN)

/** 그 시각에 지금이었던 버전. 기록 기능 전(v1 의 from = null)도 v1 이다. */
export function versionAt<T extends Pick<VersionSummary, 'active'>>(versions: readonly T[], at: string): T | null {
  const t = timeOf(at)
  if (!Number.isFinite(t)) return null
  return versions.find((version) => version.active.some((range) => {
    const from = range.from === null ? Number.NEGATIVE_INFINITY : timeOf(range.from)
    const to = range.to === null ? Number.POSITIVE_INFINITY : timeOf(range.to)
    return t >= from && t < to
  })) ?? null
}

/** 카드 기록 줄 하나를 불러올 수 있나 — 지금 작품 스타일과 같은 스타일(그린 때의 버전)일 때만. 기록이 없으면 가리지 않는다. */
export function historyPick(input: { generatedAt: string; versions: readonly VersionSummary[]; currentStyleId: string | null }): { loadable: boolean; version: VersionSummary | null } {
  if (input.versions.length === 0) return { loadable: true, version: null }
  const version = versionAt(input.versions, input.generatedAt)
  if (!version) return { loadable: true, version: null }
  return { loadable: version.styleId === input.currentStyleId, version }
}

/** 고른 스타일로 만든 이전 버전(지금 버전 말고) 중 가장 최근 것 — 재생성 창의 "✦ v{k}에 ~로 만든 게 있어요". */
export function previousVersionWithStyle<T extends VersionSummary>(versions: readonly T[], styleId: string | null): T | null {
  const hits = versions.filter((version) => !version.current && version.styleId === styleId)
  return hits.length ? hits.reduce((a, b) => (b.n > a.n ? b : a)) : null
}

/** 생성 기록 창 — 새 버전부터. */
export function historyOrder<T extends Pick<VersionSummary, 'n'>>(versions: readonly T[]): T[] {
  return [...versions].sort((a, b) => b.n - a.n)
}

/** 지금 버전 말고 이전 버전 — 새 버전부터(채팅 카드). */
export function earlierVersions<T extends VersionSummary>(versions: readonly T[]): T[] {
  return historyOrder(versions.filter((version) => !version.current))
}

/**
 * 머리 줄 — 지금 버전 번호 · 기록 수 · 두 단추 · 까닭. 기록이 없으면 지금 그림이 v1 이다.
 *   stopped = 재생성 그림이 다 그려지기 전에 멈췄다 — [불러오기]로 이전 버전에 돌아갈 수 있고(남은 재생성은 그만둔다),
 *   [재생성하기]는 남은 그림을 그리거나 돌아간 뒤에 한다(2026-10-28 검토 지적).
 */
export function versionHeader(input: { versions: readonly VersionSummary[]; completed: boolean; drawing: boolean; demo?: boolean; stopped?: boolean }): {
  n: number
  count: number
  canLoad: boolean
  canRegenerate: boolean
  note: 'completed' | 'drawing' | 'stopped' | 'single' | null
} {
  const count = Math.max(1, input.versions.length)
  const n = input.versions.find((version) => version.current)?.n ?? (input.versions.length ? Math.max(...input.versions.map((version) => version.n)) : 1)
  if (input.completed) return { n, count, canLoad: false, canRegenerate: false, note: 'completed' }
  if (input.drawing) return { n, count, canLoad: false, canRegenerate: false, note: 'drawing' }
  if (input.demo) return { n, count, canLoad: false, canRegenerate: false, note: null }
  if (input.stopped) return { n, count, canLoad: count > 1, canRegenerate: false, note: 'stopped' }
  if (count <= 1) return { n, count, canLoad: false, canRegenerate: true, note: 'single' }
  return { n, count, canLoad: true, canRegenerate: true, note: null }
}

/** 지금이었던 때 닫기 · 열기(버전을 떠나고 돌아올 때). */
export function closeActiveRange(active: readonly ActiveRange[], at: string): ActiveRange[] {
  const out = active.map((range) => ({ ...range }))
  for (let i = out.length - 1; i >= 0; i--) {
    if (out[i].to === null) {
      out[i].to = at
      break
    }
  }
  return out
}
export function openActiveRange(active: readonly ActiveRange[], at: string): ActiveRange[] {
  return [...active.map((range) => ({ ...range })), { from: at, to: null }]
}

// ── 저장 모양 읽기(jsonb) ──────────────────────────────────────────

const str = (value: unknown): string | null => (typeof value === 'string' && value ? value : null)

export function parseActive(raw: unknown): ActiveRange[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const range = item as Record<string, unknown>
    return [{ from: str(range.from), to: str(range.to) }]
  })
}

function parseImage(raw: unknown): VersionImage | null {
  if (!raw || typeof raw !== 'object') return null
  const image = raw as Record<string, unknown>
  const url = str(image.url)
  if (!url) return null
  return {
    url, candidateId: str(image.candidateId), sourceHash: str(image.sourceHash), appearanceHash: str(image.appearanceHash), generatedAt: str(image.generatedAt),
    sourceUrl: str(image.sourceUrl),
  }
}

export function parseVersionSnapshot(raw: unknown): VersionSnapshot | null {
  if (!raw || typeof raw !== 'object') return null
  const snapshot = raw as Record<string, unknown>
  const characters = (Array.isArray(snapshot.characters) ? snapshot.characters : []).flatMap((item) => {
    const entry = (item ?? {}) as Record<string, unknown>
    const sheet = parseImage(entry.sheet)
    const characterId = str(entry.characterId)
    const appearanceKey = str(entry.appearanceKey)
    return sheet && characterId && appearanceKey ? [{ characterId, appearanceKey, sheet, portraitUrl: str(entry.portraitUrl), portraitSourceUrl: str(entry.portraitSourceUrl) }] : []
  })
  const locations = (Array.isArray(snapshot.locations) ? snapshot.locations : []).flatMap((item) => {
    const entry = (item ?? {}) as Record<string, unknown>
    const wideShot = parseImage(entry.wideShot)
    const locationId = str(entry.locationId)
    return wideShot && locationId ? [{ locationId, appearanceKey: str(entry.appearanceKey), wideShot }] : []
  })
  const look = snapshot.look && typeof snapshot.look === 'object' ? (snapshot.look as { l1?: unknown }) : null
  const l1 = look?.l1 && typeof look.l1 === 'object' && !Array.isArray(look.l1) ? (look.l1 as Record<string, unknown>) : null
  return { characters, locations, ...(look ? { look: { l1 } } : {}) }
}

export function parseRegenRecord(raw: unknown): RegenRecord | null {
  if (!raw || typeof raw !== 'object') return null
  const record = raw as Record<string, unknown>
  const startedAt = str(record.startedAt)
  if (!startedAt || !Array.isArray(record.slots)) return null
  const slots = record.slots.flatMap((item): RegenSlot[] => {
    const slot = (item ?? {}) as Record<string, unknown>
    const id = str(slot.id)
    if (!id || (slot.kind !== 'character' && slot.kind !== 'location')) return []
    return [{ kind: slot.kind, id, appearanceKey: str(slot.appearanceKey), phase: slot.phase === 1 ? 1 : 0, fromUrl: str(slot.fromUrl) }]
  })
  const failed = Array.isArray(record.failed) ? record.failed.filter((key): key is string => typeof key === 'string') : []
  const fromN = typeof record.fromN === 'number' && Number.isInteger(record.fromN) ? record.fromN : null
  return { startedAt, slots, failed, doneAt: str(record.doneAt), fromN, cancelledAt: str(record.cancelledAt) }
}

/** 직접 올린 그림체(custom_style_anchor) — 화면이 쓰는 모양만. */
export function parseCustomStyle(raw: unknown): VersionCustomStyle | null {
  if (!raw || typeof raw !== 'object') return null
  const record = raw as Record<string, unknown>
  const url = str(record.url)
  if (!url) return null
  return { url, label: str(record.label) ?? '', medium: str(record.medium), ...(record.locked === true ? { locked: true } : {}) }
}

// ── 스타일 이름 · 채팅 ────────────────────────────────────────────

/** 버전 스타일 이름 — 직접 올린 그림체는 붙인 이름, 카탈로그 스타일은 화면 언어 이름. 모르면 키. */
export function versionStyleLabel(
  version: { styleKey: string | null; customStyle: VersionCustomStyle | null },
  anchors: ReadonlyArray<{ key: string; label: string; subtitle?: string | null }>,
  locale: AppLocale,
): string {
  if (version.customStyle) return version.customStyle.label || translate(locale, 'My reference')
  const anchor = anchors.find((item) => item.key === version.styleKey)
  if (anchor) return styleAnchorName(anchor, locale)
  return version.styleKey ?? translate(locale, 'No style')
}

/** 다 그린 뒤 채팅 — "{스타일}로 v{n}을 만들었어요. 이전 버전은 [불러오기]에 있어요." + 못 그린 장수(혼자 정한 것). */
export function regenDoneMessage(locale: AppLocale, input: { style: string; n: number; failed: number }): string {
  const made = translate(locale, 'Made v{n} in {style}. The earlier version is in [Load].', {
    n: input.n, style: input.style, ro: directionParticle(input.style), ul: objectParticle(`v${input.n}`),
  })
  return input.failed > 0 ? `${made} ${translate(locale, '{count} could not be drawn. Remake them from the cards.', { count: input.failed })}` : made
}

/** 불러온 뒤 채팅 — "v{n}({스타일})을 불러왔어요. 작품 스타일도 {스타일}으로 바뀌었어요." */
export function versionLoadedMessage(locale: AppLocale, input: { style: string; n: number }): string {
  return translate(locale, 'Loaded v{n} ({style}). The work style changed to {style} too.', {
    n: input.n, style: input.style, ul: objectParticle(input.style), ro: directionParticle(input.style),
  })
}

// 이전 스타일 · 버전으로 돌아가자는 말(프로토타입 AY) — 되돌리기 어려운 선택이 아니라 카드만 띄운다.
//   "이전 스타일"은 띄어 쓴 말 그대로 맞춘다 — 공백을 지우면 "완전 스타일"의 "전 스타일"처럼 낱말 사이가 붙어 걸렸다(2026-10-28 검토 지적).
//   한 글자 "앞" · "전"은 낱말 첫머리일 때만. 나머지(되돌리자는 말 · 말끝 · 아니라는 말)는 공백을 지운 말에 맞춘다.
const KO_PREV_STYLE = /(?:이전|예전|원래|지난|처음|(?:^|[^가-힣])(?:앞|전))(?:의)?\s*(?:스타일|그림체|화풍|버전|룩)/ // i18n-ok: 사용자 말에서 "이전 스타일 · 버전"을 알아듣는 정규식
const KO_BACK = /(?:돌아|되돌|돌려|복구|복원|불러)/ // i18n-ok: 사용자 말에서 되돌아가자는 말을 알아듣는 정규식
const KO_TO_END = /(?:스타일|그림체|화풍|버전|룩)(?:으로|로)[.!~]*$/ // i18n-ok: "전 버전으로"처럼 말이 끝나는 경우
const KO_NEGATED = /(?:가지|하지|돌리지|되돌리지)(?:마|말|않)|싫어|아니야/ // i18n-ok: 되돌리지 말라는 말
// 영어는 "이전 · 예전 · 처음 스타일 · 버전(· 룩)으로"를 붙여 말할 때만 — "go back … look"처럼 사이를 비워 맞추면
//   "go back and make him look older" 같은 평범한 요청까지 걸렸다(2026-10-28 검토 지적).
const EN_EARLIER = String.raw`(?:the\s+|my\s+|our\s+)?(?:previous|old|older|earlier|original|last|first|prior)\s+(?:art\s+)?(?:style|version|look)`
const EN_RULES = [
  new RegExp(String.raw`\b(?:go|going|get|switch|change|roll|revert|turn)\s+(?:it\s+|this\s+)?back\s+to\s+${EN_EARLIER}\b`, 'i'),
  new RegExp(String.raw`\brevert\s+(?:it\s+|this\s+)?(?:back\s+)?to\s+${EN_EARLIER}\b`, 'i'),
  new RegExp(String.raw`\b(?:restore|load|bring\s+back|return\s+to|use)\s+${EN_EARLIER}\b`, 'i'),
  /\b(?:go|switch|roll|revert|turn)\s+back\s+to\s+v\d+\b/i,
  /\b(?:load|restore)\s+v\d+\b/i,
]
const EN_NEGATED = /\b(?:don['’]?t|do\s+not|never|not)\b/i

/** Artist 채팅에서 이전 스타일 · 버전으로 돌아가자는 말인가. styleNames = 스타일 이름(카탈로그 · 버전) — "실사로 돌아가고 싶어". */
export function styleReturnRequest(text: string, styleNames: readonly string[] = []): boolean {
  const said = text.trim()
  if (!said) return false
  const lower = said.toLowerCase()
  const compact = lower.replace(/\s+/g, '')
  if (!KO_NEGATED.test(compact)) {
    if (KO_PREV_STYLE.test(lower) && (KO_BACK.test(compact) || KO_TO_END.test(compact))) return true
    const names = styleNames.map((name) => name.toLowerCase().replace(/\s+/g, '')).filter((name) => name.length > 0)
    for (const name of names) {
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      if (new RegExp(`${escaped}(?:스타일|그림체|화풍)?(?:으로|로)(?:다시)?(?:돌아|되돌|돌려)`).test(compact)) return true // i18n-ok: "실사로 돌아가고 싶어"를 알아듣는 정규식
    }
  }
  if (EN_NEGATED.test(said)) return false
  return EN_RULES.some((rule) => rule.test(said))
}

/** 채팅 카드(AY) — 완료 뒤면 까닭만, 이전 버전이 있으면 버전마다 불러오기, 없으면 재생성하기. */
export type StyleReturnCard = { kind: 'completed' } | { kind: 'none' } | { kind: 'versions'; versions: VersionSummary[] }
export function styleReturnCard(input: { versions: readonly VersionSummary[]; completed: boolean }): StyleReturnCard {
  if (input.completed) return { kind: 'completed' }
  const earlier = earlierVersions(input.versions)
  return earlier.length ? { kind: 'versions', versions: earlier } : { kind: 'none' }
}
