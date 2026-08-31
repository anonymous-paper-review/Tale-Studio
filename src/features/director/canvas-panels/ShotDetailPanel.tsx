'use client'

import { useMemo } from 'react'
import { ImageIcon, Loader2, Trash2, Upload, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { HoverBeam } from '@/components/hover-beam'
import { Input } from '@/components/ui/input'
import { ThumbImage } from '@/components/thumb-image'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { effectivePrompt, useDirectorCanvasStore } from '@/stores/director-store'
import { useAssetStorageStore } from '@/stores/asset-storage-store'
import { newDirectorId, type ShotNodeData } from '@/types/director'
import {
  IMAGE_MODELS,
  IMAGE_MODEL_ORDER,
  normalizeImageModel,
} from '@/lib/image-models'
import { useT } from '@/lib/i18n'

type Props = {
  nodeId: string
  data: ShotNodeData
}

export function ShotDetailPanel({ nodeId, data }: Props) {
  const t = useT()
  const updateNodeData = useDirectorCanvasStore((s) => s.updateNodeData)
  const generateStoryboardImage = useDirectorCanvasStore(
    (s) => s.generateStoryboardImage,
  )
  const openDeleteConfirm = useDirectorCanvasStore(
    (s) => s.openDeleteConfirm,
  )
  const projectId = useDirectorCanvasStore((s) => s.projectId)
  const characterRecords = useAssetStorageStore((s) => s.characters)
  const worldRecords = useAssetStorageStore((s) => s.worlds)

  const projectCharacters = useMemo(
    () => Object.values(characterRecords).filter((c) => c.projectId === projectId),
    [characterRecords, projectId],
  )
  const projectWorlds = useMemo(
    () => Object.values(worldRecords).filter((w) => w.projectId === projectId),
    [worldRecords, projectId],
  )

  const isGenerating = useDirectorCanvasStore(
    (s) => !!s.generatingNodeIds[nodeId],
  )
  const generationError = useDirectorCanvasStore(
    (s) => s.generationErrors[nodeId],
  )

  const toggleCharacter = (id: string) => {
    const next = data.characterAssetIds.includes(id)
      ? data.characterAssetIds.filter((x) => x !== id)
      : [...data.characterAssetIds, id]
    updateNodeData<'shot'>(nodeId, { characterAssetIds: next })
  }

  const toggleWorld = (id: string) => {
    const next = data.worldAssetIds.includes(id)
      ? data.worldAssetIds.filter((x) => x !== id)
      : [...data.worldAssetIds, id]
    updateNodeData<'shot'>(nodeId, { worldAssetIds: next })
  }

  const handleAddReferenceImage = (file: File) => {
    const reader = new FileReader()
    reader.onload = () => {
      const url = String(reader.result)
      updateNodeData<'shot'>(nodeId, {
        referenceImages: [
          ...data.referenceImages,
          { id: newDirectorId('dr'), url, uploadedAt: Date.now() },
        ],
      })
    }
    reader.readAsDataURL(file)
  }

  const handleRemoveRef = (id: string) => {
    updateNodeData<'shot'>(nodeId, {
      referenceImages: data.referenceImages.filter((r) => r.id !== id),
    })
  }

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-4">
      <header className="space-y-2">
        <div className="flex items-center gap-2">
          <span className="inline-block size-2 rounded-full bg-chart-4" />
          <HoverBeam className="min-w-0 flex-1">
            <Input
              value={data.label}
              onChange={(e) =>
                updateNodeData<'shot'>(nodeId, { label: e.target.value })
              }
              className="h-8 border-transparent bg-transparent px-0 text-sm font-medium shadow-none focus-visible:border-border focus-visible:ring-0"
              placeholder={t('Shot label')}
            />
          </HoverBeam>
        </div>
      </header>

      <Section title="Prompt">
        <Field label={t('Prompt (for video generation)')}>
          <HoverBeam>
            <Textarea
              value={effectivePrompt(data)}
              onChange={(e) =>
                updateNodeData<'shot'>(nodeId, { promptOverride: e.target.value })
              }
              rows={4}
              placeholder={t('Action, mood, camera intent, etc. happening in this shot')}
            />
          </HoverBeam>
        </Field>
      </Section>

      <Section title="Model">
        {/* #image-model-select 2026-08-31: fal.ai 카탈로그 기준 실제 선택. */}
        <Field label={t('Image generation model')}>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {IMAGE_MODEL_ORDER.map((key) => {
              const spec = IMAGE_MODELS[key]
              const active = normalizeImageModel(data.imageModel) === key
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => updateNodeData<'shot'>(nodeId, { imageModel: key })}
                  className={cn(
                    'rounded-md border px-3 py-2 text-left text-xs transition-colors',
                    active
                      ? 'border-primary bg-primary/10'
                      : 'border-border hover:bg-accent',
                  )}
                >
                  <span className="block font-medium">{spec.label}</span>
                  <span className="block truncate font-mono text-[10px] text-muted-foreground">
                    {spec.endpoint}
                  </span>
                </button>
              )
            })}
          </div>
        </Field>
        <div className="grid grid-cols-3 gap-2">
          <Field label="Aspect Ratio">
            {/* 추후 영속 필요 */}
            <HoverBeam>
              <Input value="16:9" disabled readOnly />
            </HoverBeam>
          </Field>
          <Field label="Resolution">
            {/* 추후 영속 필요 */}
            <HoverBeam>
              <Input placeholder="default" disabled />
            </HoverBeam>
          </Field>
          <Field label="Batch Size">
            {/* 추후 영속 필요 */}
            <HoverBeam>
              <Input placeholder="1" disabled />
            </HoverBeam>
          </Field>
        </div>
      </Section>

      <Section title="References">
        <Field label={t('Reference images ({count})', { count: data.referenceImages.length })}>
          <div className="flex flex-wrap items-center gap-2">
            {data.referenceImages.map((img) => (
              <div
                key={img.id}
                className="group relative h-16 w-16 overflow-hidden rounded-md border border-border"
              >
                <ThumbImage src={img.url} alt="ref" className="h-full w-full object-cover" />
                <button
                  type="button"
                  onClick={() => handleRemoveRef(img.id)}
                  className="absolute right-0.5 top-0.5 rounded-full bg-black/60 p-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100"
                  aria-label={t('Remove reference image')}
                >
                  <X className="size-3 text-white" />
                </button>
              </div>
            ))}
            <label className="flex h-16 w-16 cursor-pointer items-center justify-center rounded-md border border-dashed border-border text-muted-foreground hover:bg-accent">
              <Upload className="size-4" />
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                aria-label={t('Upload reference image')}
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) handleAddReferenceImage(file)
                  e.target.value = ''
                }}
              />
            </label>
          </div>
        </Field>
      </Section>

      <Section title="Cast">
        <Field
          label={t('Characters ({count}/{total})', {
            count: data.characterAssetIds.length,
            total: projectCharacters.length,
          })}
        >
          {projectCharacters.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              {t('Characters you Register in Artist will appear here.')}
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {projectCharacters.map((c) => {
                const active = data.characterAssetIds.includes(c.id)
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => toggleCharacter(c.id)}
                    className={cn(
                      'rounded-full border px-2.5 py-1 text-xs transition-colors',
                      active
                        ? 'border-primary bg-primary/10 text-foreground'
                        : 'border-border text-muted-foreground hover:bg-accent',
                    )}
                  >
                    {c.name || c.alias || c.id}
                  </button>
                )
              })}
            </div>
          )}
        </Field>
      </Section>

      <Section title="World">
        <Field
          label={t('World / locations ({count}/{total})', {
            count: data.worldAssetIds.length,
            total: projectWorlds.length,
          })}
        >
          {projectWorlds.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              {t('Locations you Register in Artist will appear here.')}
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {projectWorlds.map((w) => {
                const active = data.worldAssetIds.includes(w.id)
                return (
                  <button
                    key={w.id}
                    type="button"
                    onClick={() => toggleWorld(w.id)}
                    className={cn(
                      'rounded-full border px-2.5 py-1 text-xs transition-colors',
                      active
                        ? 'border-primary bg-primary/10 text-foreground'
                        : 'border-border text-muted-foreground hover:bg-accent',
                    )}
                  >
                    {w.name || w.alias || w.id}
                  </button>
                )
              })}
            </div>
          )}
        </Field>
      </Section>

      {generationError && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {generationError}
        </div>
      )}

      <div className="mt-auto flex flex-col gap-2 border-t border-border pt-3">
        <Button
          type="button"
          size="sm"
          onClick={() => void generateStoryboardImage(nodeId)}
          disabled={isGenerating}
          className="w-full gap-1.5"
        >
          {isGenerating ? (
            <>
              <Loader2 className="size-3.5 animate-spin" />
              Generating…
            </>
          ) : (
            <>
              <ImageIcon className="size-3.5" />
              {data.storyboardImage?.status === 'completed'
                ? t('Regenerate image')
                : t('Generate image')}
            </>
          )}
        </Button>
        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => openDeleteConfirm(nodeId)}
            className="gap-1.5 text-destructive hover:text-destructive"
          >
            <Trash2 className="size-3.5" />
            {t('Delete')}
          </Button>
        </div>
      </div>
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

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs text-muted-foreground">{label}</label>
      {children}
    </div>
  )
}
