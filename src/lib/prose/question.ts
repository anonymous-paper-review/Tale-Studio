// Writer 채팅에서 "물음"과 "고쳐 달라는 부탁"을 가른다(오너 2026-11-14 답 B ①) — 문단을 붙인 채 보낸 물음은 AI 가 답하고, 그 밖의 말은 계속 문단 수정 요청이다.
//   11/14 채팅 점검 B: 문단을 골라 둔 채 보낸 질문이 "그 문단만 고쳐 주세요" 수정 요청이 되어 답을 못 받았다.
//   잘못 걸리면 고쳐 달라는 말이 답변으로 바뀌므로(제일 위험) 헷갈리면 지금처럼 고치기로 간다(리드 2026-11-14 검토).
//   물음은 아래 둘을 모두 만족할 때만이다:
//   ① 묻는 낱말이나 알려 달라는 말이 있다(누가 · 무엇 · 왜 · 어디 · 언제 · 몇 · 알려 · 설명 · 요약 / who · what · why · where · tell me · explain · summarize …).
//      물음표만 있는 말("해피엔딩으로 하면?" · "민수가 우는 걸로?" · "Could Minsu be a girl?")은 제안이라 물음이 아니다.
//   ② 아래 중 하나도 없다: 고치라는 낱말(바꿔 · 줄여 · 넣어 · make · shorten …) · 정도 말(더 · 좀 더 · shorter …) ·
//      바꿔 보자는 제안(어때 · 낫지 않을까 · 좋을 것 같 · what if · could/should + 이름 · is it possible …) · 부탁 꼴(해 줄래 · can you …).
//      단, what · why · how · who · where · when 으로 시작하는 영어 물음의 "조동사 + 대명사"는 제안이 아니다("Why would he lie?") — what if · how about · why not 은 그대로 제안이다.
//      단, 그 wh 물음에서도 "can't · cannot · couldn't · shouldn't + 대명사 · 이름"("Why can't Minsu be a girl?" · "Why shouldn't it rain here?")과 끝에 붙은 instead("Who should say this line instead?")는
//      "그렇게 해 달라"는 제안이다(리드 2026-11-14 낮음 c) — won't · wouldn't · didn't 는 이야기 속 까닭을 묻는 말이라 물음으로 둔다("Why wouldn't he tell her?").
//      단, 알려 달라는 말(설명 · tell me · explain …)이 함께 있는 부탁 꼴("설명해 줄래?")은 물음이다. 보여 줘 · 정리해 줘 · describe 는 알려 달라는 말이 아니라 고치기 쪽이다.
//   한국어 · 영어를 읽고 중국어는 묻는 낱말 · 물음표와 고치는 낱말 몇 개만 읽는다.
//   약속: tests/chat/prose-question.test.ts
import { REVISION_CUE } from '@/lib/prose/writer-chat'

const QUESTION_MARK = /[?？]/

// ① 고치라는 낱말 — 한국어 · 영어 · 중국어. REVISION_CUE(writer-chat)에 더해 묻는 말 속에 자주 끼는 낱말까지 본다.
const EDIT_WORD = new RegExp(
  [
    '고치|고쳐|고칠|고친|수정|바꾸|바꿔|바꿀|바꾼|바뀌|다듬|줄이|줄여|줄일|줄인|늘리|늘려|늘릴|늘린|넣|빼|뺄|지우|지워|지울|삭제|제거|추가|교체|변경|합치|합쳐|나누|나눠|더하|더할|붙이|만들|(?:다시|새로)\\s*(?:써|쓰)', // i18n-ok: 사용자 말에서 고치라는 낱말을 알아듣는 정규식
    '\\b(?:change[sd]?|changing|edit|add|remove|delete|split|merge|rewrite|shorten|lengthen|make|polish|rework|improve|adjust|update|fix|cut|tweak|revise|trim|expand|replace|swap|insert|rename|reduce|increase|extend|simplify|rephrase|reword|redo)\\b',
    '改|修改|换成|替换|缩短|加长|删除|删掉|重写|添加|润色|调整',
  ].join('|'),
  'i',
)

