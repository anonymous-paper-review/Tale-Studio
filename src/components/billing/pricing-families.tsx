'use client'

import { Suspense, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { ArrowRight, Check, ChevronLeft, ChevronRight, Clapperboard, Layers, Loader2, Lock, Users, X, Zap } from 'lucide-react'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { PlanChangeDialog } from '@/components/billing/plan-change-dialog'
import { useCheckout } from '@/lib/billing/use-checkout'
import { usePortOneCheckout } from '@/lib/billing/use-portone-checkout'
import { PortOneBuyerDialog } from '@/components/billing/portone-buyer-dialog'
import { PORTONE_PACK_PRICES_KRW, PORTONE_PLAN_PRICES_KRW, readPortOneBillingChannelKey, readPortOnePublicConfig } from '@/lib/billing/portone-public'
import { isPurchasable } from '@/lib/billing/catalog'
import { PRICING_FAMILIES, pricingOptions, pricingReturnPath, pricingSelectionFromSearch, pricingSurface, purchaseAction, purchaseButton, type PricingFamily, type PricingOption, type PricingSelection, type PricingSurface } from '@/lib/billing/pricing-selection'
import { useLocale, useT } from '@/lib/i18n'
import { useLocaleStore } from '@/stores/locale-store'
import { LOCALE_LABELS } from '@/components/marketing/locale-toggle'
import { countText } from '@/lib/i18n/count-text'
import { cn } from '@/lib/utils'

const FAMILY_COPY = {
  starter: { title: 'Starter', cadence: 'Monthly subscription', audience: 'For individual creators', description: 'One project at a time. Choose the video minutes you need.', icon: Clapperboard },
  production: { title: 'Producer', cadence: 'Monthly subscription', audience: 'For production teams', description: 'More projects, more accounts, and previz export for your team.', icon: Users },
  take: { title: 'Take', cadence: 'One-time top-up', audience: 'For your next generation', description: 'Top up Takes for regenerations and premium video models.', icon: Zap },
} as const

const usd = (amount: number) => `$${amount.toLocaleString('en-US')}`
const amountOf = (option: PricingOption) => option.kind === 'plan' ? option.item.monthlyPriceUsd : option.item.priceUsd
const quantityOf = (option: PricingOption) => option.kind === 'plan' ? option.item.entitlements.maxMinutesPerProject : option.item.takes

function FamilyCards({ onSelect, surface }: { onSelect?: (family: PricingFamily, trigger: HTMLButtonElement) => void; surface: PricingSurface }) {
  const t = useT()
  // 2026-11-24 오너 시안 v2(디자이너 랜딩 요금 카드): 판 카드 · 큰 숫자 가격 · 알약 단추. 원화 화면은 Take 가 주 단추, 구독은 "곧 열려요".
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {PRICING_FAMILIES.map(family => {
        const copy = FAMILY_COPY[family]
        const first = pricingOptions(family)[0]
        const kind = first.kind
        const action = purchaseAction(surface, kind)
        const primary = surface.currency === 'krw' && action === 'korean-card'
        return (
          <button
            key={family}
            type="button"
            data-pricing-family={family}
            aria-haspopup="dialog"
            aria-label={t('Choose {family} options', { family: copy.title })}
            onClick={event => onSelect?.(family, event.currentTarget)}
            disabled={!onSelect}
            className={cn(
              'group flex min-h-96 flex-col rounded-3xl bg-panel p-7 text-left transition-colors hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-70',
              family === 'production' && 'bg-card shadow-panel ring-1 ring-border',
            )}
          >
            <p className="flex items-center gap-2 text-label font-semibold text-muted-foreground">
              {t(copy.cadence)}
              {family === 'production' && <span className="rounded-full bg-primary px-2 py-0.5 text-micro font-bold text-primary-foreground">{t('Team pick')}</span>}
              {primary && <span className="rounded-full bg-primary px-2 py-0.5 text-micro font-bold text-primary-foreground">{t('Available now')}</span>}
            </p>
            <h2 className="mt-2.5 font-num text-2xl font-bold tracking-tight">{copy.title}</h2>
            <p className="mt-1 text-body text-muted-foreground">{t(copy.audience)}</p>
            <p className="mb-2 mt-6 flex flex-wrap items-baseline gap-x-2">
              <span className="font-num text-5xl font-extrabold tabular-nums tracking-tight">{priceText(first, surface)}</span>
              <span className="text-label text-muted-foreground">{t(family === 'take' ? 'From · one time' : 'From / month')}</span>
            </p>
            <p className="min-h-12 text-body text-muted-foreground">{t(copy.description)}</p>
            <span className={cn('mt-auto flex h-12 w-full items-center justify-center gap-2 rounded-full text-body font-bold', primary ? 'bg-primary text-primary-foreground' : 'bg-chip text-foreground')}>
              {primary ? t('Buy a Take pack') : t('Choose options')}<ArrowRight className="size-4 transition-transform group-hover:translate-x-1 motion-reduce:transform-none" aria-hidden="true" />
            </span>
            <span className="mt-2 min-h-5 text-center text-caption text-muted-foreground">
              {action === 'subscription-soon' ? t('Subscriptions open soon') : ''}
            </span>
          </button>
        )
      })}
    </div>
  )
}

