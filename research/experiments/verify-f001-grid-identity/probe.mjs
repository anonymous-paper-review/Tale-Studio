// verify-f001-grid-identity — 읽기 전용 감사.
// 티켓: .claude/vault/backlog/verify-f001-grid-identity.md
// 어떻게 재나(티켓 원문): generation_jobs 에서 kind=storyboard_real_grid, completed,
//   created_at >= 2026-08-12T11:13Z 인 잡의 input_snapshot.prompt 를 읽는다.
// 판정선(티켓 원문): `Column i: <이름>` 배정문과 `reference image N = <이름>` 규약이 둘 다 있으면 통과.
//
// usage: node research/experiments/verify-f001-grid-identity/probe.mjs
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

const KIND = 'storyboard_real_grid'
const SINCE = '2026-08-12T11:13:00Z'

// 1) 티켓의 "잴 대상 실재 확인" — 조건 충족 여부 자체가 대상 확인.
const { data: allJobs, error: e1 } = await db
  .from('generation_jobs')
  .select('id, project_id, kind, status, created_at, input_snapshot, result_url, target, model, provider')
  .eq('kind', KIND)
  .gte('created_at', SINCE)
  .order('created_at', { ascending: true })

if (e1) throw new Error(`generation_jobs query failed: ${JSON.stringify(e1)}`)

const completed = allJobs.filter((j) => j.status === 'completed')

// 2) 채점은 코드가 한다. 정규식 두 개.
//    티켓 판정선 문구 그대로: `Column i: <이름>` / `reference image N = <이름>`
const RE_COLUMN = /Column\s+(\d+)\s*:\s*([^\n]+)/gi
// 한 줄에 여러 쌍이 세미콜론으로 이어질 수 있어 쌍 단위로 끊는다.
const RE_REFIMG = /reference\s+image\s+(\d+)\s*=\s*([^;.\n]+)/gi

const rows = completed.map((j) => {
  const prompt =
    j.input_snapshot && typeof j.input_snapshot === 'object'
      ? j.input_snapshot.prompt
      : undefined
  const promptStr = typeof prompt === 'string' ? prompt : null
  const cols = promptStr ? [...promptStr.matchAll(RE_COLUMN)] : []
  const refs = promptStr ? [...promptStr.matchAll(RE_REFIMG)] : []
  return {
    job_id: j.id,
    project_id: j.project_id,
    created_at: j.created_at,
    has_input_snapshot: !!j.input_snapshot,
    input_snapshot_keys: j.input_snapshot ? Object.keys(j.input_snapshot) : [],
    prompt_present: promptStr !== null,
    prompt_len: promptStr ? promptStr.length : 0,
    column_lines: cols.map((m) => m[0].trim().slice(0, 200)),
    refimage_lines: refs.map((m) => m[0].trim().slice(0, 200)),
    has_column: cols.length > 0,
    has_refimage: refs.length > 0,
    // 추가 관측 재료(판정 아님): 한 시트 안에 서로 다른 인물이 섞였는가
    assigned_names: [...new Set(cols.map((m) => m[2].trim()))],
    refimage_names: [...new Set(refs.map((m) => m[2].trim()))],
    mixed_cast_sheet:
      new Set(
        cols
          .map((m) => m[2].trim())
          .filter((n) => !/^no character/i.test(n)),
      ).size > 1,
    verdict:
      promptStr === null
        ? 'prompt-missing'
        : cols.length > 0 && refs.length > 0
          ? 'pass'
          : 'fail',
    prompt_full: promptStr,
    model: j.model,
    provider: j.provider,
    target: j.target,
    result_url: j.result_url,
  }
})

// 3) 추가 관측 재료: 각 잡의 프로젝트 writer 인물 데이터 (그림 판정은 하지 않는다)
const projectIds = [...new Set(rows.map((r) => r.project_id).filter(Boolean))]
const charsByProject = {}
if (projectIds.length) {
  const { data: chars, error: e2 } = await db
    .from('characters')
    .select('id, project_id, character_id, name, entity_type, portrait, view_main')
    .in('project_id', projectIds)
  if (e2) throw new Error(`characters query failed: ${JSON.stringify(e2)}`)
  for (const c of chars) {
    ;(charsByProject[c.project_id] ||= []).push({
      id: c.id,
      character_id: c.character_id,
      name: c.name,
      entity_type: c.entity_type,
      has_portrait: !!c.portrait,
      portrait: c.portrait,
      view_main: c.view_main,
    })
  }
}

const result = {
  ticket: 'verify-f001-grid-identity',
  ran_at: new Date().toISOString(),
  query: {
    table: 'generation_jobs',
    filters: { kind: KIND, created_at_gte: SINCE },
    scored_status: 'completed',
  },
  counts: {
    jobs_matching_kind_and_time: allJobs.length,
    by_status: allJobs.reduce((a, j) => ((a[j.status] = (a[j.status] || 0) + 1), a), {}),
    scored: rows.length,
    pass: rows.filter((r) => r.verdict === 'pass').length,
    fail: rows.filter((r) => r.verdict === 'fail').length,
    prompt_missing: rows.filter((r) => r.verdict === 'prompt-missing').length,
    mixed_cast_sheets: rows.filter((r) => r.mixed_cast_sheet).length,
  },
  rows,
  characters_by_project: charsByProject,
}

writeFileSync(
  new URL('./results.json', import.meta.url),
  JSON.stringify(result, null, 2),
)
console.log(JSON.stringify({ counts: result.counts, sample: rows.slice(0, 3).map((r) => ({ job_id: r.job_id, created_at: r.created_at, verdict: r.verdict, prompt_len: r.prompt_len, cols: r.column_lines.length, refs: r.refimage_lines.length })) }, null, 2))
