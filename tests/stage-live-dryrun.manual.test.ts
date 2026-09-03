/* eslint-disable @typescript-eslint/no-explicit-any -- 수동 하네스: writer_runs.state 의 비정형 JSON 을 그대로 다룬다 */
// 씬 무대 라이브 드라이런(#stage 2026-09-03) — 실 프로젝트의 writer_runs.state 로 한 씬의 무대를 만들고(LLM),
//   그 무대 위에서 v4 를 다시 돌려(LLM) camera_setup·screen_layout 이 어떻게 나오는지 본다. 기본은 DB 에
//   아무것도 쓰지 않는다(STAGE_LIVE_PERSIST=1 이면 scenes.stage 와 해당 씬 shots.static_spec 을 갱신).
//
// ⚠️ 실 유료 호출(gemini V축 2회/씬). 게이트:
//   RUN_STAGE_LIVE=1 STAGE_PROJECT=<uuid> STAGE_SCENE=sc_01 [STAGE_OUT=/path/out.json] [STAGE_LIVE_PERSIST=1] \
//   pnpm vitest run tests/stage-live-dryrun.manual.test.ts --disable-console-intercept
import { describe, it, expect } from 'vitest'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'

const ENABLED = process.env.RUN_STAGE_LIVE === '1'
const PROJECT = process.env.STAGE_PROJECT ?? ''
const SCENE = process.env.STAGE_SCENE ?? 'sc_01'
const OUT = process.env.STAGE_OUT ?? path.join(process.cwd(), 'logs', 'stage-live', `${SCENE}.json`)
const PERSIST = process.env.STAGE_LIVE_PERSIST === '1'

function loadEnv() {
  const env = readFileSync(path.join(process.cwd(), '.env.local'), 'utf8')
  for (const line of env.split('\n')) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim())
    if (m) process.env[m[1]] = m[2].replace(/^"|"$/g, '')
  }
}

// 최소 로거 — 파일 대신 메모리에 모은다.
function memLogger() {
  const calls: Array<{ label: string; prompt: string; response: string }> = []
  const marks: unknown[] = []
  const texts: Array<{ name: string; text: string }> = []
  return {
    calls,
    marks,
    texts,
    logger: {
      markStage: async (stage: string, status: string, extra?: unknown) => { marks.push({ stage, status, extra }) },
      saveStage: async () => {},
      saveText: async (name: string, text: string) => { texts.push({ name, text }) },
      saveLlmCall: async (label: string, p: { prompt: string; response: string }) => { calls.push({ label, prompt: p.prompt, response: p.response }) },
      flushRawLlm: async () => 0,
    },
  }
}

