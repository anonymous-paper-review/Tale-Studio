// E8 채점: v1 arc 주입 유/무 — V3 산출의 막별 시각 분산(막 평균 색온도 격차·팔레트 다양성) 비교.
// 사용: node e8_score.mjs <repo>/logs/writer-stage-exp
import fs from 'node:fs';
import path from 'node:path';

const DIR = process.argv[2] ?? 'logs/writer-stage-exp';
const load = (f) => { try { return JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')); } catch { return null; } };

for (const preset of ['kishoten', 'family-jjigae']) {
  console.log(`\n═══ ${preset} ═══`);
  console.log('cell  | plans | 막수 | 막평균 K (start~end) | 막간 K 격차 | 팔레트 고유수(전체/막당평균) | V3시간(s)');
  for (const arm of ['ctl', 'arc']) {
    for (let r = 1; r <= 2; r++) {
      const sc = load(`${preset}__scenes__e8${arm}${r}.json`);
      const v3 = load(`${preset}__sceneCinematography__e8${arm}${r}.json`);
      if (!sc?.result || !v3?.result) { console.log(`${arm}${r}  | MISSING`); continue; }
      const actByScene = new Map(sc.result.scenes.map((s) => [s.scene_id, s.act_ref]));
      const plans = v3.result.scene_plans ?? [];
      const byAct = new Map();
      for (const p of plans) {
        const act = actByScene.get(p.scene_id) ?? '?';
        if (!byAct.has(act)) byAct.set(act, []);
        byAct.get(act).push(p);
      }
      const actMeans = [...byAct.entries()].map(([act, ps]) => {
        const ks = ps.flatMap((p) => [p.lighting_arc?.start_K, p.lighting_arc?.end_K]).filter((k) => typeof k === 'number');
        return { act, meanK: ks.length ? ks.reduce((a, b) => a + b, 0) / ks.length : NaN, n: ps.length };
      }).filter((a) => !Number.isNaN(a.meanK));
      const kSpread = actMeans.length ? Math.max(...actMeans.map((a) => a.meanK)) - Math.min(...actMeans.map((a) => a.meanK)) : 0;
      const allPal = new Set(plans.flatMap((p) => p.palette_emphasis ?? []));
      const perActPal = [...byAct.values()].map((ps) => new Set(ps.flatMap((p) => p.palette_emphasis ?? [])).size);
      const avgActPal = perActPal.length ? (perActPal.reduce((a, b) => a + b, 0) / perActPal.length).toFixed(1) : '-';
      const secs = (v3.duration_ms / 1000).toFixed(1);
      const meansStr = actMeans.map((a) => `${a.act}:${Math.round(a.meanK)}K`).join(' ');
      console.log(`${arm}${r}  | ${String(plans.length).padStart(5)} | ${actMeans.length}    | ${meansStr} | ${Math.round(kSpread)}K | ${allPal.size}/${avgActPal} | ${secs}`);
    }
  }
  // v1 콜 비용 (제거 팔 판단용)
  for (const arm of ['ctl', 'arc']) {
    for (let r = 1; r <= 2; r++) {
      const v1 = load(`${preset}__actVisualArc__e8${arm}${r}.json`);
      if (v1) console.log(`  [v1 비용 ${arm}${r}] ${(v1.duration_ms / 1000).toFixed(1)}s acts=${v1.result?.acts?.length}`);
    }
  }
}
