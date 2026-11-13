// 새 형식(자유 배치 2판) 편집 저장본을 예전 화면이 옛 형식으로 덮지 못하게 서버가 막는지 검사한다 (오너 답 1 "자유 배치 — 추천대로", 2026-11-14)
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ stored: null as { version: unknown } | null, upsert: vi.fn() }))
vi.mock('@/lib/api/guard', () => ({ requireProjectAccess: async () => ({ ok: true }) }))
vi.mock('@/lib/supabase/admin', () => {
  const read = { select: () => read, eq: () => read, maybeSingle: async () => ({ data: mocks.stored, error: null }) }
  const write = { select: () => write, maybeSingle: async () => ({ data: { updated_at: '2026-11-14T01:00:00.000Z' }, error: null }) }
  return {
    supabaseAdmin: {
      from: () => ({
        ...read,
        upsert: (...args: unknown[]) => {
          mocks.upsert(...args)
          return write
        },
      }),
    },
  }
})

import { PUT } from '@/app/api/editor/state/route'

const put = (version: number) =>
  PUT(new Request('http://localhost/api/editor/state', { method: 'PUT', body: JSON.stringify({ projectId: 'p1', state: { version, shots: [] } }) }))

beforeEach(() => {
  mocks.stored = null
  mocks.upsert.mockReset()
})

describe('저장 형식 2판', () => {
  it('예전 화면이 새 형식 저장본을 옛 형식으로 덮으려 하면 서버가 받지 않는다', async () => {
    // 왜: 배포하는 동안 예전 화면이 열려 있던 탭이 빈 곳 · 자리가 없는 옛 형식으로 저장하면 새 편집이 사라진다.
    //   그 탭에는 지금 있는 "서버에 저장할 수 없어요 · 새로고침" 안내가 뜬다(4xx 는 다시 시도하지 않는다).
    mocks.stored = { version: 2 }
    const res = await put(1)
    expect(res.status).toBe(409)
    expect(mocks.upsert).not.toHaveBeenCalled()
  })

  it('같은 형식이나 더 새 형식의 저장본은 그대로 받는다', async () => {
    // 왜: 정상 경로 고정 — 새 화면끼리, 그리고 예전 저장본을 새 화면이 처음 열어 저장할 때.
    mocks.stored = { version: 2 }
    expect((await put(2)).status).toBe(200)
    mocks.stored = { version: 1 }
    expect((await put(2)).status).toBe(200)
    mocks.stored = null
    expect((await put(1)).status).toBe(200)
    expect(mocks.upsert).toHaveBeenCalledTimes(3)
  })
})