describe.skipIf(!ENABLED)('stage live dry-run', () => {
  it('builds a stage for one scene and re-runs v4 on it', async () => {
    loadEnv()
    expect(PROJECT).toMatch(/^[0-9a-f-]{36}$/)
    const { supabaseAdmin } = await import('@/lib/supabase/admin')
    const { runSceneStage } = await import('@/lib/writer/pipeline/stages/v3s_stage')
    const { runShotDesign } = await import('@/lib/writer/pipeline/stages/v4_shots')
    const { resolveModels } = await import('@/lib/writer/pipeline')
    const { writerSceneIdToMain, writerShotIdToMain } = await import('@/lib/writer/adapters')

    const { data: runs, error } = await supabaseAdmin
      .from('writer_runs')
      .select('id, status, state')
      .eq('project_id', PROJECT)
      .order('created_at', { ascending: false })
      .limit(3)
    if (error) throw error
    const run = (runs ?? []).find((r) => r.status === 'completed') ?? runs?.[0]
    expect(run).toBeTruthy()
    const state = run!.state as Record<string, any>
    const sceneMain = SCENE
    const scene = state.scenes.scenes.find((s: any) => writerSceneIdToMain(s.scene_id) === sceneMain || s.scene_id === sceneMain)
    expect(scene, `scene ${SCENE} not in state`).toBeTruthy()
    const scenesOne = { ...state.scenes, scenes: [scene] }
    const plan = (state.sceneCinematography ?? []).find((p: any) => p.scene_id === scene.scene_id) ?? null
    const decoupage = state.decoupage
      ? { ...state.decoupage, scenes: state.decoupage.scenes.filter((d: any) => d.scene_id === scene.scene_id) }
      : null
    const models = resolveModels(state.input)
    const { logger, calls, texts } = memLogger()

    const t0 = Date.now()
    const stageRes = await runSceneStage(state.characters, scenesOne, state.worldVisual, plan ? [plan] : null, decoupage, logger as any, models.V, {
      concurrency: 1,
      outputLocale: state.input?.outputLocale,
    })
    const tStage = Date.now() - t0
    expect(stageRes.done).toBe(true)
    const stage = stageRes.stages[0]

    const t1 = Date.now()
    const v4 = await runShotDesign(state.genre, state.characters, scenesOne, state.visualIdentity, state.worldVisual, state.characterVisual, plan ? [plan] : null, decoupage, '', logger as any, models.V, {
      concurrency: 1,
      sceneStages: [stage],
    })
    const tV4 = Date.now() - t1
    expect(v4.done).toBe(true)

    const out = {
      project: PROJECT,
      scene: scene.scene_id,
      timings_ms: { stage: tStage, v4: tV4 },
      stage,
      stage_issues: stageRes.issues,
      shots: v4.shots.map((s) => ({
        shot_id: s.intent.shot_id,
        main_id: writerShotIdToMain(s.intent.shot_id, s.intent.scene_id),
        shot_type: s.static_spec.shot_type,
        camera_setup: s.static_spec.camera_setup,
        screen_layout: s.static_spec.screen_layout,
        character_blocking: s.static_spec.character_blocking,
        first_frame_prompt: s.static_spec.first_frame_prompt,
        camera_motion: s.dynamic_spec.camera_motion,
        character_motion: s.dynamic_spec.character_motion,
      })),
      layout_notes: texts,
      llm_calls: calls.map((c) => ({ label: c.label, prompt_chars: c.prompt.length, response: c.response.slice(0, 4000) })),
    }
    mkdirSync(path.dirname(OUT), { recursive: true })
    writeFileSync(OUT, JSON.stringify(out, null, 1))
    console.log(`[stage-live] wrote ${OUT} — stage ${tStage}ms, v4 ${tV4}ms, shots ${v4.shots.length}`)

    if (PERSIST) {
      const { error: sErr } = await supabaseAdmin
        .from('scenes')
        .update({ stage: stage as any })
        .eq('project_id', PROJECT)
        .eq('scene_id', writerSceneIdToMain(stage.scene_id))
      if (sErr) throw sErr
      // 샷은 static_spec 만 갱신(무대 관련 필드 병합) — 다른 컬럼은 손대지 않는다.
      for (const s of v4.shots) {
        const mainId = writerShotIdToMain(s.intent.shot_id, s.intent.scene_id)
        const { data: row, error: rErr } = await supabaseAdmin.from('shots').select('static_spec').eq('project_id', PROJECT).eq('shot_id', mainId).maybeSingle()
        if (rErr) throw rErr
        if (!row) { console.warn(`[stage-live] shot row not found: ${mainId}`); continue }
        const prev = (row.static_spec ?? {}) as Record<string, unknown>
        const next = {
          ...prev,
          lens_mm: s.static_spec.lens_mm,
          camera_angle: s.static_spec.camera_angle,
          character_blocking: s.static_spec.character_blocking,
          camera_setup: s.static_spec.camera_setup,
          screen_layout: s.static_spec.screen_layout,
        }
        const { error: uErr } = await supabaseAdmin.from('shots').update({ static_spec: next as any }).eq('project_id', PROJECT).eq('shot_id', mainId)
        if (uErr) throw uErr
      }
      console.log('[stage-live] persisted scenes.stage + shots.static_spec (stage fields) for', stage.scene_id)
    }
  }, 600_000)
})
