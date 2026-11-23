'use client'

// 국내 카드 결제 전 구매자 이름·휴대폰 번호를 받는 창. KG이니시스 결제창이 구매자 정보를 요구한다.
//   값은 이 브라우저에만 기억해 다음 결제 때 채워 둔다(서버에 따로 저장하지 않는다).
import { useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useT } from '@/lib/i18n'
import type { PortOneBuyer } from '@/lib/billing/use-portone-checkout'

const STORAGE_KEY = 'tale.portone.buyer'

function readSaved(): PortOneBuyer {
  try {
    const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '{}') as Partial<PortOneBuyer>
    return { fullName: saved.fullName ?? '', phoneNumber: saved.phoneNumber ?? '' }
  } catch {
    return { fullName: '', phoneNumber: '' }
  }
}

export function normalizeKoreanPhone(value: string): string | null {
  const digits = value.replace(/\D/g, '')
  return /^01[016789]\d{7,8}$/.test(digits) ? digits : null
}

export function PortOneBuyerDialog({
  open,
  onOpenChange,
  amountLabel,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  amountLabel: string
  onConfirm: (buyer: PortOneBuyer) => void
}) {
  const t = useT()
  const [buyer, setBuyer] = useState<PortOneBuyer>(() => (typeof window === 'undefined' ? { fullName: '', phoneNumber: '' } : readSaved()))
  const phone = normalizeKoreanPhone(buyer.phoneNumber)
  const ready = buyer.fullName.trim().length > 0 && phone !== null

  function submit() {
    if (!ready || !phone) return
    const value = { fullName: buyer.fullName.trim(), phoneNumber: phone }
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
    } catch {
      // 기억하지 못해도 결제는 진행한다.
    }
    onConfirm(value)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('Pay by Korean card')}</DialogTitle>
          <DialogDescription>{t('The card payment window needs the buyer name and mobile number. {amount} will be charged.', { amount: amountLabel })}</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault()
            submit()
          }}
        >
          <label className="block space-y-1 text-sm">
            <span className="text-muted-foreground">{t('Name')}</span>
            <Input value={buyer.fullName} autoComplete="name" onChange={(e) => setBuyer({ ...buyer, fullName: e.target.value })} />
          </label>
          <label className="block space-y-1 text-sm">
            <span className="text-muted-foreground">{t('Mobile number')}</span>
            <Input value={buyer.phoneNumber} inputMode="tel" autoComplete="tel" placeholder="010-0000-0000" onChange={(e) => setBuyer({ ...buyer, phoneNumber: e.target.value })} />
          </label>
          <DialogFooter>
            <Button type="submit" disabled={!ready} className="w-full">
              {t('Continue to payment')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
