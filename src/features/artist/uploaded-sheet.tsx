'use client'

// 올린 인물 그림을 담은 캐릭터 시트(오너 2026-11-10) — 흰 시트 양식 v4(public/character-template.png) 위에, 올린 그림을 칸 하나
//   (전신이면 턴어라운드 앞, 그 밖에는 대표)에 잘리지 않게 통째로 담는다. 나머지 칸은 빈 채로 둔다(AI 로 채우지 않는다).
//   칸은 그림 비율을 읽어야 정해진다 — 정해지기 전에는 그림을 숨겨 두어 칸이 바뀌며 튀지 않게 한다. 규칙: lib/artist/uploaded-sheet
import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { uploadedSheetBox, uploadedSheetTile, type UploadedSheetTile } from '@/lib/artist/uploaded-sheet'

export function UploadedSheet({ url, alt }: { url: string; alt: string }) {
  const [tile, setTile] = useState<UploadedSheetTile | null>(null)
  const imageRef = useRef<HTMLImageElement>(null)
  const place = (image: HTMLImageElement) => {
    if (image.naturalWidth > 0) setTile(uploadedSheetTile(image.naturalWidth, image.naturalHeight))
  }
  // 캐시에서 바로 읽힌 그림은 load 이벤트가 붙기 전에 끝났을 수 있다 — 붙은 뒤 한 번 더 본다.
  useEffect(() => {
    if (imageRef.current?.complete) place(imageRef.current)
  }, [url])
  const box = uploadedSheetBox(tile ?? 'portrait')
  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-md bg-white" data-testid="artist-uploaded-sheet" data-tile={tile ?? 'loading'}>
      {/* eslint-disable-next-line @next/next/no-img-element -- 정적 시트 양식(빈 칸 · 칸 이름)을 그대로 깐다 */}
      <img src="/character-template.png" alt="" aria-hidden draggable={false} className="pointer-events-none absolute inset-0 size-full select-none object-fill" />
      {/* eslint-disable-next-line @next/next/no-img-element -- 사용자가 올린 원본(보관함 public URL)을 칸에 담는다 */}
      <img
        ref={imageRef}
        src={url}
        alt={alt}
        draggable={false}
        onLoad={(event) => place(event.currentTarget)}
        className={cn('absolute object-contain transition-opacity duration-150', tile ? 'opacity-100' : 'opacity-0')}
        style={{ left: `${box.left}%`, top: `${box.top}%`, width: `${box.width}%`, height: `${box.height}%` }}
      />
    </div>
  )
}
