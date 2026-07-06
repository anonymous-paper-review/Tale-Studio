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

// scene 자유 텍스트/배열 필드 (addScene 와 updateScene.patch 공용)
export function pickSceneFields(src: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const k of ['location', 'timeOfDay', 'mood', 'narrativeSummary', 'originalTextQuote']) {
    const v = asString(src[k])
    if (v !== undefined) out[k] = v
  }
  const cp = asStringArray(src.charactersPresent)
  if (cp) out.charactersPresent = cp
  const dur = asInt(src.estimatedDurationSeconds, 1, 600)
  if (dur !== undefined) out.estimatedDurationSeconds = dur
  return out
}

function pickDialogueLines(src: unknown): Array<Pick<DialogueLine, 'characterId' | 'text'>> | undefined {
  if (!Array.isArray(src)) return undefined
  const entries = src
    .filter(
      (line): line is { characterId: string; text: string } =>
        line !== null &&
        typeof line === 'object' &&
        typeof (line as { characterId?: unknown }).characterId === 'string' &&
        typeof (line as { text?: unknown }).text === 'string',
    )
    .map((line) => ({ characterId: line.characterId, text: line.text }))
  // 전량 불량 배열이 빈 patch 로 통과하면 "대사 전체 삭제"로 위장한다 —
  // 명시적 [] 만 빈 배열로 인정하고, 불량 엔트리만 있던 배열은 필드 자체를 drop.
  if (src.length > 0 && entries.length === 0) return undefined
  return entries
}

// shot 필드 (addShot 와 updateShot.patch 공용 — sceneId/tempId 제외)
export function pickShotFields(src: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (typeof src.shotType === 'string' && SHOT_TYPES.has(src.shotType))
    out.shotType = src.shotType
  const ad = asString(src.actionDescription)
  if (ad !== undefined) out.actionDescription = ad
  const ch = asStringArray(src.characters)
  if (ch) out.characters = ch
  const dur = asInt(src.durationSeconds, 1, 60)
  if (dur !== undefined) out.durationSeconds = dur
  const dialogueLines = pickDialogueLines(src.dialogueLines)
  if (dialogueLines !== undefined) out.dialogueLines = dialogueLines
  return out
}

export function validateWriterUpdates(raw: unknown[]): unknown[] {
  const out: unknown[] = []
  for (const u of raw) {
    const rec = asObj(u)
    if (!rec || typeof rec.type !== 'string' || !VALID_UPDATE_TYPES.has(rec.type))
      continue

    switch (rec.type) {
      case 'addScene': {
        out.push({
          type: 'addScene',
          ...pickSceneFields(rec),
          ...(asString(rec.tempId) ? { tempId: rec.tempId } : {}),
        })
        break
      }
      case 'addShot': {
        if (!asString(rec.sceneId)) break
        out.push({
          type: 'addShot',
          sceneId: rec.sceneId,
          ...pickShotFields(rec),
          ...(asString(rec.tempId) ? { tempId: rec.tempId } : {}),
        })
        break
      }
      case 'updateScene': {
        if (!asString(rec.id)) break
        const patch = pickSceneFields(asObj(rec.patch) ?? {})
        if (Object.keys(patch).length > 0)
          out.push({ type: 'updateScene', id: rec.id, patch })
        break
      }
      case 'updateShot': {
        if (!asString(rec.id)) break
        const patch = pickShotFields(asObj(rec.patch) ?? {})
        if (Object.keys(patch).length > 0)
          out.push({ type: 'updateShot', id: rec.id, patch })
        break
      }
      case 'deleteShot':
      case 'deleteScene': {
        if (asString(rec.id)) out.push({ type: rec.type, id: rec.id })
        break
      }
    }
  }
  return out
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
