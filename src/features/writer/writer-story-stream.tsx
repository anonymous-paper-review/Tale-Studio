'use client'

// Writer 실행 중 점진적 스토리 뷰어(#story-stream 2026-07-21).
//   생성된 씬 스토리를 "종이 한 장씩 놓이듯" 순차(stagger) 등장시키고,
//   각 씬의 샷 스토리는 생성이 끝나면 씬 아래에 '접힌 상태'로만 붙여 읽기를 방해하지 않는다.
//   강제 스크롤 없음 — 유저가 자유롭게 읽는 뷰어. 데이터는 useWriterPreview 폴링으로 증분 도달.

import { useState } from 'react'
import { ChevronRight, Clapperboard, FileText } from 'lucide-react'
import { replaceSlugs, type SlugEntry } from '@/lib/script-lines'
import { cn } from '@/lib/utils'
import type { PreviewScene, PreviewShot, WriterPreview } from '@/lib/writer/use-writer-preview'

const SCENE_STAGGER_MS = 110

function SceneShots({
  shots,
  roster,
}: {
  shots: PreviewShot[]
  roster: SlugEntry[]
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="mt-3 border-t border-border/50 pt-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-1.5 rounded-sm py-1 text-left text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring/50"
      >
        <ChevronRight className={cn('size-3.5 transition-transform', open && 'rotate-90')} />
        <Clapperboard className="size-3.5" />
        <span>
          샷 {shots.length}개 {open ? '접기' : '보기'}
        </span>
      </button>
      {open ? (
        <ol className="mt-1 space-y-1.5 pl-5">
          {shots.map((shot, i) => (
            <li
              key={shot.shotId}
              className="animate-in fade-in slide-in-from-left-1 flex items-start gap-2 text-sm leading-6 duration-300"
            >
              <span className="mt-0.5 w-14 shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
                Shot {i + 1}
                {shot.shotType ? (
                  <span className="ml-1 text-muted-foreground/70">{shot.shotType}</span>
                ) : null}
              </span>
              <span className="min-w-0 flex-1 break-words text-foreground/90">
                {replaceSlugs(shot.purpose || '(연출 의도 미정)', roster, '')}
                {shot.duration != null ? (
                  <span className="ml-1 text-xs text-muted-foreground/70">· {shot.duration}s</span>
                ) : null}
              </span>
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  )
}

function SceneCard({
  scene,
  shots,
  roster,
}: {
  scene: PreviewScene
  shots: PreviewShot[] | undefined
  roster: SlugEntry[]
}) {
  const heading = [replaceSlugs(scene.location, roster, ''), scene.timeOfDay]
    .filter(Boolean)
    .join(' · ')
  return (
    <article
      className="animate-in fade-in slide-in-from-bottom-4 rounded-lg border border-border/70 bg-card/60 p-4 shadow-sm duration-700 ease-out"
      style={{ animationDelay: `${scene.index * SCENE_STAGGER_MS}ms`, animationFillMode: 'backwards' }}
    >
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-foreground">
          {heading || `Scene ${scene.index + 1}`}
        </h3>
        <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
          Scene {scene.index + 1}
        </span>
      </div>

      {scene.summary ? (
        <p className="mt-2 text-[15px] leading-7 text-foreground/90">
          {replaceSlugs(scene.summary, roster, '')}
        </p>
      ) : null}

      {scene.beats.length > 0 ? (
        <div className="mt-2 space-y-1.5">
          {scene.beats.map((beat, i) => (
            <p key={i} className="text-sm leading-6 text-muted-foreground">
              {replaceSlugs(beat, roster, '')}
            </p>
          ))}
        </div>
      ) : null}

      {shots && shots.length > 0 ? <SceneShots shots={shots} roster={roster} /> : null}
    </article>
  )
}

/** 첫 씬이 도착하기 전 — "이야기를 쓰는 중" 문서 연출(은은). */
function PreparingPlaceholder() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
      <div className="relative">
        <div className="absolute inset-0 -z-10 animate-pulse rounded-full bg-primary/15 blur-2xl" />
        <FileText className="animate-writer-float size-12 text-primary/80" />
      </div>
      <p className="text-base font-medium">이야기를 쓰고 있어요…</p>
      <p className="max-w-xs text-sm text-muted-foreground">
        완성되는 대로 씬 스토리가 여기에 한 장씩 놓입니다. 편하게 기다리며 읽어보세요.
      </p>
      {/* 종이 스켈레톤 3줄 (은은한 pulse) */}
      <div className="mt-2 w-full max-w-sm space-y-2">
        <div className="h-3 w-3/4 animate-pulse rounded bg-muted" />
        <div className="h-3 w-full animate-pulse rounded bg-muted [animation-delay:150ms]" />
        <div className="h-3 w-5/6 animate-pulse rounded bg-muted [animation-delay:300ms]" />
      </div>
    </div>
  )
}

export function WriterStoryStream({ preview }: { preview: WriterPreview | null }) {
  const scenes = preview?.scenes ?? []
  const roster = preview?.roster ?? []
  const shotsByScene = preview?.shotsByScene ?? {}

  if (scenes.length === 0) {
    return (
      <div className="mx-auto w-full max-w-3xl px-6 py-6">
        <PreparingPlaceholder />
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 px-6 py-6">
      {scenes.map((scene) => (
        <SceneCard
          key={scene.sceneId}
          scene={scene}
          shots={shotsByScene[scene.sceneId]}
          roster={roster}
        />
      ))}
      <p className="pt-2 text-center text-xs text-muted-foreground/70">
        이야기가 계속 생성되고 있어요 — 새 씬과 샷이 준비되면 자동으로 추가됩니다.
      </p>
    </div>
  )
}