function PricingPicker({ initialSelection, checkoutEnabled }: { initialSelection: PricingSelection | null; checkoutEnabled: boolean }) {
  const t = useT()
  const [selection, setSelection] = useState<PricingSelection | null>(initialSelection)
  const [remembered, setRemembered] = useState<Record<PricingFamily, number>>(() => ({
    starter: 0, production: 0, take: 0,
    ...(initialSelection ? { [initialSelection.family]: initialSelection.index } : {}),
  }))
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const handingOff = useRef(false)
  const { busy: paddleBusy, startCheckout, planChange, setPlanChange } = useCheckout()
  const portone = usePortOneCheckout()
  const busy = paddleBusy || portone.busy
  const [buyerOpen, setBuyerOpen] = useState(false)
  const options = selection ? pricingOptions(selection.family) : []
  const option = selection ? options[selection.index] : undefined
  const copy = selection ? FAMILY_COPY[selection.family] : null
  const purchase = option ? purchaseButton({ checkoutEnabled, purchasable: isPurchasable(option.item), busy }) : null
  const surface = usePricingSurface(checkoutEnabled)
  const setLocale = useLocaleStore(state => state.setLocale)
  const action = option ? purchaseAction(surface, option.kind) : null

  function choose(index: number) {
    if (!selection || !Number.isInteger(index) || index < 0 || index >= options.length || busy) return
    setSelection({ ...selection, index })
    setRemembered(previous => ({ ...previous, [selection.family]: index }))
  }

  async function handOff() {
    handingOff.current = true
    setSelection(null)
    // React가 선택창과 포커스 잠금을 해제한 뒤 결제창을 연다.
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
  }

  const krwAmount = option ? krwPriceOf(option) : null
  const buyLabel = (value: PricingOption, won: number | null) => {
    const amount = won !== null ? krw(won) : usd(amountOf(value))
    if (value.kind === 'plan') return `${t('Continue with {plan}', { plan: value.item.name })} · ${amount}`
    return countText(t, quantityOf(value), 'Buy 1 Take · {amount}', 'Buy {n} Takes · {amount}', { n: quantityOf(value).toLocaleString('en-US'), amount })
  }

  const optionLabel = (value: PricingOption) => value.kind === 'plan'
    ? t('{n} min per project', { n: quantityOf(value) })
    : countText(t, quantityOf(value), '1 Take', '{n} Takes', { n: quantityOf(value).toLocaleString('en-US') })

  return (
    <>
      <FamilyCards surface={surface} onSelect={(family, trigger) => {
        handingOff.current = false
        triggerRef.current = trigger
        setSelection({ family, index: remembered[family] })
      }} />
      <Dialog open={selection !== null} onOpenChange={open => { if (!open && !busy) setSelection(null) }}>
        <DialogContent
          showCloseButton={false}
          className="max-h-[calc(100dvh-2rem)] gap-0 overflow-y-auto p-0 data-[state=closed]:animate-none"
          onEscapeKeyDown={event => { if (busy) event.preventDefault() }}
          onPointerDownOutside={event => { if (busy) event.preventDefault() }}
          onCloseAutoFocus={event => {
            event.preventDefault()
            if (!handingOff.current) triggerRef.current?.focus()
          }}
        >
          {selection && option && copy && (
            <>
              <DialogHeader className="items-start border-b border-border px-6 py-5 text-left">
                <p className="text-xs text-muted-foreground">{t(copy.cadence)}</p>
                <DialogTitle className="pr-8 text-xl">{t('Choose your {family}', { family: copy.title })}</DialogTitle>
                <DialogDescription>{t('Slide to compare options. Nothing is charged until you continue to checkout.')}</DialogDescription>
              </DialogHeader>
              <DialogClose asChild>
                <Button variant="ghost" size="icon-lg" disabled={busy} className="absolute right-3 top-3" aria-label={t('Close')}>
                  <X className="size-4" aria-hidden="true" />
                </Button>
              </DialogClose>
              <div className="space-y-6 p-6">
                <div className="text-center" aria-live="polite" aria-atomic="true">
                  <p className="mb-2 font-mono text-sm text-muted-foreground" data-selected-product={option.item.id}>{option.item.name}</p>
                  <p className="flex items-baseline justify-center gap-2">
                    <span className="font-num text-5xl font-extrabold tabular-nums tracking-tight" data-selected-price>{priceText(option, surface)}</span>
                    <span className="text-sm text-muted-foreground">{t(option.kind === 'plan' ? '/ month' : 'One time')}</span>
                  </p>
                  <p className="mt-2 text-sm font-medium">{optionLabel(option)}</p>
                </div>
                <div className="rounded-lg border border-border bg-muted/30 p-4">
                  <div className="mb-3 flex items-center justify-between gap-4">
                    <span className="text-xs text-muted-foreground">{t(option.kind === 'plan' ? 'Minutes per project' : 'Take amount')}</span>
                    <span className="font-mono text-xs tabular-nums">{selection.index + 1} / {options.length}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Button variant="outline" size="icon-lg" disabled={busy || selection.index === 0} onClick={() => choose(selection.index - 1)} aria-label={t('Previous option')}>
                      <ChevronLeft aria-hidden="true" />
                    </Button>
                    <input
                      type="range"
                      min={0}
                      max={options.length - 1}
                      step={1}
                      value={selection.index}
                      onChange={event => choose(Number(event.currentTarget.value))}
                      disabled={busy}
                      aria-label={t('{family} options', { family: copy.title })}
                      aria-valuetext={`${option.item.name}, ${optionLabel(option)}, ${priceText(option, surface)} ${t(option.kind === 'plan' ? '/ month' : 'One time')}`}
                      style={{ '--fill': `${options.length > 1 ? (selection.index / (options.length - 1)) * 100 : 0}%` } as React.CSSProperties}
                      className="range-rainbow min-w-0 flex-1 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring disabled:cursor-wait"
                    />
                    <Button variant="outline" size="icon-lg" disabled={busy || selection.index === options.length - 1} onClick={() => choose(selection.index + 1)} aria-label={t('Next option')}>
                      <ChevronRight aria-hidden="true" />
                    </Button>
                  </div>
                  <div className="mt-3 flex gap-1">
                    {options.map((value, index) => (
                      <button
                        key={value.item.id}
                        type="button"
                        disabled={busy}
                        aria-pressed={selection.index === index}
                        aria-label={optionLabel(value)}
                        onClick={() => choose(index)}
                        className={cn('min-h-11 min-w-0 flex-1 rounded-md px-1 py-2 font-mono text-xs tabular-nums transition-colors focus-visible:outline-2 focus-visible:outline-ring', selection.index === index ? 'bg-primary/15 font-semibold text-primary' : 'text-muted-foreground hover:bg-accent')}
                      >
                        {quantityOf(value).toLocaleString('en-US')}
                        {surface.currency === 'krw' && <span className="block text-micro font-normal text-muted-foreground">{priceText(value, surface)}</span>}
                      </button>
                    ))}
                  </div>
                </div>
                {option.kind === 'plan' ? (
                  <dl className="grid min-h-36 grid-cols-2 gap-4 text-sm">
                    <Allowance icon={Clapperboard} label={t('Minutes per project')} value={String(option.item.entitlements.maxMinutesPerProject)} />
                    <Allowance icon={Layers} label={t('Linked projects')} value={String(option.item.entitlements.maxLinkedProjects)} />
                    <Allowance icon={Zap} label={t('Takes per month')} value={String(option.item.entitlements.includedTakesPerMonth)} />
                    <Allowance icon={Users} label={t('Accounts')} value={String(option.item.entitlements.accountSeats)} />
                    <div className="col-span-2 flex items-center gap-2 text-xs text-muted-foreground">
                      {option.item.entitlements.canExport ? <Check className="size-4 text-primary" aria-hidden="true" /> : <X className="size-4" aria-hidden="true" />}
                      {t('Export previz data')}
                    </div>
                  </dl>
                ) : (
                  <div className="min-h-36 space-y-4 text-sm">
                    <p className="flex items-center gap-2"><Check className="size-4 text-primary" aria-hidden="true" />{countText(t, option.item.takes, '1 Take', '{n} Takes', { n: option.item.takes.toLocaleString('en-US') })}</p>
                    <p className="text-muted-foreground">{t('Valid for 12 months from purchase.')}</p>
                    <p className="text-muted-foreground">{t('One-time purchase. Your subscription does not change.')}</p>
                  </div>
                )}
              </div>
              <div className="sticky bottom-0 border-t border-border bg-background px-6 py-4">
                {action === 'korean-card' ? (
                  <>
                    <Button size="lg" className="w-full rounded-full" data-pricing-portone disabled={busy} onClick={() => setBuyerOpen(true)}>
                      {portone.busy ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" /> : null}
                      {buyLabel(option, krwAmount)}
                    </Button>
                    <p className="mt-2 flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
                      <Lock className="size-3" aria-hidden="true" />{t('Korean card payment · KG Inicis')}
                    </p>
                  </>
                ) : action === 'notice' && surface.currency === 'krw' ? (
                  <>
                    <Button size="lg" className="w-full rounded-full" data-pricing-purchase onClick={() => toast(t('Payments are being prepared'))}>
                      {buyLabel(option, krwAmount)}
                    </Button>
                    <p className="mt-2 text-center text-xs text-muted-foreground">{t('You can browse plans and Take packs. Purchases are not open yet.')}</p>
                  </>
                ) : action === 'subscription-soon' ? (
                  <>
                    <Button size="lg" variant="secondary" className="w-full rounded-full" data-pricing-purchase onClick={() => toast(t('Subscriptions open soon'))}>
                      {t('Continue with {plan}', { plan: option.item.name })}
                    </Button>
                    <p className="mt-2 text-center text-xs text-muted-foreground">{t('Subscriptions open soon')}</p>
                  </>
                ) : (
                  <>
                    <Button
                      size="lg"
                      className="w-full rounded-full"
                      data-pricing-purchase
                      disabled={purchase?.disabled ?? true}
                      onClick={() => {
                        // 구매가 닫힌 동안에는 계정 화면 Take 충전과 같은 안내만 띄운다.
                        if (purchase?.notice) toast.error(t(purchase.notice))
                        else void startCheckout({ kind: option.kind, id: option.item.id, returnTo: pricingReturnPath(option), onReady: handOff })
                      }}
                    >
                      {busy ? <><Loader2 className="size-4 animate-spin motion-reduce:animate-none" />{t('Preparing checkout…')}</> : checkoutEnabled && !isPurchasable(option.item) ? t('Coming soon') : option.kind === 'plan' ? t('Continue with {plan}', { plan: option.item.name }) : countText(t, quantityOf(option), 'Buy 1 Take', 'Buy {n} Takes', { n: quantityOf(option).toLocaleString('en-US') })}
                    </Button>
                    <p className="mt-2 text-center text-xs text-muted-foreground">{t(checkoutEnabled ? 'Pay in USD by card. Review the final total in Paddle.' : 'You can browse plans and Take packs. Purchases are not open yet.')}</p>
                    {surface.switchToKorean && (
                      <p className="mt-3 text-center text-xs text-muted-foreground" data-pricing-switch-korean>
                        {t('Paying with a Korean card?')}{' '}
                        <button type="button" className="underline underline-offset-4 hover:text-foreground" onClick={() => void setLocale('ko')}>
                          {LOCALE_LABELS.ko}
                        </button>
                      </p>
                    )}
                  </>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
      {option && krwAmount !== null && (
        <PortOneBuyerDialog
          open={buyerOpen}
          onOpenChange={setBuyerOpen}
          amountLabel={krw(krwAmount)}
          productLabel={`${option.item.name} · ${optionLabel(option)}`}
          onConfirm={buyer => {
            setBuyerOpen(false)
            void portone.start({ kind: option.kind, id: option.item.id, buyer, returnTo: pricingReturnPath(option), onReady: handOff })
          }}
        />
      )}
      <PlanChangeDialog preview={planChange} open={planChange !== null} onOpenChange={open => { if (!open) setPlanChange(null) }} />
    </>
  )
}

function krwPriceOf(option: PricingOption): number | null {
  const table: Record<string, number | null> = option.kind === 'plan' ? PORTONE_PLAN_PRICES_KRW : PORTONE_PACK_PRICES_KRW
  return table[option.item.id] ?? null
}

function krw(amount: number): string {
  return `₩${amount.toLocaleString('ko-KR')}`
}

/** 화면 언어와 국내 카드 키로 요금 화면 표시를 정한다(약속: tests/billing/pricing-surface.test.ts). */
function usePricingSurface(checkoutEnabled: boolean): PricingSurface {
  const locale = useLocale()
  return pricingSurface({
    locale,
    checkoutEnabled,
    koreanCardReady: readPortOnePublicConfig() !== null,
    koreanSubscriptionReady: readPortOneBillingChannelKey() !== null,
  })
}

function priceText(option: PricingOption, surface: PricingSurface): string {
  const won = surface.currency === 'krw' ? krwPriceOf(option) : null
  return won !== null ? krw(won) : usd(amountOf(option))
}

function Allowance({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: string }) {
  return <div><dt className="mb-1 flex items-center gap-2 text-xs text-muted-foreground"><Icon className="size-3" aria-hidden="true" />{label}</dt><dd className="font-mono font-medium tabular-nums" data-selected-allowance>{value}</dd></div>
}

function PricingFamiliesWithSearch({ checkoutEnabled }: { checkoutEnabled: boolean }) {
  const search = useSearchParams()
  const initialSelection = pricingSelectionFromSearch(search)
  return <PricingPicker key={initialSelection ? `${initialSelection.family}:${initialSelection.index}` : 'default'} initialSelection={initialSelection} checkoutEnabled={checkoutEnabled} />
}

function FamilyCardsFallback({ checkoutEnabled }: { checkoutEnabled: boolean }) {
  return <FamilyCards surface={usePricingSurface(checkoutEnabled)} />
}

export function PricingFamilies({ checkoutEnabled }: { checkoutEnabled: boolean }) {
  return <Suspense fallback={<FamilyCardsFallback checkoutEnabled={checkoutEnabled} />}><PricingFamiliesWithSearch checkoutEnabled={checkoutEnabled} /></Suspense>
}
