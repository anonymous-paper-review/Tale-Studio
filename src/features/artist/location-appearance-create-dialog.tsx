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
 * 배경 "+ 모습 추가"(약속 C10, 2026-09-04) — 캐릭터의 appearance-create-dialog 와 같은 창.
 *   저장하면 변형 행이 생기고 기본 모습 이미지를 참조해 이미지가 바로 만들어진다(오너 C4).
 */
export function LocationAppearanceCreateDialog({
  locationId,
  onClose,
}: {
  locationId: string | null
  onClose: () => void
}) {
  const t = useT()
  const world = useArtistStore((s) => s.worldAssets.find((w) => w.locationId === locationId))
  const createLocationAppearance = useArtistStore((s) => s.createLocationAppearance)
  const [label, setLabel] = useState('')
  const [time, setTime] = useState<NarrativeTime>('past')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const open = !!locationId && !!world
  const sameTimeExists = !!world?.appearances?.some((a) => a.narrativeTime === time)
  const canSave = !!label.trim() && !!description.trim() && !saving

  const submit = async () => {
    if (!world || !canSave) return
    setSaving(true)
    setError(null)
    try {
      await createLocationAppearance(world.locationId, label.trim(), description.trim(), time, { generate: true, actor: 'ui' })
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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm">{t('Add an appearance for {name}', { name: world?.name ?? '' })}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="mb-1.5 block text-xs text-muted-foreground">{t('Appearance name')}</label>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={t('E.g. Ruined, In winter, Before the war')} />
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
            <label className="mb-1.5 block text-xs text-muted-foreground">{t('Background description (what changes from the default)')}</label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} placeholder={t('E.g. the same market, but burned out and abandoned under snow')} />
          </div>
          <p className="text-[10px] text-muted-foreground">
            {t('Saving creates the tab and generates its image right away, using the default background as the reference.')}
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
