// 화면이 포기하는 시각과 서버가 유령으로 보는 시각이 어긋나지 않는다
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { STALE_QUEUED_MS } from '@/lib/generation-jobs'

/**
 * 화면이 5분에 포기하는데 서버는 10분까지 "진행 중" 으로 보면 그 사이 구간에서
 * 화면은 실패, DB 는 진행 중이 된다. 자동 회수(ghost sweep)도 STALE_QUEUED_MS 를
 * 넘긴 것만 보므로 이 구간에는 아무도 손대지 않는 사각지대가 생긴다.
 *
 * 두 숫자를 각자 적지 않고 서버 기준 하나에서 파생시킨다.
 */

const ROOT = process.cwd()

function sourceOf(relative: string): string {
  return readFileSync(join(ROOT, relative), 'utf8')
}

describe('생성 대기 포기 시각', () => {
  it('화면 폴링 상한이 서버 유령 기준과 같다', () => {
    const source = sourceOf('src/stores/director-store.ts')

    // 숫자를 직접 적으면 서버 기준이 바뀔 때 조용히 어긋난다.
    expect(source).toMatch(/VIDEO_POLL_TIMEOUT_MS\s*=\s*STALE_QUEUED_MS/)
    expect(source).not.toMatch(/VIDEO_POLL_TIMEOUT_MS\s*=\s*\d/)
  })

  it('작업 상태 확인 상한도 같은 기준을 쓴다', () => {
    const source = sourceOf('src/lib/generation-jobs-client.ts')

    expect(source).toMatch(/timeoutMs\s*=\s*STALE_QUEUED_MS/)
  })

  it('서버 기준은 10분이다', () => {
    expect(STALE_QUEUED_MS).toBe(10 * 60 * 1000)
  })
})
