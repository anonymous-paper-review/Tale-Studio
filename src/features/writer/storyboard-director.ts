// Storyboard → Director 넘김 (리뉴얼 1차 2026-10-19, 프로토타입 S7 [예, 넘기기]).
//   새 길을 만들지 않는다 — Storyboard 채팅에 "Director로 넘겨주세요"를 입력한 것과 같다(버튼 = 타이핑, #handoff-to-chat).
//   채팅이 resolveDirectorHandoffIntent 로 알아듣고 requestDirectorHandoff('move') → /api/project/[id]/handoff 가
//   저장된 조건(Writer 실행 완료 · 씬 · 샷 · Artist 그림)을 확인한 뒤 Director 를 연다. 모자라면 채팅이 이유를 말한다.
import { translate } from '@/lib/i18n/translate'
import { useGlobalChatStore } from '@/stores/global-chat-store'
import { useLocaleStore } from '@/stores/locale-store'

export async function handOverToDirector(): Promise<void> {
  // 버튼의 언어는 화면(UI) 언어다 — 다음 단계 버튼(requestNextStep)이 넘김 문장을 고르는 방식과 같다.
  const utterance = translate(useLocaleStore.getState().locale, 'Please hand over to Director')
  await useGlobalChatStore.getState().sendMessage(utterance)
}
