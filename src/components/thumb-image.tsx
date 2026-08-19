'use client'

import { useState, type CSSProperties, type ReactEventHandler } from 'react'
import { thumbUrl } from '@/lib/image-url'

/**
 * 그리드/노드용 이미지 (방법 B). 사전 생성 썸네일(_thumb.webp)을 우선 로드하고,
 * 썸네일이 아직 없으면(백필 전) onError 로 원본에 폴백한다. lazy + async 디코드 기본.
 *
 * 폴백은 "실패한 src" 를 state 로 들고 파생 — src 가 바뀌면 자동으로 다시 썸네일을 시도한다
 * (effect 안 setState 없이). 원본도 실패하면 같은 값 set 이라 재렌더 없음(무한루프 없음).
 *
 * 이 컴포넌트가 썸네일 치환의 유일한 통로다 — 호출부에서 thumbUrl() 을 직접 감싸지 말 것
 * (폴백 상태가 필요해 호출부에서는 404 를 처리할 수 없다). 호출부가 쓰는 부가 속성
 * (onLoad, aria-hidden, style, loading)은 그대로 받아 <img> 에 전달한다.
 * 주의: 404 폴백이 일어나면 onLoad 가 두 번 불릴 수 있다 — 소비처는 멱등이어야 한다.
 */
export function ThumbImage({
  src,
  alt,
  className,
  style,
  draggable,
  loading = 'lazy',
  onLoad,
  'aria-hidden': ariaHidden,
}: {
  src: string
  alt: string
  className?: string
  style?: CSSProperties
  draggable?: boolean
  loading?: 'lazy' | 'eager'
  onLoad?: ReactEventHandler<HTMLImageElement>
  'aria-hidden'?: boolean
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  const thumb = thumbUrl(src)
  const showSrc = failedSrc === src || !thumb ? src : thumb
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={showSrc}
      alt={alt}
      loading={loading}
      decoding="async"
      draggable={draggable}
      style={style}
      aria-hidden={ariaHidden}
      onLoad={onLoad}
      onError={() => setFailedSrc(src)}
      className={className}
    />
  )
}
