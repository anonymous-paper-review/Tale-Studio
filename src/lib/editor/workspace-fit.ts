// Editor 작업 영역(판 여섯 개)이 버티는 폭 — Lumi 채팅이 화면을 밀면 작업 영역이 최소 폭보다 좁아질 때, Editor 에서 연 채팅은 밀지 않고
//   위에 덮는다(검토 c ① 낮음 1 — board 의 "1100px 아래 덮기"를 Editor 는 작업 영역 기준으로). 순수 함수만 둔다.
//   약속: tests/editor/panels.test.ts
import { SHELL_INSET, SHELL_RAIL_WIDTH } from '@/lib/constants'

/** 작업 영역 최소 폭(px) — page.tsx 의 min-w-[900px] 과 양옆 px-7(28). */
export const EDITOR_MIN_WORK_WIDTH = 900 + 28 * 2

/** Editor 에서 연 채팅이 화면을 밀면 작업 영역이 최소 폭보다 좁아지나. 창 폭을 모르면(0 · 서버 그리기) 아니다. */
export function editorChatOverlays(viewportWidth: number, chatWidth: number): boolean {
  if (!(viewportWidth > 0)) return false
  const left = SHELL_INSET * 2 + SHELL_RAIL_WIDTH
  const right = SHELL_INSET + chatWidth
  return viewportWidth - left - right < EDITOR_MIN_WORK_WIDTH
}
