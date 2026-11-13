// 새 형식(자유 배치 2판) 편집 저장본을 예전 화면이 옛 형식으로 덮지 못하게 서버가 막고, 옮기기 전 옛 형식 저장본을 한 벌 남기는지 검사한다 (오너 답 1 "자유 배치 — 추천대로" · 리드 위험 2, 2026-11-14)
import { beforeEach, describe, expect, it, vi } from 'vitest'

// 서버 저장본 한 행 — 읽는 칸마다 같은 것을 돌려준다(판 번호 · 옮기기 전 한 벌 · 저장본 전체 · 저장 시각).
type StoredRow = { version?: unknown; beforeV2?: unknown; state?: unknown; updated_at?: string }
const mocks = vi.hoisted(() => ({ stored: null as StoredRow | null, upsert: vi.fn() }))
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

import { GET, PUT } from '@/app/api/editor/state/route'

const put = (version: number, extra: Record<string, unknown> = {}) =>
  PUT(new Request('http://localhost/api/editor/state', { method: 'PUT', body: JSON.stringify({ projectId: 'p1', state: { version, shots: [], ...extra } }) }))
/** 마지막으로 서버에 적은 저장본. */
const written = () => (mocks.upsert.mock.calls.at(-1)?.[0] as { state: Record<string, unknown> }).state
const legacy = { version: 1, shots: [{ shotId: 'A' }], clipOrder: { sc_1: ['A'] }, videoClips: [{ shotId: 'A', url: 'https://video.test/A.mp4' }] }

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

describe('옮기기 전 한 벌', () => {
  it('예전 저장본을 새 형식으로 옮겨도 옛 형식 저장본은 그대로 남는다 — 서버 저장본 안 따로 칸에 한 벌', async () => {
    // 왜: 옮겨 적기는 되돌릴 수 없다(리드 2026-11-14, 2단계 위험 2) — 새 형식에 고장이 나면 이 한 벌로 "옮기던 때의 편집"을 되살린다.
    //   어느 브라우저가 옮기든 서버가 옮기기 직전에 적혀 있던 것을 그대로 남긴다. 되살리기는 사람이 한다(화면 없음).
    mocks.stored = { version: 1, beforeV2: null, state: legacy }
    expect((await put(2)).status).toBe(200)
    expect(written().version).toBe(2)
    expect(written().beforeV2).toEqual(legacy)
  })

  it('옮긴 뒤 새 형식으로 다시 저장해도 옮기기 전 한 벌은 그대로 따라가고, 화면이 보낸 것으로 바뀌지 않는다', async () => {
    // 왜: 저장할 때마다 한 벌이 빠지거나 바뀌면 되살릴 것이 없다. 화면은 한 벌을 받지도 보내지도 않는다(아래 열기 시험).
    mocks.stored = { version: 2, beforeV2: legacy, state: { version: 2, shots: [], beforeV2: legacy } }
    await put(2, { beforeV2: { version: 1, shots: [] } })
    expect(written().beforeV2).toEqual(legacy)
    await put(2)
    expect(written().beforeV2).toEqual(legacy)
  })

  it('처음부터 새 형식인 편집이나 예전 화면이 옛 형식으로 저장할 때는 따로 칸을 만들지 않는다', async () => {
    // 왜: 옮긴 적이 없으면 남길 것이 없다. 예전 화면(배포하는 동안 열려 있던 탭 · 배포를 되돌린 뒤)은 지금처럼 저장한다.
    mocks.stored = null
    await put(2)
    expect(written()).not.toHaveProperty('beforeV2')
    mocks.stored = { version: 2, beforeV2: null, state: { version: 2, shots: [] } }
    await put(2)
    expect(written()).not.toHaveProperty('beforeV2')
    mocks.stored = { version: 1, beforeV2: null, state: legacy }
    await put(1)
    expect(written()).not.toHaveProperty('beforeV2')
  })

  it('Editor 를 열 때 서버는 옮기기 전 한 벌을 빼고 보낸다', async () => {
    // 왜: 한 벌은 되살릴 때만 쓴다 — 열 때마다 두 배를 받으면 Editor 가 늦게 열린다.
    mocks.stored = { state: { version: 2, shots: [{ shotId: 'A' }], beforeV2: legacy }, updated_at: '2026-11-14T01:00:00.000Z' }
    const body = await (await GET(new Request('http://localhost/api/editor/state?projectId=p1'))).json()
    expect(body.state).toEqual({ version: 2, shots: [{ shotId: 'A' }] })
    expect(body.updatedAt).toBe('2026-11-14T01:00:00.000Z')
  })
})
