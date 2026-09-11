// 구매를 확정한 뒤 옵션창을 닫고 결제 또는 구독 변경 확인으로 안전하게 넘긴다.
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { PaddleEventData } from '@paddle/paddle-js'

// DOM 의존성 없이 실제 훅의 상태·수명과 비동기 구매 흐름을 실행한다.
const harness = vi.hoisted(() => ({
  slots: [] as unknown[],
  cursor: 0,
  effects: [] as (() => void | (() => void))[],
  cleanups: [] as (() => void)[],
}))
const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  fetch: vi.fn(),
  open: vi.fn(),
  loadPaddle: vi.fn(),
  fetchTakeBalance: vi.fn(),
  refetchBillingAccount: vi.fn(),
  error: vi.fn(),
  loading: vi.fn(),
  success: vi.fn(),
  warning: vi.fn(),
  listeners: new Set<(event: PaddleEventData) => void>(),
}))

vi.mock('react', () => ({
  useState: (initial: unknown) => {
    const slot = harness.cursor++
    if (!(slot in harness.slots)) harness.slots[slot] = initial
    return [harness.slots[slot], (value: unknown) => {
      harness.slots[slot] = typeof value === 'function' ? value(harness.slots[slot]) : value
    }]
  },
  useRef: (initial: unknown) => {
    const slot = harness.cursor++
    if (!(slot in harness.slots)) harness.slots[slot] = { current: initial }
    return harness.slots[slot]
  },
  useEffect: (effect: () => void | (() => void)) => {
    const slot = harness.cursor++
    if (!(slot in harness.slots)) {
      harness.slots[slot] = true
      harness.effects.push(effect)
    }
  },
  useCallback: (callback: unknown) => callback,
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }), usePathname: () => '/pricing' }))
vi.mock('sonner', () => ({ toast: { error: mocks.error, loading: mocks.loading, success: mocks.success, warning: mocks.warning } }))
vi.mock('@/lib/i18n', () => ({ useT: () => (text: string) => text }))
vi.mock('@/lib/billing/use-take-balance', () => ({ fetchTakeBalance: mocks.fetchTakeBalance }))
vi.mock('@/lib/billing/use-billing-account', () => ({ refetchBillingAccount: mocks.refetchBillingAccount }))
vi.mock('@/lib/billing/paddle-client', () => ({
  loadPaddle: mocks.loadPaddle,
  subscribePaddleEvents: (listener: (event: PaddleEventData) => void) => {
    mocks.listeners.add(listener)
    return () => { mocks.listeners.delete(listener) }
  },
}))

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}

function emit(name: string, transactionId: string) {
  const event = { name, data: { transaction_id: transactionId } } as PaddleEventData
  for (const listener of [...mocks.listeners]) listener(event)
}

async function mount() {
  const { useCheckout } = await import('@/lib/billing/use-checkout')
  function render() {
    harness.cursor = 0
    // eslint-disable-next-line react-hooks/rules-of-hooks -- Node 하네스가 위의 React 상태·수명 대역으로 실제 구매 훅을 실행한다.
    const result = useCheckout()
    for (const effect of harness.effects.splice(0)) {
      const cleanup = effect()
      if (cleanup) harness.cleanups.push(cleanup)
    }
    return result
  }
  return { render, current: render(), unmount: () => harness.cleanups.splice(0).forEach((cleanup) => cleanup()) }
}

beforeEach(() => {
  vi.resetAllMocks()
  harness.slots = []
  harness.cursor = 0
  harness.effects = []
  harness.cleanups = []
  mocks.listeners.clear()
  mocks.fetch.mockResolvedValue(Response.json({ transactionId: 'txn_first' }))
  mocks.loadPaddle.mockResolvedValue({ Checkout: { open: mocks.open } })
  mocks.fetchTakeBalance.mockResolvedValue({ balance: 10 })
  mocks.refetchBillingAccount.mockResolvedValue(undefined)
  vi.stubGlobal('fetch', mocks.fetch)
})

