'use client'

import { memo } from 'react'
import { NodeToolbar, Position, type NodeProps } from '@xyflow/react'
import { Camera, Lightbulb, ImageIcon, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { BaseNode } from './BaseNode'
import { LabeledTargetHandle } from './LabeledHandle'
import {
  getShotStage,
  effectivePrompt,
  useDirectorCanvasStore,
} from '@/stores/director-store'
import { useRoughStoryboard } from '@/features/director/hooks/use-rough-storyboard'
import { RoughFrameCycle } from '@/components/rough-frame-cycle'
import { isShotData, type DirectorNode } from '@/types/director'
import { IMAGE_MODELS, normalizeImageModelKey } from '@/lib/image-models'
import { prettyNodeLabel } from '@/features/director/node-label'
import { ThumbImage } from '@/components/thumb-image'
import { useT } from '@/lib/i18n'


function ShotNodeImpl({ id, data, selected }: NodeProps<DirectorNode>) {
  const t = useT()
  const stage = useDirectorCanvasStore((s) => getShotStage(s, id))
  const isGenerating = useDirectorCanvasStore((s) => !!s.generatingNodeIds[id])
  const generateStoryboardImage = useDirectorCanvasStore(
    (s) => s.generateStoryboardImage,
  )
  const generateVideoForShot = useDirectorCanvasStore(
    (s) => s.generateVideoForShot,
  )
  // (#e3 2026-08-03) 와이어링된 Prompt 칩은 hover 오버레이 제거와 함께 표시처를 잃었다 —
  //   프롬프트·모델 정보는 카드 본문과 편집 팝업이 담당한다.

  // 목각(rough) 단계 이미지는 writer-store roughStoryboard에서 (writerShotId 스코프 구독)
  const writerShotId = isShotData(data) ? data.writerShotId : null
  const rough = useRoughStoryboard(writerShotId)

  if (!isShotData(data)) return null

  const camActiveAxes = (
    ['horizontal', 'vertical', 'pan', 'tilt', 'roll', 'zoom'] as const
  ).filter((k) => data.camera[k] !== 0).length

  // #node-merge(2026-08-31): 파생 SHOT IMAGE 카드 제거 — 이 카드가 실사 이미지를 직접
  //   표시한다. 실사(storyboardImage 완료) 우선, 없으면 previz(rough) 폴백.
  const roughUrl =
    rough?.status === 'completed' ? (rough.frames?.start ?? rough.url) : null
  const realImage =
    data.storyboardImage?.status === 'completed' ? data.storyboardImage : null
  const stageImageUrl = realImage?.url ?? roughUrl

  const failed = data.storyboardImage?.status === 'failed'
  const prompt = effectivePrompt(data)

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
            {stage === 'rough' ? t('Generate image') : t('Retouch image')}
            <ChevronRight className="size-3" />
          </Button>
          {/* 선택된 이미지 모델명 — 변경은 편집 패널/팝업에서. */}
          <span className="rounded-sm border border-primary/50 bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-foreground">
            {IMAGE_MODELS[normalizeImageModelKey(data.imageModel)].label}
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
        // 빔은 로컬 플래그(즉시 반응) + DB status(재진입/웹훅 경로) 둘 다에서 켜진다.
        //   #previz-chain: 체인 샷의 실사 생성 빔은 SHOT IMAGE 파생 노드가 담당.
        beam={
          isGenerating || data.storyboardImage?.status === 'generating'
            ? 'success'
            : null
        }
        canBranch
        onBranch={() => {
          void generateVideoForShot(id)
        }}
      >
        {/* 입력 핸들(#handle-visibility) — 항상 보이는 라벨 홈들로 교체. */}
        <LabeledTargetHandle
          id="prompt"
          label="PROMPT"
          top={64}
          title={t('Prompt input')}
        />
        <LabeledTargetHandle
          id="image-reference"
          label="IMAGE"
          top={90}
          title={t('Image reference input')}
        />

        {prompt && (
          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
            {prompt}
          </p>
        )}

        {/* 단계 이미지 — previz 3프레임이 있으면 hover 순환(#e3 2026-08-03, 러프 보드와 동일).
            옛 hover 디밍+프로비넌스 오버레이는 순환을 가리는 회색 화면이라 제거 — 프롬프트는
            카드 본문·팝업에서 이미 보인다. 3프레임 없는 이미지(구버전/수동 노드)는 정적 표시. */}
        {stageImageUrl && (
          <div className="relative mt-2 aspect-video w-full overflow-hidden rounded-sm border border-border/40">
            {realImage ? (
              realImage.frames ? (
                <RoughFrameCycle panel={realImage} alt={`${data.label} storyboard`} />
              ) : (
                <ThumbImage
                  src={realImage.url}
                  alt="storyboard"
                  className="h-full w-full object-cover"
                />
              )
            ) : rough?.status === 'completed' && rough.frames ? (
              <RoughFrameCycle panel={rough} alt={`${data.label} (previz)`} />
            ) : (
              <ThumbImage
                src={stageImageUrl}
                alt="rough storyboard"
                className="h-full w-full object-cover"
              />
            )}
            <span className="pointer-events-none absolute left-1 top-1 rounded-sm bg-background/70 px-1 text-[9px] uppercase text-muted-foreground">
              {realImage ? t('Live-action') : t('Previz')}
            </span>
          </div>
        )}

        {failed && (
          <div className="mt-2 flex aspect-video w-full flex-col items-center justify-center gap-0.5 rounded-sm border border-destructive/50 bg-destructive/10 p-1.5 text-center">
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

        <div className="mt-2 text-[10px] text-muted-foreground">
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
        </div>
      </BaseNode>
    </>
  )
}

export const ShotNode = memo(ShotNodeImpl)
