// Writer 채팅 말 읽기(리뉴얼 1차 2026-10-19). Writer(id producer)는 산문만 다룬다.
//   "다시 써줘"라고만 하면 다시 쓰기 조건을 묻고(프로토타입 send → WC1), 넘김 말(Artist로 · 브레이크다운 · 다음 단계)은
//   산문 확정 창을 연다 — 확정하면 산문이 잠기므로 바로 넘기지 않는다. 나머지 말은 산문 수정 요청이다.
//   인식은 코드가 한다(handoff-intent 와 같은 원칙 — 되돌리기 어려운 전이는 모델 해석에 맡기지 않는다).
import { hasNonRequestContext, matchHandoffIntent } from '@/lib/handoff-intent'

export type WriterChatIntent = 'rewrite' | 'breakdown' | 'revise'

// 조건 없이 "다시 써줘"만 — 고칠 점이 함께 있으면 그 말대로 수정안을 만든다.
const REWRITE_ONLY = /^\s*(?:다시\s*(?:써|쓰)\s*(?:줘|주세요|줄래|봐)?|rewrite(?:\s+it)?(?:\s+please)?|write\s+it\s+again)\s*[.!?~]*\s*$/i // i18n-ok: 사용자 말에서 "다시 써줘"를 알아듣는 정규식
const BREAKDOWN_WORDS = /브레이크다운|breakdown|break\s+it\s+down/i // i18n-ok: 사용자 말에서 브레이크다운 요청을 알아듣는 정규식

// Writer 에서만 더 알아듣는 넘김 말(디자이너 QA 1차 #01) — "다음 챕터로 이동해줘" · "좋아요, 다음 단계로" · "Artist로 가줘"는
//   handoff-intent 의 낱말(이동 말 + 다음 단계 · 단계 이름)에 맞지 않아 산문 수정 요청으로 읽혔다.
//   고칠 점과 섞이지 않게 넘김 말이 말의 끝에 와야 한다 — "다음 챕터에서 순자가 웃게 해줘"는 수정 요청이다.
//   공백을 지운 소문자 문장에 맞춘다(handoff-intent 와 같은 방식).
const KO_NEXT = '다음(?:단계|스텝|챕터|탭|화면|과정)' // i18n-ok: Writer 다음 자리를 가리키는 말
const KO_SOFT = '(?:이제|그럼|바로|그냥)?' // i18n-ok: 넘김 말 사이에 끼는 부사
const KO_MOVE = '(?:넘어(?:가(?:자|줘|주세요|요|죠|볼까|보자)?|갑시다|갈래|갈게요?)|넘겨(?:줘|주세요|요)?|넘기자|넘깁시다|(?:이동|진행)(?:해(?:줘|주세요|요)?|하자|하죠|합시다|할래)?|가(?:자|줘|주세요|요|죠|볼까|보자)?|갑시다|갈래|고고|ㄱㄱ)' // i18n-ok: 넘어가자는 말의 끝맺음
const KO_ACK = '(?:좋아요|좋아|좋습니다|네|넵|예|응|그래요|그래|오케이|ok|okay|yes)' // i18n-ok: "다음 단계로" 앞의 맞장구
// 넘김 말은 말 전체가 넘어가자는 말일 때만 — 앞에 맞장구 · 부사만 올 수 있다. 앞에 고칠 점이 있으면 수정 요청이다(검토 지적 6).
const KO_LEAD = `^(?:${KO_ACK}[,.!~]*)?${KO_SOFT}` // i18n-ok: 넘김 말 앞에 올 수 있는 말
const KO_MOVE_TO_NEXT = new RegExp(`${KO_LEAD}${KO_NEXT}(?:으로|로)?${KO_SOFT}${KO_MOVE}[.!~]*$`) // i18n-ok: "다음 챕터로 이동해줘"
const KO_NEXT_ONLY = new RegExp(`${KO_LEAD}${KO_NEXT}(?:으로|로)?[.!~]*$`) // i18n-ok: "좋아요, 다음 단계로"만 쓴 말
const KO_MOVE_TO_ARTIST = new RegExp(`${KO_LEAD}(?:artist|아티스트)(?:단계|화면|탭)?(?:으로|로|한테|에게)?${KO_SOFT}${KO_MOVE}[.!~]*$`) // i18n-ok: "Artist로 가줘"
// 갈 곳 없이 넘어가자는 말 · 산문을 확정하자는 말(검토 지적 7) — "다음으로 넘어가자" · "넘어가줘" · "산문 확정해줘".
const KO_MOVE_BARE = new RegExp(`${KO_LEAD}(?:다음으로)?(?:넘어(?:가(?:자|줘|주세요|요|죠|볼까|보자)|갑시다|갈래|갈게요?)|진행(?:해(?:줘|주세요)|하자|합시다))[.!~]*$`) // i18n-ok: 갈 곳 없이 넘어가자는 말
const KO_CONFIRM = new RegExp(`${KO_LEAD}(?:이)?(?:산문(?:을|은)?)?확정(?:해(?:줘|주세요|요)?|하자|할게요?|합시다)[.!~]*$`) // i18n-ok: "산문 확정해줘"
const EN_NEXT = 'next\\s+(?:step|stage|chapter|tab|screen|phase)'
const EN_LEAD = `^(?:(?:ok(?:ay)?|yes|yeah|yep|sure|great|good|alright|perfect|looks\\s+good|sounds\\s+good)[\\s,.!]*)?(?:(?:let'?s|please|now|then)\\s+)*`
const EN_MOVE_TO = new RegExp(`${EN_LEAD}(?:go|move|proceed|continue|jump|skip|head)\\s+(?:on\\s+)?(?:to|onto)\\s+(?:the\\s+)?(?:${EN_NEXT}|artist)(?:\\s+(?:please|now))?[\\s.!]*$`, 'i')
const EN_NEXT_ONLY = new RegExp(`${EN_LEAD}(?:the\\s+)?${EN_NEXT}(?:\\s+please)?[\\s.!]*$`, 'i')
const EN_MOVE_BARE = new RegExp(`${EN_LEAD}(?:move\\s+on|proceed|go\\s+ahead|confirm\\s+(?:it|the\\s+prose))(?:\\s+(?:please|now))?[\\s.!]*$`, 'i')

