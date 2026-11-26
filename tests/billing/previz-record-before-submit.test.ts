// 목각 영상(previz) 요청은 작업 기록 · Take · 잔액 확인 · 외부 제출 없이 거절한다 (오너 dev 때 V1 "영상 생성에는 무조건 실사 그림만" · T1 — main 에도 같이, 2026-11-27 N4a)
//
// 목각 영상은 러프 시작 · 끝 그림(목각 인형)으로 만드는 미리보기였다. 화면에서 부르는 곳은 없고(writer-store generatePrevizVideo 만 남음),
//   영상에는 실사 그림만 들어가야 한다(오너). 남은 길은 주인 확인 바로 뒤에서 닫는다 — 남의 프로젝트는 지금처럼 403(tests/permission).
//   예전 이 파일의 "기록 → Take → 제출" 순서 시험 13개는 오너 T1(2026-11-22)로 지웠다(n-video 보고에 이름을 싣는다).
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireProjectAccess: vi.fn(),
  falVideoSubmit: vi.fn(),
  pickFalKey: vi.fn(),
  falKeyById: vi.fn(),
  createGenerationJob: vi.fn(),
  failGenerationJob: vi.fn(),
  holdTakesForVideoJob: vi.fn(),
  releaseTakesForJob: vi.fn(),
  from: vi.fn(),
  rpc: vi.fn(),
  checkProjectVideoBudget: vi.fn(),
  checkGenerationCapacity: vi.fn(),
  syncFalKeyLimits: vi.fn(),
  deriveEnBatch: vi.fn(),
  recordObservability: vi.fn(),
}))

vi.mock('@/lib/demo/guard-server', () => ({ demoWriteBlock: () => null }))
vi.mock('@/lib/api/guard', () => ({ requireProjectAccess: mocks.requireProjectAccess }))
vi.mock('@/lib/writer/llm/fal', () => ({ falVideoSubmit: mocks.falVideoSubmit }))
vi.mock('@/lib/fal/keys', () => ({ pickFalKey: mocks.pickFalKey, falKeyById: mocks.falKeyById }))
vi.mock('@/lib/generation-jobs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/generation-jobs')>()),
  createGenerationJob: mocks.createGenerationJob,
  failGenerationJob: mocks.failGenerationJob,
}))
// capacityReservationRejection 이 actual quota.ts 를 거쳐 quotaExceededBody 를 부르므로 이 머지 export 도
//   importOriginal 로 보존한다 — 기존 두 check 함수 mock 은 그대로 유지(약화 없음).
vi.mock('@/lib/generation-quota', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/generation-quota')>()),
  checkGenerationCapacity: mocks.checkGenerationCapacity,
  checkProjectVideoBudget: mocks.checkProjectVideoBudget,
  syncFalKeyLimits: mocks.syncFalKeyLimits,
}))
// 새 capacityReservationRejection(error, ctx) 는 actual quota.ts 에서 그대로 재사용한다 —
//   부모가 그 헬퍼를 구현하면 이 spread 로 자동 반영되고, 여기서 하드코딩한 가짜 count 는 없다.
//   기존 두 헬퍼는 기존 계약대로 계속 오버라이드한다(약화 없음).
vi.mock('@/lib/api/quota', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/quota')>()),
  quotaRejectionResponse: () => new Response(JSON.stringify({ error: 'quota' }), { status: 429 }),
  videoBudgetRejectionResponse: () => new Response(JSON.stringify({ error: 'budget' }), { status: 429 }),
}))
// 관측 기록만 목 — 실제 DB 접속 금지.
vi.mock('@/lib/writer/debug-events', () => ({
  recordWriterObservabilityEvent: mocks.recordObservability,
}))
vi.mock('@/lib/billing/take-hold', () => ({
  holdTakesForVideoJob: mocks.holdTakesForVideoJob,
  releaseTakesForJob: mocks.releaseTakesForJob,
}))
vi.mock('@/lib/writer/i18n/derive-en', () => ({ deriveEnBatch: mocks.deriveEnBatch }))
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: mocks.from, rpc: mocks.rpc } }))
vi.mock('@/lib/fal/webhook-url', () => ({ resolveWebhookUrl: () => 'https://example.test/api/fal/webhook' }))

import { POST } from '@/app/api/director/generate-previz-video/route'

function query(rows: unknown, single?: unknown) {
  const q: Record<string, unknown> = {}
  for (const name of ['select', 'eq', 'gte', 'contains', 'update', 'order', 'limit']) {
    q[name] = vi.fn(() => q)
  }
  q.maybeSingle = vi.fn(async () => ({ data: single ?? null, error: null }))
  q.single = q.maybeSingle
  ;(q as { then: unknown }).then = (resolve: (v: unknown) => unknown) =>
    resolve({ data: rows, error: null })
  return q
}

function request() {
  return new Request('http://localhost/api/director/generate-previz-video', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId: '11111111-2222-4333-8444-555555555555', writerShotId: 'sh_01' }),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireProjectAccess.mockResolvedValue({ ok: true, userId: 'user-1' })
  mocks.checkProjectVideoBudget.mockResolvedValue({ ok: true })
  mocks.checkGenerationCapacity.mockResolvedValue({ ok: true })
  mocks.createGenerationJob.mockResolvedValue({ id: 'job-1', fal_key_id: 'key-1' })
  mocks.holdTakesForVideoJob.mockResolvedValue({ ok: true, insufficient: false, balance: 10 })
  mocks.falVideoSubmit.mockResolvedValue({ request_id: 'fal-1', model: 'happy-horse', fal_key_id: 'key-1' })
  mocks.from.mockImplementation(() => query(null, null))
})

describe('같이 정한 것', () => {
  // 왜: 오너 2026-11-22 "영상 생성에는 무조건 실사 그림만" · T1 "추천대로" — 목각 영상 길이 남아 있으면 부르기만 해도 Take 와 돈이 든다.
  //   기록 · Take 잡음 · 잔액(예산 · 동시성) 확인 · 외부 제출 어느 것도 하기 전에 410(그만둔 기능)으로 답한다.
  it('목각 영상 요청은 작업 기록 · Take · 잔액 확인 · 외부 제출 없이 거절한다', async () => {
    const response = await POST(request())

    expect(response.status).toBe(410)
    await expect(response.json()).resolves.toMatchObject({ code: 'previz_video_retired' })
    expect(mocks.createGenerationJob).not.toHaveBeenCalled()
    expect(mocks.holdTakesForVideoJob).not.toHaveBeenCalled()
    expect(mocks.checkProjectVideoBudget).not.toHaveBeenCalled()
    expect(mocks.checkGenerationCapacity).not.toHaveBeenCalled()
    expect(mocks.falVideoSubmit).not.toHaveBeenCalled()
    expect(mocks.from).not.toHaveBeenCalled()
  })
})
