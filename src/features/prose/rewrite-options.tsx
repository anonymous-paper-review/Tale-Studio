'use client'

// [AI 다시 쓰기 ▾] 조건 고르기(리뉴얼 1차 2026-10-19, 프로토타입 W3 rwPanel · WC2 condFields).
//   러닝타임 · 글의 장르·분위기 · 아이디어 소재. 지금 산문의 값에 "지금 산문" 표시를 단다.
//   고르기만 해서는 아무것도 바뀌지 않는다 — [이 조건으로 다시 쓰기]를 눌러야 세 가지 안을 쓴다.
import { useState } from 'react'
import { Loader2, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useT } from '@/lib/i18n'
import { useContentLocale } from '@/lib/i18n/content'
import { cn } from '@/lib/utils'
import { MOOD_CHOICES, RUNTIME_CHOICES, SEED_CHOICES, conditionsFromPicks, moodIndexOf, runtimeIndexOf } from '@/lib/prose/conditions'
import type { ProseSeed } from '@/lib/writer/prose-conditions'
import { useGlobalChatStore } from '@/stores/global-chat-store'

export interface RewritePicks {
  runtime: number
  mood: number
  seed: ProseSeed
}

export function currentPicks(conditions: { runtimeSeconds: number | null; genre: string | null; seed: ProseSeed }, locale: Parameters<typeof moodIndexOf>[1]): RewritePicks & { moodKnown: boolean } {
  const mood = moodIndexOf(conditions.genre, locale)
  return { runtime: runtimeIndexOf(conditions.runtimeSeconds), mood: mood >= 0 ? mood : 1, seed: conditions.seed, moodKnown: mood >= 0 }
}

function OptionGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={label}>{children}</div>
    </div>
  )
}

function Option({ on, current, label, detail, onClick }: { on: boolean; current: boolean; label: string; detail?: string; onClick: () => void }) {
  const t = useT()
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      onClick={onClick}
      className={cn(
        'flex flex-col items-start rounded-md border px-2.5 py-1.5 text-left text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        on ? 'border-primary bg-primary/10 text-foreground' : 'border-border text-muted-foreground hover:border-border-strong hover:text-foreground',
      )}
    >
      <span className="flex items-center gap-1.5">
        <span className="font-medium">{label}</span>
        {current ? <span className="rounded-sm bg-muted px-1 text-[10px] text-muted-foreground">{t('Current prose')}</span> : null}
      </span>
      {detail ? <span className="text-[11px] text-muted-foreground">{detail}</span> : null}
    </button>
  )
}

/** 조건 고르기 + [취소] [이 조건으로 다시 쓰기]. 열 때마다 지금 산문의 값으로 시작한다(부모가 열 때 새로 그린다). */
export function RewriteOptions({
  conditions,
  onClose,
  submitLabel,
  className,
}: {
  conditions: { runtimeSeconds: number | null; genre: string | null; seed: ProseSeed }
  onClose: () => void
  submitLabel?: string
  className?: string
}) {
  const t = useT()
  const locale = useContentLocale()
  const start = currentPicks(conditions, locale)
  const [picks, setPicks] = useState<RewritePicks>({ runtime: start.runtime, mood: start.mood, seed: start.seed })
  const [sending, setSending] = useState(false)

  const submit = async () => {
    if (sending) return
    setSending(true)
    try {
      const ok = await useGlobalChatStore.getState().rewriteSceneStory(null, conditionsFromPicks(picks, locale))
      if (!ok) {
        toast.error(useGlobalChatStore.getState().error ?? t('Could not start the rewrite. Please try again.'))
        return
      }
      onClose()
    } finally {
      setSending(false)
    }
  }

  return (
    <div className={cn('space-y-4', className)} data-testid="prose-rewrite-options">
      <OptionGroup label={t('Runtime')}>
        {RUNTIME_CHOICES.map((choice, index) => (
          <Option key={choice.seconds} on={picks.runtime === index} current={conditions.runtimeSeconds === choice.seconds} label={t(choice.label)} onClick={() => setPicks((p) => ({ ...p, runtime: index }))} />
        ))}
      </OptionGroup>
      <OptionGroup label={t('Genre and mood of the prose')}>
        {MOOD_CHOICES.map((mood, index) => (
          <Option key={mood} on={picks.mood === index} current={start.moodKnown && start.mood === index} label={t(mood)} onClick={() => setPicks((p) => ({ ...p, mood: index }))} />
        ))}
      </OptionGroup>
      <OptionGroup label={t('Idea material')}>
        {SEED_CHOICES.map((choice) => (
          <Option key={choice.seed} on={picks.seed === choice.seed} current={conditions.seed === choice.seed} label={t(choice.label)} detail={t(choice.detail)} onClick={() => setPicks((p) => ({ ...p, seed: choice.seed }))} />
        ))}
      </OptionGroup>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onClose} disabled={sending}>{t('Cancel')}</Button>
        <Button size="sm" onClick={() => void submit()} disabled={sending} data-testid="prose-rewrite-submit">
          {sending ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
          {submitLabel ?? t('Rewrite with these conditions')}
        </Button>
      </div>
    </div>
  )
}
