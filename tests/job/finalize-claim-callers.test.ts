// 마무리 자리를 못 찍은 쪽(웹훅 · 폴링)은 저장도 실패 처리도 하지 않는다 (2026-11-24, finalize-claim.test.ts 와 한 묶음)
//
//   · finalizeGenerationJob 은 어떤 종류든 저장을 시작하기 전에 자리를 찍고, 못 찍으면 내려받기 전에 멈춘다.
//   · 저장 도중 오류가 나면 자리를 풀고 그 오류를 그대로 올린다 — 다음 폴링이 바로 다시 시도한다.
//   · 폴링(reconcile)은 "자리 못 찍음"을 받으면 잡을 queued 그대로 돌려주고 실패로 만들지 않는다.
//   · 웹훅은 "자리 못 찍음"을 받으면 실패로 만들지 않고 조용히 끝낸다.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  claim: vi.fn(),
  release: vi.fn(),
  failGenerationJob: vi.fn(),
  getGenerationJobById: vi.fn(),
  patchSnapshot: vi.fn(),
  falImageFetch: vi.fn(),
  verifyFalWebhook: vi.fn(),
  getGenerationJobByRequestId: vi.fn(),
  markDirectorVideoAttemptFailed: vi.fn(),
  releaseTakesForJob: vi.fn(),
}))

vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: vi.fn(), rpc: vi.fn() } }))
vi.mock('@/lib/generation-jobs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/generation-jobs')>()),
  claimGenerationJobFinalize: mocks.claim,
  releaseGenerationJobFinalizeClaim: mocks.release,
  failGenerationJob: mocks.failGenerationJob,
  getGenerationJobById: mocks.getGenerationJobById,
  getGenerationJobByRequestId: mocks.getGenerationJobByRequestId,
  patchGenerationJobResponseSnapshotByRequestId: mocks.patchSnapshot,
}))
vi.mock('@/lib/writer/llm/fal', () => ({ falImageFetch: mocks.falImageFetch, falVideoFetch: vi.fn() }))
vi.mock('@/lib/fal/verify-webhook', () => ({ verifyFalWebhook: mocks.verifyFalWebhook, readFalWebhookHeaders: () => ({}) }))
vi.mock('@/lib/director-video-takes', () => ({ markDirectorVideoAttemptFailed: mocks.markDirectorVideoAttemptFailed }))
vi.mock('@/lib/billing/take-hold', () => ({ releaseTakesForJob: mocks.releaseTakesForJob }))
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  after: (fn: () => unknown) => Promise.resolve(fn()),
}))

import { finalizeGenerationJob } from '@/lib/fal/finalize'
import { reconcileJobFromFal } from '@/lib/fal/reconcile'
import { GenerationJobFinalizeInProgressError, type GenerationJob } from '@/lib/generation-jobs'
import { POST } from '@/app/api/fal/webhook/route'

const JOB = {
  id: 'job-1',
  project_id: 'project-1',
  kind: 'character_view',
  status: 'queued',
  request_id: 'fal-1',
  fal_key_id: 'legacy-1000',
  model: 'openai/gpt-image-2/edit',
  video_clip_id: null,
  input_snapshot: {},
  target: { workspaceId: 'ws-1', characterId: 'char-1', appearanceKey: 'default', view: 'main' },
} as unknown as GenerationJob

beforeEach(() => {
  vi.clearAllMocks()
  mocks.claim.mockResolvedValue(true)
  mocks.release.mockResolvedValue(undefined)
  mocks.patchSnapshot.mockResolvedValue(undefined)
  mocks.verifyFalWebhook.mockResolvedValue(true)
  mocks.getGenerationJobByRequestId.mockResolvedValue(JOB)
})

describe('저장 시작 전 자리 찍기', () => {
  it('자리를 못 찍으면 그림을 내려받지 않고 멈춘다', async () => {
    // 왜: 두 쪽이 모두 내려받으면 저장 · 올리기 · 후보 행이 2배다(운영 재현 20%).
    mocks.claim.mockResolvedValueOnce(false)
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    await expect(finalizeGenerationJob(JOB, { media: 'image', url: 'https://fal.media/a.png' }))
      .rejects.toBeInstanceOf(GenerationJobFinalizeInProgressError)
    expect(mocks.claim).toHaveBeenCalledWith('job-1')
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(mocks.release).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it('저장 도중 오류가 나면 자리를 풀고 그 오류를 그대로 올린다', async () => {
    // 왜: 자리를 쥔 채 죽으면 2분 동안 아무도 다시 못 한다. 오류를 바꾸면 호출처의 일시 · 영구 구분이 깨진다.
    vi.stubGlobal('fetch', vi.fn(async () => new Response('gone', { status: 404 })))
    await expect(finalizeGenerationJob(JOB, { media: 'image', url: 'https://fal.media/a.png' }))
      .rejects.toMatchObject({ message: expect.stringContaining('fal image fetch failed: 404') })
    expect(mocks.release).toHaveBeenCalledWith('job-1')
    vi.unstubAllGlobals()
  })
})

describe('자리를 못 찍은 폴링과 웹훅', () => {
  it('폴링은 잡을 queued 그대로 돌려주고 실패로 만들지 않는다', async () => {
    // 왜: 다른 쪽이 저장하는 중이다. 화면은 다음 폴링(3초 뒤)에서 완료를 본다.
    mocks.falImageFetch.mockResolvedValue({ status: 'COMPLETED', payload: { images: [{ url: 'https://fal.media/a.png' }] } })
    mocks.claim.mockResolvedValueOnce(false)
    const out = await reconcileJobFromFal(JOB)
    expect(out.status).toBe('queued')
    expect(mocks.failGenerationJob).not.toHaveBeenCalled()
    expect(mocks.getGenerationJobById).not.toHaveBeenCalled()
  })

  it('웹훅은 실패로 만들지 않고 조용히 끝낸다', async () => {
    mocks.claim.mockResolvedValueOnce(false)
    const res = await POST(new Request('http://localhost/api/fal/webhook', {
      method: 'POST',
      body: JSON.stringify({ request_id: 'fal-1', status: 'OK', payload: { images: [{ url: 'https://fal.media/a.png' }] } }),
    }))
    expect(res.status).toBe(200)
    expect(mocks.failGenerationJob).not.toHaveBeenCalled()
    expect(mocks.markDirectorVideoAttemptFailed).not.toHaveBeenCalled()
  })
})
