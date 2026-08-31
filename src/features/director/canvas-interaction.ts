// Director 노드 뷰 인터랙션의 순수 결정 로직.
//
// React 컴포넌트(BaseNode/DirectorNodePopup/page.tsx)가 이 함수들을 소비한다.
// 렌더링과 분리해 두어 node 환경 단위 테스트로 격리 검증한다.

import type { DirectorNodeData, DirectorNodeKind } from '@/types/director'

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
 * 샷 체인 파생 카드 더블클릭 위임 대상(#previz-chain 2026-07-23) — 파생 카드는 자체
 * 모달이 없고 진실이 부모 Shot 에 있으므로, 더블클릭을 부모 Shot 모달로 위임한다.
 * 파생 카드가 아니면 null.
 */
export function chainParentShotNodeId(data: DirectorNodeData): string | null {
  return data.kind === 'shotImage' || data.kind === 'videoPlaceholder'
    ? (data as { parentShotNodeId: string }).parentShotNodeId
    : null
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
 * 노드 우클릭 메뉴 항목 결정(#context-menu 2026-08-31) — 좌클릭=선택, 더블클릭=편집
 * 모달, 우클릭=이 메뉴로 인터랙션을 셋으로 가른다.
 * - edit: scene/shot/video 는 자기 모달, 파생(shotImage/videoPlaceholder)은 부모 Shot 모달
 * - copy-image/download-image: 대표 이미지가 있을 때만 (판정은 호출부 nodePrimaryImageUrl)
 * - delete: asset(파생·읽기전용) 만 제외
 */
export type NodeMenuItem = 'edit' | 'copy-image' | 'download-image' | 'delete'

export function nodeContextMenuItems(
  kind: DirectorNodeKind,
  hasImage: boolean,
): NodeMenuItem[] {
  const items: NodeMenuItem[] = []
  if (
    kind === 'scene' ||
    kind === 'shot' ||
    kind === 'video' ||
    kind === 'shotImage' ||
    kind === 'videoPlaceholder'
  ) {
    items.push('edit')
  }
  if (hasImage) {
    items.push('copy-image', 'download-image')
  }
  if (kind !== 'asset' && kind !== 'shotImage' && kind !== 'videoPlaceholder') {
    items.push('delete')
  }
  return items
}

/**
 * onConnect 라우팅: Shot의 T 입력(targetHandle==='prompt')으로 들어오는 연결은
 * Prompt 노드 와이어링(wirePromptToShot)으로, Shot 이미지 입력은 image 와이어링으로,
 * Video 프레임 입력은 frame 와이어링으로, 이전 Video 입력은 video-chain으로,
 * 그 외는 기존 관계(RelationModal)로.
 */
export function connectRouteForTargetHandle(
  targetHandle: string | null | undefined,
): 'prompt-wire' | 'image-wire' | 'frame-wire' | 'video-chain' | 'relation' {
  if (targetHandle === 'prompt') return 'prompt-wire'
  if (targetHandle === 'image-reference') return 'image-wire'
  if (
    targetHandle === 'frame-start' ||
    targetHandle === 'frame-end' ||
    targetHandle === 'frame-ref'
  ) {
    return 'frame-wire'
  }
  if (targetHandle === 'video-chain') return 'video-chain'
  return 'relation'
}