// ② 정도 말 — "더 짧게"처럼 바라는 쪽을 말한다.
const COMPARATIVE = new RegExp(
  [
    '(?:^|\\s)(?:더|좀\\s*더|조금\\s*더|더욱|한층|훨씬)(?=\\s|$)|좀\\s*더|조금\\s*더|너무\\s*(?:길|짧|많|적|느리|빠르|세|약|어둡|밝|무겁|가볍|딱딱|슬프|웃기|무섭|유치|뻔|지루)', // i18n-ok: 사용자 말에서 정도 말을 알아듣는 정규식
    '\\b(?:more|less|fewer|shorter|longer|funnier|sadder|darker|lighter|brighter|scarier|faster|slower|softer|calmer|warmer|colder|bigger|smaller|simpler|clearer|stronger|weaker|older|younger|better|worse|happier|angrier|nicer|cooler|too\\s+(?:long|short|dark|sad|fast|slow|much|many|little|serious|silly))\\b',
  ].join('|'),
  'i',
)

// ③ 바꿔 보자는 제안 — 물음표가 있어도 수정 요청이다.
const SUGGESTION = new RegExp(
  [
    '어때|어떨까|어떠(?:니|세요|십니까|할까)|어떻겠|좋겠|좋을까|나을까|괜찮을까|하면\\s*안|면\\s*안\\s*(?:돼|될까|되나)|(?:해도|하면|(?:으)?로\\s*하면)\\s*(?:돼|될까|되나|괜찮|좋)|만약|만일', // i18n-ok: 사용자 말에서 제안을 알아듣는 정규식
    // 낫지 않을까 · 하지 않을까 · 좋을 것 같은데 · 어떨지 · "…로?" · "…건?" · "…하면?" — 물음표만 붙은 조각도 제안이다(리드 2026-11-14 검토).
    '낫지\\s*않|낫겠|나을\\s*것\\s*같|좋을\\s*것\\s*같|좋을\\s*듯|좋아\\s*보|어떨(?:지|까|런지)|지\\s*않을까|지\\s*않나|(?:으?로|걸로|건|게|면)\\s*[?？]\\s*$', // i18n-ok: 사용자 말에서 제안을 알아듣는 정규식
    "\\b(?:what\\s+if|what\\s+about|how\\s+about|why\\s+not|wouldn['’]?t\\s+it\\s+be|would\\s+it\\s+be\\s+(?:better|nicer|nice|funny|funnier|good|cool)|maybe|perhaps)\\b",
    // Is it possible for him to stay? · Have her cry here?
    '\\bis\\s+it\\s+possible\\b|\\bany\\s+chance\\b|\\bhave\\s+(?:her|him|them|it)\\b',
    // 끝에 붙은 instead("Who should say this line instead?") — "instead of" 는 까닭을 묻는 말에도 쓰여 걸지 않는다.
    '\\binstead\\s*[?？!.]*\\s*$',
  ].join('|'),
  'i',
)

// ③-2 조동사 꼴의 제안 — Could Minsu be a girl? · Can Jisu say this line instead? · Shouldn't Minsu cry here? · Should she be older?
//   what · why · how · who · where · when 으로 시작하는 물음에서는 제안으로 치지 않는다("Why would he lie?" · "How could she forget?") — 위 SUGGESTION 의 what if · how about · why not 은 그대로 걸린다.
const SUGGESTION_MODAL = new RegExp(
  [
    '\\b(?:should|could|can|would|might)\\s+(?:the|it|she|he|they|we|this|that|there)\\b',
    "^\\W*(?:can|could|should|would|shall|might|may)\\s+(?!you\\b|i\\b|we\\b|me\\b|someone\\b|anyone\\b)\\w+|\\b(?:shouldn['’]?t|couldn['’]?t|wouldn['’]?t|can['’]?t)\\s+\\w+",
  ].join('|'),
  'i',
)

