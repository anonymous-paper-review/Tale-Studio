// 증거 표본 — 분할이 실제로 일어난 런에서 "리넘버된 샷 ↔ 붙은 대사"를 몇 줄만 뽑는다.
//   (원문 인용은 짧게: 라인 앞 24자.)
import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { writeFileSync } from 'node:fs'
import { buildShotDialogueMap } from '@/lib/writer/pipeline/util/dialogue_join'

config({ path: '.env.local' })
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
})
const { data: runs } = await db
  .from('writer_runs')
  .select('id,project_id,created_at,state')
  .gte('created_at', '2026-08-10T09:29:51.000Z')
  .order('created_at')

const samples: any[] = []
for (const run of runs ?? []) {
  const shots: any[] = (run.state as any)?.shotSequence?.shots ?? []
  if (!shots.length) continue
  const joined = buildShotDialogueMap(shots as any, (run.state as any)?.dialogue)
  const renum = shots.filter((s) => s.source_shot_id && s.source_shot_id !== s.shot_id)
  const withLines = renum.filter((s) => (joined.get(s.shot_id) as any)?.dialogue?.length)
  for (const s of [...withLines, ...renum].slice(0, 3)) {
    const d: any = joined.get(s.shot_id)
    samples.push({
      run: run.id.slice(0, 8),
      final_shot_id: s.shot_id,
      source_shot_id: s.source_shot_id,
      dialogue_shot_id: d?.shot_id ?? null,
      match: (d?.shot_id ?? s.source_shot_id) === s.source_shot_id,
      line_head: d?.dialogue?.[0]?.line ? String(d.dialogue[0].line).slice(0, 24) + '…' : null,
      speaker: d?.dialogue?.[0]?.character_id ?? null,
    })
  }
  // 형제(같은 부모에서 갈라진 자식) 표본 — 첫 자식만 상속하는가
  const bySrc = new Map<string, any[]>()
  for (const s of shots) bySrc.set(s.source_shot_id ?? s.shot_id, [...(bySrc.get(s.source_shot_id ?? s.shot_id) ?? []), s])
  for (const [src, group] of [...bySrc].filter(([, g]) => g.length > 1).slice(0, 2)) {
    samples.push({
      run: run.id.slice(0, 8),
      sibling_parent: src,
      children: group.map((g) => ({ shot_id: g.shot_id, got_dialogue: joined.has(g.shot_id) })),
    })
  }
}
writeFileSync(new URL('./evidence.json', import.meta.url), JSON.stringify(samples, null, 2))
console.log(JSON.stringify(samples, null, 1))
