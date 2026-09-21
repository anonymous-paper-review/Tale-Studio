// Writer 러프 이미지 숫자는 그리드의 모든 샷 저장이 성공한 뒤에만 증가하고 저장 실패는 완료로 알리지 않는다.
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { completionsOf, deriveStageBadges, type GenerationBatchRow } from '@/lib/generation-batches'

const mocks = vi.hoisted(() => ({
  from: vi.fn(), upload: vi.fn(), thumbnail: vi.fn(), crop: vi.fn(), complete: vi.fn(),
}))
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: mocks.from } }))
vi.mock('@/lib/storage/media', () => ({ mediaUpload: mocks.upload, mediaPublicUrl: (path: string) => `https://storage.test/${path}` }))
vi.mock('@/lib/storage-thumb', () => ({ uploadThumbnail: mocks.thumbnail }))
vi.mock('@/lib/writer/rough-grid-crop', () => ({ cropRoughGridFrames: mocks.crop }))
vi.mock('@/lib/generation-jobs', () => ({
  completeGenerationJob: mocks.complete, patchGenerationJobResponseSnapshotByRequestId: vi.fn(),
}))
vi.mock('@/lib/director-video-takes', () => ({ completeDirectorVideoAttempt: vi.fn() }))
vi.mock('@/lib/artist/portrait', () => ({ cropTurnaroundPortrait: vi.fn() }))
vi.mock('@/lib/fal/observability', () => ({ buildFalResponseSnapshot: () => ({}) }))
import { finalizeGenerationJob } from '@/lib/fal/finalize'

const row = (): GenerationBatchRow => ({
  id: 'rough-queue-job', kind: 'shot_rough_storyboard', status: 'queued',
  target: { workspaceId: 'workspace', writerShotIds: ['shot-a', 'shot-b'], gridVariant: 'grid4' },
  created_at: new Date(1000).toISOString(),
})
const badge = (job: GenerationBatchRow) => deriveStageBadges(completionsOf([job]), { writer: 1000 }, 'artist')
const providerResult = { media: 'image' as const, url: 'https://fal.media/rough.png' }
function installShotSave(save: (shotId: string) => Promise<{ error: Error | null }>) {
  mocks.from.mockImplementation((table: string) => {
    expect(table).toBe('shots')
    return { update: (data: { rough_storyboard: { status: string; frames: unknown } }) => {
      expect(data.rough_storyboard.status).toBe('completed')
      expect(data.rough_storyboard.frames).toHaveProperty('start')
      return { eq: () => ({ eq: (_column: string, shotId: string) => save(shotId) }) }
    } }
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.upload.mockResolvedValue({ error: null })
  mocks.thumbnail.mockResolvedValue(undefined)
  mocks.crop.mockResolvedValue(['a', 'b'].map(id => ({
    start: Buffer.from(`${id}-start`), direction: Buffer.from(`${id}-direction`), end: Buffer.from(`${id}-end`),
  })))
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(Buffer.alloc(60_000))))
})
afterEach(() => vi.unstubAllGlobals())

it('러프 두 샷 중 마지막 저장을 기다리는 동안에는 0이고 모두 저장되면 Writer 완료 숫자는 2가 된다.', async () => {
  const job = row()
  let finishLast!: (value: { error: null }) => void
  const lastSave = new Promise<{ error: null }>(resolve => { finishLast = resolve })
  let reachedLast!: () => void
  const reached = new Promise<void>(resolve => { reachedLast = resolve })
  installShotSave(async (shotId) => {
    if (shotId === 'shot-b') { reachedLast(); return lastSave }
    return { error: null }
  })
  mocks.complete.mockImplementation(async (id: string, url: string) => {
    expect(id).toBe(job.id)
    expect(url).toContain('_rough_start.png')
    job.status = 'completed'
    job.completed_at = new Date(2000).toISOString()
  })
  const saving = finalizeGenerationJob({ ...job, project_id: 'project', input_snapshot: {} } as never, providerResult)
  await reached
  expect(badge(job)).toEqual({})
  expect(mocks.complete).not.toHaveBeenCalled()
  finishLast({ error: null })
  await saving
  expect(mocks.upload).toHaveBeenCalledTimes(6)
  expect(mocks.complete).toHaveBeenCalledTimes(1)
  expect(badge(job)).toEqual({ writer: 2 })
})

it('러프 그리드 저장이 실패하면 완료 숫자를 올리거나 완료 처리하지 않는다.', async () => {
  const job = row()
  installShotSave(async () => ({ error: new Error('image save failed') }))
  await expect(finalizeGenerationJob({ ...job, project_id: 'project', input_snapshot: {} } as never, providerResult))
    .rejects.toThrow('image save failed')
  expect(mocks.complete).not.toHaveBeenCalled()
  expect(badge(job)).toEqual({})
})
