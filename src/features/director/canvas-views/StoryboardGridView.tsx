'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { ImageIcon, MapPin, Clock, Pause, Play } from 'lucide-react'

import { cn } from '@/lib/utils'
import { ScrollArea } from '@/components/ui/scroll-area'
import { GeneratedImage, GeneratingOverlay } from '@/components/generating-frame'
import { RoughFrameCycle } from '@/components/rough-frame-cycle'
import {
  selectLatestAttempt,
  selectNewestSuccessfulTake,
  type VideoTakeSelectionRecord,
} from '@/lib/director-video-take-selection'
import {
  getChildShots,
  effectivePrompt,
  useDirectorCanvasStore,
} from '@/stores/director-store'
import { useAssetStorageStore } from '@/stores/asset-storage-store'
import {
  useActiveGenerationJobs,
  activeShotIds,
  activeStartedAt,
  type ActiveJob,
} from '@/lib/generation-queue'
import { useRoughStoryboard } from '@/features/director/hooks/use-rough-storyboard'
import { RegenerateConfirmDialog } from '@/features/director/regenerate-confirm-dialog'
import { ShotDetailDialog } from '@/features/writer/shot-detail-dialog'
import { replaceSlugs, type SlugEntry } from '@/lib/script-lines'
import {
  isSceneData,
  isShotData,
  isVideoData,
  type DirectorNode,
  type DirectorVideoStatus,
  type ShotNodeData,
} from '@/types/director'
import { prettyNodeLabel } from '@/features/director/node-label'

type SceneGroup = {
  key: string
  label: string
  location: string
  timeOfDay: string
  shots: DirectorNode[]
}
export type GridAttemptRecord = VideoTakeSelectionRecord & {
  last_attempt_status: DirectorVideoStatus | null
  last_attempt_error: string | null
}
type GridVideoTakeRecord = GridAttemptRecord & {
  last_attempt_status: DirectorVideoStatus | null
  node: DirectorNode
  url: string | null
  status: DirectorVideoStatus
  is_final: boolean
  take_number: number
  created_at: string | null
  last_attempt_at: string | null
  last_attempt_error: string | null
}
export function selectGridVideoAttemptState(takes: GridAttemptRecord[]) {
  const latestAttempt = selectLatestAttempt(takes)
  return {
    latestAttempt,
    generating: latestAttempt?.last_attempt_status === 'generating',
    failure:
      latestAttempt?.last_attempt_status === 'failed'
        ? latestAttempt.last_attempt_error ?? '영상 생성 실패'
        : null,
  }
}

function isExpectedMediaPlayInterruption(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    error.name === 'AbortError'
  ) || (
    error instanceof Error &&
    /play\(\) request was interrupted/i.test(error.message)
  )
}

/** 완료 영상 썸네일(#e1 2026-07-15) — 호버 시에만 재생, 클릭 = 일시정지 잠금(중앙 ⏸ 표시).
 *  다시 클릭하면 잠금 해제 + 재생 재개. 카드 더블클릭(팝업)은 dblclick 이벤트라 그대로 동작. */
function HoverPlayVideo({ src, label }: { src: string; label: string }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [pausedLock, setPausedLock] = useState(false)
  const [playbackError, setPlaybackError] = useState<string | null>(null)
  const play = () =>
    void videoRef.current?.play().then(
      () => setPlaybackError(null),
      (error: unknown) => {
        if (!isExpectedMediaPlayInterruption(error)) {
          setPlaybackError(error instanceof Error ? error.message : '영상 재생에 실패했습니다.')
        }
      },
    )
  const pause = () => videoRef.current?.pause()
  return (
    <button
      type="button"
      aria-label={pausedLock ? `${label} 재생 재개` : `${label} 일시정지`}
      onMouseEnter={() => {
        if (!pausedLock) play()
      }}
      onMouseLeave={() => {
        if (!pausedLock) pause()
      }}
      onClick={(e) => {
        e.stopPropagation()
        setPausedLock((prev) => {
          const next = !prev
          if (next) pause()
          else play()
          return next
        })
      }}
      className="relative block size-full cursor-pointer"
    >
      <video
        ref={videoRef}
        src={src}
        muted
        loop
        playsInline
        preload="metadata"
        className="size-full object-cover"
      />
      {pausedLock && (
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/25">
          <Pause className="size-8 fill-white text-white drop-shadow" />
        </span>
      )}
      {playbackError && (
        <span
          role="alert"
          className="pointer-events-none absolute inset-x-1 bottom-1 truncate rounded bg-destructive/90 px-1 py-0.5 text-[10px] text-destructive-foreground"
        >
          {playbackError}
        </span>
      )}
    </button>
  )
}

