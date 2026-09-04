'use client'

// 타이틀 카드 이미지 고르기 (약속 J6, 2026-09-04, 오너 3안: Artist·Director 에서 만든 것 중 고르거나 내 컴퓨터 파일을 올린다).
//   프로젝트 이미지는 이미 브라우저에 있는 것만 모은다(에셋 저장소의 인물·배경, Writer 러프 첫 장) — 서버 조회 없음.
import { useMemo, useRef, useState } from 'react'
import { Loader2, Upload } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ThumbImage } from '@/components/thumb-image'
import { useAssetStorageStore } from '@/stores/asset-storage-store'
import { useWriterStore } from '@/stores/writer-store'
import { useProjectStore } from '@/stores/project-store'
import { useT } from '@/lib/i18n'

export interface ProjectImageOption {
  id: string
  url: string
  label: string
  group: 'character' | 'world' | 'rough'
}

/** 순수: 스토어 값 → 고를 수 있는 이미지 목록(중복 URL 제거). */
export function collectProjectImages(input: {
  projectId: string | null
  characters: Record<string, { projectId: string; name: string; views: { single: Array<{ url: string }> } }>
  worlds: Record<string, { projectId: string; name: string; views: { single: Array<{ url: string }> } }>
  shots: Array<{ shotId: string; roughStoryboard?: { status: string; frames?: { start: string } } | null }>
}): ProjectImageOption[] {
  const out: ProjectImageOption[] = []
  const seen = new Set<string>()
  const push = (o: ProjectImageOption) => {
    if (!o.url || seen.has(o.url)) return
    seen.add(o.url)
    out.push(o)
  }
  for (const [id, c] of Object.entries(input.characters)) {
    if (input.projectId && c.projectId !== input.projectId) continue
    const url = c.views.single[0]?.url
    if (url) push({ id: `character:${id}`, url, label: c.name, group: 'character' })
  }
  for (const [id, w] of Object.entries(input.worlds)) {
    if (input.projectId && w.projectId !== input.projectId) continue
    const url = w.views.single[0]?.url
    if (url) push({ id: `world:${id}`, url, label: w.name, group: 'world' })
  }
  for (const s of input.shots) {
    const url = s.roughStoryboard?.status === 'completed' ? s.roughStoryboard.frames?.start : undefined
    if (url) push({ id: `rough:${s.shotId}`, url, label: s.shotId, group: 'rough' })
  }
  return out
}

export function TitleImagePicker({
  open,
  onOpenChange,
  onPick,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onPick: (url: string) => void
}) {
  const t = useT()
  const projectId = useProjectStore((s) => s.projectId)
  const characters = useAssetStorageStore((s) => s.characters)
  const worlds = useAssetStorageStore((s) => s.worlds)
  const shots = useWriterStore((s) => s.shots)
  const options = useMemo(() => collectProjectImages({ projectId, characters, worlds, shots }), [projectId, characters, worlds, shots])
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  const upload = async (file: File) => {
    if (!projectId) return
    setUploading(true)
    try {
      const form = new FormData()
      form.set('projectId', projectId)
      form.set('file', file)
      const res = await fetch('/api/editor/title-image', { method: 'POST', body: form })
      const j = (await res.json().catch(() => null)) as { url?: string; error?: string } | null
      if (!res.ok || !j?.url) throw new Error(j?.error ?? `HTTP ${res.status}`)
      onPick(j.url)
      onOpenChange(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('Upload failed'))
    } finally {
      setUploading(false)
    }
  }

  const groupLabel: Record<ProjectImageOption['group'], string> = {
    character: t('Characters'),
    world: t('Backgrounds'),
    rough: t('Rough storyboard'),
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('Put an image on the title card')}</DialogTitle>
          <DialogDescription>{t('Pick one made in Artist or Director, or upload a file from your computer.')}</DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              e.target.value = ''
              if (f) void upload(f)
            }}
          />
          <Button size="sm" variant="outline" disabled={uploading} onClick={() => fileRef.current?.click()}>
            {uploading ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
            {t('Upload from my computer')}
          </Button>
        </div>
        {(['character', 'world', 'rough'] as const).map((group) => {
          const items = options.filter((o) => o.group === group)
          if (!items.length) return null
          return (
            <section key={group} className="space-y-1.5">
              <h3 className="text-xs font-medium text-muted-foreground">{groupLabel[group]}</h3>
              <div className="grid grid-cols-4 gap-2">
                {items.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    className="group overflow-hidden rounded-md border border-border text-left hover:border-primary"
                    onClick={() => {
                      onPick(o.url)
                      onOpenChange(false)
                    }}
                    title={o.label}
                  >
                    <ThumbImage src={o.url} alt={o.label} className="aspect-video w-full object-cover" />
                    <span className="block truncate px-1.5 py-1 text-[11px] text-muted-foreground group-hover:text-foreground">{o.label}</span>
                  </button>
                ))}
              </div>
            </section>
          )
        })}
        {options.length === 0 && (
          <p className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">
            {t('No project images yet. Upload a file instead.')}
          </p>
        )}
      </DialogContent>
    </Dialog>
  )
}
