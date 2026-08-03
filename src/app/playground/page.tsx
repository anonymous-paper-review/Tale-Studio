'use client'

// Playground — 공개 갤러리 (#landing-v2 2026-08-03).
//   다른 창작자들이 공개한 영상·이미지가 뜨는 페이지. 로그인 없이 접근 가능(마케팅 표면),
//   프로젝트 대시보드의 탭에서도 진입한다. 데이터는 /api/playground(큐레이션 테이블).
//   영상은 hover 재생(디렉터 그리드와 같은 UX — 전 카드 동시 재생은 소음).

import { useEffect, useRef, useState } from 'react'
import { Clapperboard, Loader2 } from 'lucide-react'
import { SiteHeader } from '@/components/marketing/site-header'
import { SiteFooter } from '@/components/marketing/site-footer'

interface PlaygroundItem {
  id: string
  kind: 'video' | 'image'
  url: string
  thumbnail_url: string | null
  title: string
  author_name: string
}

function HoverVideo({ item }: { item: PlaygroundItem }) {
  const ref = useRef<HTMLVideoElement>(null)
  return (
    <video
      ref={ref}
      src={item.url}
      poster={item.thumbnail_url ?? undefined}
      muted
      loop
      playsInline
      preload="metadata"
      className="size-full object-cover"
      onMouseEnter={() => void ref.current?.play().catch(() => {})}
      onMouseLeave={() => ref.current?.pause()}
    />
  )
}

export default function PlaygroundPage() {
  const [items, setItems] = useState<PlaygroundItem[] | null>(null)

  useEffect(() => {
    fetch('/api/playground')
      .then((r) => r.json())
      .then((data) => setItems(data.items ?? []))
      .catch(() => setItems([]))
  }, [])

  return (
    <div className="flex min-h-screen flex-col bg-black text-white">
      <SiteHeader />
      <main className="mx-auto w-full max-w-7xl flex-1 px-6 pb-20 pt-28">
        <div className="mb-10">
          <h1 className="mb-2 text-3xl font-semibold tracking-tighter md:text-4xl">Playground</h1>
          <p className="text-sm font-light text-gray-400">
            창작자들이 공개한 작품들 — Tale Studio 로 만들어졌습니다.
          </p>
        </div>

        {items === null ? (
          <div className="flex items-center justify-center py-32">
            <Loader2 className="size-6 animate-spin text-gray-500" />
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-[2rem] border border-dashed border-white/10 py-32 text-center">
            <Clapperboard className="size-10 text-gray-600" />
            <p className="mt-4 text-sm text-gray-500">아직 공개된 작품이 없어요</p>
            <p className="mt-1 text-xs text-gray-600">
              첫 번째로 작품을 공개할 창작자를 기다리고 있어요.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((item) => (
              <figure
                key={item.id}
                className="group overflow-hidden rounded-2xl border border-white/10 bg-white/5 transition-colors hover:border-white/25"
              >
                <div className="relative aspect-video overflow-hidden bg-black">
                  {item.kind === 'video' ? (
                    <HoverVideo item={item} />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.url}
                      alt={item.title}
                      loading="lazy"
                      className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                    />
                  )}
                </div>
                {(item.title || item.author_name) && (
                  <figcaption className="flex items-baseline justify-between gap-3 px-4 py-3">
                    <span className="truncate text-sm font-medium text-gray-200">
                      {item.title || 'Untitled'}
                    </span>
                    {item.author_name && (
                      <span className="shrink-0 text-xs text-gray-500">{item.author_name}</span>
                    )}
                  </figcaption>
                )}
              </figure>
            ))}
          </div>
        )}
      </main>
      <SiteFooter />
    </div>
  )
}
