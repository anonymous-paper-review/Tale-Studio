// 영상 지시문의 말을 샷 설계와 맞추는 순수 규칙(오너 2026-11-23 "어긋난 부분 고치고") — video-prompt · motion-contract · video-submit 이 쓴다.
//   원칙: 카메라는 움직임 약속 한 곳이 정한다. 인물은 이름으로 부른다. 이미 참인 것을 다시 시키지 않는다.
//   약속: tests/director/video-consistency.test.ts
import { offScreenSide, PERSON_NOUN, poseOf, poseTextById, SENTENCE_BREAK } from '@/lib/director/still-prompt'
import { postureFromMotionText } from '@/lib/writer/pipeline/stage/posture_text'
import type { ShotDynamicSpec } from '@/lib/writer/types/pipeline'

// ── 카메라 기종 글(렌즈 · 초점 · 빛) ───────────────────────────────────────
/** 샷 설계가 정한 렌즈 · 초점 · 빛 색온도 — 샷에 저장된 카메라 값이 처음 값 그대로일 때 이것을 쓴다. */
export interface GearDesign {
  lensMm: number | null
  kelvin: number | null
  focus: string | null
}

const FOCUS: Record<string, string> = { shallow: 'shallow focus', medium: 'medium depth of field', deep: 'deep focus' }

/** static_spec → 렌즈 · 초점 · 색온도. 하나도 없으면 null(저장된 값 그대로). */
export function designGear(staticSpec: unknown): GearDesign | null {
  if (!staticSpec || typeof staticSpec !== 'object' || Array.isArray(staticSpec)) return null
  const spec = staticSpec as { lens_mm?: unknown; depth_of_field?: unknown; lighting?: { color_temp_kelvin?: unknown } | null }
  const positive = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) && x > 0 ? Math.round(x) : null)
  const gear: GearDesign = {
    lensMm: positive(spec.lens_mm),
    kelvin: positive(spec.lighting?.color_temp_kelvin),
    focus: typeof spec.depth_of_field === 'string' ? (FOCUS[spec.depth_of_field.trim().toLowerCase()] ?? null) : null,
  }
  return gear.lensMm || gear.kelvin || gear.focus ? gear : null
}

export { subjectAnchor } from '@/lib/director/still-prompt'

// ── 인물 겉모습 한 마디 ───────────────────────────────────────────────────
/** 움직임 약속의 인물 — 이름과 짧은 겉모습. */
export interface ContractSubject {
  name: string
  anchor: string | null
  /** 시작 그림에 없다가 들어오는 인물의 말(entryNote) — "off-screen at the start, enters from the left". */
  entry?: string | null
}

/** 무대 배치가 "시작엔 화면 밖, 끝엔 안"인 인물 — 어느 쪽에서 들어오는지. 아니면 null. */
export function entryNote(staticSpec: unknown, characterId: string): string | null {
  const list = (staticSpec as { screen_layout?: { characters?: unknown } } | null | undefined)?.screen_layout?.characters
  const place = (Array.isArray(list) ? list : []).find((c) => (c as { character_id?: unknown } | null)?.character_id === characterId) as
    | { start?: { in_frame?: unknown; position_in_frame?: unknown; screen_x?: unknown }; end?: { in_frame?: unknown } }
    | undefined
  if (place?.start?.in_frame !== false || place.end?.in_frame !== true) return null
  const side = offScreenSide(place.start)
  return `off-screen at the start, comes into frame${side ? ` ${side}` : ''}`
}

