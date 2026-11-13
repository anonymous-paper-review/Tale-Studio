// Director 채팅의 영상 부탁이 사용자가 분명히 말한 샷만 겨누는가(오너 2026-11-14 9번 "루미에게 부탁하면 바로 실행" — 확인 카드가 없다).
//   영상은 Take 를 써서 잘못 읽으면 되돌릴 수 없다. 원칙: 모호하면 만들지 않고 번호를 묻는다(묻기는 공짜 — 검토 b 보통 2).
//   (a) 말에 샷 번호(@멘션 · "세 번째 샷" 포함)가 있으면 대상은 그 번호뿐 — "말고 · 빼고 · 제외 · except · not"으로 뺀 번호와
//       "만들지 마"라고 한 절의 번호는 뺀다. 모델이 그 밖의 샷을 담으면 만들지 않고 묻는다.
//   (b) 번호가 없을 때만 생성 말과 붙은 묶음 말을 받는다 — 영상 다 만들어 · 남은 샷 · 실패한 샷 · 이미지 나온 샷 · 고른 샷(그 묶음 안에서만).
//   (c) 만들지 말라는 부탁이면 만들지 않는다. (d) 모델이 고른 샷이 (a) · (b) 밖이면 묻는다. (e) 모델이 고른 샷 목록이 비었으면 묻는다.
//   순수 함수 — 약속: tests/director/video-request-guard.test.ts · tests/director/lumi-chat-runs.test.ts
export interface ChatShotRef {
  nodeId: string
  /** 보드에 보이는 샷 번호(전체 번호). 보드에 없는 샷은 null. */
  shotNo: number | null
  imageReady: boolean
  videoFailed: boolean
}

