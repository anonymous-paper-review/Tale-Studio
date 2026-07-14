// Director 노드 뷰 인터랙션의 순수 결정 로직.
//
// React 컴포넌트(BaseNode/DirectorNodePopup/page.tsx)가 이 함수들을 소비한다.
// 렌더링과 분리해 두어 node 환경 단위 테스트로 격리 검증한다.

import type { DirectorNodeKind } from '@/types/director'

export type DirectorViewMode = 'node' | 'storyboard'

/**
 * BaseNode Edit 버튼 동작 분기(#e2 2026-07-14).
 * - scene/shot/video: 모달(DirectorNodePopup) — Storyboard 뷰와 동일 경로로 통일.
 *   (옛 shot/video 좌측 패널 선택 경로는 폐기 — 단일클릭 선택 기능 제거와 함께)
 * - 그 외(asset/prompt): 액션 없음
 */
export function editActionForKind(
  kind: DirectorNodeKind,
): 'popup' | 'select' | 'none' {
  if (kind === 'scene' || kind === 'shot' || kind === 'video') return 'popup'
  return 'none'
}

/**
 * DirectorNodePopup(모달) 가시성 가드(#e2).
 * 노드 뷰도 Storyboard 뷰와 동일하게 scene/shot/video 모달 허용.
 */
export function popupVisibleInView(
  _viewMode: DirectorViewMode,
  kind: DirectorNodeKind,
): boolean {
  return kind === 'scene' || kind === 'shot' || kind === 'video'
}

/**
 * 노드 뷰 더블클릭 동작 분기(#e2) — Storyboard 뷰 더블클릭과 동일: 모달 열기.
 * - scene/shot/video: 모달 열기(openPopup)
 * - 그 외: no-op
 */
export function doubleClickActionForKind(
  kind: DirectorNodeKind,
): 'popup' | 'close-panel' | 'none' {
  if (kind === 'scene' || kind === 'shot' || kind === 'video') return 'popup'
  return 'none'
}

/**
 * 단일클릭 토글 결정: 같은 노드를 다시 클릭하면 선택 해제(패널 닫기), 아니면 선택.
 * 반환값은 새 selectedNodeId.
 */
export function clickToggleSelection(
  currentSelectedId: string | null,
  clickedId: string,
): string | null {
  return currentSelectedId === clickedId ? null : clickedId
}

/**
 * onConnect 라우팅: Shot의 T 입력(targetHandle==='prompt')으로 들어오는 연결은
 * Prompt 노드 와이어링(wirePromptToShot)으로, 그 외는 기존 관계(RelationModal)로.
 */
export function connectRouteForTargetHandle(
  targetHandle: string | null | undefined,
): 'prompt-wire' | 'relation' {
  return targetHandle === 'prompt' ? 'prompt-wire' : 'relation'
}
