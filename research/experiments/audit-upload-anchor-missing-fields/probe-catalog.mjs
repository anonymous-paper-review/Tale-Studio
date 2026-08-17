// audit-upload-anchor-missing-fields — 읽기 전용 조회.
//   카드 카탈로그(style_anchors)에서 부가 필드가 실제로 얼마나 차 있는지 센다.
//   "비었다 = 고장"이 아님을 확인하려면 카드 쪽 결손 분포가 필요하다.
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

const { data, error } = await db
  .from('style_anchors')
  .select('key, label, is_active, medium, style_clause, use_preview_ref, preview_url, anchor_kind')
  .order('key')
if (error) throw error

const rows = (data ?? []).map((r) => ({
  key: r.key,
  is_active: r.is_active,
  medium: r.medium,
  has_style_clause: !!(r.style_clause && String(r.style_clause).trim()),
  use_preview_ref: r.use_preview_ref,
  has_preview_url: !!r.preview_url,
  anchor_kind: r.anchor_kind,
}))

const active = rows.filter((r) => r.is_active !== false)
const summary = {
  total_rows: rows.length,
  active_rows: active.length,
  medium_null: active.filter((r) => !r.medium).length,
  medium_live_action: active.filter((r) => r.medium === 'live_action').length,
  medium_non_live_action: active.filter((r) => r.medium && r.medium !== 'live_action').length,
  style_clause_present: active.filter((r) => r.has_style_clause).length,
  style_clause_absent: active.filter((r) => !r.has_style_clause).length,
  use_preview_ref_true: active.filter((r) => r.use_preview_ref === true).length,
  use_preview_ref_false_or_null: active.filter((r) => r.use_preview_ref !== true).length,
  anchor_kind_sublook: active.filter((r) => r.anchor_kind === 'sublook').length,
  anchor_kind_media_or_null: active.filter((r) => r.anchor_kind !== 'sublook').length,
  mediums: [...new Set(active.map((r) => r.medium).filter(Boolean))].sort(),
}

// 업로드 앵커를 쓰는 프로젝트에서 그 키가 카탈로그에 있는지 (resolveStyleAnchorByKey 가 찾을 수 있는지)
const { data: customProjects, error: cpErr } = await db
  .from('projects')
  .select('id, title, style_anchor_key, custom_style_anchor')
  .not('custom_style_anchor', 'is', null)
if (cpErr) throw cpErr

const catalogKeys = new Set(rows.map((r) => r.key))
const customCheck = (customProjects ?? []).map((p) => ({
  id: p.id,
  title: p.title,
  style_anchor_key: p.style_anchor_key,
  key_exists_in_catalog: catalogKeys.has(p.style_anchor_key),
  custom_medium: p.custom_style_anchor?.medium ?? null,
  custom_label: p.custom_style_anchor?.label ?? null,
}))

const out = { probed_at: new Date().toISOString(), summary, rows, customCheck }
writeFileSync(new URL('./raw-catalog.json', import.meta.url), JSON.stringify(out, null, 2))
console.log(JSON.stringify(out, null, 2))
