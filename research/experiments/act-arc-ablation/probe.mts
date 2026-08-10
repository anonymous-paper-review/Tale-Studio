// v1 막별 비주얼 아크 ablation 프로브 — HYPOTHESIS.md 의 측정 절차.
//   재현성 3규칙: 제품 함수 import(복붙 없음), 입력은 클론 풀런 INTEGRATED.json 고정, 좌표 stdout+results.json 기록.
//   A팔 = v1 생성 + E8 배선(v3에 arc 전달) / B팔 = arc null (현행 프로덕션과 동일 프롬프트).
// 실행: pnpm dlx tsx research/experiments/act-arc-ablation/probe.mts
import { config } from 'dotenv'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

config({ path: '.env.local' })

const FIXTURE = path.resolve('logs/064631aa-f6b2-4f7c-800b-66b0517a2769/INTEGRATED.json')
const OUT = path.resolve('research/experiments/act-arc-ablation/results.json')

// ── 지표: 씬별 추출 + 인접 델타 (LLM 없음 — 결정론) ──────────────────────────

/* eslint-disable @typescript-eslint/no-explicit-any */

function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex?.trim?.() ?? '')
  if (!m) return null
  let h = m[1]
  if (h.length === 3) h = h.split('').map((c) => c + c).join('')
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}

// 두 팔레트(hex 목록)의 대칭 최근접 RGB 거리 평균. 비교 불가면 null.
function paletteDistance(a: string[], b: string[]): number | null {
  const ra = (a ?? []).map(hexToRgb).filter(Boolean) as [number, number, number][]
  const rb = (b ?? []).map(hexToRgb).filter(Boolean) as [number, number, number][]
  if (!ra.length || !rb.length) return null
  const d = (p: number[], q: number[]) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2])
  const nn = (xs: number[][], ys: number[][]) =>
    xs.reduce((s, x) => s + Math.min(...ys.map((y) => d(x, y))), 0) / xs.length
  return (nn(ra, rb) + nn(rb, ra)) / 2
}

const ENERGY_IDX: Record<string, number> = { static: 0, breathing: 1, kinetic: 2 }

function meanK(plan: any): number | null {
  const s = Number(String(plan?.lighting_arc?.start_K ?? '').replace(/[^\d.]/g, ''))
  const e = Number(String(plan?.lighting_arc?.end_K ?? '').replace(/[^\d.]/g, ''))
  const vals = [s, e].filter((v) => Number.isFinite(v) && v > 0)
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null
}

interface SceneExtract {
  scene_id: string
  act_ref: string
  K: number | null
  palette: string[]
  energy: string
  intent: string
}

function extract(plans: any[], scenes: any[]): SceneExtract[] {
  const byId = new Map(plans.map((p: any) => [p.scene_id, p]))
  return scenes.map((sc: any) => {
    const p = byId.get(sc.scene_id) ?? {}
    return {
      scene_id: sc.scene_id,
      act_ref: sc.act_ref,
      K: meanK(p),
      palette: Array.isArray(p.palette_emphasis) ? p.palette_emphasis : [],
      energy: String(p.camera_energy ?? ''),
      intent: String(p.visual_intent ?? ''),
    }
  })
}

interface Delta {
  from: string
  to: string
  is_boundary: boolean
  dK: number | null
  dPal: number | null
  dE: number | null
  combined: number | null
}

function computeDeltas(ex: SceneExtract[]): Delta[] {
  const raw = ex.slice(0, -1).map((a, i) => {
    const b = ex[i + 1]
    return {
      from: a.scene_id,
      to: b.scene_id,
      is_boundary: a.act_ref !== b.act_ref,
      dK: a.K != null && b.K != null ? Math.abs(a.K - b.K) : null,
      dPal: paletteDistance(a.palette, b.palette),
      dE:
        a.energy in ENERGY_IDX && b.energy in ENERGY_IDX
          ? Math.abs(ENERGY_IDX[a.energy] - ENERGY_IDX[b.energy])
          : null,
    }
  })
  // 시리즈 평균 정규화 후 합성 (K + 팔레트 — dE 는 보조 지표라 합성 제외)
  const mean = (xs: (number | null)[]) => {
    const v = xs.filter((x): x is number => x != null)
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0
  }
  const mK = mean(raw.map((r) => r.dK))
  const mP = mean(raw.map((r) => r.dPal))
  return raw.map((r) => {
    const parts: number[] = []
    if (r.dK != null && mK > 0) parts.push(r.dK / mK)
    if (r.dPal != null && mP > 0) parts.push(r.dPal / mP)
    return { ...r, combined: parts.length ? parts.reduce((a, b) => a + b, 0) / parts.length : null }
  })
}

function boundaryRatio(deltas: Delta[]): { ratio: number | null; nBoundary: number; nWithin: number } {
  const bd = deltas.filter((d) => d.is_boundary && d.combined != null).map((d) => d.combined!)
  const wd = deltas.filter((d) => !d.is_boundary && d.combined != null).map((d) => d.combined!)
  const m = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)
  const mb = m(bd)
  const mw = m(wd)
  return { ratio: mb != null && mw != null && mw > 0 ? mb / mw : null, nBoundary: bd.length, nWithin: wd.length }
}

// 전환점이 속한 막의 진입 경계 인덱스 (첫 막이면 null)
function turningBoundaryIndex(ns: any, scenes: any[]): number | null {
  const pos = Number(ns?.turning_point_position)
  if (!Number.isFinite(pos) || !Array.isArray(ns?.acts)) return null
  let acc = 0
  let target: string | null = null
  for (const a of ns.acts) {
    acc += Number(a.proportion) || 0
    if (pos <= acc + 1e-9) {
      target = a.act_id
      break
    }
  }
  if (!target || target === ns.acts[0]?.act_id) return null
  const first = scenes.findIndex((sc: any) => sc.act_ref === target)
  return first > 0 ? first - 1 : null // 델타 인덱스 = 경계 직전 씬 위치
}

