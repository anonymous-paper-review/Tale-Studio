'use client'

import { Suspense, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { ArrowRight, Check, ChevronLeft, ChevronRight, Clapperboard, Layers, Loader2, Users, X, Zap } from 'lucide-react'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { PlanChangeDialog } from '@/components/billing/plan-change-dialog'
import { useCheckout } from '@/lib/billing/use-checkout'
import { isPurchasable } from '@/lib/billing/catalog'
import { PRICING_FAMILIES, pricingOptions, pricingReturnPath, pricingSelectionFromSearch, type PricingFamily, type PricingOption, type PricingSelection } from '@/lib/billing/pricing-selection'
import { useT } from '@/lib/i18n'
import { cn } from '@/lib/utils'

const FAMILY_COPY = {
  starter: { title: 'Starter', cadence: 'Monthly subscription', audience: 'For individual creators', description: 'One project at a time. Choose the video minutes you need.', icon: Clapperboard },
  production: { title: 'Producer', cadence: 'Monthly subscription', audience: 'For production teams', description: 'More projects, more accounts, and previz export for your team.', icon: Users },
  take: { title: 'Take', cadence: 'One-time top-up', audience: 'For your next generation', description: 'Top up Takes for regenerations and premium video models.', icon: Zap },
} as const

const usd = (amount: number) => `$${amount.toLocaleString('en-US')}`
const amountOf = (option: PricingOption) => option.kind === 'plan' ? option.item.monthlyPriceUsd : option.item.priceUsd
const quantityOf = (option: PricingOption) => option.kind === 'plan' ? option.item.entitlements.maxMinutesPerProject : option.item.takes

function FamilyCards({ onSelect }: { onSelect?: (family: PricingFamily, trigger: HTMLButtonElement) => void }) {
  const t = useT()
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {PRICING_FAMILIES.map(family => {
        const copy = FAMILY_COPY[family]
        const first = pricingOptions(family)[0]
        const Icon = copy.icon
        return (
          <button
            key={family}
            type="button"
            data-pricing-family={family}
            aria-haspopup="dialog"
            aria-label={t('Choose {family} options', { family: copy.title })}
            onClick={event => onSelect?.(family, event.currentTarget)}
            disabled={!onSelect}
            className="group flex min-h-80 flex-col rounded-xl border border-border bg-card p-6 text-left transition-colors hover:border-primary/60 hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-70"
          >
            <div className="mb-8 flex w-full items-center justify-between">
              <Icon className="size-5 text-primary" aria-hidden="true" />
              <span className="text-xs text-muted-foreground">{t(copy.cadence)}</span>
            </div>
            <h2 className="text-2xl font-semibold tracking-tight">{copy.title}</h2>
            <p className="mt-2 text-sm font-medium">{t(copy.audience)}</p>
            <p className="mt-2 min-h-12 text-sm leading-relaxed text-muted-foreground">{t(copy.description)}</p>
            <p className="mb-6 mt-8 flex items-baseline gap-2">
              <span className="text-xs text-muted-foreground">{t('From')}</span>
              <span className="font-mono text-3xl font-semibold tabular-nums">{usd(amountOf(first))}</span>
              <span className="text-xs text-muted-foreground">{t(family === 'take' ? 'One time' : '/ month')}</span>
            </p>
            <span className="mt-auto flex w-full items-center justify-between border-t border-border pt-4 text-sm font-medium">
              {t('Choose options')}<ArrowRight className="size-4 transition-transform group-hover:translate-x-1 motion-reduce:transform-none" aria-hidden="true" />
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
  const { busy, startCheckout, planChange, setPlanChange } = useCheckout()
  const options = selection ? pricingOptions(selection.family) : []
  const option = selection ? options[selection.index] : undefined
  const copy = selection ? FAMILY_COPY[selection.family] : null

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

  const optionLabel = (value: PricingOption) => value.kind === 'plan'
    ? t('{n} min per project', { n: quantityOf(value) })
    : t('{n} Takes', { n: quantityOf(value).toLocaleString('en-US') })

  return (
    <>
      <FamilyCards onSelect={(family, trigger) => {
        handingOff.current = false
        triggerRef.current = trigger
        setSelection({ family, index: remembered[family] })
      }} />
      <Dialog open={selection !== null} onOpenChange={open => { if (!open && !busy) setSelection(null) }}>
        <DialogContent
          showCloseButton={false}
          className="max-h-[calc(100dvh-2rem)] gap-0 overflow-y-auto p-0 data-[state=closed]:animate-none sm:max-w-xl"
          onEscapeKeyDown={event => { if (busy) event.preventDefault() }}
          onPointerDownOutside={event => { if (busy) event.preventDefault() }}
          onCloseAutoFocus={event => {
            event.preventDefault()
            if (!handingOff.current) triggerRef.current?.focus()
          }}
        >
          {selection && option && copy && (
            <>
              <DialogHeader className="border-b border-border px-6 py-5 text-left">
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
                    <span className="font-mono text-3xl font-semibold tabular-nums" data-selected-price>{usd(amountOf(option))}</span>
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
                      aria-valuetext={`${option.item.name}, ${optionLabel(option)}, ${usd(amountOf(option))} ${t(option.kind === 'plan' ? '/ month' : 'One time')}`}
                      className="h-10 min-w-0 flex-1 cursor-pointer accent-primary focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring disabled:cursor-wait"
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
                    <p className="flex items-center gap-2"><Check className="size-4 text-primary" aria-hidden="true" />{t('{n} Takes', { n: option.item.takes.toLocaleString('en-US') })}</p>
                    <p className="text-muted-foreground">{t('Valid for 12 months from purchase.')}</p>
                    <p className="text-muted-foreground">{t('One-time purchase. Your subscription does not change.')}</p>
                  </div>
                )}
              </div>
              <div className="sticky bottom-0 border-t border-border bg-background px-6 py-4">
                <Button
                  size="lg"
                  className="w-full"
                  data-pricing-purchase
                  disabled={!checkoutEnabled || busy || !isPurchasable(option.item)}
                  onClick={() => void startCheckout({ kind: option.kind, id: option.item.id, returnTo: pricingReturnPath(option), onReady: handOff })}
                >
                  {!checkoutEnabled ? t('Payments are being prepared') : busy ? <><Loader2 className="size-4 animate-spin motion-reduce:animate-none" />{t('Preparing checkout…')}</> : !isPurchasable(option.item) ? t('Coming soon') : t(option.kind === 'plan' ? 'Continue with {plan}' : 'Buy {n} Takes', { plan: option.item.name, n: quantityOf(option).toLocaleString('en-US') })}
                </Button>
                <p className="mt-2 text-center text-xs text-muted-foreground">{t(checkoutEnabled ? 'Pay in USD by card. Review the final total in Paddle.' : 'You can browse plans and Take packs. Purchases are not open yet.')}</p>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
      <PlanChangeDialog preview={planChange} open={planChange !== null} onOpenChange={open => { if (!open) setPlanChange(null) }} />
    </>
  )
}

function Allowance({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: string }) {
  return <div><dt className="mb-1 flex items-center gap-2 text-xs text-muted-foreground"><Icon className="size-3" aria-hidden="true" />{label}</dt><dd className="font-mono font-medium tabular-nums" data-selected-allowance>{value}</dd></div>
}

function PricingFamiliesWithSearch({ checkoutEnabled }: { checkoutEnabled: boolean }) {
  const search = useSearchParams()
  const initialSelection = pricingSelectionFromSearch(search)
  return <PricingPicker key={initialSelection ? `${initialSelection.family}:${initialSelection.index}` : 'default'} initialSelection={initialSelection} checkoutEnabled={checkoutEnabled} />
}

export function PricingFamilies({ checkoutEnabled }: { checkoutEnabled: boolean }) {
  return <Suspense fallback={<FamilyCards />}><PricingFamiliesWithSearch checkoutEnabled={checkoutEnabled} /></Suspense>
}
