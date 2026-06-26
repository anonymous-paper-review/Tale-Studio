// Director 노드 뷰 인터랙션의 순수 결정 로직.
//
// React 컴포넌트(BaseNode/DirectorNodePopup/page.tsx)가 이 함수들을 소비한다.
// 렌더링과 분리해 두어 node 환경 단위 테스트로 격리 검증한다.

import type { DirectorNodeKind } from '@/types/director'

export type DirectorViewMode = 'node' | 'storyboard'

/**
 * BaseNode Edit 버튼 동작 분기.
 * - scene: 기존 모달(SceneNodePopup) 열기
 * - shot/video: 좌측 상세 패널 선택(좌측 패널이 상세를 담당, 모달 미사용)
 * - 그 외(asset/prompt): 액션 없음
 */
export function editActionForKind(
  kind: DirectorNodeKind,
): 'popup' | 'select' | 'none' {
  if (kind === 'scene') return 'popup'
  if (kind === 'shot' || kind === 'video') return 'select'
  return 'none'
}

/**
 * DirectorNodePopup(모달) 가시성 가드.
 * - 그리드(storyboard) 뷰: 모든 종류 모달 허용(기존 동작 보존)
 * - 노드 뷰: Scene만 모달 허용. Shot/Video는 좌측 패널로 가므로 모달 차단.
 */
export function popupVisibleInView(
  viewMode: DirectorViewMode,
  kind: DirectorNodeKind,
): boolean {
  if (viewMode !== 'node') return true
  return kind === 'scene'
}

/**
 * 노드 뷰 더블클릭 동작 분기.
 * - scene: 모달 열기(openPopup)
 * - shot/video: 좌측 패널 닫기(선택 해제)
 * - 그 외: no-op
 */
export function doubleClickActionForKind(
  kind: DirectorNodeKind,
): 'popup' | 'close-panel' | 'none' {
  if (kind === 'scene') return 'popup'
  if (kind === 'shot' || kind === 'video') return 'close-panel'
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