async function main() {
  const { Agent, setGlobalDispatcher } = await import('undici')
  setGlobalDispatcher(new Agent({ connections: 64 })) // 프로덕션과 동일 전송 조건 (#fetch-pool)

  const fx = JSON.parse(readFileSync(FIXTURE, 'utf8'))
  const { input, genre, characters, narrativeStructure, visualIdentity, scenes } = fx
  if (!input || !genre || !characters || !narrativeStructure || !visualIdentity || !scenes) {
    throw new Error('픽스처 필드 누락')
  }

  // 동적 import — dotenv 이후 (키 가시성)
  const { runActVisualArc } = await import('../../../src/lib/writer/pipeline/stages/v1_act_arc')
  const { runV2Design } = await import('../../../src/lib/writer/pipeline/stages/v2_design')
  const { runSceneCinematography } = await import('../../../src/lib/writer/pipeline/stages/v3_scene_plan')
  const { mergeOpenWorld } = await import('../../../src/lib/writer/pipeline/stages/s3_scenes')
  const { resolveModels } = await import('../../../src/lib/writer/pipeline')
  const { PipelineLogger } = await import('../../../src/lib/writer/logger')

  const world = mergeOpenWorld(input.background, scenes) // 제품 함수로 v2 입력 재조립
  const models = resolveModels(input)
  const acts = narrativeStructure.acts?.map((a: any) => a.act_id) ?? []
  console.log(
    `[좌표] 픽스처=INTEGRATED(064631aa) 씬=${scenes.scenes.length} 막=${acts.length}(${acts.join(',')}) ` +
      `tp=${narrativeStructure.turning_point_position} 모델V=${JSON.stringify(models.V)}`,
  )

  const tpIdx = turningBoundaryIndex(narrativeStructure, scenes.scenes)
  const runs: any[] = []

  for (const [arm, rep] of [['A', 1], ['B', 1], ['A', 2], ['B', 2]] as const) {
    const id = `ablation-arc-${arm}${rep}`
    const logger = new PipelineLogger(id)
    await logger.init()
    const t0 = Date.now()

    let arc: any = null
    if (arm === 'A') arc = await runActVisualArc(narrativeStructure, visualIdentity, logger, models.V)

    const { worldVisual } = await runV2Design(visualIdentity, arc, characters, world, '', logger, models.V)
    const v3 = await runSceneCinematography(
      genre, characters, scenes, visualIdentity, worldVisual, logger, models.V,
      arm === 'A' ? arc : undefined, // E8: A팔만 아크 전달 — B팔은 현행 프로덕션 프롬프트와 동일
    )
    const durationMs = Date.now() - t0

    const ex = extract(v3.scene_plans, scenes.scenes)
    const deltas = computeDeltas(ex)
    const br = boundaryRatio(deltas)
    const sorted = deltas.filter((d) => d.combined != null).map((d) => d.combined!).sort((a, b) => b - a)
    const tpDelta = tpIdx != null ? deltas[tpIdx]?.combined ?? null : null
    const tpRank = tpDelta != null ? sorted.indexOf(tpDelta) + 1 : null

    console.log(
      `[실측] ${id}: ${(durationMs / 1000).toFixed(1)}s 경계대비=${br.ratio?.toFixed(3) ?? 'n/a'} ` +
        `(경계 ${br.nBoundary}/막내 ${br.nWithin}) 전환점 델타 순위=${tpRank ?? 'n/a'}`,
    )
    runs.push({ arm, rep, logger_id: id, duration_ms: durationMs, arc, scenes: ex, deltas, boundary: br, turning_rank: tpRank })
  }

  // ── 판정 (HYPOTHESIS 기각 조건 그대로) ──
  const ratios = (arm: string) => runs.filter((r) => r.arm === arm).map((r) => r.boundary.ratio).filter((x: number | null): x is number => x != null)
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
  const A = ratios('A')
  const B = ratios('B')
  const aMean = A.length ? mean(A) : null
  const bMean = B.length ? mean(B) : null
  const spread = Math.max(A.length === 2 ? Math.abs(A[0] - A[1]) : 0, B.length === 2 ? Math.abs(B[0] - B[1]) : 0)
  let verdict = '판정불가(데이터 결손)'
  if (aMean != null && bMean != null) {
    if (aMean <= bMean) verdict = '기각① — 배선해도 아크 무효 (v1 삭제·v2 흡수 권고)'
    else if (aMean - bMean < spread) verdict = '판정무효② — 팔간 차이 < 팔내 편차 (변별력 부족)'
    else verdict = '채택③ — 아크 유효, E8 정식 배선 권고'
  }
  console.log(`[판정] A평균=${aMean?.toFixed(3)} B평균=${bMean?.toFixed(3)} 팔내최대편차=${spread.toFixed(3)} → ${verdict}`)

  writeFileSync(
    OUT,
    JSON.stringify(
      {
        finished_at: new Date().toISOString(),
        fixture: FIXTURE,
        model_axis_v: models.V,
        acts,
        turning_delta_index: tpIdx,
        runs,
        summary: { a_mean: aMean, b_mean: bMean, max_within_arm_spread: spread, verdict },
      },
      null,
      2,
    ),
  )
  console.log(`[완료] results.json 기록`)
}

main().catch((e) => {
  console.error('[프로브 실패]', e)
  process.exit(1)
})
