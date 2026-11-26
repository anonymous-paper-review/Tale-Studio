'use client'

import { useState } from 'react'
import { Loader2, Plus } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useArtistStore } from '@/stores/artist-store'
import { NARRATIVE_TIME_LABELS } from '@/features/artist/appearance-create-dialog'
import type { NarrativeTime } from '@/types/asset'
import { cn } from '@/lib/utils'
import { useT } from '@/lib/i18n'

const TIMES: NarrativeTime[] = ['past', 'present', 'future']

/**
 * 소품 "+ 모습 추가"(m1126 A3, 오너 2026-11-26 "소품 모습 추가 버튼 만들기") — 배경의 location-appearance-create-dialog 와 같은 창.
 *   저장하면 모습 칸이 생기고, 기본 그림을 같은 물건의 참고로 그 모습 그림을 바로 그린다(그림은 무료 — Take 없음).
 */
export function PropAppearanceCreateDialog({ propId, onClose }: { propId: string | null; onClose: () => void }) {
  const t = useT()
  const prop = useArtistStore((s) => s.propAssets.find((p) => p.propId === propId))
  const createPropAppearance = useArtistStore((s) => s.createPropAppearance)
  const [label, setLabel] = useState('')
  const [time, setTime] = useState<NarrativeTime>('past')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const open = !!propId && !!prop
  const sameTimeExists = !!prop?.appearances?.some((a) => a.narrativeTime === time)
  const canSave = !!label.trim() && !!description.trim() && !saving

  const submit = async () => {
    if (!prop || !canSave) return
    setSaving(true)
    setError(null)
    try {
      await createPropAppearance(prop.propId, label.trim(), description.trim(), time, { generate: true, actor: 'ui' })
      setLabel('')
      setDescription('')
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent data-testid="prop-appearance-create">
        <DialogHeader>
          <DialogTitle>{t('Add an appearance for {name}', { name: prop?.name ?? '' })}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="mb-1.5 block text-xs text-muted-foreground">{t('Appearance name')}</label>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={t('E.g. Broken, Rusty, Opened')} />
          </div>
          <div>
            <label className="mb-1.5 block text-xs text-muted-foreground">{t('When in the story')}</label>
            <div className="grid grid-cols-3 gap-2">
              {TIMES.map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setTime(key)}
                  className={cn(
                    'rounded-md border px-3 py-1.5 text-xs transition-colors',
                    time === key ? 'border-primary bg-primary/10' : 'border-border hover:bg-accent',
                  )}
                >
                  {t(NARRATIVE_TIME_LABELS[key])}
                </button>
              ))}
            </div>
            {sameTimeExists && (
              <p className="mt-1 text-[10px] text-muted-foreground">
                {t('An appearance for this time already exists. Scenes of this time use the first one that has an image.')}
              </p>
            )}
          </div>
          <div>
            <label className="mb-1.5 block text-xs text-muted-foreground">{t('Prop description (what changes from the default)')}</label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} placeholder={t('E.g. the same sword, but snapped in half and rusted')} />
          </div>
          <p className="text-[10px] text-muted-foreground">
            {t('Saving creates the tab and draws its image right away, using the default prop image as the reference.')}
          </p>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <Button className="w-full" disabled={!canSave} onClick={() => void submit()}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            {t('Add appearance and generate image')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
