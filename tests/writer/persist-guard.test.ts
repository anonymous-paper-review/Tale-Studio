// 저장할 때 실패를 숨기지 않고, 사용자가 다시 시도할 수 있도록 알려준다 (#persist-guard 2026-07-31)
// persist DB 쓰기 가드(#persist-guard 2026-07-31) — supabase-js 는 에러를 throw 하지 않고
//   { error } 로 반환한다. 결과를 버리면 실패가 조용히 지나가 "run completed 인데 shots 0행"
//   실사고(fe699c5b: 미적용 스키마 42703)가 났다. persistShotsToDb 가 insert/delete 실패를
//   반드시 던져 상위(persistShots step 재시도)에 드러내는지 검증한다.
import { beforeEach, describe, expect, it, vi } from 'vitest'

// 체이너블 쿼리 스텁 — 테이블별 응답을 주입한다. then() 구현으로 await 가능(thenable).
type DbResult = { data: unknown; error: { message: string } | null }
const responses = new Map<string, DbResult>()
const calls: Array<{ table: string; op: string }> = []
// #F-003 R3 검증용 — delete 의 스코프(eq 인자)와 insert 페이로드를 관찰한다.
const eqArgs: Array<{ table: string; op: string; col: unknown; val: unknown }> = []
const insertPayloads: Array<{ table: string; rows: unknown }> = []

function chain(table: string) {
  const state = { op: 'select' }
  const result = (): DbResult => responses.get(`${table}.${state.op}`) ?? { data: [], error: null }
  const c: Record<string, unknown> = {}
  const self = () => c
  for (const m of ['select', 'insert', 'update', 'delete', 'upsert']) {
    c[m] = (...args: unknown[]) => {
      state.op = m
      calls.push({ table, op: m })
      if (m === 'insert') insertPayloads.push({ table, rows: args[0] })
      return c
    }
  }
  for (const m of ['neq', 'order', 'limit', 'in']) c[m] = self
  c.eq = (col: unknown, val: unknown) => {
    eqArgs.push({ table, op: state.op, col, val })
    return c
  }
  c.maybeSingle = () => Promise.resolve(result())
  c.single = () => Promise.resolve(result())
  // thenable — await chain 시 테이블·연산별 주입 응답 반환
  c.then = (onOk: (v: DbResult) => unknown, onErr?: (e: unknown) => unknown) =>
    Promise.resolve(result()).then(onOk, onErr)
  return c
}

vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: { from: (table: string) => chain(table) },
}))
// i18n 파생(LLM)은 순수 패스스루로 대체 — DB 가드만 검증한다.
vi.mock('@/lib/writer/i18n/derive-en', () => ({
  deriveEnBatch: async (rows: Array<{ id: string; native: string }>) =>
    new Map(rows.map((r) => [r.id, r.native])),
  deriveNativeBatch: async (rows: Array<{ id: string; en: string }>) =>
    new Map(rows.map((r) => [r.id, r.en])),
  i18nHash: () => 'h',
  isTargetScript: () => true,
}))

import { persistShotsToDb } from '@/lib/writer/pipeline/util/persist_manifest'
import type { ShotSequence } from '@/lib/writer/types/pipeline'

const PROJECT_ID = '00000000-0000-0000-0000-000000000001'

function seq(): ShotSequence {
  return {
    project_id: PROJECT_ID,
    total_shots: 1,
    total_duration_seconds: 5,
    depth_level: 'D3',
    shots: [
      {
        shot_id: 'shot_1',
        duration_seconds: 5,
        S: { scene_id: 'scene_1', scene_purpose: 'p', emotion_beat: { start: '', end: '' }, character_action: 'act' },
        C: { causal_link: { from: null, to: null }, info_disclosure: '' },
        V: { camera: { type: 'MS' } },
        assets: { characters: [{ id: 'kai', asset_version: 'v1' }] },
      } as unknown as ShotSequence['shots'][number],
    ],
  }
}

