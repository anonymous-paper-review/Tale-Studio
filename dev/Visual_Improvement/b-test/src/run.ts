// B안 테스트 CLI — 3 서브커맨드:
//   prepare  : DB fetch → out/inputs/context.json + 씬별 프롬프트 파일 (생성은 Claude 서브에이전트가 수행)
//   evaluate : out/plans/plan-run{N}-{scene}.json 들을 검증·채점 → out/report.md
//   generate : (대안, 무인 실행용) codex|gemini 백엔드로 생성까지 일괄 수행
import { parseArgs } from 'node:util';
import { mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { loadEnv } from './env.ts';
import { fetchProject, fetchScenes, fetchShots } from './db.ts';
import { buildScenePrompt } from './prompt.ts';
import { generateJson, type Backend } from './llm.ts';
import { normalizePlan, scoreShot, validateScene, validateShot } from './validate.ts';
import { computeConsistency, renderReport, type ConsistencyRow } from './report.ts';
import type { DbProject, DbScene, DbShot, RunResult, SceneMotionPlan, ShotScore, Violation } from './types.ts';

interface Context {
  project: DbProject;
  scenes: DbScene[];
  shots: DbShot[];
}

const { values: args, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    project: { type: 'string', default: '1f644223-66f2-4923-a75e-3c4ad383709b' },
    backend: { type: 'string', default: 'codex' },            // generate 전용: codex | gemini
    runs: { type: 'string', default: '2' },
    label: { type: 'string', default: 'claude-subagent' },    // evaluate 리포트에 표기할 생성 주체
    'env-file': { type: 'string', default: '/home/user/Downloads/Tale-Studio/.env.local' },
    out: { type: 'string', default: resolve(import.meta.dirname, '../out') },
  },
});

const outDir = args.out as string;

function groupShots(shots: DbShot[]): Map<string, DbShot[]> {
  const m = new Map<string, DbShot[]>();
  for (const s of shots) {
    const arr = m.get(s.scene_id) ?? [];
    arr.push(s);
    m.set(s.scene_id, arr);
  }
  return m;
}

function evaluatePlan(
  raw: unknown, scene: DbScene, sceneShots: DbShot[],
): { plan: SceneMotionPlan; violations: Violation[]; scores: ShotScore[] } {
  const { plan, violations: schemaViol } = normalizePlan(raw, scene.scene_id);
  const shotViol = plan.shots.flatMap((sh) => validateShot(sh, sceneShots.find((d) => d.shot_id === sh.shot_id)));
  const sceneViol = validateScene(plan, sceneShots);
  const all = [...schemaViol, ...shotViol, ...sceneViol];
  return { plan, violations: all, scores: plan.shots.map((sh) => scoreShot(sh, all)) };
}

async function fetchContext(): Promise<Context> {
  const env = loadEnv(args['env-file'] as string);
  const projectId = args.project as string;
  const [project, scenes, shots] = await Promise.all([
    fetchProject(env, projectId),
    fetchScenes(env, projectId),
    fetchShots(env, projectId),
  ]);
  return { project, scenes, shots };
}

async function cmdPrepare(): Promise<void> {
  const ctx = await fetchContext();
  const inputsDir = join(outDir, 'inputs');
  mkdirSync(inputsDir, { recursive: true });
  mkdirSync(join(outDir, 'plans'), { recursive: true });
  writeFileSync(join(inputsDir, 'context.json'), JSON.stringify(ctx, null, 2));
  const byScene = groupShots(ctx.shots);
  console.log(`[b-test] prepare — "${ctx.project.title}" 씬 ${ctx.scenes.length}, 샷 ${ctx.shots.length}`);
  for (const scene of ctx.scenes) {
    const sceneShots = byScene.get(scene.scene_id) ?? [];
    if (!sceneShots.length) continue;
    const p = join(inputsDir, `${scene.scene_id}.prompt.md`);
    writeFileSync(p, buildScenePrompt(scene, sceneShots, ctx.project.story_text));
    console.log(`[b-test]   프롬프트 → ${p} (샷 ${sceneShots.length}개)`);
  }
  console.log(`[b-test] 생성 단계: 각 run·씬에 대해 위 프롬프트로 JSON을 만들어`);
  console.log(`[b-test]   ${join(outDir, 'plans')}/plan-run{N}-{scene_id}.json 에 저장한 뒤 evaluate 실행.`);
}

