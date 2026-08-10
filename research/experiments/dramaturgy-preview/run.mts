// 드라마투르그(s0.5) 스테이지 스모크 프리뷰 — 가설 실험 아님(판정 없음), 신규 스테이지가
//   실제 입력에서 어떤 재료를 만드는지 배선 전에 확인하는 미리보기.
//   재현성 규칙 준수: 제품 runDramaturgy import(복붙 없음), 입력은 클론 풀런 INTEGRATED.json 고정.
// 실행: pnpm dlx tsx research/experiments/dramaturgy-preview/run.mts
import { config } from 'dotenv'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

config({ path: '.env.local' })

const FIXTURE = path.resolve('logs/064631aa-f6b2-4f7c-800b-66b0517a2769/INTEGRATED.json')
const OUT = path.resolve('research/experiments/dramaturgy-preview/preview-output.json')

async function main() {
  const { Agent, setGlobalDispatcher } = await import('undici')
  setGlobalDispatcher(new Agent({ connections: 64 }))

  const fx = JSON.parse(readFileSync(FIXTURE, 'utf8'))
  const { input, genre, characters } = fx
  if (!input?.story || !genre || !characters) throw new Error('픽스처 필드 누락')

  const { runDramaturgy } = await import('../../../src/lib/writer/pipeline/stages/s0_dramaturgy')
  const { resolveModels } = await import('../../../src/lib/writer/pipeline')
  const { PipelineLogger } = await import('../../../src/lib/writer/logger')

  const models = resolveModels(input)
  console.log(
    `[좌표] 픽스처=INTEGRATED(064631aa) runtime=${input.runtimeSeconds}s ` +
      `기존 로케이션=${input.background?.locations?.length ?? 0} 모델S=${JSON.stringify(models.S)}`,
  )
  const logger = new PipelineLogger('dramaturgy-preview')
  await logger.init()

  const t0 = Date.now()
  const d = await runDramaturgy(input, genre, characters, logger, models.S)
  console.log(`[실측] ${(Date.now() - t0) / 1000}s`)

  console.log(`\n== 핵심 엔진 ==\n${d.core_engine}`)
  console.log(`\n== 메커니즘 노트 (${d.mechanism_notes.length}) ==`)
  d.mechanism_notes.forEach((n, i) => console.log(`${i + 1}. ${n}`))
  console.log(`\n== 무대 후보 (${d.world_inventory.length}) ==`)
  for (const s of d.world_inventory) {
    console.log(`- ${s.id} (${s.name}): ${s.description}`)
    console.log(`    유도: ${s.derived_from}`)
    s.scene_potential.forEach((p) => console.log(`    씬 가능성: ${p}`))
  }
  console.log(`\n== 극적 진단 ==`)
  console.log(`stakes: ${d.dramatic_diagnosis.stakes}`)
  d.dramatic_diagnosis.weak_beats.forEach((w) => console.log(`약한 비트: ${w}`))
  d.dramatic_diagnosis.cdq_candidates.forEach((q) => console.log(`CDQ 후보: ${q}`))
  console.log(`ending_check: ${d.dramatic_diagnosis.ending_check}`)

  writeFileSync(OUT, JSON.stringify({ finished_at: new Date().toISOString(), fixture: FIXTURE, model_axis_s: models.S, dramaturgy: d }, null, 2))
  console.log(`\n[완료] preview-output.json 기록`)
}

main().catch((e) => {
  console.error('[프리뷰 실패]', e)
  process.exit(1)
})
