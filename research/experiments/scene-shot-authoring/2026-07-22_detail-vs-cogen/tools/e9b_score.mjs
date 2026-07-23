// E9b 채점 (결정론): 씬 상세화(A: 병합 1콜 + 결정론 집행) vs 씬·샷 근접 생성(B: 융합 1콜).
//   최우선 지표(오너 지정) — ① 러닝타임 충족 ② 샷 수 기대대역 ③ 샷 길이 규율(2~8s).
//   보조 — A 목표 준수 sanity(결정론이라 정의상 일치), 의도 정합 프록시, 시간·콜 수.
// 사용: node e9b_score.mjs <repo>/logs/writer-stage-exp
import fs from 'node:fs';
import path from 'node:path';

const DIR = process.argv[2] ?? 'logs/writer-stage-exp';
const load = (f) => { try { return JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')); } catch { return null; } };

// 프리셋 runtime(초) — 하네스 PRESETS 정의값(재현용 고정).
const RUNTIME = { ad: 30, kishoten: 90 };
const SHOT_MIN = 2, SHOT_MAX = 8;         // physics.ts SHOT_PHYSICS
const AVG_REF = 5;                        // 기대대역 중앙 근사(2~8 중점)
const RUNS = [1, 2, 3];

const stats = (arr) => {
  const s = [...arr].sort((a, b) => a - b);
  const sum = s.reduce((a, b) => a + b, 0);
  return { sum, min: s[0] ?? 0, med: s[s.length ? Math.floor(s.length / 2) : 0] ?? 0, max: s[s.length - 1] ?? 0, n: s.length };
};

// 한 DecoupagePlan에서 최우선·보조 지표 산출.
function scorePlan(plan, runtime) {
  const durs = plan.scenes.flatMap((s) => s.shots.map((x) => x.intended_duration_seconds));
  const d = stats(durs);
  const outOfRange = durs.filter((x) => x < SHOT_MIN || x > SHOT_MAX).length;
  // 기대대역: 물리 정합(runtime/8 ~ runtime/2). 명목치 runtime/AVG_REF.
  const bandLo = Math.ceil(runtime / SHOT_MAX), bandHi = Math.floor(runtime / SHOT_MIN);
  const nominal = Math.round(runtime / AVG_REF);
  // 의도 정합 프록시
  const sceneIds = new Set(plan.scenes.map((s) => s.scene_id));
  const allShots = plan.scenes.flatMap((s) => s.shots);
  const sidPresent = allShots.filter((x) => sceneIds.has(x.scene_id)).length;
  let coveredBeats = 0, totalBeats = 0;
  for (const sc of plan.scenes) {
    totalBeats += sc.beat_count;
    const cov = new Set();
    for (const sh of sc.shots) for (const b of (sh.source_beats ?? [])) if (b < sc.beat_count) cov.add(b);
    coveredBeats += cov.size;
  }
  return {
    total: plan.total_shots, added: plan.total_added,
    durSum: d.sum, runtimeDev: Math.abs(d.sum - runtime) / runtime,
    outOfRange, outRatio: durs.length ? outOfRange / durs.length : 0,
    dmin: d.min, dmed: d.med, dmax: d.max,
    bandLo, bandHi, nominal, inBand: plan.total_shots >= bandLo && plan.total_shots <= bandHi,
    sidRate: allShots.length ? sidPresent / allShots.length : 1,
    beatCov: totalBeats ? coveredBeats / totalBeats : 1,
    addedRatio: plan.total_shots ? plan.total_added / plan.total_shots : 0,
  };
}

const pct = (x) => `${(x * 100).toFixed(1)}%`;

for (const preset of ['ad', 'kishoten']) {
  const runtime = RUNTIME[preset];
  console.log(`\n═══════════════ ${preset} (runtime=${runtime}s) ═══════════════`);
  const band0 = Math.ceil(runtime / SHOT_MAX), band1 = Math.floor(runtime / SHOT_MIN);
  console.log(`기대대역(물리 runtime/8~runtime/2)=${band0}~${band1}샷, 명목(runtime/5)≈${Math.round(runtime / AVG_REF)}샷`);
  console.log('arm/run | 총샷 | 대역내 | added | durSum(런타임편차) | 2~8s밖(비율) | dur[min/med/max] | A목표준수 | scene_id | beat커버 | 콜 | 시간(s)');
  const agg = { A: [], B: [] };
  for (const arm of ['A', 'B']) {
    for (const r of RUNS) {
      const planFile = arm === 'A' ? `${preset}__decoupageExecutorA__e9b${arm}${r}.json` : `${preset}__sceneShotCoGen__e9b${arm}${r}.json`;
      const pj = load(planFile);
      if (!pj?.result?.scenes) { console.log(`${arm}${r}     | MISSING (${planFile})`); continue; }
      const m = scorePlan(pj.result, runtime);
      // A: target sanity + 시간·콜은 sceneAbsorbedPlan + executor 합산. B: coGen 단독.
      let calls, wall, sanity = '-';
      if (arm === 'A') {
        const sap = load(`${preset}__sceneAbsorbedPlan__e9b${arm}${r}.json`);
        const tgt = (sap?.result?.scenes ?? []).reduce((s, x) => s + (Number(x.shot_count_target) || 0), 0);
        calls = (sap?.llm_calls?.length ?? 0) + (pj.llm_calls?.length ?? 0);
        wall = ((sap?.duration_ms ?? 0) + (pj.duration_ms ?? 0)) / 1000;
        sanity = `${m.total}==${tgt}${m.total === tgt ? '✓' : '✗'}`;
      } else {
        calls = pj.llm_calls?.length ?? 0;
        wall = (pj.duration_ms ?? 0) / 1000;
      }
      agg[arm].push({ m, calls, wall });
      console.log(
        `${arm}${r}     | ${String(m.total).padStart(3)} | ${m.inBand ? ' 예 ' : '아니오'} | ${String(m.added).padStart(3)} | ${String(m.durSum).padStart(3)}s (${pct(m.runtimeDev).padStart(6)}) | ${m.outOfRange}건(${pct(m.outRatio)}) | ${m.dmin}/${m.dmed}/${m.dmax} | ${sanity.padEnd(9)} | ${pct(m.sidRate)} | ${pct(m.beatCov)} | ${calls} | ${wall.toFixed(1)}`,
      );
    }
  }
  // 팔별 평균(최우선 3종)
  const avg = (rows, sel) => rows.length ? rows.reduce((s, x) => s + sel(x), 0) / rows.length : NaN;
  for (const arm of ['A', 'B']) {
    const rows = agg[arm];
    if (!rows.length) continue;
    const inBandCount = rows.filter((x) => x.m.inBand).length;
    console.log(
      `${arm} 평균  | 런타임편차=${pct(avg(rows, (x) => x.m.runtimeDev))} | 2~8s밖비율=${pct(avg(rows, (x) => x.m.outRatio))} | 대역내 ${inBandCount}/${rows.length} run | 총샷avg=${avg(rows, (x) => x.m.total).toFixed(1)} | added비avg=${pct(avg(rows, (x) => x.m.addedRatio))} | 콜avg=${avg(rows, (x) => x.calls).toFixed(1)} | 시간avg=${avg(rows, (x) => x.wall).toFixed(1)}s`,
    );
  }
}
console.log('');
