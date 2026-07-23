'use client'

// Writer 실행 중 스토리 줄글 뷰어(#story-stream 2026-07-21 재설계).
//   목표: 생성되는 스토리를 "줄글"로 읽어 전체 서사를 파악. 연출·대사·샷 스펙 없이
//   씬의 scene_actions(네이티브 서사 비트)만 이어붙여 흐르는 산문으로 보여준다.
//   씬 구분(헤딩/카드)은 두지 않는다 — 문단 간격만으로 자연스러운 읽기 흐름 유지.
//   샷 단위 이야기(#shot-story): decoupage 완료 후 각 문단 아래 접힌 토글로만 표시
//   (읽기 방해 금지 — 첫 요청의 '생성 끝나면 접힌 상태로 표시' 계약 유지).

import { useState } from 'react'
import { ChevronRight, FileText } from 'lucide-react'
import { replaceSlugs, type SlugEntry } from '@/lib/script-lines'
import { cn } from '@/lib/utils'
import type { PreviewScene, WriterPreview } from '@/lib/writer/use-writer-preview'

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

/** 문단 아래 접힌 샷 단위 이야기 — 기본 접힘, 클릭 시에만 펼침(읽기 방해 X). */
function ShotStoryToggle({ lines, roster }: { lines: string[]; roster: SlugEntry[] }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="animate-in fade-in mt-1.5 duration-500">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex items-center gap-1 rounded-sm text-xs font-medium text-muted-foreground/80 transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring/50"
      >
        <ChevronRight className={cn('size-3.5 transition-transform', open && 'rotate-90')} />
        <span>
          샷 단위 이야기 {lines.length}개 {open ? '접기' : '보기'}
        </span>
      </button>
      {open ? (
        <ol className="mt-2 space-y-1.5 border-l-2 border-border/60 pl-4">
          {lines.map((line, i) => (
            <li
              key={i}
              className="animate-in fade-in slide-in-from-left-1 text-sm leading-7 text-muted-foreground duration-300"
              style={{ animationDelay: `${i * 40}ms`, animationFillMode: 'backwards' }}
            >
              {replaceSlugs(line, roster, '')}
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  )
}

function SceneParagraph({ scene, roster }: { scene: PreviewScene; roster: SlugEntry[] }) {
  // 씬의 서사 비트를 한 문단으로 이어붙이고 슬러그→이름 치환(줄글).
  const paragraph = replaceSlugs(scene.beats.join(' '), roster, '')
  return (
    <div>
      <p
        className="animate-in fade-in slide-in-from-bottom-2 text-[15px] leading-8 text-foreground/90 duration-700 ease-out"
        style={{ animationDelay: `${scene.index * PARA_STAGGER_MS}ms`, animationFillMode: 'backwards' }}
      >
        {paragraph}
      </p>
      {scene.shotStories.length > 0 ? (
        <ShotStoryToggle lines={scene.shotStories} roster={roster} />
      ) : null}
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
        {scenes.map((scene) => (
          <SceneParagraph key={scene.sceneId} scene={scene} roster={roster} />
        ))}
      </article>
      <p className="pt-6 text-center text-xs text-muted-foreground/70">
        이야기가 계속 생성되고 있어요 — 새 내용이 준비되면 자동으로 이어집니다.
      </p>
    </div>
  )
}
