// 이미지 저장이 잠깐 실패해도 만들어진 결과를 잃지 않는다
//
// 영상은 저장 중 일시적 오류(스토리지 5xx 등)를 retryable 로 분류해 잡을 queued 로 남긴다 —
// 다음 webhook·폴링이 다시 시도해 결과를 건진다. 이미지는 같은 상황에서 맨몸 Error 라
// 즉시 failed 로 굳었고, 이후 모든 구제 경로가 status==='queued' 조건이라 회수가 닿지 않았다.
// fal 큐에 결과가 멀쩡히 있는데도 사용자는 재생성(재과금) 외 선택지가 없었다.
//
// 재시도 자체는 공짜다 — fal 은 이미 끝났고 우리 스토리지에 넣는 것만 다시 한다.
import { describe, expect, it } from 'vitest'
import {
  DirectorVideoCompletionPersistenceError,
  DirectorVideoTerminalError,
  classifyMediaPersistenceFailure,
} from '@/lib/fal/finalize'

describe('이미지 저장 실패 분류', () => {
  it('스토리지가 잠깐 죽으면 다시 시도할 수 있는 실패로 본다', () => {
    const error = classifyMediaPersistenceFailure({ status: 503, message: 'service unavailable' }, 'storage')

    expect(error).toBeInstanceOf(DirectorVideoCompletionPersistenceError)
    expect((error as DirectorVideoCompletionPersistenceError).code).toBe('storage_retryable')
  })

  it('요청이 잘못됐으면 다시 시도해도 안 되는 실패로 본다', () => {
    const error = classifyMediaPersistenceFailure({ status: 403, message: 'forbidden' }, 'storage')

    expect(error).toBeInstanceOf(DirectorVideoTerminalError)
  })

  it('DB 제약을 어겼으면 다시 시도해도 안 되는 실패로 본다', () => {
    const error = classifyMediaPersistenceFailure({ code: '23505', message: 'duplicate key' }, 'database')

    expect(error).toBeInstanceOf(DirectorVideoTerminalError)
  })

  it('DB 가 잠깐 죽으면 다시 시도할 수 있는 실패로 본다', () => {
    const error = classifyMediaPersistenceFailure({ code: '08006', message: 'connection failure' }, 'database')

    expect(error).toBeInstanceOf(DirectorVideoCompletionPersistenceError)
    expect((error as DirectorVideoCompletionPersistenceError).code).toBe('database_retryable')
  })

  it('알 수 없는 오류는 다시 시도할 수 있는 쪽으로 본다', () => {
    // 모르면 살리는 쪽으로 — 결과가 fal 에 남아 있으므로 재시도는 공짜이고,
    //   영구로 굳히면 되살릴 방법이 없다.
    const error = classifyMediaPersistenceFailure(new Error('socket hang up'), 'storage')

    expect(error).toBeInstanceOf(DirectorVideoCompletionPersistenceError)
  })
})
