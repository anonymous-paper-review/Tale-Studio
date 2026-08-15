// 4차 — "생성 프롬프트가 빈다"는 게 실제로 뭐가 비는 것인지 실물 대조 (읽기 전용).
//   shots.prompt 는 persist_manifest.ts:594 주석상 "스토리보드·영상 생성이 쓰는" rich 묘사문이고,
//   비면 use-writer-director-sync.ts:26 이 action_description(추상 연출의도)으로 폴백한다.
//   공란 100% 작업과 0% 작업에서 같은 자리 값을 나란히 떠서 무엇이 사라지는지 보인다.
// 범위: SELECT 만.
// 실행: pnpm dlx tsx research/experiments/t0-motion-contract-delivery/probe4.mts
import { config } from 'dotenv'
import { writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

config({ path: '.env.local' })
const { supabaseAdmin } = await import('@/lib/supabase/admin')

const DIR = dirname(fileURLToPath(import.meta.url))

const { data: projects } = await supabaseAdmin
  .from('projects')
  .select('id, title, updated_at')
  .order('updated_at', { ascending: false })
  .limit(12)

const samples: Array<Record<string, unknown>> = []

for (const p of projects ?? []) {
  const { data: shots } = await supabaseAdmin
    .from('shots')
    .select('shot_id, prompt, action_description, static_spec, created_at')
    .eq('project_id', p.id)
    .order('sort_order', { ascending: true })
    .limit(3)

  for (const s of (shots ?? []) as Array<Record<string, unknown>>) {
    const promptStr = typeof s.prompt === 'string' ? s.prompt : ''
    const ss = s.static_spec as { first_frame_prompt?: string } | null
    samples.push({
      작업: p.title,
      갱신: String(p.updated_at ?? '').slice(0, 10),
      컷: s.shot_id,
      'shots.prompt(생성 프롬프트)': promptStr.trim() ? promptStr : '(빈 문자열)',
      '폴백으로 대신 쓰이는 값(action_description)': s.action_description,
      'static_spec.first_frame_prompt(같은 자리 원재료)': ss?.first_frame_prompt ?? '(없음)',
    })
  }
}

writeFileSync(join(DIR, 'result4.json'), JSON.stringify(samples, null, 2))

for (const s of samples) {
  console.log('\n───────────────────────────────────────')
  console.log(`[${s['작업']}] ${s['컷']}  (갱신 ${s['갱신']})`)
  console.log(' 생성 프롬프트 :', String(s['shots.prompt(생성 프롬프트)']).slice(0, 260))
  console.log(' 폴백 대체값   :', String(s['폴백으로 대신 쓰이는 값(action_description)'] ?? '').slice(0, 260))
  console.log(' 같은 자리 원재료:', String(s['static_spec.first_frame_prompt(같은 자리 원재료)']).slice(0, 260))
}
