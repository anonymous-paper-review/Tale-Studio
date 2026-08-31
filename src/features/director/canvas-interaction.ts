// Director 노드 뷰 인터랙션의 순수 결정 로직.
//
// React 컴포넌트(BaseNode/DirectorNodePopup/page.tsx)가 이 함수들을 소비한다.
// 렌더링과 분리해 두어 node 환경 단위 테스트로 격리 검증한다.

import type { DirectorNodeKind } from '@/types/director'

export type DirectorViewMode = 'node' | 'storyboard'

/**
 * BaseNode Edit 버튼 동작 분기(#panel-unify 2026-08-31 오너 결정).
 * 노드 뷰의 편집 통로는 좌측 패널로 통일 — 모달은 캔버스를 가려 노드 이동을 막는다.
 * - shot/video/asset Image: 좌측 패널 선택(selectNode)
 * - scene: 모달(패널 미지원 — 씬 노드 자체가 정리 대상)
 * - prompt: 액션 없음
 */
export function editActionForKind(
  kind: DirectorNodeKind,
): 'popup' | 'select' | 'none' {
  if (kind === 'scene') return 'popup'
  if (kind === 'shot' || kind === 'video' || kind === 'asset') return 'select'
  return 'none'
}

/**
 * DirectorNodePopup(모달) 가시성 가드(#panel-unify 2026-08-31).
 * 노드 뷰: scene만 모달 — shot/video는 좌측 패널로 통일(캔버스 조작을 안 막는다).
 * 그리드(storyboard) 뷰: 캔버스가 없으니 기존대로 scene/shot/video 모달 허용.
 */
export function popupVisibleInView(
  viewMode: DirectorViewMode,
  kind: DirectorNodeKind,
): boolean {
  if (viewMode === 'node') return kind === 'scene'
  return kind === 'scene' || kind === 'shot' || kind === 'video'
}

/**
 * 노드 뷰 더블클릭 동작 분기(#panel-unify 2026-08-31).
 * - scene: 모달 / shot/video/asset: 좌측 패널(클릭과 동일)
 * - 그 외: no-op
 */
export function doubleClickActionForKind(
  kind: DirectorNodeKind,
): 'popup' | 'select' | 'none' {
  if (kind === 'scene') return 'popup'
  if (kind === 'shot' || kind === 'video' || kind === 'asset') return 'select'
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
 * 노드 우클릭 메뉴 항목 결정(#context-menu 2026-08-31) — 좌클릭=선택, 더블클릭=편집,
 * 우클릭=이 메뉴로 인터랙션을 셋으로 가른다.
 * #node-merge: 파생 카드(shotImage/videoPlaceholder)는 캔버스에서 제거돼 분기도 사라졌다.
 * - copy-image/download-image: 대표 이미지가 있을 때만 (판정은 호출부 nodePrimaryImageUrl)
 * - delete: upstream 원본과 연결된 asset Image만 제외
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
    kind === 'asset'
  ) {
    items.push('edit')
  }
  if (hasImage) {
    items.push('copy-image', 'download-image')
  }
  if (kind !== 'asset') {
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
