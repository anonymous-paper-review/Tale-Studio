'use client'

// 모바일 결제창이 끝나고 돌아오는 자리(PortOne redirectUrl). 주소에 붙은 결제 번호·카드 키로 서버 확인만 부르고 계정 화면으로 보낸다.
//   PC 결제창은 이 화면을 거치지 않는다(같은 확인을 결제창 닫힘 뒤에 바로 부른다 — use-portone-checkout.ts).
import { Suspense, useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { useT } from '@/lib/i18n'
import { confirmPack, confirmSubscription } from '@/lib/billing/use-portone-checkout'

function PortOneReturn() {
  const t = useT()
  const router = useRouter()
  const search = useSearchParams()
  const started = useRef(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    if (started.current) return
    started.current = true
    const code = search.get('code')
    const paymentId = search.get('paymentId')
    const billingKey = search.get('billingKey')
    if (code || !paymentId) {
      setMessage(search.get('message') ?? t('The payment was not completed.'))
      return
    }
    const run = search.get('kind') === 'plan' && billingKey ? confirmSubscription(t, paymentId, billingKey) : confirmPack(t, paymentId)
    void run.then(() => router.replace('/account'))
  }, [router, search, t])

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-6 text-center text-foreground">
      {message ? (
        <>
          <p className="text-sm">{message}</p>
          <a href="/pricing" className="text-sm text-primary hover:underline">{t('Back to pricing')}</a>
        </>
      ) : (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
          {t('Confirming your payment…')}
        </p>
      )}
    </main>
  )
}

export default function PortOneReturnPage() {
  return (
    <Suspense>
      <PortOneReturn />
    </Suspense>
  )
}
