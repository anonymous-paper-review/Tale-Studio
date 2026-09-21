#!/usr/bin/env node
// paddle-register-catalog.mts — 우리 플랜 9개·팩 4개를 Paddle 에 상품·가격으로 등록하고 env 줄을 찍는다 (#payments-phase-3 P6).
//
// 숫자는 src/lib/billing/catalog.ts 하나만 안다 — 이 스크립트는 가격을 다시 적지 않는다. 시트→catalog→Paddle 이 한 줄이다.
// 멱등: 상품마다 custom_data.tale_id 를 심고, 이미 있으면 만들지 않고 가격 ID 만 다시 찍는다. 라이브 갈 때 같은 스크립트를
//   라이브 키로 다시 돌린다(샌드박스·라이브는 별개 계정이라 카탈로그도 따로).
//
// 사용:
//   node --import ./tests/fixtures/alias-hook.mjs scripts/paddle-register-catalog.mts            # 등록(또는 재조회) 후 env 줄 출력
//   node --import ./tests/fixtures/alias-hook.mjs scripts/paddle-register-catalog.mts --dry-run  # 만들 것만 보여줌
//   node --import ./tests/fixtures/alias-hook.mjs scripts/paddle-register-catalog.mts --live --tax-category=saas # 승인된 SaaS 분류로 신규 상품 등록
//   --tax-category 는 standard(기본값) 또는 saas. 기존 상품의 분류는 변경하지 않는다.
//   PADDLE_API_KEY · NEXT_PUBLIC_PADDLE_ENV(sandbox|production) 를 .env.local 에서 읽는다.

import { readFileSync } from 'node:fs'
import { parseArgs } from 'node:util'
import { PADDLE_PLANS, PADDLE_TAKE_PACKS } from '@/lib/billing/catalog'

const { values: options } = parseArgs({
  options: {
    'dry-run': { type: 'boolean', default: false },
    live: { type: 'boolean', default: false },
    'tax-category': { type: 'string', default: 'standard' },
  },
})
const dryRun = options['dry-run']
// 라이브는 --live 를 명시할 때만 건드린다. env 하나로 갈리면 로컬에서 실수로 라이브에 상품이 생긴다.
//   라이브 키는 PADDLE_LIVE_API_KEY 로 따로 둔다(CLAUDE.md 키 스코프 규칙).
const live = options.live
const taxCategory = options['tax-category']
if (taxCategory !== 'standard' && taxCategory !== 'saas') {
  throw new Error('--tax-category must be standard or saas')
}

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')]
    }),
) as Record<string, string>

const apiKey = live ? (process.env.PADDLE_LIVE_API_KEY ?? env.PADDLE_LIVE_API_KEY) : (process.env.PADDLE_API_KEY ?? env.PADDLE_API_KEY)
const paddleEnv = process.env.NEXT_PUBLIC_PADDLE_ENV ?? env.NEXT_PUBLIC_PADDLE_ENV ?? 'sandbox'
if (!apiKey) throw new Error(live ? 'PADDLE_LIVE_API_KEY missing' : 'PADDLE_API_KEY missing')
// --live 는 라이브 키를, 아니면 샌드박스 키를 요구한다. 섞이면 엉뚱한 계정에 상품이 생긴다.
if (live && apiKey.includes('_sdbx')) throw new Error('--live 인데 샌드박스 키다 (PADDLE_LIVE_API_KEY 확인)')
if (!live && paddleEnv === 'sandbox' && !apiKey.includes('_sdbx')) throw new Error('sandbox env but key is not a sandbox key')
if (paddleEnv === 'production' && apiKey.includes('_sdbx')) throw new Error('production env but key is a sandbox key')
const BASE = live || paddleEnv === 'production' ? 'https://api.paddle.com' : 'https://sandbox-api.paddle.com'

async function paddle<T>(method: 'GET' | 'POST' | 'PATCH', path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  const json = (await res.json()) as { data?: T; error?: { detail?: string; code?: string } }
  if (!res.ok || json.error) throw new Error(`${method} ${path} → ${res.status} ${json.error?.code ?? ''} ${json.error?.detail ?? ''}`)
  return json.data as T
}

