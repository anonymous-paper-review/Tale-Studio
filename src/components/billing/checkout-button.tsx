'use client'

// 기존 구매 버튼도 가격 옵션창과 같은 거래·구독 변경 흐름을 사용한다.

import type { ReactNode } from 'react'
import type { CheckoutKind } from '@/lib/billing/checkout'
import { useCheckout } from '@/lib/billing/use-checkout'
import { cn } from '@/lib/utils'
import { PlanChangeDialog } from '@/components/billing/plan-change-dialog'

export function CheckoutButton({
  kind,
  id,
  children,
  className,
  disabled,
}: {
  kind: CheckoutKind
  id: string
  children: ReactNode
  className?: string
  disabled?: boolean
}) {
  const { busy, startCheckout, planChange, setPlanChange } = useCheckout()

  return (
    <>
      <button type="button" onClick={() => void startCheckout({ kind, id })} disabled={disabled || busy} className={cn(className, busy && 'opacity-70')}>
        {children}
      </button>
      <PlanChangeDialog preview={planChange} open={planChange !== null} onOpenChange={(v) => !v && setPlanChange(null)} />
    </>
  )
}
