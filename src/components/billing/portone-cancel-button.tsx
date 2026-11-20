'use client'

// 국내 카드(PortOne) 구독 해지 버튼. Paddle 포털이 없으니 우리 해지 주소를 부른다.
//   구독 중이면 이번 기간이 끝날 때까지 쓰고 다음 청구를 하지 않는다(서버 판정: decidePortOneCancel).
import { useState } from 'react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useT } from '@/lib/i18n'
import { refetchBillingAccount } from '@/lib/billing/use-billing-account'

export function PortOneCancelButton({ className, accessEndsAt }: { className?: string; accessEndsAt: string | null }) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  async function cancel() {
    setBusy(true)
    try {
      const res = await fetch('/api/billing/portone/cancel', { method: 'POST' })
      if (!res.ok) throw new Error(String(res.status))
      await refetchBillingAccount()
      toast.success(t('Your subscription is canceled. You will not be charged again.'))
      setOpen(false)
    } catch {
      toast.error(t('Could not cancel. Please try again.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        {t('Cancel subscription')}
      </button>
      <Dialog open={open} onOpenChange={(next) => !busy && setOpen(next)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('Cancel subscription')}</DialogTitle>
            <DialogDescription>
              {accessEndsAt
                ? t('You can keep using your plan until {date}. After that you move to the free plan and are not charged again.', {
                    date: new Date(accessEndsAt).toLocaleDateString(),
                  })
                : t('Your plan ends and you are not charged again.')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" disabled={busy} onClick={() => setOpen(false)}>
              {t('Keep subscription')}
            </Button>
            <Button variant="destructive" disabled={busy} onClick={() => void cancel()}>
              {t('Cancel subscription')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
