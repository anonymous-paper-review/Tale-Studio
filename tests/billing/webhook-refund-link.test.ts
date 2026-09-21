// 환불 회수 저장은 원 지급분의 연결을 잃지 않는다.
import { expect, it, vi } from 'vitest'
const { insert } = vi.hoisted(() => ({ insert: vi.fn(async () => ({ error: null })) }))
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: vi.fn(() => ({ insert })) } }))
vi.mock('@/lib/ops-alert', () => ({ sendOpsAlert: vi.fn() }))
import { webhookDeps } from '@/lib/billing/webhook-deps'

// 왜: 알림 처리에서 연결을 넘겨도 실제 DB 쓰기가 누락하면 결함이 다시 생긴다.
it('환불 회수 기록은 원래 지급분의 번호를 함께 저장한다', async () => {
  const input = { workspaceId: 'ws', grantId: 'grant', amount: 16, refId: 'adj', reason: 'refund' }
  await webhookDeps.revoke(input)
  expect(insert).toHaveBeenCalledWith(expect.objectContaining({ grant_id: 'grant', delta: -16, kind: 'refund_revoke' }))
})
