// 구독 행은 워크스페이스당 하나가 아니라 "활성 하나 + 지난 것들"이다 (#payments-phase-3).
//
//   2026-09-08 사고: 스모크가 만든 가짜 구독이 진짜 구독 행을 덮어쓰고, 정리 단계에서 가짜 ID 로 지우니
//   덮어쓰인 진짜 행이 함께 사라졌다. Paddle 에는 구독이 살아 있는데 우리 DB 에는 없는 상태가 됐다.
//   원인은 subscriptions.workspace_id 가 기본키라 워크스페이스당 행이 물리적으로 하나뿐이었던 것.
//   구조를 "구독 하나당 한 행 + 활성은 워크스페이스당 하나" 로 바꿔 덮어쓰기 자체를 없앤다.
import { describe, expect, it } from 'vitest'

import { pickActiveSubscription, type SubscriptionRow } from '@/lib/billing/subscription-state'

const row = (over: Partial<SubscriptionRow> & Pick<SubscriptionRow, 'mor_subscription_id' | 'status'>): SubscriptionRow => ({
  workspace_id: 'ws-1',
  plan: 's1',
  current_period_end: '2026-10-07T10:45:18.793Z',
  updated_at: '2026-09-07T10:45:18.793Z',
  ...over,
})

describe('활성 구독 고르기', () => {
  // 왜: 정상 경로 고정. 구독이 하나뿐인 흔한 경우.
  it('활성 구독이 하나면 그것을 고른다', () => {
    const active = pickActiveSubscription([row({ mor_subscription_id: 'sub_a', status: 'active' })])
    expect(active?.mor_subscription_id).toBe('sub_a')
  })

  // 왜: 취소하고 다시 구독하면 Paddle 구독 번호가 새로 생긴다. 지난 것은 이력으로 남고 화면은 새 것을 봐야 한다.
  it('지난 구독이 남아 있어도 활성인 것을 고른다', () => {
    const active = pickActiveSubscription([
      row({ mor_subscription_id: 'sub_old', status: 'canceled', updated_at: '2026-08-01T00:00:00Z' }),
      row({ mor_subscription_id: 'sub_new', status: 'active', updated_at: '2026-09-07T00:00:00Z' }),
    ])
    expect(active?.mor_subscription_id).toBe('sub_new')
  })

  // 왜: 갱신 결제가 실패하면 past_due 다. 아직 살아 있는 구독이라 화면에 보여야 한다(무료로 떨어져도 복구 대상).
  it('past_due 구독도 활성으로 본다', () => {
    const active = pickActiveSubscription([row({ mor_subscription_id: 'sub_x', status: 'past_due' })])
    expect(active?.mor_subscription_id).toBe('sub_x')
  })

  // 왜: 전부 취소된 워크스페이스는 "구독 없음"이 맞다. 지난 구독을 현재 플랜으로 보이면 안 판 것을 판 것처럼 된다.
  it('전부 지난 구독이면 활성은 없다', () => {
    const active = pickActiveSubscription([
      row({ mor_subscription_id: 'sub_a', status: 'canceled' }),
      row({ mor_subscription_id: 'sub_b', status: 'canceled' }),
    ])
    expect(active).toBeNull()
  })

  // 왜: 이력이 쌓이면 어느 것이 최신인지 정해야 한다. 같은 상태면 최근에 바뀐 것.
  it('활성이 여럿이면 가장 최근에 바뀐 것을 고른다', () => {
    const active = pickActiveSubscription([
      row({ mor_subscription_id: 'sub_old', status: 'active', updated_at: '2026-09-01T00:00:00Z' }),
      row({ mor_subscription_id: 'sub_new', status: 'active', updated_at: '2026-09-08T00:00:00Z' }),
    ])
    expect(active?.mor_subscription_id).toBe('sub_new')
  })

  // 왜: 취소 후 재구독하면 Paddle 번호가 새로 생긴다. 옛 구독을 안 내리면 활성이 둘이 되어 DB 가 웹훅을 막는다.
  it('밀려난 구독(superseded)은 활성으로 보지 않는다', () => {
    const active = pickActiveSubscription([
      row({ mor_subscription_id: 'sub_old', status: 'superseded', updated_at: '2026-09-08T00:00:00Z' }),
      row({ mor_subscription_id: 'sub_new', status: 'active', updated_at: '2026-09-07T00:00:00Z' }),
    ])
    expect(active?.mor_subscription_id).toBe('sub_new')
  })

  it('구독이 하나도 없으면 없음이다', () => {
    expect(pickActiveSubscription([])).toBeNull()
    expect(pickActiveSubscription(null)).toBeNull()
  })
})
