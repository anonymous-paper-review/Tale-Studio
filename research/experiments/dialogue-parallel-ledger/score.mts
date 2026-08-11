// 대사 트랙 결정론 채점기 — HYPOTHESIS.md 의 "측정" 절이 여기 한 곳에 산다.
//   probe.mts(라이브 실행)와 score-from-logs.mts(로거 산출물 재채점)가 같은 정의를 쓰도록 공용화.
//   ※ 제품 로직은 한 줄도 들어오지 않는다 — 순수 채점만(실험 규칙 1: 복붙 금지).
//
// CLI: pnpm dlx tsx research/experiments/dialogue-parallel-ledger/score.mts <logDir> [logDir...]
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import path from 'node:path'

const FIXTURE = path.resolve('logs/e4da245a-8d89-44e5-8fde-131d016ef2e3')

export interface SceneMeta {
  scene_id: string
  characters_in_scene: string[]
  estimated_seconds: number
}

export interface DialogueLine {
  scene_id: string
  shot_id: string
  character_id: string
  line: string
}

export interface Score {
  scene_count: number
  total_lines: number
  lines_by_scene: Record<string, number>
  fully_silent_scenes: string[]
  cross_scene_exact_dup: number
  cross_scene_near_dup: number
  dup_samples: unknown[]
  silence_budget_violations: number
  silence_budget_detail: { scene_id: string; lines: number; cap: number }[]
  invalid_speakers: { scene_id: string; character_id: string }[]
}

const norm = (s: string) => s.replace(/[\s\p{P}\p{S}]/gu, '').toLowerCase()
const trigrams = (s: string) => {
  const g = new Set<string>()
  for (let i = 0; i + 3 <= s.length; i += 1) g.add(s.slice(i, i + 3))
  return g
}
const jaccard = (a: Set<string>, b: Set<string>) => {
  if (a.size === 0 || b.size === 0) return 0
  let inter = 0
  for (const x of a) if (b.has(x)) inter += 1
  return inter / (a.size + b.size - inter)
}

/** 대사 트랙(scenes) + 씬 메타 → 결정론 지표. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function scoreDialogue(dialogueScenes: any[], sceneMeta: Map<string, SceneMeta>): Score {
  const lines: DialogueLine[] = []
  const linesByScene: Record<string, number> = {}
  const fullySilentScenes: string[] = []
  const invalidSpeakers: { scene_id: string; character_id: string }[] = []

  for (const sc of dialogueScenes ?? []) {
    let n = 0
    for (const sh of sc.shots ?? []) {
      for (const d of sh.dialogue ?? []) {
        if (typeof d?.line !== 'string' || !d.line.trim()) continue
        lines.push({ scene_id: sc.scene_id, shot_id: sh.shot_id, character_id: d.character_id, line: d.line })
        n += 1
        const cast = sceneMeta.get(sc.scene_id)?.characters_in_scene ?? []
        if (cast.length && !cast.includes(d.character_id)) {
          invalidSpeakers.push({ scene_id: sc.scene_id, character_id: d.character_id })
        }
      }
    }
    linesByScene[sc.scene_id] = n
    if (n === 0 && (sc.shots ?? []).length > 0) fullySilentScenes.push(sc.scene_id)
  }

  // 씬 "간" 중복만 — 씬 내부 반복은 하나의 대화 흐름이라 정상.
  const prepped = lines.map((l) => {
    const n = norm(l.line)
    return { ...l, n, g: trigrams(n) }
  })
  let exactDup = 0
  let nearDup = 0
  const dupSamples: unknown[] = []
  for (let a = 0; a < prepped.length; a += 1) {
    for (let b = a + 1; b < prepped.length; b += 1) {
      if (prepped[a].scene_id === prepped[b].scene_id) continue
      if (prepped[a].n.length < 2 || prepped[b].n.length < 2) continue
      if (prepped[a].n === prepped[b].n) {
        exactDup += 1
        if (dupSamples.length < 8) {
          dupSamples.push({ kind: 'exact', a: { s: prepped[a].scene_id, l: prepped[a].line }, b: { s: prepped[b].scene_id, l: prepped[b].line } })
        }
        continue
      }
      if (prepped[a].n.length < 6 || prepped[b].n.length < 6) continue
      const j = jaccard(prepped[a].g, prepped[b].g)
      if (j >= 0.6) {
        nearDup += 1
        if (dupSamples.length < 8) {
          dupSamples.push({ kind: 'near', j: Number(j.toFixed(2)), a: { s: prepped[a].scene_id, l: prepped[a].line }, b: { s: prepped[b].scene_id, l: prepped[b].line } })
        }
      }
    }
  }

  // 규율 A: 씬 라인 수 ≤ ceil(estimated_seconds / 10)
  let budgetViolations = 0
  const budgetDetail: { scene_id: string; lines: number; cap: number }[] = []
  for (const [sceneId, n] of Object.entries(linesByScene)) {
    const cap = Math.ceil((sceneMeta.get(sceneId)?.estimated_seconds ?? 0) / 10)
    if (cap > 0 && n > cap) {
      budgetViolations += 1
      budgetDetail.push({ scene_id: sceneId, lines: n, cap })
    }
  }

  return {
    scene_count: dialogueScenes?.length ?? 0,
    total_lines: lines.length,
    lines_by_scene: linesByScene,
    fully_silent_scenes: fullySilentScenes,
    cross_scene_exact_dup: exactDup,
    cross_scene_near_dup: nearDup,
    dup_samples: dupSamples,
    silence_budget_violations: budgetViolations,
    silence_budget_detail: budgetDetail,
    invalid_speakers: invalidSpeakers,
  }
}

/** fixture 씬 메타 로드 (채점에 필요한 필드만). */
export function loadSceneMeta(): Map<string, SceneMeta> {
  const scenes = JSON.parse(readFileSync(path.join(FIXTURE, '05_s3_scenes.json'), 'utf8'))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new Map(scenes.scenes.map((s: any) => [s.scene_id, s as SceneMeta]))
}

