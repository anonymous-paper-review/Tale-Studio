#!/usr/bin/env node
// 스타일 프리셋 12종의 facet 조각을 style_anchors.facets 에 넣는다 (2026-10-08 오너 · facet 인계).
//
// 원천: .claude/docs/2026-10-08/facet-presets/presets/index.json 의 <key>.facets (v3 — 인물 보드 + 재컴파일).
//   제품이 싣는 조각 4개(probe_anchors · figure · priority · negative)와 출처 기록만 넣는다 — 기록용
//   capsule · scene 과 filled 전문은 넣지 않는다(재컴파일은 인계 폴더의 filled.json 으로 한다).
//
// 사용: node scripts/style-anchor-facets-seed.mjs --expect-ref <project-ref> [--dry-run]
//   대상은 환경 변수 SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY 다. --expect-ref 가 주소의 ref 와 다르면 아무것도
//   쓰지 않는다(개발 DB 먼저 → live 는 main 배포 뒤, CLAUDE.md 개발환경 절). 키는 출력하지 않는다.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export const FACETS_SOURCE = '.claude/docs/2026-10-08/facet-presets/presets/index.json'

const CARRIED = ['version', 'extracted_at', 'probe_anchors', 'figure', 'figure_extrapolated', 'figure_source', 'priority', 'negative', 'compile_rules', 'compile_model', 'priority_model']

/** 인계 index.json → { key: facets } — 조각 문자열은 다듬지 않고 그대로 싣는다(인계 §3.2). */
export function buildFacetsSeed(index) {
  const seed = {}
  for (const [key, entry] of Object.entries(index)) {
    const facets = entry?.facets
    if (!facets || typeof facets.probe_anchors !== 'string' || !facets.probe_anchors.trim()) continue
    seed[key] = Object.fromEntries(CARRIED.filter((field) => facets[field] !== undefined).map((field) => [field, facets[field]]))
  }
  return seed
}

async function main() {
  const args = process.argv.slice(2)
  const expectRef = args[args.indexOf('--expect-ref') + 1]
  const dryRun = args.includes('--dry-run')
  const url = process.env.SUPABASE_URL ?? ''
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  const ref = /^https:\/\/([a-z0-9]+)\.supabase\.co/.exec(url)?.[1] ?? null
  if (!args.includes('--expect-ref') || !expectRef || ref !== expectRef || !key) {
    console.error(JSON.stringify({ refused: true, reason: 'target ref mismatch or missing credentials', target: ref, expected: expectRef ?? null }))
    process.exit(1)
  }
  const seed = buildFacetsSeed(JSON.parse(readFileSync(FACETS_SOURCE, 'utf8')))
  const results = []
  for (const [anchorKey, facets] of Object.entries(seed)) {
    if (dryRun) {
      results.push({ key: anchorKey, words: facets.probe_anchors.split(/\s+/).length, dryRun: true })
      continue
    }
    const res = await fetch(`${url}/rest/v1/style_anchors?key=eq.${encodeURIComponent(anchorKey)}`, {
      method: 'PATCH',
      headers: { apikey: key, authorization: `Bearer ${key}`, 'content-type': 'application/json', prefer: 'return=representation' },
      body: JSON.stringify({ facets }),
    })
    const rows = res.ok ? await res.json() : []
    results.push({ key: anchorKey, status: res.status, updated: rows.length })
  }
  console.log(JSON.stringify({ target: ref, dryRun, results }))
  if (results.some((r) => !r.dryRun && (r.status !== 200 || r.updated !== 1))) process.exit(1)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main()
