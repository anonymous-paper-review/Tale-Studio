// 가격 페이지의 플랜·팩 가격과 포함 Take는 v4 시트와 같고, Paddle 상품 ID를 모르는 상품은 결제 버튼이 비활성이다.
//   금액 기대값은 v4 시트, 고객용 이름은 2026-09-10 오너 지시(Starter1·Producer10)를 따른다.
//   시트가 바뀌면 여기 숫자도 오너 결정으로 같이 바뀐다 (.claude/docs/2026-09-07/paddle-promises.md §P2).
import { describe, expect, it } from 'vitest'

import {
  PADDLE_PLANS,
  PADDLE_TAKE_PACKS,
  isPurchasable,
  type PaddlePlan,
  type PaddleTakePack,
} from '@/lib/billing/catalog'
import { getPlanEntitlements } from '@/lib/plan-limits'

// v4 3_요금제 — 플랜 | 프로젝트당 생성 최대(분) | 최대 연결 | Account | 포함 Take | Export | 월 가격($)
const V4_PLANS = [
  ['s1', 'Starter1', 1, 1, 1, 16, false, 15],
  ['s2', 'Starter2', 2, 1, 1, 30, false, 30],
  ['s5', 'Starter5', 5, 1, 1, 60, false, 60],
  ['s10', 'Starter10', 10, 1, 1, 100, false, 110],
  ['p10', 'Producer10', 10, 2, 3, 150, true, 199],
  ['p15', 'Producer15', 15, 3, 4, 200, true, 449],
  ['p20', 'Producer20', 20, 3, 5, 360, true, 649],
  ['p25', 'Producer25', 25, 4, 6, 410, true, 999],
  ['p30', 'Producer30', 30, 4, 8, 710, true, 1299],
] as const

// v4 2_Take경제 — 팩 | Take 수 | 가격($)
const V4_PACKS = [
  ['mini', 'Mini', 50, 29],
  ['standard', 'Standard', 200, 109],
  ['pro', 'Pro', 1000, 479],
  ['studio', 'Studio', 5000, 2199],
] as const

const planById = (id: string): PaddlePlan => {
  const plan = PADDLE_PLANS.find((p) => p.id === id)
  if (!plan) throw new Error(`plan ${id} missing from catalog`)
  return plan
}

const packById = (id: string): PaddleTakePack => {
  const pack = PADDLE_TAKE_PACKS.find((p) => p.id === id)
  if (!pack) throw new Error(`pack ${id} missing from catalog`)
  return pack
}

describe('가격 페이지 상품 목록', () => {
  it('고객에게는 Starter1·Producer10 형식의 이름을 표시하고 내부 코드와 월 가격은 유지한다', () => {
    expect(PADDLE_PLANS.map((p) => p.id)).toEqual(V4_PLANS.map((row) => row[0]))
    for (const [id, name, , , , , , priceUsd] of V4_PLANS) {
      const plan = planById(id)
      expect(plan.name, id).toBe(name)
      expect(plan.monthlyPriceUsd, id).toBe(priceUsd)
    }
  })

  it('플랜의 축 4개(프로젝트당 분·연결·Take·Export)와 Account는 v4 시트와 같다', () => {
    for (const [id, , minutes, linked, seats, takes, canExport] of V4_PLANS) {
      const e = getPlanEntitlements(id)
      expect(e.maxMinutesPerProject, `${id} minutes`).toBe(minutes)
      expect(e.maxLinkedProjects, `${id} linked`).toBe(linked)
      expect(e.accountSeats, `${id} seats`).toBe(seats)
      expect(e.includedTakesPerMonth, `${id} takes`).toBe(takes)
      expect(e.canExport, `${id} export`).toBe(canExport)
      // 카탈로그는 축을 복제하지 않고 plan-limits 를 그대로 가리킨다.
      expect(planById(id).entitlements).toEqual(e)
    }
  })

  it('팩 4개의 Take 수와 가격은 v4 시트와 같다(Mini 50/$29 … Studio 5000/$2,199)', () => {
    expect(PADDLE_TAKE_PACKS.map((p) => p.id)).toEqual(V4_PACKS.map((row) => row[0]))
    for (const [id, name, takes, priceUsd] of V4_PACKS) {
      const pack = packById(id)
      expect(pack.name, id).toBe(name)
      expect(pack.takes, id).toBe(takes)
      expect(pack.priceUsd, id).toBe(priceUsd)
    }
  })

  it('스타터는 S-1~S-10, 프로덕션은 P-10~P-30 으로 나뉜다', () => {
    expect(PADDLE_PLANS.filter((p) => p.tier === 'starter').map((p) => p.id)).toEqual(['s1', 's2', 's5', 's10'])
    expect(PADDLE_PLANS.filter((p) => p.tier === 'production').map((p) => p.id)).toEqual([
      'p10',
      'p15',
      'p20',
      'p25',
      'p30',
    ])
  })

  it('무료 플랜과 스튜디오 티어는 결제 상품 목록에 없다', () => {
    const ids: string[] = PADDLE_PLANS.map((p) => p.id)
    expect(ids).not.toContain('free')
    expect(ids.some((id) => id.startsWith('studio'))).toBe(false)
  })

  it('Paddle 가격 ID를 모르는 상품은 결제 버튼이 비활성이다', () => {
    expect(isPurchasable({ ...planById('s1'), paddlePriceId: null })).toBe(false)
    expect(isPurchasable({ ...planById('s1'), paddlePriceId: '' })).toBe(false)
    expect(isPurchasable({ ...planById('s1'), paddlePriceId: 'pri_01test' })).toBe(true)
    expect(isPurchasable({ ...packById('mini'), paddlePriceId: null })).toBe(false)
    expect(isPurchasable({ ...packById('mini'), paddlePriceId: 'pri_01test' })).toBe(true)
  })
})
