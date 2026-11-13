// Director 채팅의 영상 부탁이 사용자가 말한 샷만 겨누는가(오너 2026-11-14 9번 "루미에게 부탁하면 바로 실행" — 확인 카드가 없다).
//   영상은 Take 를 써서 잘못 읽으면 되돌릴 수 없다. 모델이 고른 샷은 사용자 말에 있어야 한다:
//   샷 번호("샷 3" · "Shot 3" · "@Real Shot 3" · "샷 1·2" · "1~3"), 또는 묶음 말 — 남은 전부 · 실패한 · 이미지 나온 · 고른 — 그 묶음 안에서만.
//   벗어나면 만들지 않고 번호로 다시 묻는다. 순수 함수 — 약속: tests/director/lumi-chat-runs.test.ts
export interface ChatShotRef {
  nodeId: string
  /** 보드에 보이는 샷 번호(전체 번호). 보드에 없는 샷은 null. */
  shotNo: number | null
  imageReady: boolean
  videoFailed: boolean
}

const SHOT_LIST = /(?:샷|shots?)\s*#?\s*(\d+(?:\s*(?:[·,、&~\-–]|to|and|와|과|및)\s*\d+)*)/gi // i18n-ok: 사용자 말을 읽는 낱말 목록 자체
const NUMBERED_SHOT = /(\d+)\s*번\s*샷/g // i18n-ok: 사용자 말을 읽는 낱말 목록 자체

/** 말에 나온 샷 번호 — 목록(1·2 · 1, 2 · 1과 2)과 구간(1~3 · 1-3 · 1 to 3)을 편다. */
export function mentionedShotNumbers(text: string): Set<number> {
  const out = new Set<number>()
  for (const match of text.matchAll(SHOT_LIST)) {
    const tokens = match[1].match(/\d+|~|-|–|\bto\b/gi) ?? []
    let prev: number | null = null
    let range = false
    for (const token of tokens) {
      if (/^\d+$/.test(token)) {
        const n = Number(token)
        if (range && prev !== null && n >= prev && n - prev <= 200) for (let i = prev; i <= n; i++) out.add(i)
        else out.add(n)
        prev = n
        range = false
      } else {
        range = true
      }
    }
  }
  for (const match of text.matchAll(NUMBERED_SHOT)) out.add(Number(match[1]))
  return out
}

const ALL = /(전부|모두|모든|전체|남은|나머지|다\s*(?:만들|해|돌려)|\ball\b|\bevery\b|\bremaining\b|\bthe rest\b)/i // i18n-ok: 사용자 말을 읽는 낱말 목록 자체
const FAILED = /(실패|\bfail(?:ed|ures?)\b)/i // i18n-ok: 사용자 말을 읽는 낱말 목록 자체
const IMAGE_READY = /(이미지\s*(?:가|이)?\s*(?:나온|있는|된|완료|다\s*된)|\bimages?\s+(?:are\s+|is\s+)?(?:ready|done)\b|\bwith\s+(?:an?\s+)?images?\b)/i // i18n-ok: 사용자 말을 읽는 낱말 목록 자체
const SELECTED = /(고른|선택(?:한|된)|\bselected\b|\bchosen\b|\bthese\s+shots?\b|\bthis\s+shot\b|이\s*샷)/i // i18n-ok: 사용자 말을 읽는 낱말 목록 자체

export type GroundedVideoRequest = { ok: true; shotIds: string[] } | { ok: false }

/**
 * requested = 모델이 고른 샷(노드 id) · null 이면 "남은 샷 전부". eligible = 지금 영상을 만들 수 있는 샷(완성 · 만드는 중 영상이 없음).
 *   돌려주는 샷은 eligible 안에서만 — 이미 영상이 있거나 만드는 중인 샷은 빠진다.
 */
export function groundVideoRequest(input: {
  text: string
  requested: readonly string[] | null
  shots: readonly ChatShotRef[]
  eligible: readonly string[]
  selected: readonly string[]
}): GroundedVideoRequest {
  const { text, requested, shots, eligible, selected } = input
  const all = ALL.test(text)
  if (requested === null) return all ? { ok: true, shotIds: [...eligible] } : { ok: false }
  if (requested.length === 0) return { ok: false }
  if (!all) {
    const named = mentionedShotNumbers(text)
    const allowed = new Set<string>()
    for (const shot of shots) {
      if (shot.shotNo !== null && named.has(shot.shotNo)) allowed.add(shot.nodeId)
      if (FAILED.test(text) && shot.videoFailed) allowed.add(shot.nodeId)
      if (IMAGE_READY.test(text) && shot.imageReady) allowed.add(shot.nodeId)
    }
    if (SELECTED.test(text)) for (const id of selected) allowed.add(id)
    if (requested.some((id) => !allowed.has(id))) return { ok: false }
  }
  const open = new Set(eligible)
  return { ok: true, shotIds: requested.filter((id, index) => open.has(id) && requested.indexOf(id) === index) }
}