// ③-3 wh 물음의 "부정 조동사 + 이름 · 대명사" — "Why can't Minsu be a girl?" · "Why shouldn't it rain here?"는 그렇게 해 달라는 제안이다(리드 2026-11-14 낮음 c).
//   can't · cannot · couldn't · shouldn't 만 본다 — won't · wouldn't · didn't 는 이야기 속 까닭을 묻는 말이고, 대명사 · 이름이 아닌 낱말("Why can't the door open?")이 따르면 물음으로 둔다.
const WH_NEGATIVE_MODAL = /^\W*(?:what|who|whom|whose|where|when|why|how|which)\s+(?:can['’]?t|cannot|couldn['’]?t|shouldn['’]?t)\s+([A-Za-z]+)/i
const PRONOUN = /^(?:he|she|they|it|we|i|you)$/i

function whNegativeSuggestion(said: string): boolean {
  const subject = WH_NEGATIVE_MODAL.exec(said)?.[1]
  return !!subject && (PRONOUN.test(subject) || /^[A-Z]/.test(subject))
}

// ④ 부탁 꼴 — 알려 달라는 말이 함께 있으면 물음으로 본다.
const REQUEST_FRAME = new RegExp(
  [
    '줘|줄래|줄\\s*수|주세요|주실\\s*수|주시겠|주라|주렴|부탁', // i18n-ok: 사용자 말에서 부탁 꼴을 알아듣는 정규식
    "\\b(?:can|could|would|will)\\s+you\\b|\\bplease\\b|\\blet['’]?s\\b|\\b(?:want|need)\\s+you\\s+to\\b|\\bi\\s+(?:want|need|would\\s+like|['’]d\\s+like)\\b",
  ].join('|'),
  'i',
)
const INFO_VERB = new RegExp(
  [
    '알려|설명|말해|요약|가르쳐|궁금', // i18n-ok: 사용자 말에서 알려 달라는 말을 알아듣는 정규식
    '\\b(?:tell|explain|summari[sz]e|clarify|remind|walk\\s+me\\s+through|let\\s+me\\s+know)\\b',
  ].join('|'),
  'i',
)

// 물음표 없이 알려 달라고 하는 말("등장인물 이름들 알려줘" · "tell me about the cast").
const INFO_REQUEST = new RegExp(
  [
    '알려\\s*(?:줘|주세요|줄래|줄\\s*수)|설명(?:해|좀)|말해\\s*(?:줘|주세요|줄래)|요약해|궁금', // i18n-ok: 사용자 말에서 알려 달라는 말을 알아듣는 정규식
    '\\b(?:tell\\s+me|explain|summari[sz]e|walk\\s+me\\s+through|let\\s+me\\s+know)\\b',
  ].join('|'),
  'i',
)

// 묻는 낱말 · 알려 달라는 말 — 이것이 있어야 물음이다(리드 2026-11-14 검토).
const ASK_WORD = new RegExp(
  [
    '누구|누가|언제|어디|어떻게|어떤|무엇|뭐|뭘|왜|얼마|몇|어느|무슨|알려|설명|요약|궁금|가르쳐', // i18n-ok: 사용자 말에서 묻는 낱말을 알아듣는 정규식
    '\\b(?:who|whom|whose|what|where|when|why|how|which)\\b|\\b(?:tell\\s+me|explain|summari[sz]e|clarify|walk\\s+me\\s+through|let\\s+me\\s+know)\\b',
    '谁|什么|哪|几(?:个|次|章|场|秒|分|页|位|人|岁)|多少|为什么|为何|怎么|怎样|何时|告诉我|解释|总结',
  ].join('|'),
  'i',
)

// 묻는 꼴 — 물음표 없이도 묻는 말.
const KO_QUESTION_END = /(?:인가요|일까요|나요|있어요?|없어요?|있나요|없나요|뭐야|뭔가요|뭐예요|뭐지|누구야|누구예요|이야|이에요|예요|돼요|였지|이었지|였어|이었어|했지|했어|야|지)\s*$/ // i18n-ok: 사용자 말에서 묻는 끝맺음을 알아듣는 정규식
const EN_WH_START = /^\W*(?:what|who|whom|whose|where|when|why|how|which)\b/i

/** 이 말이 산문을 고쳐 달라는 부탁이 아니라 알고 싶어서 묻는 말인가. */
export function isProseQuestion(text: string | null | undefined): boolean {
  const said = (text ?? '').trim()
  if (!said) return false
  if (REVISION_CUE.test(said) || EDIT_WORD.test(said)) return false
  if (COMPARATIVE.test(said)) return false
  if (SUGGESTION.test(said)) return false
  if (!EN_WH_START.test(said) && SUGGESTION_MODAL.test(said)) return false
  if (whNegativeSuggestion(said)) return false
  if (REQUEST_FRAME.test(said) && !INFO_VERB.test(said)) return false
  // 묻는 낱말이 있어야 하고, 물음의 꼴(물음표 · 묻는 끝맺음 · 영어 wh 로 시작 · 알려 달라는 말)도 갖춰야 한다.
  if (!ASK_WORD.test(said)) return false
  return QUESTION_MARK.test(said) || EN_WH_START.test(said) || KO_QUESTION_END.test(said) || INFO_REQUEST.test(said)
}
