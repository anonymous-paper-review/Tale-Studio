// t1-dramaturgy-procedural-probe — 유도 폭 × 전제 유형 (법정물 3회 + 재난물 브리지 1회).
//   재현성 규칙: 제품 runDramaturgy 직접 import(복붙 없음). 법정물 story는 오너 원문 사슬 그대로(각색 금지).
//   장르 프레임(tone/depth_level/targetEmotion)은 재난물 픽스처 상수를 유지 — 전제 유형만 변주해
//   "유도 폭 = 전제 유형의 함수" 가설을 격리한다. subGenre·runtime만 전제에 종속(브리프의 "20분이 넘는다").
//   브리지: 같은 재난물 픽스처 1회 재실행 — 기본 모델 전환(f6d8e58: gemini-3-flash-preview→3.6-flash) 앵커.
//   실행: pnpm dlx tsx research/experiments/t1-dramaturgy-procedural-probe/run.mts
import { config } from 'dotenv'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

config({ path: '.env.local' })

const FIXTURE = path.resolve('logs/064631aa-f6b2-4f7c-800b-66b0517a2769/INTEGRATED.json')
const OUT = path.resolve('research/experiments/t1-dramaturgy-procedural-probe/results.json')

// 오너 원문 사슬 (dramaturgy vault §0.5 — 각색 금지)
const LEGAL_STORY =
  '법정 공방이다 → 근데 20분이 넘는다 → 방산기업의 비리 얘기다 → 방산기업이 저지를 수 있는 비리가 뭐가 있지 → 거기서 필요한 무대가 뭐지'

async function main() {
  const { Agent, setGlobalDispatcher } = await import('undici')
  setGlobalDispatcher(new Agent({ connections: 64 }))

  const fx = JSON.parse(readFileSync(FIXTURE, 'utf8'))
  const { runDramaturgy } = await import('../../../src/lib/writer/pipeline/stages/s0_dramaturgy')
  const { resolveModels } = await import('../../../src/lib/writer/pipeline')
  const { PipelineLogger } = await import('../../../src/lib/writer/logger')

  // 법정물 입력 — 프레임 상수는 픽스처 승계, 전제 종속 필드만 교체
  const legalGenre = {
    ...fx.genre,
    subGenre: 'courtroom / defense-industry corruption',
    runtime_seconds: 1260,
  }
  const legalInput = { story: LEGAL_STORY, runtimeSeconds: 1260 }
  const legalCharacters = { characters: [] }

  const models = resolveModels(legalInput as never)
  // --model= 오버라이드: 계기 진단용 모델 핀 (예: gemini-3-flash-preview — 선례 preview 좌표).
  const modelOverride = process.argv.find((a) => a.startsWith('--model='))?.slice(8)
  if (modelOverride) models.S = { ...models.S, model: modelOverride } as typeof models.S
  console.log(`[좌표] 모델S=${JSON.stringify(models.S)} 법정 runtime=1260s 브리지 픽스처=INTEGRATED(064631aa)`)

  const runs: Record<string, unknown>[] = []
  const doRun = async (tag: string, input: never, genre: never, characters: never) => {
    const logger = new PipelineLogger(`t1-dramaturgy-probe-${tag}`)
    await logger.init()
    const t0 = Date.now()
    // 얇은 재시도 — 같은 제품 호출 반복(빈 응답 등 일시 오류 흡수; 제품 파이프라인의 withLlmRetry 역할).
    let d: Awaited<ReturnType<typeof runDramaturgy>> | null = null
    let lastErr: unknown
    for (let attempt = 1; attempt <= 3 && !d; attempt++) {
      try {
        d = await runDramaturgy(input, genre, characters, logger, models.S)
      } catch (e) {
        lastErr = e
        console.warn(`[${tag}] 시도 ${attempt} 실패: ${(e as Error).message} — ${attempt < 3 ? '재시도' : '포기'}`)
        if (attempt < 3) await new Promise((r) => setTimeout(r, 3000 * attempt))
      }
    }
    if (!d) throw lastErr
    const wall = (Date.now() - t0) / 1000
    const summary = {
      tag,
      wall_s: +wall.toFixed(1),
      n_candidates: d.world_inventory.length,
      candidates: d.world_inventory.map((s: { id: string; name: string; description: string; derived_from: string; scene_potential: string[] }) => ({
        id: s.id, name: s.name, description: s.description, derived_from: s.derived_from, scene_potential: s.scene_potential,
      })),
      core_engine: d.core_engine,
      mechanism_notes: d.mechanism_notes,
    }
    runs.push(summary)
    console.log(`[${tag}] ${wall.toFixed(1)}s — 후보 ${summary.n_candidates}: ${summary.candidates.map((c: { id: string }) => c.id).join(', ')}`)
    return summary
  }

  const only = process.argv.find((a) => a.startsWith('--only='))?.slice(7)
  if (!only || 'legal'.startsWith(only) || only === 'legal') {
    for (let i = 1; i <= 3; i++) {
      await doRun(`legal-r${i}`, legalInput as never, legalGenre as never, legalCharacters as never)
    }
  }
  if (!only || only === 'bridge') {
    await doRun('disaster-bridge-r1', fx.input as never, fx.genre as never, fx.characters as never)
  }

  const legalCounts = runs.filter((r) => String(r.tag).startsWith('legal')).map((r) => r.n_candidates as number).sort((a, b) => a - b)
  const median = legalCounts[1]
  const out = {
    finished_at: new Date().toISOString(),
    coordinates: {
      model_axis_s: models.S,
      legal_input: { story: LEGAL_STORY, runtimeSeconds: 1260, genre: legalGenre, characters: 0 },
      bridge_fixture: FIXTURE,
      frame_constants_note: 'tone/depth_level/targetEmotion은 재난물 픽스처 승계 — 전제 유형만 변주',
    },
    legal_candidate_counts: legalCounts,
    legal_median: median,
    verdict_pre_registered: median > 3 ? '참 — 유도 폭 > 재난물(3)' : '기각 — 중앙값 ≤3 (전제 무관 수렴으로 재프레임)',
    runs,
  }
  writeFileSync(OUT, JSON.stringify(out, null, 2))
  console.log(`\n[완료] 법정 후보 수 ${legalCounts.join('/')} 중앙값=${median} → ${out.verdict_pre_registered}`)
}

main().catch((e) => {
  console.error('[프로브 실패]', e)
  process.exit(1)
})
