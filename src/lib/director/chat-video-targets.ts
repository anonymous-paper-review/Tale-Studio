// Director 채팅의 영상 부탁이 사용자가 분명히 말한 샷만 겨누는가(오너 2026-11-14 9번 "루미에게 부탁하면 바로 실행" — 확인 카드가 없다).
//   영상은 Take 를 써서 잘못 읽으면 되돌릴 수 없다. 원칙(재검토 b 보통 A → 재재검토 보통 C, 리드): 바로 만드는 것은 허락하는 꼴 하나뿐이다 —
//   샷 번호(@멘션) 또는 묶음 말을 지운 나머지가 시키는 말("영상 (다시) 만들어 줘" · "make the video for … please")뿐이고 물음표가 없을 때.
//   막는 말 목록에 기대지 않는다(목록에 없는 부정 · 질문이 바로 시작됐다).
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

/** 숫자 하나 — 바로 뒤에 단위(초 · s · sec · % · 배 · x · fps · 분)가 붙으면 샷 번호가 아니다("샷 3, 5초짜리로"의 5). */
const UNIT = String.raw`(?:초|s\b|secs?\b|seconds?\b|%|배|x\b|fps\b|분|mins?\b|minutes?\b)` // i18n-ok: 사용자 말을 읽는 낱말 목록 자체
const NUM = String.raw`\d+(?!\d)(?!\s*${UNIT})`
const NUMBER_LIST = String.raw`${NUM}(?:\s*(?:[·,、&~\-–]|to|and|or|와|과|및)\s*${NUM})*` // i18n-ok: 사용자 말을 읽는 낱말 목록 자체
/** "샷 3" · "Shot 3" · "@Real Shot 3" — 낱말 가운데("Screenshots 2" · "스크린샷 2")는 샷이 아니다. */
const SHOT_LIST = new RegExp(String.raw`(?<![A-Za-z가-힣])(?:샷|shots?)\s*#?\s*(${NUMBER_LIST})`, 'gi') // i18n-ok: 사용자 말을 읽는 낱말 목록 자체
const NUMBERED_SHOT = new RegExp(String.raw`(${NUM})\s*번\s*샷`, 'g') // i18n-ok: 사용자 말을 읽는 낱말 목록 자체
/** 바로 앞 번호를 빼는 말("2 빼고" · "샷 4 말고") · 바로 뒤 번호를 빼는 말("except shot 2" · "not shot 4"). */
const EXCLUDED_BEFORE = new RegExp(String.raw`(${NUMBER_LIST})\s*(?:번)?\s*(?:샷)?\s*(?:은|는|을|를|이|가)?\s*(?:영상\s*(?:은|는)?\s*)?(?:말고|빼고|제외|그대로\s*두|됐고|됐어|필요\s*없)`, 'g') // i18n-ok: 사용자 말을 읽는 낱말 목록 자체
const EXCLUDED_AFTER = new RegExp(String.raw`\b(?:except|excluding|without|not|skip|skipping|leave|don'?t\s+bother\s+with|no\s+videos?\s+for)\s+(?:for\s+)?(?:the\s+)?(?:shots?\s*)?#?\s*(${NUMBER_LIST})`, 'gi')
/** 생성을 말리거나 미루는 말 — 그 절의 번호 · 묶음은 대상이 아니다. */
const STOP = /(만들지\s*(?:는|도)?\s*(?:마|말|않아도|않을래|않을게|않겠)|건\s*아니|만들진\s*(?:마|말)|(?:만들면|하면)\s*안\s*(?:돼|되)|싫어|생성하지\s*(?:는|도)?\s*(?:마|말)|하지\s*(?:는|도)?\s*(?:마|말)|안\s*만들|만들\s*필요\s*없|나중에|이따가|\b(?:don'?t|do\s+not|never|no\s+need\s+to)\s+(?:make|create|generate|render|remake|do)\b|\b(?:stop|cancel)\b|\bhold\s+off\b|\blater\b|\bnot\s+now\b)/i // i18n-ok: 사용자 말을 읽는 낱말 목록 자체
/** 범위 · 수량 말(씬 · 그중 · 하나 · two of …) — 모델이 샷 칸을 비웠으면(남은 전부) 이 말이 가리키는 샷을 화면이 몰라 번호로 묻는다. */
const SCOPE = /(씬|장면|중에|하나|한\s*개|(?:두|세|네)\s*(?:개|편|가지|장)|(?<![가-힣])둘|몇|일부|\bscenes?\b|\bof\s+the\b|\b(?:one|two|three|four|five|some|few|couple|half)\b)/i // i18n-ok: 사용자 말을 읽는 낱말 목록 자체
/** 시키는 말 — 샷 번호 · 묶음 말을 지운 나머지가 이 동사 하나와 아래 조각 · 문장 부호뿐이면 시키는 꼴이다. */
const COMMAND_VERB = /(?:만들어|생성해|뽑아)\s*(?:줘|주세요|줄래)?|\b(?:make|remake)\b/gi // i18n-ok: 사용자 말을 읽는 낱말 목록 자체
const COMMAND_FILLER = [
  /(?:영상|비디오)\s*(?:을|를)?/g, // i18n-ok: 사용자 말을 읽는 낱말 목록 자체
  /다시/g, // i18n-ok: 사용자 말을 읽는 낱말 목록 자체
  /(?<![가-힣])(?:의|은|는|도|만|좀)(?![가-힣])/g, // i18n-ok: 사용자 말을 읽는 낱말 목록 자체
  /\b(?:the|a|an|videos?|for|please|again)\b/gi,
  /'s\b/gi,
  /@[A-Za-z가-힣]*/g, // i18n-ok: 사용자 말을 읽는 낱말 목록 자체
]
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
  failed: [/실패한\s*(?:샷|영상)/, /\bfailed\s+(?:shots?|videos?|ones?)\b/i], // i18n-ok: 사용자 말을 읽는 낱말 목록 자체
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

/** 말에 나온 샷 번호 — "샷 3" · "Shot 3" · "@Real Shot 3" · "3번 샷", 목록 · 구간 포함(단위가 붙은 숫자 · 낱말 가운데는 빼고). */
export function mentionedShotNumbers(text: string): Set<number> {
  const numbers = new Set<number>()
  for (const match of text.matchAll(SHOT_LIST)) expandNumbers(match[1], numbers)
  for (const match of text.matchAll(NUMBERED_SHOT)) numbers.add(Number(match[1]))
  return numbers
}

/** Lumi 가 번호를 물은 바로 다음 말 — 번호만으로 된 대답("3번" · "3번이랑 4번" · "1, 2" · "샷 3")이면 그 번호들, 아니면 null. */
const NUMBER_ANSWER = new RegExp(String.raw`^(?:(?:샷|shots?)\s*)?${NUM}\s*(?:번)?(?:\s*(?:[·,、&~\-–]|to|and|or|와|과|및|랑|이랑|하고)\s*(?:(?:샷|shots?)\s*)?${NUM}\s*(?:번)?)*\s*(?:샷|shots?)?\s*(?:영상|videos?)?\s*(?:을|를)?\s*(?:만들어\s*(?:줘|주세요)?|해\s*(?:줘|주세요)|please)?$`, 'i') // i18n-ok: 사용자 말을 읽는 낱말 목록 자체
export function answeredShotNumbers(text: string): Set<number> | null {
  // "2?"는 대답이 아니라 되묻는 말이다(물음표 규칙 — 재재검토 b).
  if (/[?？]/.test(text)) return null
  const said = text.trim().replace(/[.!]+$/, '').trim()
  if (!NUMBER_ANSWER.test(said)) return null
  const numbers = new Set<number>()
  expandNumbers(said, numbers)
  return numbers.size > 0 ? numbers : null
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

/** 허락하는 꼴 — 물음표가 없고, 샷 번호 · 묶음 말을 지운 나머지가 시키는 말 하나와 조각 · 문장 부호뿐이다. */
function plainCommand(text: string): boolean {
  if (/[?？]/.test(text)) return false
  let rest = text.replace(SHOT_LIST, ' ').replace(NUMBERED_SHOT, ' ')
  for (const patterns of Object.values(GROUPS)) {
    for (const pattern of patterns) rest = rest.replace(new RegExp(pattern.source, pattern.flags.replace('g', '') + 'g'), ' ')
  }
  if (!new RegExp(COMMAND_VERB.source, 'i').test(rest)) return false
  rest = rest.replace(COMMAND_VERB, ' ')
  for (const filler of COMMAND_FILLER) rest = rest.replace(filler, ' ')
  return rest.replace(/[\s.!,·、]+/g, '') === ''
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
  const excluded = new Set<number>()
  const groups = new Set<Group>()
  const excludedGroups = new Set<Group>()
  let stopped = false
  let asked = false
  for (const clause of clausesOf(text)) {
    const mentioned = mentionedShotNumbers(clause)
    if (STOP.test(clause)) {
      stopped = true
      for (const n of mentioned) excluded.add(n)
      // "실패한 샷은 만들지 마"처럼 만들지 말라는 절의 묶음도 뺀 것이다("전부"는 빼지 않는다 — "전부는 말고").
      const found = groupsOf(clause)
      for (const group of [...found.wanted, ...found.excluded]) if (group !== 'all') excludedGroups.add(group)
      continue
    }
    if (MAKE.test(clause) || VIDEO.test(clause)) asked = true
    for (const n of mentioned) named.add(n)
    for (const match of clause.matchAll(EXCLUDED_BEFORE)) expandNumbers(match[1], excluded)
    for (const match of clause.matchAll(EXCLUDED_AFTER)) expandNumbers(match[1], excluded)
    const found = groupsOf(clause)
    for (const group of found.wanted) groups.add(group)
    for (const group of found.excluded) excludedGroups.add(group)
  }
  if (stopped && !asked) return { kind: 'none' }
  for (const n of excluded) named.delete(n)

  // 화면이 센 묶음 — 말한 번호 · 부탁한 묶음(없으면 제한 없음)과 뺀 것.
  const inGroup = (shot: ChatShotRef, group: Group) =>
    group === 'all' ? true : group === 'failed' ? shot.videoFailed : group === 'imageReady' ? shot.imageReady : selected.includes(shot.nodeId)
  const said = named.size > 0 || groups.size > 0
  const allowed = new Set<string>()
  const removed = new Set<string>()
  for (const shot of shots) {
    if (shot.shotNo !== null && named.has(shot.shotNo)) allowed.add(shot.nodeId)
    if ([...groups].some((group) => inGroup(shot, group))) allowed.add(shot.nodeId)
    if (shot.shotNo !== null && excluded.has(shot.shotNo)) removed.add(shot.nodeId)
    // "전부 말고"는 "전부는 아니고"다 — 모든 샷을 빼지 않는다.
    if ([...excludedGroups].some((group) => group !== 'all' && inGroup(shot, group))) removed.add(shot.nodeId)
  }
  const picks = requested === null ? null : new Set(requested)
  const pick = (id: string) => (picks === null || picks.has(id)) && !removed.has(id)

  const plain = plainCommand(text) && excluded.size === 0 && excludedGroups.size === 0
  const clearNumbers = plain && named.size > 0 && groups.size === 0 && VIDEO.test(text)
  // 묶음 꼴은 영상 말이 있어야 한다 — "실패한 샷 다시"만은 영상이 실패한 샷이라 영상 말 없이도 분명하다.
  const clearGroups = plain && named.size === 0 && groups.size > 0 && (VIDEO.test(text) || [...groups].every((group) => group === 'failed'))
  if (clearNumbers || clearGroups) {
    const screen = eligible.filter((id) => allowed.has(id))
    const shotIds = screen.filter(pick)
    // 모델이 말한 샷 밖만 골랐다 — 무엇을 원하는지 모른다.
    return screen.length > 0 && shotIds.length === 0 ? { kind: 'ask' } : { kind: 'run', shotIds }
  }
  // 범위 · 수량 말이 있는데 모델이 칸을 비웠다 — 전부를 목록으로 내밀지 않고 번호로 묻는다.
  if (picks === null && SCOPE.test(text)) return { kind: 'ask' }
  const list = eligible.filter((id) => pick(id) && (!said || allowed.has(id)))
  if (list.length > 0) return { kind: 'confirm', shotIds: list }
  return stopped ? { kind: 'none' } : { kind: 'ask' }
}
