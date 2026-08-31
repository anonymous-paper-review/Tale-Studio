// 노드 대표 이미지 → 클립보드 복사/다운로드(#node-copy-image 2026-08-31).
//
// 우클릭 메뉴와 Cmd/Ctrl+C 가 부른다. 브라우저 클립보드의 이미지 계약은 PNG 뿐이라
// (Chrome/Safari 공통) 원본이 JPEG/WebP 여도 캔버스로 PNG 재인코드해 넣는다.
// 저장소 응답에 access-control-allow-origin: * 가 있어(2026-08-28 실측) fetch → blob 이 가능하다.

import {
  isAssetData,
  isShotData,
  isVideoData,
  type DirectorNode,
} from '@/types/director'

/**
 * 노드의 "복사 가능한 대표 이미지" URL. 없으면 null — 메뉴 항목 활성 판단에도 쓴다.
 * - shot: 완료된 실사 스토리보드 이미지
 * - video: 썸네일(첫 프레임)
 * - asset: Artist 에셋 이미지
 * - scene/prompt: 이미지 없음
 */
export function nodePrimaryImageUrl(
  nodes: DirectorNode[],
  nodeId: string,
): string | null {
  const node = nodes.find((n) => n.id === nodeId)
  if (!node) return null
  const data = node.data
  if (isShotData(data)) {
    return data.storyboardImage?.status === 'completed'
      ? data.storyboardImage.url
      : null
  }
  if (isVideoData(data)) return data.thumbnailUrl
  if (isAssetData(data)) return data.imageUrl
  return null
}

async function fetchImageBlob(url: string): Promise<Blob> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`image fetch failed: ${response.status}`)
  return response.blob()
}

/** 이미지 URL을 PNG로 재인코드해 클립보드에 쓴다. 실패는 throw — 호출부가 토스트를 담당. */
export async function copyImageUrlToClipboard(url: string): Promise<void> {
  const blob = await fetchImageBlob(url)
  const bitmap = await createImageBitmap(blob)
  try {
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('canvas 2d context unavailable')
    ctx.drawImage(bitmap, 0, 0)
    const png = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('png encode failed'))),
        'image/png',
      )
    })
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })])
  } finally {
    bitmap.close()
  }
}

/** 이미지 URL을 blob 으로 받아 파일로 내려준다 (cross-origin 에서도 download 속성이 듣게). */
export async function downloadImageUrl(
  url: string,
  filename: string,
): Promise<void> {
  const blob = await fetchImageBlob(url)
  const objectUrl = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = objectUrl
  anchor.download = filename
  anchor.click()
  // 즉시 revoke 하면 브라우저가 다운로드를 못 끝낼 수 있어 지연 해제.
  setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000)
}
