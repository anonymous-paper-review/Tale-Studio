// Storyboard → Director 넘김 (리뉴얼 1차 2026-10-19, 프로토타입 S7 [예, 넘기기] → 디자이너 1110 확정 D0 [넘어가기]).
//   새 길을 만들지 않는다 — Storyboard 채팅에 "Director로 넘겨주세요"를 입력한 것과 같다(버튼 = 타이핑, #handoff-to-chat).
//   채팅이 resolveDirectorHandoffIntent 로 알아듣고 requestDirectorHandoff('move') → /api/project/[id]/handoff 가
//   저장된 조건(Writer 실행 완료 · 씬 · 샷 · Artist 그림)을 확인한 뒤 Director 를 연다. 모자라면 채팅이 이유를 말한다.
//   D0(2026-11-14): 창에서 "넘어가면서 이미지 만들기"를 골랐으면 Director 가 열린 뒤 실사 일괄을 한 번 시작하게 표시해 둔다.
import { clearImagesOnDirectorEntry, requestImagesOnDirectorEntry } from '@/lib/director/entry-images-intent'
import { translate } from '@/lib/i18n/translate'
import { useGlobalChatStore } from '@/stores/global-chat-store'
import { useLocaleStore } from '@/stores/locale-store'
import { useProjectStore } from '@/stores/project-store'

export async function handOverToDirector(opts: { makeImages?: boolean } = {}): Promise<void> {
  const projectId = useProjectStore.getState().projectId
  if (opts.makeImages && projectId) requestImagesOnDirectorEntry(projectId)
  // 버튼의 언어는 화면(UI) 언어다 — 다음 단계 버튼(requestNextStep)이 넘김 문장을 고르는 방식과 같다.
  const utterance = translate(useLocaleStore.getState().locale, 'Please hand over to Director')
  await useGlobalChatStore.getState().sendMessage(utterance)
  // 넘김이 바로 막혔으면(채팅이 이유를 말함) 표시를 지운다 — 나중에 다른 길로 Director 에 들어갔을 때 갑자기 만들지 않게.
  const chat = useGlobalChatStore.getState()
  if (opts.makeImages && !chat.directorHandoff && !chat.pendingNavigatePath?.includes('/studio/director')) clearImagesOnDirectorEntry()
}
