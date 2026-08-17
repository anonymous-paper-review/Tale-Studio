// 같은 로케이션의 "기준 그림 실림" 주문과 "안 실림" 주문의 프롬프트 본문이 같은 조립기에서
// 나왔는지 프로그램으로 대조한다(본문 전체를 화면에 쏟지 않는다).
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
  .from('generation_jobs')
  .select('id, kind, created_at, actor, input_snapshot, target')
  .eq('project_id', 'a003a8c6-82a1-4b6a-95d6-889a1f57ee08')
  .order('created_at', { ascending: true })
if (error) throw error

// applyStyleAnchor 가 얹는 머리말(style-anchor.ts STYLE_ANCHOR_CLAUSE) 을 벗겨 본문만 남긴다.
const HEAD = 'STYLE REFERENCE — the FIRST reference image sets the visual style ONLY:'
function body(p) {
  if (typeof p !== 'string') return null
  if (!p.startsWith(HEAD)) return p
  const nl = p.indexOf('\n')
  return nl >= 0 ? p.slice(nl + 1) : p
}

const groups = {}
for (const j of data) {
  const key = `${j.kind}::${j.target?.locationId ?? j.target?.characterId ?? '-'}`
  groups[key] ??= []
  groups[key].push({
    id: j.id,
    created_at: j.created_at,
    actor: j.actor,
    anchored: !!j.input_snapshot?.style_anchor_key,
    body: body(j.input_snapshot?.prompt),
    bodyLen: (body(j.input_snapshot?.prompt) ?? '').length,
  })
}

const report = {}
for (const [key, arr] of Object.entries(groups)) {
  const anchored = arr.filter((r) => r.anchored)
  const plain = arr.filter((r) => !r.anchored)
  report[key] = {
    count: arr.length,
    anchored: anchored.length,
    plain: plain.length,
    // 본문(머리말 제거)이 서로 같은가 — 같으면 같은 조립기 = 같은 통로
    body_identical_across_anchored_and_plain:
      anchored.length && plain.length
        ? anchored.some((a) => plain.some((p) => p.body === a.body))
        : null,
    body_prefix_shared:
      anchored.length && plain.length
        ? (() => {
            const a = anchored[0].body ?? ''
            const p = plain[0].body ?? ''
            let i = 0
            while (i < a.length && i < p.length && a[i] === p[i]) i++
            return i
          })()
        : null,
    rows: arr.map((r) => ({ created_at: r.created_at, actor: r.actor, anchored: r.anchored, bodyLen: r.bodyLen })),
  }
}
writeFileSync(new URL('./raw-prompt-diff.json', import.meta.url), JSON.stringify(report, null, 2))
console.log(JSON.stringify(report, null, 2))
