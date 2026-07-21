import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { rpc: mocks.rpc } }))

import {
  compareDirectorVideoTakeOrder,
  completeDirectorVideoAttempt,
  markDirectorVideoAttemptFailed,
  reserveDirectorVideoRegeneration,
  reserveDirectorVideoTake,
  selectHandoffTake,
  selectLatestAttempt,
  selectNewestSuccessfulTake,
} from '@/lib/director-video-takes'
import type { DirectorVideoTake } from '@/lib/director-video-takes'

function take(overrides: Partial<DirectorVideoTake>): DirectorVideoTake {
  return {
    id: 'clip-1', project_id: 'project-1', shot_id: 'shot-1', storage_path: null, url: 'https://video.example/1',
    thumbnail_path: null, thumbnail_url: null, status: 'completed', duration: null, created_at: '2026-07-20T00:00:00Z',
    updated_at: null, canvas_position: null, is_final: false, take_label: null, override: null, take_number: 1,
    deleted_at: null, last_attempt_status: 'completed', last_attempt_error: null, last_attempt_at: null,
    last_attempt_job_id: null,
    ...overrides,
  }
}

beforeEach(() => vi.resetAllMocks())

describe('director video take selectors', () => {
  it('uses newest live success for the grid, ignoring Final and unusable newer takes', () => {
    const selected = selectNewestSuccessfulTake([
      take({ id: 'final-old', take_number: 1, is_final: true }),
      take({ id: 'success', take_number: 2 }),
      take({ id: 'failed', take_number: 4, status: 'failed' }),
      take({ id: 'pending', take_number: 5, status: 'queued' }),
      take({ id: 'deleted', take_number: 6, deleted_at: '2026-07-20T01:00:00Z' }),
    ])
    expect(selected?.id).toBe('success')
  })

  it('uses successful Final for handoff, otherwise the newest successful take', () => {
    const takes = [take({ id: 'final', take_number: 1, is_final: true }), take({ id: 'newest', take_number: 3 })]
    expect(selectHandoffTake(takes)?.id).toBe('final')
    expect(selectHandoffTake(takes.map(item => item.id === 'final' ? { ...item, status: 'failed' } : item))?.id).toBe('newest')
  })

  it('breaks equal-take equal-time ties deterministically by id', () => {
    const a = take({ id: 'a', take_number: 2 })
    const z = take({ id: 'z', take_number: 2 })
    expect(selectNewestSuccessfulTake([a, z])?.id).toBe('z')
  })

  it('returns null when no live successful URL exists', () => {
    expect(selectNewestSuccessfulTake([take({ url: null }), take({ status: 'failed' })])).toBeNull()
    expect(selectHandoffTake([take({ is_final: true, deleted_at: '2026-07-20T01:00:00Z' })])).toBeNull()
  })
  it('treats blank URLs as unusable and selects the latest attempt regardless of status', () => {
    const blank = take({ id: 'blank', take_number: 3, url: '   ' })
    const pending = take({ id: 'pending', take_number: 4, status: 'queued', url: null })
    expect(selectNewestSuccessfulTake([blank])).toBeNull()
    expect(selectLatestAttempt([blank, pending])?.id).toBe('pending')
  })

  it('exposes a stable newest-first comparator for consumers with richer records', () => {
    expect(compareDirectorVideoTakeOrder(take({ id: 'a', take_number: 2 }), take({ id: 'b', take_number: 1 }))).toBeLessThan(0)
  })
})
describe('director video attempt completion boundary', () => {
  it('rejects blank result media fields before calling the atomic completion RPC', async () => {
    await expect(completeDirectorVideoAttempt('project-1', 'job-1', 'clip-1', '   ', 'videos/clip-1.mp4'))
      .rejects.toThrow(/result URL must be nonblank/)
    await expect(completeDirectorVideoAttempt('project-1', 'job-1', 'clip-1', 'https://video.example/1', '\t'))
      .rejects.toThrow(/storage path must be nonblank/)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('preserves legacy scalar and null input snapshots when normalizing linked video jobs', () => {
    const migration = readFileSync(
      'supabase/migrations/20260720043400_director_video_retakes_integrity.sql',
      'utf8',
    )
    expect(migration).toContain("'legacyInputSnapshot', input_snapshot")
    expect(migration).toContain("'requestedModel'")
  })
})

describe('director video reservation and terminal RPC boundaries', () => {
  const reservation = {
    video_clip_id: 'clip-1',
    job_id: 'job-1',
    take_number: 1,
    replayed: false,
  }

  it('defaults only undefined input snapshots and rejects non-object shapes before reservation RPCs', async () => {
    mocks.rpc.mockResolvedValue({ data: [reservation], error: null })

    await reserveDirectorVideoTake({
      projectId: 'project-1',
      shotId: 'shot-1',
      model: 'model-1',
      target: {},
      idempotencyKey: 'key-1',
    })
    expect(mocks.rpc).toHaveBeenCalledWith('reserve_director_video_take', expect.objectContaining({
      p_input_snapshot: {},
    }))

    for (const inputSnapshot of [null, [], 'snapshot', 1, true]) {
      await expect(Promise.resolve().then(() => reserveDirectorVideoRegeneration({
        projectId: 'project-1',
        videoClipId: 'clip-1',
        model: 'model-1',
        target: {},
        idempotencyKey: 'key-1',
        inputSnapshot,
      }))).rejects.toThrow(/plain JSON object/)
    }
    expect(mocks.rpc).toHaveBeenCalledTimes(1)
  })

  it('wires successful completion and trimmed failure evidence to their terminal RPCs', async () => {
    mocks.rpc.mockResolvedValue({ error: null })

    await completeDirectorVideoAttempt('project-1', 'job-1', 'clip-1', 'https://video.example/1', 'videos/clip-1.mp4')
    await markDirectorVideoAttemptFailed('project-1', 'job-1', `  ${'x'.repeat(1001)}  `)

    expect(mocks.rpc).toHaveBeenNthCalledWith(1, 'complete_director_video_attempt', {
      p_project_id: 'project-1',
      p_job_id: 'job-1',
      p_video_clip_id: 'clip-1',
      p_result_url: 'https://video.example/1',
      p_storage_path: 'videos/clip-1.mp4',
    })
    expect(mocks.rpc).toHaveBeenNthCalledWith(2, 'fail_director_video_attempt', {
      p_project_id: 'project-1',
      p_job_id: 'job-1',
      p_error: 'x'.repeat(1000),
    })
  })

  it('rejects blank failure evidence and propagates terminal RPC errors', async () => {
    await expect(markDirectorVideoAttemptFailed('project-1', 'job-1', ' \t '))
      .rejects.toThrow(/nonblank/)
    expect(mocks.rpc).not.toHaveBeenCalled()

    const rpcError = { message: 'terminal transition unavailable' }
    mocks.rpc.mockResolvedValue({ error: rpcError })
    await expect(markDirectorVideoAttemptFailed('project-1', 'job-1', 'provider failed'))
      .rejects.toBe(rpcError)
    await expect(completeDirectorVideoAttempt('project-1', 'job-1', 'clip-1', 'https://video.example/1', 'videos/clip-1.mp4'))
      .rejects.toBe(rpcError)
  })
})