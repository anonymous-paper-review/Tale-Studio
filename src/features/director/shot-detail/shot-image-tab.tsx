'use client'

// 샷 상세의 이미지 탭(디자이너 11/13 시안 D6, 오너 2026-11-14 답 5번) — 시작 · 끝 그림을 나란히, 설정은 한 화면
//   (바꾸고 싶은 점 · 프롬프트 · 이미지 모델 · 비율 · 해상도 · 개수 · 참고 이미지 · 등장인물 · 장소). "고치기 / 설정" 탭은 없다.
//   1단계 다시 만들기는 지금처럼 시작 · 끝 함께 — 고르기 표시는 둘 다 고른 채 잠가 둔다. 모델 칸은 실제로 도는 것만.
//   규칙: lib/director/shot-detail · 약속: tests/director/shot-detail.test.ts · shot-detail-view.test.ts
import { useMemo, useState } from 'react'
import { Trash2, Upload, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { ThumbImage } from '@/components/thumb-image'
import { useImageUploadConsent } from '@/components/upload/image-upload-consent'
import { cn } from '@/lib/utils'
import { useT } from '@/lib/i18n'
import { IMAGE_MODELS, normalizeImageModelKey } from '@/lib/image-models'
import { detailImageModels, shotDetailFrames } from '@/lib/director/shot-detail'
import { mediaFrameStyle } from '@/lib/project-aspect'
import { useProjectFormatStore } from '@/stores/project-format-store'
import { useAssetStorageStore } from '@/stores/asset-storage-store'
import { effectivePrompt, useDirectorCanvasStore } from '@/stores/director-store'
import { aspectRatioFromFormat } from '@/types/project'
import { newDirectorId, type ShotNodeData } from '@/types/director'
import { StoryboardImageButton } from '@/features/director/storyboard-image-button'
import { LockedFrame } from './locked-frame'

export function ShotImageTab({ nodeId, data, layout, onMakeVideo }: {
  nodeId: string
  data: ShotNodeData
  layout: 'popup' | 'panel'
  /** [다음: 영상 만들기] — 영상 탭으로 옮겨 새 Take 를 만든다. */
  onMakeVideo?: () => void
}) {
  const t = useT()
  const projectFormat = useProjectFormatStore((s) => s.format)
  const { requestImageUploadConsent, imageUploadConsentDialog } = useImageUploadConsent(nodeId)
  const updateNodeData = useDirectorCanvasStore((s) => s.updateNodeData)
  const openDeleteConfirm = useDirectorCanvasStore((s) => s.openDeleteConfirm)
  const projectId = useDirectorCanvasStore((s) => s.projectId)
  const generationError = useDirectorCanvasStore((s) => data.storyboardImage?.errorMessage || s.generationErrors[nodeId])
  const characterRecords = useAssetStorageStore((s) => s.characters)
  const worldRecords = useAssetStorageStore((s) => s.worlds)
  const characters = useMemo(() => Object.values(characterRecords).filter((c) => c.projectId === projectId), [characterRecords, projectId])
  const worlds = useMemo(() => Object.values(worldRecords).filter((w) => w.projectId === projectId), [worldRecords, projectId])
  const [change, setChange] = useState('')
  const frames = shotDetailFrames(data.storyboardImage)
  const hasImage = !!frames.start
  const frameStyle = mediaFrameStyle(projectFormat, layout === 'popup' ? 360 : 200)
  const model = normalizeImageModelKey(data.imageModel)

  const toggle = (field: 'characterAssetIds' | 'worldAssetIds', id: string) => {
    const list = data[field]
    updateNodeData<'shot'>(nodeId, { [field]: list.includes(id) ? list.filter((x) => x !== id) : [...list, id], referenceOverride: true })
  }
  const addReference = async (file: File) => {
    if (!(await requestImageUploadConsent([file]))) return
    const reader = new FileReader()
    reader.onload = () => {
      updateNodeData<'shot'>(nodeId, { referenceImages: [...data.referenceImages, { id: newDirectorId('dr'), url: String(reader.result), uploadedAt: Date.now() }] })
    }
    reader.readAsDataURL(file)
  }

  const framesBlock = (
    <div className="space-y-2" data-testid="shot-detail-frames">
      <div className="grid grid-cols-2 gap-3">
        {(['start', 'end'] as const).map((which) => <LockedFrame key={which} which={which} url={frames[which]} style={frameStyle} />)}
      </div>
      <p className="text-caption text-subtle-foreground">{t('Start and end images are remade together for now.')}</p>
    </div>
  )

  const settings = (
    <div className="space-y-4" data-testid="shot-detail-settings">
      <Field label={t('What to change')} hint={t('Leave it empty to remake with the settings below')}>
        <Textarea value={change} onChange={(e) => setChange(e.target.value)} rows={2} placeholder={t('Write only what you want to change in the picture. The rest stays as it is (e.g. show the umbrella handle, keep the face).')} />
      </Field>
      <Field label={t('Prompt')}>
        <Textarea value={effectivePrompt(data)} onChange={(e) => updateNodeData<'shot'>(nodeId, { promptOverride: e.target.value })} rows={3} />
      </Field>
      <Field label={t('Image model')}>
        <div className="grid grid-cols-2 gap-2">
          {detailImageModels(data).map((key) => {
            const active = model === key
            return (
              <button key={key} type="button" aria-pressed={active} onClick={() => updateNodeData<'shot'>(nodeId, { imageModel: key })}
                className={cn('rounded-[10px] border px-3 py-2 text-left text-body transition-colors', active ? 'border-info bg-info/15' : 'border-border hover:bg-accent')}>
                {IMAGE_MODELS[key].label}
              </button>
            )
          })}
        </div>
      </Field>
      <div className="grid grid-cols-3 gap-3 text-caption">
        <ReadOnly label={t('Aspect ratio')} value={projectFormat ? aspectRatioFromFormat(projectFormat) : '16:9'} />
        <ReadOnly label={t('Resolution')} value={t('Default')} />
        <ReadOnly label={t('Count')} value="1" />
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-3">
        <Field label={t('Reference images ({count})', { count: data.referenceImages.length })}>
          <div className="flex flex-wrap items-center gap-2">
            {data.referenceImages.map((img) => (
              <div key={img.id} className="group relative size-12 overflow-hidden rounded-md border border-border">
                <ThumbImage src={img.url} alt="ref" className="size-full object-cover" />
                <button type="button" aria-label={t('Remove reference image')} onClick={() => updateNodeData<'shot'>(nodeId, { referenceImages: data.referenceImages.filter((r) => r.id !== img.id) })}
                  className="absolute right-0.5 top-0.5 rounded-full bg-background/80 p-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100">
                  <X className="size-3" />
                </button>
              </div>
            ))}
            <label className="flex size-12 cursor-pointer items-center justify-center rounded-md border border-dashed border-border text-muted-foreground hover:bg-accent">
              <Upload className="size-4" />
              <input type="file" accept="image/*" className="sr-only" aria-label={t('Upload reference image')}
                onChange={(e) => { const file = e.target.files?.[0]; if (file) void addReference(file); e.target.value = '' }} />
            </label>
          </div>
        </Field>
        <Field label={t('People ({count}/{total})', { count: data.characterAssetIds.length, total: characters.length })}>
          <Chips items={characters.map((c) => ({ id: c.id, label: c.name || c.alias || c.id }))} selected={data.characterAssetIds} onToggle={(id) => toggle('characterAssetIds', id)} empty={t('Characters you Register in Artist will appear here.')} />
        </Field>
        <Field label={t('Places ({count}/{total})', { count: data.worldAssetIds.length, total: worlds.length })}>
          <Chips items={worlds.map((w) => ({ id: w.id, label: w.name || w.alias || w.id }))} selected={data.worldAssetIds} onToggle={(id) => toggle('worldAssetIds', id)} empty={t('Locations you Register in Artist will appear here.')} />
        </Field>
      </div>
      {generationError ? <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-caption text-destructive">{generationError}</p> : null}
      <div className="flex flex-wrap items-center gap-2" data-testid="shot-detail-image-actions">
        <StoryboardImageButton nodeId={nodeId} data={data} changeNote={change} idleLabel={t(hasImage ? 'Remake start and end images · Takes 0' : 'Make start and end images · Takes 0')} />
        {hasImage && onMakeVideo ? (
          <Button type="button" size="sm" variant="outline" onClick={onMakeVideo}>{t('Next: make the video')}</Button>
        ) : null}
        <Button type="button" size="sm" variant="ghost" className="gap-1.5 text-destructive hover:text-destructive" onClick={() => openDeleteConfirm(nodeId)}>
          <Trash2 className="size-3.5" />{t('Delete')}
        </Button>
      </div>
    </div>
  )

  return (
    <div className={cn(layout === 'popup' ? 'grid grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] gap-8' : 'flex flex-col gap-5')} data-testid="shot-detail-image-tab">
      {imageUploadConsentDialog}
      {framesBlock}
      {settings}
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="text-body font-semibold">{label}{hint ? <span className="ml-2 text-caption font-normal text-subtle-foreground">{hint}</span> : null}</p>
      {children}
    </div>
  )
}

function ReadOnly({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <p className="text-subtle-foreground">{label}</p>
      <p className="text-muted-foreground">{value}</p>
    </div>
  )
}

function Chips({ items, selected, onToggle, empty }: { items: Array<{ id: string; label: string }>; selected: string[]; onToggle: (id: string) => void; empty: string }) {
  if (items.length === 0) return <p className="text-caption text-subtle-foreground">{empty}</p>
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item) => {
        const active = selected.includes(item.id)
        return (
          <button key={item.id} type="button" aria-pressed={active} onClick={() => onToggle(item.id)}
            className={cn('rounded-full border px-3 py-1 text-caption transition-colors', active ? 'border-info bg-info/15 text-foreground' : 'border-border text-muted-foreground hover:bg-accent')}>
            {item.label}
          </button>
        )
      })}
    </div>
  )
}