// ── 움직임 글에서 카메라 말 빼기 ───────────────────────────────────────────
//   카메라 말만으로 된 조각만 뺀다. 그 조각에 다른 사람 · 사물의 움직임이 섞였거나 남는 주어가 분명하지 않으면 문장을 그대로 둔다
//   — 카메라 말이 남는 것보다 동작이 사라지거나 주어가 바뀌는 쪽이 나쁘다(2026-11-23 검토).
const VERB =
  '(?:doll(?:y|ies|ied|ying)|pan(?:s|ned|ning)?|tilt(?:s|ed|ing)?|track(?:s|ed|ing)?|push(?:es|ed|ing)?|pull(?:s|ed|ing)?|zoom(?:s|ed|ing)?|mov(?:e|es|ed|ing)|drift(?:s|ed|ing)?|cran(?:e|es|ed|ing)|eas(?:e|es|ed|ing)|holds?|holding|held|remain(?:s|ed|ing)?|stay(?:s|ed|ing)?|follow(?:s|ed|ing)?|ris(?:e|es|ing)|lower(?:s|ed|ing)?|descend(?:s|ed|ing)?|ascend(?:s|ed|ing)?|rack(?:s|ed|ing)?|orbit(?:s|ed|ing)?|circl(?:e|es|ed|ing)|arc(?:s|ed|ing)?|glid(?:e|es|ed|ing)|slid(?:e|es|ing)|sweep(?:s|ing)?|swept|float(?:s|ed|ing)?|creep(?:s|ing)?|crept|inch(?:es|ed|ing)?|clos(?:es|ing)\\s+in|shift(?:s|ed|ing)?|swing(?:s|ing)?|rotat(?:e|es|ed|ing)|truck(?:s|ed|ing)?|boom(?:s|ed|ing)?|linger(?:s|ed|ing)?|settl(?:e|es|ed|ing)|keep(?:s|ing)?|fram(?:e|es|ed|ing)|breath(?:e|es|ed|ing)|shak(?:e|es|ing)|tighten(?:s|ed|ing)?|widen(?:s|ed|ing)?|travel(?:s|ed|ing)?|advanc(?:e|es|ed|ing)|retreat(?:s|ed|ing)?|static|locked|fixed|still|stationary|motionless|handheld|steady)'
const ADVERB = '(?:is|was|then|now|also|only|just|very|continues?|starts?|begins?|to|\\w+ly)'
// "카메라가 (천천히) 움직인다" — 움직임 동사가 따라올 때만 카메라 말이다(소품 카메라 · 카메라맨은 아니다).
const CAMERA = `(?:(?:the|a|our)\\s+)?(?:(?:handheld|static|locked(?:-off)?|fixed|steady|moving)\\s+)?camera(?:\\s+${ADVERB})*\\s+${VERB}\\b`
const MOVE_ADJECTIVE = '(?:minimal|slow|gentle|subtle|slight|steady|smooth|quick|fast|soft|long|brief|tiny|small|gradual|continuous|lateral|controlled|very|almost|barely|imperceptible)'
// 카메라 말로만 된 이름 조각 — "Slow push-in on …" · "Handheld breathing drift …" · "Static camera …". "Static shot of …"는 담긴 내용이라 아니다.
const SURE_MOVE = `(?:hand-?held\\s+(?:\\w+\\s+){0,2}(?:drift|shake|sway|movement|motion|breathing|float)|(?:static|locked(?:-off)?|fixed|stationary)\\s+(?:camera|shot|framing|hold)(?!\\s+of\\b)|locked(?:-off)?\\s+frame(?!\\s+of\\b)|(?:camera\\s+)?push[- ]?in|(?:camera\\s+)?pull[- ]?(?:back|out)|(?:camera\\s+)?dolly[- ](?:in|out|shot|move)|(?:pan|tilt|crane|tracking|track|zoom|whip[- ]?pan|rack[- ]?focus)[- ](?:shot|move|movement)|(?:tilt|tracking|zoom|whip[- ]?pan|rack[- ]?focus)[- ](?:left|right|up|down|in|out|across|toward|towards|along|over)|pan[- ](?:left|right|up|down)(?=\\s+(?:across|along|toward|towards|past|through|reveal(?:s|ing)?|as|while)\\b|\\s*,|\\s*$)|(?:crane|track)[- ](?:left|right|up|down)(?=\\s+(?:across|along|to|toward|towards|past|through|from|reveal(?:s|ing)?|as|while)\\b|\\s*,|\\s*$))`
// 소품과 글자가 같은 말("a pan left on the stove" · "the crane over the harbor" · "a static frame hangs") — 관사만 붙었거나 크기 말("a small pan")이 붙었으면 소품으로 본다.
//   움직임 꾸밈말("a slow pan")이 있거나 관사가 없을 때만 카메라다.
const LOOSE_ADJECTIVE = '(?:minimal|slow|gentle|subtle|slight|steady|smooth|quick|fast|gradual|continuous|lateral|controlled|imperceptible)'
const LOOSE_MOVE = `(?:(?:static|fixed|stationary)\\s+frame(?!\\s+of\\b)|(?:camera\\s+)?dolly|(?:pan|crane|track)[- ](?:left|right|up|down|in|out|across|toward|towards|along|over))`
const MOVE_NOUN = `(?:(?:(?:a|an|the)\\s+)?(?:${MOVE_ADJECTIVE}\\s+)*${SURE_MOVE}|(?:(?:(?:a|an|the)\\s+)?(?:${LOOSE_ADJECTIVE}\\s+)+)?${LOOSE_MOVE})\\b`
// "하는 동안"의 as — "as if · as soon as · as slowly as … · as before · as a leaf would"는 아니다(11/23 2 · 3차 검토: 문장이 부서졌다).
const AS = '(?:(?<!\\bas\\s+[\\w-]+\\s+)as(?!\\s+(?:if|though|soon|long|far|well|much|before|always|usual|ever|expected|planned)\\b|\\s+[\\w-]+\\s+as\\b|\\s+(?:an?|the)\\s+[\\w-]+\\s+(?:would|does|did|might)\\b))'

