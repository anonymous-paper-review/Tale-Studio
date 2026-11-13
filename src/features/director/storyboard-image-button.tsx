'use client'

import { useState } from 'react'
import { ImageIcon, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { refreshGenerationQueue } from '@/lib/generation-queue'
import { useT } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { useDirectorCanvasStore } from '@/stores/director-store'
import type { ShotNodeData } from '@/types/director'
import { checkStoryboardImageStatus, useStoryboardImageGeneration } from './hooks/use-storyboard-image-generation'
import { RegenerateConfirmDialog } from './regenerate-confirm-dialog'

export function StoryboardImageButton({ nodeId, data, className, idleLabel, changeNote = '' }: {
  nodeId: string
  data: ShotNodeData
  className?: string
  /** 기다리는 중이 아닐 때 단추 이름(샷 상세 D6 "시작·끝 이미지 다시 만들기 · Takes 0"). 없으면 지금 이름. */
  idleLabel?: string
  /** 샷 상세의 "바꾸고 싶은 점" — 이번 다시 만들기에만 실어 보낸다. */
  changeNote?: string
}) {
  const t = useT()
  const generation = useStoryboardImageGeneration(data)
  const generateStoryboardImage = useDirectorCanvasStore((s) => s.generateStoryboardImage)
  const [confirm, setConfirm] = useState<null | 'replace' | 'manual-retry'>(null)
  const hasImage = !!data.storyboardImage?.url
  const manualUncertain = generation.phase === 'uncertain' && !data.writerShotId
  const run = () => {
    if (generation.disabled) return
    setConfirm(null)
    void (changeNote.trim() ? generateStoryboardImage(nodeId, { changeNote }) : generateStoryboardImage(nodeId))
  }
  return (
    <>
      <Button
        type="button"
        size="sm"
        className={cn('gap-1.5', generation.disabled && generation.phase !== 'error' && 'disabled:opacity-70', className)}
        disabled={generation.disabled}
        aria-busy={generation.generating}
        onClick={(event) => {
          event?.stopPropagation()
          if (generation.disabled) return
          if (hasImage) setConfirm('replace')
          else run()
        }}
      >
        {generation.disabled && generation.phase !== 'error'
          ? <Loader2 className="size-3.5 animate-spin" />
          : <ImageIcon className="size-3.5" />}
        {generation.label ? t(generation.label) : idleLabel ?? (hasImage ? t('Regenerate image') : t('Generate image'))}
      </Button>
      {generation.phase === 'error' && (
        <Button type="button" size="sm" variant="ghost" onClick={refreshGenerationQueue}>
          {t('Retry')}
        </Button>
      )}
      {generation.phase === 'uncertain' && (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={manualUncertain && generation.batchBusy}
          onClick={() => {
            if (manualUncertain) setConfirm('manual-retry')
            else checkStoryboardImageStatus()
          }}
        >
          {manualUncertain ? t('Generate again') : t('Check image status')}
        </Button>
      )}
      <RegenerateConfirmDialog
        open={confirm !== null}
        onOpenChange={(open) => { if (!open) setConfirm(null) }}
        title={t('Regenerate the image?')}
        description={confirm === 'manual-retry'
          ? t('The previous request may still be running. Generating again sends a new request.')
          : t('Generates a new shooting image for this shot.')}
        // 버전(디자이너 11/13 D6 · 오너 2026-11-14 답 5번) — 앞 그림은 덮이지 않고 버전으로 남는다.
        impact={confirm === 'manual-retry' ? [] : [t('The new image becomes the current one. The current image stays in the versions.')]}
        confirmLabel={confirm === 'manual-retry' ? t('Generate again') : t('Regenerate')}
        busy={confirm === 'manual-retry' ? !manualUncertain || generation.batchBusy : generation.disabled}
        onConfirm={() => {
          if (confirm !== 'manual-retry') { run(); return }
          if (!manualUncertain || generation.batchBusy) return
          setConfirm(null)
          void useDirectorCanvasStore.getState().retryUnconfirmedManualStoryboardImage(nodeId)
        }}
      />
    </>
  )
}
