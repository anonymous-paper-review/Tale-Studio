// E13b 채점: S1+S3 병합 정식 스테이지(후처리 이관) 재검증.
//   병합 정식팔 파일: <preset>__structureScenesMergedFormal__e13b{r}.json
//     result 형태: { narrativeStructure:{...}, scenes:{ scenes:[...], total_estimated_seconds, new_characters, coverage_mode } }
//   참조: E13 근사판(<preset>__structureScenesMerged__e13m{1,2}.json) · 현행 2콜(e1A/run 기존 데이터)
// 사용: node e13b_score.mjs <repo>/logs/writer-stage-exp
import fs from 'node:fs';
import path from 'node:path';

const DIR = process.argv[2] ?? 'logs/writer-stage-exp';
const load = (f) => { try { return JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')); } catch { return null; } };
const SPA = 6.5; // 액션 1개 기준 화면 초 (budget.ts secondsPerAction)

// preset → { runtime, 기존 로케이션 id, 기존 캐스트 slug, 기대 구조(프로브만), 병합 run 수 }
const CFG = {
  ad: { rt: 30, locIds: ['location', 'location_2'], cast: ['char'], expectStructure: null, runs: 5 },
  ledger: { rt: 45, locIds: ['flower_shop', 'alley'], cast: ['grandma_yeonhee', 'grandson_mino'], expectStructure: null, runs: 2 },
  'kishoten-d2': { rt: 30, locIds: ['location'], cast: ['char'], expectStructure: 'kishōtenketsu', runs: 2 },
  'loop-d1': { rt: 15, locIds: ['location'], cast: [], expectStructure: 'circular', runs: 2 },
};

const structOk = (type, expect) => {
  if (!expect) return null;
  const t = (type ?? '').toLowerCase();
  if (expect === 'kishōtenketsu') return t.includes('kish') || t.includes('기승');
  if (expect === 'circular') return t.includes('circ') || t.includes('순환') || t.includes('loop');
  return t === expect.toLowerCase();
};

// 오염 패턴: "head (…)" 또는 "head: …" 에서 head 가 기존 id — 정규화가 되돌렸어야 함(0이어야).
const pollutionHits = (locs, ids) => locs.filter((l) => {
  if (typeof l !== 'string') return false;
  const head = l.split(/\s*[(:]/)[0].trim();
  return head !== l && ids.includes(head);
});

const rows = [];
console.log('=== 병합 정식팔 (E13b) ===');
console.log('cell | structure(기대) | 막 | 씬 | ①막누락 | ②오염 | locViol | ③구조 | M1% | M2중앙 | ⑤newch | 콜수 | 시간(s)');
for (const preset of Object.keys(CFG)) {
  const cfg = CFG[preset];
  for (let r = 1; r <= cfg.runs; r++) {
    const j = load(`${preset}__structureScenesMergedFormal__e13b${r}.json`);
    if (!j) { console.log(`${preset} e13b${r} | MISSING`); continue; }
    if (j.error || !j.result) { console.log(`${preset} e13b${r} | ERROR ${j.error ?? '(no result)'}`); continue; }
    const ns = j.result.narrativeStructure, scObj = j.result.scenes ?? {};
    const scs = scObj.scenes ?? [];
    const acts = ns?.acts?.map((a) => a.act_id) ?? [];
    const covered = new Set(scs.map((s) => s.act_ref));
    const uncovered = acts.filter((a) => !covered.has(a));
    const total = scObj.total_estimated_seconds ?? 0;
    const m1 = (Math.abs(total - cfg.rt) / cfg.rt * 100);
    const ratios = scs.map((s) => (s.estimated_seconds ?? 0) / (((s.scene_actions ?? []).length || 1) * SPA)).sort((a, b) => a - b);
    const m2 = ratios.length ? ratios[Math.floor(ratios.length / 2)] : null;
    const locs = scs.map((s) => s.location);
    const pollute = pollutionHits(locs, cfg.locIds);
    const locViol = [...new Set(locs.filter((l) => !cfg.locIds.includes(l)))];
    const ok = structOk(ns?.structure_type, cfg.expectStructure);
    const nCalls = (j.llm_calls ?? []).length;
    const secs = (j.duration_ms / 1000);
    rows.push({ preset, r, structure: ns?.structure_type, acts: acts.length, scenes: scs.length, uncovered: uncovered.length, pollute: pollute.length, locViol: locViol.length, ok, m1, m2, newch: (scObj.new_characters ?? []).length, nCalls, secs, coverage_mode: scObj.coverage_mode });
    console.log(`${preset} e13b${r} | ${ns?.structure_type}${cfg.expectStructure ? `(기대 ${cfg.expectStructure})` : ''} | ${acts.length} | ${scs.length} | ${uncovered.length ? uncovered.join(',') : '0'} | ${pollute.length}${pollute.length ? ' ' + JSON.stringify(pollute) : ''} | ${locViol.length}${locViol.length ? ' ' + JSON.stringify(locViol) : ''} | ${ok === null ? '-' : ok ? '✓' : '✗'} | ${m1.toFixed(1)} | ${m2 === null ? '-' : m2.toFixed(2)} | ${(scObj.new_characters ?? []).length} | ${nCalls} | ${secs.toFixed(1)}`);
  }
}

// ── 사전 판정 기준 집계 ──
const battery8 = rows.filter((x) => (x.preset === 'ad' ? x.r <= 2 : true)); // ①②는 8회 배터리(ad는 2회만 포함)
const allFormal = rows;
const uncoveredZero = battery8.every((x) => x.uncovered === 0);
const polluteZero = battery8.every((x) => x.pollute === 0);
const probeRows = rows.filter((x) => x.ok !== null);
const probeAllOk = probeRows.every((x) => x.ok === true);
const formalMedianSecs = allFormal.length ? [...allFormal.map((x) => x.secs)].sort((a, b) => a - b)[Math.floor(allFormal.length / 2)] : null;
const formalMeanSecs = allFormal.length ? allFormal.reduce((s, x) => s + x.secs, 0) / allFormal.length : null;

console.log('\n=== 사전 판정 기준 집계 ===');
console.log(`① 막 커버리지 누락 (8회 배터리): ${battery8.filter((x) => x.uncovered > 0).length} 위반 / ${battery8.length}  → ${uncoveredZero ? '통과(0)' : '미달'}`);
console.log(`② 장소 표기 오염 (8회 배터리): ${battery8.filter((x) => x.pollute > 0).length} 오염 / ${battery8.length}  → ${polluteZero ? '통과(0)' : '미달'}`);
console.log(`③ 구조 프로브 정답: ${probeRows.filter((x) => x.ok).length}/${probeRows.length}  → ${probeAllOk ? '통과' : '미달'}`);
console.log(`병합 정식팔 시간: 평균 ${formalMeanSecs?.toFixed(1)}s · 중앙 ${formalMedianSecs?.toFixed(1)}s (n=${allFormal.length})`);
console.log(`⑦ ad 구조 분포 (5회): ${rows.filter((x) => x.preset === 'ad').map((x) => x.structure).join(' / ')}`);
console.log(`repair 발동(콜>1): ${rows.filter((x) => x.nCalls > 1).map((x) => `${x.preset}e13b${x.r}(${x.nCalls})`).join(', ') || '없음'}`);

// ── 참조: E13 근사판 (e13m1/2) ──
console.log('\n=== [참조] E13 근사판 (후처리 없음) ===');
for (const preset of Object.keys(CFG)) {
  const cfg = CFG[preset];
  for (let r = 1; r <= 2; r++) {
    const j = load(`${preset}__structureScenesMerged__e13m${r}.json`);
    if (!j?.result) continue;
    const ns = j.result.narrative_structure, scs = j.result.scenes ?? [];
    const acts = ns?.acts?.map((a) => a.act_id) ?? [];
    const covered = new Set(scs.map((s) => s.act_ref));
    const uncovered = acts.filter((a) => !covered.has(a));
    const locs = scs.map((s) => s.location);
    const pollute = pollutionHits(locs, cfg.locIds);
    const locViol = [...new Set(locs.filter((l) => !cfg.locIds.includes(l)))];
    console.log(`${preset} e13m${r} | ${ns?.structure_type} | 막 ${acts.length} | 씬 ${scs.length} | ①${uncovered.length} | ②오염 ${pollute.length}${pollute.length ? ' ' + JSON.stringify(pollute) : ''} | locViol ${locViol.length}${locViol.length ? ' ' + JSON.stringify(locViol) : ''} | ${(j.duration_ms / 1000).toFixed(1)}s`);
  }
}

// ── 참조: 현행 2콜 (ad/ledger=e1A, 프로브=run narrativeStructure만) ──
console.log('\n=== [참조] 현행 2콜 ===');
for (const preset of ['ad', 'ledger']) {
  const cfg = CFG[preset];
  for (let r = 1; r <= 3; r++) {
    const ns = load(`${preset}__narrativeStructure__e1A${r}.json`), sc = load(`${preset}__scenes__e1A${r}.json`);
    if (!ns?.result || !sc?.result) continue;
    const acts = ns.result.acts?.map((a) => a.act_id) ?? [];
    const covered = new Set(sc.result.scenes.map((s) => s.act_ref));
    const uncovered = acts.filter((a) => !covered.has(a));
    const total = sc.result.total_estimated_seconds ?? 0;
    const m1 = (Math.abs(total - cfg.rt) / cfg.rt * 100);
    const ratios = sc.result.scenes.map((s) => (s.estimated_seconds ?? 0) / (((s.scene_actions ?? []).length || 1) * SPA)).sort((a, b) => a - b);
    const m2 = ratios[Math.floor(ratios.length / 2)];
    const t = ((ns.duration_ms + sc.duration_ms) / 1000);
    console.log(`${preset} e1A${r} | ${ns.result.structure_type} | 막 ${acts.length} | 씬 ${sc.result.scenes.length} | ①${uncovered.length} | M1 ${m1.toFixed(1)}% | M2중앙 ${m2.toFixed(2)} | 2콜시간 ${t.toFixed(1)}s`);
  }
}
for (const preset of ['kishoten-d2', 'loop-d1']) {
  const cfg = CFG[preset];
  for (let r = 1; r <= 3; r++) {
    const ns = load(`${preset}__narrativeStructure__run${r}.json`);
    if (!ns?.result) continue;
    console.log(`${preset} run${r} | ${ns.result.structure_type} (기대 ${cfg.expectStructure}) | 막 ${ns.result.acts?.length}`);
  }
}
