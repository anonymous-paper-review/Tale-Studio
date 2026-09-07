// 다시 만든 영상 중 조건에 맞는 결과를 고르고 실패와 완료를 빠짐없이 기록한다
import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  // #error-class: markDirectorVideoAttemptFailed 가 RPC 뒤 보강 태깅으로
  //   from('generation_jobs').update({error_class}).eq().eq() 를 await 하므로 thenable 체인 제공.
  const updateCalls: Array<Record<string, unknown>> = []
  const chain: Record<string, unknown> = {}
  chain.eq = () => chain
  chain.then = (ok: (v: { error: null }) => unknown) => Promise.resolve({ error: null }).then(ok)
  return {
    rpc: vi.fn(),
    updateCalls,
    from: vi.fn(() => ({
      update: (patch: Record<string, unknown>) => {
        updateCalls.push(patch)
        return chain
      },
    })),
  }
})
vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: { rpc: mocks.rpc, from: mocks.from },
}))

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
    last_attempt_job_id: null, adherence: null, frame_inputs: null, video_chain: null,
    ...overrides,
  }
}

beforeEach(() => vi.resetAllMocks())

describe('영상 다시 만들기 결과를 고르는 기준', () => {
  it('사용 가능한 영상 중 최신 결과를 화면에 보여주고 최종 영상과 쓸 수 없는 결과는 건너뛴다', () => {
    const selected = selectNewestSuccessfulTake([
      take({ id: 'final-old', take_number: 1, is_final: true }),
      take({ id: 'success', take_number: 2 }),
      take({ id: 'failed', take_number: 4, status: 'failed' }),
      take({ id: 'pending', take_number: 5, status: 'queued' }),
      take({ id: 'deleted', take_number: 6, deleted_at: '2026-07-20T01:00:00Z' }),
    ])
    expect(selected?.id).toBe('success')
  })

  it('최종으로 지정한 영상이 성공했으면 넘겨주고 아니면 최신 성공 영상을 넘겨준다', () => {
    const takes = [take({ id: 'final', take_number: 1, is_final: true }), take({ id: 'newest', take_number: 3 })]
    expect(selectHandoffTake(takes)?.id).toBe('final')
    expect(selectHandoffTake(takes.map(item => item.id === 'final' ? { ...item, status: 'failed' } : item))?.id).toBe('newest')
  })

  it('같은 차례와 시간의 영상이 여러 개면 정해진 순서로 하나를 고른다', () => {
    const a = take({ id: 'a', take_number: 2 })
    const z = take({ id: 'z', take_number: 2 })
    expect(selectNewestSuccessfulTake([a, z])?.id).toBe('z')
  })

  it('사용 가능한 성공 영상이 없으면 결과를 비워 둔다', () => {
    expect(selectNewestSuccessfulTake([take({ url: null }), take({ status: 'failed' })])).toBeNull()
    expect(selectHandoffTake([take({ is_final: true, deleted_at: '2026-07-20T01:00:00Z' })])).toBeNull()
  })
  it('영상 주소가 비어 있으면 쓸 수 없는 결과로 보고 상태와 상관없이 최신 시도를 고른다', () => {
    const blank = take({ id: 'blank', take_number: 3, url: '   ' })
    const pending = take({ id: 'pending', take_number: 4, status: 'queued', url: null })
    expect(selectNewestSuccessfulTake([blank])).toBeNull()
    expect(selectLatestAttempt([blank, pending])?.id).toBe('pending')
  })

  it('영상이 많아도 최신 결과부터 같은 순서로 고른다', () => {
    expect(compareDirectorVideoTakeOrder(take({ id: 'a', take_number: 2 }), take({ id: 'b', take_number: 1 }))).toBeLessThan(0)
  })
})
describe('영상 결과를 완료 처리하는 규칙', () => {
  it('영상 주소나 보관 위치가 비어 있으면 완료 처리하지 않는다', async () => {
    await expect(completeDirectorVideoAttempt('project-1', 'job-1', 'clip-1', '   ', 'videos/clip-1.mp4'))
      .rejects.toThrow(/result URL must be nonblank/)
    await expect(completeDirectorVideoAttempt('project-1', 'job-1', 'clip-1', 'https://video.example/1', '\t'))
      .rejects.toThrow(/storage path must be nonblank/)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('예전 형식의 영상 요청 정보도 기존 내용 그대로 보존한다', () => {
    const migration = readFileSync(
      'supabase/migrations/20260720043400_director_video_retakes_integrity.sql',
      'utf8',
    )
    expect(migration).toContain("'legacyInputSnapshot', input_snapshot")
    expect(migration).toContain("'requestedModel'")
  })
})

describe('영상 다시 만들기 요청과 완료·실패 기록 규칙', () => {
  const reservation = {
    video_clip_id: 'clip-1',
    job_id: 'job-1',
    take_number: 1,
    replayed: false,
  }

  it('요청 설정이 없을 때만 기본값을 쓰고 모양이 잘못되면 다시 만들기를 시작하지 않는다', async () => {
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

  it('완료 결과는 그대로 기록하고 너무 긴 실패 사유는 읽을 수 있게 줄여 기록한다', async () => {
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

  it('실패 사유가 비어 있으면 기록하지 않고 기록 중 오류는 알린다', async () => {
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