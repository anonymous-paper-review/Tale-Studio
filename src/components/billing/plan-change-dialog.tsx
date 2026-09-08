'use client'

// 플랜 변경 확인창 (#payments-phase-3 P15). 결제창을 안 띄우고 저장된 카드로 바로 청구하므로,
//   무엇이 얼마에 어떻게 바뀌는지 누르기 전에 보여야 한다 — 오늘 낼 금액 · 새 갱신일 · 합산 Take.
//   판정과 청구는 서버(/api/billing/change-plan)가 한다. 이 화면은 확인만 받는다.
//   하위 플랜은 지금 결제가 없고 다음 갱신일부터라, 그 문장만 보인다(09-07 오너 확정).

import { useState } from 'react'
import { toast } from 'sonner'
import { useT, useLocale } from '@/lib/i18n'
import { fetchTakeBalance } from '@/lib/billing/use-take-balance'
import { refetchBillingAccount } from '@/lib/billing/use-billing-account'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

export interface PlanChangePreview {
  targetPlan: string
  targetPlanName: string
  direction: 'upgrade' | 'downgrade'
  /** 오늘 카드에서 빠지는 금액(달러). 하위면 0. */
  chargeTodayUsd: number
  /** 상위면 오늘+1개월. 하위면 null(갱신일 안 바뀜). */
  nextBilledAt: string | null
  /** 이번에 들어오는 새 플랜 Take. */
  takesAdded: number
  /** 지금 남아 있는 Take. 상위 변경이면 그대로 얹힌다(이월형). */
  currentBalance: number | null
}

function formatDate(iso: string, locale: string): string {
  return new Date(iso).toLocaleDateString(locale === 'ko' ? 'ko-KR' : 'en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

export function PlanChangeDialog({
  preview,
  open,
  onOpenChange,
}: {
  preview: PlanChangePreview | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useT()
  const locale = useLocale()
  const [pending, setPending] = useState(false)
  if (!preview) return null

  const isUpgrade = preview.direction === 'upgrade'
  const total = (preview.currentBalance ?? 0) + preview.takesAdded

  async function confirm() {
    if (!preview) return
    setPending(true)
    try {
      const res = await fetch('/api/billing/change-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: preview.targetPlan }),
      })
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string }
      if (!res.ok || !body.ok) {
        toast.error(t('Could not change your plan. Please try again in a moment.'))
        return
      }
      onOpenChange(false)
      if (isUpgrade) {
        await Promise.all([fetchTakeBalance(), refetchBillingAccount()])
        toast.success(t('You are on {plan} now.', { plan: preview.targetPlanName }))
      } else {
        await refetchBillingAccount()
        toast.success(t('Your plan changes on your next renewal date.'))
      }
    } catch {
      toast.error(t('Could not change your plan. Please try again in a moment.'))
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isUpgrade
              ? t('Switch to {plan}?', { plan: preview.targetPlanName })
              : t('Move down to {plan}?', { plan: preview.targetPlanName })}
          </DialogTitle>
          <DialogDescription>
            {isUpgrade
              ? t('We charge your saved card right away. No checkout window.')
              : t('Nothing is charged today.')}
          </DialogDescription>
        </DialogHeader>

        <dl className="space-y-3 text-sm">
          {isUpgrade ? (
            <>
              <div className="flex items-baseline justify-between gap-4">
                <dt className="text-muted-foreground">{t('You pay today')}</dt>
                <dd className="font-semibold tabular-nums">${preview.chargeTodayUsd}</dd>
              </div>
              {preview.nextBilledAt ? (
                <div className="flex items-baseline justify-between gap-4">
                  <dt className="text-muted-foreground">{t('Next renewal')}</dt>
                  <dd className="tabular-nums">{formatDate(preview.nextBilledAt, locale)}</dd>
                </div>
              ) : null}
              <div className="flex items-baseline justify-between gap-4">
                <dt className="text-muted-foreground">{t('Takes after the switch')}</dt>
                <dd className="tabular-nums">
                  {preview.currentBalance !== null
                    ? t('{total} ({kept} kept + {added} new)', {
                        total,
                        kept: preview.currentBalance,
                        added: preview.takesAdded,
                      })
                    : t('{added} new', { added: preview.takesAdded })}
                </dd>
              </div>
            </>
          ) : (
            <div className="text-muted-foreground">
              {t('Your current plan runs until your renewal date. {plan} starts after that.', {
                plan: preview.targetPlanName,
              })}
            </div>
          )}
        </dl>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
            {t('Cancel')}
          </Button>
          <Button onClick={confirm} disabled={pending}>
            {pending
              ? t('Working…')
              : isUpgrade
                ? t('Pay ${amount} and switch', { amount: preview.chargeTodayUsd })
                : t('Schedule the change')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
