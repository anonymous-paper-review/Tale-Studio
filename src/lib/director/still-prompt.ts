// 실사 샷 지시문의 말을 러프 · 설계와 맞추는 순수 규칙(오너 2026-11-23 "어긋난 부분 고치고") — 두 실사 길(한 샷 · 네 샷 시트)이 함께 쓴다.
//   원칙: 사람이 보고 확정한 것은 러프다. 누가 어느 칸에 어디서 어떤 자세인지는 러프 칸이 정하고, 글은 러프가 못 나르는 것만 더한다.
//   storyboard-strip 과 따로 둔 까닭: 라우트 시험들이 storyboard-strip 을 통째로 가짜로 바꾼다 — 거기 두면 그 시험들에서 이 함수가 없다(real-cine-line.ts 와 같다).
//   약속: tests/director/still-consistency.test.ts
import { parseDirectorRefs } from '@/lib/director/director-refs'
import { postureFromPoseText } from '@/lib/writer/pipeline/stage/posture_text'

/** 러프 칸이 정하는 것 — 다른 줄과 다르면 러프 칸을 따른다. */
export const STILL_PANEL_RULE = {
  strip:
    '- The pencil panels decide who is in each panel, where each person is, their pose and the framing: each panel has exactly the figures its pencil panel has, no one added and no one missing. If a character line, the shot description or a continuity note below says otherwise, follow the panels.',
  grid:
    "- Each column's pencil panels decide who is in each panel, where each person is, their pose and the framing: each panel has exactly the figures its pencil panel has, no one added and no one missing (a column marked \"no character\" stays free of people). If any other line here says otherwise, follow the panels.",
  // 사람 없는 샷 — "사람을 그리지 마라"와 다투지 않게 구도만(2026-11-23 검토).
  noPeople: '- The pencil panels decide the framing and where things stand. If any other line here says otherwise about that, follow the panels.',
} as const

/** 화살표 · 움직임 표시 · 글자 모양이 남지 않게(연출 칸 밖으로 샌 것, 2026-11-23). */
const noMarksLine = (where: string) =>
  `Arrows belong only in ${where}; if a pencil START or END panel has arrows, motion lines, shake marks or speed marks, they are annotations: leave them out; signs and screens carry no lettering or letter-like shapes.`
export const STILL_NO_MARKS_LINE = { strip: noMarksLine('the middle (DIRECTION) panel'), grid: noMarksLine('row 2 (the DIRECTION row)') } as const

// ── 앞 샷 인용 ────────────────────────────────────────────────────────────
const PREVIOUS_SHOT_MAX = 260

/** 앞 샷 글을 문장 단위로 — 상한 안에 드는 문장까지. 첫 문장이 길면 낱말 경계에서 끊고 말줄임표. */
export function quotePreviousShot(text: string, max = PREVIOUS_SHOT_MAX): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (clean.length <= max) return clean
  let out = ''
  for (const sentence of clean.split(/(?<=[.!?。])\s+/)) {
    const next = out ? `${out} ${sentence}` : sentence
    if (next.length > max) break
    out = next
  }
  return out || clipWords(clean, max - 1)
}

/** 낱말 경계에서 끊는다 — 잘렸으면 말줄임표. */
export function clipWords(text: string, max: number): string {
  const clean = text.trim()
  if (clean.length <= max) return clean
  const head = clean.slice(0, max + 1).replace(/\s+\S*$/, '').replace(/[\s,;:—-]+$/, '')
  return `${head}…`
}

// ── 인물 겉모습 한 마디 ───────────────────────────────────────────────────
/** 문장 사이 — "Dr. Han" · "Mr. Kim"의 마침표는 문장 끝이 아니다. */
export const SENTENCE_BREAK = /(?<!\b(?:Dr|Mr|Mrs|Ms|Jr|Sr|Prof)\.)(?<=[.!?])\s+/

