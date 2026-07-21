// E1 채점: 원장 위반 ①~④ + 차별점 토큰 생존 ⑤ + M1/M5 — 전부 결정론(코드) 집계.
// 사용: node e1_score.mjs <repo>/logs/writer-stage-exp
import fs from 'node:fs';
import path from 'node:path';

const DIR = process.argv[2] ?? 'logs/writer-stage-exp';

const PRESETS = {
  ad: { locIds: ['location', 'location_2'], locNames: ['새벽 도심 골목', '강변 산책로'], castIds: ['char'], runtime: 30 },
  ledger: { locIds: ['flower_shop', 'alley'], locNames: ['연희꽃집', '골목 어귀'], castIds: ['grandma_yeonhee', 'grandson_mino'], runtime: 45 },
};

const stripFence = (s) => s.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');
const tryParse = (s) => { try { return JSON.parse(stripFence(s)); } catch { return null; } };
const load = (f) => { try { return JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')); } catch { return null; } };

const rows = [];
for (const preset of Object.keys(PRESETS)) {
  const cfg = PRESETS[preset];
  for (const arm of ['A', 'B']) {
    for (let r = 1; r <= 3; r++) {
      const tag = `e1${arm}${r}`;
      const sc = load(`${preset}__scenes__${tag}.json`);
      const ns = load(`${preset}__narrativeStructure__${tag}.json`);
      const sh = load(`${preset}__shotDesign__${tag}.json`);
      if (!sc?.result) { rows.push({ preset, arm, r, missing: true }); continue; }
      const fin = sc.result;

      // ① 로케이션 id 위반 — raw(정규화 전) 기준. llm_calls[0] = scenes 본 호출.
      let rawLocViol = null, rawLocDetail = [];
      const raw = sc.llm_calls?.[0]?.response ? tryParse(sc.llm_calls[0].response) : null;
      if (raw?.scenes) {
        const bad = raw.scenes.map((s) => s.location).filter((l) => !cfg.locIds.includes(l));
        rawLocViol = bad.length; rawLocDetail = [...new Set(bad)];
      }
      // ② new_characters 남발 (두 프리셋 모두 기존 캐스트로 완결되는 스토리 — >0 = 남발)
      const newChars = (fin.new_characters ?? []).length;
      const newCharIds = (fin.new_characters ?? []).map((c) => c.id);
      // ③ cast drop — 원장 인물이 어느 씬에도 안 나옴
      const used = new Set(fin.scenes.flatMap((s) => s.characters_in_scene ?? []));
      const castDrop = cfg.castIds.filter((c) => !used.has(c));
      // ④ V4 미지 character_id 참조
      let unknownShotChars = null, unknownDetail = [];
      if (sh?.result) {
        const known = new Set([...cfg.castIds, ...newCharIds]);
        const refs = [];
        for (const shot of sh.result) {
          for (const b of shot.static_spec?.character_blocking ?? []) refs.push(b.character_id);
          for (const m of shot.dynamic_spec?.character_motion ?? []) refs.push(m.character_id);
          for (const g of shot.dynamic_spec?.gaze_arc ?? []) refs.push(g.character_id);
        }
        const bad = refs.filter((id) => id && !known.has(id));
        unknownShotChars = bad.length; unknownDetail = [...new Set(bad)];
      }
      // M1 / M5
      const m1 = Math.abs((fin.total_estimated_seconds ?? 0) - cfg.runtime) / cfg.runtime;
      const acts = ns?.result?.acts?.map((a) => a.act_id) ?? [];
      const covered = new Set(fin.scenes.map((s) => s.act_ref));
      const uncovered = acts.filter((a) => !covered.has(a));
      // ⑤ 차별점 토큰 (ledger만)
      let tokens = null;
      if (preset === 'ledger') {
        const allActions = fin.scenes.flatMap((s) => s.scene_actions ?? []).join(' ');
        const last = fin.scenes[fin.scenes.length - 1];
        const lastText = (last?.scene_actions ?? []).join(' ');
        const shotText = sh?.result ? JSON.stringify(sh.result) : '';
        tokens = {
          umbrella_scenes: allActions.includes('우산'),
          umbrella_yellow: allActions.includes('노란 우산'),
          ending_umbrella_last_scene: lastText.includes('우산') && (lastText.includes('걸') || lastText.includes('문고리') || lastText.includes('클로즈업')),
          rain_premise: JSON.stringify(fin.scenes.map((s) => [s.weather, s.time_of_day])).match(/비|rain/i) !== null,
          umbrella_in_shots: shotText.includes('우산'),
        };
      }
      rows.push({
        preset, arm, r,
        raw_loc_viol: rawLocViol, raw_loc_detail: rawLocDetail,
        new_chars: newChars, cast_drop: castDrop, unknown_shot_chars: unknownShotChars, unknown_detail: unknownDetail,
        m1_pct: +(m1 * 100).toFixed(1), scenes: fin.scenes.length, total_s: fin.total_estimated_seconds,
        uncovered_acts: uncovered, tokens,
      });
    }
  }
}

console.log(JSON.stringify(rows, null, 1));

// 팔별 합계
for (const preset of Object.keys(PRESETS)) {
  for (const arm of ['A', 'B']) {
    const rs = rows.filter((x) => x.preset === preset && x.arm === arm && !x.missing);
    if (!rs.length) continue;
    const sum = (k) => rs.reduce((a, x) => a + (x[k] ?? 0), 0);
    const viol = sum('raw_loc_viol') + sum('new_chars') + rs.reduce((a, x) => a + x.cast_drop.length, 0) + sum('unknown_shot_chars');
    const tok = rs[0].tokens ? Object.keys(rs[0].tokens).map((k) => `${k}=${rs.filter((x) => x.tokens?.[k]).length}/${rs.length}`).join(' ') : '';
    console.log(`[SUM ${preset}/${arm}] 위반합계=${viol} (loc=${sum('raw_loc_viol')} newch=${sum('new_chars')} drop=${rs.reduce((a, x) => a + x.cast_drop.length, 0)} v4unk=${sum('unknown_shot_chars')}) M1avg=${(rs.reduce((a, x) => a + x.m1_pct, 0) / rs.length).toFixed(1)}% M5위반=${rs.filter((x) => x.uncovered_acts.length).length} ${tok}`);
  }
}
