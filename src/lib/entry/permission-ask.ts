// 시작 화면 첫 글이 이야기를 내도 되는지 허락을 묻는 말인가(오너 2026-11-14 답 A ①) — "줄거리를 줘도 될까?" · "Can I give you my storyline?".
//   이런 말은 이야기 씨앗이 아니라 앱에게 하는 말이다. 이야기로 시작하면 물음에 답하는 줄 없이 산문이 만들어지므로
//   시작 화면이 먼저 "여기에 적어 주세요"로 답한다. 잘못 걸리면 진짜 이야기가 막히므로 좁게 읽는다 —
//   줄거리 낱말 · 주는 말 · 허락 끝이 한 문장에 모두 있어야 하고(한국어는 허락 끝이 문장 끝), 다른 사람에게 건네는 말(엄마에게 · tell him)이면 걸지 않으며,
//   줄거리 속 말("A ghost asks a child: may I …")처럼 앞에 이야기 글이 붙은 말도 걸지 않고, 허락 문장 밖의 글이 길면(이미 이야기를 적었다) 걸지 않는다.
//   한국어 · 영어만 읽는다(앱 말).
//   약속: tests/producer/entry-permission-ask.test.ts

/** 허락 문장 밖의 글이 이만큼(공백 뺀 글자)을 넘으면 이야기를 이미 적은 것으로 본다. */
const MAX_OTHER_CHARS = 120
/** 한 문장에서 줄거리 낱말과 주는 말 사이에 끼어도 되는 글자 수(공백 뺀). */
const KO_GAP = 24

// ── 한국어 ───────────────────────────────────────────────────────────────────
const KO_STORY = '(?:줄거리|스토리라인|스토리|이야기|아이디어|대본|시나리오|플롯|구상|기획|시놉시스|서사|콘셉트|컨셉|설정|내용)' // i18n-ok: 사용자 말에서 줄거리 낱말을 알아듣는 정규식
// 앱에게 주는 말 — 다른 사람에게 건네는 말은 아래 KO_THIRD_PARTY 가 걸러낸다.
const KO_GIVE = '(?:줘|드려|보내|보내줘|보내드려|올려|붙여|공유해|공유드려|제출해|제공해|알려|알려줘|알려드려|보여|보여줘|보여드려|넘겨|넘겨줘|전해|전해줘|전달해|전달드려)' // i18n-ok: 주는 말을 알아듣는 정규식
// 말하고 쓰는 말은 "내가 · 먼저 · 직접 · 여기"처럼 나를 가리키는 말이 함께 있어야 한다.
const KO_TELL = '(?:말해|말씀드려|써|적어|설명해|설명드려|풀어|입력해|쓰고)' // i18n-ok: 말하고 쓰는 말을 알아듣는 정규식
const KO_PERMISSION = '(?:될까요?|되나요?|되니|되겠(?:어요?|나요?|니)?|돼요?|됩니까|괜찮(?:을까요?|나요?|아요?|을지|겠어요?|겠나요?)?|좋을까요?|좋나요?|좋겠(?:어요?|나요?)?|좋아요?(?=[?？])|되려나|될지|될런지)' // i18n-ok: 허락을 묻는 끝맺음을 알아듣는 정규식
const KO_MARK = /(?:내가|제가|저가|나는|저는|먼저|직접|여기|너한테|네게|너에게|당신에게|AI에게|루미에게|Lumi에게)/ // i18n-ok: 나를 가리키는 말
const KO_APP_ADDRESSEE = /(?:너한테|네게|너에게|당신에게|AI에게|루미에게|Lumi에게)/g // i18n-ok: 앱에게 하는 말
const KO_THIRD_PARTY = /(?:에게|한테)/ // i18n-ok: 다른 사람에게 건네는 말

// 허락 끝이 문장 끝이어야 한다 — "줄거리를 줘도 될까 고민하는 작가의 하루"는 줄거리 속 말이다.
const KO_END = '[?？!~.…ㅠㅜ^]*$' // i18n-ok: 문장 끝 기호 · 울음 글자를 알아듣는 정규식
// 줄거리 낱말 대신 "그걸 · 이거 · 써 둔 것"으로 가리키는 말("이거 올려도 돼요?").
const KO_THING = '(?:그걸|이걸|그거|이거|그것|이것|써둔(?:것|거|게)|준비한(?:것|거|게)|만들어둔(?:것|거|게))' // i18n-ok: 이야기를 가리키는 말을 알아듣는 정규식
const KO_GIVE_SHORT = '(?:줘|드려|보내|보내줘|보내드려|올려|붙여|공유해|제출해)' // i18n-ok: 주는 말을 알아듣는 정규식
const KO_GIVE_ASK = new RegExp(`${KO_STORY}[^?？!]{0,${KO_GAP}}?${KO_GIVE}(?:도|두)${KO_PERMISSION}${KO_END}`) // i18n-ok: 허락을 묻는 한국어 말을 알아듣는 정규식
const KO_TELL_ASK = new RegExp(`${KO_STORY}[^?？!]{0,${KO_GAP}}?${KO_TELL}(?:도|두)${KO_PERMISSION}${KO_END}`) // i18n-ok: 허락을 묻는 한국어 말을 알아듣는 정규식
const KO_THING_ASK = new RegExp(`${KO_THING}[^?？!]{0,12}?${KO_GIVE_SHORT}(?:도|두)${KO_PERMISSION}${KO_END}`) // i18n-ok: 허락을 묻는 한국어 말을 알아듣는 정규식

