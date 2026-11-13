'use client'

import { memo, useEffect, useRef, useState } from 'react'
import { NodeToolbar, Position, type NodeProps } from '@xyflow/react'
import { Play, RefreshCw, Square, Star } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { GeneratedImage, GeneratingOverlay } from '@/components/generating-frame'
import { DoneBadge, NodeWaitCard } from '@/components/feedback/node-wait'
import { BaseNode } from './BaseNode'
import { LabeledTargetHandle } from './LabeledHandle'
import {
  getEffectiveVideoConfig,
  getVideoNodeResolution,
  useDirectorCanvasStore,
} from '@/stores/director-store'
import { isShotData, isVideoData, type DirectorNode } from '@/types/director'
import { directorNodeLabel, prettyNodeLabel } from '@/features/director/node-label'
import { announcingVideoId, nextInLineNote, pendingShotNames, requestedVideoSeconds } from '@/features/director/video-wait'
import { VideoLengthChip } from '@/features/director/video-length-chip'
import { STAGE_PERSONA } from '@/lib/lumi'
import { useBoardNodeNames } from '@/features/director/hooks/use-board-node-names'
import { cn } from '@/lib/utils'
import { mediaFrameStyle } from '@/lib/project-aspect'
import { useProjectFormatStore } from '@/stores/project-format-store'
import { useT } from '@/lib/i18n'
import { useTakeBalance } from '@/lib/billing/use-take-balance'
import { takeCostForVideo } from '@/lib/billing/take-cost'
import { normalizeProvider } from '@/lib/video-models'
import { useShotState } from '@/features/director/hooks/use-shot-states'
import { dimmedByStatusFilter, takeCountsAsVideo, takeIsRunning, videoTakeFrame, videoTakeTail } from '@/lib/director/shot-state'
import { StateTailLine } from '@/features/director/shot-status'

/** 영상 노드 틀의 높이 상한(세로·정사각 포맷) — 테이크 간격(VIDEO_OFFSET_Y 260px) 안에서 겹치지 않게. */
const VIDEO_NODE_MEDIA_MAX_H = 150

