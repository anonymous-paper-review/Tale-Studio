#!/usr/bin/env node
// E9d-proto 샷플랜 빌더 (재현용, 결정론).
//   입력: logs/writer-stage-exp/laundromat__sceneShotCoGenGrammar__<RUN>.json (cluster/carry = shot_meta)
//         logs/writer-stage-exp/laundromat__shotDesign__<RUN>.json (first_frame/motion prompt, character_blocking)
//   두 로그를 shot_id(shot_1..N)로 조인 → shotplan.json + prompts.json 생성.
//   결정론 후처리 3가지:
//     (Task D) 불변 앵커 블록을 모든 first_frame_prompt 앞에 접두 — 인물 등장 샷은 공간+인물 앵커,
//              인서트/공간 샷은 공간 앵커만(인물 환각 방지).
//     (Task C) carry_from 있는 샷의 motion_prompt에 match-on-action 연속 큐를 결정론으로 덧붙임(변경 기록).
//     (Task F) render_seconds 산출 — 도입 플래시 컷(cluster 1 establish)은 0.8~1.5초로 스프레드,
//              나머지는 shotDesign 설계 길이. video 요청 길이는 happy-horse min 3s로 올려 생성 후 트리밍.
import fs from 'node:fs'
import path from 'node:path'

const RUN = process.env.E9DP_RUN ?? 'e9dp1'
const ROOT = process.cwd()
const LOG_DIR = path.join(ROOT, 'logs', 'writer-stage-exp')
const OUT_DIR = path.join(ROOT, 'research', 'experiments', 'continuity-copy', '2026-07-23_laundromat-proto', 'assets')

// ── 불변 앵커 블록 (오케스트레이터 확정 — 영어) ──
const ANCHOR_SPACE = 'Retro late-night coin laundromat interior: rows of mint-green washing machines with round glass doors, cherry-red plastic chairs, cream tile floor, warm fluorescent lighting, symmetrical planimetric composition, cinematic photorealism.'
const ANCHOR_CHARACTER = 'A young woman in her early twenties with a black bob haircut, wearing a cream knit sweater, denim skirt, white socks and white sneakers.'
// match-on-action 연속 큐 (Task C — carry 샷 motion prompt에 결정론 접미)
const CARRY_CUE = 'Match-on-action continuity: the subject\'s movement picks up seamlessly from the previous shot\'s ending motion, now seen from this new angle and shot size.'

// 도입 플래시 컷 스프레드(초) — cluster 1 establish 샷 순서대로 소비
const FLASH_SECONDS = [0.9, 1.2, 1.5]
const CHAR_SEED = 70723 // 인물 등장 샷 고정 seed(외형 일관성 시도)

function readLog(stage) {
  const p = path.join(LOG_DIR, `laundromat__${stage}__${RUN}.json`)
  return JSON.parse(fs.readFileSync(p, 'utf8'))
}

const grammar = readLog('sceneShotCoGenGrammar')
const shotDesignLog = readLog('shotDesign')
const shotMeta = grammar.result.shot_meta
const sdShots = shotDesignLog.result
const metaById = new Map(shotMeta.map((m) => [m.shot_id, m]))

// cluster 1 establish 샷들을 순서대로 모아 플래시 초를 배정
const flashIds = shotMeta
  .filter((m) => m.cluster_id === 1 && m.rhythm_role === 'establish')
  .map((m) => m.shot_id)

const carryModified = []
const plan = []
for (let i = 0; i < sdShots.length; i++) {
  const sd = sdShots[i]
  const id = sd.intent.shot_id
  const meta = metaById.get(id) ?? {}
  const chars = (sd.static_spec.character_blocking ?? []).map((c) => c.character_id).filter(Boolean)
  const hasChar = chars.length > 0

  // (Task D) 앵커 접두
  const anchorPrefix = hasChar ? `${ANCHOR_SPACE} ${ANCHOR_CHARACTER}` : ANCHOR_SPACE
  const first_frame_prompt = `${anchorPrefix} ${sd.static_spec.first_frame_prompt}`

  // (Task C) carry 있으면 motion prompt에 연속 큐 결정론 접미
  let motion_prompt = sd.dynamic_spec.motion_prompt
  const carry = meta.carry_from ?? null
  if (carry) {
    motion_prompt = `${motion_prompt} ${CARRY_CUE}`
    carryModified.push({ shot_id: id, carry_from: carry, appended: CARRY_CUE })
  }

  // (Task F) render_seconds
  const designSec = sd.intent.duration_seconds ?? meta.intended_duration_seconds ?? 3
  let render_seconds = designSec
  const flashIdx = flashIds.indexOf(id)
  if (flashIdx >= 0) render_seconds = FLASH_SECONDS[Math.min(flashIdx, FLASH_SECONDS.length - 1)]
  render_seconds = Math.round(render_seconds * 100) / 100

  // happy-horse video 요청 길이 (min 3s enum) — 생성 후 render_seconds로 트리밍
  const video_request_seconds = Math.max(3, Math.min(15, Math.ceil(render_seconds)))

  plan.push({
    shot_id: id,
    order: i + 1,
    scene_id: meta.scene_id ?? sd.intent.scene_id ?? null,
    cluster_id: meta.cluster_id ?? null,
    carry_from: carry,
    shot_function: meta.shot_function ?? null,
    shot_size: sd.static_spec.shot_type ?? meta.shot_size ?? null,
    rhythm_role: meta.rhythm_role ?? null,
    has_character: hasChar,
    characters: chars,
    is_flash_intro: flashIdx >= 0,
    design_seconds: designSec,
    render_seconds,
    video_request_seconds,
    seed: hasChar ? CHAR_SEED : (12345 + i),
    beat_summary: meta.beat_summary ?? '',
    dramatic_purpose: meta.dramatic_purpose ?? sd.intent.dramatic_purpose ?? '',
    first_frame_prompt,
    motion_prompt,
    camera_motion: sd.dynamic_spec.camera_motion?.type ?? 'static',
  })
}

const totalRender = plan.reduce((a, s) => a + s.render_seconds, 0)
fs.mkdirSync(OUT_DIR, { recursive: true })
fs.writeFileSync(path.join(OUT_DIR, 'shotplan.json'), JSON.stringify({ run: RUN, total_shots: plan.length, total_render_seconds: Math.round(totalRender * 100) / 100, carry_modified_count: carryModified.length, shots: plan }, null, 2))
fs.writeFileSync(path.join(OUT_DIR, 'prompts.json'), JSON.stringify(plan.map((s) => ({ shot_id: s.shot_id, seed: s.seed, first_frame_prompt: s.first_frame_prompt, motion_prompt: s.motion_prompt })), null, 2))
fs.writeFileSync(path.join(OUT_DIR, 'carry_reflection.json'), JSON.stringify({ modified: carryModified }, null, 2))

console.log(`[build] RUN=${RUN} shots=${plan.length} total_render=${totalRender.toFixed(2)}s carry_modified=${carryModified.length}`)
console.log(`[build] flash intro shots: ${flashIds.join(', ')} -> ${flashIds.map((_, i) => FLASH_SECONDS[Math.min(i, FLASH_SECONDS.length - 1)] + 's').join('/')}`)
console.log(`[build] masters: ${plan.filter((s) => s.shot_function === 'master' || s.shot_function === 'establishing').map((s) => s.shot_id + '/' + s.render_seconds + 's').join(', ')}`)
console.log(`[build] wrote shotplan.json, prompts.json, carry_reflection.json -> ${path.relative(ROOT, OUT_DIR)}`)
