import { describe, it, expect } from 'vitest'
import { readFileSync, writeFileSync } from 'node:fs'
import { runDecoupage } from '@/lib/writer/pipeline/stages/decoupage'
import { runShotDesign } from '@/lib/writer/pipeline/stages/v4_shots'
import { resolveModels } from '@/lib/writer/pipeline'
import { PipelineLogger } from '@/lib/writer/logger'

// #duration-surgery / #w-a 회귀 하네스 (2026-08-31, U17-1 오너 지시) — env 게이트.
//   실행: REGRESSION_STATE=<state.json> RUN_DURATION_REGRESSION=1 pnpm vitest run tests/duration-regression.harness.test.ts
//   실제 LLM 을 호출한다(과금) — CI 에서는 항상 skip. 완주 writer_runs.state 를 입력으로
//   개정된 decoupage/v4 프롬프트를 다시 돌려, 옛 산출(state 내 decoupage/shotDesign)과
//   duration 분포·산수 준수·character_blocking 커버리지를 대조한다. 판정은 사람이 한다.

const GATED = process.env.RUN_DURATION_REGRESSION === '1'

describe('duration/characters 프롬프트 개정 회귀 (env 게이트)', () => {
  it.runIf(GATED)(
    '개정 프롬프트로 2씬 재생성 → 구산출과 대조 리포트',
    async () => {
      const statePath = process.env.REGRESSION_STATE
      expect(statePath, 'REGRESSION_STATE 경로 필요').toBeTruthy()
      const state = JSON.parse(readFileSync(statePath!, 'utf8'))

      const sceneIds: string[] = state.scenes.scenes.slice(0, 2).map((s: { scene_id: string }) => s.scene_id)
      const scenesSub = { ...state.scenes, scenes: state.scenes.scenes.slice(0, 2) }
      type Cine = Parameters<typeof runDecoupage>[4]
      const cineSub = (state.sceneCinematography as NonNullable<Cine>).filter((c) =>
        sceneIds.includes(c.scene_id),
      )
      const logger = new PipelineLogger('regression-u17-1')
      const models = resolveModels(state.input)

      // ── 1) decoupage (개정 루브릭) ──
      const dec = await runDecoupage(
        state.genre, state.characters, scenesSub, state.worldVisual, cineSub, logger, models.V,
      )
      expect(dec.done).toBe(true)
      const decShots = dec.scenes.flatMap((s) => s.shots)

      // ── 2) v4 (개정 루브릭 + blocking 전원 지시) ──
      const design = await runShotDesign(
        state.genre, state.characters, scenesSub, state.visualIdentity, state.worldVisual,
        state.characterVisual, cineSub, dec.plan ?? { ...state.decoupage, scenes: dec.scenes },
        '', logger, models.V,
      )
      expect(design.done).toBe(true)

      // ── 측정 ──
      const oldDec = (state.decoupage.scenes as Array<{ scene_id: string; shots: Array<{ intended_duration_seconds: number }> }>)
        .filter((s) => sceneIds.includes(s.scene_id)).flatMap((s) => s.shots)
      const oldDesign = (state.shotDesign as Array<{ intent: { scene_id: string; duration_seconds: number; duration_justification?: string }; static_spec: { character_blocking?: Array<{ character_id: string }> } }>)
        .filter((d) => sceneIds.includes(d.intent.scene_id))

      const stat = (xs: number[]) => ({
        n: xs.length,
        mean: Math.round((xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length)) * 100) / 100,
        dist: xs.reduce<Record<number, number>>((m, x) => ({ ...m, [x]: (m[x] ?? 0) + 1 }), {}),
      })
      const newDesignShots = design.shots
      const arithRe = /=\s*[\d.]+\s*(→|->)\s*\d+/
      const report = {
        scenes: sceneIds,
        decoupage_durations: { old: stat(oldDec.map((s) => s.intended_duration_seconds)), new: stat(decShots.map((s) => s.intended_duration_seconds)) },
        v4_durations: { old: stat(oldDesign.map((d) => d.intent.duration_seconds)), new: stat(newDesignShots.map((d) => d.intent.duration_seconds)) },
        justification_arithmetic: {
          old: oldDesign.filter((d) => arithRe.test(d.intent.duration_justification ?? '')).length + '/' + oldDesign.length,
          new: newDesignShots.filter((d) => arithRe.test(d.intent.duration_justification ?? '')).length + '/' + newDesignShots.length,
          long_take: newDesignShots.filter((d) => /^\s*LONG TAKE/i.test(d.intent.duration_justification ?? '')).length,
          samples: newDesignShots.slice(0, 4).map((d) => `${d.intent.duration_seconds}s ← ${d.intent.duration_justification}`),
        },
        blocking_coverage: {
          old_avg: Math.round((oldDesign.reduce((a, d) => a + (d.static_spec.character_blocking?.length ?? 0), 0) / Math.max(1, oldDesign.length)) * 100) / 100,
          new_avg: Math.round((newDesignShots.reduce((a, d) => a + (d.static_spec.character_blocking?.length ?? 0), 0) / Math.max(1, newDesignShots.length)) * 100) / 100,
          new_per_shot: newDesignShots.map((d) => ({
            id: d.intent.shot_id,
            blocking: (d.static_spec.character_blocking ?? []).map((b: { character_id: string }) => b.character_id),
          })),
        },
      }
      const out = process.env.REGRESSION_OUT ?? '/tmp/duration-regression-report.json'
      writeFileSync(out, JSON.stringify(report, null, 2))
      console.log('[regression] report →', out)
      console.log(JSON.stringify(report, null, 2))
    },
    900_000,
  )

  it('게이트 꺼짐 — CI 무부하', () => {
    expect(true).toBe(true)
  })
})