afterEach(() => {
  harness.cleanups.splice(0).forEach((cleanup) => cleanup())
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

// 왜: 옵션을 살펴보거나 화면을 여는 것만으로 미완료 결제 거래를 만들면 안 된다.
it('구매를 확정하기 전에는 거래를 만들지 않는다', async () => {
  const hook = await mount()
  hook.render()
  expect(mocks.fetch).not.toHaveBeenCalled()
  expect(mocks.loadPaddle).not.toHaveBeenCalled()
  expect(mocks.open).not.toHaveBeenCalled()
})

// 왜: 비로그인 고객이 옵션을 고른 뒤 로그인해도 같은 옵션으로 돌아와야 한다.
it('로그인이 필요하면 고른 옵션으로 돌아올 주소를 보존한다', async () => {
  mocks.fetch.mockResolvedValue(Response.json({}, { status: 401 }))
  const { current } = await mount()
  const returnTo = '/pricing?family=starter&option=pro'
  const onReady = vi.fn()
  await current.startCheckout({ kind: 'plan', id: 'pro', returnTo, onReady })
  expect(mocks.push).toHaveBeenCalledExactlyOnceWith(`/login?next=${encodeURIComponent(returnTo)}`)
  expect(onReady).not.toHaveBeenCalled()
  expect(mocks.open).not.toHaveBeenCalled()
})

// 왜: 두 모달이 포커스를 동시에 잡으면 카드 입력창을 사용할 수 없다.
it('옵션창을 닫는 작업이 끝난 뒤 결제창을 연다', async () => {
  const { current } = await mount()
  const ready = deferred<void>()
  const entered = deferred<void>()
  const onReady = vi.fn(() => { entered.resolve(); return ready.promise })
  const attempt = current.startCheckout({ kind: 'pack', id: 'mini', onReady })
  await entered.promise
  expect(mocks.fetch).toHaveBeenCalledExactlyOnceWith('/api/billing/checkout', expect.objectContaining({ body: JSON.stringify({ kind: 'pack', id: 'mini' }) }))
  expect(mocks.open).not.toHaveBeenCalled()
  ready.resolve()
  await attempt
  expect(mocks.open).toHaveBeenCalledExactlyOnceWith({ transactionId: 'txn_first' })
})

// 왜: 기존 구독자는 새 구독을 사는 대신 서버가 계산한 변경 내용을 먼저 확인해야 한다.
it('기존 구독의 플랜 변경은 옵션창을 닫은 뒤 별도 확인창으로 넘긴다', async () => {
  const preview = { targetPlan: 'pro', direction: 'upgrade', chargeTodayUsd: 49, nextBilledAt: null, takesAdded: 100, currentBalance: 10 }
  mocks.fetch.mockResolvedValue(Response.json({ error: 'already_subscribed', planChange: preview }, { status: 409 }))
  const hook = await mount()
  const ready = deferred<void>()
  const entered = deferred<void>()
  const attempt = hook.current.startCheckout({ kind: 'plan', id: 'pro', onReady: () => { entered.resolve(); return ready.promise } })
  await entered.promise
  expect(hook.render().planChange).toBeNull()
  ready.resolve()
  await attempt
  expect(hook.render().planChange).toMatchObject(preview)
  expect(mocks.open).not.toHaveBeenCalled()
  expect(mocks.fetch).toHaveBeenCalledTimes(1)
})

// 왜: 버튼 비활성화가 화면에 반영되기 전에 두 번 눌러도 거래는 하나여야 한다.
it('구매 버튼을 연속으로 눌러도 진행 중인 거래는 하나만 만든다', async () => {
  const response = deferred<Response>()
  mocks.fetch.mockReturnValue(response.promise)
  const hook = await mount()
  const first = hook.current.startCheckout({ kind: 'pack', id: 'mini' })
  const second = hook.current.startCheckout({ kind: 'pack', id: 'mini' })
  expect(hook.render().busy).toBe(true)
  expect(mocks.fetch).toHaveBeenCalledTimes(1)
  response.resolve(Response.json({ transactionId: 'txn_first' }))
  await Promise.all([first, second])
  expect(mocks.open).toHaveBeenCalledTimes(1)
  expect(hook.render().busy).toBe(false)
})

// 왜: 네트워크 실패가 바깥으로 새면 고객은 안내 없이 멈추고 다시 살 수도 없다.
it('구매 요청이 실패하면 안내하고 다시 시도할 수 있다', async () => {
  mocks.fetch.mockRejectedValueOnce(new Error('Network unavailable'))
  const hook = await mount()
  await expect(hook.current.startCheckout({ kind: 'pack', id: 'mini' })).resolves.toBeUndefined()
  expect(mocks.error).toHaveBeenCalledExactlyOnceWith('Could not open checkout. Please try again.')
  expect(hook.render().busy).toBe(false)
  await hook.current.startCheckout({ kind: 'pack', id: 'mini' })
  expect(mocks.open).toHaveBeenCalledTimes(1)
})

// 왜: Paddle 창을 열다 실패한 경우 지난 이벤트 연결을 남기지 않고 재시도를 허용해야 한다.
it('결제창 열기가 실패하면 안내하고 다시 시도할 수 있다', async () => {
  mocks.open.mockImplementationOnce(() => { throw new Error('Checkout unavailable') })
  const hook = await mount()
  await expect(hook.current.startCheckout({ kind: 'pack', id: 'mini' })).resolves.toBeUndefined()
  expect(mocks.error).toHaveBeenCalledExactlyOnceWith('Could not open checkout. Please try again.')
  expect(mocks.listeners.size).toBe(0)
  expect(hook.render().busy).toBe(false)
  mocks.fetch.mockResolvedValue(Response.json({ transactionId: 'txn_retry' }))
  await hook.current.startCheckout({ kind: 'pack', id: 'mini' })
  expect(mocks.open).toHaveBeenLastCalledWith({ transactionId: 'txn_retry' })
})

// 왜: 창 열기 호출 뒤 늦게 도착하는 Paddle 실패도 안내하고 그 구매의 연결을 정리해야 한다.
it('결제창에서 뒤늦게 실패를 알리면 안내하고 다시 시도할 수 있다', async () => {
  mocks.fetch.mockImplementation(async () => Response.json({ transactionId: 'txn_first' }))
  const hook = await mount()
  for (const event of ['checkout.error', 'checkout.failed']) {
    await hook.current.startCheckout({ kind: 'pack', id: 'mini' })
    emit(event, 'txn_first')
    expect(mocks.listeners.size).toBe(0)
    expect(hook.render().busy).toBe(false)
  }
  expect(mocks.error).toHaveBeenCalledTimes(2)
  expect(mocks.error).toHaveBeenLastCalledWith('Could not open checkout. Please try again.')
  expect(mocks.open).toHaveBeenCalledTimes(2)
})

// 왜: 초기화가 거래 링크를 자동으로 열어도 별도 결제 페이지의 이벤트 연결을 덮어쓰면 안 된다.
it('결제창 준비 전부터 상태를 받으며 다른 화면의 연결을 지킨다', async () => {
  const other = vi.fn()
  mocks.listeners.add(other)
  mocks.loadPaddle.mockImplementation(async () => {
    expect(mocks.listeners.size).toBe(2)
    emit('checkout.loaded', 'txn_link')
    return { Checkout: { open: mocks.open } }
  })
  const { current } = await mount()
  await current.startCheckout({ kind: 'pack', id: 'mini' })
  expect(other).toHaveBeenCalledTimes(1)
})

// 왜: 이전 구매나 다른 거래의 완료 이벤트가 같은 결제를 두 번 확인하게 하면 안 된다.
it('자기 거래가 완료된 경우에만 결제를 한 번 확인한다', async () => {
  vi.useFakeTimers()
  const { current } = await mount()
  await current.startCheckout({ kind: 'pack', id: 'mini' })
  emit('checkout.completed', 'txn_other')
  expect(mocks.loading).not.toHaveBeenCalled()
  emit('checkout.completed', 'txn_first')
  emit('checkout.completed', 'txn_first')
  expect(mocks.loading).toHaveBeenCalledExactlyOnceWith('Confirming your payment…')
  mocks.fetchTakeBalance.mockResolvedValue({ balance: 20 })
  await vi.advanceTimersByTimeAsync(3000)
  expect(mocks.success).toHaveBeenCalledTimes(1)
  expect(mocks.refetchBillingAccount).toHaveBeenCalledTimes(1)
})

// 왜: 다음 구매와 화면 이탈 뒤 지난 구매의 완료 안내가 다시 나타나면 안 된다.
it('다음 구매와 화면 이탈 때 지난 구매의 상태 연결만 끝낸다', async () => {
  const other = vi.fn()
  mocks.listeners.add(other)
  const hook = await mount()
  await hook.current.startCheckout({ kind: 'pack', id: 'mini' })
  expect(mocks.listeners.size).toBe(2)
  mocks.fetch.mockResolvedValue(Response.json({ transactionId: 'txn_second' }))
  await hook.current.startCheckout({ kind: 'pack', id: 'small' })
  expect(mocks.listeners.size).toBe(2)
  emit('checkout.completed', 'txn_first')
  expect(mocks.loading).not.toHaveBeenCalled()
  hook.unmount()
  expect(mocks.listeners.size).toBe(1)
  emit('checkout.completed', 'txn_second')
  expect(mocks.loading).not.toHaveBeenCalled()
  expect(other).toHaveBeenCalledTimes(2)
})

// 왜: 요청을 기다리는 사이 사용자가 다른 페이지로 이동했다면 뒤늦게 결제창을 띄우면 안 된다.
it('구매 준비 중 화면을 떠나면 결제창을 뒤늦게 열지 않는다', async () => {
  const response = deferred<Response>()
  mocks.fetch.mockReturnValue(response.promise)
  const hook = await mount()
  const attempt = hook.current.startCheckout({ kind: 'pack', id: 'mini' })
  hook.unmount()
  response.resolve(Response.json({ transactionId: 'txn_first' }))
  await attempt
  expect(mocks.open).not.toHaveBeenCalled()
  expect(mocks.listeners.size).toBe(0)
})
