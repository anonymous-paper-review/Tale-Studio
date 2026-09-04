'use client'

import { useState } from 'react'
import { Loader2, Plus } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useArtistStore } from '@/stores/artist-store'
import type { NarrativeTime } from '@/types/asset'
import { cn } from '@/lib/utils'
import { useT } from '@/lib/i18n'

const TIMES: NarrativeTime[] = ['past', 'present', 'future']
export const NARRATIVE_TIME_LABELS: Record<NarrativeTime, string> = {
  past: 'Past',
  present: 'Present',
  future: 'Future',
}

/**
 * "+ 모습 추가"(약속 C2, 2026-09-04) — 이름·시점(과거/현재/미래)·외형을 적고 저장하면 새 탭이 생기고,
 *   오너 결정(C4)대로 이미지가 바로 만들어진다(기본 모습 얼굴을 참조). 기본 모습 이미지가 없으면 서버가 거부한다.
 */
export function AppearanceCreateDialog({
  charId,
  onClose,
}: {
  charId: string | null
  onClose: () => void
}) {
  const t = useT()
  const char = useArtistStore((s) => s.characterAssets.find((c) => c.characterId === charId))
  const createAppearance = useArtistStore((s) => s.createAppearance)
  const [label, setLabel] = useState('')
  const [time, setTime] = useState<NarrativeTime>('past')
  const [appearance, setAppearance] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const open = !!charId && !!char
  const sameTimeExists = !!char?.appearances.some((a) => a.narrativeTime === time)
  const canSave = !!label.trim() && !!appearance.trim() && !saving

  const submit = async () => {
    if (!char || !canSave) return
    setSaving(true)
    setError(null)
    try {
      await createAppearance(char.characterId, label.trim(), appearance.trim(), time, { generate: true, actor: 'ui' })
      setLabel('')
      setAppearance('')
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
          <DialogTitle className="text-sm">{t('Add an appearance for {name}', { name: char?.name ?? '' })}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="mb-1.5 block text-xs text-muted-foreground">{t('Appearance name')}</label>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={t('E.g. Younger days, Injured')} />
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
                {t('An appearance for this time already exists. Writer picks the default one automatically.')}
              </p>
            )}
          </div>
          <div>
            <label className="mb-1.5 block text-xs text-muted-foreground">{t('Appearance (what changes from the default look)')}</label>
            <Textarea value={appearance} onChange={(e) => setAppearance(e.target.value)} rows={4} placeholder={t('E.g. gray hair, a scar across the left eye, worn leather coat')} />
          </div>
          <p className="text-[10px] text-muted-foreground">
            {t('Saving creates the tab and generates its image right away, using the default appearance as the face reference.')}
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
