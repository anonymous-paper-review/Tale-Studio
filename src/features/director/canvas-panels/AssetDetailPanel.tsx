'use client'

import { ImageIcon, Loader2, Upload, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { HoverBeam } from '@/components/hover-beam'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { ThumbImage } from '@/components/thumb-image'
import { cn } from '@/lib/utils'
import { useDirectorCanvasStore } from '@/stores/director-store'
import { newDirectorId, type AssetNodeData } from '@/types/director'
import {
  IMAGE_MODELS,
  IMAGE_MODEL_ORDER,
  normalizeImageModelKey,
} from '@/lib/image-models'
import { useT } from '@/lib/i18n'

export function AssetDetailPanel({
  nodeId,
  data,
}: {
  nodeId: string
  data: AssetNodeData
}) {
  const t = useT()
  const updateNodeData = useDirectorCanvasStore((state) => state.updateNodeData)
  const generateAssetImage = useDirectorCanvasStore(
    (state) => state.generateAssetImage,
  )
  const role = data.assetKind === 'character' ? t('Character') : t('Background')
  const isGenerating = data.generationStatus === 'generating'

  const addReference = (file: File) => {
    const reader = new FileReader()
    reader.onload = () => {
      const current = useDirectorCanvasStore
        .getState()
        .nodes.find((node) => node.id === nodeId)
      const referenceImages =
        current?.data.kind === 'asset'
          ? current.data.referenceImages
          : data.referenceImages
      updateNodeData<'asset'>(nodeId, {
        referenceImages: [
          ...referenceImages,
          {
            id: newDirectorId('dr'),
            url: String(reader.result),
            uploadedAt: Date.now(),
          },
        ],
      })
    }
    reader.readAsDataURL(file)
  }

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-4">
      <header className="space-y-2">
        <div className="flex items-center gap-2">
          <span className="inline-block size-2 rounded-full bg-chart-4" />
          <HoverBeam className="min-w-0 flex-1">
            <Input
              value={data.label}
              onChange={(event) =>
                updateNodeData<'asset'>(nodeId, { label: event.target.value })
              }
              className="h-8 border-transparent bg-transparent px-0 text-sm font-medium shadow-none focus-visible:border-border focus-visible:ring-0"
              placeholder={t('Image label')}
            />
          </HoverBeam>
          <span className="shrink-0 rounded-sm border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
            {role}
          </span>
        </div>
      </header>

      <Section title={t('Preview')}>
        <div className="flex aspect-video items-center justify-center overflow-hidden rounded-md border border-border bg-muted/40">
          {data.imageUrl ? (
            <ThumbImage
              src={data.imageUrl}
              alt={data.label}
              className="h-full w-full object-cover"
            />
          ) : (
            <ImageIcon className="size-5 text-muted-foreground" />
          )}
        </div>
      </Section>

      <Section title={t('Prompt')}>
        <HoverBeam>
          <Textarea
            value={data.prompt}
            onChange={(event) =>
              updateNodeData<'asset'>(nodeId, { prompt: event.target.value })
            }
            rows={4}
            placeholder={t('Describe the image to generate')}
          />
        </HoverBeam>
      </Section>

      <Section title={t('Image generation model')}>
        <div className="grid grid-cols-2 gap-2">
          {IMAGE_MODEL_ORDER.map((key) => {
            const spec = IMAGE_MODELS[key]
            const active = normalizeImageModelKey(data.imageModel) === key
            return (
              <button
                key={key}
                type="button"
                onClick={() =>
                  updateNodeData<'asset'>(nodeId, { imageModel: key })
                }
                className={cn(
                  'rounded-md border px-3 py-2 text-left text-xs transition-colors',
                  active
                    ? 'border-primary bg-primary/10'
                    : 'border-border hover:bg-accent',
                )}
                aria-pressed={active}
              >
                <span className="block font-medium">{spec.label}</span>
              </button>
            )
          })}
        </div>
      </Section>

      <Section
        title={t('Reference images ({count})', {
          count: data.referenceImages.length,
        })}
      >
        <div className="flex flex-wrap items-center gap-2">
          {data.referenceImages.map((image) => (
            <div
              key={image.id}
              className="group relative size-16 overflow-hidden rounded-md border border-border"
            >
              <ThumbImage
                src={image.url}
                alt="ref"
                className="h-full w-full object-cover"
              />
              <button
                type="button"
                onClick={() =>
                  updateNodeData<'asset'>(nodeId, {
                    referenceImages: data.referenceImages.filter(
                      (candidate) => candidate.id !== image.id,
                    ),
                  })
                }
                className="absolute right-0.5 top-0.5 rounded-full bg-black/60 p-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100"
                aria-label={t('Remove reference image')}
              >
                <X className="size-3 text-white" />
              </button>
            </div>
          ))}
          <label className="flex size-16 cursor-pointer items-center justify-center rounded-md border border-dashed border-border text-muted-foreground hover:bg-accent">
            <Upload className="size-4" />
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              aria-label={t('Upload reference image')}
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) addReference(file)
                event.target.value = ''
              }}
            />
          </label>
        </div>
      </Section>

      {data.generationError && (
        <p className="text-xs text-destructive">{data.generationError}</p>
      )}

      <Button
        type="button"
        size="sm"
        onClick={() => void generateAssetImage(nodeId)}
        disabled={isGenerating}
        className="mt-auto w-full gap-1.5"
      >
        {isGenerating ? (
          <>
            <Loader2 className="size-3.5 animate-spin" />
            {t('Generating…')}
          </>
        ) : (
          <>
            <ImageIcon className="size-3.5" />
            {data.generationStatus === 'completed'
              ? t('Regenerate image')
              : t('Generate image')}
          </>
        )}
      </Button>
    </div>
  )
}

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="space-y-3 rounded-lg border border-border p-3">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h3>
      {children}
    </section>
  )
}
