// E9 채점: 2단(V3→decoupage) vs 흡수형(Compact 단독) — 샷 규율(M3)·target 준수·시간(M7).
// 사용: node e9_score.mjs <repo>/logs/writer-stage-exp
import fs from 'node:fs';
import path from 'node:path';

const DIR = process.argv[2] ?? 'logs/writer-stage-exp';
const load = (f) => { try { return JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')); } catch { return null; } };

for (const preset of ['ad', 'kishoten']) {
  console.log(`\n═══ ${preset} ═══`);
  console.log('cell | 총샷 | added | dur[min/med/max] | 2~8s밖 | target준수(총샷 vs V3목표) | 시간(s: V3+dec)');
  for (const arm of ['a', 'b']) {
    for (let r = 1; r <= 2; r++) {
      const dec = load(`${preset}__${arm === 'a' ? 'decoupagePlanned' : 'decoupage'}__e9${arm}${r}.json`);
      if (!dec?.result) { console.log(`${arm}${r}  | MISSING`); continue; }
      const durs = dec.result.scenes.flatMap((s) => s.shots.map((x) => x.intended_duration_seconds)).sort((x, y) => x - y);
      const out = durs.filter((d) => d < 2 || d > 8).length;
      const med = durs[Math.floor(durs.length / 2)];
      let target = '-', tSum = (dec.duration_ms / 1000);
      if (arm === 'a') {
        const v3 = load(`${preset}__sceneCinematography__e9a${r}.json`);
        if (v3?.result) { target = `${dec.result.total_shots} vs ${v3.result.shot_count_total}`; tSum += v3.duration_ms / 1000; }
      }
      console.log(`${arm}${r}  | ${String(dec.result.total_shots).padStart(3)} | ${String(dec.result.total_added).padStart(4)} | ${durs[0]}/${med}/${durs[durs.length - 1]} | ${out} | ${target} | ${tSum.toFixed(1)}`);
    }
  }
}
