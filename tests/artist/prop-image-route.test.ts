// 소품 그림 그리기 창구 — 같은 소품을 그리는 중이면 또 그리지 않고, 저절로 그리기는 빈칸만 채우다 두 번 실패하면 멈추며, 사람이 누른 다시 그리기는 그림이 있어도 새로 그린다 (D7, 오너 2026-11-22)
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  loadPropDrawingContext: vi.fn(),
  hasQueuedPropImageJob: vi.fn(),
  listFailedPropImageJobs: vi.fn(),
  submitPropImageJob: vi.fn(),
  countFailedJobsForTarget: vi.fn(),
  checkGenerationCapacity: vi.fn(),
  resolveStyleAnchor: vi.fn(),
  styleDrawsWithoutReference: vi.fn(),
  styleAnalysisPending: vi.fn(),
  assertUserTextAllowed: vi.fn(),
  templateAssetUrl: vi.fn(),
  resolvePhotoLook: vi.fn(),
}))
vi.mock('@/lib/demo/guard-server', () => ({ demoWriteBlock: () => null }))
vi.mock('@/lib/api/guard', () => ({ requireProjectAccess: async (_req: Request, projectId: string) => ({ ok: true, projectId, userId: 'user-1', viaShare: false }) }))
vi.mock('@/lib/chat-trace-server', () => ({ chatTraceBelongsToProject: async () => true }))
vi.mock('@/lib/generation-quota', () => ({ checkGenerationCapacity: mocks.checkGenerationCapacity }))
vi.mock('@/lib/api/quota', () => ({ quotaRejectionResponse: () => new Response('quota', { status: 429 }), capacityReservationRejection: () => null }))
vi.mock('@/lib/api/moderation', () => ({ moderationRejectionResponse: () => null }))
vi.mock('@/lib/moderation/creem', () => ({ assertUserTextAllowed: mocks.assertUserTextAllowed }))
vi.mock('@/lib/style-anchor', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/style-anchor')>()), resolveStyleAnchor: mocks.resolveStyleAnchor }))
vi.mock('@/lib/style-facets/reference-image', () => ({ styleDrawsWithoutReference: mocks.styleDrawsWithoutReference }))
vi.mock('@/lib/style-facets/analysis-wait', () => ({ styleAnalysisPending: mocks.styleAnalysisPending }))
vi.mock('@/lib/artist/prop-jobs', () => ({
  loadPropDrawingContext: mocks.loadPropDrawingContext,
  hasQueuedPropImageJob: mocks.hasQueuedPropImageJob,
  listFailedPropImageJobs: mocks.listFailedPropImageJobs,
  submitPropImageJob: mocks.submitPropImageJob,
}))
vi.mock('@/lib/generation-jobs', () => ({ countFailedJobsForTarget: mocks.countFailedJobsForTarget, AUTO_GENERATION_GIVE_UP_THRESHOLD: 2 }))
// 소품 양식(m1126 A2) — 스토리지에 올린 양식 주소. 못 올리면 null.
vi.mock('@/lib/storage/template-asset', () => ({ templateAssetUrl: mocks.templateAssetUrl }))
// 실사 그림체의 사진 글(리드 R2) — 기준 그림 없는 실사만 값이 있다.
vi.mock('@/lib/style-facets/photo-look', () => ({ resolvePhotoLook: mocks.resolvePhotoLook }))

import { POST as generateProp } from '@/app/api/artist/generate-prop/route'

const PROJECT = { workspace_id: 'ws-1', style_anchor_key: 'jp_anime', custom_style_anchor: null }
const PROP = { prop_id: 'obj_ring', name: '은반지', appearance: 'a thin silver ring', image_url: null as string | null }
const post = (body: Record<string, unknown>) => generateProp(new Request('http://test/api/artist/generate-prop', { method: 'POST', body: JSON.stringify({ projectId: 'project-1', propId: 'obj_ring', ...body }) }))

beforeEach(() => {
  vi.resetAllMocks()
  mocks.loadPropDrawingContext.mockResolvedValue({ prop: { ...PROP }, project: PROJECT, personClash: false })
  mocks.hasQueuedPropImageJob.mockResolvedValue(false)
  mocks.listFailedPropImageJobs.mockResolvedValue([])
  mocks.countFailedJobsForTarget.mockResolvedValue(0)
  mocks.checkGenerationCapacity.mockResolvedValue({ ok: true })
  mocks.resolveStyleAnchor.mockResolvedValue(null)
  mocks.styleDrawsWithoutReference.mockResolvedValue(false)
  mocks.styleAnalysisPending.mockReturnValue(false)
  mocks.assertUserTextAllowed.mockResolvedValue({ id: 'moderation-1' })
  mocks.submitPropImageJob.mockResolvedValue({ id: 'job-1' })
  mocks.templateAssetUrl.mockResolvedValue('https://media.test/templates/prop-template-0123456789ab.png')
  mocks.resolvePhotoLook.mockResolvedValue(null)
})

describe('소품 그림 그리기 창구', () => {
  // 왜: 같은 소품을 두 번 그리면 같은 그림 비용이 두 번 든다 — 그리는 중인 작업이 있으면 그 작업을 기다린다(인물 · 배경과 같다).
  it('같은 소품을 그리는 중이면 또 그리지 않는다', async () => {
    mocks.hasQueuedPropImageJob.mockResolvedValue(true)
    const res = await post({ actor: 'ui' })
    expect(await res.json()).toMatchObject({ ok: true, deduped: true })
    expect(mocks.submitPropImageJob).not.toHaveBeenCalled()
  })

  // 왜: 저절로 그리기([만들기] · 빈 그림 이어 그리기)는 빈칸만 채운다 — 화면이 모르는 사이 다 그려진 소품을 또 그리지 않게(배경 라우트와 같은 규칙).
  it('저절로 그리기는 그림이 이미 있는 소품을 다시 그리지 않는다', async () => {
    mocks.loadPropDrawingContext.mockResolvedValue({ prop: { ...PROP, image_url: 'https://media.test/ring.png' }, project: PROJECT, personClash: false })
    const res = await post({ actor: 'auto' })
    expect(await res.json()).toMatchObject({ ok: true, skipped: true, reason: 'exists' })
    expect(mocks.submitPropImageJob).not.toHaveBeenCalled()
  })

  // 왜: 끝없는 재시도 · 비용을 막는다 — 저절로 그리기는 같은 소품이 두 번 실패하면 멈추고 사람의 [다시 그리기]를 기다린다(배경과 같은 상한).
  it('저절로 그리기는 같은 소품이 두 번 실패하면 멈춘다', async () => {
    mocks.countFailedJobsForTarget.mockResolvedValue(2)
    const res = await post({ actor: 'auto' })
    expect(await res.json()).toMatchObject({ ok: true, skipped: true, reason: 'gave_up' })
    expect(mocks.countFailedJobsForTarget).toHaveBeenCalledWith('project-1', 'prop_image', { propId: 'obj_ring' })
    expect(mocks.submitPropImageJob).not.toHaveBeenCalled()
  })

  // 왜: 정상 경로 고정 — 사람이 누른 다시 그리기 · 채팅의 다시 그리기는 그림이 있어도 지금 생김새 · 그림체로 새로 그린다.
  it('사람이 누른 다시 그리기는 그림이 있어도 새로 그린다', async () => {
    mocks.loadPropDrawingContext.mockResolvedValue({ prop: { ...PROP, image_url: 'https://media.test/ring.png' }, project: PROJECT, personClash: false })
    const res = await post({ actor: 'ui', instruction: '돌을 빨간색으로' })
    expect(await res.json()).toMatchObject({ ok: true, jobId: 'job-1', status: 'queued' })
    const input = mocks.submitPropImageJob.mock.calls[0][0]
    expect(input).toMatchObject({ projectId: 'project-1', propId: 'obj_ring', actor: 'ui', userId: 'user-1', workspaceId: 'ws-1' })
    expect(input.plan.submit.prompt).toContain('Requested change: 돌을 빨간색으로')
    expect(input.stamp).toMatch(/:jp_anime$/)
    expect(mocks.assertUserTextAllowed).toHaveBeenCalledWith(['은반지', 'a thin silver ring', '돌을 빨간색으로'], expect.objectContaining({ kind: 'prop_image' }))
  })

  // 왜: 예전 저장 고장으로 같은 id 가 인물 행에도 있으면 어느 그림을 고칠지 모른다 — 인물 · 소품 고치기 창구와 같이 409 로 막는다.
  it('같은 id 가 인물 행에도 있는 소품은 그리지 않는다', async () => {
    mocks.loadPropDrawingContext.mockResolvedValue({ prop: { ...PROP }, project: PROJECT, personClash: true })
    const res = await post({ actor: 'ui' })
    expect(res.status).toBe(409)
    expect(mocks.submitPropImageJob).not.toHaveBeenCalled()
  })

  // 왜: 정상 경로 고정 — 없는 소품(지워졌거나 다른 프로젝트)은 그리지 않는다.
  it('없는 소품은 그리지 않는다', async () => {
    mocks.loadPropDrawingContext.mockResolvedValue({ prop: null, project: PROJECT, personClash: false })
    expect((await post({ actor: 'ui' })).status).toBe(404)
  })

  // 왜: 인물 시트처럼 소품도 양식에 담아 16:9 로 그린다(m1126 A2) — 창구가 public 의 소품 양식을 스토리지에 올려 그 주소를 첫 참고 그림으로 보낸다.
  it('소품 그림 창구는 소품 양식을 올려 그 주소를 첫 참고 그림으로 보낸다', async () => {
    await post({ actor: 'ui' })
    expect(mocks.templateAssetUrl).toHaveBeenCalledWith('prop-template.png')
    const input = mocks.submitPropImageJob.mock.calls[0][0]
    expect(input.plan.submit.reference_image_urls).toEqual(['https://media.test/templates/prop-template-0123456789ab.png'])
    expect(input.plan.submit.aspect_ratio).toBe('16:9')
    expect(input.plan.model).toBe('openai/gpt-image-2/edit')
  })

  // 왜: 리드 R2 — 실사 그림체(기준 그림 없는 실사)일 때만 소품 양식에 사진 문장 · 색감 문장을 싣는다. 그림체 기준 그림이 있는 그림체(일본 멜로 등)는 사진 글을 묻지도 않는다.
  it('소품 그림 창구는 기준 그림 없는 실사 그림체일 때만 사진 글을 싣는다', async () => {
    mocks.styleDrawsWithoutReference.mockResolvedValue(true)
    mocks.resolvePhotoLook.mockResolvedValue({ key: 'real', clause: 'Natural film grade with soft contrast.' })
    await post({ actor: 'ui' })
    expect(mocks.submitPropImageJob.mock.calls[0][0].plan.submit.prompt).toContain('real studio product photograph')
    expect(mocks.submitPropImageJob.mock.calls[0][0].plan.submit.prompt).toContain('Natural film grade with soft contrast.')
    mocks.submitPropImageJob.mockClear()
    mocks.resolvePhotoLook.mockClear()
    mocks.resolveStyleAnchor.mockResolvedValue({ key: 'real_jp_melo', imageUrl: 'https://anchor.test/melo.png', previewUrl: null, usePreviewRef: false, styleClause: null, anchorKind: 'media' })
    const res = await post({ actor: 'ui' })
    expect(await res.json()).toMatchObject({ ok: true, jobId: 'job-1' })
    expect(mocks.resolvePhotoLook).not.toHaveBeenCalled()
    expect(mocks.submitPropImageJob.mock.calls[0][0].plan.submit.prompt).not.toContain('photograph')
  })

  // 왜: 그림체 분석이 도는 동안은 그리지 않는다(2026-10-10 오너) — 분석보다 먼저 그리면 그림체 설명 없이 그린다. 인물 · 배경과 같다.
  it('그림체 분석이 도는 동안은 소품을 그리지 않는다', async () => {
    mocks.styleAnalysisPending.mockReturnValue(true)
    expect(await (await post({ actor: 'auto' })).json()).toMatchObject({ ok: true, waitingForStyle: true })
    expect(mocks.submitPropImageJob).not.toHaveBeenCalled()
  })
})
