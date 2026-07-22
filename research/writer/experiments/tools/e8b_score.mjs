// E8b 채점: v1 arc 주입 유/무 상태에서, V3 산출(palette_emphasis)이 실제 세계 팔레트(v2 실산출,
// worldVisual.global_palette)를 벗어나는지 검사. ①팔레트 준수(hue 이탈률) + ②E8 진행 지표 유지(막간
// 색온도 격차·팔레트 다양성) 를 함께 낸다.
// 사용: node e8b_score.mjs <repo>/logs/writer-stage-exp
import fs from 'node:fs';
import path from 'node:path';

const DIR = process.argv[2] ?? 'logs/writer-stage-exp';
const load = (f) => { try { return JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')); } catch { return null; } };

// ── hex → HSL (hue: 0~360, sat: 0~1) ──
function hexToHsl(hex) {
  const m = /^#?([0-9a-fA-F]{6})$/.exec((hex ?? '').trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  let h;
  switch (max) {
    case r: h = ((g - b) / d) % 6; break;
    case g: h = (b - r) / d + 2; break;
    default: h = (r - g) / d + 4; break;
  }
  h = h * 60;
  if (h < 0) h += 360;
  return { h, s, l };
}

// 원형 hue 최소각 차이
const hueDist = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };

const NEUTRAL_SAT = 0.15; // HSL 채도 <15% = 무채색(중립, 별도 집계) — 씬 palette_emphasis 색 판정용(사전 기준)
const CONFORM_DEG = 30;   // ±30° 이내 = 팔레트 내 변주

// worldPalette: {primary, secondary, accent, forbidden} (hex 문자열) → hue 앵커 배열.
// 방법 결정: 앵커(세계 팔레트 자체)는 완전 무채색(s=0, RGB 동일값 — hue가 정의 자체가 안 되는 경우)일
// 때만 제외한다. 씬 색에 적용하는 <15% 중립 기준을 앵커에도 그대로 적용하면, 저채도 슬레이트/세이지
// 계열처럼 세계 팔레트가 의도적으로 고른 무드톤 색까지 앵커에서 빠져 최근접 비교가 왜곡된다(사전 기준
// 문구는 "씬 색"의 중립 집계만 명시했다 — 앵커 배제 기준은 아님).
function paletteAnchors(worldPalette) {
  if (!worldPalette) return [];
  const keys = ['primary', 'secondary', 'accent'];
  const anchors = [];
  for (const k of keys) {
    const hsl = hexToHsl(worldPalette[k]);
    if (hsl && hsl.s > 0) anchors.push({ key: k, hex: worldPalette[k], h: hsl.h });
  }
  return anchors;
}

// 씬 palette_emphasis 색 1개를 세계 팔레트 앵커들과 대조 → 'neutral' | 'conform' | 'deviate' | 'undetermined'
function classifyColor(hex, anchors) {
  const hsl = hexToHsl(hex);
  if (!hsl) return { verdict: 'unparsed', hex };
  if (hsl.s < NEUTRAL_SAT) return { verdict: 'neutral', hex };
  if (anchors.length === 0) return { verdict: 'undetermined', hex };
  let best = null;
  for (const a of anchors) {
    const d = hueDist(hsl.h, a.h);
    if (!best || d < best.dist) best = { dist: d, anchor: a.key, anchorHex: a.hex };
  }
  return { verdict: best.dist <= CONFORM_DEG ? 'conform' : 'deviate', hex, ...best };
}

const PRESETS = ['kishoten', 'family-jjigae'];
const ARMS = ['ctl', 'arc'];

// 팔 단위(ctl/arc) 누적 집계 — 프리셋·run 전체를 합쳐 이탈률을 낸다(사전 판정 기준 대상).
const armAgg = { ctl: { neutral: 0, conform: 0, deviate: 0, undetermined: 0, unparsed: 0, deviateExamples: [] },
                 arc: { neutral: 0, conform: 0, deviate: 0, undetermined: 0, unparsed: 0, deviateExamples: [] } };

for (const preset of PRESETS) {
  console.log(`\n═══ ${preset} ═══`);
  console.log('cell  | plans | 막수 | 막평균 K (start~end) | 막간 K 격차 | 팔레트 고유수(전체/막당평균) | V3시간(s) | 팔레트 준수(conform/deviate/neutral)');
  for (const arm of ARMS) {
    for (let r = 1; r <= 2; r++) {
      const sc = load(`${preset}__scenes__e8b${arm}${r}.json`);
      const v2 = load(`${preset}__v2Design__e8b${arm}${r}.json`);
      const v3 = load(`${preset}__sceneCinematography__e8b${arm}${r}.json`);
      if (!sc?.result || !v2?.result || !v3?.result) { console.log(`${arm}${r}  | MISSING (sc=${!!sc} v2=${!!v2} v3=${!!v3})`); continue; }

      const actByScene = new Map(sc.result.scenes.map((s) => [s.scene_id, s.act_ref]));
      const plans = v3.result.scene_plans ?? [];
      const worldPalette = v2.result.worldVisual?.global_palette;
      const anchors = paletteAnchors(worldPalette);

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

      // ① 팔레트 준수 분류 — 이 run의 모든 scene palette_emphasis 색
      const cellCounts = { neutral: 0, conform: 0, deviate: 0, undetermined: 0, unparsed: 0 };
      const cellDeviates = [];
      for (const p of plans) {
        for (const hex of p.palette_emphasis ?? []) {
          const cls = classifyColor(hex, anchors);
          cellCounts[cls.verdict] = (cellCounts[cls.verdict] ?? 0) + 1;
          armAgg[arm][cls.verdict] = (armAgg[arm][cls.verdict] ?? 0) + 1;
          if (cls.verdict === 'deviate') {
            cellDeviates.push(`${p.scene_id}:${hex}(최근접 ${cls.anchor}=${cls.anchorHex}, ${Math.round(cls.dist)}°)`);
            armAgg[arm].deviateExamples.push(`[${preset}/${arm}${r}] ${p.scene_id}:${hex} → 최근접 ${cls.anchor}=${cls.anchorHex} (${Math.round(cls.dist)}°, world=${JSON.stringify(worldPalette)})`);
          }
        }
      }
      const palStr = `${cellCounts.conform}/${cellCounts.deviate}/${cellCounts.neutral}`;
      console.log(`${arm}${r}  | ${String(plans.length).padStart(5)} | ${actMeans.length}    | ${meansStr} | ${Math.round(kSpread)}K | ${allPal.size}/${avgActPal} | ${secs} | ${palStr}  world=${JSON.stringify(worldPalette)}`);
      if (cellDeviates.length) console.log(`      이탈: ${cellDeviates.join(' | ')}`);
    }
  }
}

console.log('\n═══ 팔별 이탈률 종합 (전 프리셋 × 2run 합산) ═══');
for (const arm of ARMS) {
  const a = armAgg[arm];
  const denom = a.conform + a.deviate; // 무채색/무판정 제외
  const rate = denom > 0 ? (100 * a.deviate / denom).toFixed(1) : 'N/A';
  console.log(`${arm}: conform=${a.conform} deviate=${a.deviate} neutral=${a.neutral} undetermined=${a.undetermined} unparsed=${a.unparsed} → 이탈률=${rate}%`);
}
console.log('\n═══ 이탈 색 상세 (arc팔) ═══');
armAgg.arc.deviateExamples.forEach((s) => console.log(`  ${s}`));
console.log('\n═══ 이탈 색 상세 (ctl팔) ═══');
armAgg.ctl.deviateExamples.forEach((s) => console.log(`  ${s}`));