/** 로거 산출물 디렉토리 1개 → 채점 + 콜 타이밍. 산출물이 유일한 진실원(결과 JSON 유실 대비). */
export function scoreLogDir(dir: string) {
  const track = JSON.parse(readFileSync(path.join(dir, '14b_dialogue.json'), 'utf8'))
  const score = scoreDialogue(track.scenes, loadSceneMeta())
  const callsDir = path.join(dir, 'debug', 'llm_calls')
  let calls = 0
  let callMsSum = 0
  let callErrors = 0
  const callMs: number[] = []
  if (existsSync(callsDir)) {
    for (const f of readdirSync(callsDir).filter((f) => f.endsWith('.json'))) {
      const c = JSON.parse(readFileSync(path.join(callsDir, f), 'utf8'))
      calls += 1
      callMs.push(c.duration_ms ?? 0)
      callMsSum += c.duration_ms ?? 0
      if (c.error) callErrors += 1
    }
  }
  return { dir: path.basename(dir), calls, call_ms: callMs, call_ms_sum: callMsSum, call_errors: callErrors, ...score }
}

// ── CLI ────────────────────────────────────────────────────────────────
const isMain = process.argv[1] && process.argv[1].endsWith('score.mts')
if (isMain) {
  const dirs = process.argv.slice(2)
  if (dirs.length === 0) {
    console.error('사용: score.mts <logDir> [logDir...]')
    process.exit(1)
  }
  for (const d of dirs) {
    const s = scoreLogDir(path.resolve(d))
    console.log(
      `${s.dir.padEnd(24)} 콜 ${String(s.calls).padStart(2)} · 모델시간 ${(s.call_ms_sum / 1000).toFixed(1)}s · ` +
        `라인 ${String(s.total_lines).padStart(3)} · 씬간중복 ${s.cross_scene_exact_dup}e/${s.cross_scene_near_dup}n · ` +
        `침묵예산위반 ${s.silence_budget_violations} · 무음씬 ${s.fully_silent_scenes.length} · ` +
        `화자위반 ${s.invalid_speakers.length}`,
    )
  }
}