function VideoNodeImpl({ id, data, selected }: NodeProps<DirectorNode>) {
  const t = useT()
  // Producer 포맷이 틀의 기준(2026-09-30). 가로 프로젝트는 종전 틀(h-24) 그대로.
  const projectFormat = useProjectFormatStore((s) => s.format)
  const mediaFrame = mediaFrameStyle(projectFormat, VIDEO_NODE_MEDIA_MAX_H)
  const setVideoFinal = useDirectorCanvasStore((s) => s.setVideoFinal)
  // 상태 고르기(시안 D1): 그 샷 상태가 안 맞으면 흐리게. 테두리는 이 Take 의 상태(시안 D4 · D7).
  const parentShotState = useShotState(isVideoData(data) ? data.parentShotNodeId : null)
  // 부모 샷에 쓸 그림이 있는가 — 빈 영상 노드의 그림 자리 글(리드 답 5a). 상태를 모르면(독립 영상) 있다고 본다.
  const parentHasImage =
    parentShotState === undefined ||
    !(parentShotState === 'image_needed' || parentShotState === 'image_failed' || parentShotState === 'image_generating')
  const statusFilter = useDirectorCanvasStore((s) => s.statusFilter)
  // 영상 노드를 누르면 그 샷을 고른다(시안 R). 상세가 열린 노드만 단계 색 테두리 · 위 단추.
  const picked = useDirectorCanvasStore((s) => {
    const parent = isVideoData(data) ? data.parentShotNodeId : null
    return !!parent && (s.pickedShotIds?.includes(parent) ?? false)
  })
  const detailOpen = useDirectorCanvasStore((s) => s.selectedNodeId === id)
  // "영상까지 이어서"로 이미지를 기다리는 샷(시안 D4) — 빈 영상 노드에 "이미지가 끝나면 자동으로 시작해요".
  const chainWaiting = useDirectorCanvasStore((s) => {
    const parent = isVideoData(data) ? data.parentShotNodeId : null
    return !!parent && (s.chainWaitingShotIds?.includes(parent) ?? false)
  })
  const playingNodeId = useDirectorCanvasStore((s) => s.playingNodeId)
  const setPlayingNode = useDirectorCanvasStore((s) => s.setPlayingNode)
  const ensureVideoThumbnail = useDirectorCanvasStore(
    (s) => s.ensureVideoThumbnail,
  )
  const generateVideoForShot = useDirectorCanvasStore(
    (s) => s.generateVideoForShot,
  )
  const regenerateVideo = useDirectorCanvasStore((s) => s.regenerateVideo)
  const parentShotId = isVideoData(data) ? data.parentShotNodeId : null
  const videoOwnerKey =
    isVideoData(data)
      ? data.parentShotNodeId ?? data.standaloneVideoKey
      : null
  const ownerGenerating = useDirectorCanvasStore(
    (s) =>
      !!videoOwnerKey &&
      s.nodes.some(
        (node) =>
          isVideoData(node.data) &&
          (node.data.parentShotNodeId ?? node.data.standaloneVideoKey) ===
            videoOwnerKey &&
          takeIsRunning(node.data),
      ),
  )
  // 카드 제목 = 연결된 부모 샷 번호(#e3 2026-07-15): take_v1 대신 'Shot 14'처럼 표기.
  //   selector는 라벨 문자열만 반환(참조 안정). 부모가 없으면 자체 라벨(take 패턴 변환) 폴백.
  const parentShotLabel = useDirectorCanvasStore((s) => {
    if (!parentShotId) return null
    const p = s.nodes.find((n) => n.id === parentShotId)
    return p && isShotData(p.data) ? p.data.label : null
  })
  const parentWriterShotId = useDirectorCanvasStore((s) => {
    if (!parentShotId) return null
    const p = s.nodes.find((n) => n.id === parentShotId)
    return p && isShotData(p.data) ? p.data.writerShotId : null
  })
  // 부모 샷 이름도 보드와 같은 전체 번호("Shot 8", 오너 2026-11-02 "전체 번호로 통일").
  const boardNames = useBoardNodeNames()
  const parentShotTitle = parentShotLabel === null ? null : directorNodeLabel({ label: parentShotLabel, writerShotId: parentWriterShotId }, boardNames)
  // #payments-phase-2 v4 #2: 생성 전 소모량 표시 — 리테이크 버튼은 이 샷을 다시 만든다(같은 provider).
  const effectiveProvider = useDirectorCanvasStore((s) => getEffectiveVideoConfig(s, id)?.provider ?? null)
  const effectiveSeconds = useDirectorCanvasStore((s) => getEffectiveVideoConfig(s, id)?.durationSeconds ?? null)
  // 묶음으로 만드는 영상이면(서버 조회가 알려 준 작업 id) 그 묶음의 진행과 다음 차례(11/5 시안 DG, 리드 2026-11-09).
  //   숫자 · 글자로 골라, 노드를 끌 때마다 모든 영상 노드가 다시 그려지지 않게 한다. 따로 누른 영상은 묶음 것을 빌려 쓰지 않는다.
  const batchJobId = isVideoData(data) ? data.generationJobId : null
  const inBatch = useDirectorCanvasStore((s) => !!batchJobId && !!s.videoBatchQueue?.jobIds.includes(batchJobId))
  const batchPercent = useDirectorCanvasStore((s) =>
    inBatch && s.videoBatchProgress && s.videoBatchProgress.total > 0
      ? (s.videoBatchProgress.done / s.videoBatchProgress.total) * 100
      : null,
  )
  // 동시에 여러 장이 떠도 화면 읽기에는 한 장만 알린다(검토 B 5c): 묶음이 먼저 낸 것, 없으면 화면 위 · 왼쪽의 것.
  const announce = useDirectorCanvasStore((s) => announcingVideoId(s.nodes, s.videoBatchQueue?.jobIds) === id)
  const nextNames = useDirectorCanvasStore((s) =>
    inBatch && !s.videoBatchCancelled ? pendingShotNames(s.nodes, s.videoBatchQueue?.pendingShotIds ?? [], boardNames).join('\n') : '',
  )
  // 해상도(오너 2026-10-31): 다음에 만들 때 고른 값 — Take 표시용. 모델이 못 내면(Kling O3 Pro) 계산기가 기본값으로 센다.
  const chosenResolution = useDirectorCanvasStore((s) => getVideoNodeResolution(s, id))
  const takeBalance = useTakeBalance()

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
  // 화면에서 멈춘 Take(오너 2026-11-14 7번)는 뒤에서 돌아도 만드는 중 카드로 덮지 않고, ★ 가 아니면 끝나도 "✓ 완성"이 아니다.
  const generating = takeIsRunning(data)
  const completed = (data.lastAttemptStatus ?? data.status) === 'completed' && takeCountsAsVideo(data)
  const requestedSeconds = effectiveProvider && effectiveSeconds !== null ? requestedVideoSeconds(effectiveProvider, effectiveSeconds) : null
  // 1080p 표시는 지금 영상에 대한 말이다 — 그 영상을 낸 작업 기록 기준(2026-10-31 리뷰). 설정은 왼쪽 패널이 보여준다.
  const madeAt1080p = !!data.videoUrl && data.videoResolution === '1080p'
  // 해상도는 마더 Shot 을 바꾼 값이 아니다(마더에는 해상도가 없다) — 노란 "바꾼 설정" 표시 대신 아래 1080p 표시로 보인다.
  const overrideKeys =
    data.parentShotNodeId === null
      ? []
      : (Object.keys(data.override) as (keyof typeof data.override)[]).filter((k) => k !== 'resolution')

  const isStrongStale = data.stale
  const canMarkFinal =
    !!parentShotId && !!data.videoUrl && data.status === 'completed'


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
          error: error instanceof Error ? error.message : t('Failed to set Final.'),
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
      <NodeToolbar isVisible={detailOpen} position={Position.Top} offset={8}>
        <div className="flex items-center gap-1.5 rounded-full bg-popover p-1 pr-2.5 shadow-node">
          <Button
            size="sm"
            className="h-7 gap-1 rounded-full px-3 text-xs"
            disabled={ownerGenerating || generating}
            onClick={(e) => {
              e.stopPropagation()
              // #retake-inherit: 이 테이크의 체인·프레임 배선을 새 테이크가 물려받는다.
              if (parentShotId)
                void generateVideoForShot(parentShotId, {
                  inheritFromVideoNodeId: id,
                })
              else void regenerateVideo(id)
            }}
          >
            <RefreshCw className="size-3" />
            {t('Retake video')}
          </Button>
          {/* #payments-phase-2 v4 #2: 생성 전 소모량 표시 — mode==='off'면 배지 숨김. */}
          {takeBalance.mode !== 'off' && (
            <span className="font-num text-[11px] font-medium text-muted-foreground">
              {/* 표시는 서버가 실제로 쓰는 모델 · 해상도 기준이어야 한다 — 설정에 남은 옛 모델 이름은
                  제출 전에 기본 모델로 바뀐다(video-batch-plan 의 승인 카드와 같은 계산). 1080p 는 두 배. */}
              {t('{count} Take', { count: takeCostForVideo(effectiveProvider ? normalizeProvider(effectiveProvider) : null, chosenResolution) })}
            </span>
          )}
        </div>
      </NodeToolbar>
    <BaseNode
      id={id}
      theme="video"
      title={parentShotTitle ?? data.label}
      selected={detailOpen}
      picked={picked}
      width={240}
      stale={data.stale}
      strongStale={isStrongStale}
      stateFrame={isVideoData(data) ? videoTakeFrame(data) : null}
      dimmed={dimmedByStatusFilter(parentShotState, statusFilter)}
      // 만드는 중은 도는 빛 대신 노드를 덮는 기다리는 카드(아래 NodeWaitCard, 11/5 시안 DG). 덮인 동안 머리 단추는 inert(검토 A C1).
      inert={generating}
      headerExtra={parentShotId ? (
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
      ) : undefined}
    >
      {/* Manual frame wiring inputs(#handle-visibility) — 항상 보이는 라벨 홈들.
          hover-only 8px 점은 "구멍이 안 보인다"는 오너 피드백의 원인이었다. */}
      {/* v3 D1: 한국어 라벨 · 20px 간격(제목 줄 아래부터). */}
      <LabeledTargetHandle
        id="video-chain"
        label={t('Previous video')}
        top={46}
        title={t('Previous-video last-frame input')}
      />
      <LabeledTargetHandle
        id="frame-start"
        label={t('Start')}
        top={66}
        title={t('START frame input')}
      />
      <LabeledTargetHandle
        id="frame-end"
        label={t('End')}
        top={86}
        title={t('END frame input')}
      />
      <LabeledTargetHandle
        id="frame-ref"
        label={t('Reference')}
        top={106}
        title={t('REF frame input')}
      />
      {/* 영상 재생 / 썸네일 / 상태 — single-play: playingNodeId===id 일 때만 <video> 마운트.
          nodrag·nopan: React Flow 가 영상/버튼 상호작용을 노드 드래그·팬으로 가로채지 않게.
          아래 덩어리들은 기다리는 카드가 덮는 동안 inert: 보이지 않는 [재생] 등에 Tab 이 들어가지 않는다(검토 A C1). 구멍 · 카드는 밖이다. */}
      <div
        className={cn('relative mt-2 flex items-center justify-center overflow-hidden rounded-[10px] bg-art-placeholder', !mediaFrame && 'h-24 w-full')}
        style={mediaFrame ?? undefined}
        inert={generating}
      >
        {data.status === 'failed' && !data.videoUrl ? (
          <span className="px-2 text-center text-[10px] text-destructive">
            {data.lastAttemptError ?? data.errorMessage ?? t('Failed')}
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
              aria-label={t('Stop')}
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
            aria-label={t('Play')}
            className="nodrag group/play relative block h-full w-full"
          >
            <GeneratedImage
              src={data.thumbnailUrl}
              alt={`${parentShotTitle ?? directorNodeLabel(data, boardNames)} · ${t('Take {n}', { n: data.takeNumber })}`}
              className="h-full w-full object-cover"
            />
            {data.videoUrl && (
              <span className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 transition-opacity group-hover/play:opacity-100">
                <Play className="size-6 fill-white text-white" />
              </span>
            )}
            {data.videoUrl && completed && <VideoLengthChip url={data.videoUrl} />}
          </button>
        ) : data.videoUrl ? (
          <button
            type="button"
            onClick={handlePlay}
            aria-label={t('Play')}
            className="nodrag flex h-full w-full items-center justify-center transition-colors hover:bg-black/20"
          >
            <Play className="size-6 fill-muted-foreground text-muted-foreground" />
            {completed && <VideoLengthChip url={data.videoUrl} />}
          </button>
        ) : generating ? null : (
          // 만드는 중이면 아무 글도 쓰지 않는다. 아래 "영상 생성 중"과 같이 보이면 헷갈린다(11/5 시안 DG 맞춰 보기 2026-11-09).
          //   비어 있는 까닭(시안 D1 노드형 406:4051 · D4, 리드 답 5a): 이어 보내기를 기다리면 "이미지가 끝나면 자동으로 시작해요",
          //   그 샷에 이미지가 없으면 "이미지가 생기면 만들 수 있어요", 있으면 "영상을 만들 수 있어요".
          <span className="flex flex-col items-center gap-1.5 px-2 text-center text-[11px] text-subtle-foreground">
            <Play aria-hidden className="size-4 fill-current" />
            {chainWaiting
              ? t('Starts by itself when the image is done')
              : parentHasImage
                ? t('Ready to make the video')
                : t('Can be made once there is an image')}
          </span>
        )}

        <GeneratingOverlay
          active={generating}
          label={t('Generating video')}
        />
      </div>

      {/* override indicator */}
      {overrideKeys.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1" inert={generating}>
          {overrideKeys.map((k) => (
            <span
              key={k}
              className="rounded-[6px] bg-warning/10 px-1.5 py-px text-[10px] font-medium text-warning"
            >
              {k}
            </span>
          ))}
        </div>
      )}

      {/* 약속 H(2026-09-04, 오너 1안): 작은 영문 "take 1 · completed" 대신 큰 상태 글자. take 번호는 카드에서 빼고
          마우스를 올리면(title)·왼쪽 상세·팝업에서 작게 보인다. */}
      {/* 꼬리(시안 D1 노드형 406:4051 "● 영상 없음", 리드 검토 c ②): 이 Take 상태 점 + 글 — 영상 없음 · 영상 만드는 중 · 영상 실패 ·
          영상이 남은 Take 의 다시 만들기 실패. 오른쪽에 1080p · FINAL. */}
      <div
        className="mt-2.5 flex items-center justify-between gap-2"
        title={t('Take {n}', { n: data.takeNumber })}
        inert={generating}
      >
        {/* 다 만들면 "● 완료" 자리에 "✓ 완성" 배지(11/5 시안 완성 표시, 리드 b5). 빛 · 단계 색 테두리는 '고른 노드'와 헷갈려 넣지 않는다. */}
        {completed ? (
          <DoneBadge lumi={STAGE_PERSONA.director} />
        ) : (
          <StateTailLine {...videoTakeTail(data)} />
        )}
        <span className="flex items-center gap-1.5">
          {madeAt1080p && <span className="font-num text-[11px] text-subtle-foreground">1080p</span>}
          {data.final && <span className="font-num text-[11px] font-semibold text-warning">★ FINAL</span>}
        </span>
      </div>
      {/* #adherence P2: 모션 계약 위반 배지 — 첫/끝 프레임 검사 결과. */}
      {data.adherence && data.adherence.status !== 'ok' && data.adherence.status !== 'skipped' && (
        <p
          className="mt-1 text-[10px] text-warning"
          title={[data.adherence.reason, data.adherence.observed].filter(Boolean).join(' / ')}
          inert={generating}
        >
          ⚠ {data.adherence.status === 'over_motion'
            ? t('Static contract violated: the camera moved')
            : data.adherence.status === 'under_motion'
              ? t("Not enough motion: the designed big movement isn't visible")
              : t('Direction mismatch: moved differently from the arrow')}
        </p>
      )}
      {finalError && <p className="mt-1 text-[10px] text-destructive" inert={generating}>{finalError}</p>}
      {data.lastAttemptError && (
        <p className="mt-1 text-[10px] text-destructive" inert={generating}>{data.lastAttemptError}</p>
      )}
      {/* 만드는 동안 노드를 덮는 기다리는 카드(11/5 시안 DG · SYS "노드 위 기다림", 리드 2026-11-09). 동시에 만드는 영상마다 하나씩
          (만드는 순서는 그대로). 남은 시간은 쓰지 않고, 막대 · 다음 차례는 묶음일 때만. 노드 테두리까지 덮고, 입력 구멍은 위에 남는다. */}
      {generating && (
        <NodeWaitCard
          lumi={STAGE_PERSONA.director}
          title={t('Making the video')}
          description={
            requestedSeconds === null
              ? prettyNodeLabel(parentShotTitle ?? data.label)
              : `${prettyNodeLabel(parentShotTitle ?? data.label)} · ${t('{seconds}s', { seconds: requestedSeconds })}`
          }
          progress={batchPercent ?? undefined}
          note={nextInLineNote(nextNames ? nextNames.split('\n') : [], t)}
          announce={announce}
          className="-inset-[1.5px]"
        />
      )}
    </BaseNode>
    </>
  )
}

export const VideoNode = memo(VideoNodeImpl)
