// 새 형식(자유 배치 2판) 편집 저장본을 예전 화면이 옛 형식으로 덮지 못하게 서버가 막고(판 검사와 쓰기를 한 문장으로), 옮기기 전 옛 형식 저장본을 한 벌 남기는지 검사한다 (오너 답 1 "자유 배치 — 추천대로" · 리드 위험 2 · 검토 c 낮음 6, 2026-11-14)
import { beforeEach, describe, expect, it, vi } from 'vitest'

// 서버 저장본 표(가짜) — 한 행. 읽기는 행에서 칸을 뽑고, 쓰기는 조건부 갱신(판 칸이 없거나 N 이하) · 새로 넣기(이미 있으면 23505)를
//   흉내 낸다. beforeWrite · beforeInsert 는 읽은 뒤 쓰기 전에 다른 저장이 끼어드는 때를 한 번 흉내 낸다.
type Row = { state: Record<string, unknown>; updated_at: string }
const mocks = vi.hoisted(() => ({
  row: null as Row | null,
  writes: 0,
  beforeWrite: null as (() => void) | null,
  beforeInsert: null as (() => void) | null,
  insertError: null as { code: string; message: string } | null,
}))
vi.mock('@/lib/api/guard', () => ({ requireProjectAccess: async () => ({ ok: true }) }))
vi.mock('@/lib/supabase/admin', () => {
  const once = (key: 'beforeWrite' | 'beforeInsert') => {
    const hook = mocks[key]
    mocks[key] = null
    hook?.()
  }
  const query = () => {
    let op: 'select' | 'update' | 'insert' = 'select'
    let cols = ''
    let values: { state?: Record<string, unknown>; updated_at?: string; project_id?: string } = {}
    let filter = ''
    const run = async (): Promise<{ data: unknown; error: unknown }> => {
      if (op === 'select') {
        const row = mocks.row
        if (!row) return { data: null, error: null }
        if (cols.startsWith('version:')) return { data: { version: row.state.version ?? null, beforeV2: row.state.beforeV2 ?? null }, error: null }
        if (cols === 'state') return { data: { state: row.state }, error: null }
        return { data: { state: row.state, updated_at: row.updated_at }, error: null }
      }
      if (op === 'update') {
        once('beforeWrite')
        const row = mocks.row
        const limit = Number(/lte\.(\d+)/.exec(filter)?.[1])
        const version = row?.state.version
        if (!row || !(version == null || Number(version) <= limit)) return { data: [], error: null }
        mocks.row = { state: values.state!, updated_at: values.updated_at! }
        mocks.writes += 1
        return { data: [{ updated_at: values.updated_at }], error: null }
      }
      once('beforeInsert')
      if (mocks.insertError) return { data: null, error: mocks.insertError }
      if (mocks.row) return { data: null, error: { code: '23505', message: 'duplicate key' } }
      mocks.row = { state: values.state!, updated_at: values.updated_at! }
      mocks.writes += 1
      return { data: { updated_at: values.updated_at }, error: null }
    }
    const q = {
      select: (c: string) => {
        if (op === 'select') cols = c.replace(/\s+/g, '')
        return q
      },
      eq: () => q,
      or: (f: string) => {
        filter = f
        return q
      },
      update: (v: typeof values) => {
        op = 'update'
        values = v
        return q
      },
      insert: (v: typeof values) => {
        op = 'insert'
        values = v
        return q
      },
      maybeSingle: run,
      then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => run().then(resolve, reject),
    }
    return q
  }
  return { supabaseAdmin: { from: () => query() } }
})

import { GET, PUT } from '@/app/api/editor/state/route'

const put = (version: number, extra: Record<string, unknown> = {}) =>
  PUT(new Request('http://localhost/api/editor/state', { method: 'PUT', body: JSON.stringify({ projectId: 'p1', state: { version, shots: [], ...extra } }) }))
/** 지금 서버에 적혀 있는 저장본. */
const written = () => mocks.row?.state as Record<string, unknown>
const stored = (state: Record<string, unknown>) => ({ state, updated_at: '2026-11-14T00:00:00.000Z' })
const legacy = { version: 1, shots: [{ shotId: 'A' }], clipOrder: { sc_1: ['A'] }, videoClips: [{ shotId: 'A', url: 'https://video.test/A.mp4' }] }

beforeEach(() => {
  mocks.row = null
  mocks.writes = 0
  mocks.beforeWrite = null
  mocks.beforeInsert = null
  mocks.insertError = null
})

