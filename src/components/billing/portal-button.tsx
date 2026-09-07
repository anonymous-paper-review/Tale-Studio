'use client'

// Paddle 고객 포털 열기 (#payments-phase-3 P9). 구독 취소·결제 수단 변경·영수증은 Paddle 화면이 한다.
//   버튼을 누를 때마다 서버(/api/billing/portal)가 새 세션 주소를 만들고, 새 탭으로 연다.
//   target 으로 어느 화면으로 바로 갈지 고른다: overview(전체) · cancel(구독 취소) · payment(결제 수단).

import { useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { useT } from '@/lib/i18n'
import { cn } from '@/lib/utils'

export function PortalButton({
  target,
  children,
  className,
  disabled,
}: {
  target: 'overview' | 'cancel' | 'payment'
  children: ReactNode
  className?: string
  disabled?: boolean
}) {
  const t = useT()
  const [busy, setBusy] = useState(false)
  const open = async () => {
    if (busy) return
    setBusy(true)
    try {
      const res = await fetch('/api/billing/portal', { method: 'POST' })
      const body = (await res.json().catch(() => ({}))) as { overviewUrl?: string; cancelUrl?: string | null; updatePaymentMethodUrl?: string | null; error?: string }
      if (!res.ok || !body.overviewUrl) {
        toast.error(t(body.error === 'no_customer' ? 'No billing account yet. Buy Takes or subscribe first.' : 'Could not open billing portal. Please try again.'))
        return
      }
      const url = (target === 'cancel' ? body.cancelUrl : target === 'payment' ? body.updatePaymentMethodUrl : null) ?? body.overviewUrl
      window.open(url, '_blank', 'noopener')
    } finally {
      setBusy(false)
    }
  }
  return (
    <button type="button" onClick={() => void open()} disabled={disabled || busy} className={cn(className, busy && 'opacity-70')}>
      {children}
    </button>
  )
}
