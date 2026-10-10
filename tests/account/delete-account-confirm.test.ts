// 계정 삭제 확인창은 되돌릴 수 없다는 것을 알리고 계정 이메일을 그대로 입력했을 때만 삭제를 켠다
import { beforeEach, expect, it, vi } from 'vitest'
import { isValidElement, type ReactElement, type ReactNode } from 'react'

// 약관 §9 와 개인정보 처리방침 §1 이 약속한 "언제든 계정 설정에서 삭제" 의 입구.
//   실수 한 번으로 되돌릴 수 없는 삭제가 일어나지 않게, 확인 입력이 계정 이메일과 같을 때만 버튼이 켜진다.
//   생김새는 스크린샷이 검수하고(계정 페이지 > 계정 카드 아래 위험 구역), 여기는 문구와 켜짐/꺼짐만 본다.

const hooks = vi.hoisted(() => ({
  lane: 'page',
  cursor: 0,
  slots: {} as Record<string, unknown[]>,
}))
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useCallback: (callback: unknown) => callback,
  useMemo: (factory: () => unknown) => factory(),
  useEffect: (effect: () => void) => void effect(),
  useState: (initial: unknown) => {
    const slots = (hooks.slots[hooks.lane] ??= [])
    const slot = hooks.cursor++
    if (!(slot in slots)) slots[slot] = typeof initial === 'function' ? initial() : initial
    return [
      slots[slot],
      (value: unknown) => {
        slots[slot] = typeof value === 'function' ? (value as (prev: unknown) => unknown)(slots[slot]) : value
      },
    ]
  },
}))
vi.mock('@/lib/i18n', () => ({
  useT: () => (text: string, vars?: Record<string, string | number>) =>
    vars ? text.replace(/\{(\w+)\}/g, (_, key: string) => String(vars[key] ?? `{${key}}`)) : text,
  useLocale: () => 'en',
}))
vi.mock('@/lib/billing/use-billing-account', () => ({
  useBillingAccount: () => ({ data: { email: 'owner@example.test', subscription: { plan: 'free', status: 'none', nextBillingAt: null, accessEndsAt: null, paymentFailed: false }, balance: null, recent: [], isAdmin: false, canBuyPack: true, hasPaddleCustomer: false }, loading: false, error: null }),
  refetchBillingAccount: vi.fn(),
}))
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ auth: { signOut: vi.fn() } }) }))
vi.mock('@/stores/locale-store', () => ({ useLocaleStore: () => 'en' }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
vi.mock('@/components/dashboard/dashboard-header', () => ({ DashboardHeader: () => null }))
vi.mock('@/components/billing/checkout-button', () => ({ CheckoutButton: () => null }))
vi.mock('@/components/billing/portal-button', () => ({ PortalButton: () => null }))

import AccountPage from '@/app/account/page'
import { DeleteAccountDialog } from '@/components/account/delete-account-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

const EMAIL = 'owner@example.test'

type Element = ReactElement<Record<string, unknown>>
function elements(node: ReactNode): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements)
  return isValidElement<Record<string, unknown>>(node)
    ? [node, ...elements(node.props.children as ReactNode)]
    : []
}
function textOf(node: ReactNode): string {
  if (Array.isArray(node)) return node.map(textOf).join('')
  if (isValidElement<{ children?: ReactNode }>(node)) return textOf(node.props.children)
  return typeof node === 'string' ? node : ''
}
function renderPage() {
  hooks.lane = 'page'
  hooks.cursor = 0
  return elements(AccountPage())
}
function renderDialog() {
  hooks.lane = 'dialog'
  hooks.cursor = 0
  return elements(DeleteAccountDialog({ email: EMAIL, open: true, onOpenChange: () => {} }))
}
function confirmButton(nodes: Element[]) {
  return nodes.find((node) => node.type === Button && textOf(node) === 'Delete account permanently')!
}
function typeConfirmation(nodes: Element[], value: string) {
  const input = nodes.find((node) => node.type === Input)!
  ;(input.props.onChange as (event: unknown) => void)({ target: { value } })
}

beforeEach(() => {
  hooks.slots = {}
  hooks.cursor = 0
})

// 왜: 되돌릴 수 없는 결과를 누르기 전에 읽어야 한다. 약관 §9 의 세 가지(최종성·Take 소멸·미리 내보내기).
it('확인창은 되돌릴 수 없다는 것과 남은 Take 소멸, 미리 내보내기를 함께 알린다', () => {
  const text = renderDialog().map((node) => textOf(node)).join(' ')

  expect(text).toContain('This cannot be undone.')
  expect(text).toContain('Export anything you want to keep before you continue.')
  expect(text).toContain('Any Take left in your balance, including purchased Take, and the unused remainder of a paid period are forfeited.')
  expect(text).toContain('Payment and transaction records are kept for the periods the law requires.')
})

// 왜: 확인창을 열자마자 눌릴 수 있으면 오타 한 번으로 계정이 사라진다.
it('확인 입력이 비어 있으면 삭제 버튼이 꺼져 있다', () => {
  expect(confirmButton(renderDialog()).props.disabled).toBe(true)
})

// 왜: 비슷한 글자를 넣고 눌러도 삭제되면 실수 방지 장치가 없는 것과 같다.
it('확인 입력이 계정 이메일과 다르면 삭제 버튼이 꺼져 있다', () => {
  typeConfirmation(renderDialog(), 'owner@example.tes')

  expect(confirmButton(renderDialog()).props.disabled).toBe(true)
})

// 왜: 본인 이메일을 그대로 적은 사람은 무엇을 하는지 알고 있다. 정상 경로 고정.
it('확인 입력이 계정 이메일과 같으면 삭제 버튼이 켜진다', () => {
  typeConfirmation(renderDialog(), EMAIL)

  expect(confirmButton(renderDialog()).props.disabled).toBe(false)
})

// 왜: 약관이 "계정 설정에서 언제든" 이라고 약속했으므로 계정 페이지에서 바로 열려야 한다.
it('계정 페이지의 위험 구역에서 삭제를 누르면 확인창이 열린다', () => {
  const closed = renderPage().find((node) => node.type === DeleteAccountDialog)
  expect(closed?.props.open).toBe(false)
  expect(closed?.props.email).toBe(EMAIL)

  const open = renderPage().find((node) => node.type === Button && textOf(node) === 'Delete account')!
  ;(open.props.onClick as () => void)()

  expect(renderPage().find((node) => node.type === DeleteAccountDialog)?.props.open).toBe(true)
})
