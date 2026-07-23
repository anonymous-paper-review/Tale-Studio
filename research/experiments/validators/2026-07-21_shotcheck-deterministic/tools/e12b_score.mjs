// E12b 채점: C2 Step1(LLM 조립) 유/무 A/B — 렌더 필드 충실도(L4 원본 대비)·메타 채움률·이슈 비교.
// 사용: node e12b_score.mjs <repo>/logs/writer-stage-exp
import fs from 'node:fs';
import path from 'node:path';

const DIR = process.argv[2] ?? 'logs/writer-stage-exp';
const load = (f) => { try { return JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')); } catch { return null; } };

for (const preset of ['ad', 'ledger']) {
  const src = load(`${preset}__shotDesign__e1A1.json`); // 주입한 L4 원본 (진실)
  if (!src?.result) { console.log(`${preset}: L4 원본 없음`); continue; }
  const l4 = src.result;
  console.log(`\n═══ ${preset} (L4 원본 ${l4.length}샷) ═══`);
  console.log('cell | 샷수 | dur합 | passed | issues C/W/I | split | 렌더변조(ff/motion/dur) | hook채움 | motif | carry | 시간(s)');

  for (const cell of ['A1', 'A2', 'B1', 'B2']) {
    const j = load(`${preset}__shotCheck__e12b${cell}.json`);
    if (!j?.result) { console.log(`${cell}  | MISSING${j?.error ? ' ERR=' + String(j.error).slice(0, 60) : ''}`); continue; }
    const seq = j.result.shotSequence, rep = j.result.report;
    const shots = seq.shots;
    const sev = (s) => rep.issues.filter((i) => i.severity === s).length;

    // 렌더 필드 충실도: split 없을 때만 index 정렬 비교 가능 (split 있으면 표기)
    let ffMut = '-', moMut = '-', durMut = '-';
    if (shots.length === l4.length) {
      let ff = 0, mo = 0, du = 0;
      for (let i = 0; i < l4.length; i++) {
        if (shots[i].first_frame_generation?.composition_prompt !== l4[i].static_spec.first_frame_prompt) ff++;
        if (shots[i].video_generation?.motion_prompt !== l4[i].dynamic_spec.motion_prompt) mo++;
        if (shots[i].duration_seconds !== l4[i].intent.duration_seconds) du++;
      }
      ffMut = ff; moMut = mo; durMut = du;
    }
    const hook = shots.filter((s) => s.C?.hook_type).length;
    const motif = shots.filter((s) => s.C?.motif_active).length;
    const carry = shots.filter((s) => s.continuity?.carry_forward_from).length;
    const secs = (j.duration_ms / 1000).toFixed(1);
    console.log(`${cell}   | ${String(shots.length).padStart(3)} | ${String(seq.total_duration_seconds).padStart(5)} | ${String(rep.passed).padEnd(5)} | ${sev('CRITICAL')}/${sev('WARNING')}/${sev('INFO')} | ${rep.shots_split_count} | ${ffMut}/${moMut}/${durMut} | ${hook}/${shots.length} | ${motif}/${shots.length} | ${carry}/${shots.length} | ${secs}`);
  }

  // A팔 렌더 변조 상세 (있으면): A1 기준 어떤 샷의 프롬프트가 L4와 다른지 앞부분 대조
  const a1 = load(`${preset}__shotCheck__e12bA1.json`);
  if (a1?.result && a1.result.shotSequence.shots.length === l4.length) {
    const shots = a1.result.shotSequence.shots;
    for (let i = 0; i < l4.length; i++) {
      const got = shots[i].video_generation?.motion_prompt, want = l4[i].dynamic_spec.motion_prompt;
      if (got !== want) console.log(`  [A1 motion 변조] shot#${i + 1}\n    L4: ${want}\n    A1: ${got}`);
    }
  }
}
