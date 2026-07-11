'use client'

// Writer 탭 — read-only 스크립트 뷰어.
//   씬 단위 블록: 씬 헤딩(클릭=@L 멘션) → 스토리 비트(읽기 본문, primary) → 샷 섹션(접힘, 클릭=@L).
//   직접 편집은 없다 — 수정은 @L 라인 클릭으로 채팅에 지시한다.

import { useMemo, useState } from 'react'
import { ChevronRight, FileText, Loader2 } from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { WriterHeader } from '@/features/writer/writer-header'
import { buildScriptLines, type ScriptLine } from '@/lib/script-lines'
import { useWriterStatus } from '@/lib/writer/use-writer-status'
import { cn } from '@/lib/utils'
import type { Scene } from '@/types'
import { useChatUiStore } from '@/stores/chat-ui-store'
import { useProjectStore } from '@/stores/project-store'
import { useWriterStore } from '@/stores/writer-store'

// L# 없는 헤딩 텍스트 컬럼과 정렬시키는 들여쓰기 (px-6 + w-12 L열 + gap-4).
const TEXT_INDENT = 'pl-[5.5rem] pr-6'

function ScriptLineText({ line }: { line: ScriptLine }) {
  if (line.kind === 'sceneHeading') {
    return <span className="font-semibold uppercase tracking-wide text-foreground">{line.text}</span>
  }
  if (line.kind === 'dialogue') {
    return (
      <span className="block">
        <span className="font-medium">{line.characterName ?? '인물'}</span>: &quot;{line.text}&quot;
      </span>
    )
  }
  return <span>{line.text}</span>
}

function ScriptLineButton({
  line,
  mentioned,
  onToggle,
}: {
  line: ScriptLine
  mentioned: boolean
  onToggle: (lineNo: number) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onToggle(line.lineNo)}
      aria-pressed={mentioned}
      className={cn(
        'hover-red-beam flex w-full items-start gap-4 px-6 py-1.5 text-left text-sm leading-7 transition-colors [content-visibility:auto] hover:bg-accent/40 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring/50',
        mentioned && 'bg-sky-400/10 ring-1 ring-inset ring-sky-400/60 hover:bg-sky-400/15',
      )}
    >
      <span className="w-12 shrink-0 pt-px font-mono text-xs tabular-nums tracking-wide text-muted-foreground">
        L{line.lineNo}
      </span>
      <span className="min-w-0 flex-1 break-words text-foreground">
        <ScriptLineText line={line} />
      </span>
    </button>
  )
}

function SceneBeats({ scene }: { scene: Scene }) {
  const summary = scene.narrativeSummary?.trim()
  const quote = scene.originalTextQuote?.trim()
  if (!summary && !quote) {
    return (
      <p className={cn(TEXT_INDENT, 'pb-1 pt-0.5 text-sm italic text-muted-foreground/70')}>
        스토리 텍스트 없음
      </p>
    )
  }
  return (
    <div className={cn(TEXT_INDENT, 'space-y-2 pb-1 pt-0.5')}>
      {summary ? <p className="text-xs text-muted-foreground">{summary}</p> : null}
      {quote ? (
        <p className="max-w-[68ch] text-[15px] leading-7 text-foreground/90">{quote}</p>
      ) : null}
    </div>
  )
}

function ShotSection({
  sceneId,
  lines,
  mentionedRefs,
  onToggle,
}: {
  sceneId: string
  lines: ScriptLine[]
  mentionedRefs: string[]
  onToggle: (lineNo: number) => void
}) {
  const hasMentioned = lines.some((l) => mentionedRefs.includes(l.ref))
  // 기본 접힘. 사용자가 명시적으로 토글하면 그 값이 우선, 미조작 씬에 멘션이 걸리면 자동 펼침.
  const [override, setOverride] = useState<boolean | null>(null)
  const open = override ?? hasMentioned

  if (lines.length === 0) {
    return (
      <p className={cn(TEXT_INDENT, 'py-1 text-xs text-muted-foreground/70')}>샷 없음</p>
    )
  }

  const range =
    lines.length > 1
      ? `L${lines[0].lineNo}–L${lines[lines.length - 1].lineNo}`
      : `L${lines[0].lineNo}`

  return (
    <div>
      <button
        type="button"
        onClick={() => setOverride(!open)}
        aria-expanded={open}
        className={cn(
          TEXT_INDENT,
          'flex w-full items-center gap-1.5 py-1 text-left text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring/50',
        )}
      >
        <ChevronRight className={cn('size-3.5 transition-transform', open && 'rotate-90')} />
        <span>
          샷 {lines.length}개 {open ? '접기' : '보기'} ({range})
        </span>
      </button>
      {open
        ? lines.map((line) => (
            <ScriptLineButton
              key={line.ref}
              line={line}
              mentioned={mentionedRefs.includes(line.ref)}
              onToggle={onToggle}
            />
          ))
        : null}
    </div>
  )
}

