'use client'

// Writer 로 넘기기 전 확정 창(2026-10-01 오너 "producer 완성 시 잠그기 (writer로 넘어갈 때 경고 팝업)").
//   넘기면 Producer 가 영구히 읽기 전용이 된다 — 무엇이 확정되는지 값을 보여 주고, "확정할게요"를 체크해야 넘긴다.
//   실제 넘김은 global-chat-store.confirmProducerLock(넘김 문장을 채팅에 남기고 Writer 시작).
import { useState } from 'react'
import { Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { FORMAT_OPTIONS, LANGUAGE_OPTIONS } from '@/features/producer/quest-journal'
import { useT } from '@/lib/i18n'
import { useGlobalChatStore } from '@/stores/global-chat-store'
import { useProjectStore } from '@/stores/project-store'
import { useProducerStore } from '@/stores/producer-store'

function Row({ label, value }: { label: string; value: string | null }) {
  const t = useT()
  return (
    <div className="flex items-baseline gap-4 px-4 py-2.5 text-sm">
      <span className="w-36 shrink-0 text-xs text-muted-foreground">{label}</span>
      <span className={value ? 'min-w-0 flex-1 truncate font-medium' : 'min-w-0 flex-1 text-muted-foreground'}>
        {value || t('Empty')}
      </span>
    </div>
  )
}

export function ProducerLockDialog({ open }: { open: boolean }) {
  const t = useT()
  const settings = useProducerStore((s) => s.projectSettings)
  const storyText = useProducerStore((s) => s.storyText)
  const preserveScript = useProducerStore((s) => s.preserveScript)
  const cast = useProducerStore((s) => s.cast)
  const backgrounds = useProducerStore((s) => s.backgrounds)
  const styleAnchors = useProducerStore((s) => s.styleAnchors)
  const styleAnchorKey = useProducerStore((s) => s.styleAnchorKey)
  const customStyleAnchor = useProducerStore((s) => s.customStyleAnchor)
  const confirmProducerLock = useGlobalChatStore((s) => s.confirmProducerLock)
  const closeHandoffConfirm = useGlobalChatStore((s) => s.closeHandoffConfirm)
  const [agreed, setAgreed] = useState(false)
  // 넘기기 전 트리트먼트 초안(2026-10-02 시안 v04) — 이미 쓴 트리트먼트를 확정하고 나머지를 이어 간다.
  const treatmentDraft = useProjectStore((s) => s.treatmentDraft)

  const styleLabel = styleAnchors.find((a) => a.key === styleAnchorKey)?.label ?? customStyleAnchor?.label ?? null
  const genre = [settings.genre, settings.subGenre].filter(Boolean).join(' · ')
  const persons = cast.filter((m) => m.entityType === 'person').length
  const storyValue = storyText.trim()
    ? preserveScript === true
      ? t('Original script kept as written ({count} characters)', { count: storyText.trim().length })
      : t('{count} characters', { count: storyText.trim().length })
    : null

  const close = () => {
    setAgreed(false)
    closeHandoffConfirm()
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? null : close())}>
      <DialogContent className="sm:max-w-xl" data-testid="producer-lock-dialog">
        <DialogHeader>
          <DialogTitle>{t('Confirm before handing over to Writer')}</DialogTitle>
          <DialogDescription>
            {treatmentDraft
              ? t('The treatment on this screen is confirmed as it is, and Writer makes the rest from it. These values are confirmed when you hand over.')
              : t('Writer first drafts the scene story on this screen. You review it and confirm before the rest is made. These values are confirmed when you hand over.')}
          </DialogDescription>
        </DialogHeader>

        <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
          <Row label={t('Story')} value={storyValue} />
          <Row label={t('Style')} value={styleLabel} />
          <Row label={t('Genre')} value={genre || null} />
          <Row label={t('Tone')} value={settings.tone.length ? settings.tone.join(', ') : null} />
          <Row
            label={t('Dialogue language')}
            value={LANGUAGE_OPTIONS.find((o) => o.value === settings.dialogueLanguage)?.label ?? null}
          />
          <Row label={t('Format')} value={FORMAT_OPTIONS.find((o) => o.value === settings.format)?.label ?? null} />
          <Row label={t('Runtime')} value={settings.playtime ? t('{sec}s', { sec: settings.playtime }) : null} />
          <Row
            label={t('Cast and backgrounds')}
            value={t('{people} people · {backgrounds} backgrounds', { people: persons, backgrounds: backgrounds.length })}
          />
        </div>

        <div className="flex gap-3 rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm">
          <Lock className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
          <p className="leading-relaxed">
            {t('After handing over, Producer becomes read only and cannot be unlocked. To change these values, start a new project.')}
          </p>
        </div>

        <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-border px-4 py-3 text-sm">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="size-4 accent-primary"
            data-testid="producer-lock-agree"
          />
          <span>{t('I confirm these values as they are')}</span>
        </label>

        <DialogFooter>
          <Button variant="outline" onClick={close}>
            {t('Keep editing')}
          </Button>
          <Button
            disabled={!agreed}
            onClick={() => {
              setAgreed(false)
              void confirmProducerLock()
            }}
            data-testid="producer-lock-confirm"
          >
            {t('Confirm and hand over')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
