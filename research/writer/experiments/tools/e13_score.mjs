// E13 채점: S1+S3 병합 1콜 vs 현행 2콜 — M5(커버리지), M6(프로브 구조), M1/M2, 원장 지표, M7.
// 병합팔: <preset>__structureScenesMerged__e13m{1,2}.json / 현행팔: 기존 저장 데이터.
// 사용: node e13_score.mjs <repo>/logs/writer-stage-exp
import fs from 'node:fs';
import path from 'node:path';

const DIR = process.argv[2] ?? 'logs/writer-stage-exp';
const load = (f) => { try { return JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')); } catch { return null; } };

const CFG = {
  ad: { rt: 30, locIds: ['location', 'location_2'], cast: ['char'], expectStructure: null },
  ledger: { rt: 45, locIds: ['flower_shop', 'alley'], cast: ['grandma_yeonhee', 'grandson_mino'], expectStructure: null },
  'kishoten-d2': { rt: 30, locIds: ['location'], cast: ['char'], expectStructure: 'kishōtenketsu' },
  'loop-d1': { rt: 15, locIds: ['location'], cast: [], expectStructure: 'circular' },
};

console.log('cell | structure(기대) | 막 | 씬 | M5누락 | M1% | M2중앙 | loc위반 | newch | 시간(s)');
for (const preset of Object.keys(CFG)) {
  const cfg = CFG[preset];
  for (let r = 1; r <= 2; r++) {
    const j = load(`${preset}__structureScenesMerged__e13m${r}.json`);
    if (!j?.result) { console.log(`${preset} m${r} | MISSING${j?.error ? ' ERR' : ''}`); continue; }
    const ns = j.result.narrative_structure, scs = j.result.scenes ?? [];
    const acts = ns?.acts?.map((a) => a.act_id) ?? [];
    const covered = new Set(scs.map((s) => s.act_ref));
    const uncovered = acts.filter((a) => !covered.has(a));
    const total = j.result.total_estimated_seconds ?? 0;
    const m1 = (Math.abs(total - cfg.rt) / cfg.rt * 100).toFixed(1);
    const ratios = scs.map((s) => (s.estimated_seconds ?? 0) / (((s.scene_actions ?? []).length || 1) * 6.5)).sort((a, b) => a - b);
    const m2 = ratios.length ? ratios[Math.floor(ratios.length / 2)].toFixed(2) : '-';
    const locViol = scs.map((s) => s.location).filter((l) => !cfg.locIds.includes(l));
    const structOk = cfg.expectStructure ? (ns?.structure_type?.toLowerCase().includes(cfg.expectStructure.slice(0, 4).toLowerCase()) || ns?.structure_type === cfg.expectStructure) : null;
    console.log(`${preset} m${r} | ${ns?.structure_type}${cfg.expectStructure ? `(기대 ${cfg.expectStructure} ${structOk ? '✓' : '✗'})` : ''} | ${acts.length} | ${scs.length} | ${uncovered.length ? uncovered.join(',') : '0'} | ${m1} | ${m2} | ${locViol.length}${locViol.length ? ' ' + JSON.stringify([...new Set(locViol)]) : ''} | ${(j.result.new_characters ?? []).length} | ${(j.duration_ms / 1000).toFixed(1)}`);
  }
}

// 현행팔 참조치 (기존 데이터): ad/ledger는 e1A1..3 (S1+S3 2콜), 프로브는 run1..3 (S1만 — 구조 정확도용)
console.log('\n[현행팔 참조]');
for (const preset of ['ad', 'ledger']) {
  const cfg = CFG[preset];
  for (let r = 1; r <= 3; r++) {
    const ns = load(`${preset}__narrativeStructure__e1A${r}.json`), sc = load(`${preset}__scenes__e1A${r}.json`);
    if (!ns?.result || !sc?.result) continue;
    const acts = ns.result.acts?.map((a) => a.act_id) ?? [];
    const covered = new Set(sc.result.scenes.map((s) => s.act_ref));
    const uncovered = acts.filter((a) => !covered.has(a));
    const total = sc.result.total_estimated_seconds ?? 0;
    const m1 = (Math.abs(total - cfg.rt) / cfg.rt * 100).toFixed(1);
    const ratios = sc.result.scenes.map((s) => (s.estimated_seconds ?? 0) / (((s.scene_actions ?? []).length || 1) * 6.5)).sort((a, b) => a - b);
    const m2 = ratios[Math.floor(ratios.length / 2)].toFixed(2);
    const t = ((ns.duration_ms + sc.duration_ms) / 1000).toFixed(1);
    console.log(`${preset} e1A${r} | ${ns.result.structure_type} | 막 ${acts.length} | 씬 ${sc.result.scenes.length} | M5누락 ${uncovered.length} | M1 ${m1}% | M2중앙 ${m2} | 2콜시간 ${t}s`);
  }
}
for (const preset of ['kishoten-d2', 'loop-d1']) {
  for (let r = 1; r <= 3; r++) {
    const ns = load(`${preset}__narrativeStructure__run${r}.json`);
    if (!ns?.result) continue;
    console.log(`${preset} run${r} | ${ns.result.structure_type} | 막 ${ns.result.acts?.length}`);
  }
}
