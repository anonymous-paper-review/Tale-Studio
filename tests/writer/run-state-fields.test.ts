// 최근 실행 기록을 state 칸만 골라 읽으면 그 칸만 DB 에 묻고 그 칸들로 state 를 다시 만든다 — 고르지 않으면 지금처럼 전부 읽는다 (2026-11-03 오너 QA 2번)
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ select: vi.fn(), row: null as Record<string, unknown> | null }))
vi.mock('@/lib/supabase/admin', () => {
  const chain: Record<string, unknown> = {}
  chain.select = (columns: string) => { mocks.select(columns); return chain }
  chain.eq = () => chain
  chain.order = () => chain
  chain.limit = () => chain
  chain.maybeSingle = async () => ({ data: mocks.row, error: null })
  return { supabaseAdmin: { from: () => chain } }
})

import { getActiveRun } from '@/lib/writer/run-store'

const COLUMNS = { id: 'run-1', project_id: 'p1', status: 'completed', current_stage: 'persistShots', completed_units: 9, total_units: 9, error: null, created_at: '2026-11-02T00:00:00.000Z', updated_at: '2026-11-03T00:00:00.000Z', state_version: 4 }

beforeEach(() => {
  mocks.select.mockReset()
  mocks.row = null
})

describe('실행 기록 칸 골라 읽기', () => {
  // 왜: 완성된 실행 기록은 수백 KB 짜리 샷 설계 칸을 품고 있다 — 산문만 보는 화면이 그것까지 받으면 느리다.
  it('state 칸을 고르면 그 칸만 DB 에 묻고 state 전체는 묻지 않는다', async () => {
    mocks.row = { ...COLUMNS }

    await getActiveRun('p1', { stateFields: ['scenes', '_proseLocked'] })

    const asked = String(mocks.select.mock.calls[0][0])
    expect(asked).toMatch(/:state->scenes\b/)
    expect(asked).toMatch(/:state->_proseLocked\b/)
    expect(asked).not.toContain('*')
    expect(asked.split(',')).not.toContain('state')
    for (const column of Object.keys(COLUMNS)) expect(asked.split(',')).toContain(column)
  })

  // 왜: 화면 코드는 run.state.scenes 처럼 그대로 읽는다 — 고른 칸으로 같은 모양을 다시 만들고, 기록에 없던 칸은 없는 그대로 둔다.
  it('골라 읽은 칸으로 state 를 다시 만들고 기록에 없던 칸은 비워 둔다', async () => {
    const values: Record<string, unknown> = { scenes: { scenes: [{ scene_id: 'scene_1' }] }, _proseLocked: true, worldVisual: null }
    // DB 는 묻는 별칭마다 그 칸 값을 돌려준다(별칭 이름은 run-store 가 정한다) — 없는 칸은 null.
    mocks.select.mockImplementation((columns: string) => {
      const aliased = columns.split(',').filter((part) => part.includes(':state->'))
      mocks.row = { ...COLUMNS, ...Object.fromEntries(aliased.map((part) => {
        const [alias, path] = part.split(':')
        return [alias, values[path.replace('state->', '')] ?? null]
      })) }
    })

    const result = await getActiveRun('p1', { stateFields: ['scenes', '_proseLocked', 'worldVisual'] })

    expect(result).toEqual({ ...COLUMNS, state: { scenes: { scenes: [{ scene_id: 'scene_1' }] }, _proseLocked: true } })
  })

  // 왜: 정상 경로 고정 — 다른 서버 길(파이프라인 · 씬 게이트)은 지금처럼 실행 기록 전체를 읽는다.
  it('칸을 고르지 않으면 지금처럼 실행 기록 전체를 읽는다', async () => {
    mocks.row = { ...COLUMNS, state: { input: { story: '이야기' }, shotSequence: { shots: [] } } }

    const result = await getActiveRun('p1')

    expect(mocks.select).toHaveBeenCalledWith('*')
    expect(result?.state).toEqual({ input: { story: '이야기' }, shotSequence: { shots: [] } })
  })
})
