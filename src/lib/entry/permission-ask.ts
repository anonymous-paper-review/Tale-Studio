// 시작 화면 첫 글이 이야기를 내도 되는지 허락을 묻는 말인가(오너 2026-11-14 답 A ①) — "줄거리를 줘도 될까?" · "Can I give you my storyline?".
//   이런 말은 이야기 씨앗이 아니라 앱에게 하는 말이다. 이야기로 시작하면 물음에 답하는 줄 없이 산문이 만들어지므로
//   시작 화면이 먼저 "여기에 적어 주세요"로 답한다. 잘못 걸리면 진짜 이야기가 막히므로 좁게 읽는다 —
//   줄거리 낱말 · 주는 말 · 허락 끝이 한 문장에 모두 있어야 하고(한국어는 허락 끝이 문장 끝), 다른 사람에게 건네는 말(엄마에게 · tell him)이면 걸지 않으며,
//   줄거리 속 말("A ghost asks a child: may I …")처럼 앞에 이야기 글이 붙은 말도 걸지 않고, 허락 문장 밖의 글이 길면(이미 이야기를 적었다) 걸지 않는다.
//   한국어 · 영어만 읽는다(앱 말).
//   허락 물음 앞에 적은 설명("시리즈를 만들고 싶은데" · 앞 문장 · 앞 줄)은 버리지 않는다(리드 2026-11-14) — splitPermissionAsk 가 허락 물음의 틀만 덜어 내고
//   남은 설명을 돌려주면, 시작 화면이 그것을 이어 적은 줄거리 앞에 붙여 이야기 씨앗으로 쓴다. 설명이 되는 글은 둘이다:
//   ① 물음 앞의 글(앞 문장 · 앞 줄 · 쉼표 앞 절) ② 허락 문장 안에 쓴 이야기("고양이가 우주로 가는 이야기를 보내도 될까요?" → "고양이가 우주로 가는 이야기",
//   "Can I tell you a story about …" → "about …", "Could I share my idea: …" → "…"). 물음 뒤에 쓴 말("감사합니다!")은 씨앗에 넣지 않는다(리드 검토 11/14).
//   withoutPermissionAsk 는 화면에서 고르기 탭이 안내를 본 사람의 글에서 물음의 틀만 덜 때 쓴다(앞 · 안 · 뒤 글을 모두 남긴다).
//   물음 뒤에 줄거리를 이미 쓴 글(리드 검토 11/14)은 허락 물음으로 걸지 않는다 — storyWithoutPermissionAsk 가 인사 · 고마움 말과 물음꼴 문장을 뺀 글이 남으면
//   물음 문장만 뺀 글을 돌려주고, 시작 화면이 묻지 않고 그 글로 이야기를 시작한다. 남은 문장이 모두 덧말(it · it's · this · that 으로 시작하는 영어 문장, 길이 · 분량 · 형식만
//   말하는 문장)이면 줄거리가 아니라 지금처럼 허락 답을 하고, 덧말은 설명(preface)으로 들고 있어 줄거리를 이어 적을 때 앞에 붙는다.
//   약속: tests/producer/entry-permission-ask.test.ts
import { MIN_IDEA_CHARS, ideaLength } from '@/features/entry/options'

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

// 줄거리 속 말(한국어, 리드 2026-11-14 검토 낮음 3) — "소년은 소녀에게 물었다. 내 이야기를 들려줘도 될까?"처럼 앞 문장이 말하기로 끝나면 이야기 속 인물이 하는 말이다.
//   이야기 글의 끝맺음 "…다"만 읽는다 — "말씀드렸어요 · 말했어요" 같은 존댓말은 사용자 자신의 말이라 걸지 않는다. 같은 문장 안의 "…말했다: …"도 같다.
const KO_SPEECH = '(?:물었다|되물었다|말했다|속삭였다|외쳤다|소리쳤다|중얼거렸다|대답했다|답했다|이야기했다|얘기했다|부탁했다|제안했다|고백했다|털어놓았다|청했다|묻는다|말한다|속삭인다|외친다|소리친다|중얼거린다|대답한다|답한다|이야기한다|부탁한다|제안한다|고백한다|털어놓는다|청한다)' // i18n-ok: 이야기 속 말하기 끝맺음을 알아듣는 정규식
const KO_SPEECH_END = new RegExp(`${KO_SPEECH}["'”’」』)\\]]*[\\s.!?。…~]*$`)
const KO_SPEECH_LEAD = new RegExp(`${KO_SPEECH}\\s*[:：,，]`)

