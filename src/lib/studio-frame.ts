// 스튜디오 본문 바깥 칸([data-stage-content])의 모양 — 높이는 보이는 화면에 고정하고, 어느 단계가 바깥 칸을 스크롤하게 둘지 한 곳에서 정한다.
//   바깥 칸은 위 막대(StudioTopBar)와 단계 화면을 담는다. 오른쪽 채팅(GlobalChat)과 왼쪽 레일은 화면에 붙은(fixed) 패널이라 이 칸 밖이다.
import { cn } from '@/lib/utils'
import type { StageId } from '@/types'

/** 바깥 칸이 스크롤하지 않는 단계 — 안쪽 칸이 각자 스크롤하는 것을 확인한 화면만(오너 2026-11-16).
 *  Writer(산문, 단계 id producer): 산문 칸 · 오른쪽 채팅 칸이 각자 스크롤한다(features/prose/prose-workspace.tsx 가 틀 · 산문 칸을 쥔다).
 *  나머지 단계는 상태마다 내용 길이가 달라 바깥 칸이 마지막 안전망으로 남는다 — 하나씩 확인하는 대로 여기에 더한다.
 *  단계 id 와 화면 이름은 서로 바뀌어 있다(design.md §2.9): producer = Writer, writer = Storyboard, entry = Producer. */
export const FIXED_FRAME_STAGES: readonly StageId[] = ['producer']

/** 바깥 칸의 class. 높이는 dvh — 도구 막대가 줄었다 늘었다 하는 브라우저에서 vh 는 보이는 화면보다 커서 문서가 같이 밀린다. */
export function stageFrameClass(stage: StageId): string {
  return cn('flex h-dvh flex-col overflow-x-hidden', FIXED_FRAME_STAGES.includes(stage) ? 'overflow-y-hidden' : 'overflow-y-auto')
}
