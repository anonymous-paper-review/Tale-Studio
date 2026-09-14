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

export function StoryboardImageButton({ nodeId, data, className }: {
  nodeId: string
  data: ShotNodeData
  className?: string
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
    void generateStoryboardImage(nodeId)
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
        {generation.label ? t(generation.label) : hasImage ? t('Regenerate image') : t('Generate image')}
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
        impact={confirm === 'manual-retry' ? [] : [t('Replaces the existing shooting image with the new result.')]}
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
