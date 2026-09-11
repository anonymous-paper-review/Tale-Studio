// 채팅의 단계 판정은 조회 실패를 빈 에셋으로 오인하지 않는다
import { expect, it, vi } from 'vitest'
import type { NextRequest } from 'next/server'
vi.mock('@/lib/api/guard', () => ({ requireProjectAccess: vi.fn(async () => ({ ok: true })) }))
vi.mock('@/lib/writer/run-store', () => ({ getRunStatusLight: vi.fn(async () => null) }))
vi.mock('@/lib/generation-jobs', () => ({ STALE_QUEUED_MS: 600_000 }))
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: () => { throw new Error('assets unavailable') } } }))
import { GET } from '@/app/api/writer/status/[projectId]/route'
it('단계 이동용 에셋 조회에 실패하면 준비 완료나 빈 프로젝트를 반환하지 않는다', async () => {
  // 왜: 0개라는 성공 응답은 모델의 잘못된 생성·이동 판단으로 이어진다.
  const response = await GET(new Request('http://localhost/api/writer/status/p?assets=1&strict=1') as NextRequest, { params: Promise.resolve({ projectId: 'p' }) })
  expect(response.status).toBe(500)
  expect(await response.json()).toEqual({ error: 'assets unavailable' })
})