/** 겉모습 첫 문장만, 짧게 — 영어가 아니면 싣지 않는다(영어 약속 문장 안에 한국어가 섞인다). */
export function subjectAnchor(appearance: string | null | undefined, max = 100): string | null {
  const text = (appearance ?? '').replace(/\s+/g, ' ').trim()
  if (!text || /[ㄱ-ㆎ가-힣]/.test(text)) return null // i18n-ok: 한국어인지 알아보기
  const sentences = text.split(SENTENCE_BREAK).map((s) => s.replace(/[.!?]+$/, '').trim()).filter(Boolean)
  // 첫머리의 "나이: 34" · "머리색: 검정" · "주인공" 같은 표는 겉모습이 아니라 다음 문장을 쓴다. 값이 긴 표("겉모습: …" · "Okhwa: A woman …")는 그 값이 겉모습이다.
  const described = sentences.map((s) => {
    if (/^(?:the\s+)?(?:(?:main|lead|leading|supporting|minor|secondary)\s+)?(?:character|protagonist|antagonist|hero|heroine|villain|role)$/i.test(s)) return null
    const label = /^((?!(?:a|an|the)\b)[A-Za-z][\w'’/-]*(?:\s+(?!(?:a|an|the|in|with|of)\b)[\w'’/-]+){0,2}):\s+(.+)$/i.exec(s)
    if (!label) return s
    if (/^(?:age|name|gender|sex|height|weight|role|job|occupation|notes?|nationality|ethnicity|personality|status|id|type)$/i.test(label[1])) return null
    const value = label[2].trim()
    return value.split(/\s+/).length >= 4 ? value : null
  })
  const first = described.find((s) => s !== null && /\s/.test(s)) ?? sentences[0]
  if (!first) return null
  const lowered = /^(?:A|An|The)\s/.test(first) ? first[0].toLowerCase() + first.slice(1) : first
  if (lowered.length <= max) return lowered
  // 길면 쉼표에서 끊는다 — 쉼표가 없으면 낱말 경계에서.
  const comma = lowered.slice(0, max).lastIndexOf(',')
  return comma > 20 ? lowered.slice(0, comma).trim() : clipWords(lowered, max)
}

// ── 시간대 ───────────────────────────────────────────────────────────────
// 긴 말 먼저 — "늦은 오후"가 "오후"보다 앞.
const TIME_KO: Array<[RegExp, string]> = [
  [/아침\s*노을|일출|해\s*뜰|해돋이/, 'sunrise'], // i18n-ok: 시간대 낱말 알아듣기
  [/새벽\s*(?:0?[0-4]|한|두|세|네)\s*시/, 'late night'], // i18n-ok: 시간대 낱말 알아듣기
  [/한밤|심야|자정/, 'late night'], // i18n-ok: 시간대 낱말 알아듣기
  [/늦은\s*밤/, 'late night'], // i18n-ok: 시간대 낱말 알아듣기
  [/늦은\s*오후/, 'late afternoon'], // i18n-ok: 시간대 낱말 알아듣기
  [/이른\s*아침/, 'early morning'], // i18n-ok: 시간대 낱말 알아듣기
  [/새벽|동틀\s*(?:녘|무렵)|여명/, 'dawn'], // i18n-ok: 시간대 낱말 알아듣기
  [/해\s*질\s*(?:녘|무렵)|해질녘|노을|황혼|땅거미|저물/, 'dusk'], // i18n-ok: 시간대 낱말 알아듣기
  [/정오|한낮/, 'midday'], // i18n-ok: 시간대 낱말 알아듣기
  [/저녁/, 'evening'], // i18n-ok: 시간대 낱말 알아듣기
  [/아침|오전/, 'morning'], // i18n-ok: 시간대 낱말 알아듣기
  [/오후/, 'afternoon'], // i18n-ok: 시간대 낱말 알아듣기
  [/낮|대낮/, 'day'], // i18n-ok: 시간대 낱말 알아듣기
  [/밤/, 'night'], // i18n-ok: 시간대 낱말 알아듣기
]

/** 씬 시간대를 영어로 — 영어 값은 그대로, 한국어는 낱말로 바꾸고, 모르는 한국어는 원문 그대로(지금과 같다). */
export function englishTimeOfDay(value: string | null | undefined): string | null {
  const text = (value ?? '').trim()
  if (!text) return null
  if (!/[ㄱ-ㆎ가-힣]/.test(text)) return text // i18n-ok: 한국어인지 알아보기
  for (const [re, en] of TIME_KO) if (re.test(text)) return en
  return text
}

// ── 자리 글의 자세 ───────────────────────────────────────────────────────
// 자리 글 첫머리의 자세 — posture_text 는 "standing inside …"처럼 뒤에 장소가 붙은 꼴을 읽지 않는다.
const POSE_HEAD: Record<string, string> = { standing: 'standing', sitting: 'sitting', seated: 'sitting', kneeling: 'kneeling', crouching: 'crouching', lying: 'lying' }

