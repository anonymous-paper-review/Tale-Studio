// Writer 채팅 update 화이트리스트 검증 (순수 함수).
// route 는 모델 출력 검증만 하고, 실제 적용은 writer-store 의 기존 CRUD 경로가 담당한다.
import type { LineRef, ScriptLineKind } from '@/lib/script-lines'
import type { DialogueLine } from '@/types'

export const SHOT_TYPES = new Set([
  'ECU',
  'CU',
  'MCU',
  'MS',
  'MFS',
  'FS',
  'WS',
  'EWS',
  'OTS',
  'POV',
  'TRACK',
  '2S',
])

export const VALID_UPDATE_TYPES = new Set([
  'addScene',
  'addShot',
  'updateScene',
  'updateShot',
  'deleteShot',
  'deleteScene',
  'clarify', // #p4-understand B2: 모호 대상 되묻기 (CRUD 아님 — 채팅이 후보 버튼으로 소비)
])

export function asString(x: unknown): string | undefined {
  return typeof x === 'string' && x.trim() ? x : undefined
}

export function asObj(x: unknown): Record<string, unknown> | null {
  return x && typeof x === 'object' ? (x as Record<string, unknown>) : null
}

export function asStringArray(x: unknown): string[] | undefined {
  if (!Array.isArray(x)) return undefined
  const out = x.filter((v): v is string => typeof v === 'string')
  return out.length > 0 ? out : undefined
}

export function asInt(x: unknown, min: number, max: number): number | undefined {
  if (typeof x !== 'number' || !Number.isFinite(x)) return undefined
  return Math.max(min, Math.min(max, Math.round(x)))
}

/** 인물 id 화이트리스트 필터(#F-003 R1). allowed 미지정 = 종전 동작(무필터).
 *  전부 탈락하면 필드 자체를 뺀다 — 씬 상속/빈 기본값 폴백이 받는다. 탈락 id 는 dropped 에 수집. */
function filterCharacterIds(
  ids: string[] | undefined,
  allowed: ReadonlySet<string> | undefined,
  dropped?: string[],
): string[] | undefined {
  if (!ids) return undefined
  if (!allowed) return ids
  const kept = ids.filter((id) => allowed.has(id))
  if (dropped) dropped.push(...ids.filter((id) => !allowed.has(id)))
  return kept.length > 0 ? kept : undefined
}

// scene 자유 텍스트/배열 필드 (addScene 와 updateScene.patch 공용)
export function pickSceneFields(
  src: Record<string, unknown>,
  allowedCharacterIds?: ReadonlySet<string>,
  droppedCharacterIds?: string[],
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const k of ['location', 'timeOfDay', 'mood', 'narrativeSummary', 'originalTextQuote']) {
    const v = asString(src[k])
    if (v !== undefined) out[k] = v
  }
  const cp = filterCharacterIds(
    asStringArray(src.charactersPresent),
    allowedCharacterIds,
    droppedCharacterIds,
  )
  if (cp) out.charactersPresent = cp
  const dur = asInt(src.estimatedDurationSeconds, 1, 600)
  if (dur !== undefined) out.estimatedDurationSeconds = dur
  return out
}

function pickDialogueLines(
  src: unknown,
  allowedCharacterIds?: ReadonlySet<string>,
  droppedCharacterIds?: string[],
): Array<Partial<DialogueLine> & Pick<DialogueLine, 'characterId' | 'text'>> | undefined {
  if (!Array.isArray(src)) return undefined
  const entries = src
    .filter(
      (line): line is Record<string, unknown> & { characterId: string | null; text: string } =>
        line !== null &&
        typeof line === 'object' &&
        ((line as { characterId?: unknown }).characterId === null ||
          typeof (line as { characterId?: unknown }).characterId === 'string') &&
        typeof (line as { text?: unknown }).text === 'string',
    )
    // 화자 화이트리스트(#F-003 R1) — 발명된 화자의 대사는 대사째 드롭(화자만 바꿔치기하면
    //   남의 입에 대사를 넣는다). 명시적 [] 의 "전체 삭제" 의미는 아래 기존 규칙이 보존.
    .filter((line) => {
      // null은 발명된 인물이 아니라 기존 대사 계약의 내레이션(V.O.)이다.
      if (line.characterId === null || !allowedCharacterIds || allowedCharacterIds.has(line.characterId)) return true
      droppedCharacterIds?.push(line.characterId)
      return false
    })
    // emotion·delivery·durationHint는 보존한다 — 여기서 버리면 모델이 재제출해도
    //   대사 수정마다 연기 지시가 유실된다(2026-08-31 실측 — G7 영상 대사 절의 재료다).
    .map((line) => ({
      characterId: line.characterId,
      text: line.text,
      ...(typeof line.emotion === 'string' && line.emotion ? { emotion: line.emotion } : {}),
      ...(typeof line.delivery === 'string' && line.delivery ? { delivery: line.delivery } : {}),
      ...(typeof line.durationHint === 'number' && line.durationHint > 0
        ? { durationHint: line.durationHint }
        : {}),
      // V2 대사의 계획한 시점도 같은 까닭으로 보존한다 — 모르는 칸으로 거절하거나 빼고 저장해 지웠다(2026-11-02).
      ...(typeof line.plannedTiming === 'string' && line.plannedTiming ? { plannedTiming: line.plannedTiming } : {}),
    }))
  // 전량 불량 배열이 빈 patch 로 통과하면 "대사 전체 삭제"로 위장한다 —
  // 명시적 [] 만 빈 배열로 인정하고, 불량 엔트리만 있던 배열은 필드 자체를 drop.
  if (src.length > 0 && entries.length === 0) return undefined
  return entries
}

