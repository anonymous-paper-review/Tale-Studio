'use client'

// 계정 화면의 코드 입력 칸(2026-10-27 오너 바우처) — 받은 코드를 넣으면 그 요금제와 한 달 Take 가 들어온다.
//   무료 요금제 계정에만 보인다(showVoucherCard). 성공하면 계정 요약을 다시 읽어 요금제 · Take 가 바로 바뀌고,
//   요금제가 바뀌면 이 칸이 사라지므로 성공 문장은 칸 밖(알림)으로 띄운다.
//   약속: tests/billing/voucher.test.ts (판정 · 문장) + 스크린샷(생김새).
import { useState, type FormEvent } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PADDLE_PLANS } from '@/lib/billing/catalog'
import { voucherFailureMessage } from '@/lib/billing/voucher'
import { refetchBillingAccount } from '@/lib/billing/use-billing-account'
import { useT } from '@/lib/i18n'
import { cn } from '@/lib/utils'

const planName = (id: string) => PADDLE_PLANS.find((p) => p.id === id)?.name ?? id

export function VoucherCard({ className }: { className?: string }) {
  const t = useT()
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (busy || !code.trim()) return
    setBusy(true)
    setFailure(null)
    try {
      const res = await fetch('/api/billing/voucher', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code }),
      })
      const body = (await res.json().catch(() => null)) as { plan?: string; takes?: number; error?: string } | null
      if (res.ok && body?.plan) {
        toast.success(t('{plan} plan is now active. {n} Takes added.', { plan: planName(body.plan), n: body.takes ?? 0 }))
        setCode('')
        await refetchBillingAccount()
      } else {
        setFailure(voucherFailureMessage(body?.error))
      }
    } catch {
      setFailure(voucherFailureMessage(null))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className={cn('rounded-2xl border border-white/10 bg-white/[0.02] p-6', className)}>
      <h2 className="mb-1 text-base font-semibold">{t('Have a code?')}</h2>
      <p className="mb-4 text-sm text-gray-400">{t('Enter the code you received and its plan starts right away.')}</p>
      <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-2 sm:flex-row">
        <Input
          value={code}
          onChange={(event) => setCode(event.target.value)}
          placeholder="TALE-XXXX-XXXX"
          aria-label={t('Code')}
          autoComplete="off"
          spellCheck={false}
          className="font-mono uppercase sm:max-w-xs"
        />
        <Button type="submit" disabled={busy || !code.trim()}>
          {busy && <Loader2 className="size-4 animate-spin" />}
          {t('Apply code')}
        </Button>
      </form>
      {failure && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {t(failure)}
        </p>
      )}
    </section>
  )
}
