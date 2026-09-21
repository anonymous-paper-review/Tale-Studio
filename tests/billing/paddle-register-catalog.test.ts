// 상품-가격은 pricing page 기반으로 채워줘. 선택한 상품 분류로 등록하고 기존 항목은 중복 생성하지 않는다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PADDLE_PLANS, PADDLE_TAKE_PACKS } from '@/lib/billing/catalog'

// 실제 키 파일은 읽지 않고 모든 Paddle 요청은 아래 메모리 카탈로그에서만 처리한다.
vi.mock('node:fs', async (importOriginal) => ({
  ...await importOriginal<typeof import('node:fs')>(),
  readFileSync: vi.fn(() => 'PADDLE_API_KEY=pdl_sdbx_apikey_test\nNEXT_PUBLIC_PADDLE_ENV=sandbox'),
}))

interface Product {
  id: string
  name: string
  tax_category: string
  custom_data: { tale_id: string }
}

interface Price {
  id: string
  product_id: string
  unit_price: { amount: string; currency_code: string }
  billing_cycle: { interval: string; frequency: number } | null
  custom_data: { tale_id: string }
}

const originalArgv = process.argv
let products: Product[]
let prices: Price[]
let requests: { method: string; url: URL }[]

async function run(...args: string[]) {
  vi.resetModules()
  process.argv = ['node', 'scripts/paddle-register-catalog.mts', ...args]
  await import('../../scripts/paddle-register-catalog.mts')
}

beforeEach(() => {
  products = []
  prices = []
  requests = []
  vi.stubEnv('PADDLE_API_KEY', 'pdl_sdbx_apikey_test')
  vi.stubEnv('PADDLE_LIVE_API_KEY', 'pdl_live_apikey_test')
  vi.stubEnv('NEXT_PUBLIC_PADDLE_ENV', 'sandbox')
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input))
    const method = init?.method ?? 'GET'
    requests.push({ method, url })
    if (method === 'GET' && url.pathname === '/products') return Response.json({ data: products })
    if (method === 'GET' && url.pathname === '/prices') return Response.json({ data: prices })
    const body = JSON.parse(String(init?.body))
    if (method === 'POST' && url.pathname === '/products') {
      const product = { ...body, id: `pro_${products.length + 1}` } as Product
      products.push(product)
      return Response.json({ data: product })
    }
    if (method === 'POST' && url.pathname === '/prices') {
      const price = { ...body, id: `pri_${prices.length + 1}` } as Price
      prices.push(price)
      return Response.json({ data: price })
    }
    throw new Error(`Unexpected request: ${method} ${url.pathname}`)
  }))
})

afterEach(() => {
  process.argv = originalArgv
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe.each([['--tax-category=saas'], ['--tax-category', 'saas']])('SaaS 상품 분류 %s', (...args) => {
  // 왜: 승인된 SaaS 분류로 가격 페이지와 같은 상품 13개를 등록해야 한다.
  it('상품-가격은 pricing page 기반으로 채워줘', async () => {
    await run(...args)
    expect(products).toHaveLength(PADDLE_PLANS.length + PADDLE_TAKE_PACKS.length)
    expect(prices).toHaveLength(products.length)
    expect(products.every((product) => product.tax_category === 'saas')).toBe(true)
    const productByTale = new Map(products.map((product) => [product.custom_data.tale_id, product]))
    const priceByTale = new Map(prices.map((price) => [price.custom_data.tale_id, price]))
    for (const plan of PADDLE_PLANS) {
      expect(productByTale.get(`plan:${plan.id}`)?.name).toBe(`Tale Studio ${plan.name}`)
      expect(priceByTale.get(`plan:${plan.id}`)).toMatchObject({
        product_id: productByTale.get(`plan:${plan.id}`)?.id,
        unit_price: { amount: String(plan.monthlyPriceUsd * 100), currency_code: 'USD' },
        billing_cycle: { interval: 'month', frequency: 1 },
      })
    }
    for (const pack of PADDLE_TAKE_PACKS) {
      expect(productByTale.get(`pack:${pack.id}`)?.name).toBe(`Tale Studio Take pack ${pack.name}`)
      expect(priceByTale.get(`pack:${pack.id}`)).toMatchObject({
        product_id: productByTale.get(`pack:${pack.id}`)?.id,
        unit_price: { amount: String(pack.priceUsd * 100), currency_code: 'USD' },
        billing_cycle: null,
      })
    }
  })
})

// 왜: 기존 등록 명령을 그대로 쓰면 분류를 바꾸지 않아야 한다.
it('상품 분류를 지정하지 않으면 기존 기본 분류를 사용한다', async () => {
  await run()
  expect(products.every((product) => product.tax_category === 'standard')).toBe(true)
})

// 왜: 등록을 다시 실행했을 때 상품과 가격이 늘어나면 잘못된 결제 번호를 연결할 수 있다.
it('이미 등록한 상품과 가격은 다시 만들지 않는다', async () => {
  await run('--tax-category=saas')
  const registeredPrices = prices.map((price) => price.id)
  const writes = requests.filter((request) => request.method === 'POST').length
  await run('--tax-category=saas')
  expect(requests.filter((request) => request.method === 'POST')).toHaveLength(writes)
  expect(prices.map((price) => price.id)).toEqual(registeredPrices)
})

// 왜: 분류를 잘못 입력한 채 기본값으로 등록하면 승인된 SaaS 분류와 달라진다.
it.each([['--tax-category=unknown'], ['--tax-category']])('지원하지 않는 상품 분류이면 등록을 시작하지 않는다 (%s)', async (...args) => {
  await expect(run(...args)).rejects.toThrow(/tax-category/)
  expect(requests).toHaveLength(0)
})

// 왜: 라이브 등록 전에 가격표를 검토하는 명령은 카탈로그를 변경하지 않아야 한다.
it('미리보기로 실행하면 라이브 상품과 가격을 만들지 않는다', async () => {
  await run('--live', '--dry-run', '--tax-category=saas')
  expect(requests).toHaveLength(2)
  expect(requests.every((request) => request.method === 'GET' && request.url.hostname === 'api.paddle.com')).toBe(true)
  expect(products).toHaveLength(0)
  expect(prices).toHaveLength(0)
})
