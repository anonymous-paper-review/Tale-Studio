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
        assets: { characters: [] },
      } as unknown as ShotSequence['shots'][number],
    ],
  }
}

beforeEach(() => {
  responses.clear()
  calls.length = 0
  eqArgs.length = 0
  insertPayloads.length = 0
})

describe('persistShotsToDb — DB 쓰기 가드', () => {
  it('shots insert 가 error 를 반환하면 throw 한다 (조용한 0행 금지)', async () => {
    responses.set('shots.insert', {
      data: null,
      error: { message: 'column shots.static_spec does not exist' },
    })
    await expect(persistShotsToDb(PROJECT_ID, seq(), null)).rejects.toThrow(
      /shots insert failed.*static_spec/,
    )
  })

  it('shots delete 가 error 를 반환해도 throw 한다', async () => {
    responses.set('shots.delete', { data: null, error: { message: 'permission denied' } })
    await expect(persistShotsToDb(PROJECT_ID, seq(), null)).rejects.toThrow(/shots delete failed/)
  })

  it('정상 경로 — 에러 없으면 delete → insert 순으로 완료된다', async () => {
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
describe('persistShotsToDb — 소유권 경계 (#F-003 R3)', () => {
  it('delete 는 source=pipeline 으로 스코프된다 — 수동 샷은 재런에서 살아남는다', async () => {
    await persistShotsToDb(PROJECT_ID, seq(), null)
    expect(eqArgs).toContainEqual({ table: 'shots', op: 'delete', col: 'source', val: 'pipeline' })
  })

  it('파이프라인 insert 행은 source=pipeline 을 명시한다', async () => {
    await persistShotsToDb(PROJECT_ID, seq(), null)
    const payload = insertPayloads.find((p) => p.table === 'shots')?.rows as Array<
      Record<string, unknown>
    >
    expect(payload.length).toBeGreaterThan(0)
    for (const row of payload) expect(row.source).toBe('pipeline')
  })

  it('생존 수동 샷과 shot_id 충돌 시 수동이 이긴다 — 파이프라인 행 스킵 + 경고 표면화', async () => {
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
