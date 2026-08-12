// t0-dialogue-join-canary — 대사 조인 픽스(789a71f) 이후 실사용 런에서 대사 오배치가 0인가.
//   판정은 전부 문자열 동일성(코드) — LLM 판정 없음.
//   조인 정본은 제품 함수 buildShotDialogueMap 을 직접 import (복붙 금지 규칙).
// 실행: pnpm dlx tsx research/experiments/t0-dialogue-join-canary/collect.mts
import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { writeFileSync } from 'node:fs'
import { buildShotDialogueMap } from '@/lib/writer/pipeline/util/dialogue_join'
import { writerShotIdToMain } from '@/lib/writer/adapters'

config({ path: '.env.local' })
const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY!,
  { auth: { persistSession: false } },
)

// 789a71f — git log -1 --format=%ai 789a71f → 2026-08-10 18:29:51 +0900
const FIX_ISO = '2026-08-10T09:29:51.000Z'

type AnyShot = { shot_id: string; source_shot_id?: string; S?: { scene_id?: string } }

const { data: runs, error } = await db
  .from('writer_runs')
  .select('id,project_id,created_at,updated_at,status,state')
  .gte('created_at', FIX_ISO)
  .order('created_at', { ascending: true })
if (error) throw error

const runReports: any[] = []
let mismatchTotal = 0
let splitRunCount = 0

for (const run of runs ?? []) {
  const state: any = run.state ?? {}
  const seq = state.shotSequence ?? state.shot_sequence ?? null
  const shots: AnyShot[] = seq?.shots ?? []
  const dialogue = state.dialogue ?? null
  const dialogueShotIds = new Set<string>()
  for (const sc of dialogue?.scenes ?? []) for (const sh of sc.shots ?? []) dialogueShotIds.add(sh.shot_id)

  // 분할 판정: 최종 id 와 리넘버 전 id 가 다르거나, 한 부모에서 형제가 갈라진 샷.
  const bySource = new Map<string, string[]>()
  for (const s of shots) {
    const src = s.source_shot_id ?? s.shot_id
    bySource.set(src, [...(bySource.get(src) ?? []), s.shot_id])
  }
  const renumbered = shots.filter((s) => s.source_shot_id && s.source_shot_id !== s.shot_id).length
  const siblings = [...bySource.values()].filter((v) => v.length > 1).length
  const hasSplit = renumbered > 0 || siblings > 0

  // 조인 검증 — 제품 함수가 만든 맵의 각 항목에서 "붙은 대사의 출신 id" == "그 샷의 리넘버 전 id" 인가.
  const joined = buildShotDialogueMap(shots as any, dialogue)
  const mismatches: any[] = []
  let joinedLines = 0
  for (const [finalShotId, dlg] of joined) {
    const shot = shots.find((s) => s.shot_id === finalShotId)!
    const expect = shot.source_shot_id ?? shot.shot_id
    joinedLines += (dlg as any).dialogue?.length ?? 0
    if ((dlg as any).shot_id !== expect) {
      mismatches.push({ run_id: run.id, final_shot_id: finalShotId, source_shot_id: expect, dialogue_from: (dlg as any).shot_id })
    }
  }

  // 교차: 실제 DB 에 저장된 shots.dialogue_lines 가 위 조인과 같은가(persist 시점 드리프트 검출).
  //   shots 행은 project 단위로 delete→재삽입이라 **프로젝트의 마지막 런**만 대조 대상이다
  //   (같은 프로젝트의 이전 런과 대조하면 필연적으로 전건 불일치 — 계기 결함).
  //   persist 형상: dialogue_lines[].text = ShotDialogueLine.line, 끝에 narration 이 V.O. 라인으로 추가.
  const isLatestOfProject = !(runs ?? []).some(
    (o) => o.project_id === run.project_id && new Date(o.created_at) > new Date(run.created_at),
  )
  let dbShots: any[] | null = null
  const persistMismatches: any[] = []
  let persistedLineShots = 0
  if (isLatestOfProject && shots.length > 0) {
    const res = await db.from('shots').select('shot_id,dialogue_lines,updated_at').eq('project_id', run.project_id)
    dbShots = res.data
    // DB 는 main 포맷(sh_XX_NN)으로 정규화해 저장한다 — 제품 변환기를 그대로 써서 state id 를 옮긴다.
    //   (state 는 shot_N 공간. 이 변환 없이 대조하면 전건 불일치가 나오는 계기 결함.)
    const joinedMain = new Map<string, any>()
    let lastScene = ''
    for (const s of shots as any[]) {
      const sceneId = s.S?.scene_id ?? lastScene
      lastScene = sceneId
      const mainId = writerShotIdToMain(s.shot_id, sceneId)
      if (joined.has(s.shot_id)) joinedMain.set(mainId, joined.get(s.shot_id))
    }
    for (const row of dbShots ?? []) {
      const lines = (row as any).dialogue_lines
      if (!Array.isArray(lines) || lines.length === 0) continue
      persistedLineShots++
      const expected: any = joinedMain.get((row as any).shot_id)
      const expectedTexts = [
        ...((expected?.dialogue ?? []).map((l: any) => l.line)),
        ...(expected?.narration ? [expected.narration] : []),
      ]
      const actualTexts = lines.map((l: any) => l.text)
      const same =
        expectedTexts.length === actualTexts.length && expectedTexts.every((t: string, i: number) => t === actualTexts[i])
      if (!same) {
        persistMismatches.push({
          run_id: run.id,
          shot_id: (row as any).shot_id,
          expected_from: expected?.shot_id ?? null,
          expected_n: expectedTexts.length,
          actual_n: actualTexts.length,
        })
      }
    }
  }

  if (hasSplit) splitRunCount++
  mismatchTotal += mismatches.length

  runReports.push({
    run_id: run.id,
    project_id: run.project_id,
    created_at: run.created_at,
    status: (run as any).status,
    state_keys: Object.keys(state),
    shots: shots.length,
    has_source_shot_id_field: shots.some((s) => s.source_shot_id !== undefined),
    dialogue_scenes: dialogue?.scenes?.length ?? 0,
    dialogue_shot_ids: dialogueShotIds.size,
    renumbered_shots: renumbered,
    sibling_groups: siblings,
    has_split: hasSplit,
    joined_shots: joined.size,
    joined_lines: joinedLines,
    mismatch_lines: mismatches.length,
    mismatches,
    db_shots_rows: dbShots?.length ?? 0,
    persist_crosscheck_applicable: isLatestOfProject && shots.length > 0,
    db_shots_with_lines: persistedLineShots,
    persist_mismatches: persistMismatches.length,
    persist_mismatch_detail: persistMismatches,
  })
}

