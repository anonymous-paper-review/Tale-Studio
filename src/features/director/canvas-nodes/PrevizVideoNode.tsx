'use client'

// PREVIZ SHOT VIDEO 노드(#previz-chain 2026-07-22) — shots.previz_video(목각 연출 영상)의 파생 표시.
//
// BaseNode 를 쓰지 않는다(AssetNode 선례): 파생 노드라 Edit/Branch/Delete 헤더가 무의미하고,
// 진실은 writer-store(previz_video/rough) — 이 노드는 표시 + 생성 트리거만 담당한다.
// 체인: Shot(PREVIZ SHOT IMAGE) → 이 노드 → SHOT VIDEO.

import { memo, useState } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { Play, Square, Film } from 'lucide-react'
import { cn } from '@/lib/utils'
import { GeneratedImage, GeneratingOverlay } from '@/components/generating-frame'
import { useRoughStoryboard, usePrevizVideo } from '@/features/director/hooks/use-rough-storyboard'
import { useWriterStore } from '@/stores/writer-store'
import { isPrevizVideoData, type DirectorNode } from '@/types/director'
import { prettyNodeLabel } from '@/features/director/node-label'

function PrevizVideoNodeImpl({ data }: NodeProps<DirectorNode>) {
  const writerShotId = isPrevizVideoData(data) ? data.writerShotId : null
  const rough = useRoughStoryboard(writerShotId)
  const previz = usePrevizVideo(writerShotId)
  const generatePrevizVideo = useWriterStore((s) => s.generatePrevizVideo)
  const [busy, setBusy] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!isPrevizVideoData(data)) return null

  const roughStartUrl =
    rough?.frames?.start ?? (rough?.status === 'completed' ? rough.url : null)
  const url = previz?.status === 'completed' && previz.url ? previz.url : null
  const generating = previz?.status === 'generating' || busy
  // 산출물(previz 영상) 유무로 카드 톤 전환 — 없으면 플레이스홀더와 같은 회색 대시(2026-07-23 피드백).
  const hasContent = !!url

  const run = async () => {
    if (busy || !writerShotId || !roughStartUrl) return
    setBusy(true)
    setError(null)
    try {
      await generatePrevizVideo(writerShotId)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'previz 영상 생성에 실패했습니다.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className={cn(
        'group relative w-[260px] rounded-lg border',
        hasContent
          ? 'border-chart-5/70 bg-node-bg-default'
          : 'border-dashed border-border bg-node-bg-default/60 opacity-80 transition-opacity hover:opacity-100',
      )}
    >
      <Handle
        type="target"
        position={Position.Left}
        id="left"
        className={cn(
          '!h-2 !w-2 !border-0 opacity-0 group-hover:opacity-100',
          hasContent ? 'bg-chart-5' : 'bg-muted-foreground/60',
        )}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="right"
        className={cn(
          '!h-2 !w-2 !border-0 opacity-0 group-hover:opacity-100',
          hasContent ? 'bg-chart-5' : 'bg-muted-foreground/60',
        )}
      />

      <div
        className={cn(
          'flex h-7 items-center justify-between border-b px-3 text-xs',
          hasContent ? 'border-border/60' : 'border-dashed border-border/60',
        )}
      >
        <span
          className={cn(
            'flex items-center gap-1.5 font-medium uppercase tracking-wide',
            hasContent ? 'text-muted-foreground' : 'text-muted-foreground/70',
          )}
        >
          <span
            className={cn(
              'h-1.5 w-1.5 rounded-full',
              hasContent ? 'bg-chart-5' : 'bg-muted-foreground/50',
            )}
          />
          Previz shot video
        </span>
        <span className="max-w-24 truncate text-[10px] text-muted-foreground/70">
          {prettyNodeLabel(data.label)}
        </span>
      </div>

      <div className="p-2">
        <div
          className={cn(
            'relative aspect-video w-full overflow-hidden rounded-sm border',
            hasContent
              ? 'border-border/40 bg-muted/40'
              : 'border-dashed border-border/60 bg-muted/20',
          )}
        >
          {playing && url ? (
            <>
              <video
                src={url}
                autoPlay
                controls
                muted
                playsInline
                onEnded={() => setPlaying(false)}
                onClick={(e) => e.stopPropagation()}
                className="nodrag nopan h-full w-full bg-black object-contain"
              />
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  setPlaying(false)
                }}
                aria-label="정지"
                className="nodrag absolute right-1 top-1 z-10 rounded bg-black/60 p-0.5 text-white/90 transition-colors hover:bg-black/80"
              >
                <Square className="size-3" />
              </button>
            </>
          ) : url ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                setPlaying(true)
              }}
              aria-label="previz 재생"
              className="nodrag group/play relative block h-full w-full"
            >
              {roughStartUrl ? (
                <GeneratedImage
                  src={roughStartUrl}
                  alt={`${data.label} previz`}
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="flex h-full w-full items-center justify-center">
                  <Film className="size-6 text-muted-foreground" />
                </span>
              )}
              <span className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 transition-opacity group-hover/play:opacity-100">
                <Play className="size-6 fill-white text-white" />
              </span>
            </button>
          ) : roughStartUrl ? (
            <GeneratedImage
              src={roughStartUrl}
              alt={`${data.label} rough`}
              className="h-full w-full object-cover opacity-60"
            />
          ) : (
            <span className="flex h-full w-full items-center justify-center px-2 text-center text-[10px] text-muted-foreground">
              러프 스토리보드가 먼저 필요해요
            </span>
          )}
          <GeneratingOverlay active={generating} label="Previz 영상 생성 중" />
        </div>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            void run()
          }}
          disabled={!roughStartUrl || generating}
          className={cn(
            'nodrag mt-2 flex h-6 w-full items-center justify-center gap-1 rounded-md border border-border text-[10px] font-medium text-foreground',
            'transition-colors duration-100 hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50',
          )}
        >
          <Play className="size-3 fill-current" />
          {url ? 'Previz 재생성' : 'Previz 영상 생성'}
        </button>
        {(error || previz?.status === 'failed') && (
          <p className="mt-1 line-clamp-2 text-[10px] text-destructive">
            {error ?? previz?.errorMessage ?? 'previz 영상 생성 실패'}
          </p>
        )}
      </div>
    </div>
  )
}

export const PrevizVideoNode = memo(PrevizVideoNodeImpl)
