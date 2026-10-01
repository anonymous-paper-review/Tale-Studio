// 이 파일이 검사하는 동작: Director 영상 제출은 화면이 보낸 비율이 아니라 프로젝트 포맷의 비율로 나간다 (2026-09-30 오너 지시, 실측 script_test 1280×720).
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  userOwnsProject: vi.fn(), checkGenerationCapacity: vi.fn(), checkProjectVideoBudget: vi.fn(), syncFalKeyLimits: vi.fn(),
  from: vi.fn(), rpc: vi.fn(), buildPrompt: vi.fn(), recordObservability: vi.fn(),
}))
vi.mock('@/lib/generation-jobs', () => ({ userOwnsProject: mocks.userOwnsProject, getGenerationJobById: vi.fn() }))
vi.mock('@/lib/generation-quota', () => ({
  checkGenerationCapacity: mocks.checkGenerationCapacity, quotaExceededBody: () => ({ error: 'quota' }),
  checkProjectVideoBudget: mocks.checkProjectVideoBudget, syncFalKeyLimits: mocks.syncFalKeyLimits, videoBudgetExceededBody: () => ({ error: 'video budget' }),
}))
vi.mock('@/lib/writer/debug-events', () => ({ recordWriterObservabilityEvent: mocks.recordObservability }))
vi.mock('@/lib/director/video-prompt', () => ({ buildVideoPrompt: mocks.buildPrompt }))
vi.mock('@/lib/fal/webhook-url', () => ({ resolveWebhookUrl: () => 'https://webhook.test' }))
vi.mock('@/lib/fal/observability', () => ({ buildBestEffortFalRequestCapturePatch: () => ({}) }))
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: mocks.from, rpc: mocks.rpc } }))

import { prepareDirectorVideoSubmission } from '@/lib/director/video-submit'

const STORYBOARD = { url: 'https://storage.test/s.png', frames: { start: 'https://storage.test/s.png', direction: 'https://storage.test/d.png', end: 'https://storage.test/e.png' }, status: 'completed', errorMessage: null, generatedAt: 1 }
function query(data: unknown) {
  const result = { data, error: null }
  const v: Record<string, unknown> = { then: (r: (x: typeof result) => unknown) => Promise.resolve(result).then(r) }
  for (const k of ['select', 'eq', 'in', 'is', 'contains', 'order', 'limit']) v[k] = vi.fn(() => v)
  v.maybeSingle = vi.fn(async () => result)
  return v
}
function request(extra: Record<string, unknown> = {}) {
  return new Request('http://test/api/director/generate-video', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ projectId: 'project-1', shotId: 'shot-1', prompt: 'A scene', camera: { pan: 0, zoom: 0 }, idempotencyKey: '123e4567-e89b-12d3-a456-426614174000', ...extra }),
  })
}
function projectRow(settings: unknown) {
  mocks.from
    .mockReturnValueOnce(query({ workspace_id: 'workspace-1', style_anchor_key: null, settings }))
    .mockReturnValueOnce(query({ shot_id: 'shot-1', dynamic_spec: {}, character_appearance_keys: {}, storyboard_image: STORYBOARD }))
    .mockReturnValue(query(null))
}
async function prepared(req: Request) {
  const p = await prepareDirectorVideoSubmission(req, 'user-1')
  if (p instanceof Response) throw new Error(`prepare failed: ${p.status} ${await p.clone().text()}`)
  return p as { inputSnapshot: { aspect_ratio?: string; fal_request?: { input?: { aspect_ratio?: string } } } }
}

beforeEach(() => {
  vi.resetAllMocks()
  mocks.userOwnsProject.mockResolvedValue(true)
  mocks.checkGenerationCapacity.mockResolvedValue({ ok: true })
  mocks.checkProjectVideoBudget.mockResolvedValue({ ok: true, used: 0, limit: 100 })
  mocks.buildPrompt.mockImplementation((i: { prompt: string }) => ({ fullPrompt: i.prompt, prompt_parts: [] }))
})

describe('영상 제출 화면비', () => {
  // 왜: 정상 경로 고정 — 세로 프로젝트에서 화면이 16:9 를 보내도(옛 화면·다른 경로) 서버가 9:16 으로 바로잡는다.
  it('세로(9:16) 프로젝트의 영상은 화면이 16:9 를 보내도 9:16 으로 제출되고 기록된다', async () => {
    projectRow({ format: 'vertical_9:16' })
    const p = await prepared(request({ aspectRatio: '16:9' }))
    expect(p.inputSnapshot.aspect_ratio).toBe('9:16')
    expect(p.inputSnapshot.fal_request?.input?.aspect_ratio).toBe('9:16')
  })

  // 왜: 포맷이 없는 옛 프로젝트는 종전과 같아야 한다(화면 값, 없으면 16:9).
  it('포맷이 없는 옛 프로젝트는 화면이 보낸 비율을 쓰고, 그것도 없으면 16:9 로 제출한다', async () => {
    projectRow({})
    expect((await prepared(request({ aspectRatio: '1:1' }))).inputSnapshot.aspect_ratio).toBe('1:1')
    projectRow(null)
    expect((await prepared(request())).inputSnapshot.aspect_ratio).toBe('16:9')
  })
})
