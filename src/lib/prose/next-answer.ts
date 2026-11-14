// Writer 의 "다음 단계로 넘어갈까요?" 카드에 말로 한 짧은 대답 읽기(오너 2026-11-14 답 F ①) — "응 · 네 · yes"는 넘어가자는 대답, "아니 · no"는 더 고치겠다는 대답이다.
//   이 말을 수정 요청으로 보내면 카드가 지워지고 "바꿀 곳을 못 찾았어요"가 나왔다(11/14 채팅 점검 F).
//   그 말만 짧게 쓴 대답만 읽는다 — 길거나 고칠 점이 섞이거나 물음표가 붙은 말은 대답이 아니다(그 말은 고쳐 달라는 말로 간다).
//   Lumi 카드의 "응 · 네" 승인과 같은 낱말이다(global-chat-store saysYes). 약속: tests/chat/writer-next-answer.test.ts
import { isApprovalUtterance, isCancellationUtterance } from '@/lib/pending-proposal'

export type NextAnswer = 'yes' | 'no'

const YES_TOKEN =
  "(?:응+|웅|넵|네+|넹|예|옙|어|그래요?|좋아요?|좋습니다|좋네요?|ㅇㅇ|ㅇㅋ|오케이|오케|콜|가자|가죠|가요|ok|okay|yes|yeah|yep|yup|sure|alright|go\\s+ahead|do\\s+it|let(?:['’]?s|\\s+us)\\s+go)" // i18n-ok: 사용자 대답을 알아듣는 낱말 목록 자체
const NO_TOKEN =
  '(?:아니요?|아니오|아뇨|아냐|아니야|아니에요|노|ㄴㄴ|no|nope|nah|not\\s+yet|not\\s+now|no\\s+thanks|no\\s+thank\\s+you|later|나중에|아직(?:요|이요)?|(?:조금\\s*)?더\\s*고칠래요?|더\\s*고칠게요?|더\\s*고쳐|keep\\s+editing|more\\s+edits)' // i18n-ok: 사용자 대답을 알아듣는 낱말 목록 자체
const SEPARATOR = '[\\s,.!~…]+'
const YES = new RegExp(`^(?:${YES_TOKEN})(?:${SEPARATOR}(?:${YES_TOKEN}))*(?:${SEPARATOR}please)?[\\s.!~…]*$`, 'i')
const NO = new RegExp(`^(?:${NO_TOKEN})(?:${SEPARATOR}(?:${NO_TOKEN}))*[\\s.!~…]*$`, 'i')

/** 카드가 물은 "넘어갈까요?"에 대한 말: 'yes' 넘어가자 · 'no' 더 고치겠다 · null 대답이 아니다. */
export function answerToNextStep(text: string | null | undefined): NextAnswer | null {
  const said = (text ?? '').trim()
  // 물음표가 붙은 "네?" · "yes?"는 되묻는 말이다 — 대답이 아니다.
  if (!said || /[?？]/.test(said)) return null
  const plain = said.replace(/\s+/g, ' ')
  if (NO.test(plain) || isCancellationUtterance(said)) return 'no'
  if (YES.test(plain) || isApprovalUtterance(said)) return 'yes'
  return null
}
