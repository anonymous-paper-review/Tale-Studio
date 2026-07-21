'use client'

import { memo, useEffect, useRef, useState } from 'react'
import { NodeToolbar, Position, type NodeProps } from '@xyflow/react'
import { Play, RefreshCw, Square, Star } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { GeneratedImage, GeneratingOverlay } from '@/components/generating-frame'
import { BaseNode } from './BaseNode'
import { useDirectorCanvasStore } from '@/stores/director-store'
import { isShotData, isVideoData, type DirectorNode } from '@/types/director'
import { cn } from '@/lib/utils'

function VideoNodeImpl({ id, data, selected }: NodeProps<DirectorNode>) {
  const setVideoFinal = useDirectorCanvasStore((s) => s.setVideoFinal)
  const playingNodeId = useDirectorCanvasStore((s) => s.playingNodeId)
  const setPlayingNode = useDirectorCanvasStore((s) => s.setPlayingNode)
  const ensureVideoThumbnail = useDirectorCanvasStore(
    (s) => s.ensureVideoThumbnail,
  )
  const generateVideoForShot = useDirectorCanvasStore(
    (s) => s.generateVideoForShot,
  )
  // Any generating sibling locks retakes for this shot.
  const parentShotId = isVideoData(data) ? data.parentShotNodeId : null
  const parentGenerating = useDirectorCanvasStore((s) =>
    !!parentShotId &&
    s.nodes.some(
      (node) =>
        isVideoData(node.data) &&
        node.data.parentShotNodeId === parentShotId &&
        node.data.lastAttemptStatus === 'generating',
    ),
  )
  // 카드 제목 = 연결된 부모 샷 번호(#e3 2026-07-15): take_v1 대신 'Shot 14'처럼 표기.
  //   selector는 라벨 문자열만 반환(참조 안정). 부모가 없으면 자체 라벨(take 패턴 변환) 폴백.
  const parentShotLabel = useDirectorCanvasStore((s) => {
    if (!parentShotId) return null
    const p = s.nodes.find((n) => n.id === parentShotId)
    return p && isShotData(p.data) ? p.data.label : null
  })

  // effect 입력은 early-return 전에 안전 추출 (훅은 무조건 호출돼야 함).
  const vStatus = isVideoData(data) ? data.status : null
  const vVideoUrl = isVideoData(data) ? data.videoUrl : null
  const vThumb = isVideoData(data) ? data.thumbnailUrl : null
  const vFinal = isVideoData(data) ? data.final : false
  const [finalState, setFinalState] = useState<{
    nodeId: string
    intent: boolean
    busy: boolean
    error: string | null
  } | null>(null)
  const operationRef = useRef(0)
  const activeNodeIdRef = useRef(id)
  const nodeSessionRef = useRef(0)
  const finalBusy = finalState?.nodeId === id ? finalState.busy : false
  const finalError =
    finalState?.nodeId === id && finalState.intent !== vFinal
      ? finalState.error
      : null

  // 완료됐지만 썸네일이 없는(하이드레이트된 기존) 영상 → 첫 프레임 lazy 캡처 1회.
  useEffect(() => {
    if (vStatus === 'completed' && vVideoUrl && !vThumb) {
      void ensureVideoThumbnail(id)
    }
  }, [id, vStatus, vVideoUrl, vThumb, ensureVideoThumbnail])
  useEffect(() => {
    activeNodeIdRef.current = id
    nodeSessionRef.current += 1
  }, [id])

  if (!isVideoData(data)) return null

  const isPlaying = playingNodeId === id
  const overrideKeys = Object.keys(data.override) as (keyof typeof data.override)[]

  const isStrongStale = data.stale
  const canMarkFinal = !!data.videoUrl && data.status === 'completed'


  const handleFinalToggle = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!canMarkFinal || finalBusy) return
    const operation = ++operationRef.current
    const session = nodeSessionRef.current
    const intent = !data.final
    setFinalState({ nodeId: id, intent, busy: true, error: null })
    try {
      await setVideoFinal(id, intent)
      if (
        operation === operationRef.current &&
        activeNodeIdRef.current === id &&
        nodeSessionRef.current === session
      ) {
        setFinalState(null)
      }
    } catch (error) {
      if (
        operation === operationRef.current &&
        activeNodeIdRef.current === id &&
        nodeSessionRef.current === session
      ) {
        setFinalState({
          nodeId: id,
          intent,
          busy: false,
          error: error instanceof Error ? error.message : 'Final 설정에 실패했습니다.',
        })
      }
    }
  }
  // single-play: 이 노드를 재생으로 지정 → 다른 노드는 playingNodeId 불일치로 <video> 언마운트(정지).
  const handlePlay = (e: React.MouseEvent) => {
    e.stopPropagation()
    setPlayingNode(id)
  }
  const handleStop = (e: React.MouseEvent) => {
    e.stopPropagation()
    setPlayingNode(null)
  }

  return (
    <>
      {/* 선택 시 상단 플로팅 툴바(#e4) — 옛 SHOT IMAGE 카드의 '새 영상 테이크'가 여기로 이동.
          부모 샷 설정으로 새 테이크를 만들어 재생성한다. */}
      <NodeToolbar isVisible={selected} position={Position.Top} offset={8}>
        <div className="flex items-center gap-1 rounded-md border border-border bg-popover p-1 shadow-md">
          <Button
            size="sm"
            className="h-7 gap-1 px-2 text-xs"
            disabled={parentGenerating || data.lastAttemptStatus === 'generating' || !parentShotId}
            onClick={(e) => {
              e.stopPropagation()
              if (parentShotId) void generateVideoForShot(parentShotId)
            }}
          >
            <RefreshCw className="size-3" />
            영상 리테이크
          </Button>
        </div>
      </NodeToolbar>
    <BaseNode
      id={id}
      theme="video"
      title={parentShotLabel ?? data.label}
      selected={selected}
      width={240}
      stale={data.stale}
      strongStale={isStrongStale}
      beam={data.lastAttemptStatus === 'generating' ? 'primary' : null}
      headerExtra={
        <Button
          variant="ghost"
          size="icon-xs"
          disabled={!canMarkFinal || finalBusy}
          onClick={handleFinalToggle}
          aria-label={finalBusy ? 'Updating Final' : data.final ? 'Unmark Final' : 'Mark Final'}
        >
          <Star
            className={cn(
              'size-3.5',
              data.final
                ? 'fill-warning text-warning'
                : 'text-muted-foreground',
            )}
          />
        </Button>
      }
    >
      {/* 영상 재생 / 썸네일 / 상태 — single-play: playingNodeId===id 일 때만 <video> 마운트.
          nodrag·nopan: React Flow 가 영상/버튼 상호작용을 노드 드래그·팬으로 가로채지 않게. */}
      <div className="relative mt-1 flex h-24 w-full items-center justify-center overflow-hidden rounded-sm border border-border/40 bg-muted/40">
        {data.status === 'failed' && !data.videoUrl ? (
          <span className="px-2 text-center text-[10px] text-destructive">
            {data.lastAttemptError ?? data.errorMessage ?? '실패'}
          </span>
        ) : isPlaying && data.videoUrl ? (
          <>
            <video
              src={data.videoUrl}
              autoPlay
              controls
              playsInline
              onEnded={() => setPlayingNode(null)}
              onClick={(e) => e.stopPropagation()}
              className="nodrag nopan h-full w-full bg-black object-contain"
            />
            <button
              type="button"
              onClick={handleStop}
              aria-label="정지"
              className="nodrag absolute right-1 top-1 z-10 rounded bg-black/60 p-0.5 text-white/90 transition-colors hover:bg-black/80"
            >
              <Square className="size-3" />
            </button>
          </>
        ) : data.thumbnailUrl ? (
          <button
            type="button"
            onClick={handlePlay}
            disabled={!data.videoUrl}
            aria-label="재생"
            className="nodrag group/play relative block h-full w-full"
          >
            <GeneratedImage
              src={data.thumbnailUrl}
              alt={data.label}
              className="h-full w-full object-cover"
            />
            {data.videoUrl && (
              <span className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 transition-opacity group-hover/play:opacity-100">
                <Play className="size-6 fill-white text-white" />
              </span>
            )}
          </button>
        ) : data.videoUrl ? (
          <button
            type="button"
            onClick={handlePlay}
            aria-label="재생"
            className="nodrag flex h-full w-full items-center justify-center transition-colors hover:bg-muted/60"
          >
            <Play className="size-6 fill-muted-foreground text-muted-foreground" />
          </button>
        ) : (
          <span className="text-[10px] text-muted-foreground">대기 중</span>
        )}

        <GeneratingOverlay
          active={data.lastAttemptStatus === 'generating'}
          label="영상 생성 중"
        />
      </div>

      {/* override indicator */}
      {overrideKeys.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {overrideKeys.map((k) => (
            <span
              key={k}
              className="rounded-sm border border-warning/50 bg-warning/10 px-1 text-[9px] uppercase text-warning"
            >
              {k}
            </span>
          ))}
        </div>
      )}

      <div className="mt-2 flex items-center justify-between text-[10px] text-muted-foreground">
        <span className="font-mono">
          take {data.takeNumber} · {data.lastAttemptStatus ?? data.status}
        </span>
        {data.final && <span className="font-mono text-warning">★ FINAL</span>}
      </div>
      {finalError && <p className="mt-1 text-[10px] text-destructive">{finalError}</p>}
      {data.lastAttemptError && (
        <p className="mt-1 text-[10px] text-destructive">{data.lastAttemptError}</p>
      )}
    </BaseNode>
    </>
  )
}

export const VideoNode = memo(VideoNodeImpl)