const LEAD_IN = new RegExp(`^(?:as|while|when)\\s+(${CAMERA}[^,]*),\\s*(.+)$`, 'i')
const SUBJECT_AS = new RegExp(`^((?:${CAMERA}|${MOVE_NOUN}).*?),?\\s+(?:${AS}|while)\\s+(.+)$`, 'i')
const SUBJECT_ONLY = new RegExp(`^(?:${CAMERA}|${MOVE_NOUN})`, 'i')
const TRAILING = new RegExp(`^(.+?)(,?\\s+(?:${AS}|while|when)\\s+|,\\s+(?:with\\s+|and\\s+)?)(${CAMERA}.*)$`, 'i')
const PREFIX = new RegExp(`^(?:${CAMERA}|${MOVE_NOUN})`, 'i')

// 카메라 조각 안에 나와도 되는 -ing 낱말: 이름씨, 그리고 조각 머리 · 쉼표 · and · 부사 바로 뒤의 카메라 동작("Mina pulling …"처럼 사람 뒤면 사람의 동작이다).
const NOUN_ING = /^(?:ceiling|building|railing|awning|wing|ring|king|string|painting|landing|crossing|lighting|evening|morning|nothing|something|everything|wiring|clearing|spring)$/i
const CAMERA_ING =
  /^(?:following|tracking|keeping|holding|framing|staying|remaining|moving|panning|tilting|dollying|pushing|pulling|zooming|drifting|craning|easing|circling|orbiting|rising|lowering|gliding|sliding|sweeping|lingering|settling|tightening|widening|travell?ing|closing|shifting|rotating|revealing|centering)$/i
const ingWordsAreCamera = (rest: string) =>
  [...rest.matchAll(/([A-Za-z'’-]+|,)?\s*\b([A-Za-z'’-]+ing)\b/g)].every(([, before, word]) =>
    NOUN_ING.test(word) || (CAMERA_ING.test(word) && (!before || /^(?:,|and|then|with|\w+ly)$/i.test(before))))