/** 자리 글(character_blocking.pose)이 말하는 자세 — 모르면 null. */
export function poseOf(pose: string | undefined): string | null {
  const read = postureFromPoseText(pose)?.posture
  if (read) return read
  const m = /^(?:\w+ly\s+)?(standing|sitting|seated|kneeling|crouching|lying)\b/i.exec((pose ?? '').trim())
  return m ? POSE_HEAD[m[1].toLowerCase()] : null
}

/** 인물 id → 자리 글. */
export function poseTextById(staticSpec: unknown): Map<string, string> {
  const blocking = (staticSpec as { character_blocking?: unknown } | null | undefined)?.character_blocking
  return new Map(
    (Array.isArray(blocking) ? (blocking as Array<{ character_id?: unknown; pose?: unknown }>) : [])
      .filter((b) => typeof b?.character_id === 'string' && typeof b?.pose === 'string')
      .map((b) => [b.character_id as string, b.pose as string]),
  )
}

// ── 주의(check_notes) ────────────────────────────────────────────────────
const LEDGER_RE = /^Continuity: during this shot\b/i
// 장부 주의의 인물 id 와 시작 자세 — "… Gyeyeon (gyeyeon) sits down (standing → sitting) — …"
const LEDGER_POSTURE_RE = /^Continuity: during this shot [^()]*\(([^()]+)\)[^()]*\((\w+)\s*→\s*\w+\)/i
const OFF_SCREEN_RE = /\(([^()]+)\) is OFF-SCREEN in this shot/i

// 걷거나 뛰는 사람도 서 있다 — 앉고 눕는 움직임의 시작 자세로는 같다.
const startPosture = (posture: string) => (/^(?:standing|walking|running)$/.test(posture) ? 'upright' : posture)

/**
 * 실사 스틸에 실을 주의 — 동작량 주의와, 시작 자세가 자리 글과 다른 자세 바꿈 주의(장부)는 뺀다(이미 앉은 사람에게 "앉는다").
 *   이 샷의 인물로 본 사람을 그리지 말라는 주의도 뺀다. 나머지 시각 주의는 그대로 — 움직임 주의는 나무 인형의 앞뒤 · 방향을 모르는 모델에 끝 칸을 알려 준다.
 */
export function stillConstraints(value: unknown, presentIds: readonly string[], staticSpec: unknown): string[] {
  if (!Array.isArray(value)) return []
  const present = new Set(presentIds)
  const poses = poseTextById(staticSpec)
  const out: string[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const note = item as { constraint_target?: unknown; category?: unknown; constraint?: unknown }
    if (note.constraint_target !== 'visual' || note.category === 'action_budget') continue
    const text = typeof note.constraint === 'string' ? note.constraint.trim() : ''
    if (!text) continue
    const posture = LEDGER_RE.test(text) ? LEDGER_POSTURE_RE.exec(text) : null
    if (posture) {
      const now = poseOf(poses.get(posture[1].trim()))
      if (now && startPosture(now) !== startPosture(posture[2].toLowerCase())) continue
    }
    const off = OFF_SCREEN_RE.exec(text)
    if (off && present.has(off[1].trim())) continue
    out.push(text)
  }
  return out
}

// ── 이 샷의 인물 ─────────────────────────────────────────────────────────
export interface ShotForCharacters {
  characters?: unknown
  static_spec?: unknown
  dynamic_spec?: unknown
  director_refs?: unknown
  prompt?: unknown
  action_description?: unknown
  action_description_native?: unknown
}

interface LayoutPlace { in_frame?: unknown; position_in_frame?: unknown }
interface LayoutCharacter { character_id?: unknown; start?: LayoutPlace; end?: LayoutPlace }

const layoutOf = (staticSpec: unknown) => (staticSpec as { screen_layout?: { characters?: unknown; off_frame?: unknown } } | null | undefined)?.screen_layout ?? null
const layoutCharacter = (staticSpec: unknown, id: string): LayoutCharacter | null => {
  const list = layoutOf(staticSpec)?.characters
  return Array.isArray(list) ? ((list as LayoutCharacter[]).find((c) => c?.character_id === id) ?? null) : null
}
const strings = (value: unknown): string[] => (Array.isArray(value) ? value.filter((x): x is string => typeof x === 'string' && !!x.trim()).map((x) => x.trim()) : [])
const shotText = (shot: ShotForCharacters) =>
  [shot.prompt, shot.action_description, shot.action_description_native].filter((x): x is string => typeof x === 'string').join('\n')