function writerMoveRequest(said: string): boolean {
  if (hasNonRequestContext(said)) return false
  const compact = said.toLowerCase().replace(/\s+/g, '')
  if ([KO_MOVE_TO_NEXT, KO_NEXT_ONLY, KO_MOVE_TO_ARTIST, KO_MOVE_BARE, KO_CONFIRM].some((rule) => rule.test(compact))) return true
  const spaced = said.toLowerCase().replace(/\s+/g, ' ').trim()
  return [EN_MOVE_TO, EN_NEXT_ONLY, EN_MOVE_BARE].some((rule) => rule.test(spaced))
}

// "넘어가기 전에 결말을 바꿔줘"는 넘김이 아니라 고칠 점이다 — 넘김 말이 들어 있어도 수정 요청으로 읽는다(디자이너 QA 1차 #01 검토).
// "결말 고치고 Artist로 넘겨줘"처럼 고칠 점과 넘김이 함께 있으면 고칠 점부터 — 확정 창만 열면 고칠 말이 버려지고 고치지 않은 산문이 잠긴다(검토 지적 6).
const FIX_THEN_MOVE = /(?:고치|고쳐|바꾸|바꿔|다듬|줄이|줄여|늘리|늘려|넣|빼|살리|살려|키우|키워|밝게|어둡게|짧게|길게|웃기게|슬프게)[^\s]*(?:고|고서|고나서|한뒤|한다음|한뒤에|한다음에)\s*.*(?:넘어가|넘겨|넘기|이동|가자|가줘|진행)|\b(?:make|change|fix|rewrite|shorten|cut|add|remove|edit|tweak|revise)\b.*\b(?:then|and)\b.*\b(?:go|move|proceed|hand)\b/i // i18n-ok: 고칠 점과 넘김이 함께 있는 말
const BEFORE_MOVING = /(?:넘어가|넘기|넘겨|이동하|진행하|가)기\s*전에|\bbefore\s+(?:we\s+|i\s+|you\s+)?(?:move|moving|go|going|proceed|proceeding|hand(?:ing)?\s+over)\b/i // i18n-ok: 사용자 말에서 "넘어가기 전에"를 알아듣는 정규식

export function writerChatIntent(text: string): WriterChatIntent {
  const said = text.trim()
  if (REWRITE_ONLY.test(said)) return 'rewrite'
  if (BEFORE_MOVING.test(said) || FIX_THEN_MOVE.test(said.replace(/\s+/g, ' '))) return 'revise'
  if (matchHandoffIntent(said, 'producer')) return 'breakdown'
  if (BREAKDOWN_WORDS.test(said) && !hasNonRequestContext(said)) return 'breakdown'
  if (writerMoveRequest(said)) return 'breakdown'
  return 'revise'
}