const NUMBER_LIST = String.raw`\d+(?:\s*(?:[·,、&~\-–]|to|and|or|와|과|및)\s*\d+)*` // i18n-ok: 사용자 말을 읽는 낱말 목록 자체
const SHOT_LIST = new RegExp(String.raw`(?:샷|shots?)\s*#?\s*(${NUMBER_LIST})`, 'gi') // i18n-ok: 사용자 말을 읽는 낱말 목록 자체
const NUMBERED_SHOT = /(\d+)\s*번\s*샷/g // i18n-ok: 사용자 말을 읽는 낱말 목록 자체
const KO_ORDINALS = ['첫', '두', '세', '네', '다섯', '여섯', '일곱', '여덟', '아홉', '열'] // i18n-ok: 사용자 말을 읽는 낱말 목록 자체
const EN_ORDINALS = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth']
const KO_ORDINAL_SHOT = new RegExp(String.raw`(${KO_ORDINALS.join('|')}|\d+)\s*번째\s*샷`, 'g') // i18n-ok: 사용자 말을 읽는 낱말 목록 자체
const EN_ORDINAL_SHOT = new RegExp(String.raw`\b(${EN_ORDINALS.join('|')})\s+shot\b`, 'gi')
/** 바로 앞 번호를 빼는 말("2 빼고" · "샷 4 말고") · 바로 뒤 번호를 빼는 말("except shot 2" · "not shot 4"). */
const EXCLUDED_BEFORE = new RegExp(String.raw`(${NUMBER_LIST})\s*(?:번)?\s*(?:샷)?\s*(?:은|는|을|를|이|가)?\s*(?:말고|빼고|제외)`, 'g') // i18n-ok: 사용자 말을 읽는 낱말 목록 자체
const EXCLUDED_AFTER = new RegExp(String.raw`\b(?:except|excluding|without|not|skip|skipping)\s+(?:for\s+)?(?:the\s+)?(?:shots?\s*)?#?\s*(${NUMBER_LIST})`, 'gi')
/** 생성을 말리는 말 — 그 절의 번호 · 묶음은 대상이 아니다. */
const STOP = /(만들지\s*(?:마|말|않아도)|생성하지\s*(?:마|말)|하지\s*(?:마|말)|안\s*만들|만들\s*필요\s*없|\b(?:don'?t|do\s+not|never|no\s+need\s+to)\s+(?:make|create|generate|render|remake|do)\b)/i // i18n-ok: 사용자 말을 읽는 낱말 목록 자체
/** 생성 말 — 묶음 말은 이 말과 같은 절에 있을 때만 받는다. */
const MAKE = /(만들|생성|뽑|돌려|\b(?:make|makes|making|create|generate|render|remake|redo)\b)/i // i18n-ok: 사용자 말을 읽는 낱말 목록 자체
const EXCLUDE_AFTER_GROUP = /^\s*(?:은|는|을|를)?\s*(?:말고|빼고|제외)/ // i18n-ok: 사용자 말을 읽는 낱말 목록 자체
const GROUPS: Record<'all' | 'failed' | 'imageReady' | 'selected', RegExp[]> = {
  all: [
    /(영상|비디오)\s*(?:을|를)?\s*(?:다|전부|모두)\s*(?=만들|생성|뽑|돌려)/, // i18n-ok: 사용자 말을 읽는 낱말 목록 자체
    /(?<![가-힣])(?:다|전부|모두|전체)\s*(?:영상|비디오)/, // i18n-ok: 사용자 말을 읽는 낱말 목록 자체
    /(?<![가-힣])(?:모든|전체|남은|나머지)\s*(?:샷|영상)/, // i18n-ok: 사용자 말을 읽는 낱말 목록 자체
    /\ball\s+(?:the\s+)?(?:remaining\s+)?videos\b/i,
    /\b(?:all|every)\s+(?:the\s+)?(?:remaining\s+)?shots?\b/i,
    /\b(?:remaining|rest\s+of\s+the)\s+(?:shots|videos)\b/i,
  ],
  failed: [/실패한\s*(?:샷|영상)/, /\bfailed\s+(?:shots?|videos?)\b/i], // i18n-ok: 사용자 말을 읽는 낱말 목록 자체
  imageReady: [
    /이미지\s*(?:가|이)?\s*(?:나온|있는|된|완료된|다\s*된)\s*샷/, // i18n-ok: 사용자 말을 읽는 낱말 목록 자체
    /\bshots?\s+with\s+(?:an?\s+)?images?\b/i,
    /\bshots?\s+whose\s+images?\s+(?:are|is)\s+(?:ready|done)\b/i,
  ],
  selected: [/(?:고른|선택한|선택된)\s*샷|(?<![가-힣])이\s*샷/, /\b(?:selected|chosen|picked)\s+shots?\b|\bthis\s+shot\b/i], // i18n-ok: 사용자 말을 읽는 낱말 목록 자체
}

/** 목록(1·2 · 1, 2 · 1과 2)과 구간(1~3 · 1-3 · 1 to 3)을 편다. */
function expandNumbers(list: string, into: Set<number>): void {
  const tokens = list.match(/\d+|~|-|–|\bto\b/gi) ?? []
  let prev: number | null = null
  let range = false
  for (const token of tokens) {
    if (/^\d+$/.test(token)) {
      const n = Number(token)
      if (range && prev !== null && n >= prev && n - prev <= 200) for (let i = prev; i <= n; i++) into.add(i)
      else into.add(n)
      prev = n
      range = false
    } else {
      range = true
    }
  }
}

/** 말에 나온 샷 번호 — "샷 3" · "Shot 3" · "@Real Shot 3" · "3번 샷" · "세 번째 샷" · "third shot", 목록 · 구간 포함. */
export function mentionedShotNumbers(text: string): Set<number> {
  const out = new Set<number>()
  for (const match of text.matchAll(SHOT_LIST)) expandNumbers(match[1], out)
  for (const match of text.matchAll(NUMBERED_SHOT)) out.add(Number(match[1]))
  for (const match of text.matchAll(KO_ORDINAL_SHOT)) out.add(/^\d+$/.test(match[1]) ? Number(match[1]) : KO_ORDINALS.indexOf(match[1]) + 1)
  for (const match of text.matchAll(EN_ORDINAL_SHOT)) out.add(EN_ORDINALS.indexOf(match[1].toLowerCase()) + 1)
  return out
}

/** 절 — 문장 부호(번호 목록 안의 쉼표는 빼고) · 접속 말 · "말고 · 빼고" 뒤에서 자른다. */
function clausesOf(text: string): string[] {
  return text
    .replace(/(말고|빼고|제외하고)/g, '$1\n') // i18n-ok: 사용자 말을 읽는 낱말 목록 자체
    .split(/[.;!?\n]+|,(?!\s*\d)|\s(?:그리고|하지만|근데|그런데|but|then)\s/i) // i18n-ok: 사용자 말을 읽는 낱말 목록 자체
    .map((clause) => clause.trim())
    .filter(Boolean)
}

function groupsOf(clause: string): Set<keyof typeof GROUPS> {
  const out = new Set<keyof typeof GROUPS>()
  if (!MAKE.test(clause)) return out
  for (const [name, patterns] of Object.entries(GROUPS) as Array<[keyof typeof GROUPS, RegExp[]]>) {
    for (const pattern of patterns) {
      const match = pattern.exec(clause)
      if (match && !EXCLUDE_AFTER_GROUP.test(clause.slice(match.index + match[0].length))) out.add(name)
    }
  }
  return out
}

export type VideoGrounding =
  /** 이 샷들만 만든다(캔버스 순서). 빈 목록이면 "지금 그런 샷이 없어요". */
  | { kind: 'run'; shotIds: string[] }
  /** 대상이 분명하지 않다 — 만들지 않고 번호로 묻는다. */
  | { kind: 'ask' }
  /** 만들지 말라는 말이다 — 만들지 않는다. */
  | { kind: 'none' }

/**
 * requested = 모델이 고른 샷(노드 id) · null 이면 모델이 "남은 샷 전부"로 읽었다. eligible = 지금 영상을 만들 수 있는 샷(캔버스 순서).
 *   돌려주는 샷은 eligible 안에서만 — 이미 영상이 있거나 만드는 중인 샷은 빠진다.
 */
export function groundVideoRequest(input: {
  text: string
  requested: readonly string[] | null
  shots: readonly ChatShotRef[]
  eligible: readonly string[]
  selected: readonly string[]
}): VideoGrounding {
  const { text, requested, shots, eligible, selected } = input
  if (requested !== null && requested.length === 0) return { kind: 'ask' }

  const named = new Set<number>()
  const excluded = new Set<number>()
  const groups = new Set<keyof typeof GROUPS>()
  let stopped = false
  for (const clause of clausesOf(text)) {
    if (STOP.test(clause)) {
      stopped = true
      for (const n of mentionedShotNumbers(clause)) excluded.add(n)
      continue
    }
    for (const n of mentionedShotNumbers(clause)) named.add(n)
    for (const match of clause.matchAll(EXCLUDED_BEFORE)) expandNumbers(match[1], excluded)
    for (const match of clause.matchAll(EXCLUDED_AFTER)) expandNumbers(match[1], excluded)
    for (const group of groupsOf(clause)) groups.add(group)
  }
  for (const n of excluded) named.delete(n)
  if (named.size === 0 && groups.size === 0) return stopped ? { kind: 'none' } : { kind: 'ask' }

  const allowed = new Set<string>()
  let everyRemaining = false
  if (named.size > 0) {
    for (const shot of shots) if (shot.shotNo !== null && named.has(shot.shotNo)) allowed.add(shot.nodeId)
    // 모델이 "남은 샷 전부"로 읽었다 — 말한 번호보다 넓다(d).
    if (requested === null) return { kind: 'ask' }
  } else {
    everyRemaining = groups.has('all')
    for (const shot of shots) {
      if (everyRemaining) allowed.add(shot.nodeId)
      if (groups.has('failed') && shot.videoFailed) allowed.add(shot.nodeId)
      if (groups.has('imageReady') && shot.imageReady) allowed.add(shot.nodeId)
    }
    if (groups.has('selected')) for (const id of selected) allowed.add(id)
    if (requested === null) return everyRemaining ? { kind: 'run', shotIds: [...eligible] } : { kind: 'ask' }
  }
  if (requested.some((id) => !allowed.has(id))) return { kind: 'ask' }
  const wanted = new Set(requested)
  return { kind: 'run', shotIds: eligible.filter((id) => wanted.has(id)) }
}