/** 이 허락 꼴 문장이 줄거리 속 인물의 말인가 — 앞 문장이 말하기로 끝났거나 같은 문장 앞에 "…말했다:"가 있다. */
function storyInternalSpeech(previous: string, sentence: string): boolean {
  return KO_SPEECH_END.test(previous) || KO_SPEECH_LEAD.test(sentence)
}

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

// 허락 말 + 주는 말 + 줄거리 낱말이 한 문장에 있으면 사이에 my · a · the · 꾸밈말이 있어도 건다(리드 2026-11-14 검토 보통 2) —
//   "Can I share my two-page script?" · "Is it okay to send the plot?" · "Could I give a synopsis?". 받는 사람이 다른 사람이거나(EN_THIRD_PARTY · "tell my mom the story" ·
//   "send my friend a story") 줄거리 속 말이면 걸지 않는다. 허락 말은 can/could/may I · is it ok to · am I allowed to 만이다(should I 는 이야기 씨앗일 수 있다).
const EN_OPEN_PLAIN = /\b(?:can|could|may)\s+i\b|\bis\s+it\s+(?:ok|okay|alright|all\s+right|fine)\s+(?:if\s+i|for\s+me\s+to|to)\b|\bam\s+i\s+(?:allowed|able)\s+to\b/i
const EN_GIVE_VERB = /\b(?:give|send|share|paste|upload|tell|write)\b/i
const EN_PLAIN_NOUN = '(?:story|stories|storyline|story\\s*line|plot|script|scripts|synopsis|idea|ideas|outline)'
const EN_DETERMINERS = 'my|our|your|the|a|an|this|that|some|these|those'
// 주는 말 바로 뒤: [you|me] + [my · the · a …] + 꾸밈말 0~3개 + 줄거리 낱말. 꾸밈말 자리에 관사 · 대명사가 또 오면 받는 사람이 따로 있는 꼴이라 맞지 않는다.
const EN_GIVES_STORY = new RegExp(`^\\s*(?:(?:you|me)\\s+)?(?:(?:${EN_DETERMINERS})\\s+)?(?:(?!(?:${EN_DETERMINERS}|you|me|him|her|them)\\b)[\\w'’-]+\\s+){0,3}${EN_PLAIN_NOUN}\\b`, 'i')

function enLeadOk(sentence: string, openAt: number): boolean {
  const lead = sentence.slice(0, openAt).trim()
  return lead.length <= MAX_LEAD_CHARS && !EN_NARRATIVE_LEAD.test(lead)
}

function enGivesStory(after: string): boolean {
  const verb = EN_GIVE_VERB.exec(after)
  if (!verb) return false
  if (EN_THIRD_PARTY.test(after.slice(verb.index))) return false
  return EN_GIVES_STORY.test(after.slice(verb.index + verb[0].length))
}

function enPermission(sentence: string): boolean {
  const plain = sentence.search(EN_OPEN_PLAIN)
  if (plain >= 0 && enLeadOk(sentence, plain) && enGivesStory(sentence.slice(plain))) return true
  const open = sentence.search(EN_OPEN)
  if (open < 0) return false
  if (!enLeadOk(sentence, open)) return false
  const after = sentence.slice(open)
  const verb = after.search(EN_VERB)
  if (verb < 0) return false
  const rest = after.slice(verb)
  if (EN_THIRD_PARTY.test(rest)) return false
  return (EN_NOUN_RE.test(rest) && EN_MARK.test(after)) || (EN_IT.test(rest) && EN_IT_MARK.test(after))
}