describe('저장 형식 2판', () => {
  it('예전 화면이 새 형식 저장본을 옛 형식으로 덮으려 하면 서버가 받지 않는다', async () => {
    // 왜: 배포하는 동안 예전 화면이 열려 있던 탭이 빈 곳 · 자리가 없는 옛 형식으로 저장하면 새 편집이 사라진다.
    //   그 탭에는 지금 있는 "서버에 저장할 수 없어요 · 새로고침" 안내가 뜬다(4xx 는 다시 시도하지 않는다).
    mocks.row = stored({ version: 2 })
    const res = await put(1)
    expect(res.status).toBe(409)
    expect(mocks.writes).toBe(0)
  })

  it('같은 형식이나 더 새 형식의 저장본은 그대로 받는다', async () => {
    // 왜: 정상 경로 고정 — 새 화면끼리, 그리고 예전 저장본을 새 화면이 처음 열어 저장할 때.
    mocks.row = stored({ version: 2 })
    expect((await put(2)).status).toBe(200)
    mocks.row = stored({ version: 1 })
    expect((await put(2)).status).toBe(200)
    mocks.row = null
    expect((await put(1)).status).toBe(200)
    expect(mocks.writes).toBe(3)
  })

  it('읽은 뒤 쓰기 전에 새 형식 저장이 끼어들어도 옛 형식 저장은 덮지 못하고 받지 않는다', async () => {
    // 왜: 검토 c 낮음 6 — 판 읽기와 쓰기가 따로라, 그 사이 새 화면이 2판을 쓰면 옛 화면의 1판이 그 위를 덮을 수 있었다.
    //   판 검사와 쓰기를 한 문장(판이 낮지 않을 때만 갱신)으로 묶는다.
    mocks.row = stored({ version: 1, shots: [] })
    mocks.beforeWrite = () => {
      mocks.row = stored({ version: 2, shots: ['new-tab'] })
    }
    expect((await put(1)).status).toBe(409)
    expect(written()).toEqual({ version: 2, shots: ['new-tab'] })
  })

  it('처음 저장하는 프로젝트는 새로 적고, 그 사이 다른 탭이 먼저 적었으면 판을 견줘 한 번 더 쓴다', async () => {
    // 왜: 행이 없을 때도 같은 규칙 — 다른 탭이 먼저 만든 행을 판 검사 없이 덮거나, 이유 없이 실패하지 않게.
    mocks.beforeInsert = () => {
      mocks.row = stored({ version: 1, shots: ['other-tab'] })
    }
    expect((await put(2)).status).toBe(200)
    expect(written().version).toBe(2)
    mocks.row = null
    mocks.beforeInsert = () => {
      mocks.row = stored({ version: 2, shots: ['other-tab'] })
    }
    expect((await put(1)).status).toBe(409)
    expect(written()).toEqual({ version: 2, shots: ['other-tab'] })
  })

  it('프로젝트가 지워진 뒤에 온 저장은 410 으로 돌려준다', async () => {
    // 왜: 정상 경로 고정 — 지워진 프로젝트를 연 채 둔 화면이 자동 저장을 계속 쏘면 서버 고장이 아니라 끝난 화면이다(다시 시도 멈춤).
    mocks.insertError = { code: '23503', message: 'violates foreign key constraint' }
    expect((await put(2)).status).toBe(410)
  })
})

describe('옮기기 전 한 벌', () => {
  it('예전 저장본을 새 형식으로 옮겨도 옛 형식 저장본은 그대로 남는다 — 서버 저장본 안 따로 칸에 한 벌', async () => {
    // 왜: 옮겨 적기는 되돌릴 수 없다(리드 2026-11-14, 2단계 위험 2) — 새 형식에 고장이 나면 이 한 벌로 "옮기던 때의 편집"을 되살린다.
    //   어느 브라우저가 옮기든 서버가 옮기기 직전에 적혀 있던 것을 그대로 남긴다. 되살리기는 사람이 한다(화면 없음).
    mocks.row = stored(legacy)
    expect((await put(2)).status).toBe(200)
    expect(written().version).toBe(2)
    expect(written().beforeV2).toEqual(legacy)
  })

  it('옮긴 뒤 새 형식으로 다시 저장해도 옮기기 전 한 벌은 그대로 따라가고, 화면이 보낸 것으로 바뀌지 않는다', async () => {
    // 왜: 저장할 때마다 한 벌이 빠지거나 바뀌면 되살릴 것이 없다. 화면은 한 벌을 받지도 보내지도 않는다(아래 열기 시험).
    mocks.row = stored({ version: 2, shots: [], beforeV2: legacy })
    await put(2, { beforeV2: { version: 1, shots: [] } })
    expect(written().beforeV2).toEqual(legacy)
    await put(2)
    expect(written().beforeV2).toEqual(legacy)
  })

  it('처음부터 새 형식인 편집이나 예전 화면이 옛 형식으로 저장할 때는 따로 칸을 만들지 않는다', async () => {
    // 왜: 옮긴 적이 없으면 남길 것이 없다. 예전 화면(배포하는 동안 열려 있던 탭 · 배포를 되돌린 뒤)은 지금처럼 저장한다.
    mocks.row = null
    await put(2)
    expect(written()).not.toHaveProperty('beforeV2')
    mocks.row = stored({ version: 2, shots: [] })
    await put(2)
    expect(written()).not.toHaveProperty('beforeV2')
    mocks.row = stored(legacy)
    await put(1)
    expect(written()).not.toHaveProperty('beforeV2')
  })

  it('Editor 를 열 때 서버는 옮기기 전 한 벌을 빼고 보낸다', async () => {
    // 왜: 한 벌은 되살릴 때만 쓴다 — 열 때마다 두 배를 받으면 Editor 가 늦게 열린다.
    mocks.row = { state: { version: 2, shots: [{ shotId: 'A' }], beforeV2: legacy }, updated_at: '2026-11-14T01:00:00.000Z' }
    const body = await (await GET(new Request('http://localhost/api/editor/state?projectId=p1'))).json()
    expect(body.state).toEqual({ version: 2, shots: [{ shotId: 'A' }] })
    expect(body.updatedAt).toBe('2026-11-14T01:00:00.000Z')
  })
})
