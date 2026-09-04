// 영상 일괄 생성의 Take 사전 계산 (약속 E, 2026-09-04) — 순수 함수만. 버튼 확인창과 채팅 승인 카드가 같은 계산을 쓴다.
//
//   오너 결정(E2, 1안): Take가 모자라면 가진 만큼 앞에서부터 만들고 "N개 중 M개만 만들 수 있어요"라고 미리 알린다.
//   과금 모드: off = Take 줄 없음(계산만) · shadow = 숫자는 보이되 막지 않는다(전부 만든다) · enforce = 가진 만큼만.
//   단가는 서버 hold 와 같은 계산기(take-cost)로, 새 take 는 마더(샷)의 모델을 물려받는다(director-store 결정 #13).
import type { DirectorNode } from '@/types/director'
import { isShotData } from '@/types/director'
import { takeCostForVideo } from '@/lib/billing/take-cost'
import { normalizeProvider } from '@/lib/video-models'
import type { TakeBillingMode } from '@/lib/billing/take-hold'

export interface VideoBatchPlan {
  /** 만들 영상 수(자격 있는 샷 수) */
  total: number
  /** 전부 만들 때 필요한 Take */
  requiredTakes: number
  /** 지금 가진 Take. null = 제한 없음(admin) 또는 모드 off */
  balance: number | null
  mode: TakeBillingMode
  /** 가진 Take 로 앞에서부터 만들 수 있는 수 */
  affordable: number
  /** 실제로 요청할 수 — enforce 면 affordable, 그 밖엔 total */
  runCount: number
  /** Take 가 모자란가(모드가 off 가 아니고 잔액이 있을 때만 참일 수 있다) */
  short: boolean
}

/** 샷 순서대로 영상 한 편의 Take 단가 — 샷의 모델(legacy 'kling' 포함)을 정규화해 계산기에 넣는다. */
export function videoBatchTakeCosts(nodes: readonly DirectorNode[], shotIds: readonly string[]): number[] {
  const byId = new Map(nodes.map((n) => [n.id, n] as const))
  return shotIds.map((id) => {
    const node = byId.get(id)
    const provider = node && isShotData(node.data) ? node.data.provider : null
    return takeCostForVideo(provider ? normalizeProvider(provider) : null)
  })
}

export function planVideoBatch(costs: readonly number[], balance: number | null, mode: TakeBillingMode): VideoBatchPlan {
  const total = costs.length
  const requiredTakes = costs.reduce((sum, c) => sum + c, 0)
  if (mode === 'off' || balance == null) {
    return { total, requiredTakes, balance: mode === 'off' ? null : balance, mode, affordable: total, runCount: total, short: false }
  }
  let affordable = 0
  let spent = 0
  for (const c of costs) {
    if (spent + c > balance) break
    spent += c
    affordable += 1
  }
  const short = requiredTakes > balance
  return { total, requiredTakes, balance, mode, affordable, runCount: mode === 'enforce' ? affordable : total, short }
}

type Translate = (key: string, vars?: Record<string, string | number>) => string

/** 확인창·승인 카드에 같이 쓰는 Take 안내 줄. off 모드는 빈 배열(Take 이야기를 하지 않는다). */
export function describeVideoBatchPlan(plan: VideoBatchPlan, t: Translate): string[] {
  if (plan.mode === 'off') return []
  if (plan.balance == null) {
    return [t('Takes needed: {required}. This workspace has unlimited Takes.', { required: plan.requiredTakes })]
  }
  const lines = [t('Takes needed: {required}. Takes you have: {balance}.', { required: plan.requiredTakes, balance: plan.balance })]
  if (plan.short) {
    if (plan.mode === 'enforce') {
      lines.push(
        plan.runCount === 0
          ? t('No videos can be made until you add Takes.')
          : t('Only {run} of {count} videos can be made with your Takes. The first {run} will be generated.', { run: plan.runCount, count: plan.total }),
      )
    } else {
      lines.push(t('Takes are short by {missing}. Billing is not enforced yet, so all {count} will be generated.', { missing: plan.requiredTakes - plan.balance, count: plan.total }))
    }
  }
  return lines
}
