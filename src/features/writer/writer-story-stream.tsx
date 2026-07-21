'use client'

// Writer 실행 중 스토리 줄글 뷰어(#story-stream 2026-07-21 재설계).
//   목표: 생성되는 스토리를 "줄글"로 읽어 전체 서사를 파악. 연출·대사·샷 스펙 없이
//   씬의 scene_actions(네이티브 서사 비트)만 이어붙여 흐르는 산문으로 보여준다.
//   씬 구분(헤딩/카드)은 두지 않는다 — 문단 간격만으로 자연스러운 읽기 흐름 유지.

import { FileText } from 'lucide-react'
import { replaceSlugs, type SlugEntry } from '@/lib/script-lines'
import type { WriterPreview } from '@/lib/writer/use-writer-preview'

const PARA_STAGGER_MS = 90

/** 첫 서사가 도착하기 전 — "이야기를 쓰는 중" 문서 연출(은은). */
function PreparingPlaceholder() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
      <div className="relative">
        <div className="absolute inset-0 -z-10 animate-pulse rounded-full bg-primary/15 blur-2xl" />
        <FileText className="animate-writer-float size-12 text-primary/80" />
      </div>
      <p className="text-base font-medium">이야기를 쓰고 있어요…</p>
      <p className="max-w-xs text-sm text-muted-foreground">
        완성되는 대로 이야기가 여기에 줄글로 이어집니다. 편하게 기다리며 읽어보세요.
      </p>
      <div className="mt-2 w-full max-w-md space-y-2">
        <div className="h-3 w-3/4 animate-pulse rounded bg-muted" />
        <div className="h-3 w-full animate-pulse rounded bg-muted [animation-delay:150ms]" />
        <div className="h-3 w-5/6 animate-pulse rounded bg-muted [animation-delay:300ms]" />
      </div>
    </div>
  )
}

export function WriterStoryStream({ preview }: { preview: WriterPreview | null }) {
  const scenes = (preview?.scenes ?? []).filter((s) => s.beats.length > 0)
  const roster: SlugEntry[] = preview?.roster ?? []

  if (scenes.length === 0) {
    return (
      <div className="mx-auto w-full max-w-2xl px-6 py-8">
        <PreparingPlaceholder />
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-8">
      <article className="space-y-5">
        {scenes.map((scene) => {
          // 씬의 서사 비트를 한 문단으로 이어붙이고 슬러그→이름 치환(줄글).
          const paragraph = replaceSlugs(scene.beats.join(' '), roster, '')
          return (
            <p
              key={scene.sceneId}
              className="animate-in fade-in slide-in-from-bottom-2 text-[15px] leading-8 text-foreground/90 duration-700 ease-out"
              style={{ animationDelay: `${scene.index * PARA_STAGGER_MS}ms`, animationFillMode: 'backwards' }}
            >
              {paragraph}
            </p>
          )
        })}
      </article>
      <p className="pt-6 text-center text-xs text-muted-foreground/70">
        이야기가 계속 생성되고 있어요 — 새 내용이 준비되면 자동으로 이어집니다.
      </p>
    </div>
  )
}