/** 사람을 가리키는 낱말(정규식 조각). */
export const PERSON_NOUN = 'man|woman|girl|boy|person|figure|child|kid|mother|father|lady|guy|elder|soldier|officer|doctor|player|driver|worker|student|teacher|king|queen|prince|princess|monk|warrior|knight|detective|nurse'
const FACE = '(?:face|faces|features|eyes?|profile)'
const SEEN = '(?:face|faces|figure|features|eyes?|silhouette|body|profile)'
const SURFACE = '(?:glass|window|windowpane|mirror|screen|water|puddle|lens|monitor|visor)'
// "reflects on her face"는 빛이 얼굴에 비치는 것이다 — 비추는 것과 얼굴 사이에 전치사가 오면 비친 모습이 아니다.
const NOT_ONTO = '(?:(?!(?:on|off|in|into|onto|across|from|over|against|upon|along|around|toward|towards|at|down|through|beneath|under|beside|behind|above|below|between|near|by|to|past|up|out)\\b)[\\w-]+\\s+)'
// 얼굴 · 눈 · 몸이 거울 · 창 · 유리 · 물에 비친다("Her face is mirrored in the dark glass") — 주인이 사람일 때만(건물의 silhouette · 차의 body 는 아니다).
const BE = '\\s+(?:(?:is|are|was|were|\\w+ly)\\s+){0,2}'
const REFLECTED_IN = `${BE}(?:reflects?|reflected|reflecting|mirrors?|mirrored)\\s+(?:(?:\\w+ly|back)\\s+)?(?:in|on|by|against|from)\\s+(?:[\\w'’-]+\\s+){0,4}(?:${SURFACE}|reflection|lake|pond|pool|river|stream|ice|sea|marble|chrome|steel|blade|spoon)\\b`
// "나타난다 · 떠 있다"는 얼굴이 거울 · 화면 · 유리에 있을 때만(물에 뜬 몸, 창에 나타난 사람은 아니다).
const SEEN_IN = `${BE}(?:appears?|floats?|hovers?|shows)\\s+(?:(?:\\w+ly|back)\\s+)?(?:in|on)\\s+(?:[\\w'’-]+\\s+){0,4}(?:mirror|reflection|screen|visor|glass)\\b`
// "Seoul Tower's reflection"처럼 이름 자리에 오는 사물 · 장소.
const NOT_PERSON_NAME = '(?!(?:Tower|Bridge|River|City|Building|Street|Station|Castle|Palace|Temple|Church|Mountain|Sea|Lake|Ocean|Skyline|Hotel|Bank|Shop|Store|Plaza|Square|Gate|Wall|Ship|Train|Bus|Car|Sign|Lantern|Lamp|Neon)\\b)'

