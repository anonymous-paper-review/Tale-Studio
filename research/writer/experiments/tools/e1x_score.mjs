// E1x 브레드스 채점: 10 프리셋 × A/B (S1→S3, 각 1 run) — 원장 위반 쌍대 비교.
// 사용: node e1x_score.mjs <repo>/logs/writer-stage-exp
import fs from 'node:fs';
import path from 'node:path';

const DIR = process.argv[2] ?? 'logs/writer-stage-exp';

// extras: 스토리에 명시/함의된 집단·단역 — new_characters로 나와도 남발이 아님 (name/id 부분일치).
const P = {
  'horror-mansion': { loc: ['mansion_hall', 'mirror_room'], cast: ['youtuber_jiwoo', 'ghost_woman'], rt: 60, prop: '카메라', ending: ['카메라'], extras: [] },
  'romance-letter': { loc: ['cafe_dohyun', 'rainy_street'], cast: ['sua', 'dohyun'], rt: 90, prop: '편지', ending: ['우산', '뛰'], extras: [] },
  'thriller-bomb': { loc: ['subway_locker', 'control_room'], cast: ['detective_kangjun', 'hacker_yuna'], rt: 90, prop: '빨간', ending: ['타이머'], extras: [] },
  'comedy-cake': { loc: ['pantry', 'office_floor'], cast: ['intern_bomi', 'manager_park'], rt: 60, prop: '케이크', ending: ['크림'], extras: ['직원', '동료', '사원'] },
  'family-jjigae': { loc: ['countryside_kitchen', 'family_table'], cast: ['son_taeho', 'father_mansu'], rt: 120, prop: '찌개', ending: ['찌개', '잘 먹겠습니다'], extras: [] },
  'scifi-signal': { loc: ['observatory', 'antenna_field'], cast: ['researcher_harin', 'captain_voice'], rt: 90, prop: '신호', ending: ['송신', '버튼'], extras: [] },
  'fantasy-chosen': { loc: ['village_square', 'north_hill'], cast: ['boy_onyu', 'elder_cheon'], rt: 120, prop: '검', ending: ['용', '실루엣', '탑'], extras: ['마을', '주민', '용', 'villager', 'dragon'] },
  'sports-lastlap': { loc: ['ice_rink', 'stands'], cast: ['skater_seojin', 'coach_miran'], rt: 60, prop: '결승선', ending: ['주저앉', '울', '우는'], extras: ['선수', '관중', '심판', 'skater', 'referee'] },
  'mv-lastsnow': { loc: ['snow_alley', 'bungeoppang_stall'], cast: ['hana', 'ex_lover'], rt: 75, prop: '붕어빵', ending: ['눈이 쌓', '벤치', '타임랩스'], extras: ['주인', '상인', '노점'] },
  'ramen-ad': { loc: ['convenience_store', 'window_counter'], cast: ['worker_minjae'], rt: 30, prop: '불꽃라면', ending: ['용기', '클로즈업', '김'], extras: ['점원', '알바', 'clerk'] },
};

const load = (f) => { try { return JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')); } catch { return null; } };
const stripFence = (s) => s.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');
const rawLocations = (resp) => {
  try { const j = JSON.parse(stripFence(resp)); return j.scenes.map((s) => s.location); }
  catch { return [...resp.matchAll(/"location"\s*:\s*"([^"]*)"/g)].map((m) => m[1]); } // 잉여문자 폴백
};

const rows = [];
for (const preset of Object.keys(P)) {
  const cfg = P[preset];
  for (const arm of ['A', 'B']) {
    const sc = load(`${preset}__scenes__e1x${arm}.json`);
    const ns = load(`${preset}__narrativeStructure__e1x${arm}.json`);
    if (!sc?.result) { rows.push({ preset, arm, missing: true }); continue; }
    const fin = sc.result;

    const rawLocs = sc.llm_calls?.[0]?.response ? rawLocations(sc.llm_calls[0].response) : [];
    const locViol = rawLocs.filter((l) => !cfg.loc.includes(l));
    const nc = fin.new_characters ?? [];
    const grounded = (c) => cfg.extras.some((t) => (c.name ?? '').includes(t) || (c.id ?? '').includes(t));
    const invented = nc.filter((c) => !grounded(c));
    const used = new Set(fin.scenes.flatMap((s) => s.characters_in_scene ?? []));
    const castDrop = cfg.cast.filter((c) => !used.has(c));
    const m1 = Math.abs((fin.total_estimated_seconds ?? 0) - cfg.rt) / cfg.rt;
    const acts = ns?.result?.acts?.map((a) => a.act_id) ?? [];
    const covered = new Set(fin.scenes.map((s) => s.act_ref));
    const uncovered = acts.filter((a) => !covered.has(a));
    const allActions = fin.scenes.flatMap((s) => s.scene_actions ?? []).join(' ');
    const lastText = (fin.scenes[fin.scenes.length - 1]?.scene_actions ?? []).join(' ');
    const propOk = allActions.includes(cfg.prop);
    const endingOk = cfg.ending.some((t) => lastText.includes(t));

    rows.push({
      preset, arm, scenes: fin.scenes.length, total_s: fin.total_estimated_seconds,
      loc_viol: locViol.length, loc_detail: [...new Set(locViol)],
      new_chars: nc.length, invented: invented.length, invented_names: invented.map((c) => c.id),
      cast_drop: castDrop, m1_pct: +(m1 * 100).toFixed(1), uncovered_acts: uncovered,
      prop_ok: propOk, ending_ok: endingOk,
    });
  }
}

// 쌍대 비교표
console.log('preset                | arm | 씬 | loc위반 | 발명인물 | drop | prop | ending | M1% | M5');
for (const r of rows) {
  if (r.missing) { console.log(`${r.preset.padEnd(21)} | ${r.arm}  | MISSING`); continue; }
  console.log(`${r.preset.padEnd(21)} | ${r.arm}  | ${String(r.scenes).padStart(2)} | ${String(r.loc_viol).padStart(7)} | ${String(r.invented).padStart(8)} | ${String(r.cast_drop.length).padStart(4)} | ${r.prop_ok ? '  ✓ ' : '  ✗ '} | ${r.ending_ok ? '  ✓   ' : '  ✗   '} | ${String(r.m1_pct).padStart(4)} | ${r.uncovered_acts.length}`);
}
const tot = (arm, k) => rows.filter((r) => r.arm === arm && !r.missing).reduce((a, r) => a + (typeof r[k] === 'number' ? r[k] : r[k]?.length ?? 0), 0);
const tokOk = (arm, k) => rows.filter((r) => r.arm === arm && !r.missing && r[k]).length;
for (const arm of ['A', 'B']) {
  console.log(`[TOTAL ${arm}] loc위반=${tot(arm, 'loc_viol')} 발명인물=${tot(arm, 'invented')} drop=${tot(arm, 'cast_drop')} | prop생존=${tokOk(arm, 'prop_ok')}/10 ending생존=${tokOk(arm, 'ending_ok')}/10 | M5위반런=${rows.filter((r) => r.arm === arm && !r.missing && r.uncovered_acts.length).length}`);
}
// 상세 (위반 있는 행만)
for (const r of rows) {
  if (r.missing) continue;
  if (r.loc_viol || r.invented || r.cast_drop.length) {
    console.log(`[DETAIL ${r.preset}/${r.arm}] loc=${JSON.stringify(r.loc_detail)} invented=${JSON.stringify(r.invented_names)} drop=${JSON.stringify(r.cast_drop)}`);
  }
}
