'use client'

// 프로젝트 카드의 그림 자리(#landing-v2b 대표 썸네일 · 11/5 시안 R2) — 이름만으로는 구별이 어려워 프로젝트의 첫 그림을 얹는다.
//   아직 그림이 없거나, 썸네일을 못 읽으면(파일이 지워짐 · 닿지 않는 주소) 깨진 그림 대신 이름 첫 글자 타일을 보인다(리드 2026-11-09).
//   바탕은 v3 그림 자리(Content/Art Placeholder). [container-type:size] 는 #thumb-fit 의 100cqh(박스 높이 기준 팬 종점) 용.
//   약속: tests/project/card-thumb.test.ts
import { useState } from 'react'

export function ProjectCardArt({ url, title }: { url: string | null; title: string }) {
  // 못 읽은 썸네일 주소 — 주소가 바뀌면(새 그림) 다시 읽어 본다.
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  return (
    <div className="relative aspect-video overflow-hidden bg-art-placeholder [container-type:size]">
      {url && failedUrl !== url ? (
        <ProjectThumb url={url} onError={() => setFailedUrl(url)} />
      ) : (
        <div className="flex size-full items-center justify-center">
          <span className="select-none text-5xl font-bold text-foreground/15">{(title || 'U').charAt(0).toUpperCase()}</span>
        </div>
      )}
    </div>
  )
}

// #thumb-fit(2026-08-23 오너): 16:9 박스에 object-cover 로 욱여넣으면 이형 해상도(웹툰 세로 스트립,
//   시네마 와이드)가 잘려 보인다. 박스는 16:9 그대로 두고 — 세로형은 가로폭을 맞춰 위부터 넣고
//   호버 시 위→아래로 훑어 내려가며(넘친 만큼), 와이드형은 가로폭 맞춤 = 상하 레터박스.
//   판정은 로드된 실제 비율로 — 16:9 근방(±3%)만 종전 cover 유지.
export function ProjectThumb({ url, onError }: { url: string; onError: () => void }) {
  const [fit, setFit] = useState<'cover' | 'tall' | 'wide'>('cover')
  const [panMs, setPanMs] = useState(0)
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt=""
      loading="lazy"
      onError={onError}
      onLoad={(e) => {
        const im = e.currentTarget
        if (!im.naturalWidth || !im.naturalHeight) return
        const ratio = im.naturalWidth / im.naturalHeight
        const box = 16 / 9
        if (ratio < box * 0.97) {
          setFit('tall')
          // 팬 시간은 넘친 높이에 비례 — 짧은 초과는 최소 1.2s, 웹툰 스트립도 6s 안에 완주.
          setPanMs(Math.min(6000, Math.max(1200, (box / ratio - 1) * 2600)))
        } else {
          setFit(ratio > box * 1.03 ? 'wide' : 'cover')
        }
      }}
      style={fit === 'tall' ? { transitionDuration: `${panMs}ms` } : undefined}
      className={
        fit === 'tall'
          ? 'absolute inset-x-0 top-0 w-full transition-transform ease-in-out group-hover:translate-y-[calc(100cqh-100%)]'
          : fit === 'wide'
            ? 'absolute inset-x-0 top-1/2 w-full -translate-y-1/2 transition-transform duration-500 group-hover:scale-[1.03]'
            : 'size-full object-cover transition-transform duration-500 group-hover:scale-[1.03]'
      }
    />
  )
}