// 사람의 비친 모습만 — "얼굴에 빛이 비친다(light reflects on her face)" · "네온 반사" · "백미러 속 차" · "탑의 비친 모습"은 아니다(11/23 검토: 빛 문장이 대부분이었다).
const PERSON_REFLECTION = [
  /\b(?:her|his|their|own)\s+(?:[\w-]+\s+){0,3}reflections?\b/i,
  new RegExp(`\\b${NOT_PERSON_NAME}[A-Z][\\w-]*['’]s\\s+(?:[\\w-]+\\s+){0,2}reflections?\\b`),
  new RegExp(`\\b(?:${PERSON_NOUN})['’]s\\s+(?:[\\w-]+\\s+){0,2}reflections?\\b`, 'i'),
  new RegExp(`\\breflections?\\s+of\\s+(?:(?:her|his|their|him|them)\\b|(?:the|a|an)\\s+(?:[\\w-]+\\s+){0,3}(?:${PERSON_NOUN})\\b)`, 'i'),
  /\bmirrored\s+(?:[\w-]+\s+){0,2}(?:face|faces|figure|self|features)\b/i,
  // 거울 · 창 속의 자기를 본다 · 거울을 들여다본다(백미러 · 사이드미러는 뒤를 보는 것이다).
  //   "by herself"는 혼자라는 말이다. 창 · 유리는 보는 동작일 때만("sits … in the window seat"은 아니다).
  /(?<!\bby\s)\b(?:her|him|them)sel(?:f|ves)\b[^.;]{0,20}\bin\s+(?:the|a|an|her|his|their)\s+(?:(?!rear|side|wing)[\w-]+\s+){0,3}(?:mirror|reflection)\b/i,
  /\b(?:look|gaz|star|see|watch|stud|examin|regard|glimps|admir|observ|check|fac|peer|glanc|catch)\w*\b[^.;]{0,20}(?<!\bby\s)\b(?:her|him|them)sel(?:f|ves)\b[^.;]{0,20}\bin\s+(?:the|a|an|her|his|their)\s+(?:[\w-]+\s+){0,3}(?:window|glass|screen|visor|puddle)\b(?!\s+seat)/i,
  /\b(?:look|gaz|star|peer|glanc)\w*\s+(?:\w+ly\s+)?(?:in|into|at)\s+(?:the|a|an|her|his|their)\s+(?:(?!rear|side|wing)[\w-]+\s+){0,2}mirror\b(?!-|\s+(?:ball|shop|maze|hall|lake|world))/i,
  ...[[SEEN, REFLECTED_IN], [FACE, SEEN_IN]].flatMap(([part, shown]) => [
    new RegExp(`\\b(?:her|his|their|(?:the|a|an)\\s+(?:[\\w-]+\\s+){0,3}(?:${PERSON_NOUN})['’]s)\\s+(?:[\\w-]+\\s+){0,2}${part}${shown}`, 'i'),
    new RegExp(`\\b${NOT_PERSON_NAME}[A-Z][\\w-]*['’]s\\s+(?:[\\w-]+\\s+){0,2}${part}${shown}`),
  ]),
  // 유리 · 거울 · 화면 · 물이 사람의 얼굴을 비춘다 — 빛이 얼굴에 비치는 것은 아니다.
  new RegExp(`\\b${SURFACE}\\b[^.;]{0,30}\\breflect(?:s|ed|ing)?\\s+${NOT_ONTO}{0,2}(?:her|his|their)\\s+(?:[\\w-]+\\s+){0,3}${SEEN}\\b`, 'i'),
  new RegExp(`\\b${SURFACE}\\b[^.;]{0,30}\\breflect(?:s|ed|ing)?\\s+${NOT_PERSON_NAME}[A-Z][\\w-]*['’]s\\s+(?:[\\w-]+\\s+){0,3}${SEEN}\\b`),
  /(?:거울|창|유리|수면|물|화면|모니터)[^.]{0,8}(?:비친|반사된)\s*(?:[가-힣]+\s*)?(?:모습|얼굴|자신)|거울\s*속[^.]{0,8}(?:모습|얼굴|자신|여자|남자)/, // i18n-ok: 비친 모습 낱말 알아듣기
]

/** 거울 · 창 · 화면에 사람의 비친 모습을 그리는 샷인가 — 인물 이름을 알면 "Okhwa 의 비친 모습(reflection of Okhwa)"도 알아본다. */
export function isReflectionShot(shot: ShotForCharacters, names: readonly string[] = []): boolean {
  const motion = (shot.dynamic_spec as { motion_prompt?: unknown } | null | undefined)?.motion_prompt
  const text = `${shotText(shot)}\n${typeof motion === 'string' ? motion : ''}`
  if (PERSON_REFLECTION.some((re) => re.test(text))) return true
  // 이름은 낱말로 — "skyline" 속의 Sky 는 이름이 아니고, 뒤에 대문자 낱말이 이어지면("Han River") 다른 이름이다.
  return [...text.matchAll(/\breflections?\s+of\s+(?:the\s+)?([^.,;:\n]{1,60})/gi)].some(([, whose]) =>
    names.some((raw) => {
      const name = raw.trim()
      if (name.length < 2 || !whose.toLowerCase().startsWith(name.toLowerCase())) return false
      return !/^(?:[\w-]|\s+[A-Z])/.test(whose.slice(name.length))
    }),
  )
}

/** 지시문에 쓸 이름 — 저장된 영어 이름이 지금 이름에서 정한 것이면 영어, 아니면 이름 그대로(다시 번역하지 않는다). */
export function promptName(row: { name?: unknown; name_en?: unknown; name_en_source?: unknown }, fallback = ''): string {
  const name = typeof row.name === 'string' ? row.name.trim() : ''
  const en = typeof row.name_en === 'string' ? row.name_en.trim() : ''
  const source = typeof row.name_en_source === 'string' ? row.name_en_source.trim() : ''
  return (en && source === name ? en : name) || fallback
}

