// t0-grounding-pin-stage-coverage — 저장된 호출 기록(llm_calls) 읽기 전용 조회.
//   접속 패턴은 scripts/verify-db.mjs 상단과 동일(.env.local 직접 파싱 → createClient).
//   b964a35("접지 콜을 접지 모델 우선으로 되돌림", 2026-08-12 15:08:59 +0900) 이후의
//   접지 4단계 호출을 스테이지별·모델별로 센다. INSERT/UPDATE/DELETE 없음.
import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync } from 'node:fs'

const env = Object.fromEntries(
  readFileSync(new URL('../../../.env.local', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()]
    }),
)

const db = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY,
  { auth: { persistSession: false } },
)

const CUTOFF = '2026-08-12T06:08:59Z' // b964a35 커밋 시각(UTC)
const STAGES = ['dramaturgy', 'narrativeStructure', 'scenes', 'structureScenesMerged']

// 재생성(리페어) 콜은 접지 콜이 아니다 — 프롬프트가 원문 + 대괄호 지시 블록이다.
const REPAIR_MARKERS = ['[규칙 위반', '[시간 예산 위반']

const out = { cutoff: CUTOFF, queriedAt: new Date().toISOString(), totalRowsSinceCutoff: 0, byStage: {} }

// 전체 행 수(스테이지 무관) — 커밋 이후 아카이브가 아예 있는지부터 본다.
{
  const { count, error } = await db
    .from('llm_calls')
    .select('id', { count: 'exact', head: true })
    .gte('called_at', CUTOFF)
  if (error) throw new Error(`llm_calls count 실패: ${error.message}`)
  out.totalRowsSinceCutoff = count ?? 0
}

for (const stage of STAGES) {
  const { data, error } = await db
    .from('llm_calls')
    .select('project_id, stage, seq, provider, model, duration_ms, called_at, error, prompt')
    .eq('stage', stage)
    .gte('called_at', CUTOFF)
    .order('called_at', { ascending: true })
    .limit(2000)
  if (error) throw new Error(`llm_calls select(${stage}) 실패: ${error.message}`)

  const rows = data ?? []
  const grounding = rows.filter((r) => !REPAIR_MARKERS.some((m) => (r.prompt ?? '').includes(m)))
  const repair = rows.filter((r) => REPAIR_MARKERS.some((m) => (r.prompt ?? '').includes(m)))

  const tally = (list) => {
    const m = {}
    for (const r of list) {
      const k = `${r.provider}/${r.model}`
      m[k] = m[k] ?? { calls: 0, durations: [] }
      m[k].calls += 1
      if (typeof r.duration_ms === 'number') m[k].durations.push(r.duration_ms)
    }
    for (const k of Object.keys(m)) {
      const d = m[k].durations.sort((a, b) => a - b)
      m[k].median_ms = d.length ? d[Math.floor(d.length / 2)] : null
      m[k].min_ms = d.length ? d[0] : null
      m[k].max_ms = d.length ? d[d.length - 1] : null
      delete m[k].durations
    }
    return m
  }

  out.byStage[stage] = {
    totalRows: rows.length,
    groundingCalls: grounding.length,
    repairCalls: repair.length,
    groundingByModel: tally(grounding),
    repairByModel: tally(repair),
    firstCalledAt: rows[0]?.called_at ?? null,
    lastCalledAt: rows[rows.length - 1]?.called_at ?? null,
    errorCount: rows.filter((r) => r.error).length,
  }
}

// 접지 모델 이름이 다른 스테이지에서도 찍혔는지(=핀이 다른 데로 샜는지) 역방향 확인.
{
  const { data, error } = await db
    .from('llm_calls')
    .select('stage, model')
    .eq('model', 'gemini-3-flash-preview')
    .gte('called_at', CUTOFF)
    .limit(2000)
  if (error) throw new Error(`llm_calls select(preview) 실패: ${error.message}`)
  const m = {}
  for (const r of data ?? []) m[r.stage] = (m[r.stage] ?? 0) + 1
  out.groundingModelRowsByStage = m
}

writeFileSync(new URL('./db-raw.json', import.meta.url), JSON.stringify(out, null, 2))
console.log(JSON.stringify(out, null, 2))
