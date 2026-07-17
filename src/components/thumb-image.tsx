'use client'

import { useState } from 'react'
import { thumbUrl } from '@/lib/image-url'

/**
 * 그리드/노드용 이미지 (방법 B). 사전 생성 썸네일(_thumb.webp)을 우선 로드하고,
 * 썸네일이 아직 없으면(백필 전) onError 로 원본에 폴백한다. lazy + async 디코드 기본.
 *
 * 폴백은 "실패한 src" 를 state 로 들고 파생 — src 가 바뀌면 자동으로 다시 썸네일을 시도한다
 * (effect 안 setState 없이). 원본도 실패하면 같은 값 set 이라 재렌더 없음(무한루프 없음).
 */
export function ThumbImage({
  src,
  alt,
  className,
  draggable,
}: {
  src: string
  alt: string
  className?: string
  draggable?: boolean
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  const thumb = thumbUrl(src)
  const showSrc = failedSrc === src || !thumb ? src : thumb
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={showSrc}
      alt={alt}
      loading="lazy"
      decoding="async"
      draggable={draggable}
      onError={() => setFailedSrc(src)}
      className={className}
    />
  )
}