// shot 필드 (addShot 와 updateShot.patch 공용 — sceneId/tempId 제외)
export function pickShotFields(
  src: Record<string, unknown>,
  allowedCharacterIds?: ReadonlySet<string>,
  droppedCharacterIds?: string[],
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (typeof src.shotType === 'string' && SHOT_TYPES.has(src.shotType))
    out.shotType = src.shotType
  const ad = asString(src.actionDescription)
  if (ad !== undefined) out.actionDescription = ad
  const ch = filterCharacterIds(
    asStringArray(src.characters),
    allowedCharacterIds,
    droppedCharacterIds,
  )
  if (ch) out.characters = ch
  const dur = asInt(src.durationSeconds, 1, 60)
  if (dur !== undefined) out.durationSeconds = dur
  const dialogueLines = pickDialogueLines(src.dialogueLines, allowedCharacterIds, droppedCharacterIds)
  if (dialogueLines !== undefined) out.dialogueLines = dialogueLines
  return out
}

function pickInsertionFields(
  src: Record<string, unknown>,
  beforeKey: string,
  afterKey: string,
): Record<string, string | null> | null {
  const before = src[beforeKey]
  const after = src[afterKey]
  // 잘못되거나 서로 충돌하는 위치를 버리고 맨 뒤 추가로 바꾸지 않는다.
  if (before !== undefined && after !== undefined) return null
  if (before !== undefined) {
    return asString(before) ? { [beforeKey]: (before as string).trim() } : null
  }
  if (after !== undefined) {
    if (after === null) return { [afterKey]: null }
    return asString(after) ? { [afterKey]: (after as string).trim() } : null
  }
  return {}
}

/**
 * allowedCharacterIds(#F-003 R1): DB 정본 인물 id 집합. 주면 charactersPresent/characters/
 *   dialogueLines[].characterId 를 화이트리스트로 거른다 — 모델이 발명한 id(girl/tracker,
 *   실측 dc531572)가 무검증 저장되면 하류 에셋 조인이 전부 끊긴다(architecture §3·§4 위반).
 *   프롬프트("Never invent new IDs")는 보조 방어일 뿐 — 최종 방어는 여기다.
 * droppedCharacterIds: 탈락 id 수집(호출자가 표면화 — 침묵 드롭 금지).
 */
export function validateWriterUpdates(
  raw: unknown[],
  allowedCharacterIds?: ReadonlySet<string>,
  droppedCharacterIds?: string[],
): unknown[] {
  const out: unknown[] = []
  for (const u of raw) {
    const rec = asObj(u)
    if (!rec || typeof rec.type !== 'string' || !VALID_UPDATE_TYPES.has(rec.type))
      continue

    switch (rec.type) {
      case 'addScene': {
        const insertion = pickInsertionFields(rec, 'beforeSceneId', 'afterSceneId')
        if (!insertion) break
        out.push({
          type: 'addScene',
          ...pickSceneFields(rec, allowedCharacterIds, droppedCharacterIds),
          ...insertion,
          ...(asString(rec.tempId) ? { tempId: rec.tempId } : {}),
        })
        break
      }
      case 'addShot': {
        if (!asString(rec.sceneId)) break
        const insertion = pickInsertionFields(rec, 'beforeShotId', 'afterShotId')
        if (!insertion) break
        out.push({
          type: 'addShot',
          sceneId: rec.sceneId,
          ...pickShotFields(rec, allowedCharacterIds, droppedCharacterIds),
          ...insertion,
          ...(asString(rec.tempId) ? { tempId: rec.tempId } : {}),
        })
        break
      }
      case 'updateScene': {
        if (!asString(rec.id)) break
        const patch = pickSceneFields(asObj(rec.patch) ?? {}, allowedCharacterIds, droppedCharacterIds)
        if (Object.keys(patch).length > 0)
          out.push({ type: 'updateScene', id: rec.id, patch })
        break
      }
      case 'updateShot': {
        if (!asString(rec.id)) break
        const patch = pickShotFields(asObj(rec.patch) ?? {}, allowedCharacterIds, droppedCharacterIds)
        if (Object.keys(patch).length > 0)
          out.push({ type: 'updateShot', id: rec.id, patch })
        break
      }
      case 'deleteShot':
      case 'deleteScene': {
        if (asString(rec.id)) out.push({ type: rec.type, id: rec.id })
        break
      }
      case 'clarify': {
        const question = asString(rec.question)
        const candidates = Array.isArray(rec.candidates)
          ? (rec.candidates as unknown[]).filter((c): c is string => typeof c === 'string' && !!c.trim()).slice(0, 4)
          : []
        if (question && candidates.length >= 2) out.push({ type: 'clarify', question, candidates })
        break
      }
    }
  }
  // 되묻기는 응답 전체의 정지 신호다. 모델이 CRUD를 섞어도 질문만 전달한다.
  const clarification = out.find((u) => asObj(u)?.type === 'clarify')
  return clarification ? [clarification] : out
}

