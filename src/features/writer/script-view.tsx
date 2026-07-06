'use client'

// Writer 탭 — read-only 스크립트 라인 뷰어.

import { useMemo } from 'react'
import { FileText, Loader2 } from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { WriterHeader } from '@/features/writer/writer-header'
import { buildScriptLines, type ScriptLine } from '@/lib/script-lines'
import { useWriterStatus } from '@/lib/writer/use-writer-status'
import { cn } from '@/lib/utils'
import { useChatUiStore } from '@/stores/chat-ui-store'
import { useProjectStore } from '@/stores/project-store'
import { useWriterStore } from '@/stores/writer-store'

function ScriptLineText({ line }: { line: ScriptLine }) {
  if (line.kind === 'sceneHeading') {
    return <span className="font-semibold uppercase text-foreground">{line.text}</span>
  }
  if (line.kind === 'dialogue') {
    return (
      <span className="block pl-6">
        <span className="font-medium">{line.characterName ?? '인물'}</span>: &quot;{line.text}&quot;
      </span>
    )
  }
  return <span>{line.text}</span>
}

export function ScriptView() {
  const projectId = useProjectStore((state) => state.projectId)
  const sceneManifest = useWriterStore((state) => state.sceneManifest)
  const shots = useWriterStore((state) => state.shots)
  const mentionedRefs = useChatUiStore((state) => state.mentionedRefs)
  const { status } = useWriterStatus(projectId)
  const lines = useMemo(() => buildScriptLines(sceneManifest, shots), [sceneManifest, shots])
  const running = !!(
    status?.started &&
    !status.pipeline_completed &&
    !status.pipeline_failed
  )
  const hasScenes = (sceneManifest?.scenes.length ?? 0) > 0
  const hasOnlySceneHeadings = hasScenes && shots.length === 0 && lines.length > 0

  const header = (
    <WriterHeader description="대본 뷰어 — 라인을 클릭하면 채팅에서 바로 수정을 지시할 수 있어요" />
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

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {header}
      <ScrollArea className="min-h-0 flex-1">
        <div className="py-4">
          {lines.map((line) => {
            const mentioned = mentionedRefs.includes(line.ref)
            return (
              <button
                key={line.ref}
                type="button"
                onClick={() =>
                  useChatUiStore.getState().requestMentionInsert(`L${line.lineNo}`)
                }
                className={cn(
                  'hover-red-beam flex w-full items-start gap-4 px-6 py-2 text-left text-sm leading-6 transition-colors [content-visibility:auto] hover:bg-accent/40 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring/50',
                  mentioned &&
                    'bg-sky-400/10 ring-1 ring-inset ring-sky-400/60 hover:bg-sky-400/15',
                )}
              >
                <span className="w-12 shrink-0 pt-px font-mono text-xs tabular-nums text-muted-foreground">
                  L{line.lineNo}
                </span>
                <span className="min-w-0 flex-1 break-words text-foreground">
                  <ScriptLineText line={line} />
                </span>
              </button>
            )
          })}
          {hasOnlySceneHeadings ? (
            <p className="px-6 pb-4 pt-2 text-sm text-muted-foreground">
              아직 샷이 없어요 — 채팅으로 샷을 추가할 수 있어요
            </p>
          ) : null}
        </div>
      </ScrollArea>
    </div>
  )
}
