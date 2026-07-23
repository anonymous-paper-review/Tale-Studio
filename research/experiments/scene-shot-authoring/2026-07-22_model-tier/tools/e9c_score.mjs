// E9c 채점 (결정론): 씬·샷 저작의 모델 티어 재실험. 연출이 주연이다(오너 지정).
//   A' = 상위 모델(Claude Sonnet) 씬 설계 → 현행급(gemini flash) 계획 주입 샷 집행.
//   B' = 상위 모델(Claude Sonnet) 씬·샷 근접 생성.
//   E9b(현행급) 3자 대조: E9b-B(gemini 근접생성) = B'의 현행급 짝, E9b-A(결정론 집행) = 연출 바닥.
//
// [주연 — 연출 지표]  (오너 피드백: "연출이 정말정말정말 중요")
//   ① 정적 카메라 비율 = static shots / total (낮을수록 카메라가 움직임; 단 무동기 무빙은 감점 요인).
//   ② 샷 사이즈 종수 = distinct shot_size 수 (다양성).
//   ③ 추가 샷 비율 = total_added / total (설정·반응·인서트 = 감독 craft).
//   ④ 무빙 동기 서술 = motivated_move 샷 중 camera_move_motivation 비어있지 않은 비율(왜 움직이는지).
//   ⑤ 같은 공간 연속 샷 클러스터 — 프록시 정의(실행 전 고정):
//        "같은 공간"은 같은 scene_id 로 근사한다(한 씬 = 한 로케이션이므로 같은 씬 연속 샷 = 같은 공간).
//        클러스터 = 전역 샷 순서에서 같은 scene_id 가 연속하는 최대 런. 씬 경계 컷 = 공간 전환.
//        · 멀티샷 클러스터 수 = 샷 2개 이상인 씬 수(공간 안에서 여러 샷으로 커버).
//        · 평균 클러스터 길이 = 씬당 평균 샷 수.
//        · 단발 씬 = 샷 1개뿐인 씬 수(고립 컷 — 연속성에 불리).
//        · 연결 신호 = 씬 내 인접 샷쌍 중 "행동 연장"인 비율.
//            행동 연장 판정: 뒤 샷이 added(공간 커버 확장)이거나, 양쪽 source_beats 최소 비트가
//            역행하지 않으면(뒤 ≥ 앞) 연장으로 본다. 역행(뒤 < 앞)만 컷 튐으로 감점.
//
// [부록 — 배관 지표]  러닝타임 편차·샷 수 대역·2~8s 규율·A' 목표 준수·콜/시간.
//
// 사용: node e9c_score.mjs <repo>/logs/writer-stage-exp
import fs from 'node:fs';
import path from 'node:path';