const NAME = "[A-Z][\\w-]*(?:\\s+[A-Z][\\w-]*){0,2}"
const PEOPLE = new RegExp(`\\b(?:${NAME}|(?:[Tt]he|[Aa]n?)\\s+(?:[\\w-]+\\s+){0,4}?(?:${PERSON_NOUN}))\\b`, 'g')
// 사람 뒤에 와도 되는 말 — 끝, 소유격, 쉼표, 전치사 · 부사. 그 밖의 낱말이면 그 사람의 동작일 수 있다("the door Mina slams shut").
const AFTER_PERSON = /^(?:$|['’]s?(?=\s|$)|[,.]|(?:in|on|at|to|from|with|through|across|into|toward|towards|past|behind|beside|by|over|under|around|along|alongside|against|near|for|between|among|amid|above|below|beneath|within|inside|outside|beyond|during|like|and|or|up|down|left|right|out|off|back|forward|again|together|\w+ly|\w+wards?)\b)/
// 이름씨 바로 뒤에 다른 이름씨구가 오면 관계절이다("the door the guard slams shut") — 그 사람의 동작이 들어 있다.
const PREPOSITION = '(?:in|on|at|to|from|with|like|through|across|into|onto|toward|towards|past|behind|beside|by|over|under|around|along|alongside|against|near|of|for|between|among|above|below|beneath|inside|outside|beyond|during|up|down|left|right|out|off|back|forward|and|or)'
const NOUN_THEN_NOUN = new RegExp(`\\b(?:the|an?|his|her|their|its)\\s+(?:(?!${PREPOSITION}\\b)[\\w'’-]+\\s+){1,3}(?:the|an?|his|her|their)\\s(?!(?:few|couple|moment|beat|bit|little|second|minute|while|whole|step|touch|fraction)\\b)`, 'i')

/** 카메라 말만으로 된 조각인가 — 다른 움직임이 섞인 듯하면 아니다(모르면 아니라고 본다). */
function cameraOnly(span: string): boolean {
  const rest = span.replace(PREFIX, ' ')
  if (/[;:]/.test(rest)) return false
  if (/\b(?:as|while|when|but|then|who|which|that|until|before|after|because|so|is|are|was|were|has|have|does|can|will)\b/i.test(rest)) return false
  if (!ingWordsAreCamera(rest)) return false
  // "to reveal …" 뒤는 드러냄 문장으로 그대로 남는다(revealSentence) — 아래 조건은 그 앞만 본다.
  const own = rest.split(/\b(?:to\s+reveal|reveal(?:s|ing)?)\b/i)[0]
  if (/\b(?:where|once|if|whose|he|she|they|it|we|you|shows|showing|(?<!\bto\s)show)\b/i.test(own)) return false
  // 카메라를 눈에 대는 사람 — 소품 카메라다("eye level"은 아니다).
  if (/\bto\s+(?:his|her|their|[\w-]+['’]s)\s+eye\b(?![- ]level)/i.test(own)) return false
  for (const m of own.matchAll(PEOPLE)) if (!AFTER_PERSON.test(own.slice(m.index + m[0].length).trimStart())) return false
  // "the letter Mina reveals" — 드러내는 것이 카메라가 아니라 그 사람이다.
  if (NOUN_THEN_NOUN.test(own) || new RegExp(`\\b(?:${NAME}|${PERSON_NOUN})\\s+reveal(?:s|ed)\\b`).test(rest)) return false
  // "and" 뒤는 카메라 동작이나 방향 말이어야 한다("and tilts up", "and up toward her face") — 방향 말 뒤에 다른 글이 이어지면("and down the hall lights go out") 다른 동작일 수 있다.
  for (const m of rest.matchAll(/\band\s+(.*?)(?=$|\band\b)/gi)) {
    const move = new RegExp(`^(?:${ADVERB}\\s+)*${VERB}\\b`, 'i')
    const direction = new RegExp(`^(?:${ADVERB}\\s+)*(?:in|out|up|down|left|right|back|forward|around|closer|away|slightly)(?=\\s*(?:$|,|(?:${PREPOSITION}|\\w+ly)\\b)|\\s+(?:the|an?|his|her|their)\\s+[\\w-]+\\s*$)`, 'i')
    const aroundName = new RegExp(`^(?:[Ii]n|[Oo]ut|[Uu]p|[Dd]own|[Aa]round|[Oo]ver|[Pp]ast|[Aa]cross|[Aa]long)\\s+${NAME}\\s*$`)
    if (!move.test(m[1]) && !direction.test(m[1]) && !aroundName.test(m[1].trim())) return false
  }
  // 쉼표 뒤는 카메라만 하는 -ing 조각이나 "revealing …"만 — "settling into a nod"처럼 사람의 동작일 수 있는 것은 아니다.
  return rest.split(',').slice(1).every((part) => /^\s*(?:(?:\w+ly|and|then)\s+)*(?:revealing|tracking|panning|tilting|dollying|zooming|craning)\b/i.test(part))
}

const PERSON = new RegExp(`^(?:${NAME}|(?:the|a|an)\\s+(?:[\\w-]+\\s+){0,4}(?:${PERSON_NOUN}))$`)
const FOCUS_ON = new RegExp(`\\b(?:on|onto|toward|towards|at|around|behind|beside|alongside|following|follows|with|closer\\s+to)\\s+((?:${NAME}|(?:the|a|an)\\s+(?:[\\w-]+\\s+){0,4}(?:${PERSON_NOUN}))(?:['’]s\\s+[\\w -]+)?)$`)

const capital = (s: string) => s.replace(/^[a-z]/, (m) => m.toUpperCase())

/** 뺀 카메라 말이 무엇을 드러낸다고 했으면 그 뜻만 남기는 문장(카메라 방향은 말하지 않는다). */
function revealSentence(removed: string): string[] {
  const what = /\b(?:to\s+(?:reveal|show)|reveal(?:s|ing)?)\s+(.+)$/i.exec(removed)?.[1].replace(/[,\s]+$/, '').trim()
  return what ? [`The move reveals ${what}`] : []
}

// 이름 뒤 소유격에 와도 그 사람인 것 — 몸의 부분 · 표정(앞에 꾸밈말 둘까지, 뒤에 "on the wheel" 같은 자리 말 하나까지). "Mina's mother a few steps" · "Jun's phone"은 다른 사람 · 사물이다.
const OWN_PART = /^(?:(?!(?:a|an|the|his|her|their|its)\b)[\w-]+\s+){0,2}(?:face|eyes?|hands?|gaze|expression|profile|shoulders?|back|head|lips?|mouth|smile|figure|silhouette|fingers?|fingertips?|feet|foot|steps?|footsteps|stride|movements?|gestures?|hair|tears?|cheeks?|jaw|brows?|forehead|neck|chest|arms?|body|features|fists?|knees?|legs?|iris|irises|pupils?|knuckles|palms?|ears?|nose|chin|wrists?|reaction)(?:\s+(?:on|in|at|under|over|against|around|behind|beside|near|through|by)\s+(?:(?:the|an?|his|her|their)\s+)?[\w-]+(?:\s+[\w-]+)?)?$/i

/** 남은 글이 대명사로 시작하면 카메라가 비추던 사람으로 바꾼다 — 사람 이름(또는 "the … woman")이 분명할 때만. 아니면 null. */
function withSubject(rest: string, head: string): string | null {
  const m = /^(she|he|they|it|her|his|their|its|this|these|those)\b\s*/i.exec(rest)
  if (!m) return rest
  const pronoun = m[1].toLowerCase()
  if (!['she', 'he', 'her', 'his'].includes(pronoun)) return null
  const focus = FOCUS_ON.exec(head.trim())?.[1]
  const owner = focus?.replace(/['’]s\s.*$/, '').trim()
  if (!focus || !owner || !PERSON.test(owner)) return null
  const part = /['’]s\s+(.+)$/.exec(focus)?.[1].trim()
  if (part && !OWN_PART.test(part)) return null
  // 카메라 조각에 다른 사람(일 수 있는 이름씨)이 더 있으면 대명사가 누구인지 모른다 — "past Jun toward Mina as he …"(11/23 2차 검토).
  const around = head.trim().replace(PREFIX, ' ')
  const people = new Set([...around.matchAll(PEOPLE)].map((p) => p[0].toLowerCase()))
  const before = around.slice(0, Math.max(0, around.lastIndexOf(owner)))
  if (people.size > 1 || /\b(?:the|an?|his|her|their|another|two|three)\s/i.test(before)) return null
  const after = rest.slice(m[0].length)
  return pronoun === 'her' || pronoun === 'his' ? `${owner}'s ${after}` : `${owner} ${after}`
}

const PRONOUN_START = /^(?:she|he|they|it|her|his|their|its|this|these|those)\b/i

/** 한 조각에서 카메라 말 빼기 — 뺄 수 있으면 남는 조각들(빈 배열 = 모두 카메라 말), 아니면 null(그대로 둔다). */
function stripClause(body: string): string[] | null {
  const lead = LEAD_IN.exec(body)
  if (lead) return cameraOnly(lead[1]) ? [capital(lead[2]), ...revealSentence(lead[1])] : null
  const subject = SUBJECT_AS.exec(body)
  if (subject) {
    // 남는 글이 화면 말("holding all three in frame")이면 카메라 동작이 이어진 것이다 — 그대로 둔다.
    if (!cameraOnly(subject[1]) || /\b(?:in frame|the frame|in view|off-?screen)\b/i.test(subject[2])) return null
    const rest = withSubject(subject[2], subject[1])
    return rest === null ? null : [capital(rest), ...revealSentence(subject[1])]
  }
  if (SUBJECT_ONLY.test(body)) return cameraOnly(body) ? revealSentence(body) : null
  const trailing = TRAILING.exec(body)
  if (trailing) {
    // "From the doorway, the camera drifts …"처럼 앞이 자리 말뿐이면 카메라 문장이 본문이다 — 그대로 둔다.
    const fragment = trailing[2].trimStart().startsWith(',') && /^(?:from|in|on|at|with|under|over|through|behind|beside|above|below|across|inside|outside|near)\b/i.test(trailing[1].trim())
    return fragment || !cameraOnly(trailing[3]) ? null : [capital(trailing[1]), ...revealSentence(trailing[3])]
  }
  return null
}

/**
 * 움직임 글(motion_prompt)에서 카메라 말을 빼고 인물 · 환경의 움직임만 남긴다 — 카메라는 움직임 약속 한 곳이 정한다.
 *   "무엇을 드러낸다"는 카메라 말 속에만 있을 수 있어 그 뜻은 남긴다(2026-08-11 #motion-vocab).
 */
export function withoutCameraMoves(text: string): string {
  const out: string[] = []
  const sentences = text.replace(/\s+/g, ' ').trim().split(SENTENCE_BREAK).filter(Boolean)
  for (const [at, sentence] of sentences.entries()) {
    const end = /[.!?]+$/.exec(sentence)?.[0] ?? ''
    const clauses = sentence.slice(0, sentence.length - end.length).split(/;\s*/).filter(Boolean)
    const results = clauses.map(stripClause)
    // 뒤 조각이 대명사로 시작하면 그 사람의 이름이 앞 카메라 말에 있을 수 있다 — 앞 조각을 그대로 둔다.
    for (let i = 0; i < clauses.length - 1; i++) if (PRONOUN_START.test(clauses[i + 1].trim())) results[i] = null
    // 다음 문장이 대명사로 시작하는데 이 문장의 카메라 말에만 사람 이름이 있으면(“The camera follows Mina. She …”) 이 문장도 그대로 둔다.
    const last = clauses.length - 1
    const left = results[last]
    if (left && PRONOUN_START.test(sentences[at + 1] ?? '')) {
      const said = [...clauses[last].replace(PREFIX, ' ').matchAll(PEOPLE)].map((m) => m[0])
      if (said.some((name) => !left.some((piece) => piece.includes(name)))) results[last] = null
    }
    if (results.every((r) => r === null)) {
      out.push(sentence)
      continue
    }
    const kept = results.flatMap((r, i) => (r === null ? [clauses[i]] : r))
    for (const [i, piece] of kept.entries()) {
      // 쌍반점으로 이어진 조각은 다시 쌍반점으로 잇되, 드러냄 문장과 첫 조각은 새 문장이다.
      if (i > 0 && !piece.startsWith('The move reveals') && results.length > 1 && out.length && !/[.!?]$/.test(out[out.length - 1])) out[out.length - 1] += `; ${piece.replace(/^(?:The|A|An|As|While|His|Her|Their|Its)\b/, (w) => w.toLowerCase())}`
      else {
        if (out.length && !/[.!?]$/.test(out[out.length - 1])) out[out.length - 1] += '.'
        out.push(capital(piece))
      }
    }
    if (out.length && !/[.!?]$/.test(out[out.length - 1])) out[out.length - 1] += end || '.'
  }
  return out.join(' ').trim()
}

// ── 장부가 더한 자세 바꿈 ──────────────────────────────────────────────────
/**
 * 상태 장부가 더한 "앉는다 · 일어선다"가 자리 글의 자세와 같으면(이미 앉아 있다) 싣지 않는다 — 걷기 · 달리기는 이어지는 움직임이라 남긴다.
 *   작가가 쓴 동작은 건드리지 않는다.
 */
export function withoutContradictedLedgerMotions(dyn: ShotDynamicSpec | null, staticSpec: unknown): ShotDynamicSpec | null {
  if (!dyn || !Array.isArray(dyn.character_motion)) return dyn
  const poseById = poseTextById(staticSpec)
  const kept = dyn.character_motion.filter((m) => {
    if (m?.source !== 'ledger' || typeof m.verb !== 'string') return true
    const end = postureFromMotionText(m.verb)?.posture
    const start = poseOf(poseById.get(m.character_id))
    return !(end && end === start && end !== 'walking' && end !== 'running')
  })
  return kept.length === dyn.character_motion.length ? dyn : { ...dyn, character_motion: kept }
}