function cmdEvaluate(): void {
  const ctxPath = join(outDir, 'inputs', 'context.json');
  if (!existsSync(ctxPath)) throw new Error(`context 없음 — 먼저 prepare 실행: ${ctxPath}`);
  const ctx = JSON.parse(readFileSync(ctxPath, 'utf8')) as Context;
  const byScene = groupShots(ctx.shots);
  const plansDir = join(outDir, 'plans');
  const files = existsSync(plansDir) ? readdirSync(plansDir).filter((f) => /^plan-run\d+-.+\.json$/.test(f)) : [];
  if (!files.length) throw new Error(`계획 파일 없음: ${plansDir}/plan-run{N}-{scene}.json`);

  const results: RunResult[] = [];
  const failures: Array<{ runIndex: number; sceneId: string; error: string }> = [];
  for (const f of files.sort()) {
    const m = f.match(/^plan-run(\d+)-(.+)\.json$/);
    if (!m) continue;
    const runIndex = Number(m[1]);
    const sceneId = m[2];
    const scene = ctx.scenes.find((s) => s.scene_id === sceneId);
    const sceneShots = byScene.get(sceneId) ?? [];
    if (!scene || !sceneShots.length) {
      failures.push({ runIndex, sceneId, error: 'context에 없는 scene_id' });
      continue;
    }
    try {
      const raw = JSON.parse(readFileSync(join(plansDir, f), 'utf8')) as unknown;
      const { plan, violations, scores } = evaluatePlan(raw, scene, sceneShots);
      results.push({ runIndex, sceneId, plan, scores, llm: { backend: args.label as string, ms: 0, retried: false } });
      writeFileSync(join(outDir, `eval-run${runIndex}-${sceneId}.json`), JSON.stringify({ plan, violations, scores }, null, 2));
      const failN = violations.filter((x) => x.severity === 'fail').length;
      const warnN = violations.filter((x) => x.severity === 'warn').length;
      console.log(`[b-test] ${f} — units ${plan.shots.reduce((n, s) => n + s.units.length, 0)}, fail ${failN}, warn ${warnN}`);
    } catch (e) {
      failures.push({ runIndex, sceneId, error: (e as Error).message });
      console.error(`[b-test] ${f} 평가 실패: ${(e as Error).message}`);
    }
  }

  let consistency: ConsistencyRow[] = [];
  for (const scene of ctx.scenes) {
    const a = results.find((r) => r.runIndex === 0 && r.sceneId === scene.scene_id);
    const b = results.find((r) => r.runIndex === 1 && r.sceneId === scene.scene_id);
    if (a && b) consistency = consistency.concat(computeConsistency(a, b));
  }

  const report = renderReport(ctx.project, ctx.scenes, byScene, results, consistency, failures);
  writeFileSync(join(outDir, 'report.md'), report);
  console.log(`[b-test] 리포트 → ${join(outDir, 'report.md')}`);
}

async function cmdGenerate(): Promise<void> {
  const backend = args.backend as Backend;
  if (backend !== 'codex' && backend !== 'gemini') throw new Error(`--backend은 codex|gemini: ${backend}`);
  const runs = Math.max(1, Number(args.runs) || 1);
  const env = loadEnv(args['env-file'] as string);
  const ctx = await fetchContext();
  const byScene = groupShots(ctx.shots);
  mkdirSync(join(outDir, 'plans'), { recursive: true });
  mkdirSync(join(outDir, 'inputs'), { recursive: true });
  writeFileSync(join(outDir, 'inputs', 'context.json'), JSON.stringify(ctx, null, 2));
  console.log(`[b-test] generate — backend=${backend} runs=${runs}, "${ctx.project.title}" 씬 ${ctx.scenes.length}, 샷 ${ctx.shots.length}`);

  for (let run = 0; run < runs; run++) {
    for (const scene of ctx.scenes) {
      const sceneShots = byScene.get(scene.scene_id) ?? [];
      if (!sceneShots.length) continue;
      const label = `run${run}-${scene.scene_id}`;
      console.log(`[b-test] ${label} 생성 중 (${backend})...`);
      try {
        const prompt = buildScenePrompt(scene, sceneShots, ctx.project.story_text);
        const { value, call } = await generateJson(backend, env, prompt, outDir, label);
        writeFileSync(join(outDir, 'plans', `plan-${label}.json`), JSON.stringify(value, null, 2));
        console.log(`[b-test] ${label} 완료 (${(call.ms / 1000).toFixed(0)}s${call.retried ? ', 재시도' : ''})`);
      } catch (e) {
        console.error(`[b-test] ${label} 실패: ${(e as Error).message}`);
      }
    }
  }
  // 생성 직후 평가까지 (리포트 표기 주체 = 백엔드명)
  if ((args.label as string) === 'claude-subagent') args.label = backend;
  cmdEvaluate();
}

const cmd = positionals[0] ?? 'prepare';
const run =
  cmd === 'prepare' ? cmdPrepare()
  : cmd === 'evaluate' ? Promise.resolve().then(cmdEvaluate)
  : cmd === 'generate' ? cmdGenerate()
  : Promise.reject(new Error(`알 수 없는 서브커맨드: ${cmd} (prepare|evaluate|generate)`));

run.catch((e) => {
  console.error('[b-test] fatal:', (e as Error).message);
  process.exit(1);
});