const out = {
  ticket: 't0-dialogue-join-canary',
  date: '2026-08-12',
  fix_commit: '789a71f (2026-08-10 18:29:51 +0900 / ' + FIX_ISO + ')',
  join_oracle: 'src/lib/writer/pipeline/util/dialogue_join.ts buildShotDialogueMap (제품 함수 직접 import)',
  runs_after_fix: runs?.length ?? 0,
  runs_with_split: splitRunCount,
  mismatch_lines_total: mismatchTotal,
  persist_mismatch_total: runReports.reduce((a, r) => a + r.persist_mismatches, 0),
  runs: runReports,
}
writeFileSync(new URL('./results.json', import.meta.url), JSON.stringify(out, null, 2))
console.log(
  `runs_after_fix=${out.runs_after_fix} runs_with_split=${out.runs_with_split} ` +
    `mismatch_lines=${out.mismatch_lines_total} persist_mismatch=${out.persist_mismatch_total}`,
)
for (const r of runReports) {
  console.log(
    `  ${r.created_at} ${String(r.run_id).slice(0, 8)} shots=${r.shots} src_field=${r.has_source_shot_id_field} ` +
      `renum=${r.renumbered_shots} sib=${r.sibling_groups} joined=${r.joined_shots}/${r.joined_lines}L ` +
      `mis=${r.mismatch_lines} dbrows=${r.db_shots_rows}(lines ${r.db_shots_with_lines}) pmis=${r.persist_mismatches}`,
  )
}
