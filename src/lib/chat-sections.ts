import type { StageId } from '@/types'

/**
 * 채팅 스레드의 stage 구간(section) 분할 (#chat-continuity 2026-07-31).
 *
 * 채팅방은 프로젝트당 하나다 — 메시지는 stage 로 필터링되지 않고 한 스레드에 시간순으로 쌓인다.
 * 그런데 구분선이 없으면 탭을 옮길 때마다 "이 탭 전용 채팅방이 새로 열린 것"처럼 보인다.
 * 여기서 연속 구간을 계산해 UI 가 구분선을 그리게 한다 — 한 방 안의 챕터 표시.
 *
 * 되돌아온 stage 는 **새 구간**이다 (producer→writer→producer 는 3구간). 시간순이 진실이고,
 * stage 로 묶어버리면 대화 순서가 무너진다.
 */
export interface ChatSection<M> {
  stage: StageId
  messages: M[]
  /** 유저가 지금 보고 있는 stage 구간 — 항상 마지막 구간에만 붙는다. */
  current: boolean
}

export function buildChatSections<M extends { stage: StageId }>(
  messages: readonly M[],
  currentStage: StageId,
): ChatSection<M>[] {
  const sections: ChatSection<M>[] = []
  for (const msg of messages) {
    const last = sections[sections.length - 1]
    if (last && last.stage === msg.stage) last.messages.push(msg)
    else sections.push({ stage: msg.stage, messages: [msg], current: false })
  }
  // 현재 stage 구간을 항상 스레드 끝에 보이게 한다. 아직 발화가 없는 stage 로 이동해도
  //   "같은 방이 이 챕터로 이어졌다"가 보여야 하므로 빈 구간을 만든다.
  const last = sections[sections.length - 1]
  if (last && last.stage === currentStage) last.current = true
  else sections.push({ stage: currentStage, messages: [], current: true })
  return sections
}