// ── 문장 가르기 ──────────────────────────────────────────────────────────────
const SENTENCE = /[^.!?。！？\n]+[.!?。！？]*/g
/** 쉼표로 이어진 절 하나(끝의 쉼표 포함) — 영어 "I want a series, and can I give you the storyline?"에서 앞 절은 설명으로 남긴다. */
const CLAUSE = /[^,，、;；]+[,，、;；]?/g
const CLAUSE_TAIL = /[\s,，、;；]+$/

// 인사말 · 말머리만으로 된 문장은 이야기 씨앗에 붙이지 않는다 — "안녕하세요!"가 이야기 맨 앞에 붙으면 산문이 인사로 시작한다. 문장 전체가 이 말일 때만이다.
const LEAD_ONLY = new Set([
  '안녕', '안녕하세요', '안녕하십니까', '반갑습니다', '반가워요', '하이', '헬로', '저기', '저기요', '있잖아', '있잖아요', // i18n-ok: 인사말을 알아듣는 목록
  '질문이있어요', '질문있어요', '질문이있는데요', '질문이있습니다', '궁금한게있어요', '궁금한게있는데요', '궁금한점이있어요', // i18n-ok: 말머리를 알아듣는 목록
  '여쭤볼게있어요', '물어볼게있어요', '하나물어볼게요', '하나여쭤볼게요', '부탁이있어요', '부탁이있는데요', // i18n-ok: 말머리를 알아듣는 목록
  'hi', 'hello', 'hey', 'hithere', 'hellothere', 'heythere', 'hiall', 'goodmorning', 'goodafternoon', 'goodevening', 'excuseme',
  'quickquestion', 'onequestion', 'question', 'ihaveaquestion', 'ihaveaquickquestion',
])

function isLeadOnly(sentence: string): boolean {
  return LEAD_ONLY.has(sentence.replace(/[\s!?.~…,，。！？^]+/g, '').toLowerCase())
}

function isPermissionSentence(sentence: string): boolean {
  return koPermission(sentence) || enPermission(sentence)
}

/** 영어 허락 문장에서 허락 물음이 시작하는 자리 — 쉼표로 이어진 앞 절이 있으면 가장 짧은 뒷부분만 물음으로 보고 앞 절은 설명으로 남긴다. */
function permissionStart(sentence: string): number {
  const starts = Array.from(sentence.matchAll(CLAUSE), (m) => m.index ?? 0)
  for (let i = starts.length - 1; i > 0; i--) {
    if (isPermissionSentence(sentence.slice(starts[i]).trim())) return starts[i]
  }
  return 0
}

