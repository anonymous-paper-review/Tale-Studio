// project-share-demo-mode — 데모 채팅 "척" 고정 응답(Q3b).
// 데모에선 서버 LLM 호출 없이 스테이지별 이 문구를 typing 애니 후 표시한다.

import type { StageId } from '@/types'

export const CANNED_CHAT: Record<StageId, string> = {
  producer:
    '지금은 공유 미리보기라 실제 대화는 비활성이에요. 실제 프로듀서 단계에선 여기서 스토리·캐릭터·톤을 함께 정리해요.',
  writer:
    '공유 미리보기 모드예요. 실제로는 여기서 씬 구조와 러프 스토리보드를 검토·수정해요.',
  artist:
    '공유 미리보기 모드예요. 실제로는 캐릭터·월드 카드를 생성하고 다듬어요.',
  director:
    '공유 미리보기 모드예요. 실제로는 캔버스에서 샷·카메라·영상을 연출해요.',
  editor:
    '공유 미리보기 모드예요. 실제로는 타임라인에서 컷 편집을 해요.',
}

export function cannedFor(stage: StageId): string {
  return CANNED_CHAT[stage] ?? CANNED_CHAT.producer
}
