'use client'

// 올린 인물 그림을 담은 캐릭터 시트(오너 2026-11-10) — 흰 시트 양식 v4(public/character-template.png) 위에, 올린 그림을 칸 하나
//   (전신이면 턴어라운드 앞, 그 밖에는 대표)에 잘리지 않게 통째로 담는다. 나머지 칸은 빈 채로 둔다(AI 로 채우지 않는다).
//   칸은 그림 비율을 읽어야 정해진다 — 정해지기 전에는 그림을 숨겨 두어 칸이 바뀌며 튀지 않게 한다.
//   읽지 못하면(주소 만료 · 지워짐 · 끊김) 숨긴 채 두지 않고 대표 칸에 실패를 알린다(검토 B 2026-11-10). 규칙: lib/artist/uploaded-sheet
import { useEffect, useRef, useState, type Ref } from 'react'
import { ImageOff } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useT } from '@/lib/i18n'
import { uploadedSheetBox, uploadedSheetLoad, type UploadedSheetLoad } from '@/lib/artist/uploaded-sheet'

export function UploadedSheet({ url, alt }: { url: string; alt: string }) {
  const [load, setLoad] = useState<UploadedSheetLoad | null>(null)
  const imageRef = useRef<HTMLImageElement>(null)
  const read = (image: HTMLImageElement) => setLoad(uploadedSheetLoad({ width: image.naturalWidth, height: image.naturalHeight }))
  // 캐시에서 바로 읽혔거나 이미 읽기에 실패한 그림은 load · error 이벤트가 붙기 전에 끝났을 수 있다 — 붙은 뒤 한 번 더 본다.
  useEffect(() => {
    if (imageRef.current?.complete) read(imageRef.current)
  }, [url])
  return <UploadedSheetFrame url={url} alt={alt} load={load} imageRef={imageRef} onLoad={read} onError={() => setLoad(uploadedSheetLoad('error'))} />
}

/** 읽은 결과대로 그린 시트 — 읽기 전에는 그림을 숨기고, 읽지 못했으면 대표 칸에 "그림을 불러오지 못했어요"를 보인다. */
export function UploadedSheetFrame({
  url,
  alt,
  load,
  imageRef,
  onLoad,
  onError,
}: {
  url: string
  alt: string
  load: UploadedSheetLoad | null
  imageRef?: Ref<HTMLImageElement>
  onLoad?: (image: HTMLImageElement) => void
  onError?: () => void
}) {
  const t = useT()
  const box = uploadedSheetBox(load?.tile ?? 'portrait')
  const place = { left: `${box.left}%`, top: `${box.top}%`, width: `${box.width}%`, height: `${box.height}%` }
  return (
    <div
      className="relative aspect-video w-full overflow-hidden rounded-[14px] bg-white"
      data-testid="artist-uploaded-sheet"
      data-tile={load?.tile ?? 'loading'}
      data-failed={load?.failed ? 'true' : undefined}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- 정적 시트 양식(빈 칸 · 칸 이름)을 그대로 깐다 */}
      <img src="/character-template.png" alt="" aria-hidden draggable={false} className="pointer-events-none absolute inset-0 size-full select-none object-fill" />
      {/* eslint-disable-next-line @next/next/no-img-element -- 사용자가 올린 원본(보관함 public URL)을 칸에 담는다 */}
      <img
        ref={imageRef}
        src={url}
        alt={alt}
        draggable={false}
        onLoad={(event) => onLoad?.(event.currentTarget)}
        onError={onError}
        className={cn('absolute object-contain transition-opacity duration-150', load && !load.failed ? 'opacity-100' : 'opacity-0')}
        style={place}
      />
      {load?.failed ? (
        <p className="absolute flex flex-col items-center justify-center gap-1 p-1 text-center text-micro leading-tight text-on-stage/70" style={place}>
          <ImageOff className="size-4 shrink-0" aria-hidden />
          {t('Could not load the picture')}
        </p>
      ) : null}
    </div>
  )
}