interface PaddleProduct {
  id: string
  name: string
  status: string
  custom_data?: { tale_id?: string } | null
}
interface PaddlePrice {
  id: string
  product_id: string
  status: string
  custom_data?: { tale_id?: string } | null
  unit_price: { amount: string; currency_code: string }
  billing_cycle: { interval: string; frequency: number } | null
}

interface CatalogItem {
  taleId: string
  envKey: string
  productName: string
  productDescription: string
  priceName: string
  amountMinor: number
  recurring: boolean
}

const items: CatalogItem[] = [
  ...PADDLE_PLANS.map((p) => ({
    taleId: `plan:${p.id}`,
    envKey: `NEXT_PUBLIC_PADDLE_PRICE_PLAN_${p.id.toUpperCase()}`,
    productName: `Tale Studio ${p.name}`,
    productDescription: `${p.entitlements.maxMinutesPerProject} min per project · ${p.entitlements.maxLinkedProjects} linked · ${p.entitlements.includedTakesPerMonth} Takes/month · ${p.entitlements.accountSeats} accounts${p.entitlements.canExport ? ' · Export' : ''}`,
    priceName: `${p.name} monthly`,
    amountMinor: p.monthlyPriceUsd * 100,
    recurring: true,
  })),
  ...PADDLE_TAKE_PACKS.map((p) => ({
    taleId: `pack:${p.id}`,
    envKey: `NEXT_PUBLIC_PADDLE_PRICE_PACK_${p.id.toUpperCase()}`,
    productName: `Tale Studio Take pack ${p.name}`,
    productDescription: `${p.takes.toLocaleString('en-US')} Takes · valid 12 months`,
    priceName: `${p.name} pack (${p.takes} Takes)`,
    amountMinor: p.priceUsd * 100,
    recurring: false,
  })),
]

async function listAll<T>(path: string): Promise<T[]> {
  const out: T[] = []
  let after: string | null = null
  for (;;) {
    const page: T[] = await paddle<T[]>('GET', `${path}${path.includes('?') ? '&' : '?'}per_page=200${after ? `&after=${after}` : ''}`)
    out.push(...page)
    if (page.length < 200) break
    after = (page[page.length - 1] as unknown as { id: string }).id
  }
  return out
}

const existingProducts = await listAll<PaddleProduct>('/products?status=active')
const existingPrices = await listAll<PaddlePrice>('/prices?status=active')
const productByTale = new Map(existingProducts.filter((p) => p.custom_data?.tale_id).map((p) => [p.custom_data!.tale_id!, p]))
const priceByTale = new Map(existingPrices.filter((p) => p.custom_data?.tale_id).map((p) => [p.custom_data!.tale_id!, p]))

const envLines: string[] = []
for (const item of items) {
  let product = productByTale.get(item.taleId)
  let price = priceByTale.get(item.taleId)
  const action = product && price ? 'exists' : product ? 'price only' : 'create'
  console.log(`${action.padEnd(10)} ${item.taleId.padEnd(14)} ${item.productName} — $${item.amountMinor / 100}${item.recurring ? '/mo' : ''}`)
  if (dryRun) continue
  if (!product) {
    product = await paddle<PaddleProduct>('POST', '/products', {
      name: item.productName,
      description: item.productDescription,
      tax_category: taxCategory,
      custom_data: { tale_id: item.taleId },
    })
  }
  if (!price) {
    price = await paddle<PaddlePrice>('POST', '/prices', {
      product_id: product.id,
      description: item.priceName,
      name: item.priceName,
      unit_price: { amount: String(item.amountMinor), currency_code: 'USD' },
      billing_cycle: item.recurring ? { interval: 'month', frequency: 1 } : null,
      quantity: { minimum: 1, maximum: 1 },
      custom_data: { tale_id: item.taleId },
    })
  }
  // 가격 차이는 경고만. Paddle은 가격 수정을 지원하지만 이 등록 명령은 기존 가격을 바꾸지 않는다.
  if (price.unit_price.amount !== String(item.amountMinor)) {
    console.warn(`  ⚠ price mismatch for ${item.taleId}: paddle=${price.unit_price.amount} catalog=${item.amountMinor}. review the existing price before updating or replacing it.`)
  }
  envLines.push(`${item.envKey}=${price.id}`)
}

if (!dryRun) {
  console.log('\n# env (' + paddleEnv + ') — .env.local 와 Vercel 스코프에 넣는다')
  console.log(envLines.join('\n'))
}
