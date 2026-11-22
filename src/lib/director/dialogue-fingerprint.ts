// 대사 지문(오너 2026-11-22 E3 — 추천대로) — 영상을 만들 때 그 샷의 대사(화자 · 글)를 짧은 지문으로 남기고,
//   "이 Take 를 만든 뒤 대사가 바뀌었나"를 알려 준다. 화면(Camera — fb-camera)과 서버(video-submit)가 같이 쓰는 순수 함수.
//
// 왜: 영상 속 말은 만들 때의 대사 그대로인데 Editor 자막은 지금 대사를 따라간다 — 대사를 고치면 소리와 자막이 어긋난다(방안 D2).
// 지문에 넣는 것: 줄 순서 · 화자(characterId, 없으면 내레이션) · 글(앞뒤 공백 · 띄어쓰기 차이는 무시, 한글은 NFC 로 맞춤).
// 넣지 않는 것: 어조 · 말투(emotion · delivery) — 자막과 소리가 어긋나는 것은 글이나 화자가 바뀔 때다.
// 대사가 없는 샷도 지문이 있다 — 나중에 대사가 생기면 "바뀜"이다.
// 지문은 영상 준비 한 곳(video-submit)이 작업 기록에 남긴다 — 한 Take · 일괄 · 이어서 · 다시 만들기가 같은 자리.

export const DIALOGUE_FINGERPRINT_VERSION = 'd1'

export interface DialogueLineLike {
  text?: string | null
  characterId?: string | null
  /** 지문에 넣지 않는다(어조 · 말투) — shots.dialogue_lines 한 줄을 그대로 넘길 수 있게 받기만 한다. */
  emotion?: string | null
  delivery?: string | null
}

const FINGERPRINT = /^(d\d+):([0-9a-f]{8})$/

/** FNV-1a 32비트 — 짧고 결정적인 지문(보안용 아님). 화면과 서버가 같은 값을 낸다. */
function fnv1a32(text: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

/** 그 샷의 대사(shots.dialogue_lines) → 지문 `d1:xxxxxxxx`. */
export function dialogueFingerprint(lines: readonly DialogueLineLike[] | null | undefined): string {
  const said = (Array.isArray(lines) ? lines : [])
    .map((line) => [
      String(line?.characterId ?? '').trim(),
      String(line?.text ?? '').normalize('NFC').replace(/\s+/g, ' ').trim(),
    ] as const)
    .filter(([, text]) => text.length > 0)
  return `${DIALOGUE_FINGERPRINT_VERSION}:${fnv1a32(JSON.stringify(said))}`
}

export function isDialogueFingerprint(value: unknown): value is string {
  return typeof value === 'string' && FINGERPRINT.test(value)
}

/**
 * 이 Take 를 만든 뒤 대사가 바뀌었나 — true(바뀜) · false(그대로) · 'unknown'(지문 없는 옛 Take · 다시 만드는 중 · 지문 방식이 다른 기록).
 *   근거는 지금 영상을 낸 작업의 지문 하나(Take 목록 made_dialogue_fingerprint → 영상 노드 madeDialogueFingerprint) —
 *   지문은 작업 기록(input_snapshot.dialogue_fingerprint)에만 남는다(리드 2026-11-22: 새 Take 기록에는 넣지 않음).
 */
export function dialogueChangedSince(
  take: { madeDialogueFingerprint?: unknown } | null | undefined,
  currentLines: readonly DialogueLineLike[] | null | undefined,
): boolean | 'unknown' {
  const recorded = isDialogueFingerprint(take?.madeDialogueFingerprint) ? take.madeDialogueFingerprint : null
  if (!recorded) return 'unknown'
  const now = dialogueFingerprint(currentLines)
  if (recorded.split(':')[0] !== now.split(':')[0]) return 'unknown'
  return recorded !== now
}
