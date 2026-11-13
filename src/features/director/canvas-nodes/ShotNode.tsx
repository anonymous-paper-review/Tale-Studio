'use client'

import { memo, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { mediaFrameStyle } from '@/lib/project-aspect'
import { useProjectFormatStore } from '@/stores/project-format-store'

import { classifyRoughChanged } from '@/lib/image-provenance'
import { NodeToolbar, Position, type NodeProps } from '@xyflow/react'
import { Camera, Lightbulb } from 'lucide-react'
import { BaseNode } from './BaseNode'
import { LabeledTargetHandle } from './LabeledHandle'
import {
  effectivePrompt,
  useDirectorCanvasStore,
} from '@/stores/director-store'
import { useRoughStoryboard } from '@/features/director/hooks/use-rough-storyboard'
import { RoughFrameCycle } from '@/components/rough-frame-cycle'
import { isShotData, type DirectorNode } from '@/types/director'
import { IMAGE_MODELS, normalizeImageModelKey } from '@/lib/image-models'
import { directorNodeLabel } from '@/features/director/node-label'
import { useBoardNodeNames } from '@/features/director/hooks/use-board-node-names'
import { ThumbImage } from '@/components/thumb-image'
import { useT } from '@/lib/i18n'
import { useActiveGenerationJobs, activeShotIds } from '@/lib/generation-queue'
import { useEntityNames } from '@/lib/writer/use-entity-names'
import { resolveEntityNames } from '@/lib/writer/resolve-entity-names'
import { useStoryboardImageGeneration } from '@/features/director/hooks/use-storyboard-image-generation'
import { StoryboardImageButton } from '@/features/director/storyboard-image-button'
import { useShotStatus } from '@/features/director/hooks/use-shot-states'
import { ShotStateTail } from '@/features/director/shot-status'
import { RemakeRetryButton } from '@/features/director/remake-retry-button'
import { TAKES_UNKNOWN_TEXT, takesReadable } from '@/features/director/takes-check'
import { useTakeBalance } from '@/lib/billing/use-take-balance'
import { dimmedByStatusFilter, shotStateTone } from '@/lib/director/shot-state'
import { shotStopTarget } from '@/lib/director/stop-work'
import { StopMakingButton } from '@/features/director/stop-making-button'
import { MoveFirstButton } from '@/features/director/move-first-button'
import { NodeWaitCard } from '@/components/feedback/node-wait'
import { STAGE_PERSONA } from '@/lib/lumi'
import { useWriterStore } from '@/stores/writer-store'

/** 노드 뷰 미디어 틀의 높이 상한 — 샷 행 간격(SHOT_OFFSET_Y 560px)의 절반 아래로 둬 아래 샷과 겹치지 않는다. */
const SHOT_NODE_MEDIA_MAX_H = 240


function ShotNodeImpl({ id, data, selected }: NodeProps<DirectorNode>) {
  const t = useT()
  // Producer 포맷이 틀의 기준(2026-09-30) — 세로면 세로 틀, 높이는 캔버스 줄 간격(560px) 안에서 제한.
  const projectFormat = useProjectFormatStore((s) => s.format)
  const mediaFrame = mediaFrameStyle(projectFormat, SHOT_NODE_MEDIA_MAX_H)
  const entityNames = useEntityNames()
  // 샷 상태 테두리 · 꼬리 · 상태 고르기 흐림(시안 R 416:4941 · D1, 오너 2026-11-14). 자기 기록으로 센다.
  const shotStatus = useShotStatus(id, isShotData(data) ? data : null)
  const shotStateNow = shotStatus?.state
  const statusFilter = useDirectorCanvasStore((s) => s.statusFilter)
  // 몸통을 누르면 고르기(시안 D2 · R), 상세는 ⤢ — 상세가 열린 노드만 단계 색 테두리 · 위 단추.
  const picked = useDirectorCanvasStore((s) => s.pickedShotIds?.includes(id) ?? false)
  const detailOpen = useDirectorCanvasStore((s) => (s.detailNodeId ?? s.selectedNodeId) === id)
  // 노드 제목은 보드와 같은 전체 번호("Shot 8", 오너 2026-11-02 "전체 번호로 통일").
  const boardNames = useBoardNodeNames()
  const generation = useStoryboardImageGeneration(isShotData(data) ? data : null)
  const isGenerating = generation.generating
  const generateVideoForShot = useDirectorCanvasStore(
    (s) => s.generateVideoForShot,
  )
  // 가지 내기(새 영상 노드 → 바로 생성)도 Take 를 쓴다 — 잔액을 못 읽으면 시작하지 않고 노드 안에 까닭(리드 11/14).
  const takeBalance = useTakeBalance()
  const [takesUnknown, setTakesUnknown] = useState(false)
  // 잔액을 다시 읽는 동안 가지 단추를 끈다 — 두 번 눌러 새 Take 가 두 번 나가지 않게(검토 b 낮음 2). ref 는 빠른 두 번 불림을 막는다.
  const [branchReading, setBranchReading] = useState(false)
  const branchReadingRef = useRef(false)
  // (#e3 2026-08-03) 와이어링된 Prompt 칩은 hover 오버레이 제거와 함께 표시처를 잃었다 —
  //   프롬프트·모델 정보는 카드 본문과 편집 팝업이 담당한다.

  // 목각(rough) 단계 이미지는 writer-store roughStoryboard에서 (writerShotId 스코프 구독)
  const writerShotId = isShotData(data) ? data.writerShotId : null
  const rough = useRoughStoryboard(writerShotId)
  // 만드는 중 판정은 서버 큐가 근거다(#shot-node-video-lock 2026-09-08).
  //   예전엔 브라우저 메모리의 잠금(generationLocks)뿐이라 새로고침·새 탭이면 사라져 같은 샷을
  //   또 만들 수 있었다 — 영상 1건은 최대 5 Take. 같은 화면의 그리드 뷰는 이 근거를 이미 쓴다
  //   (StoryboardGridView: queuedVideoShots). Node 뷰도 같은 것을 본다.
  const projectId = useDirectorCanvasStore((s) => s.projectId)
  const activeJobs = useActiveGenerationJobs(projectId)
  const videoQueued = !!writerShotId && activeShotIds(activeJobs, ['shot_video']).has(writerShotId)
  // 노드 위 기다림 카드의 둘째 줄 "샷 3 · CU"(시안 D4) — 샷 크기는 Writer 샷 기록에서.
  const shotType = useWriterStore((s) => (writerShotId ? s.shots.find((x) => x.shotId === writerShotId)?.shotType ?? null : null))
  // 영상 묶음에서 아직 차례를 기다리는 샷(서버 조회의 낼 순서, 11/5 시안 DG · 리드 2026-11-09). 멈추는 중이면 남은 샷은 만들지 않는다.
  //   N번째와 [먼저 하기](시안 D4, 리드 S4-2 7) — 0 = 다음 차례, -1 = 기다리지 않음.
  const linePosition = useDirectorCanvasStore(
    (s) => (writerShotId && !s.videoBatchCancelled ? s.videoBatchQueue?.pendingShotIds.indexOf(writerShotId) ?? -1 : -1),
  )
  const waitingInLine = linePosition >= 0
  // #payments-phase-2 v4 #2: 생성 전 소모량 표시 — mode==='off'면 배지를 숨긴다(현재 기본값).

  if (!isShotData(data)) return null
  // 노드 제목 · 그림 대체 글은 보드와 같은 이름("Shot 8") — 내부 id 를 보이지 않는다(오너 2026-11-02).
  const nodeTitle = directorNodeLabel(data, boardNames)

  const camActiveAxes = (
    ['horizontal', 'vertical', 'pan', 'tilt', 'roll', 'zoom'] as const
  ).filter((k) => data.camera[k] !== 0).length

  // #node-merge(2026-08-31): 파생 SHOT IMAGE 카드 제거 — 이 카드가 실사 이미지를 직접
  //   표시한다. 새 이미지가 도착하기 전에는 기존 실사를 유지하고, 없으면 previz로 폴백한다.
  const roughUrl =
    rough?.status === 'completed' ? (rough.frames?.start ?? rough.url) : null
  const realImage = data.storyboardImage?.url ? data.storyboardImage : null
  const stageImageUrl = realImage?.url ?? roughUrl

  // 빨간 실패 판은 보일 그림이 없을 때만 — 옛 그림이 남은 다시 만들기 실패는 꼬리로 알린다(리드 검토 c ①).
  const failed = !isGenerating && data.storyboardImage?.status === 'failed' && !realImage
  // 꼬리 글을 바꾸는 때: 묶음에서 영상 차례를 기다리면 "순서 기다리는 중"(11/5 시안 DG), 접수 · 확인 중이면 그 글.
  const tailLabel = waitingInLine
    ? 'Waiting in line · #{n}'
    : isGenerating && (generation.phase === 'submitting' || generation.phase === 'uncertain')
      ? generation.label ?? undefined
      : undefined
  // #names-in-prose: 카드 문구는 이름으로(id 는 구동값, 표시는 이름).
  const prompt = resolveEntityNames(effectivePrompt(data), entityNames)
  // 노드 위 기다림(시안 D4 406:5275): 이미지를 그리는 동안(보냄 · 그리는 중) 기다리는 카드가 노드를 덮고, 그 안에 [멈추기](오너 7번).
  //   보낸 작업이 아직 목록에 없으면(막 보냄) 단추 없이 카드만. 응답을 놓친 확인 중에는 덮지 않는다(꼬리가 그 글을 말한다).
  const drawing = isGenerating && (generation.phase === 'generating' || generation.phase === 'submitting')
  const imageStop = drawing && writerShotId ? shotStopTarget(activeJobs, writerShotId, 'image') : null

  return (
    <>
      {/* 선택 시 상단 플로팅 툴바(#e4 2026-07-14) — SHOT IMAGE 카드는 이미지 생성 관련만:
          러프만 보이는 상태 → '이미지 생성', 실사 이미지가 있으면 → '이미지 리터칭'(재생성).
          영상 테이크 버튼은 SHOT VIDEO 카드('영상 리테이크')로 이동. */}
      <NodeToolbar isVisible={detailOpen} position={Position.Top} offset={8}>
        <div className="flex items-center gap-1.5 rounded-full bg-popover p-1 pr-2.5 shadow-node">
          <StoryboardImageButton nodeId={id} data={data} className="h-7 gap-1 rounded-full px-3 text-xs" />
          {/* 선택된 이미지 모델명 — 변경은 편집 패널/팝업에서. */}
          <span className="font-num text-[11px] font-medium text-muted-foreground">
            {IMAGE_MODELS[normalizeImageModelKey(data.imageModel)].label}
          </span>
        </div>
      </NodeToolbar>

      <BaseNode
        id={id}
        theme="shot"
        title={nodeTitle}
        selected={detailOpen}
        picked={picked}
        width={280}
        stale={data.stale}
        beam={isGenerating && !drawing ? 'success' : null}
        inert={drawing}
        stateFrame={shotStateNow ? shotStateTone(shotStateNow).frame : null}
        dimmed={dimmedByStatusFilter(shotStateNow, statusFilter)}
        canBranch={!videoQueued && !branchReading}
        onBranch={async () => {
          if (videoQueued || branchReadingRef.current) return
          branchReadingRef.current = true
          setBranchReading(true)
          try {
            if (!(await takesReadable())) {
              setTakesUnknown(true)
              return
            }
            setTakesUnknown(false)
            void generateVideoForShot(id)
          } finally {
            branchReadingRef.current = false
            setBranchReading(false)
          }
        }}
      >
        {/* 입력 핸들(#handle-visibility) — 항상 보이는 라벨 홈들. v3 D1: 제목 줄 아래 20px 간격 · 한국어 라벨. */}
        <LabeledTargetHandle
          id="prompt"
          label={t('Prompt')}
          top={46}
          title={t('Prompt input')}
        />
        <LabeledTargetHandle
          id="image-reference"
          label={t('Image')}
          top={66}
          title={t('Image reference input')}
        />

        {prompt && (
          <p className="mt-2 line-clamp-2 text-[11.5px] leading-[1.45] text-muted-foreground">
            {prompt}
          </p>
        )}

        {/* 단계 이미지 — previz 3프레임이 있으면 hover 순환(#e3 2026-08-03, 러프 보드와 동일).
            옛 hover 디밍+프로비넌스 오버레이는 순환을 가리는 회색 화면이라 제거 — 프롬프트는
            카드 본문·팝업에서 이미 보인다. 3프레임 없는 이미지(구버전/수동 노드)는 정적 표시. */}
        {stageImageUrl && (
          <div
            className={cn('relative mt-2 overflow-hidden rounded-[10px] bg-art-placeholder', !mediaFrame && 'aspect-video w-full')}
            style={mediaFrame ?? undefined}
          >
            {realImage ? (
              realImage.frames ? (
                <RoughFrameCycle panel={realImage} alt={t('{label} storyboard', { label: nodeTitle })} />
              ) : (
                <ThumbImage
                  src={realImage.url}
                  alt="storyboard"
                  className="h-full w-full object-cover"
                />
              )
            ) : rough?.status === 'completed' && rough.frames ? (
              <RoughFrameCycle panel={rough} alt={t('{label} (previz)', { label: nodeTitle })} />
            ) : (
              <ThumbImage
                src={stageImageUrl}
                alt="Rough storyboard"
                className="h-full w-full object-cover"
              />
            )}
            <span className="pointer-events-none absolute left-1.5 top-1.5 rounded-[6px] bg-black/45 px-1.5 py-px text-[10px] font-semibold text-foreground">
              {/* 시안 D1 노드형 "러프" — 스토리보드의 [러프 | 실사] 토글과 같은 말(리드 답 5b). */}
              {realImage ? t('Live-action') : t('Rough')}
            </span>
            {/* 약속 I4: 러프 3장 중 하나라도 바뀌면 "러프 바뀜" — 자동으로 다시 만들지 않는다(오너 I5). */}
            {realImage && classifyRoughChanged(rough, data.storyboardImage) && (
              <span className="pointer-events-none absolute right-1.5 top-1.5 rounded-[6px] bg-black/45 px-1.5 py-px text-[10px] font-semibold text-warning">
                {t('Rough changed')}
              </span>
            )}
          </div>
        )}

        {failed && (
          <div
            style={mediaFrame ?? undefined}
            className={cn('mt-2 flex flex-col items-center justify-center gap-0.5 rounded-[10px] bg-destructive/10 p-1.5 text-center', !mediaFrame && 'aspect-video w-full')}
          >
            <span className="text-[10px] font-medium text-destructive">
              {t('Generation failed')}
            </span>
            {data.storyboardImage?.errorMessage && (
              <span className="line-clamp-2 break-all font-mono text-[9px] leading-tight text-destructive/80">
                {data.storyboardImage.errorMessage}
              </span>
            )}
          </div>
        )}

        {data.referenceImages.length > 0 && (
          <div className="mt-2 flex gap-1">
            {data.referenceImages.slice(0, 4).map((img) => (
              <div
                key={img.id}
                className="size-8 overflow-hidden rounded-lg bg-card"
              >
                <ThumbImage src={img.url} alt="ref" className="h-full w-full object-cover" />
              </div>
            ))}
            {data.referenceImages.length > 4 && (
              <div className="flex size-8 items-center justify-center rounded-lg bg-card font-num text-[11px] font-medium text-muted-foreground">
                +{data.referenceImages.length - 4}
              </div>
            )}
          </div>
        )}

        {/* 꼬리(시안 D1 노드형 406:4051 "● 이미지 필요 러프만 있음", 리드 검토 c ②) — 카드와 같은 상태 꼬리라 테두리 색만으로 말하지 않는다.
            다시 만들기가 실패하면 "다시 만들기 실패" + [다시 만들기]. 흐린 덧말: 이미지 필요 샷은 러프가 있으면 "러프만 있음",
            그 밖에는 카메라 축 · 조명 자리(v3 D1). */}
        {shotStatus && (
          <ShotStateTail
            state={shotStatus.state}
            place="node"
            waiting={shotStatus.facts.imageWaiting}
            remakeFailed={shotStatus.facts.imageRemakeFailed}
            label={tailLabel}
            labelParams={{ n: linePosition + 1 }}
            lineAction={linePosition > 0 && writerShotId ? <MoveFirstButton shotId={writerShotId} place="node" /> : null}
            className="mt-2.5"
            retry={<RemakeRetryButton nodeId={id} data={data} place="node" />}
            note={
              shotStatus.state === 'image_needed' && roughUrl ? (
                t('Rough only')
              ) : (
                <>
                  <span className="flex items-center gap-0.5">
                    <Camera className="size-3" />
                    <span className="font-num">{camActiveAxes}/6</span>
                  </span>
                  <span className="flex min-w-0 items-center gap-0.5">
                    <Lightbulb className="size-3" />
                    <span className="truncate">{data.lighting.position}</span>
                  </span>
                  {/* Take 배지는 영상 카드에만 둔다(약속 O 2026-09-04 — 이미지 카드의 "Take N" 제거). */}
                </>
              )
            }
          />
        )}
        {takesUnknown && takeBalance.failed && (
          <p className="mt-1 text-[10px] text-destructive">{t(TAKES_UNKNOWN_TEXT)}</p>
        )}
        {drawing && (
          <NodeWaitCard
            lumi={STAGE_PERSONA.director}
            title={generation.phase === 'submitting' && generation.label ? t(generation.label) : t('Drawing the image')}
            description={shotType ? `${nodeTitle} · ${shotType}` : nodeTitle}
            note={imageStop && imageStop.sheetShots > 1 ? t('{count} shots on the same sheet stop together', { count: imageStop.sheetShots }) : undefined}
            action={imageStop ? <StopMakingButton target={imageStop} kind="image" place="wait" /> : undefined}
            className="-inset-[1.5px]"
          />
        )}
      </BaseNode>
    </>
  )
}

export const ShotNode = memo(ShotNodeImpl)
