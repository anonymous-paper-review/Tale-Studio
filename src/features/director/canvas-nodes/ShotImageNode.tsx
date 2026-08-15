'use client'

// SHOT IMAGE 노드(#previz-chain 2026-07-22) — shots.storyboard_image(실사 3프레임)의 파생 표시.
//
// 진실은 부모 Shot 노드 data.storyboardImage — 이 노드는 표시 + 생성 트리거만.
// 체인 중간 단계(2026-07-27 직선화): SHOT(previz 보드) → 이 노드 → SHOT VIDEO.
//   좌측 target(체인 입력) + 우측 source(SHOT VIDEO 로) 양쪽 핸들을 가진다.
// 실사 3프레임(frames)이 있으면 러프 보드와 동일한 hover 순환(START→DIRECTING→END).

import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { ImageIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { GeneratedImage, GeneratingOverlay } from '@/components/generating-frame'
import { RoughFrameCycle } from '@/components/rough-frame-cycle'
import { useDirectorCanvasStore } from '@/stores/director-store'
import {
  useActiveGenerationJobs,
  activeShotIds,
  activeStartedAt,
} from '@/lib/generation-queue'
import { isShotData, isShotImageData, type DirectorNode } from '@/types/director'
import { prettyNodeLabel } from '@/features/director/node-label'

function ShotImageNodeImpl({ data, selected }: NodeProps<DirectorNode>) {
  const parentShotNodeId = isShotImageData(data) ? data.parentShotNodeId : null
  // 부모 Shot 스코프 구독 — storyboardImage 객체 참조는 노드 데이터 교체 시에만 바뀐다.
  const storyboardImage = useDirectorCanvasStore((s) => {
    if (!parentShotNodeId) return null
    const n = s.nodes.find((x) => x.id === parentShotNodeId)
    return n && isShotData(n.data) ? n.data.storyboardImage : null
  })
  const parentWriterShotId = useDirectorCanvasStore((s) => {
    if (!parentShotNodeId) return null
    const n = s.nodes.find((x) => x.id === parentShotNodeId)
    return n && isShotData(n.data) ? n.data.writerShotId : null
  })
  const parentGenerating = useDirectorCanvasStore(
    (s) => !!parentShotNodeId && !!s.generatingNodeIds[parentShotNodeId],
  )
  const openPopup = useDirectorCanvasStore((s) => s.openPopup)
  // 경과시간 durable 기준점(#elapsed-durable 2026-08-12) — 그리드와 동일: 큐의 submitted_at.
  //   탭을 떠났다 와도(remount) 타이머가 0으로 돌아가지 않는다.
  const projectId = useDirectorCanvasStore((s) => s.projectId)
  const activeJobs = useActiveGenerationJobs(projectId || null)

  // 스토리보드 뷰와 같은 진행 동기화(#e6 2026-08-12) — 큐가 판정의 바닥.
  const realBatchBusy = useDirectorCanvasStore((s) => s.realBatchBusy)

  if (!isShotImageData(data)) return null

  const hasImage = storyboardImage?.status === 'completed' && !!storyboardImage.url
  const failed = storyboardImage?.status === 'failed'
  const queuedImage =
    !!parentWriterShotId &&
    activeShotIds(activeJobs, ['shot_storyboard', 'storyboard_real_grid']).has(parentWriterShotId)
  // 일괄 러너 순번 대기(큐에 아직 없음) — 문구만 '대기 중', 타이머 없음(#e4 와 동일 규칙).
  const waitingOnly =
    realBatchBusy && !hasImage && !failed && !queuedImage &&
    storyboardImage?.status !== 'generating' && !parentGenerating
  const generating =
    parentGenerating || storyboardImage?.status === 'generating' || queuedImage || waitingOnly

  return (
    <div
      className={cn(
        'group relative w-[260px] rounded-lg border',
        // 산출물(실사 이미지) 없으면 플레이스홀더와 같은 회색 대시 톤(2026-07-23 피드백).
        hasImage
          ? 'border-chart-4/70 bg-node-bg-default'
          : 'border-dashed border-border bg-node-bg-default/60 opacity-80 transition-opacity hover:opacity-100',
        // RF 선택 링(클릭) — BaseNode 와 동일 시각 언어(2026-07-23)
        selected &&
          (hasImage
            ? 'border-2 ring-4 ring-chart-4/60'
            : 'border-2 ring-4 ring-muted-foreground/30 opacity-100'),
      )}
    >
      <Handle
        type="target"
        position={Position.Left}
        id="left"
        className={cn(
          '!h-2 !w-2 !border-0 opacity-0 group-hover:opacity-100',
          hasImage ? 'bg-chart-4' : 'bg-muted-foreground/60',
        )}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="right"
        className={cn(
          '!h-2 !w-2 !border-0 opacity-0 group-hover:opacity-100',
          hasImage ? 'bg-chart-4' : 'bg-muted-foreground/60',
        )}
      />

      <div
        className={cn(
          'flex h-7 items-center justify-between border-b px-3 text-xs',
          hasImage ? 'border-border/60' : 'border-dashed border-border/60',
        )}
      >
        <span
          className={cn(
            'flex items-center gap-1.5 font-medium uppercase tracking-wide',
            hasImage ? 'text-muted-foreground' : 'text-muted-foreground/70',
          )}
        >
          <span
            className={cn(
              'h-1.5 w-1.5 rounded-full',
              hasImage ? 'bg-chart-4' : 'bg-muted-foreground/50',
            )}
          />
          Shot image
        </span>
        <span className="max-w-24 truncate text-[10px] text-muted-foreground/70">
          {prettyNodeLabel(data.label)}
        </span>
      </div>

      <div className="p-2">
        <div
          className={cn(
            'relative aspect-video w-full overflow-hidden rounded-sm border',
            hasImage
              ? 'border-border/40 bg-muted/40'
              : 'border-dashed border-border/60 bg-muted/20',
          )}
        >
          {hasImage ? (
            storyboardImage.frames ? (
              <RoughFrameCycle panel={storyboardImage} alt={`${data.label} storyboard`} />
            ) : (
              <GeneratedImage
                src={storyboardImage.url}
                alt={`${data.label} storyboard`}
                className="h-full w-full object-cover"
              />
            )
          ) : failed ? (
            <div className="flex h-full w-full flex-col items-center justify-center gap-0.5 bg-destructive/10 p-1.5 text-center">
              <span className="text-[10px] font-medium text-destructive">생성 실패</span>
              {storyboardImage?.errorMessage && (
                <span className="line-clamp-2 break-all font-mono text-[9px] leading-tight text-destructive/80">
                  {storyboardImage.errorMessage}
                </span>
              )}
            </div>
          ) : (
            <span className="flex h-full w-full flex-col items-center justify-center gap-1">
              <ImageIcon className="size-5 text-muted-foreground/40" />
              <span className="text-[10px] text-muted-foreground/70">아직 이미지가 없어요</span>
            </span>
          )}
          <GeneratingOverlay
            active={!!generating}
            label={waitingOnly ? '이미지 생성 대기 중' : '이미지 생성 중'}
            showElapsed={!waitingOnly}
            beamColor="success"
            startedAt={
              parentWriterShotId
                ? activeStartedAt(
                    activeJobs,
                    ['shot_storyboard', 'storyboard_real_grid'],
                    parentWriterShotId,
                  )
                : undefined
            }
          />
        </div>

        {/* 버튼 = 팝업 열기(#e4 2026-08-12) — 즉시 재생성이 아니라 더블클릭과 같은 부모 Shot
            모달을 연다(프롬프트 확인·조정 후 사람이 실행). 즉시 실행은 교체+과금이라 원클릭 금지. */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            if (parentShotNodeId) openPopup(parentShotNodeId)
          }}
          disabled={!parentShotNodeId || !!generating}
          className={cn(
            'nodrag mt-2 flex h-6 w-full items-center justify-center gap-1 rounded-md border border-border text-[10px] font-medium text-foreground',
            'transition-colors duration-100 hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50',
          )}
        >
          <ImageIcon className="size-3" />
          {hasImage ? '이미지 재생성' : '이미지 생성'}
        </button>
      </div>
    </div>
  )
}

export const ShotImageNode = memo(ShotImageNodeImpl)
