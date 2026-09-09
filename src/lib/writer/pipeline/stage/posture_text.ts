// 자세 낱말 읽기(#posture-authority 2026-09-08, 오너 결정: 샷 배치 문장의 자세가 무대 비트보다 우선) — 순수 함수.
//   실측 겨울_8 sh_02_08: 무대 비트는 용족 수장을 '부유'로 적었고 샷 문장은 "crouched on ground with massive dragon
//   wings unfurled wide" — 배치도는 비트를 그려 러프(문장을 따름)와 어긋났다. 여기서 문장의 자세 낱말을 읽는다.
//   두 가지 읽기: 배치 문장(pose)은 첫 절의 **가장 앞** 낱말(주어의 자세가 먼저 온다), 동작 문장(verb)은 **가장 뒤**
//   낱말("rises from lying to standing" → standing)이 끝 자세다.
import type { StagePosture } from '@/lib/writer/types/pipeline'

export interface PostureMatch {
  posture: StagePosture
  /** 문장에서 읽은 낱말 그대로 — 보고 문장에 쓴다 */
  word: string
  index: number
}

interface Rule {
  posture: StagePosture
  re: RegExp
}

// 영어: 낱말 경계로 잡는다("outstanding"의 standing, "situated"의 sit 은 잡지 않는다).
//   -ing 꼴은 명사를 꾸미는 쓰임("falling pressure", "running water", "standing stone")이 잦아, 뒤에 전치사·부사·문장 끝이
//   올 때만 자세로 읽는다(ING_OK). 실측 겨울_8 sh_04_21: "brace against falling pressure" 가 인물의 추락으로 읽혔다.
const ING_OK =
  String.raw`(?=\s+(?:in|into|on|onto|over|above|below|under|up|down|off|out|away|back|backwards?|forwards?|through|past|toward|towards|from|to|at|near|beside|behind|around|across|along|mid-?air|there|here|still|high|higher|low|lower|hard|flat|face|prone|supine|tall|firm|erect|alone|together|guard|watch|cross-legged|half|position|pose|posture|stance|with|without|as|while|and|then|but|before|after|until|so|like|\w+ly)\b|\s*[.,;:!?)]|\s*$)`
const ing = (...words: string[]) => words.map((w) => `${w}\\b${ING_OK}`).join('|')
const rx = (finite: string, ings: string) => new RegExp(String.raw`\b(?:${finite}|${ings})`, 'i')
const EN: Rule[] = [
  { posture: 'lying', re: rx(String.raw`lies\b|lie\b|lay\b|prone\b|supine\b|sprawl(?:ed|s)?\b|collaps(?:es|ed)\b`, ing('lying', 'sprawling', 'collapsing')) },
  { posture: 'crouching', re: rx(String.raw`crouch(?:ed|es)?\b|squat(?:ted|s)?\b|hunker(?:ed|s)?\b`, ing('crouching', 'squatting', 'hunkering')) },
  { posture: 'kneeling', re: rx(String.raw`kneel(?:ed|s)?\b|knelt\b|(?:on|to|onto) one knee\b|(?:on|to|onto) (?:his|her|their) knees\b`, ing('kneeling')) },
  { posture: 'sitting', re: rx(String.raw`sits?\b|sat\b|seated\b`, ing('sitting')) },
  { posture: 'running', re: rx(String.raw`runs?\b|ran\b|sprint(?:s|ed)?\b|dash(?:es|ed)?\b`, ing('running', 'sprinting', 'dashing')) },
  { posture: 'walking', re: rx(String.raw`walk(?:s|ed)?\b|strides?\b|strode\b|stroll(?:s|ed)?\b|step(?:s|ped)?\b|pac(?:es|ed)\b`, ing('walking', 'striding', 'strolling', 'stepping', 'pacing')) },
  {
    posture: 'floating',
    re: rx(
      String.raw`float(?:s|ed)?\b|hover(?:s|ed)?\b|fl(?:y|ies|ew)\b|airborne\b|levitat(?:es|ed)\b|mid-?air\b|in the air\b|into the air\b|soar(?:s|ed)?\b|glid(?:es|ed)\b|falls?\b|fell\b|plummet(?:s|ed)?\b|plung(?:es|ed)\b`,
      ing('floating', 'hovering', 'flying', 'levitating', 'soaring', 'gliding', 'falling', 'plummeting', 'plunging'),
    ),
  },
  { posture: 'standing', re: rx(String.raw`stands?\b|stood\b|upright\b|on (?:his|her|their) feet\b`, ing('standing')) },
]
// 한국어: 어간으로 잡는다(문장이 섞여 오는 경우 — 실측 sh_02_09 "standing, 추락하는 용족 수장을 긴박하게 바라봄").
const KO: Rule[] = [
  { posture: 'lying', re: /누워|누운|누움|눕|엎드|드러누|쓰러/ },
  { posture: 'crouching', re: /웅크|쪼그/ },
  { posture: 'kneeling', re: /무릎\s*(?:을\s*)?꿇|꿇어|꿇은/ },
  { posture: 'sitting', re: /앉/ },
  { posture: 'running', re: /달리|달려|뛰어가|질주/ },
  { posture: 'walking', re: /걸어|걷|걸음|다가가|다가오/ },
  { posture: 'floating', re: /떠\s*있|부유|공중|날아|비행|호버|추락|떨어지/ },
  { posture: 'standing', re: /서\s*있|서서|선\s*채|일어서|기립|버티고\s*서/ },
]