function tidy(text: string): string {
  return text.replace(/[ \t]+/g, ' ').replace(/ ?\n ?/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
}

// ── 허락 문장 안에 쓴 이야기 · 설명(리드 2026-11-14 검토 보통 2) ──────────────────
// 한국어: 물음의 핵심(줄거리 낱말 · "이거")이 시작하는 가장 뒤의 자리를 찾아, 그 앞의 글을 설명으로 남긴다.
//   앞 글이 "…인데 · …는데"처럼 절로 끝나면 줄거리 낱말은 물음의 틀이라 뺀다("시리즈를 만들고 싶은데 줄거리를 줘도 될까?" → "시리즈를 만들고 싶은데").
//   그 밖의 말로 끝나면(…가는 이야기를) 줄거리 낱말도 이야기의 일부라 붙인다("고양이가 우주로 가는 이야기"). 나 · 먼저 · 직접 · 쓴 같은 물음의 틀 낱말은 양쪽 끝에서 뺀다.
const KO_ASK_STICKY = [KO_GIVE_ASK, KO_TELL_ASK, KO_THING_ASK].map((re) => new RegExp(re.source, 'y'))
const KO_STORY_STICKY = new RegExp(KO_STORY, 'y')
const KO_FRAME_WORDS =
  '제가|내가|저는|나는|저가|저희가|저희는|우리가|우리는|저의|나의|저희|우리|제|내|혹시|먼저|직접|일단|우선|그럼|그러면|지금|바로|여기에|여기서|여기|한\\s*번|좀|그냥|아|음|네|자|저기요|저기|있잖아요|있잖아|새로|따로|미리|' + // i18n-ok: 물음의 틀 낱말을 알아듣는 정규식
  '써\\s*둔|쓴|만들어\\s*둔|만든|정리해\\s*둔|정리한|준비해\\s*둔|준비한|생각한|구상한|기획한|적어\\s*둔|적은|정한|짠|가지고\\s*있는|갖고\\s*있는|가진' // i18n-ok: 물음의 틀 낱말을 알아듣는 정규식
const KO_FRAME_HEAD = new RegExp(`^(?:${KO_FRAME_WORDS})(?=\\s|$)\\s*`)
const KO_FRAME_END = new RegExp(`(?:^|\\s)(?:${KO_FRAME_WORDS})$`)
const KO_CLAUSE_END = /(?:데|데요|고|서|며|면서|니까|지만|요|다|어|아|야|죠|지|해|래|네|까|거든|잖아)$/ // i18n-ok: 절이 끝나는 말을 알아듣는 정규식
const TRAIL_MARKS = /[\s,，、;；.。!！?？…~]+$/

/** 물음 앞 글에서 물음의 틀 낱말(끝에 붙은 제가 · 먼저 · 쓴 …)을 뺀다. 글이 틀 낱말뿐이면 빈 글, 앞머리의 "저는"처럼 설명에 딸린 낱말은 남긴다. */
// 꾸밈말 + 줄거리 낱말뿐이면 설명으로 남기지 않는다(리드 2026-11-14 검토 낮음 2) — "엄청 긴 이야기를" · "재밌는 아이디어를" · "제 소설 줄거리를" · "짧은 줄거리를".
//   정도 말 · 흔한 꾸미는 말(관형형) · 작품 자체를 가리키는 말(소설 · 영상 …)과 물음의 틀 낱말만으로 된 글이다. 이 밖의 낱말이 하나라도 있으면 설명이다("무서운 귀신 이야기").
const KO_MODIFIER_WORDS = new Set([
  '엄청', '아주', '너무', '매우', '꽤', '정말', '진짜', '완전', '굉장히', '무척', '되게', '좀', '조금', '약간', '대충', '간단히', '많이', '길게', '짧게', // i18n-ok: 정도 말을 알아듣는 목록
  '긴', '짧은', '재밌는', '재미있는', '웃긴', '슬픈', '무서운', '감동적인', '새로운', '새', '좋은', '간단한', '기본적인', '대략적인', '멋진', '예쁜', '신나는', '흥미로운', '특별한', '소소한', '작은', '큰', '많은', '적은', '오래된', // i18n-ok: 꾸미는 말을 알아듣는 목록
  '소설', '웹소설', '작품', '글', '영상', '영화', '드라마', '웹툰', '책', '시리즈', '프로젝트', // i18n-ok: 작품 자체를 가리키는 말을 알아듣는 목록
])
const KO_JOSA_TAIL = /(?:의|를|을|가|이|은|는|도|만)$/ // i18n-ok: 낱말 끝의 조사를 알아듣는 정규식
const KO_FRAME_TOKEN = new RegExp(`^(?:${KO_FRAME_WORDS})$`)

function modifierOnly(text: string): boolean {
  const tokens = text.split(/[\s,，、]+/).filter(Boolean)
  const known = (word: string) => KO_MODIFIER_WORDS.has(word) || KO_FRAME_TOKEN.test(word)
  return tokens.length > 0 && tokens.every((token) => known(token) || known(token.replace(KO_JOSA_TAIL, '')))
}

function stripFrameWords(text: string): string {
  let cur = text.replace(TRAIL_MARKS, '').trim()
  for (;;) {
    const next = cur.replace(KO_FRAME_END, '').replace(TRAIL_MARKS, '').trim()
    if (next === cur) break
    cur = next
  }
  let head = cur
  for (;;) {
    const next = head.replace(KO_FRAME_HEAD, '').trim()
    if (next === head) break
    head = next
  }
  return head ? cur : ''
}

function koInline(sentence: string): string {
  const compact: string[] = []
  const map: number[] = []
  for (let i = 0; i < sentence.length; i++) {
    if (/\s/.test(sentence[i])) continue
    compact.push(sentence[i])
    map.push(i)
  }
  const joined = compact.join('')
  let start = -1
  for (let i = joined.length - 1; i >= 0 && start < 0; i--) {
    for (const re of KO_ASK_STICKY) {
      re.lastIndex = i
      if (re.test(joined)) {
        start = i
        break
      }
    }
  }
  if (start < 0) return ''
  const clean = stripFrameWords(sentence.slice(0, map[start]))
  if (!clean || modifierOnly(clean)) return ''
  KO_STORY_STICKY.lastIndex = start
  const noun = KO_STORY_STICKY.exec(joined)?.[0] ?? ''
  return KO_CLAUSE_END.test(clean) || !noun ? clean : `${clean} ${noun}`
}

// 영어: 허락 문장 안의 ": …"(콜론 뒤) 또는 "about · where · featuring · starring …"부터를 설명으로 남긴다.
//   "tell you about my idea"처럼 줄거리 낱말만 가리키면 설명이 아니다.
const EN_COLON = /[:：]|\s[-–—]\s/
const EN_CONTENT_LEAD = /\b(?:about|where|featuring|starring)\b/i
const EN_DETERMINER = /^(?:my|our|your|the|a|an|this|that|these|those|some)\s+/i
const EN_BARE_NOUN = new RegExp(`^${EN_NOUN}$`, 'i')
// "the story of a fox and a crow" — 줄거리 낱말 바로 뒤의 of 부터가 설명이다.
const EN_OF_LEAD = /\b(?:story|stories|plot|idea|ideas|synopsis|outline|script|scripts)\s+(of\s+\S.*)$/i
// 설명 끝에 붙은 물음의 틀 낱말("…about bakers here" · "… - instead")
const EN_TRAIL_FRAME = /(?:\s*[-–—,]\s*|\s+)(?:here|now|first|please|instead|too|as well|right now)$/i

function enInline(clause: string): string {
  const open = clause.search(EN_OPEN)
  if (open < 0) return ''
  const after = clause.slice(open)
  const verb = after.search(EN_VERB)
  if (verb < 0) return ''
  const rest = after.slice(verb)
  let content = ''
  const colon = rest.search(EN_COLON)
  if (colon >= 0) content = rest.slice(colon).replace(/^(?:[:：]|\s[-–—]\s)\s*/, '')
  else {
    const lead = EN_CONTENT_LEAD.exec(rest)
    if (lead) content = rest.slice(lead.index)
    else content = EN_OF_LEAD.exec(rest)?.[1] ?? ''
  }
  content = content.replace(/[\s?？!！.。]+$/, '').trim()
  for (;;) {
    const next = content.replace(EN_TRAIL_FRAME, '').replace(/[\s?？!！.。]+$/, '').trim()
    if (next === content) break
    content = next
  }
  if (!content) return ''
  const bare = content.replace(/^(?:about|where|featuring|starring|of)\s+/i, '').replace(EN_DETERMINER, '').trim()
  return EN_BARE_NOUN.test(bare) ? '' : content
}

/** 허락 문장에서 설명이 되는 글 — 앞 절(영어, 쉼표 앞)과 문장 안에 쓴 이야기. 물음의 틀은 뺀다. */
function permissionPieces(sentence: string): string {
  if (koPermission(sentence.trim())) return koInline(sentence)
  const start = permissionStart(sentence)
  const head = sentence.slice(0, start).replace(CLAUSE_TAIL, '').trim()
  return [isLeadOnly(head) ? '' : head, enInline(sentence.slice(start))].filter(Boolean).join(' ')
}

// 물음 뒤 문장 가르기(리드 2026-11-14 검토 보통 1) — 인사 · 고마움 말과 물음꼴 문장(물음표 · 묻는 끝맺음)은 줄거리가 아니다. 이것들을 뺀 글이 남으면 줄거리를 이미 준 것이다.
const CLOSING_ONLY = new Set([
  '감사합니다', '감사해요', '감사드립니다', '고맙습니다', '고마워요', '고마워', '땡큐', '잘부탁드립니다', '잘부탁드려요', '잘부탁해요', '부탁드립니다', '부탁드려요', '수고하세요', '수고하셨습니다', // i18n-ok: 고마움 · 맺음 말을 알아듣는 목록
  'thanks', 'thankyou', 'thanksalot', 'thankyouverymuch', 'thankyousomuch', 'thanksinadvance', 'thankyouinadvance', 'manythanks', 'thx', 'cheers', 'please', 'pleasethanks', 'bye',
])
const KO_QUESTION_WORD_END = /(?:나요|인가요|일까요|을까요|할까요|까요|ㅂ니까|습니까)\s*[.!~]*$/ // i18n-ok: 묻는 끝맺음을 알아듣는 정규식

function isAfterNoise(sentence: string): boolean {
  const t = sentence.trim()
  return CLOSING_ONLY.has(t.replace(/[\s!?.~…,，。！？^]+/g, '').toLowerCase()) || /[?？]\s*$/.test(t) || KO_QUESTION_WORD_END.test(t) || isPermissionSentence(t)
}

// 덧말(리드 2026-11-14 검토) — 물음 뒤의 문장이 줄거리가 아니라 길이 · 형식 · 소개만 말하는 말이다: it · it's · this · that 으로 시작하는 영어 문장("It is long." · "This is my first try."),
//   길이 · 분량 · 형식만 말하는 문장("about 3 pages" · "8회짜리예요." · "3페이지 정도예요."). 덧말만 남으면 줄거리를 준 것이 아니라 허락 답을 하고, 덧말은 설명(씨앗 앞)으로 들고 있는다.
//   \W 는 한글도 잡으므로 쓰지 않고 따옴표 · 문장부호를 직접 적는다.
const MARKS = `[\\s.,!~…"'“”‘’()\\[\\]-]*`
const EN_META_START = new RegExp(`^${MARKS}(?:it|this|that)\\b`, 'i')
// 길이 · 분량 · 형식만 말하는 문장 — 숫자 + 단위("3 pages" · "12 episodes" · "8회" · "두 장")와 군말(about · each · 짜리 · 정도 · 이에요 …)을 지우면 아무것도 남지 않는다.
const EN_LENGTH_PHRASE = /\d[\d,]*\s*-?\s*(?:pages?|episodes?|minutes?|mins?|parts?|chapters?|words?|seasons?|scenes?|hours?|seconds?)\b/gi
const EN_LENGTH_FILLER = /\b(?:about|around|roughly|approximately|approx|only|just|maybe|each|per|total|in|long|or|so|and|of|a|an|the|with|plus|episode)\b/gi
const KO_LENGTH_PHRASE = /(?:A\d\s*)?(?:\d[\d,]*|한|두|세|네|다섯|여섯|일곱|여덟|아홉|열)\s*(?:페이지|쪽|장|분|회|화|편|글자|자|부작|부|초|시간)/g // i18n-ok: 길이 · 분량 말을 알아듣는 정규식
const KO_LENGTH_FILLER = /(?:이에요|예요|입니다|이랍니다|이야|이다|이고요|이고|인데|이며|씩|짜리|정도|쯤|가량|분량|안팎|이상|이하|내외|총|약|대략|대충|거의|대강|은|는|이|가|도|당)/g // i18n-ok: 길이 · 분량 말의 군말을 알아듣는 정규식

const LENGTH_STRIP = /[\s.,!~…"'“”‘’()\[\];:/-]+/g

function lengthOnly(text: string): boolean {
  // 숫자 + 단위가 있고, 그것과 군말을 지운 뒤 문장부호까지 걷어 내면 아무것도 남지 않아야 한다.
  const leftover = (phrase: RegExp, filler: RegExp): string | null =>
    new RegExp(phrase.source, phrase.flags.replace('g', '')).test(text) ? text.replace(phrase, '').replace(filler, '').replace(LENGTH_STRIP, '') : null
  return leftover(EN_LENGTH_PHRASE, EN_LENGTH_FILLER) === '' || leftover(KO_LENGTH_PHRASE, KO_LENGTH_FILLER) === ''
}

function isMetaRemark(sentence: string): boolean {
  const t = sentence.trim()
  return EN_META_START.test(t) || lengthOnly(t)
}

interface Analysis {
  found: boolean
  /** 첫 허락 문장까지의 설명(앞 글 + 그 문장 안의 설명). */
  preface: string
  /** 허락 물음의 틀만 덜어 낸 글 전체(앞 · 안 · 뒤). */
  remainder: string
  /** 물음 문장과 물음 뒤의 인사 · 고마움 말 · 물음꼴 문장을 뺀 글 전체(앞 · 안 · 뒤 줄거리). */
  story: string
  /** 물음 뒤에 쓴 글에서 인사 · 고마움 말 · 물음꼴 문장을 뺀 나머지. */
  afterStory: string
  /** 그 나머지에 덧말이 아닌 문장이 있다. */
  hasNonMeta: boolean
}

function analyze(text: string | null | undefined): Analysis {
  const body = (text ?? '').trim()
  const kept: string[] = []
  const storyKept: string[] = []
  const afterKept: string[] = []
  const metaKept: string[] = []
  let hasNonMeta = false
  let found = false
  let prefaceEnd = 0
  let last = 0
  let previous = ''
  for (const m of body.matchAll(SENTENCE)) {
    const start = m.index ?? 0
    const gap = body.slice(last, start)
    kept.push(gap)
    storyKept.push(gap)
    last = start + m[0].length
    const sentence = m[0]
    const trimmed = sentence.trim()
    if (!trimmed) {
      kept.push(sentence)
      storyKept.push(sentence)
    } else if (isPermissionSentence(trimmed) && !storyInternalSpeech(previous, trimmed)) {
      const inside = permissionPieces(sentence)
      if (inside && !isLeadOnly(inside)) {
        const piece = `${sentence.match(/^\s*/)?.[0] ?? ''}${inside}`
        kept.push(piece)
        if (!found) storyKept.push(piece)
      }
      if (!found) {
        found = true
        prefaceEnd = kept.length
      }
    } else if (!isLeadOnly(trimmed)) {
      kept.push(sentence)
      if (!found || !isAfterNoise(trimmed)) storyKept.push(sentence)
      if (found && !isAfterNoise(trimmed)) {
        afterKept.push(sentence)
        if (isMetaRemark(trimmed)) metaKept.push(sentence)
        else hasNonMeta = true
      }
    }
    if (trimmed) previous = trimmed
  }
  const tail = body.slice(last)
  kept.push(tail)
  storyKept.push(tail)
  return {
    found,
    // 물음 뒤의 덧말은 줄거리가 아니지만 잃지 않게 설명으로 들고 있는다(인사 · 고마움 말 · 물음꼴 문장은 넣지 않는다).
    preface: tidy(kept.slice(0, prefaceEnd).join('') + metaKept.join('')),
    remainder: tidy(kept.join('')),
    story: tidy(storyKept.join('')),
    afterStory: tidy(afterKept.join('')),
    hasNonMeta,
  }
}

/** 물음 뒤에 줄거리를 이미 썼나 — 인사 · 고마움 말 · 물음꼴 문장을 뺀 글에 덧말이 아닌 문장이 하나라도 있고 합쳐 첫 글 최소 길이(20자) 이상이다. */
function hasStoryAfter(analysis: Analysis): boolean {
  return analysis.found && analysis.hasNonMeta && ideaLength(analysis.afterStory) >= MIN_IDEA_CHARS
}

export interface PermissionSplit {
  /** 이 글이 "이야기(줄거리 · 아이디어 · 대본)를 내도 되나요?"라고 허락을 묻는 말인가. */
  asking: boolean
  /** 이야기 씨앗 앞에 붙일 설명 — 물음 앞에 적은 글과 허락 문장 안에 쓴 이야기(인사말만이면 빈 글). 물음 뒤에 쓴 말은 넣지 않는다. 허락을 묻는 말이 아니면 빈 글. */
  preface: string
}

const NOT_ASKING: PermissionSplit = { asking: false, preface: '' }

function charCount(text: string): number {
  return Array.from(text.replace(/\s+/g, '')).length
}

/**
 * 허락을 묻는 말인지 가르고, 이야기 씨앗 앞에 붙일 설명은 따로 돌려준다.
 *   허락 물음 밖의 글(앞 · 문장 안 · 뒤)이 120자를 넘으면 이야기를 이미 적은 것으로 보아 허락을 묻는 말이 아니다 — ignoreLength 는 이 가름을 건너뛴다
 *   (화면에서 고르기 탭에서 안내를 본 뒤 이어 적은 글).
 */
export function splitPermissionAsk(text: string | null | undefined, opts?: { ignoreLength?: boolean }): PermissionSplit {
  const analysis = analyze(text)
  if (!analysis.found) return NOT_ASKING
  // 물음 뒤에 줄거리를 이미 썼으면 허락을 묻는 말이 아니다 — 시작 화면이 storyWithoutPermissionAsk 로 그 줄거리로 시작한다.
  if (hasStoryAfter(analysis)) return NOT_ASKING
  if (!opts?.ignoreLength && charCount(analysis.remainder) > MAX_OTHER_CHARS) return NOT_ASKING
  return { asking: true, preface: analysis.preface }
}

/**
 * 허락 물음 뒤에 줄거리를 이미 썼으면 물음 문장만 뺀 글(앞 설명 + 뒤 줄거리), 아니면 null(리드 2026-11-14 검토 보통 1).
 *   "May I give you my plot? A girl swaps bodies with her grandmother." → "A girl swaps bodies with her grandmother." — 물음 뒤의 인사 · 고마움 말 · 물음꼴 문장도 뺀다.
 */
export function storyWithoutPermissionAsk(text: string | null | undefined): string | null {
  const analysis = analyze(text)
  return hasStoryAfter(analysis) ? analysis.story : null
}

/** 허락 물음의 틀만 덜어 낸 글 — 앞 · 문장 안 · 뒤에 쓴 글은 모두 남긴다. 허락 물음이 없으면 글 그대로(길이 가름은 하지 않는다). */
export function withoutPermissionAsk(text: string | null | undefined): string {
  const analysis = analyze(text)
  return analysis.found ? analysis.remainder : (text ?? '').trim()
}

/** 이 글이 "이야기(줄거리 · 아이디어 · 대본)를 내도 되나요?"라고 허락을 묻는 말인가. */
export function asksToShareStory(text: string | null | undefined): boolean {
  return splitPermissionAsk(text).asking
}