beforeEach(() => {
  responses.clear()
  calls.length = 0
  eqArgs.length = 0
  insertPayloads.length = 0
  responses.set('character_appearances.select', {
    data: [
      {
        character_id: 'kai',
        appearance_key: 'kai-current',
        narrative_time: 'present',
        is_default: true,
      },
    ],
    error: null,
  })
  responses.set('scenes.select', {
    data: [{ scene_id: 'sc_01', narrative_time: 'present' }],
    error: null,
  })
  responses.set('scene_character_appearance_overrides.select', { data: [], error: null })
})

describe('persistShotsToDb — 저장 실패를 숨기지 않고 사용자에게 알린다', () => {
  it('저장 중 오류가 나면 조용히 성공한 것으로 처리하지 않고 알려준다', async () => {
    responses.set('shots.insert', {
      data: null,
      error: { message: 'column shots.static_spec does not exist' },
    })
    await expect(persistShotsToDb(PROJECT_ID, seq(), null)).rejects.toThrow(
      /shots insert failed.*static_spec/,
    )
  })

  it('기존 장면을 지울 수 없으면 저장을 완료한 것으로 처리하지 않고 알려준다', async () => {
    responses.set('shots.delete', { data: null, error: { message: 'permission denied' } })
    await expect(persistShotsToDb(PROJECT_ID, seq(), null)).rejects.toThrow(/shots delete failed/)
  })

  it('문제없이 저장하면 이전 장면을 정리한 뒤 새 장면을 기록한다', async () => {
    await persistShotsToDb(PROJECT_ID, seq(), null)
    const shotOps = calls.filter((c) => c.table === 'shots').map((c) => c.op)
    expect(shotOps[0]).toBe('select') // carry-forward 조회
    expect(shotOps).toContain('delete')
    expect(shotOps).toContain('insert')
    expect(shotOps.indexOf('delete')).toBeLessThan(shotOps.indexOf('insert'))
  })
})

// #F-003 R3 (2026-08-13) — 실측 dc531572: persist 의 프로젝트 전체 DELETE 는 채팅/수동 샷까지
// 쓸어버린다(사고 당시엔 persist 가 채팅보다 먼저라 16샷이 살았을 뿐). 계약: 파이프라인은
// source='pipeline' 행만 갈아엎고, 생존 수동 행과 shot_id 가 충돌하면 수동이 이긴다
// (파이프라인 산출은 재생성 가능, 사람의 글은 불가 — architecture §5 원칙 2).
describe('persistShotsToDb — 자동으로 만든 장면만 바꾸고 사람이 만든 장면은 보존한다 (#F-003 R3)', () => {
  it('자동으로 만든 장면만 다시 저장하고 사람이 만든 장면은 다음 실행에도 남긴다', async () => {
    await persistShotsToDb(PROJECT_ID, seq(), null)
    expect(eqArgs).toContainEqual({ table: 'shots', op: 'delete', col: 'source', val: 'pipeline' })
  })

  it('자동으로 만든 장면임을 분명히 표시해 서로 구분한다', async () => {
    await persistShotsToDb(PROJECT_ID, seq(), null)
    const payload = insertPayloads.find((p) => p.table === 'shots')?.rows as Array<
      Record<string, unknown>
    >
    expect(payload.length).toBeGreaterThan(0)
    for (const row of payload) {
      expect(row.source).toBe('pipeline')
      expect(row.character_appearance_keys).toEqual({ kai: 'kai-current' })
    }
  })

  it('사람이 만든 장면과 같은 번호가 나오면 사람의 장면을 남기고 자동 결과를 건너뛴 사실을 알린다', async () => {
    // survivors 조회가 sh_01_01(= seq() 의 shot_1 이 매핑될 main id)을 반환하도록 주입.
    responses.set('shots.select', { data: [{ shot_id: 'sh_01_01' }], error: null })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      await persistShotsToDb(PROJECT_ID, seq(), null)
      const payload = insertPayloads.find((p) => p.table === 'shots')?.rows as Array<
        Record<string, unknown>
      >
      expect((payload ?? []).some((r) => r.shot_id === 'sh_01_01')).toBe(false)
      expect(warn.mock.calls.some((c) => String(c[0]).includes('수동 우선'))).toBe(true)
    } finally {
      warn.mockRestore()
    }
  })
})
