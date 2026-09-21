// 유저가 스스로 플랜을 올리고 내린다 (#payments-phase-3 P15).
//
//   2026-09-08 샌드박스 실측(plan-change-probe.html): "전액 즉시 청구 + 갱신일 리셋" 은 한 요청으로 안 된다
//   (Paddle: "not possible to change items and billing date in the same request"). 두 요청으로 나눈다.
//   ① items + full_immediately → 새 플랜 한 달치 전액 청구. 그 결제가 웹훅으로 돌아와 Take 를 적립한다(실측 확인).
//   ② next_billed_at + do_not_bill → 갱신일을 오늘+1개월로. 추가 청구 없음.
//   하위 플랜은 do_not_bill 한 요청으로 다음 갱신일부터.
import { describe, expect, it } from 'vitest'

import { decidePlanChange } from '@/lib/billing/plan-change'

const NOW = new Date('2026-09-15T00:00:00.000Z')

describe('플랜 변경 판정', () => {
  // 왜: 정상 경로 고정(상위). 09-07 오너 확정 — 그날 전액, 갱신일 리셋, 남은 Take 는 그대로 얹는다.
  it('상위 플랜으로 올리면 오늘 전액을 내고 갱신일이 오늘로 리셋된다', () => {
    const d = decidePlanChange({ currentPlan: 's5', targetPlan: 's10', subscriptionId: 'sub_1', now: NOW })
    expect(d.ok).toBe(true)
    if (!d.ok) return
    expect(d.direction).toBe('upgrade')
    expect(d.chargeTodayUsd).toBe(110)
    expect(d.steps.map((s) => s.prorationBillingMode)).toEqual(['full_immediately', 'do_not_bill'])
    expect(d.nextBilledAt).toBe('2026-10-15T00:00:00.000Z')
    expect(d.takesAdded).toBe(100)
  })

  // 왜: 09-07 오너 확정 — 옛 플랜 안 쓴 날짜는 안 깎는다(Take 이월과 날짜 크레딧을 둘 다 주면 이중 보상).
  it('상위로 올릴 때 옛 플랜의 남은 날짜를 깎지 않는다', () => {
    const d = decidePlanChange({ currentPlan: 's1', targetPlan: 's2', subscriptionId: 'sub_1', now: NOW })
    expect(d.ok).toBe(true)
    if (!d.ok) return
    // S-2 정가 $30 그대로. 남은 날짜만큼 깎으면 $14.64 가 된다(prorated_immediately, 실측).
    expect(d.chargeTodayUsd).toBe(30)
  })

  // 왜: 09-07 오너 확정 — 하위는 다음 갱신일부터. 지금 돈을 돌려주지 않는다.
  it('하위 플랜으로 내리면 지금 결제가 없고 다음 갱신일부터 바뀐다', () => {
    const d = decidePlanChange({ currentPlan: 's10', targetPlan: 's2', subscriptionId: 'sub_1', now: NOW })
    expect(d.ok).toBe(true)
    if (!d.ok) return
    expect(d.direction).toBe('downgrade')
    expect(d.chargeTodayUsd).toBe(0)
    expect(d.steps).toHaveLength(1)
    expect(d.steps[0].prorationBillingMode).toBe('do_not_bill')
    expect(d.nextBilledAt).toBeNull()
  })

  // 왜: 같은 플랜을 다시 누르면 돈만 나가고 아무것도 안 바뀐다. 화면이 막아도 서버가 다시 막는다.
  it('같은 플랜으로는 바꿀 수 없다', () => {
    const d = decidePlanChange({ currentPlan: 's5', targetPlan: 's5', subscriptionId: 'sub_1', now: NOW })
    expect(d.ok).toBe(false)
    if (d.ok) return
    expect(d.reason).toBe('same_plan')
  })

  // 왜: 구독이 없는 유저는 플랜 변경이 아니라 신규 구독이다. 결제창을 띄워야 한다.
  it('구독이 없으면 플랜 변경이 아니라 신규 구독으로 보낸다', () => {
    const d = decidePlanChange({ currentPlan: 'free', targetPlan: 's2', subscriptionId: null, now: NOW })
    expect(d.ok).toBe(false)
    if (d.ok) return
    expect(d.reason).toBe('no_subscription')
  })

  // 왜: 없는 플랜 ID 가 오면 Paddle 에 엉뚱한 가격으로 청구가 나간다.
  it('모르는 플랜으로는 바꿀 수 없다', () => {
    const d = decidePlanChange({ currentPlan: 's1', targetPlan: 'enterprise', subscriptionId: 'sub_1', now: NOW })
    expect(d.ok).toBe(false)
    if (d.ok) return
    expect(d.reason).toBe('unknown_plan')
  })

  // 왜: 상위 변경은 요청이 둘이라 1번만 성공하면 돈은 받았는데 갱신일이 안 밀린다. 순서가 뒤집히면 안 된다.
  it('상위 변경은 청구가 먼저고 갱신일 리셋이 나중이다', () => {
    const d = decidePlanChange({ currentPlan: 's1', targetPlan: 's10', subscriptionId: 'sub_1', now: NOW })
    expect(d.ok).toBe(true)
    if (!d.ok) return
    expect(d.steps[0].items).toHaveLength(1)
    expect(d.steps[0].nextBilledAt).toBeUndefined()
    expect(d.steps[1].items).toBeUndefined()
    expect(d.steps[1].nextBilledAt).toBe('2026-10-15T00:00:00.000Z')
  })
})
