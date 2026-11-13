'use client'

// 다시 만들기가 실패한 샷의 꼬리 옆 [다시 만들기](리드 검토 c ①) — 카드 · 노드가 같이 쓴다.
//   옛 그림을 새 그림으로 바꾸는 일이라 지금처럼 확인 창을 거친다(#regen-confirm). 실패 까닭은 마우스 올림 글로.
import { useState } from 'react'
import { RotateCw } from 'lucide-react'

import { useT } from '@/lib/i18n'
import type { ShotTailPlace } from '@/lib/director/shot-state'
import { cn } from '@/lib/utils'
import { useDirectorCanvasStore } from '@/stores/director-store'
import type { ShotNodeData } from '@/types/director'
import { useStoryboardImageGeneration } from './hooks/use-storyboard-image-generation'
import { RegenerateConfirmDialog } from './regenerate-confirm-dialog'

export function RemakeRetryButton({
  nodeId,
  data,
  place = 'card',
}: {
  nodeId: string
  data: ShotNodeData
  place?: ShotTailPlace
}) {
  const t = useT()
  const generation = useStoryboardImageGeneration(data)
  const generateStoryboardImage = useDirectorCanvasStore((s) => s.generateStoryboardImage)
  const [confirm, setConfirm] = useState(false)
  return (
    <>
      <button
        type="button"
        disabled={generation.disabled}
        title={data.storyboardImage?.errorMessage ?? undefined}
        onClick={(event) => {
          event.stopPropagation()
          if (!generation.disabled) setConfirm(true)
        }}
        onDoubleClick={(event) => event.stopPropagation()}
        className={cn(
          'nodrag inline-flex shrink-0 items-center gap-1 rounded-full text-[11px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50',
          place === 'card'
            ? 'bg-black/55 px-2 py-0.5 text-foreground hover:bg-black/70'
            : 'px-1.5 text-muted-foreground hover:text-foreground',
        )}
      >
        <RotateCw className="size-3" />
        {t('Make again')}
      </button>
      <RegenerateConfirmDialog
        open={confirm}
        onOpenChange={(open) => {
          if (!open) setConfirm(false)
        }}
        title={t('Regenerate the image?')}
        description={t('Generates a new shooting image for this shot.')}
        impact={[t('The new image becomes the current one. The current image stays in the versions.')]}
        confirmLabel={t('Regenerate')}
        busy={generation.disabled}
        onConfirm={() => {
          setConfirm(false)
          void generateStoryboardImage(nodeId)
        }}
      />
    </>
  )
}