const DIR = process.argv[2] ?? 'logs/writer-stage-exp';
const load = (f) => { try { return JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')); } catch { return null; } };

const RUNTIME = { ad: 30, kishoten: 90 };   // 하네스 PRESETS 정의값(재현용 고정)
const SHOT_MIN = 2, SHOT_MAX = 8;           // physics.ts SHOT_PHYSICS
const AVG_REF = 5;
const pct = (x) => `${(x * 100).toFixed(1)}%`;
const avg = (rows, sel) => rows.length ? rows.reduce((s, x) => s + sel(x), 0) / rows.length : NaN;

// 한 DecoupagePlan에서 연출 지표(주연) + 배관 지표(부록) 산출.
function scorePlan(plan, runtime) {
  const scenes = plan.scenes ?? [];
  const allShots = scenes.flatMap((s) => s.shots ?? []);
  const total = allShots.length;
  const durs = allShots.map((x) => Number(x.intended_duration_seconds) || 0);

  // ── 주연 연출 지표 ──
  const staticN = allShots.filter((x) => (x.camera_intent ?? 'static') === 'static').length;
  const sizes = new Set(allShots.map((x) => x.shot_size).filter(Boolean));
  const added = plan.total_added ?? allShots.filter((x) => x.operation === 'added').length;
  const moved = allShots.filter((x) => x.camera_intent === 'motivated_move');
  const movedWithMotiv = moved.filter((x) => typeof x.camera_move_motivation === 'string' && x.camera_move_motivation.trim().length > 0);

  // 공간 연속 프록시 (씬 단위)
  const multiShotScenes = scenes.filter((s) => (s.shots?.length ?? 0) >= 2).length;
  const singletonScenes = scenes.filter((s) => (s.shots?.length ?? 0) === 1).length;
  const meanClusterLen = scenes.length ? total / scenes.length : 0;
  let contPairs = 0, totPairs = 0;
  const minBeat = (sh) => {
    const b = Array.isArray(sh.source_beats) ? sh.source_beats.filter((n) => Number.isFinite(n)) : [];
    return b.length ? Math.min(...b) : null;
  };
  for (const s of scenes) {
    const shots = s.shots ?? [];
    for (let i = 1; i < shots.length; i++) {
      totPairs += 1;
      const prev = shots[i - 1], cur = shots[i];
      if (cur.operation === 'added') { contPairs += 1; continue; }
      const a = minBeat(prev), b = minBeat(cur);
      if (a === null || b === null) { contPairs += 1; continue; } // 판정 불가 → 연장으로(무증거 무죄)
      if (b >= a) contPairs += 1;                                  // 역행 아님 = 행동 연장
    }
  }

  // ── 부록 배관 지표 ──
  const durSum = durs.reduce((a, b) => a + b, 0);
  const outOfRange = durs.filter((x) => x < SHOT_MIN || x > SHOT_MAX).length;
  const bandLo = Math.ceil(runtime / SHOT_MAX), bandHi = Math.floor(runtime / SHOT_MIN);
  const s = [...durs].sort((a, b) => a - b);

  return {
    total, added,
    staticRatio: total ? staticN / total : 1,
    sizeVariety: sizes.size,
    addedRatio: total ? added / total : 0,
    movedN: moved.length, motivCoverage: moved.length ? movedWithMotiv.length / moved.length : null,
    multiShotScenes, singletonScenes, sceneCount: scenes.length, meanClusterLen,
    connectSignal: totPairs ? contPairs / totPairs : null, totPairs,
    // 부록
    durSum, runtimeDev: Math.abs(durSum - runtime) / runtime,
    outOfRange, outRatio: durs.length ? outOfRange / durs.length : 0,
    inBand: total >= bandLo && total <= bandHi, bandLo, bandHi,
    dmin: s[0] ?? 0, dmed: s[Math.floor(s.length / 2)] ?? 0, dmax: s[s.length - 1] ?? 0,
  };
}

// 팔 정의: label, 각 run의 [plan파일, 저작파일(선택), calls·시간 합산 여부].
function armFiles(preset, arm, r) {
  if (arm === "A'") return { plan: `${preset}__decoupageExecutorAHi__e9cA${r}.json`, author: `${preset}__sceneAbsorbedPlanHi__e9cA${r}.json` };
  if (arm === "B'") return { plan: `${preset}__sceneShotCoGenHi__e9cB${r}.json`, author: null };
  if (arm === 'E9b-B') return { plan: `${preset}__sceneShotCoGen__e9bB${r}.json`, author: null };
  if (arm === 'E9b-A') return { plan: `${preset}__decoupageExecutorA__e9bA${r}.json`, author: `${preset}__sceneAbsorbedPlan__e9bA${r}.json` };
  return null;
}
const ARMS = [
  { key: "A'", runs: [1, 2] },
  { key: "B'", runs: [1, 2] },
  { key: 'E9b-B', runs: [1, 2, 3] },
  { key: 'E9b-A', runs: [1, 2, 3] },
];

for (const preset of ['ad', 'kishoten']) {
  const runtime = RUNTIME[preset];
  console.log(`\n═══════════════ ${preset} (runtime=${runtime}s) ═══════════════`);

  // 각 팔 run 수집
  const agg = {};
  for (const { key, runs } of ARMS) {
    agg[key] = [];
    for (const r of runs) {
      const f = armFiles(preset, key, r);
      const pj = load(f.plan);
      if (!pj?.result?.scenes) continue;
      const m = scorePlan(pj.result, runtime);
      let calls = pj.llm_calls?.length ?? 0, wall = (pj.duration_ms ?? 0) / 1000, tgt = null;
      if (f.author) {
        const aj = load(f.author);
        calls += aj?.llm_calls?.length ?? 0;
        wall += (aj?.duration_ms ?? 0) / 1000;
        tgt = (aj?.result?.scenes ?? []).reduce((s2, x) => s2 + (Number(x.shot_count_target) || 0), 0) || null;
      }
      agg[key].push({ r, m, calls, wall, tgt });
    }
  }

  // ── 주연: 연출 지표 표 ──
  console.log('\n[주연 — 연출 지표]');
  console.log('팔/run | 총샷 | 정적% | 사이즈종수 | 추가샷%(수) | 무빙(동기서술%) | 멀티씬/단발/씬수 | 평균클러스터 | 연결신호%(쌍수)');
  for (const { key } of ARMS) {
    for (const x of agg[key]) {
      const m = x.m;
      const motiv = m.movedN ? `${m.movedN}(${pct(m.motivCoverage)})` : '0(—)';
      const conn = m.connectSignal === null ? '—' : `${pct(m.connectSignal)}(${m.totPairs})`;
      console.log(
        `${key.padEnd(5)}${x.r} | ${String(m.total).padStart(3)} | ${pct(m.staticRatio).padStart(6)} | ${String(m.sizeVariety).padStart(4)} | ${String(m.added).padStart(2)}(${pct(m.addedRatio)}) | ${motiv.padEnd(11)} | ${m.multiShotScenes}/${m.singletonScenes}/${m.sceneCount} | ${m.meanClusterLen.toFixed(1)} | ${conn}`,
      );
    }
  }
  console.log('  ── 팔 평균 ──');
  for (const { key } of ARMS) {
    const rows = agg[key];
    if (!rows.length) { console.log(`  ${key.padEnd(6)} | (데이터 없음)`); continue; }
    const movedRows = rows.filter((x) => x.m.movedN > 0);
    const connRows = rows.filter((x) => x.m.connectSignal !== null);
    console.log(
      `  ${key.padEnd(6)} | 정적%=${pct(avg(rows, (x) => x.m.staticRatio))} | 사이즈종수avg=${avg(rows, (x) => x.m.sizeVariety).toFixed(1)} | 추가샷%=${pct(avg(rows, (x) => x.m.addedRatio))} | 무빙동기%=${movedRows.length ? pct(avg(movedRows, (x) => x.m.motivCoverage)) : '—'} | 평균클러스터=${avg(rows, (x) => x.m.meanClusterLen).toFixed(1)} | 연결신호%=${connRows.length ? pct(avg(connRows, (x) => x.m.connectSignal)) : '—'}`,
    );
  }

  // ── 부록: 배관 지표 표 ──
  console.log('\n[부록 — 배관 지표]');
  console.log('팔/run | 총샷(대역내) | durSum(런타임편차) | 2~8s밖(비율) | dur[min/med/max] | A목표준수 | 콜 | 시간(s)');
  for (const { key } of ARMS) {
    for (const x of agg[key]) {
      const m = x.m;
      const sanity = x.tgt !== null ? `${m.total}==${x.tgt}${m.total === x.tgt ? '✓' : '✗'}` : '-';
      console.log(
        `${key.padEnd(5)}${x.r} | ${String(m.total).padStart(3)}(${m.inBand ? '예' : '아니오'}) | ${String(m.durSum).padStart(3)}s(${pct(m.runtimeDev).padStart(6)}) | ${m.outOfRange}건(${pct(m.outRatio)}) | ${m.dmin}/${m.dmed}/${m.dmax} | ${sanity.padEnd(9)} | ${x.calls} | ${x.wall.toFixed(1)}`,
      );
    }
  }
  console.log('  ── 팔 평균 ──');
  for (const { key } of ARMS) {
    const rows = agg[key];
    if (!rows.length) continue;
    const inBandN = rows.filter((x) => x.m.inBand).length;
    console.log(
      `  ${key.padEnd(6)} | 런타임편차=${pct(avg(rows, (x) => x.m.runtimeDev))} | 2~8s밖비율=${pct(avg(rows, (x) => x.m.outRatio))} | 대역내 ${inBandN}/${rows.length} | 총샷avg=${avg(rows, (x) => x.m.total).toFixed(1)} | 콜avg=${avg(rows, (x) => x.calls).toFixed(1)} | 시간avg=${avg(rows, (x) => x.wall).toFixed(1)}s`,
    );
  }
}
console.log('');
