// 샷 상세의 고치기 칸 → Director 채팅(Lumi)(오너 2026-11-26 D6 "이미지 영상 등 모든 작업은 채팅창에 있는 기능 활용 (채팅창에 우리가 요청하고 업데이트하는걸로)").
//   예전 칸은 글을 "Change from the previous image:" 로 덧붙여 바로 다시 그렸다 — 앞 그림 · 맥락 없이 연필 러프에서 새로 칠했다(4a02fe1f "맥락있게 수정이 안 된다").
//   이제 칸의 글은 생성 API 를 부르지 않고 그 샷의 @멘션과 함께 채팅으로 간다. 채팅이 샷 프롬프트를 고쳐 글 카드 [적용]에 걸고, [적용]하면 새 글로 다시 만든다.
//   보내기 전에 그 샷을 고른다 — 채팅 맥락은 샷 프롬프트를 앞 60자만 싣고 고른 노드만 전체를 싣는다(serializeDirectorCanvasContext).
//   약속: tests/director/fix-via-chat.test.ts
import { translate } from '@/lib/i18n/translate'
import { sceneShotMentionRef, sceneShotMentions } from '@/lib/card-mention'
import { boardNodeNames, directorMentionTargets } from '@/features/director/node-label'
import { useDirectorCanvasStore } from '@/stores/director-store'
import { useGlobalChatStore } from '@/stores/global-chat-store'
import { useChatUiStore } from '@/stores/chat-ui-store'
import { useLocaleStore } from '@/stores/locale-store'
import { useWriterStore } from '@/stores/writer-store'

export type FixKind = 'image' | 'video'
export type AskLumiResult = 'sent' | 'busy' | 'empty' | 'no-shot'

/** 그 샷의 채팅 @이름 — 채팅 고르기 목록 · 카드 ⌘/Ctrl+클릭과 같은 이름("Real Shot 3" · "실사 샷 3", 화면 말). */
function shotMentionLabel(shotNodeId: string): string | null {
  const locale = useLocaleStore.getState().locale
  const writer = useWriterStore.getState()
  const names = boardNodeNames(writer.sceneManifest, writer.shots ?? [], locale)
  const targets = directorMentionTargets(useDirectorCanvasStore.getState().nodes, names)
  const ref = sceneShotMentionRef('real', 'shot', shotNodeId)
  return sceneShotMentions(targets, 'real', locale).find((item) => item.ref === ref)?.label ?? null
}

/**
 * 고치기 칸의 글을 채팅으로 보낸다. closeDetail = 스토리보드 보기 팝업(화면을 막는 창)이면 닫아 채팅의 [적용]이 보이게 한다.
 * 채팅이 다른 말을 처리하는 중이면 보내지 않는다(sendMessage 는 바쁘면 조용히 버린다) — 부른 쪽이 까닭을 보인다.
 */
export function askLumiToFix(input: { shotNodeId: string; kind: FixKind; change: string; closeDetail: boolean }): AskLumiResult {
  const change = input.change.trim()
  if (!change) return 'empty'
  const chat = useGlobalChatStore.getState()
  if (chat.loading) return 'busy'
  const label = shotMentionLabel(input.shotNodeId)
  if (!label) return 'no-shot'
  const director = useDirectorCanvasStore.getState()
  // 닫기를 먼저 — 상세 닫기는 샷을 가리키는 고름도 비운다. 그 뒤에 골라야 채팅 맥락에 이 샷의 전체 프롬프트가 남는다.
  if (input.closeDetail) director.closeShotDetail()
  director.selectNode(input.shotNodeId)
  useChatUiStore.getState().setCollapsed(false)
  const key = input.kind === 'image' ? '@{shot} Fix the image and make it again: {change}' : '@{shot} Fix the video and remake it as a new Take: {change}'
  void chat.sendMessage(translate(useLocaleStore.getState().locale, key, { shot: label, change }))
  return 'sent'
}
