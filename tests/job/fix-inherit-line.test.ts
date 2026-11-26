// 화살표 판(N4b)을 채팅 고치기(지금 그림을 참고로)로 다시 그린 실사 시트가 끝나면 새 판이 실사 줄을 이어받고, 지금 그림을 바탕으로 하지 않은 다시 그리기는 잇지 않는지 검사한다(리드 A 2026-11-27)
import sharp from 'sharp'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ upload: vi.fn(), crop: vi.fn(), complete: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: vi.fn(), storage: { from: () => ({ upload: mocks.upload }) } } }))
vi.mock('@/lib/storage-thumb', () => ({ uploadThumbnail: vi.fn() }))
vi.mock('@/lib/writer/rough-grid-crop', () => ({ cropRoughGridFrames: mocks.crop }))
vi.mock('@/lib/director/job-cancellations', () => ({ isJobCancelled: async () => false, cancelledJobsById: async () => new Map() }))
vi.mock('@/lib/generation-jobs', () => ({
  completeGenerationJob: mocks.complete,
  failGenerationJob: vi.fn(),
  patchGenerationJobResponseSnapshotByRequestId: vi.fn(),
  GenerationJobTerminalTransitionError: class GenerationJobTerminalTransitionError extends Error {},
  claimGenerationJobFinalize: vi.fn(async () => true),
  releaseGenerationJobFinalizeClaim: vi.fn(async () => undefined),
  GenerationJobFinalizeInProgressError: class GenerationJobFinalizeInProgressError extends Error {},
}))
vi.mock('@/lib/director-video-takes', () => ({ completeDirectorVideoAttempt: vi.fn(), markDirectorVideoAttemptFailed: vi.fn() }))
vi.mock('@/lib/artist/portrait', () => ({ cropTurnaroundPortrait: vi.fn() }))
vi.mock('@/lib/fal/observability', () => ({ buildFalResponseSnapshot: () => ({}) }))
// 실사 시트 쓰기는 rev 비교 쓰기 한 곳 — 시험에서는 바꾸는 함수를 지금 행에 그대로 적용한다.
vi.mock('@/lib/director/storyboard-image-store', () => ({
  updateStoryboardImage: async (_p: string, _s: string, change: (current: unknown) => unknown) => {
    const next = change(structuredClone(row))
    if (next) row = next as typeof row
    return next
  },
}))

import { finalizeGenerationJob } from '@/lib/fal/finalize'
import { withArrowVersion, withRealDirectionRead, withRealEndFrame } from '@/lib/storyboard/real-arrow-edit'
import { withStoryboardVersion } from '@/lib/director/storyboard-image-versions'
import { freshDirectionRead } from '@/lib/writer/direction-read'

// 이 시험을 위해 지은 샷 — 화살표를 고친 판(arrows-1)이 지금 그림이고, 그 가운데 장을 읽은 줄로 끝 장을 다시 그렸다.
const B = 'https://media.test/ws-1/p1/shots'
const V1 = { start: `${B}/g1_start.png`, direction: `${B}/g1_direction.png`, end: `${B}/g1_end.png` }
const EDITED = `${B}/a1_storyboard_direction.png?v=2`
const DRAWN_END = `${B}/gjob-end_storyboard_end.png?v=3`
const LINE = 'She stands and walks out to the right.'
let row: Record<string, unknown> | null

function arrowSheet() {
  const one = withStoryboardVersion(null, { id: 'g1', url: V1.start, frames: V1, generatedAt: 10, source: 'generated', roughGeneratedAt: 500 }, { select: true })
  const two = withArrowVersion(one, { id: 'arrows-1', direction: EDITED, at: 20, from: V1.direction })!
  const read = withRealDirectionRead(two, { en: LINE, ko: null, source: 'ai', direction: EDITED, at: 21, endDrawn: null })!
  return withRealEndFrame(read, { versionId: 'arrows-1', direction: EDITED, line: LINE }, DRAWN_END)!
}

async function stripJob(id: string, snapshot: Record<string, unknown>) {
  // 레거시 세로 시트(1024×1536)와 같은 비율 · 50KB 넘는 그림 — 잘라내기는 흉내 낸다.
  const raw = Buffer.alloc(512 * 768 * 3)
  let seed = 7
  for (let i = 0; i < raw.length; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff
    raw[i] = (seed >> 16) & 255
  }
  const png = await sharp(raw, { raw: { width: 512, height: 768, channels: 3 } }).png().toBuffer()
  vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array(png))))
  mocks.crop.mockResolvedValue([{ start: Buffer.from('s'), direction: Buffer.from('d'), end: Buffer.from('e') }])
  const job = { id, project_id: 'p1', kind: 'shot_storyboard', target: { workspaceId: 'ws-1', writerShotId: 'sh_1', gridVariant: 'strip1', roughGeneratedAt: 500 }, input_snapshot: snapshot } as never
  await finalizeGenerationJob(job, { media: 'image', url: 'https://fal.media/strip.png' })
  return row as Record<string, unknown>
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.upload.mockResolvedValue({ error: null })
  row = arrowSheet() as unknown as Record<string, unknown>
})

describe('채팅 고치기로 다시 그린 화살표 판', () => {
  // 왜(리드 A): "지금 그림을 참고로" 고치는 채팅 고치기는 화살표를 그대로 두고 다시 그린다 — 사람이 고친 움직임 줄도 새 판으로 이어 가야
  //   영상 지시 · 편집기 아래 줄이 그 움직임을 계속 쓴다. 그 줄로 그린 끝 장을 바탕으로 고쳤으니 새 끝 장도 그 줄로 그린 것으로 둔다.
  it('화살표 판을 지금 그림을 참고로 고친 채팅 고치기가 끝나면 새 판이 그 실사 줄을 이어받는다', async () => {
    const after = await stripJob('job-fix', { fix_base_frames: { start: V1.start, direction: EDITED, end: DRAWN_END } })
    const frames = after.frames as { direction: string; end: string }
    expect(after.versionId).toBe('job-fix')
    expect(frames.direction).toMatch(/_gjob-fix_storyboard_direction\.png/)
    expect(freshDirectionRead(after)).toMatchObject({ en: LINE, direction: frames.direction, endDrawn: frames.end })
  })

  // 왜(리드 A): Director [다시 만들기]처럼 지금 그림을 바탕으로 하지 않는 다시 그리기는 콘티대로 그린 그림이다 — 실사 줄을 잇지 않는다(영상은 콘티 줄로 돌아간다).
  it('지금 그림을 바탕으로 하지 않은 다시 그리기가 끝나면 실사 줄을 잇지 않는다', async () => {
    const after = await stripJob('job-remake', {})
    expect(after.versionId).toBe('job-remake')
    expect(freshDirectionRead(after)).toBeNull()
  })
})
