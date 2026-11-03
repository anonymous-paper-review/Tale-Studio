// 실행 기록에서 산문 화면이 쓰는 칸만 고르면 그 칸만 읽고 같은 모양으로 돌려준다 — 고르지 않으면 지금처럼 다 읽는다 (2026-11-03 오너 QA 2번)
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
  // 왜: 완성된 실행 기록은 수백 KB 짜리 샷 설계를 품고 있다 — 산문만 보는 화면이 그것까지 받으면 Writer 탭이 늦게 열린다.
  it('실행 기록에서 산문 화면이 쓰는 칸만 고르면 그 칸만 읽는다', async () => {
    mocks.row = { ...COLUMNS }

    await getActiveRun('p1', { stateFields: ['scenes', '_proseLocked'] })

    const asked = String(mocks.select.mock.calls[0][0])
    expect(asked).toMatch(/:state->scenes\b/)
    expect(asked).toMatch(/:state->_proseLocked\b/)
    expect(asked).not.toContain('*')
    expect(asked.split(',')).not.toContain('state')
    for (const column of Object.keys(COLUMNS)) expect(asked.split(',')).toContain(column)
  })

  // 왜: 산문 화면은 고르기 전과 같은 모양으로 실행 기록을 읽는다 — 기록에 없던 칸은 고른 뒤에도 없는 그대로여야 한다.
  it('고른 칸만 읽어도 실행 기록은 같은 모양으로 오고, 기록에 없던 칸은 비어 있다', async () => {
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

  // 왜: 정상 경로 고정 — 산문 화면 말고 다른 곳(이야기 만들기 · 씬 확정)은 지금처럼 실행 기록을 다 읽는다.
  it('칸을 고르지 않으면 지금처럼 실행 기록을 다 읽는다', async () => {
    mocks.row = { ...COLUMNS, state: { input: { story: '이야기' }, shotSequence: { shots: [] } } }

    const result = await getActiveRun('p1')

    expect(mocks.select).toHaveBeenCalledWith('*')
    expect(result?.state).toEqual({ input: { story: '이야기' }, shotSequence: { shots: [] } })
  })
})
