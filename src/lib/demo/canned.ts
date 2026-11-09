// project-share-demo-mode — 데모 채팅 "척" 고정 응답(Q3b).
// 데모에선 서버 LLM 호출 없이 스테이지별 이 문구를 typing 애니 후 표시한다.
// 문구는 영어 원문 = 사전 키, 채팅 언어로 옮겨 보인다(2026-11-10 오너 "영어 언어에서 한국어 나오는거 수정").

import { translate } from '@/lib/i18n/translate'
import type { AppLocale } from '@/lib/locale'
import type { StageId } from '@/types'

const PRODUCER_REPLY = 'This is a shared preview, so chat is turned off. In the real Producer stage, you shape the story, characters and tone together here.'

export const CANNED_CHAT: Record<StageId, string> = {
  // Producer 시작 화면(entry)은 채팅이 없어 공유 미리보기에서도 Producer 문구를 함께 쓴다.
  entry: PRODUCER_REPLY,
  producer: PRODUCER_REPLY,
  writer: 'This is a shared preview. In the real project, you review and edit the scene structure and rough storyboard here.',
  artist: 'This is a shared preview. In the real project, you create and refine character and world cards here.',
  director: 'This is a shared preview. In the real project, you direct shots, camera and video on the canvas here.',
  editor: 'This is a shared preview. In the real project, you edit cuts on the timeline here.',
}

/** 언어를 안 넘기는 옛 호출은 종전처럼 한국어(하위호환). */
export function cannedFor(stage: StageId, locale: AppLocale = 'ko'): string {
  return translate(locale, CANNED_CHAT[stage] ?? PRODUCER_REPLY)
}
