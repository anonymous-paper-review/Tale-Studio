// t0-constraint-target-routing-effect — 텍스트 전용 지적이 그림 주문서에서 실제로 빠졌는가.
//   Phase 0(모집단 확인) → 커밋 전/후 대조.
//   오라클은 **분류 필드 대조**(문자열 동일성)다. 1차 시도의 키워드 판별은 폐기 —
//   시각 제약에 흔한 영어 대명사("she presses her ear")를 텍스트 전용으로 오분류했다(전건 오탐 확인).
//   게이트는 제품 함수 parseCheckConstraints 를 직접 import 해 재현한다(복붙 금지).
// 실행: pnpm dlx tsx research/experiments/t0-constraint-target-routing-effect/collect.mts
import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { writeFileSync } from 'node:fs'
import { parseCheckConstraints } from '@/lib/writer/check-notes'

config({ path: '.env.local' })
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
})

// 95c8af8 fix: route check constraints by target — git log: 2026-08-11 15:22:49 +0900
const COMMIT_ISO = '2026-08-11T06:22:49.000Z'

const { data: runs, error } = await db
  .from('writer_runs')
  .select('id,project_id,status,created_at')
  .order('created_at', { ascending: true })
if (error) throw error

const after = (runs ?? []).filter((r) => new Date(r.created_at) >= new Date(COMMIT_ISO))
const before = (runs ?? []).filter((r) => new Date(r.created_at) < new Date(COMMIT_ISO))

type Note = { constraint?: unknown; constraint_target?: unknown; category?: unknown; severity?: unknown }

async function analyze(run: { id: string; project_id: string; created_at: string; status: string }) {
  const { data: shots } = await db
    .from('shots')
    .select('shot_id,check_notes,prompt')
    .eq('project_id', run.project_id)

  const targetDist: Record<string, number> = {}
  let notesTotal = 0
  const gateLeaks: any[] = []   // 게이트를 통과했는데 출신 노트가 visual 이 아닌 것 (있으면 게이트 결함)
  const promptLeaks: any[] = [] // 비-visual 노트 문장이 프롬프트 본문에 그대로 들어간 것

  for (const s of shots ?? []) {
    const notes: Note[] = Array.isArray(s.check_notes) ? s.check_notes : []
    if (!notes.length) continue
    for (const n of notes) {
      notesTotal++
      const t = typeof n.constraint_target === 'string' ? n.constraint_target : '(없음)'
      targetDist[t] = (targetDist[t] ?? 0) + 1
    }
    const visualSet = new Set(
      notes.filter((n) => n.constraint_target === 'visual' && typeof n.constraint === 'string')
        .map((n) => (n.constraint as string).trim()),
    )
    const passed = parseCheckConstraints(notes)
    for (const c of passed) {
      if (!visualSet.has(c)) gateLeaks.push({ shot_id: s.shot_id, constraint: c.slice(0, 200) })
    }
    // 프롬프트 본문 누출 — 비-visual 노트의 제약 문장이 프롬프트에 통째로 등장하는가(부분 문자열 동일성)
    const prompt = typeof s.prompt === 'string' ? s.prompt : ''
    if (prompt) {
      for (const n of notes) {
        if (n.constraint_target === 'visual') continue
        const c = typeof n.constraint === 'string' ? n.constraint.trim() : ''
        if (c.length >= 20 && prompt.includes(c)) {
          promptLeaks.push({ shot_id: s.shot_id, target: n.constraint_target ?? '(없음)', constraint: c.slice(0, 200) })
        }
      }
    }
  }

  return {
    run_id: run.id,
    project_id: run.project_id,
    created_at: run.created_at,
    status: run.status,
    shots_with_notes: (shots ?? []).filter((s) => Array.isArray(s.check_notes) && s.check_notes.length).length,
    notes_total: notesTotal,
    target_distribution: targetDist,
    constraints_passed_gate: (shots ?? []).reduce((a, s) => a + parseCheckConstraints(s.check_notes).length, 0),
    gate_leaks: gateLeaks,
    prompt_leaks: promptLeaks,
  }
}

const afterRows = []
for (const r of after) afterRows.push(await analyze(r as any))
const beforeRows = []
for (const r of before.slice(-5)) beforeRows.push(await analyze(r as any))

const merge = (rows: any[]) => {
  const dist: Record<string, number> = {}
  for (const r of rows) for (const [k, v] of Object.entries(r.target_distribution)) dist[k] = (dist[k] ?? 0) + (v as number)
  return {
    runs: rows.length,
    notes_total: rows.reduce((a, r) => a + r.notes_total, 0),
    target_distribution: dist,
    constraints_passed_gate: rows.reduce((a, r) => a + r.constraints_passed_gate, 0),
    gate_leaks: rows.reduce((a, r) => a + r.gate_leaks.length, 0),
    prompt_leaks: rows.reduce((a, r) => a + r.prompt_leaks.length, 0),
    detail: rows,
  }
}

const out = {
  ticket: 't0-constraint-target-routing-effect',
  date: '2026-08-12',
  commit: '95c8af8 (2026-08-11 15:22:49 +0900 / ' + COMMIT_ISO + ')',
  gate_oracle: 'src/lib/writer/check-notes.ts parseCheckConstraints (제품 함수 직접 import)',
  measure_note: '판정은 분류 필드 동일성 비교만 — 키워드 판별은 오탐으로 폐기(1차 시도 기록은 result.md).',
  phase0_runs_after_commit: after.length,
  population_present: after.length > 0,
  after: merge(afterRows),
  before_control: merge(beforeRows),
}
writeFileSync(new URL('./results.json', import.meta.url), JSON.stringify(out, null, 2))
console.log(`커밋 이후 런 ${after.length}건 (모집단 ${after.length ? '있음' : '없음'})`)
console.log('이후 :', JSON.stringify({ 노트: out.after.notes_total, 분류: out.after.target_distribution, 게이트통과: out.after.constraints_passed_gate, 게이트누출: out.after.gate_leaks, 프롬프트누출: out.after.prompt_leaks }))
console.log('이전 :', JSON.stringify({ 노트: out.before_control.notes_total, 분류: out.before_control.target_distribution, 게이트통과: out.before_control.constraints_passed_gate, 게이트누출: out.before_control.gate_leaks, 프롬프트누출: out.before_control.prompt_leaks }))
