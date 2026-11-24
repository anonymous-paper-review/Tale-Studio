'use client'

// 국내 카드 결제 전 구매자 이름·휴대폰 번호를 받는 창. KG이니시스 결제창이 구매자 정보를 요구한다.
//   값은 이 브라우저에만 기억해 다음 결제 때 채워 둔다(서버에 따로 저장하지 않는다).
//   2026-11-24 오너 ⑤: 이름은 구글 계정 이름으로 미리 채우고, 왜 묻는지·저장하지 않는다는 점을 알린다.
//   약속: tests/billing/portone-buyer.test.ts
import { useEffect, useState } from 'react'
import { Lock } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useT } from '@/lib/i18n'
import { createClient } from '@/lib/supabase/client'
import type { PortOneBuyer } from '@/lib/billing/use-portone-checkout'

const STORAGE_KEY = 'tale.portone.buyer'

export const BUYER_NEXT_STEP_NOTE = 'The card payment window needs this. You enter your card in the KG Inicis payment window on the next screen.'
export const BUYER_PRIVACY_NOTE = 'Sent only to KG Inicis for this payment. Tale Studio does not store it.'

function readSaved(): PortOneBuyer {
  try {
    const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '{}') as Partial<PortOneBuyer>
    return { fullName: saved.fullName ?? '', phoneNumber: saved.phoneNumber ?? '' }
  } catch {
    return { fullName: '', phoneNumber: '' }
  }
}

/** 이 브라우저에서 결제한 이름이 있으면 그것, 없으면 구글 계정 이름. */
export function initialBuyerName(input: { saved: string; account: string | null | undefined }): string {
  return input.saved.trim() || input.account?.trim() || ''
}

export function normalizeKoreanPhone(value: string): string | null {
  const digits = value.replace(/\D/g, '')
  return /^01[016789]\d{7,8}$/.test(digits) ? digits : null
}

export function PortOneBuyerDialog({
  open,
  onOpenChange,
  amountLabel,
  productLabel,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  amountLabel: string
  productLabel?: string
  onConfirm: (buyer: PortOneBuyer) => void
}) {
  const t = useT()
  const [buyer, setBuyer] = useState<PortOneBuyer>(() => (typeof window === 'undefined' ? { fullName: '', phoneNumber: '' } : readSaved()))
  const phone = normalizeKoreanPhone(buyer.phoneNumber)
  const ready = buyer.fullName.trim().length > 0 && phone !== null

  // 이름 칸이 비어 있으면 구글 계정 이름으로 채운다(창을 열 때 한 번).
  useEffect(() => {
    if (!open || buyer.fullName.trim()) return
    let alive = true
    void createClient()
      .auth.getUser()
      .then(({ data }) => {
        const meta = data.user?.user_metadata as { full_name?: string; name?: string } | undefined
        const name = initialBuyerName({ saved: '', account: meta?.full_name ?? meta?.name })
        if (alive && name) setBuyer((prev) => (prev.fullName.trim() ? prev : { ...prev, fullName: name }))
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [open, buyer.fullName])

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
          <DialogTitle>{t('Payment details')}</DialogTitle>
          <DialogDescription>{t(BUYER_NEXT_STEP_NOTE)}</DialogDescription>
        </DialogHeader>
        <div className="flex items-center justify-between rounded-xl bg-card px-4 py-3 text-sm">
          <span className="text-muted-foreground">{productLabel ?? ''}</span>
          <span className="font-num text-base font-bold tabular-nums">{amountLabel}</span>
        </div>
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
          <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <Lock className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
            {t(BUYER_PRIVACY_NOTE)}
          </p>
          <DialogFooter>
            <Button type="submit" disabled={!ready} className="w-full rounded-full">
              {t('Open card payment window')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
