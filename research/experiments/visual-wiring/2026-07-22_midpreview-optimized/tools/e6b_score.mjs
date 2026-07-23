// E6b 채점: v0(visualIdentity) 3열(꺼짐/현행 켜짐/최적화판) 비교 — 매체 일관성·표준 단어 이탈·스타일 수렴·시간.
// "표준 단어 이탈" 판정: 필드 값에 공백이 하나라도 있으면 문장형 이탈로 본다(스네이크케이스 토큰은 공백이 없다).
// 사용: node research/experiments/visual-wiring/2026-07-22_midpreview-optimized/tools/e6b_score.mjs [logs/writer-stage-exp]
import fs from 'node:fs';
import path from 'node:path';

const DIR = process.argv[2] ?? 'logs/writer-stage-exp';
const load = (f) => { try { return JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')); } catch { return null; } };

const FIELDS = [
  ['format', 'medium'], ['format', 'rendering_method'],
  ['style', 'art_style'], ['style', 'shape_language'], ['style', 'line_quality'],
  ['style', 'character_proportion'], ['style', 'texture_philosophy'],
];

const isSentence = (v) => typeof v === 'string' && /\s/.test(v);

const arms = {
  '꺼짐(off)': 'e6off',
  '현행 켜짐(on, v1)': 'e6on',
  '최적화판(v2, e6b)': 'e6bon',
};

for (const preset of ['ad', 'horror-mansion']) {
  console.log(`\n═══ ${preset} ═══`);
  for (const [label, suffix] of Object.entries(arms)) {
    const runs = [1, 2].map((n) => load(`${preset}__visualIdentity__${suffix}${n}.json`));
    if (runs.some((r) => !r)) { console.log(`${label}: MISSING`); continue; }
    const media = runs.map((r) => r.result.format.medium);
    const styles = runs.map((r) => r.result.style.art_style);
    let violations = 0;
    const details = [];
    for (const r of runs) {
      for (const [a, b] of FIELDS) {
        const v = r.result[a][b];
        if (isSentence(v)) { violations++; details.push(v); }
      }
    }
    const mediumStable = media[0] === media[1];
    const styleConverged = styles[0] === styles[1];
    console.log(`${label}: medium=[${media.join(' / ')}] stable=${mediumStable}  style=[${styles.join(' / ')}] converged=${styleConverged}  이탈=${violations}/14`);
    if (details.length) console.log(`   이탈 필드 값: ${details.map((d) => `"${d}"`).join(' | ')}`);
  }
}