/** 이 샷 설계에 나오는 인물 id 후보 전부(자리 목록 · 화면 밖 · 움직임) — 시트를 찾을 때 함께 읽는다. */
export function designCharacterIds(shot: ShotForCharacters): string[] {
  const blocking = (shot.static_spec as { character_blocking?: unknown } | null | undefined)?.character_blocking
  const motions = (shot.dynamic_spec as { character_motion?: unknown } | null | undefined)?.character_motion
  const ids = [
    ...(Array.isArray(blocking) ? (blocking as Array<{ character_id?: unknown }>) : []).map((b) => b?.character_id),
    ...(Array.isArray(motions) ? (motions as Array<{ character_id?: unknown }>) : []).map((m) => m?.character_id),
    ...strings(layoutOf(shot.static_spec)?.off_frame),
  ]
  return [...new Set(ids.filter((id): id is string => typeof id === 'string' && !!id.trim()).map((id) => id.trim()))]
}

/** 이 인물이 이 샷 글에 이름으로 나오는가(저장된 이름 · 영어 이름, 대소문자 무시) — 영어 이름은 낱말로, 한국어 이름은 조사가 붙으니 글자로 찾는다. */
function namedInText(text: string, names: readonly string[]): boolean {
  return names.some((name) => {
    const n = name.trim()
    if (n.length < 2) return false
    if (!/^[\x20-\x7e]+$/.test(n)) return text.includes(n)
    // 낱말 하나짜리 이름("Will")은 흔한 낱말과 겹친다 — 적힌 그대로 · 모두 대문자 · 첫 글자만 대문자일 때만 이름이다(소문자 "will"은 아니다).
    //   여러 낱말(id 에서 온 "tired woman")은 대소문자를 보지 않는다.
    const many = /\s/.test(n)
    const forms = many ? [n] : [...new Set([n, n.toUpperCase(), n[0].toUpperCase() + n.slice(1).toLowerCase()])]
    const pattern = forms.map((f) => f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')
    return new RegExp(`(?<![\\w-])(?:${pattern})(?![\\w-])`, many ? 'i' : '').test(text)
  })
}

/**
 * 인물 목록(shots.characters)에 없지만 이 샷에 나오는 인물 id — 정해진 순서.
 *   ① 설계에 화면 안으로 있고(자리 목록 · 무대 배치) 샷 글에 이름이 나오는 인물
 *   ② 비친 모습 샷에서 작가가 움직임을 적은 인물(무대 계산이 카메라 밖으로 본 사람)
 *   사람이 Director 에서 참조 목록을 손댄 샷(director_refs)은 그 목록이 이긴다 — 목록에 있는 인물만 더한다.
 */
export function extraCharactersInShot(shot: ShotForCharacters, namesById: ReadonlyMap<string, readonly string[]>): string[] {
  if (!Array.isArray(shot.characters)) return []
  const handPicked = parseDirectorRefs(shot.director_refs)
  const allowed = handPicked ? new Set(handPicked.characters) : null
  const listed = new Set(strings(shot.characters))
  const offFrame = new Set(strings(layoutOf(shot.static_spec)?.off_frame))
  // 채팅으로 인물을 빼면 인물 목록과 행동 글만 바뀌고 샷 프롬프트는 옛것이 남는다 — 행동 글이 있으면 그 글만 본다.
  const action = [shot.action_description, shot.action_description_native].filter((x): x is string => typeof x === 'string' && !!x.trim()).join('\n')
  const text = action || shotText(shot)
  const out = new Set<string>()
  const blocking = (shot.static_spec as { character_blocking?: unknown } | null | undefined)?.character_blocking
  for (const entry of Array.isArray(blocking) ? (blocking as Array<{ character_id?: unknown }>) : []) {
    const id = typeof entry?.character_id === 'string' ? entry.character_id.trim() : ''
    if (!id || listed.has(id) || offFrame.has(id) || !namesById.has(id)) continue
    const place = layoutCharacter(shot.static_spec, id)
    const inFrame = place ? place.start?.in_frame !== false || place.end?.in_frame === true : true
    if (inFrame && namedInText(text, namesById.get(id)!)) out.add(id)
  }
  if (offFrame.size && isReflectionShot(shot, [...namesById.values()].flat())) {
    const motions = (shot.dynamic_spec as { character_motion?: unknown } | null | undefined)?.character_motion
    const pov = (layoutOf(shot.static_spec) as { pov_of?: unknown } | null)?.pov_of
    const movers = new Set(
      (Array.isArray(motions) ? (motions as Array<{ character_id?: unknown; verb?: unknown; source?: unknown }>) : [])
        .filter((m) => m?.source !== 'ledger' && typeof m?.verb === 'string' && !!m.verb.trim() && typeof m.character_id === 'string')
        .map((m) => (m.character_id as string).trim())
        .filter((id) => offFrame.has(id) && namesById.has(id) && id !== pov),
    )
    // 화면 안에 아무도 없고 움직이는 화면 밖 인물이 한 명뿐이면 비친 것은 그 사람이다. 아니면 글에 이름이 나온 인물만 —
    //   화면 안 인물의 비친 모습이거나, 화면 밖에서 말만 하는 사람일 수 있다(11/23 검토).
    const alone = movers.size === 1 && [...listed].every((id) => offFrame.has(id)) && out.size === 0
    for (const id of movers) if (alone || namedInText(shotText(shot), namesById.get(id)!)) out.add(id)
  }
  return [...out].filter((id) => !allowed || allowed.has(id)).sort((a, b) => a.localeCompare(b))
}

// ── 인물 줄 라벨 ─────────────────────────────────────────────────────────
export interface StillLabel {
  name: string
  /** 짧은 겉모습(영어, subjectAnchor) — 인물이 둘 이상일 때 이름 뒤에 적는다. */
  look?: string | null
  position?: string | null
  pose?: string | null
  /** 시작 · 끝 칸에서 있고 없음이 다를 때만 — 자리 말을 대신한다. */
  presence?: string | null
  /** 시작 · 끝 칸의 좌우 자리(-1 왼쪽 ~ 1 오른쪽) — 왼쪽부터 차례를 적을 때만 쓴다. 모르면 null. */
  startX?: number | null
  endX?: number | null
  absentAtStart?: boolean
  absentAtEnd?: boolean
}

const PLACE: Record<string, string> = {
  left_third: 'in the left third of the frame', center_third: 'in the center of the frame', right_third: 'in the right third of the frame',
  frame_edge_left: 'at the left edge of the frame', frame_edge_right: 'at the right edge of the frame',
}
const asToken = (value: unknown) => (typeof value === 'string' ? value.trim().toLowerCase() : '')
const SIDE: Record<string, string> = { off_left: 'from the left', off_right: 'from the right' }
/** 화면 밖 인물이 어느 쪽인가 — 카메라 뒤에 선 사람은 무대 계산이 늘 off_left · screen_x 0 으로 적어 믿지 않는다. */
export function offScreenSide(start: { position_in_frame?: unknown; screen_x?: unknown } | null | undefined): string | null {
  const side = SIDE[asToken(start?.position_in_frame)]
  if (!side) return null
  const x = start?.screen_x
  return typeof x === 'number' && (Math.abs(x) <= 1.05 || (x < 0) !== (side === 'from the left')) ? null : side
}
const TOKEN_X: Record<string, number> = { frame_edge_left: -0.9, left_third: -0.5, center_third: 0, right_third: 0.5, frame_edge_right: 0.9 }
const placeX = (place: (LayoutPlace & { screen_x?: unknown }) | null | undefined, token?: string | null): number | null =>
  typeof place?.screen_x === 'number' && Number.isFinite(place.screen_x) ? place.screen_x : TOKEN_X[asToken(place?.position_in_frame) || asToken(token)] ?? null

/** 인물 줄 라벨 — 무대 배치가 시작 · 끝에서 있고 없음을 알면 그 말로, 아니면 자리 그대로. */
export function stillCharacterLabel(
  ref: { characterId: string; name: string; look?: string | null; position: string | null; pose: string | null },
  staticSpec: unknown,
): StillLabel {
  const place = layoutCharacter(staticSpec, ref.characterId)
  const startIn = place?.start?.in_frame
  const endIn = place?.end?.in_frame
  const base: StillLabel = {
    name: ref.name, position: ref.position, pose: ref.pose,
    ...(ref.look ? { look: ref.look } : {}),
    startX: startIn === false ? null : placeX(place?.start, ref.position),
    endX: endIn === true ? placeX(place?.end) : null,
    ...(startIn === false ? { absentAtStart: true } : {}),
    ...(endIn === false ? { absentAtEnd: true } : {}),
  }
  if (startIn === false && endIn === true) {
    const side = offScreenSide(place?.start)
    const where = PLACE[asToken(place?.end?.position_in_frame)]
    // "들어온다(enters)"가 아니라 "화면에 들어온다(comes into frame)" — 걸어 들어오는지 카메라가 비추는지 여기서는 모른다.
    return { ...base, presence: `not in the START panel; comes into frame${side ? ` ${side}` : ''}${where ? ` and is ${where}` : ' and is visible'} in the END panel` }
  }
  if (startIn === true && endIn === false) {
    const where = PLACE[asToken(place?.start?.position_in_frame)] ?? PLACE[asToken(ref.position)]
    return { ...base, presence: `${where ? `${where.replace(/^(?:in|at) the /, '')} in` : 'visible in'} the START panel; leaving by the END panel, where only what the pencil panel still shows of them stays` }
  }
  return base
}

const MIN_GAP = 0.12

/** 왼쪽부터의 이름 — 자리를 모르거나 거의 같은 자리인 사람이 있으면 null(적지 않는다). */
function orderedNames(refs: readonly StillLabel[], key: 'startX' | 'endX'): string[] | null {
  if (refs.length < 2 || refs.some((r) => typeof r[key] !== 'number')) return null
  const sorted = [...refs].sort((a, b) => (a[key] as number) - (b[key] as number))
  for (let i = 1; i < sorted.length; i++) if ((sorted[i][key] as number) - (sorted[i - 1][key] as number) < MIN_GAP) return null
  return sorted.map((r) => r.name)
}

/** 칸마다 왼쪽부터 누구인지 — 시작 칸, 그리고 끝 칸이 다를 때만 끝 칸(2026-11-23: 가운데 인형을 다른 사람으로 그렸다). 없으면 빈 글. */
export function leftToRight(refs: ReadonlyArray<StillLabel | string>, panels: { start: string; end: string }): string {
  if (refs.some((r) => typeof r === 'string')) return ''
  const labels = refs as readonly StillLabel[]
  const start = orderedNames(labels.filter((r) => !r.absentAtStart), 'startX')
  const end = orderedNames(labels.filter((r) => !r.absentAtEnd), 'endX')
  return [
    start ? ` Left to right in ${panels.start}: ${start.join(', ')}.` : '',
    end && end.join() !== start?.join() ? ` Left to right in ${panels.end}: ${end.join(', ')}.` : '',
  ].join('')
}

// ── 멈춘 러프 ─────────────────────────────────────────────────────────────
// 한 번에 그린 러프 세 장은 몇 초 안에 함께 저장된다(실측 1.2초 안) — 사람이 한 장을 고쳐 저장하면 그 장만 훨씬 늦다.
const SAME_DRAW_MS = 5_000

/**
 * 러프가 멈춘 그림인 샷인가 — 사람이 더한 샷(설계 없음)의 러프는 늘 "static hold"로 그려진다(rough-storyboard-grid).
 *   파이프라인이 만든 샷은 설계 칸이 비어 있어도 러프에 움직임이 있을 수 있어 아니다.
 *   사람이 고친 샷(읽은 줄이 있거나, 세 장 가운데 한 장이라도 나중에 저장됨 — 화살표 저장 · 한 장 다시 그리기)도 아니다. 모르면 아니라고 본다.
 */
export function roughIsStaticHold(
  shot: { source?: unknown; static_spec?: unknown; dynamic_spec?: unknown; design_ref?: unknown; rough_storyboard?: unknown } | null | undefined,
): boolean {
  if (!shot || shot.source === 'pipeline') return false
  if ([shot.dynamic_spec, shot.static_spec].some((spec) => spec && typeof spec === 'object') || (typeof shot.design_ref === 'string' && shot.design_ref.trim())) return false
  const rough = shot.rough_storyboard as { generatedAt?: unknown; frames?: Record<string, unknown>; directionRead?: unknown } | null | undefined
  if (!rough || typeof rough !== 'object' || rough.directionRead || typeof rough.generatedAt !== 'number') return false
  const savedAt = ['start', 'direction', 'end'].map((key) => {
    const url = rough.frames?.[key]
    return typeof url === 'string' ? Number(/[?&]v=(\d+)/.exec(url)?.[1] ?? NaN) : NaN
  })
  if (savedAt.some((at) => !Number.isFinite(at) || at > (rough.generatedAt as number))) return false
  return Math.max(...savedAt) - Math.min(...savedAt) <= SAME_DRAW_MS
}
