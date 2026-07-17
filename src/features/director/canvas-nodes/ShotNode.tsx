'use client'

import { memo } from 'react'
import { Handle, NodeToolbar, Position, type NodeProps } from '@xyflow/react'
import { Camera, Lightbulb, ImageIcon, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { BaseNode } from './BaseNode'
import {
  getChildVideos,
  getShotStage,
  useDirectorCanvasStore,
} from '@/stores/director-store'
import { useRoughStoryboard } from '@/features/director/hooks/use-rough-storyboard'
import { isShotData, isPromptData, type DirectorNode } from '@/types/director'
import { prettyNodeLabel } from '@/features/director/node-label'
import { ThumbImage } from '@/components/thumb-image'


function ShotNodeImpl({ id, data, selected }: NodeProps<DirectorNode>) {
  const takeCount = useDirectorCanvasStore((s) => getChildVideos(s, id).length)
  const stage = useDirectorCanvasStore((s) => getShotStage(s, id))
  const isGenerating = useDirectorCanvasStore((s) => !!s.generatingNodeIds[id])
  const generateStoryboardImage = useDirectorCanvasStore(
    (s) => s.generateStoryboardImage,
  )
  const addVideoTake = useDirectorCanvasStore((s) => s.addVideoTake)
  // 와이어링된 Prompt 노드 text (Higgsfield "따로 뺀 프롬프트" 칩)
  const wiredPromptText = useDirectorCanvasStore((s) => {
    const p = s.nodes.find(
      (n) => isPromptData(n.data) && n.data.targetShotNodeId === id,
    )
    return p && isPromptData(p.data) ? p.data.text : null
  })

  // 목각(rough) 단계 이미지는 writer-store roughStoryboard에서 (writerShotId 스코프 구독)
  const writerShotId = isShotData(data) ? data.writerShotId : null
  const rough = useRoughStoryboard(writerShotId)

  if (!isShotData(data)) return null

  const camActiveAxes = (
    ['horizontal', 'vertical', 'pan', 'tilt', 'roll', 'zoom'] as const
  ).filter((k) => data.camera[k] !== 0).length

  // 단계별 표시 이미지: rough=목각, live/video=실사(storyboardImage)
  const stageImageUrl =
    stage === 'rough'
      ? rough?.status === 'completed'
        ? rough.url
        : null
      : (data.storyboardImage?.url ?? null)

  const failed = data.storyboardImage?.status === 'failed'

  return (
    <>
      {/* 선택 시 상단 플로팅 툴바(#e4 2026-07-14) — SHOT IMAGE 카드는 이미지 생성 관련만:
          러프만 보이는 상태 → '이미지 생성', 실사 이미지가 있으면 → '이미지 리터칭'(재생성).
          영상 테이크 버튼은 SHOT VIDEO 카드('영상 리테이크')로 이동. */}
      <NodeToolbar isVisible={selected} position={Position.Top} offset={8}>
        <div className="flex items-center gap-1 rounded-md border border-border bg-popover p-1 shadow-md">
          <Button
            size="sm"
            className="h-7 gap-1 px-2 text-xs"
            disabled={isGenerating}
            onClick={(e) => {
              e.stopPropagation()
              void generateStoryboardImage(id)
            }}
          >
            <ImageIcon className="size-3" />
            {stage === 'rough' ? '이미지 생성' : '이미지 리터칭'}
            <ChevronRight className="size-3" />
          </Button>
          {/* 이미지 생성 모델 표기(#e4 2026-07-15) — 영상 모델 칩 대신 이미지 모델 2종.
              GPT Image 2.0 = 현재 사용 모델, Midjourney 8.1 = 준비 중(비활성). */}
          <span className="rounded-sm border border-primary/50 bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-foreground">
            GPT Image 2.0
          </span>
          <span
            className="cursor-not-allowed rounded-sm border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground opacity-60"
            title="준비 중"
          >
            Midjourney 8.1
          </span>
        </div>
      </NodeToolbar>

      <BaseNode
        id={id}
        theme="shot"
        title={prettyNodeLabel(data.label)}
        selected={selected}
        width={280}
        stale={data.stale}
        // 빔은 로컬 플래그(즉시 반응) + DB status(재진입/웹훅 경로) 둘 다에서 켜진다
        beam={
          isGenerating || data.storyboardImage?.status === 'generating'
            ? 'success'
            : null
        }
        canBranch
        onBranch={() => {
          addVideoTake(id)
        }}
      >
        {/* Prompt 노드 와이어링용 T 입력 핸들 (좌측) */}
        <Handle
          type="target"
          position={Position.Left}
          id="prompt"
          className="!h-2 !w-2 !border-0 bg-foreground/50 opacity-0 group-hover:opacity-100"
          style={{ top: 64 }}
        />

        {data.prompt && (
          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
            {data.prompt}
          </p>
        )}

        {/* 단계 이미지 + 호버 프로비넌스 오버레이 */}
        {stageImageUrl && (
          <div className="group/img relative mt-2 aspect-video w-full overflow-hidden rounded-sm border border-border/40">
            <ThumbImage
              src={stageImageUrl}
              alt={stage === 'rough' ? 'rough storyboard' : 'storyboard'}
              className="h-full w-full object-cover transition-opacity group-hover/img:opacity-30"
            />
            {/* 호버 시 디밍 + 생성 정보(프롬프트/모델/따로 뺀 프롬프트 칩) */}
            <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-2 opacity-0 transition-opacity group-hover/img:opacity-100">
              <p className="line-clamp-3 text-[10px] leading-tight text-foreground">
                {data.prompt || '(프롬프트 없음)'}
              </p>
              <div className="flex flex-wrap items-center gap-1">
                <span className="rounded-sm bg-background/80 px-1 font-mono text-[9px] text-muted-foreground">
                  {data.provider}
                </span>
                {wiredPromptText && (
                  <span className="max-w-full truncate rounded-sm bg-background/80 px-1 text-[9px] text-muted-foreground">
                    + {wiredPromptText}
                  </span>
                )}
              </div>
            </div>
            <span className="absolute left-1 top-1 rounded-sm bg-background/70 px-1 text-[9px] uppercase text-muted-foreground">
              {stage === 'rough' ? '목각' : stage === 'live' ? '실사' : '영상'}
            </span>
          </div>
        )}

        {failed && (
          <div className="mt-2 flex aspect-video w-full flex-col items-center justify-center gap-0.5 rounded-sm border border-destructive/50 bg-destructive/10 p-1.5 text-center">
            <span className="text-[10px] font-medium text-destructive">
              생성 실패
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
                className="h-8 w-8 overflow-hidden rounded-sm border border-border/40"
              >
                <ThumbImage src={img.url} alt="ref" className="h-full w-full object-cover" />
              </div>
            ))}
            {data.referenceImages.length > 4 && (
              <div className="flex h-8 w-8 items-center justify-center rounded-sm border border-border/40 text-[10px] text-muted-foreground">
                +{data.referenceImages.length - 4}
              </div>
            )}
          </div>
        )}

        <div className="mt-2 flex items-center justify-between text-[10px] text-muted-foreground">
          <span className="flex items-center gap-2">
            <span className="flex items-center gap-0.5">
              <Camera className="size-2.5" />
              {camActiveAxes}/6
            </span>
            <span className="flex items-center gap-0.5">
              <Lightbulb className="size-2.5" />
              {data.lighting.position}
            </span>
          </span>
          <span className="font-mono">{takeCount} take</span>
        </div>
      </BaseNode>
    </>
  )
}

export const ShotNode = memo(ShotNodeImpl)