/** 서버가 읽은 Artist 배경 한 줄(locations.location_id · name). */
export interface LocationRosterRow {
  location_id: string
  name: string | null
}

const placeKey = (text: string) => text.trim().replace(/\s+/g, ' ').toLowerCase()

/**
 * 채팅이 적은 씬 장소(addScene.location · updateScene.patch.location)를 Artist 배경 id 로 잇는다(W6 오너 2026-11-26).
 *   왜: 채팅 문맥에 배경 목록이 없어 AI 가 배경 이름("천장 형광등")을 장소 칸에 적었고, 씬 장소는 배경 id 로만 이어지므로
 *   러프 배경 글 · 실사 참고 배경 · Director 배경 선이 모두 빠졌다(개발 DB 재현 2026-11-26).
 *   규칙: 배경 id 그대로면 그대로 → id 를 대소문자 · 띄어쓰기만 다르게 적었으면 그 id → 배경 이름과 같으면 그 배경 id.
 *   어느 것도 아니면 새 장소로 보고 적은 글을 그대로 두며 unknownPlaces 에 담는다(호출부가 답 끝에 알린다).
 *   배경 목록을 모르면(undefined — 못 읽음 · 옛 클라) 바꾸지도 알리지도 않는다(지금 그대로). 약속: tests/chat/writer-chat-place.test.ts
 */
export function resolveSceneLocations(
  updates: unknown[],
  locations: readonly LocationRosterRow[] | undefined,
): { updates: unknown[]; unknownPlaces: string[] } {
  if (!locations) return { updates, unknownPlaces: [] }
  const ids = new Set(locations.map((row) => row.location_id).filter(Boolean))
  const byKey = new Map<string, string>()
  for (const row of locations) if (row.location_id && !byKey.has(placeKey(row.location_id))) byKey.set(placeKey(row.location_id), row.location_id)
  for (const row of locations) {
    const name = row.name?.trim()
    if (row.location_id && name && !byKey.has(placeKey(name))) byKey.set(placeKey(name), row.location_id)
  }
  const unknown: string[] = []
  const resolve = (location: string): string => {
    if (ids.has(location)) return location
    const matched = byKey.get(placeKey(location))
    if (matched) return matched
    const place = location.trim()
    if (place && !unknown.includes(place)) unknown.push(place)
    return location
  }
  const out = updates.map((update) => {
    const rec = asObj(update)
    if (!rec) return update
    if (rec.type === 'addScene' && typeof rec.location === 'string') {
      const location = resolve(rec.location)
      return location === rec.location ? update : { ...rec, location }
    }
    const patch = rec.type === 'updateScene' ? asObj(rec.patch) : null
    if (patch && typeof patch.location === 'string') {
      const location = resolve(patch.location)
      return location === patch.location ? update : { ...rec, patch: { ...patch, location } }
    }
    return update
  })
  return { updates: out, unknownPlaces: unknown }
}

export function classifyDialoguePatch(
  current: DialogueLine[],
  next: DialogueLine[],
): 'apply' | 'confirm' {
  return next.length < current.length ? 'confirm' : 'apply'
}

const SCRIPT_LINE_KINDS = new Set<ScriptLineKind>(['sceneHeading', 'action', 'dialogue'])

function inferKindFromRef(ref: string): ScriptLineKind {
  if (ref.endsWith('.heading')) return 'sceneHeading'
  if (/\.dialogue\[\d+\]$/.test(ref)) return 'dialogue'
  return 'action'
}

export function sanitizeLineRefs(raw: unknown): LineRef[] {
  if (!Array.isArray(raw)) return []

  const out: LineRef[] = []
  for (const item of raw) {
    if (out.length >= 200) break
    const rec = asObj(item)
    if (!rec) continue
    // own property 만 신뢰 — __proto__ 상속 프로퍼티 주입 차단.
    const label = Object.hasOwn(rec, 'label') ? rec.label : undefined
    const ref = Object.hasOwn(rec, 'ref') ? rec.ref : undefined
    const rawKind = Object.hasOwn(rec, 'kind') ? rec.kind : undefined
    // 선행 0(L01)·L0 은 정규 라벨이 아니다 — resolveLineRefs 와 동일 규칙.
    if (typeof label !== 'string' || !/^L[1-9]\d*$/.test(label)) continue
    if (typeof ref !== 'string' || !ref.trim()) continue
    const kind =
      typeof rawKind === 'string' && SCRIPT_LINE_KINDS.has(rawKind as ScriptLineKind)
        ? (rawKind as ScriptLineKind)
        : inferKindFromRef(ref)
    out.push({ label, ref, kind })
  }
  return out
}