function koPermission(sentence: string): boolean {
  const compact = sentence.replace(/\s+/g, '')
  // 앱 말고 다른 사람에게 건네는 말("엄마에게 이야기를 보내도 될까")은 줄거리 속 말이다.
  if (KO_THIRD_PARTY.test(compact.replace(KO_APP_ADDRESSEE, ''))) return false
  if (KO_GIVE_ASK.test(compact) || KO_THING_ASK.test(compact)) return true
  return KO_TELL_ASK.test(compact) && KO_MARK.test(compact)
}

// ── 영어 ─────────────────────────────────────────────────────────────────────
const EN_OPEN =
  /\b(?:can|could|may|might|should|shall)\s+i\b|\bis\s+it\s+(?:ok|okay|alright|all\s+right|fine)\s+(?:if\s+i|for\s+me\s+to|to)\b|\bdo(?:es)?\s+(?:you|it)\s+mind\s+if\s+i\b|\bwould\s+(?:it\s+be\s+(?:ok|okay|alright|all\s+right|fine)\s+(?:if\s+i|for\s+me\s+to)|you\s+mind\s+if\s+i)\b|\bam\s+i\s+(?:allowed|able)\s+to\b/i
const EN_VERB = /\b(?:give|send|share|tell|show|write|type|paste|upload|provide|submit|describe|explain|outline|pitch|hand|drop|bring|offer|use)\b/i
const EN_NOUN = '(?:story|stories|storyline|story\\s*line|plot|plotline|idea|ideas|script|screenplay|synopsis|outline|treatment|draft|concept|premise|scenario|summary|narrative|details)'
const EN_NOUN_RE = new RegExp(`\\b${EN_NOUN}\\b`, 'i')
// 내 이야기 · 앱에게 하는 말 — "my mom"처럼 다른 사람을 가리키는 my 는 표시가 아니다.
const EN_MARK = new RegExp(`\\b(?:you|your|here|first|myself|upfront)\\b|\\b(?:my|own)\\s+(?:own\\s+)?${EN_NOUN}\\b`, 'i')

// 줄거리 속 말("A ghost asks a child: may I send you a story?")은 앞에 이야기 글이 붙는다 — 허락 말 앞은 짧은 인사말 정도만 올 수 있다.
const EN_NARRATIVE_LEAD = /\b(?:asks?|asked|says?|said|wonders?|wondered|whispers?|whispered|thinks?|thought|repl(?:y|ies|ied)|tells?|told|mutters?|muttered|murmur(?:s|ed)?|shouts?|shouted)\b|["“”]/i
const MAX_LEAD_CHARS = 30
// 다른 사람에게 건네는 말("share my idea with the group" · "tell him my idea")은 줄거리 속 말이다.
const EN_THIRD_PARTY = /\b(?:him|her|them|his|their|everyone|everybody|someone|anyone)\b|\b(?:with|to)\s+(?:the|a|an|my|his|her|their|our)\b/i
// 줄거리 낱말 대신 "it"으로 가리키는 말("Can I paste it here?") — 앱에게 하는 표시(here · you · first)가 함께 있어야 한다.
const EN_IT = /\b(?:paste|upload|send|share|give|show|type|submit)\s+(?:it|them)\b/i
const EN_IT_MARK = /\b(?:here|you|first)\b/i

function enPermission(sentence: string): boolean {
  const open = sentence.search(EN_OPEN)
  if (open < 0) return false
  const lead = sentence.slice(0, open).trim()
  if (lead.length > MAX_LEAD_CHARS || EN_NARRATIVE_LEAD.test(lead)) return false
  const after = sentence.slice(open)
  const verb = after.search(EN_VERB)
  if (verb < 0) return false
  const rest = after.slice(verb)
  if (EN_THIRD_PARTY.test(rest)) return false
  return (EN_NOUN_RE.test(rest) && EN_MARK.test(after)) || (EN_IT.test(rest) && EN_IT_MARK.test(after))
}

// ── 문장 가르기 ──────────────────────────────────────────────────────────────
function sentencesOf(text: string): string[] {
  return (text.match(/[^.!?。！？\n]+[.!?。！？]*/g) ?? []).map((s) => s.trim()).filter(Boolean)
}

/** 이 글이 "이야기(줄거리 · 아이디어 · 대본)를 내도 되나요?"라고 허락을 묻는 말인가. */
export function asksToShareStory(text: string | null | undefined): boolean {
  const body = (text ?? '').trim()
  if (!body) return false
  const sentences = sentencesOf(body)
  const asking = sentences.filter((s) => koPermission(s) || enPermission(s))
  if (asking.length === 0) return false
  const other = sentences.filter((s) => !asking.includes(s)).join('')
  return Array.from(other.replace(/\s+/g, '')).length <= MAX_OTHER_CHARS
}
