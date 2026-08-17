// audit-upload-anchor-order-coverage — 읽기 전용 조회.
//   generation_jobs 전건 + projects.custom_style_anchor 를 뽑아
//   "기준 그림 주소가 참조 배열에 실렸는가"를 종류·시각별로 센다.
//   접속 패턴은 scripts/verify-db.mjs 상단 20줄과 동일.
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

const PROJECT_ID = 'a003a8c6-82a1-4b6a-95d6-889a1f57ee08'

const { data: proj, error: projErr } = await db
  .from('projects')
  .select('id, title, style_anchor_key, custom_style_anchor, created_at, updated_at')
  .eq('id', PROJECT_ID)
  .maybeSingle()
if (projErr) throw projErr

const anchorUrl = proj?.custom_style_anchor?.url ?? null

const { data: jobs, error: jobsErr } = await db
  .from('generation_jobs')
  .select('id, kind, status, created_at, model, provider, input_snapshot, target, actor')
  .eq('project_id', PROJECT_ID)
  .order('created_at', { ascending: true })
if (jobsErr) throw jobsErr

const rows = (jobs ?? []).map((j) => {
  const snap = j.input_snapshot ?? {}
  const refs = Array.isArray(snap.reference_image_urls) ? snap.reference_image_urls : []
  return {
    id: j.id,
    created_at: j.created_at,
    kind: j.kind,
    status: j.status,
    model: j.model,
    actor: j.actor,
    ref_count: refs.length,
    refs,
    has_anchor_url: anchorUrl ? refs.includes(anchorUrl) : false,
    anchor_url_anywhere_in_snapshot: anchorUrl
      ? JSON.stringify(snap).includes(anchorUrl)
      : false,
    style_anchor_key_in_snapshot: snap.style_anchor_key ?? null,
    prompt_head: typeof snap.prompt === 'string' ? snap.prompt.slice(0, 120) : null,
  }
})

// 경계선: 기준 그림 주소를 실은 주문 중 가장 이른 시각
const carrying = rows.filter((r) => r.has_anchor_url)
const boundary = carrying.length > 0 ? carrying[0].created_at : null

const byKind = {}
for (const r of rows) {
  byKind[r.kind] ??= { total: 0, with_anchor: 0, without_anchor: 0, after_boundary: 0, after_boundary_without: 0 }
  const b = byKind[r.kind]
  b.total++
  if (r.has_anchor_url) b.with_anchor++
  else b.without_anchor++
  if (boundary && r.created_at >= boundary) {
    b.after_boundary++
    if (!r.has_anchor_url) b.after_boundary_without++
  }
}

// 전체 프로젝트 중 custom_style_anchor 를 가진 것이 몇 개인지 (표본 유일성 재확인)
const { data: customProjects, error: cpErr } = await db
  .from('projects')
  .select('id, title, style_anchor_key, custom_style_anchor')
  .not('custom_style_anchor', 'is', null)
if (cpErr) throw cpErr

const out = {
  probed_at: new Date().toISOString(),
  project: proj,
  anchor_url: anchorUrl,
  total_jobs: rows.length,
  jobs_with_anchor_url: carrying.length,
  jobs_without_anchor_url: rows.length - carrying.length,
  boundary_created_at: boundary,
  by_kind: byKind,
  projects_with_custom_anchor: (customProjects ?? []).map((p) => ({
    id: p.id,
    title: p.title,
    style_anchor_key: p.style_anchor_key,
    url: p.custom_style_anchor?.url ?? null,
    label: p.custom_style_anchor?.label ?? null,
    medium: p.custom_style_anchor?.medium ?? null,
  })),
  rows,
}

writeFileSync(new URL('./raw.json', import.meta.url), JSON.stringify(out, null, 2))
console.log(JSON.stringify({ ...out, rows: rows.map((r) => ({ ...r, refs: r.refs.map((u) => u.slice(-40)), prompt_head: undefined })) }, null, 2))