// 배치 문장의 첫 절 경계 — 이 뒤는 시선·타인 묘사("…, looking upward", "… watching the fairy floating")라 주어의 자세가 아니다.
const HEAD_CUT =
  /,|;|\bwhile\b|\bas\b|\bwatch(?:es|ing)?\b|\blook(?:s|ing)?\b|\bgaz(?:es|ing)\b|\bstar(?:es|ing)\b|\bglanc(?:es|ing)\b|\bobserv(?:es|ing)\b|\beye(?:s|ing)\b|\btowards?\b|바라보|보며|쳐다|지켜보|응시/i

function matchesIn(text: string): PostureMatch[] {
  const out: PostureMatch[] = []
  for (const rule of [...EN, ...KO]) {
    const m = rule.re.exec(text)
    if (m) out.push({ posture: rule.posture, word: m[0], index: m.index })
  }
  return out
}

/** 배치 문장(pose)의 자세 — 첫 절에서 가장 앞에 나오는 자세 낱말. 없으면 null(무대 비트의 자세를 쓴다). */
export function postureFromPoseText(text: string | null | undefined): PostureMatch | null {
  if (!text) return null
  const cut = HEAD_CUT.exec(text)
  const head = cut ? text.slice(0, cut.index) : text
  const all = matchesIn(head)
  if (!all.length) return null
  all.sort((a, b) => a.index - b.index)
  return all[0]
}

/** 동작 문장(verb)의 끝 자세 — 문장 전체에서 가장 뒤에 나오는 자세 낱말. 없으면 null. */
export function postureFromMotionText(text: string | null | undefined): PostureMatch | null {
  if (!text) return null
  const all = matchesIn(text)
  if (!all.length) return null
  all.sort((a, b) => b.index - a.index)
  return all[0]
}

// 수직 방향 — 도약·비행·상승은 up, 추락·착지·하강은 down. "stands up"·"climbs up" 은 자세·등반이지 공중이 아니라 잡지 않는다.
//   drop 은 타동사 쓰임("drops the sword")이 잦아 뒤에 방향·부사가 올 때만 읽는다.
const DROP_OK = String.raw`(?=\s+(?:to|onto|into|down|off|from|back|out|dead|flat|low|\w+ly)\b|\s*[.,;:!?)]|\s*$)`
const UP_RE = new RegExp(
  String.raw`\b(?:leap(?:s|t|ed)?\b|jump(?:s|ed)?\b|springs?\b|sprang\b|launch(?:es|ed)?\b|tak(?:es|e|en)\s+off\b|took\s+off\b|lift(?:s|ed)?\s+off\b|soar(?:s|ed)?\b|ascend(?:s|ed)?\b|fl(?:y|ies|ew)\s+(?:up|upward|higher|into)\b|rises?\s+into\b|rose\s+into\b|into the (?:air|sky)\b|skyward\b|hover(?:s|ed)?\s+up\b|${ing('leaping', 'jumping', 'springing', 'launching', 'soaring', 'ascending')}|taking\s+off\b|lifting\s+off\b|flying\s+(?:up|upward|higher|into)\b)|날아오르|도약|뛰어오르|솟구|떠오르|상승`,
  'gi',
)
const DOWN_RE = new RegExp(
  String.raw`\b(?:falls?\b|fell\b|plummet(?:s|ed)?\b|plung(?:es|ed|e)\b|descend(?:s|ed)?\b|land(?:s|ed)?\b|touch(?:es|ed)?\s+down\b|sinks?\b|sank\b|tumbl(?:es|ed|e)\b|downward\b|drop(?:s|ped)?\b${DROP_OK}|dropping\b${DROP_OK}|${ing('falling', 'plummeting', 'plunging', 'descending', 'landing', 'sinking', 'tumbling')})|추락|떨어지|낙하|착지|내려앉|하강`,
  'gi',
)

function lastIndexOf(re: RegExp, text: string): number {
  let last = -1
  re.lastIndex = 0
  for (let m = re.exec(text); m; m = re.exec(text)) {
    last = m.index
    if (m[0].length === 0) re.lastIndex++
  }
  re.lastIndex = 0
  return last
}

export interface VerticalMatch {
  dir: 'up' | 'down'
  /** 마지막 방향 낱말의 위치 — 뒤에 오는 땅 자세 낱말("jumps onto the rock and stands")이 착지를 뜻하는지 가리는 데 쓴다 */
  index: number
}

/** 동작 문장의 수직 방향 — 둘 다 있으면 뒤에 나온 쪽(끝 상태)이 이긴다. 없으면 null. */
export function verticalMatch(text: string | null | undefined): VerticalMatch | null {
  if (!text) return null
  const up = lastIndexOf(UP_RE, text)
  const down = lastIndexOf(DOWN_RE, text)
  if (up < 0 && down < 0) return null
  return up >= down ? { dir: 'up', index: up } : { dir: 'down', index: down }
}
export function verticalFromMotionText(text: string | null | undefined): 'up' | 'down' | null {
  return verticalMatch(text)?.dir ?? null
}

export const POSTURE_KO: Record<StagePosture, string> = {
  standing: '섬', sitting: '앉음', kneeling: '무릎', crouching: '웅크림', lying: '누움',
  walking: '걸음', running: '달림', floating: '부유', other: '기타',
}
