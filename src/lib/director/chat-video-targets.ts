// Director 채팅의 영상 부탁이 사용자가 분명히 말한 샷만 겨누는가(오너 2026-11-14 9번 "루미에게 부탁하면 바로 실행" — 확인 카드가 없다).
//   영상은 Take 를 써서 잘못 읽으면 되돌릴 수 없다. 원칙(재검토 b 보통 A, 리드): 바로 만드는 것은 아주 분명한 두 꼴뿐이다.
//   (1) 샷 번호(@멘션)만 있고 빼기 · 부정 · 범위 · 수량 말이 없음 → 그 번호. (2) 생성 말과 붙은 묶음 말만 있고 그런 말이 없음 → 그 묶음.
//   두 꼴 모두 모델이 영상으로 고른 샷 밖은 만들지 않는다(사용자 말 · 모델 부탁 어느 쪽보다도 많이 만들지 않는다).
//   그 밖이면 만들지 않고 화면이 센 목록(모델이 고른 샷 ∩ 말한 번호 · 묶음, 뺀 것 제외)으로 되묻는다 — "응"이면 그 목록 그대로 만든다.
//   만들지 말라는 말뿐이면 만들지 않는다. 순수 함수 — 약속: tests/director/video-request-guard.test.ts · tests/director/lumi-chat-runs.test.ts
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
/** 생성을 말리거나 미루는 말 — 그 절의 번호 · 묶음은 대상이 아니다. */
const STOP = /(만들지\s*(?:는|도)?\s*(?:마|말|않아도)|생성하지\s*(?:는|도)?\s*(?:마|말)|하지\s*(?:는|도)?\s*(?:마|말)|안\s*만들|만들\s*필요\s*없|나중에|이따가|\b(?:don'?t|do\s+not|never|no\s+need\s+to)\s+(?:make|create|generate|render|remake|do)\b|\bhold\s+off\b|\blater\b|\bnot\s+now\b)/i // i18n-ok: 사용자 말을 읽는 낱말 목록 자체
/** 바로 만들지 않을 말 — 빼기 · 부정 · 미루기 · 묻기 · 범위(씬 · 그중) · 수량. 하나라도 있으면 목록으로 되묻는다. */
const UNCLEAR = new RegExp([
  '빼고', '말고', '제외', '만들지', String.raw`하지\s*(?:는|도)?\s*(?:마|말)`, String.raw`안\s*만들`, '나중에', '이따가', '물어', '묻고', // i18n-ok: 사용자 말을 읽는 낱말 목록 자체
  '씬', '장면', '중에', '하나', String.raw`한\s*개`, String.raw`(?:두|세|네)\s*(?:개|편|가지|장)`, '(?<![가-힣])둘', '몇', '일부', '(?<![가-힣])반(?![가-힣])', // i18n-ok: 사용자 말을 읽는 낱말 목록 자체
  String.raw`\bexcept\b`, String.raw`\bexcluding\b`, String.raw`\bwithout\b`, String.raw`\bnot\b`, String.raw`\bdon'?t\b`, String.raw`\bdo\s+not\b`, String.raw`\bnever\b`,
  String.raw`\bhold\s+off\b`, String.raw`\blater\b`, String.raw`\bask\b`, String.raw`\bskip\b`, String.raw`\bscenes?\b`, String.raw`\bof\s+the\b`,
  String.raw`\b(?:one|two|three|four|five|some|few|couple|half)\b`,
].join('|'), 'i')
/** 생성 말 · 영상 말 — 묶음 말은 생성 말과 같은 절에 있을 때만 받는다. 번호 꼴은 둘 다 있어야 분명하다. */
const MAKE = /(만들|생성|뽑|돌려|\b(?:make|makes|making|create|generate|render|remake|redo)\b)/i // i18n-ok: 사용자 말을 읽는 낱말 목록 자체
const VIDEO = /(영상|비디오|\bvideos?\b)/i // i18n-ok: 사용자 말을 읽는 낱말 목록 자체
const EXCLUDE_AFTER_GROUP = /^\s*(?:은|는|을|를)?\s*(?:말고|빼고|제외)/ // i18n-ok: 사용자 말을 읽는 낱말 목록 자체
const EXCLUDE_BEFORE_GROUP = /\b(?:except|excluding|without|not)\s+(?:for\s+)?(?:the\s+)?$/i
type Group = 'all' | 'failed' | 'imageReady' | 'selected'
const GROUPS: Record<Group, RegExp[]> = {
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

/** 말에 나온 샷 번호 — "샷 3" · "Shot 3" · "@Real Shot 3" · "3번 샷", 목록 · 구간 포함. ordinals = "세 번째 샷" · "third shot". */
export function mentionedShotNumbers(text: string): { numbers: Set<number>; ordinals: Set<number> } {
  const numbers = new Set<number>()
  const ordinals = new Set<number>()
  for (const match of text.matchAll(SHOT_LIST)) expandNumbers(match[1], numbers)
  for (const match of text.matchAll(NUMBERED_SHOT)) numbers.add(Number(match[1]))
  for (const match of text.matchAll(KO_ORDINAL_SHOT)) ordinals.add(/^\d+$/.test(match[1]) ? Number(match[1]) : KO_ORDINALS.indexOf(match[1]) + 1)
  for (const match of text.matchAll(EN_ORDINAL_SHOT)) ordinals.add(EN_ORDINALS.indexOf(match[1].toLowerCase()) + 1)
  return { numbers, ordinals }
}

/** 절 — 문장 부호(번호 목록 안의 쉼표는 빼고) · 접속 말 · "말고 · 빼고" 뒤에서 자른다. */
function clausesOf(text: string): string[] {
  return text
    .replace(/(말고|빼고|제외하고)/g, '$1\n') // i18n-ok: 사용자 말을 읽는 낱말 목록 자체
    .split(/[.;!?\n]+|,(?!\s*\d)|\s(?:그리고|하지만|근데|그런데|but|then)\s/i) // i18n-ok: 사용자 말을 읽는 낱말 목록 자체
    .map((clause) => clause.trim())
    .filter(Boolean)
}

/** 절의 묶음 말 — 뒤에 "말고 · 빼고"가 붙거나 앞에 "except · not"이 붙으면 뺀 묶음, 아니면 생성 말과 같은 절일 때만 부탁한 묶음. */
function groupsOf(clause: string): { wanted: Set<Group>; excluded: Set<Group> } {
  const wanted = new Set<Group>()
  const excluded = new Set<Group>()
  for (const [name, patterns] of Object.entries(GROUPS) as Array<[Group, RegExp[]]>) {
    for (const pattern of patterns) {
      const match = pattern.exec(clause)
      if (!match) continue
      if (EXCLUDE_AFTER_GROUP.test(clause.slice(match.index + match[0].length)) || EXCLUDE_BEFORE_GROUP.test(clause.slice(0, match.index))) excluded.add(name)
      else if (MAKE.test(clause)) wanted.add(name)
    }
  }
  return { wanted, excluded }
}

export type VideoGrounding =
  /** 아주 분명한 꼴 — 이 샷들만 바로 만든다(캔버스 순서). 빈 목록이면 "지금 그런 샷이 없어요". */
  | { kind: 'run'; shotIds: string[] }
  /** 분명하지 않다 — 이 목록으로 되묻고 "응"이면 그대로 만든다(캔버스 순서, 비지 않음). */
  | { kind: 'confirm'; shotIds: string[] }
  /** 목록을 셀 수 없다 — 만들지 않고 번호로 묻는다. */
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
  const named = new Set<number>()
  const ordinal = new Set<number>()
  const excluded = new Set<number>()
  const groups = new Set<Group>()
  const excludedGroups = new Set<Group>()
  let stopped = false
  let asked = false
  for (const clause of clausesOf(text)) {
    const mentioned = mentionedShotNumbers(clause)
    if (STOP.test(clause)) {
      stopped = true
      for (const n of [...mentioned.numbers, ...mentioned.ordinals]) excluded.add(n)
      continue
    }
    if (MAKE.test(clause) || VIDEO.test(clause)) asked = true
    for (const n of mentioned.numbers) named.add(n)
    for (const n of mentioned.ordinals) ordinal.add(n)
    for (const match of clause.matchAll(EXCLUDED_BEFORE)) expandNumbers(match[1], excluded)
    for (const match of clause.matchAll(EXCLUDED_AFTER)) expandNumbers(match[1], excluded)
    const found = groupsOf(clause)
    for (const group of found.wanted) groups.add(group)
    for (const group of found.excluded) excludedGroups.add(group)
  }
  if (stopped && !asked) return { kind: 'none' }
  for (const n of excluded) {
    named.delete(n)
    ordinal.delete(n)
  }

  // 화면이 센 묶음 — 말한 번호 · 몇 번째 · 부탁한 묶음(없으면 제한 없음)과 뺀 것.
  const inGroup = (shot: ChatShotRef, group: Group) =>
    group === 'all' ? true : group === 'failed' ? shot.videoFailed : group === 'imageReady' ? shot.imageReady : selected.includes(shot.nodeId)
  const said = named.size > 0 || ordinal.size > 0 || groups.size > 0
  const allowed = new Set<string>()
  const removed = new Set<string>()
  for (const shot of shots) {
    if (shot.shotNo !== null && (named.has(shot.shotNo) || ordinal.has(shot.shotNo))) allowed.add(shot.nodeId)
    if ([...groups].some((group) => inGroup(shot, group))) allowed.add(shot.nodeId)
    if (shot.shotNo !== null && excluded.has(shot.shotNo)) removed.add(shot.nodeId)
    // "전부 말고"는 "전부는 아니고"다 — 모든 샷을 빼지 않는다.
    if ([...excludedGroups].some((group) => group !== 'all' && inGroup(shot, group))) removed.add(shot.nodeId)
  }
  const picks = requested === null ? null : new Set(requested)
  const pick = (id: string) => (picks === null || picks.has(id)) && !removed.has(id)

  const unclear = UNCLEAR.test(text) || ordinal.size > 0 || excluded.size > 0 || excludedGroups.size > 0
  const clearNumbers = !unclear && named.size > 0 && groups.size === 0 && VIDEO.test(text) && MAKE.test(text)
  const clearGroups = !unclear && named.size === 0 && groups.size > 0
  if (clearNumbers || clearGroups) {
    const screen = eligible.filter((id) => allowed.has(id))
    const shotIds = screen.filter(pick)
    // 모델이 말한 샷 밖만 골랐다 — 무엇을 원하는지 모른다.
    return screen.length > 0 && shotIds.length === 0 ? { kind: 'ask' } : { kind: 'run', shotIds }
  }
  const list = eligible.filter((id) => pick(id) && (!said || allowed.has(id)))
  if (list.length > 0) return { kind: 'confirm', shotIds: list }
  return stopped ? { kind: 'none' } : { kind: 'ask' }
}