type StoryboardMediaMode = 'previz' | 'real'

function ShotCell({
  node,
  roster,
  mediaMode,
  queuedImageShots,
  queuedVideoShots,
  activeJobs,
}: {
  node: DirectorNode
  roster: SlugEntry[]
  mediaMode: StoryboardMediaMode
  /** 지금 큐에 떠 있는 잡의 대상 샷들(#queue-restore) — 탭을 떠났다 와도 진행 표시를 되살린다. */
  queuedImageShots: ReadonlySet<string>
  queuedVideoShots: ReadonlySet<string>
  /** 큐 원본 — 경과시간 durable 기준점(activeStartedAt) 계산용. */
  activeJobs: readonly ActiveJob[]
}) {
  const generateStoryboardImage = useDirectorCanvasStore(
    (s) => s.generateStoryboardImage,
  )
  const generateVideoForShot = useDirectorCanvasStore(
    (s) => s.generateVideoForShot,
  )
  const openPopup = useDirectorCanvasStore((s) => s.openPopup)
  // 실사 이미지가 없을 때 러프 스토리보드 폴백 표시(#e11) — writer-store 스코프 구독
  const writerShotId = isShotData(node.data) ? node.data.writerShotId : null
  const rough = useRoughStoryboard(writerShotId)
  // 영상 생성(이미지→영상 체인 포함) 진행 플래그 — 버튼 잠금 + 오버레이(#e12)
  const [videoBusy, setVideoBusy] = useState(false)
  const [videoError, setVideoError] = useState<string | null>(null)
  // 재생성 확인 팝업(#regen-confirm) / Previz 편집 팝업(#e6)
  const [confirm, setConfirm] = useState<null | 'image' | 'video'>(null)
  const [previzOpen, setPrevizOpen] = useState(false)
  // Grid always projects the newest successful take; Final is an editor/export decision.
  const directorNodes = useDirectorCanvasStore((s) => s.nodes)
  // #real-grid-auto: 일괄 시트 생성 중엔 개별 생성/재생성 잠금 (스토어 가드와 이중 방어).
  //   아래 isShotData early return 보다 위에 있어야 한다 — 훅의 조건부 호출은 렌더 간 훅 순서를
  //   무너뜨린다(rules-of-hooks).
  const realBatchBusy = useDirectorCanvasStore((s) => s.realBatchBusy)
  const takeRecords = useMemo(
    () =>
      directorNodes.flatMap((n) => {
        if (!isVideoData(n.data) || n.data.parentShotNodeId !== node.id) {
          return []
        }
        const record: GridVideoTakeRecord = {
          id: n.id,
          take_number: n.data.takeNumber,
          created_at: n.data.createdAt ?? null,
          status: n.data.status,
          url: n.data.videoUrl,
          is_final: n.data.final,
          last_attempt_status: n.data.lastAttemptStatus,
          last_attempt_at: n.data.lastAttemptAt,
          last_attempt_error: n.data.lastAttemptError,
          node: n,
        }
        return [record]
      }),
    [directorNodes, node.id],
  )
  // Grid always projects the newest successful take; Final is an editor/export decision.
  const newestSuccessful = selectNewestSuccessfulTake(takeRecords)
  const completedVideoUrl = newestSuccessful?.url ?? null
  const { generating: childVideoGenerating, failure: childVideoFailure } =
    selectGridVideoAttemptState(takeRecords)

  if (!isShotData(node.data)) return null
  const data: ShotNodeData = node.data
  const img = data.storyboardImage
  const status = img?.status ?? null
  const hasImage = status === 'completed' && !!img?.url
  const roughUrl = rough?.status === 'completed' ? rough.url : null
  const roughStartUrl = rough?.frames?.start ?? roughUrl
  const prompt = effectivePrompt(data)

  // 파이프라인 단계 배지(#e2 2026-07-18) — 이 샷이 어느 단계인지 한눈에: 영상 / 이미지 / Previz.
  //   색으로도 구분: 영상=빨강(primary), 이미지=하늘, 미생성=경고.
  //   2026-08-11: 라벨에서 "단계"를 걷어내고(중복어) 호버 없이 처음부터 문구까지 보이게 했다 —
  //   한눈에 읽으라고 만든 배지가 호버해야 읽히면 배지가 아니라 툴팁이다.
  const stageBadge =
    mediaMode === 'previz'
      ? roughStartUrl
        ? { label: 'Previz', cls: 'border-sky-400/50 text-sky-300', video: false }
        : { label: '러프 생성 필요', cls: 'border-warning/50 text-warning', video: false }
      : completedVideoUrl
        ? { label: '영상', cls: 'border-primary/50 text-primary', video: true }
        : hasImage
          ? { label: '이미지', cls: 'border-sky-400/50 text-sky-300', video: false }
          : { label: '이미지 생성 필요', cls: 'border-warning/50 text-warning', video: false }

  const runImage = async () => {
    if (realBatchBusy) {
      setVideoError('실사 일괄 생성 중이에요 — 완료 후 다시 시도해 주세요.')
      return
    }
    try {
      await generateStoryboardImage(node.id)
    } catch (error) {
      setVideoError(error instanceof Error ? error.message : '이미지 생성에 실패했습니다.')
    }
  }
  // 영상 생성(#e12): 이미지가 없으면 먼저 생성하고, 성공했을 때만 영상으로 이어간다.
  const runVideo = async () => {
    if (videoBusy) return
    if (realBatchBusy) {
      setVideoError('실사 일괄 생성 중이에요 — 완료 후 다시 시도해 주세요.')
      return
    }
    setVideoBusy(true)
    setVideoError(null)
    try {
      if (!hasImage) {
        await generateStoryboardImage(node.id)
        const fresh = useDirectorCanvasStore
          .getState()
          .nodes.find((n) => n.id === node.id)
        const ok =
          fresh &&
          isShotData(fresh.data) &&
          fresh.data.storyboardImage?.status === 'completed'
        if (!ok) return
      }
      await generateVideoForShot(node.id)
    } catch (error) {
      setVideoError(error instanceof Error ? error.message : '영상 생성에 실패했습니다.')
    } finally {
      setVideoBusy(false)
    }
  }

  // 큐가 진행 판정의 바닥이다(#queue-restore 2026-08-11) — 노드의 storyboardImage.status 는
  //   탭 재진입 시 DB 재수화로 덮이므로, 잡이 떠 있으면 그쪽이 맞다.
  const queuedImage = !!writerShotId && queuedImageShots.has(writerShotId)
  const queuedVideo = !!writerShotId && queuedVideoShots.has(writerShotId)
  // 진입 자동 채움 대기(#e6 2026-08-11) — 일괄 러너가 돌기 시작했는데 아직 이 샷의 잡이 큐에
  //   안 앉은 구간. "생성이 필요합니다"를 보여주면 뭔가 해야 할 것 같은 잘못된 신호가 되므로
  //   (곧 자동으로 생성된다) 이 구간도 생성 중으로 취급해 스피너를 돌린다.
  const autoFillPending =
    mediaMode === 'real' && realBatchBusy && !hasImage && status !== 'failed' && !!roughUrl
  const imageGenerating = status === 'generating' || queuedImage || autoFillPending
  const generating = imageGenerating || videoBusy || childVideoGenerating || queuedVideo

  /**
   * 카드 액션 목록 — 단계에 따라 **문구만** 바뀌고 항목 수는 고정이다(#e4 2026-08-11).
   *   이미지 단계 → [이미지 재생성, 영상 생성] · 영상 단계 → [이미지 재생성, 영상 재생성].
   *   이미 있는 것을 갈아치우는 항목만 확인 팝업을 거친다 — 빈칸 채우기는 바로 실행.
   */
  const actions: Array<{
    key: string
    label: string
    title: string
    primary: boolean
    disabled?: boolean
    onClick: () => void
  }> =
    mediaMode === 'previz'
      ? [
          {
            key: 'previz',
            label: 'Previz 재생성',
            title: writerShotId
              ? '연출 화살표 편집기 — writer 탭 카드와 같은 팝업이에요'
              : 'writer 샷과 연결되지 않은 노드예요',
            primary: true,
            disabled: !writerShotId,
            onClick: () => setPrevizOpen(true),
          },
        ]
      : [
          {
            key: 'image',
            label: hasImage ? '이미지 재생성' : '이미지 생성',
            title:
              status === 'failed' && img?.errorMessage
                ? img.errorMessage
                : hasImage
                  ? '촬영용 이미지를 새로 만들어요 (기존 이미지 교체)'
                  : '촬영용 이미지만 생성해요',
            primary: false,
            onClick: () => {
              if (hasImage) setConfirm('image')
              else void runImage()
            },
          },
          {
            key: 'video',
            label: completedVideoUrl ? '영상 재생성' : '영상 생성',
            title: '영상 생성 — 촬영 이미지가 없으면 먼저 생성한 뒤 영상을 만들어요',
            primary: true,
            onClick: () => {
              if (completedVideoUrl) setConfirm('video')
              else void runVideo()
            },
          },
        ]

  // 3프레임 세트(previz/실사 스트립)는 상자가 그림 비율을 따라간다(#fit-tight) — 띠도 크롭도
  //   없다. 그 외(영상·단일 이미지·플레이스홀더)는 16:9 고정. 배지·오버레이·액션은 이 상자에 앵커.
  const framePanel =
    mediaMode === 'previz' && rough?.frames ? rough : hasImage && img!.frames ? img! : null

  return (
    <div
      className="group flex flex-col rounded-md border border-border bg-card p-2.5"
      onDoubleClick={() => openPopup(node.id)}
    >
      {/* 그림은 카드에 '담긴' 사각형(#card-inset 2026-08-11, writer 러프 보드와 동일) —
          여백을 두르고 그림 자체엔 라운드 없음. */}
      <div
        className={cn(
          'relative overflow-hidden bg-muted',
          !(framePanel && !generating) && 'aspect-video',
        )}
      >
        {framePanel && !generating ? (
          <RoughFrameCycle
            panel={framePanel}
            alt={mediaMode === 'previz' ? `${data.label} (previz)` : data.label}
            sizeToImage
          />
        ) : mediaMode === 'previz' && roughStartUrl ? (
          // 구형 단일 패널 러프(3프레임 이전 데이터) → 대표 프레임 표시
          <GeneratedImage
            src={roughStartUrl}
            alt={`${data.label} (previz)`}
            className="size-full object-cover"
          />
        ) : completedVideoUrl ? (
          // 영상까지 완성된 샷(#e13) — 호버 시에만 재생, 클릭 = 일시정지(#e1).
          <HoverPlayVideo src={completedVideoUrl} label={prettyNodeLabel(data.label)} />
        ) : hasImage ? (
          img!.frames ? (
            // 실사 3프레임(#real-strip) — 러프 보드와 동일한 hover 순환(START→DIRECTING→END).
            <RoughFrameCycle panel={img!} alt={data.label} />
          ) : (
            <GeneratedImage
              src={img!.url}
              alt={data.label}
              className="size-full object-cover"
            />
          )
        ) : status === 'failed' ? (
          // 실패 시 이미지 자리에 로그 표시 (사용자 요청)
          <div className="flex size-full flex-col items-center justify-center gap-1 bg-destructive/10 p-2 text-center">
            <span className="text-[11px] font-medium text-destructive">
              생성 실패
            </span>
            {img?.errorMessage && (
              <span className="line-clamp-3 break-all font-mono text-[10px] leading-tight text-destructive/80">
                {img.errorMessage}
              </span>
            )}
          </div>
        ) : roughUrl ? (
          // 실사 이미지 미생성 → 러프 스토리보드를 대신 보여준다. 그런데 그대로 깔면 "실사가
          //   나왔다"로 읽힌다(#e1 2026-08-11 오너 지적) — 흐리게 깔고 무엇이 필요한지 얹는다.
          <>
            <GeneratedImage
              src={roughUrl}
              alt={`${data.label} (rough)`}
              className="size-full object-cover opacity-40 grayscale"
            />
            <span className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1 px-2 text-center">
              <ImageIcon className="size-6 text-muted-foreground" />
              <span className="text-xs font-medium text-foreground">생성이 필요합니다</span>
              <span className="text-[10px] text-muted-foreground">
                지금 보이는 건 Previz 그림이에요
              </span>
            </span>
          </>
        ) : (
          <div className="flex size-full items-center justify-center">
            <ImageIcon className="size-8 text-muted-foreground opacity-50" />
          </div>
        )}

        {/* 단계 배지(#e2) — 좌상단 상시 표시(아이콘+문구). 배지를 호버하면 그 아래로 액션 목록이
            펼쳐진다(#e4 2026-08-11) — 우하단 스택에서 이사. 글자만, 폭 통일(w-28).
            생성 중엔 오버레이가 덮으므로 숨긴다. */}
        {!generating && stageBadge && (
          <div className="group/badge absolute left-2 top-2 z-10 flex w-28 flex-col items-start">
            <span
              className={cn(
                'inline-flex items-center gap-1 rounded-md border bg-background/85 px-1.5 py-1 text-[10px] font-medium',
                stageBadge.cls,
              )}
            >
              {stageBadge.video ? (
                <Play className="size-3 shrink-0 fill-current" />
              ) : (
                <ImageIcon className="size-3 shrink-0" />
              )}
              <span className="whitespace-nowrap">{stageBadge.label}</span>
            </span>
            <div className="pointer-events-none mt-1 flex w-full flex-col gap-1 opacity-0 transition-opacity duration-150 focus-within:pointer-events-auto focus-within:opacity-100 group-hover/badge:pointer-events-auto group-hover/badge:opacity-100">
              {actions.map((a) => (
                <button
                  key={a.key}
                  type="button"
                  disabled={a.disabled}
                  title={a.title}
                  onClick={(e) => {
                    e.stopPropagation()
                    a.onClick()
                  }}
                  className={cn(
                    'h-6 w-full rounded-md px-2 text-left text-[11px] font-medium shadow-sm transition-colors duration-100 disabled:cursor-not-allowed disabled:opacity-50',
                    a.primary
                      ? 'bg-primary text-primary-foreground hover:bg-primary/85'
                      : 'bg-background/90 text-foreground backdrop-blur hover:bg-accent',
                  )}
                >
                  {a.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 생성 중 — border beam + 경과시간 오버레이. 색 구분(#e13): 이미지=초록, 영상=빨강.
            동시 진행이면 라벨·빔 모두 이미지(선행 단계) 우선 — 표기 불일치 방지.
            startedAt: 큐의 submitted_at(#elapsed-durable 2026-08-11) — 탭 왕복에도 타이머가
            리셋되지 않는다(없으면 mount 시점 폴백). */}
        <GeneratingOverlay
          active={generating}
          label={imageGenerating ? '이미지 생성 중' : '영상 생성 중'}
          beamColor={imageGenerating ? 'success' : 'primary'}
          startedAt={
            writerShotId
              ? activeStartedAt(
                  activeJobs,
                  imageGenerating
                    ? ['shot_storyboard', 'storyboard_real_grid']
                    : ['shot_video'],
                  writerShotId,
                )
              : undefined
          }
        />
        {childVideoFailure && (
          <span
            title={childVideoFailure}
            className="absolute left-2 top-2 max-w-[calc(100%-1rem)] truncate rounded bg-destructive/90 px-1.5 py-0.5 text-[10px] text-destructive-foreground"
          >
            최신 영상 시도 실패
          </span>
        )}
        {videoError && (
          <span className="absolute bottom-2 left-2 max-w-[calc(100%-1rem)] truncate rounded bg-destructive/90 px-1.5 py-0.5 text-xs text-destructive-foreground">
            {videoError}
          </span>
        )}

        {/* 액션 스택은 좌상단 배지 아래로 이사(#e4 2026-08-11) — 우하단 스택 제거. */}
      </div>

      {/* 재생성 확인(#regen-confirm) — 최초 생성은 바로, **교체**만 팝업을 거친다. */}
      <RegenerateConfirmDialog
        open={confirm !== null}
        onOpenChange={(o) => {
          if (!o) setConfirm(null)
        }}
        title={confirm === 'video' ? '영상을 다시 만들까요?' : '이미지를 다시 만들까요?'}
        description={
          confirm === 'video'
            ? '지금 촬영 이미지를 기준으로 새 테이크를 만들어요.'
            : '이 샷의 촬영용 이미지를 새로 생성해요.'
        }
        impact={
          confirm === 'video'
            ? ['영상 생성 비용이 발생합니다.', '새 테이크가 추가되고 카드에는 최신 성공본이 보입니다.']
            : ['이미지 생성 비용이 발생합니다.', '기존 촬영용 이미지가 새 결과로 교체됩니다.']
        }
        confirmLabel="재생성"
        onConfirm={() => {
          const which = confirm
          setConfirm(null)
          if (which === 'video') void runVideo()
          else void runImage()
        }}
      />

      {/* Previz 재생성(#e6) — writer 탭 카드와 **같은 팝업**(연출 화살표 편집기)을 띄운다.
          같은 대상(러프 3프레임)을 두 탭에서 다른 도구로 고치게 두면 결과가 갈린다. */}
      <ShotDetailDialog
        shotId={previzOpen ? writerShotId : null}
        panel={rough}
        onOpenChange={setPrevizOpen}
      />

      <div className="flex flex-col gap-1 px-1 pb-0.5 pt-2.5">
        <span className="truncate text-sm font-medium text-foreground">
          {prettyNodeLabel(data.label)}
        </span>
        {prompt && (
          <p className="line-clamp-2 text-xs text-muted-foreground">
            {/* 프롬프트 속 char_2·location_2 등 슬러그 → @실제 이름 (표시 전용, #e6) */}
            {replaceSlugs(prompt, roster)}
          </p>
        )}
      </div>
    </div>
  )
}

// #real-grid 일괄 생성 UI 는 별도 바 대신 상단 팔레트의 기존 "스토리보드 생성" 버튼으로 통합
//   (2026-08-06 피드백) — 그 버튼이 runRealBatch(4샷 시트 일괄)를 호출한다.

export function StoryboardGridView() {
  const nodes = useDirectorCanvasStore((s) => s.nodes)
  const projectId = useDirectorCanvasStore((s) => s.projectId)
  // 미디어 모드: Previz(러프 3프레임 보드, 기본) | Real(실사) — 상단바(PaletteBar) 토글이 제어(2026-07-22).
  const mediaMode: StoryboardMediaMode = useDirectorCanvasStore((s) => s.storyboardMediaMode)

  // 슬러그 → 실제 이름 로스터(#e6) — asset-storage(진입 시 DB hydrate)에서 인물·장소 이름.
  //   표시 전용: 노드 데이터·프롬프트 원문(구동)은 그대로 둔다.
  const registeredCharacters = useAssetStorageStore((s) => s.characters)
  const registeredWorlds = useAssetStorageStore((s) => s.worlds)
  const roster = useMemo<SlugEntry[]>(
    () => [
      ...Object.values(registeredCharacters)
        .filter((c) => c.projectId === projectId)
        .map((c) => ({ slug: c.id, name: c.name })),
      ...Object.values(registeredWorlds)
        .filter((w) => w.projectId === projectId)
        .map((w) => ({ slug: w.id, name: w.name })),
    ],
    [registeredCharacters, registeredWorlds, projectId],
  )

  // 진행 중 잡 (#queue-restore) — 셀마다 훅을 걸면 폴링은 공유돼도 리렌더가 카드 수만큼 늘어난다.
  //   여기서 한 번 읽어 집합으로 내려보낸다.
  const activeJobs = useActiveGenerationJobs(projectId)
  const queuedImageShots = useMemo(
    () => activeShotIds(activeJobs, ['shot_storyboard', 'storyboard_real_grid']),
    [activeJobs],
  )
  const queuedVideoShots = useMemo(
    () => activeShotIds(activeJobs, ['shot_video']),
    [activeJobs],
  )

  // 완료 즉시 반영(#live-refresh 2026-08-11) — 어떤 샷이 큐에서 빠지면(웹훅 완료) DB 진실을
  //   재수화한다. runRealBatch 의 시트별 재수화가 1차 경로지만, 그 루프가 죽었거나(탭 이탈 후
  //   복귀) 다른 화면에서 시작된 잡은 이 감시가 잡는다 — 새로고침 없이 새 이미지가 보인다.
  const hydrateFromDb = useDirectorCanvasStore((s) => s.hydrateFromDb)
  const prevQueuedRef = useRef<ReadonlySet<string>>(new Set())
  useEffect(() => {
    const prev = prevQueuedRef.current
    const nowSet = new Set([...queuedImageShots, ...queuedVideoShots])
    prevQueuedRef.current = nowSet
    if (!projectId) return
    let finished = false
    for (const id of prev) {
      if (!nowSet.has(id)) {
        finished = true
        break
      }
    }
    if (finished) void hydrateFromDb(projectId).catch(() => {})
  }, [queuedImageShots, queuedVideoShots, projectId, hydrateFromDb])

  const scenes = nodes.filter((n) => isSceneData(n.data))
  const orphanShots = nodes.filter(
    (n) => isShotData(n.data) && !n.data.parentSceneNodeId,
  )

  const groups: SceneGroup[] = scenes
    .filter((scene) => isSceneData(scene.data))
    .map((scene) => {
      const data = scene.data
      return {
        key: scene.id,
        label: isSceneData(data) ? data.label : scene.id,
        location: isSceneData(data) ? data.location : '',
        timeOfDay: isSceneData(data) ? data.timeOfDay : '',
        shots: getChildShots({ nodes }, scene.id),
      }
    })

  if (orphanShots.length > 0) {
    groups.push({
      key: '__orphan__',
      label: '(미배정)',
      location: '',
      timeOfDay: '',
      shots: orphanShots,
    })
  }

  const totalShots = nodes.filter((n) => isShotData(n.data)).length

  if (totalShots === 0) {
    return (
      <div className="flex size-full items-center justify-center overflow-auto">
        <div className="flex flex-col items-center gap-2 text-center">
          <ImageIcon className="size-12 text-muted-foreground opacity-50" />
          <p className="text-base font-medium text-foreground">
            아직 Shot이 없어요
          </p>
          <p className="text-sm text-muted-foreground">
            Node 뷰에서 Scene과 Shot을 먼저 만들어 보세요.
          </p>
        </div>
      </div>
    )
  }

  return (
    // Artist/Editor와 동일한 디자인 룰 — shadcn ScrollArea(스타일된 스크롤바).
    // 기존 raw overflow-auto(네이티브 스크롤바)를 교체. 부모 `min-h-0 flex-1`가 높이를 가둔다.
    <ScrollArea className="size-full bg-background">
      {/* key=mediaMode: Previz↔Real 전환 시 remount 로 슬라이드 재생(#e2 2026-08-03).
          방향은 토글 순서(Previz 왼쪽·Real 오른쪽) — real 로 갈 땐 오른쪽에서, 되돌아오면 왼쪽에서. */}
      <div
        key={mediaMode}
        className={cn(
          'flex flex-col gap-6 p-6',
          'animate-in fade-in-25 duration-500 ease-out motion-reduce:animate-none',
          mediaMode === 'real' ? 'slide-in-from-right-6' : 'slide-in-from-left-6',
        )}
      >
        {groups.map((group) => (
          <section key={group.key} className="flex flex-col gap-4">
            <div className="flex items-baseline gap-3">
              <h2 className="text-lg font-medium text-foreground">
                {prettyNodeLabel(group.label)}
              </h2>
              <span className="flex items-center gap-3 text-xs text-muted-foreground">
                {group.location && (
                  <span className="flex items-center gap-1">
                    <MapPin className="size-3" />
                    {/* location_2 등 슬러그 → 실제 장소명 (구조 필드라 플레인, #e6) */}
                    {replaceSlugs(group.location, roster, '')}
                  </span>
                )}
                {group.timeOfDay && (
                  <span className="flex items-center gap-1">
                    <Clock className="size-3" />
                    {group.timeOfDay}
                  </span>
                )}
              </span>
            </div>

            {group.shots.length > 0 ? (
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-4">
                {group.shots.map((shot) => (
                  <ShotCell
                    key={shot.id}
                    node={shot}
                    roster={roster}
                    mediaMode={mediaMode}
                    queuedImageShots={queuedImageShots}
                    queuedVideoShots={queuedVideoShots}
                    activeJobs={activeJobs}
                  />
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                이 Scene에는 Shot이 없어요.
              </p>
            )}
          </section>
        ))}
      </div>
    </ScrollArea>
  )
}
