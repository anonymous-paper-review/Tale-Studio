// E5x 브레드스 집계: 10 프리셋 storyCheck(재정의판) — 클리셰 이슈·CRITICAL 분포.
// 사용: node e5x_score.mjs <repo>/logs/writer-stage-exp
import fs from 'node:fs';
import path from 'node:path';

const DIR = process.argv[2] ?? 'logs/writer-stage-exp';
const PRESETS = ['horror-mansion', 'romance-letter', 'thriller-bomb', 'comedy-cake', 'family-jjigae', 'scifi-signal', 'fantasy-chosen', 'sports-lastlap', 'mv-lastsnow', 'ramen-ad'];

let clicheTotal = 0, criticalTotal = 0;
for (const p of PRESETS) {
  let j;
  try { j = JSON.parse(fs.readFileSync(path.join(DIR, `${p}__storyCheck__e5x1.json`), 'utf8')); } catch { console.log(`${p.padEnd(16)} MISSING`); continue; }
  const r = j.result;
  if (!r) { console.log(`${p.padEnd(16)} ERROR: ${j.error}`); continue; }
  const sev = (s) => r.issues.filter((i) => i.severity === s).length;
  const cliche = r.issues.filter((i) => i.category === 'cliche');
  const crits = r.issues.filter((i) => i.severity === 'CRITICAL');
  clicheTotal += cliche.length; criticalTotal += crits.length;
  console.log(`${p.padEnd(16)} passed=${r.passed} issues=${r.issues.length} [C${sev('CRITICAL')}/W${sev('WARNING')}/I${sev('INFO')}] cliche_cat=${cliche.length} cliche_count=${r.cliche_count}`);
  for (const c of crits) console.log(`  ! CRITICAL ${c.category}/${c.location}: ${c.message.slice(0, 110)}`);
  for (const c of cliche) console.log(`  ✗ CLICHE-ISSUE ${c.severity}/${c.location}: ${c.message.slice(0, 110)}`);
}
console.log(`\n[TOTAL] cliche카테고리 이슈=${clicheTotal} (기준: 0) · CRITICAL=${criticalTotal}`);