export function ScriptView() {
  const projectId = useProjectStore((state) => state.projectId)
  const sceneManifest = useWriterStore((state) => state.sceneManifest)
  const shots = useWriterStore((state) => state.shots)
  const mentionedRefs = useChatUiStore((state) => state.mentionedRefs)
  const { status } = useWriterStatus(projectId)
  const lines = useMemo(() => buildScriptLines(sceneManifest, shots), [sceneManifest, shots])

  const onToggle = (lineNo: number) =>
    useChatUiStore.getState().requestMentionToggle(`L${lineNo}`)

  const { headingByScene, shotLinesByScene, orphanLines } = useMemo(() => {
    const sceneIds = new Set((sceneManifest?.scenes ?? []).map((s) => s.sceneId))
    const headingByScene = new Map<string, ScriptLine>()
    const shotLinesByScene = new Map<string, ScriptLine[]>()
    const orphanLines: ScriptLine[] = []
    for (const line of lines) {
      if (line.kind === 'sceneHeading') {
        headingByScene.set(line.sceneId, line)
        continue
      }
      if (!sceneIds.has(line.sceneId)) {
        orphanLines.push(line)
        continue
      }
      const arr = shotLinesByScene.get(line.sceneId) ?? []
      arr.push(line)
      shotLinesByScene.set(line.sceneId, arr)
    }
    return { headingByScene, shotLinesByScene, orphanLines }
  }, [lines, sceneManifest])

  const running = !!(
    status?.started &&
    !status.pipeline_completed &&
    !status.pipeline_failed
  )

  const header = (
    <WriterHeader description="대본 뷰어 — 라인을 클릭하면 채팅에서 바로 수정을 지시할 수 있어요 (다시 클릭하면 해제)" />
  )

  if (lines.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        {header}
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
          {running ? (
            <>
              <Loader2 className="size-6 animate-spin text-muted-foreground" aria-busy="true" />
              <p className="text-base font-medium">Writer가 대본을 쓰는 중…</p>
              <p className="text-sm text-muted-foreground">
                <span className="font-mono tabular-nums">
                  {status?.progress_percent ?? 0}%
                </span>
                {status?.current_stage ? ` · ${status.current_stage}` : ''}
              </p>
            </>
          ) : (
            <>
              <FileText className="size-12 text-muted-foreground" />
              <p className="text-base font-medium">아직 대본이 없어요</p>
              <p className="text-sm text-muted-foreground">
                {status?.pipeline_failed
                  ? 'Writer 실행이 실패했어요. Producer에서 다시 실행해주세요.'
                  : 'Producer에서 스토리를 핸드오프하면 대본이 생성됩니다.'}
              </p>
            </>
          )}
        </div>
      </div>
    )
  }

  const scenes = sceneManifest?.scenes ?? []

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {header}
      <ScrollArea className="min-h-0 flex-1">
        <div className="py-2">
          {scenes.map((scene) => {
            const heading = headingByScene.get(scene.sceneId)
            const sceneShots = shotLinesByScene.get(scene.sceneId) ?? []
            return (
              <section key={scene.sceneId} className="border-b border-border/40 pb-3 last:border-b-0">
                {heading ? (
                  <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm">
                    <ScriptLineButton
                      line={heading}
                      mentioned={mentionedRefs.includes(heading.ref)}
                      onToggle={onToggle}
                    />
                  </div>
                ) : null}
                <SceneBeats scene={scene} />
                <ShotSection
                  sceneId={scene.sceneId}
                  lines={sceneShots}
                  mentionedRefs={mentionedRefs}
                  onToggle={onToggle}
                />
              </section>
            )
          })}

          {orphanLines.length > 0 ? (
            <section className="pb-3 pt-1">
              <p className={cn(TEXT_INDENT, 'py-1 text-xs font-medium uppercase tracking-wider text-muted-foreground')}>
                씬 미배정 샷
              </p>
              {orphanLines.map((line) => (
                <ScriptLineButton
                  key={line.ref}
                  line={line}
                  mentioned={mentionedRefs.includes(line.ref)}
                  onToggle={onToggle}
                />
              ))}
            </section>
          ) : null}
        </div>
      </ScrollArea>
    </div>
  )
}
