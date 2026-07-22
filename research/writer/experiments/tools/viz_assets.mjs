// 결과 문서용 시각 자료 생성 (결정론 — LLM 호출 없음, 원시 로그를 그대로 읽어 SVG로 그린다).
// 사용: node viz_assets.mjs [<repo>/logs/writer-stage-exp]
// 출력: results/assets/{e8b,e9b,e13b}/*.svg
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOG_DIR = process.argv[2] ?? path.join(__dirname, '../../../../logs/writer-stage-exp');
const OUT_ROOT = path.join(__dirname, '../results/assets');
const load = (f) => JSON.parse(fs.readFileSync(path.join(LOG_DIR, f), 'utf8'));

const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
const INK = '#1f2328';
const MUTED = '#6e7781';
const GRID = '#e1e4e8';
const BG = '#ffffff';
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const text = (x, y, s, { size = 11, fill = INK, weight = 400, anchor = 'start', family = FONT } = {}) =>
  `<text x="${x}" y="${y}" font-family='${family}' font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}">${esc(s)}</text>`;
const rect = (x, y, w, h, { fill = '#fff', stroke = 'none', strokeWidth = 0, rx = 0 } = {}) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;
const wrap = (w, h, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
  `${rect(0, 0, w, h, { fill: BG })}${body}</svg>`;

function writeSvg(subdir, name, svg) {
  const dir = path.join(OUT_ROOT, subdir);
  fs.mkdirSync(dir, { recursive: true });
  const p = path.join(dir, name);
  fs.writeFileSync(p, svg, 'utf8');
  console.log('wrote', path.relative(process.cwd(), p));
}

// ══════════════════════════════════════════════════════════════════════════
// ① E8b — 세계 팔레트 vs 씬 강조색 견본, 색온도 진행 차트
// ══════════════════════════════════════════════════════════════════════════

const E8B_PRESETS = ['kishoten', 'family-jjigae'];
const E8B_ROWS = [
  { arm: 'ctl', r: 1, label: '무배선 1회' },
  { arm: 'ctl', r: 2, label: '무배선 2회' },
  { arm: 'arc', r: 1, label: '배선 1회' },
  { arm: 'arc', r: 2, label: '배선 2회' },
];

function e8bPaletteSvg(preset) {
  const chipW = 16, chipGap = 3, groupGap = 14;
  const worldPitch = 42; // 칩 아래 hex 라벨(#RRGGBB, 7문자)이 겹치지 않을 최소 간격
  const leftPad = 14, labelW = 62, worldW = 3 * worldPitch, afterDividerGap = 14;
  const sceneStartX = leftPad + labelW + worldW + afterDividerGap;

  const rows = E8B_ROWS.map(({ arm, r }) => {
    const v2 = load(`${preset}__v2Design__e8b${arm}${r}.json`);
    const v3 = load(`${preset}__sceneCinematography__e8b${arm}${r}.json`);
    const palette = v2.result.worldVisual.global_palette;
    const plans = [...v3.result.scene_plans].sort(
      (a, b) => Number(a.scene_id.replace(/\D/g, '')) - Number(b.scene_id.replace(/\D/g, '')),
    );
    return { palette, plans };
  });

  let sceneAreaW = 0;
  for (const { plans } of rows) {
    let w = 0;
    plans.forEach((p) => { w += p.palette_emphasis.length * (chipW + chipGap) - chipGap + groupGap; });
    sceneAreaW = Math.max(sceneAreaW, w);
  }
  const width = Math.max(760, sceneStartX + sceneAreaW + 20);
  const rowH = 52, headerH = 56, topPad = 10;
  const height = topPad + headerH + rows.length * rowH + 16;

  let body = '';
  body += text(leftPad, 26, `${preset === 'kishoten' ? '기승전결' : '가족 드라마'} — 세계 팔레트 대 씬이 실제로 쓴 강조색`, { size: 14, weight: 700 });
  body += text(leftPad + labelW, 46, '세계 팔레트', { size: 10, fill: MUTED });
  body += text(sceneStartX, 46, '씬 강조색 (장면 순서대로)', { size: 10, fill: MUTED });

  let y = topPad + headerH;
  E8B_ROWS.forEach(({ label }, i) => {
    const { palette, plans } = rows[i];
    const chipY = y + 4;
    body += text(leftPad, chipY + 12, label, { size: 11, weight: 600 });
    let x = leftPad + labelW;
    for (const hex of [palette.primary, palette.secondary, palette.accent]) {
      body += rect(x + (worldPitch - chipW) / 2, chipY, chipW, chipW, { fill: hex, stroke: '#00000022', strokeWidth: 1, rx: 3 });
      body += text(x + worldPitch / 2, chipY + chipW + 11, hex, { size: 7, fill: MUTED, anchor: 'middle' });
      x += worldPitch;
    }
    body += `<line x1="${sceneStartX - afterDividerGap / 2}" y1="${y}" x2="${sceneStartX - afterDividerGap / 2}" y2="${y + rowH - 8}" stroke="${GRID}" stroke-width="1"/>`;
    let sx = sceneStartX;
    plans.forEach((p, si) => {
      const gw = p.palette_emphasis.length * (chipW + chipGap) - chipGap;
      p.palette_emphasis.forEach((hex, ci) => {
        body += rect(sx + ci * (chipW + chipGap), chipY, chipW, chipW, { fill: hex, stroke: '#00000022', strokeWidth: 1, rx: 3 });
      });
      body += text(sx + gw / 2, chipY + chipW + 11, `씬${si + 1}`, { size: 7, fill: MUTED, anchor: 'middle' });
      sx += gw + groupGap;
    });
    y += rowH;
  });

  return wrap(width, height, body);
}

function e8bColorTempSvg(preset) {
  const COND = [
    { arm: 'ctl', color: '#2a78d6', label: '무배선' },
    { arm: 'arc', color: '#eb6834', label: '배선 주입' },
  ];
  const runs = { ctl: [], arc: [] };
  for (const { arm } of COND) {
    for (let r = 1; r <= 2; r++) {
      const v3 = load(`${preset}__sceneCinematography__e8b${arm}${r}.json`);
      const plans = [...v3.result.scene_plans].sort(
        (a, b) => Number(a.scene_id.replace(/\D/g, '')) - Number(b.scene_id.replace(/\D/g, '')),
      );
      const ks = plans.map((p) => (p.lighting_arc.start_K + p.lighting_arc.end_K) / 2);
      runs[arm].push(ks);
    }
  }
  const allK = [...runs.ctl.flat(), ...runs.arc.flat()];
  const maxScenes = Math.max(...runs.ctl.map((a) => a.length), ...runs.arc.map((a) => a.length));
  const kMin = Math.floor(Math.min(...allK) / 500) * 500 - 200;
  const kMax = Math.ceil(Math.max(...allK) / 500) * 500 + 200;

  const width = 720, plotL = 60, plotR = 40, plotT = 50, plotB = 50;
  const plotW = width - plotL - plotR, plotH = 220;
  const height = plotT + plotH + plotB;
  const xAt = (i) => plotL + (maxScenes === 1 ? 0 : (i / (maxScenes - 1)) * plotW);
  const yAt = (k) => plotT + plotH - ((k - kMin) / (kMax - kMin)) * plotH;

  let body = '';
  body += text(plotL, 24, `${preset === 'kishoten' ? '기승전결' : '가족 드라마'} — 장면 순서에 따른 조명 색온도(무배선 vs 배선 주입)`, { size: 14, weight: 700 });

  for (let k = kMin; k <= kMax; k += 500) {
    const y = yAt(k);
    body += `<line x1="${plotL}" y1="${y}" x2="${plotL + plotW}" y2="${y}" stroke="${GRID}" stroke-width="1"/>`;
    body += text(plotL - 8, y + 3, `${k}K`, { size: 9, fill: MUTED, anchor: 'end' });
  }
  for (let i = 0; i < maxScenes; i++) {
    body += text(xAt(i), plotT + plotH + 16, `씬${i + 1}`, { size: 9, fill: MUTED, anchor: 'middle' });
  }
  body += text(plotL + plotW / 2, plotT + plotH + 34, '장면 순서', { size: 10, fill: MUTED, anchor: 'middle' });

  for (const { arm, color, label } of COND) {
    runs[arm].forEach((ks, ri) => {
      const dash = ri === 0 ? 'none' : '5,4';
      const pts = ks.map((k, i) => `${xAt(i)},${yAt(k)}`).join(' ');
      body += `<polyline points="${pts}" fill="none" stroke="${color}" stroke-width="2.5" stroke-dasharray="${dash}" stroke-linejoin="round" stroke-linecap="round"/>`;
      ks.forEach((k, i) => { body += `<circle cx="${xAt(i)}" cy="${yAt(k)}" r="3" fill="${color}"/>`; });
    });
  }

  const legendY = plotT + plotH + plotB - 10;
  let lx = plotL;
  for (const { color, label } of COND) {
    body += `<line x1="${lx}" y1="${legendY}" x2="${lx + 22}" y2="${legendY}" stroke="${color}" stroke-width="3"/>`;
    body += text(lx + 28, legendY + 4, `${label} (실선=1회 · 점선=2회)`, { size: 10, fill: INK });
    lx += 190;
  }

  return wrap(width, height, body);
}

// ══════════════════════════════════════════════════════════════════════════
// ② E9b — A/B 샷 타임라인 (사이즈=색, 무빙=라벨, 추가샷=테두리 강조)
// ══════════════════════════════════════════════════════════════════════════

const SIZE_ORDER = ['ECU', 'CU', 'MCU', 'MS', 'MFS', 'FS', 'WS', 'EWS'];
const SIZE_COLOR = {
  ECU: '#b7d3f6', CU: '#86b6ef', MCU: '#6da7ec', MS: '#5598e7',
  MFS: '#3987e5', FS: '#2a78d6', WS: '#1c5cab', EWS: '#104281',
  POV: '#eb6834',
};
const SIZE_KO = {
  ECU: '익스트림클로즈업', CU: '클로즈업', MCU: '미디엄클로즈업', MS: '미디엄샷',
  MFS: '미디엄풀샷', FS: '풀샷', WS: '와이드샷', EWS: '익스트림와이드', POV: '시점샷',
};
const MOVE_KO = { static: '정적', handheld_drift: '핸드헬드', dolly_in: '달리인', tracking: '트래킹' };

function e9bShotList(preset, arm, run) {
  const decFile = arm === 'A' ? `${preset}__decoupageExecutorA__e9b${arm}${run}.json` : `${preset}__sceneShotCoGen__e9b${arm}${run}.json`;
  const dec = load(decFile);
  const sd = load(`${preset}__shotDesign__e9b${arm}${run}.json`);
  const sdByShot = new Map(sd.result.map((s) => [s.intent.shot_id, s]));
  const shots = [];
  for (const sc of dec.result.scenes) {
    for (const sh of sc.shots) {
      const d = sdByShot.get(sh.shot_id);
      shots.push({
        sceneId: sc.scene_id,
        duration: sh.intended_duration_seconds,
        added: sh.operation === 'added',
        size: d.static_spec.shot_type,
        move: d.dynamic_spec.camera_motion.type,
      });
    }
  }
  return shots;
}

function e9bTimelineSvg(preset, materialLabel) {
  const A = e9bShotList(preset, 'A', 1);
  const B = e9bShotList(preset, 'B', 1);
  const totalA = A.reduce((s, x) => s + x.duration, 0);
  const totalB = B.reduce((s, x) => s + x.duration, 0);
  const timelineW = 620;
  const pxPerSec = timelineW / Math.max(totalA, totalB);

  const usedSizes = SIZE_ORDER.filter((s) => [...A, ...B].some((x) => x.size === s));
  if ([...A, ...B].some((x) => x.size === 'POV')) usedSizes.push('POV');

  const leftPad = 16, rowLabelW = 46, plotX = leftPad + rowLabelW;
  const width = plotX + timelineW + 30;
  const barH = 26, moveLabelH = 13, sceneLabelH = 13, rowGap = 34;
  const titleH = 34;
  const legendH = 56;
  const rowBlockH = moveLabelH + barH + sceneLabelH;
  const height = titleH + rowBlockH * 2 + rowGap + legendH + 20;

  let body = '';
  body += text(leftPad, 22, `${materialLabel} — A팔(씬-권위+기계 집행) vs B팔(씬·샷 근접 생성) 샷 타임라인`, { size: 14, weight: 700 });

  function drawRow(shots, y, rowLabel) {
    let x = plotX;
    let prevScene = null;
    shots.forEach((sh) => {
      const w = sh.duration * pxPerSec;
      if (prevScene !== null && prevScene !== sh.sceneId) {
        body += `<line x1="${x}" y1="${y}" x2="${x}" y2="${y + barH}" stroke="${BG}" stroke-width="2"/>`;
        body += `<line x1="${x}" y1="${y - 2}" x2="${x}" y2="${y + barH + 2}" stroke="${GRID}" stroke-width="1"/>`;
      }
      body += rect(x + 1, y, w - 2, barH, {
        fill: SIZE_COLOR[sh.size] ?? '#999',
        stroke: sh.added ? '#e34948' : '#00000022',
        strokeWidth: sh.added ? 2.5 : 1,
        rx: 3,
      });
      const moveLabel = MOVE_KO[sh.move] ?? sh.move;
      body += text(x + w / 2, y - 4, moveLabel, { size: 8, fill: MUTED, anchor: 'middle' });
      prevScene = sh.sceneId;
      x += w;
    });
    // 씬 경계 라벨
    let sx = plotX;
    let curScene = null, sceneStartX = plotX;
    const flush = (endX) => {
      if (curScene !== null) {
        const num = Number(curScene.replace(/\D/g, ''));
        body += text((sceneStartX + endX) / 2, y + barH + 12, `씬${num}`, { size: 8, fill: MUTED, anchor: 'middle' });
      }
    };
    shots.forEach((sh) => {
      const w = sh.duration * pxPerSec;
      if (sh.sceneId !== curScene) { flush(sx); curScene = sh.sceneId; sceneStartX = sx; }
      sx += w;
    });
    flush(sx);
    body += text(leftPad, y + barH / 2 + 4, rowLabel, { size: 12, weight: 700 });
  }

  let y = titleH + moveLabelH;
  drawRow(A, y, 'A팔');
  y += rowBlockH + rowGap;
  drawRow(B, y, 'B팔');

  // 범례
  let legendY = y + rowBlockH + 22;
  body += text(leftPad, legendY, '샷 사이즈(색, 좁을수록 밝음 → 넓을수록 진함)', { size: 9, fill: MUTED });
  let lx = leftPad;
  legendY += 16;
  usedSizes.forEach((s) => {
    body += rect(lx, legendY - 9, 12, 12, { fill: SIZE_COLOR[s], stroke: '#00000022', strokeWidth: 1, rx: 2 });
    const label = SIZE_KO[s] ?? s;
    body += text(lx + 16, legendY, label, { size: 9, fill: INK });
    lx += 16 + label.length * 8 + 14;
  });
  legendY += 18;
  body += `<rect x="${leftPad}" y="${legendY - 9}" width="12" height="12" rx="2" fill="#ccc" stroke="#e34948" stroke-width="2.5"/>`;
  body += text(leftPad + 18, legendY, '테두리 강조 = 원문에 없던 [추가] 샷 · 바 위 글자 = 카메라 무빙', { size: 9, fill: INK });

  return wrap(width, height, body);
}

// ══════════════════════════════════════════════════════════════════════════
// ③ E13b — 시간 비교 막대 (현행 2콜 / 근사판 / 정식판)
// ══════════════════════════════════════════════════════════════════════════

function e13bTimeChartSvg() {
  const rows = [
    { label: '현행 2콜', value: 18.7, color: '#86b6ef', sub: '광고 17.4s · 원장 20.1s' },
    { label: '근사판 (뒷정리 이관 전)', value: 13.9, color: '#3987e5', sub: '범위 10.8~19.9s' },
    { label: '정식판 (뒷정리 이관 후)', value: 12.6, color: '#184f95', sub: '광고 10.8s · 원장 19.2s · 기승전결 11.9s · 순환 11.3s' },
  ];
  const width = 760, leftPad = 16, labelW = 190, plotR = 60;
  const plotX = leftPad + labelW, plotW = width - plotX - plotR;
  const maxV = 20;
  const barH = 30, rowH = 66, topPad = 50;
  const height = topPad + rows.length * rowH + 20;
  const xAt = (v) => plotX + (v / maxV) * plotW;

  let body = '';
  body += text(leftPad, 24, '실행 시간 비교 — 구조 정하기 + 장면 나누기 (평균, 소재별 세부치 병기)', { size: 14, weight: 700 });
  for (let v = 0; v <= maxV; v += 5) {
    const x = xAt(v);
    body += `<line x1="${x}" y1="${topPad}" x2="${x}" y2="${topPad + rows.length * rowH - 20}" stroke="${GRID}" stroke-width="1"/>`;
    body += text(x, topPad + rows.length * rowH - 4, `${v}s`, { size: 9, fill: MUTED, anchor: 'middle' });
  }
  rows.forEach((row, i) => {
    const y = topPad + i * rowH;
    body += text(leftPad, y + barH / 2 + 4, row.label, { size: 11, weight: 600 });
    body += rect(plotX, y, xAt(row.value) - plotX, barH, { fill: row.color, rx: 4 });
    body += text(xAt(row.value) + 8, y + barH / 2 + 4, `${row.value}s`, { size: 11, weight: 700, fill: INK });
    body += text(plotX, y + barH + 14, row.sub, { size: 9, fill: MUTED });
  });

  return wrap(width, height, body);
}

// ══════════════════════════════════════════════════════════════════════════
// 실행
// ══════════════════════════════════════════════════════════════════════════

for (const preset of E8B_PRESETS) {
  const label = preset === 'kishoten' ? 'kishoten' : 'family-jjigae';
  writeSvg('e8b', `${label}-palette.svg`, e8bPaletteSvg(preset));
  writeSvg('e8b', `${label}-colortemp.svg`, e8bColorTempSvg(preset));
}

writeSvg('e9b', 'ad-shot-timeline.svg', e9bTimelineSvg('ad', '브랜드 광고(30초)'));
writeSvg('e9b', 'kishoten-shot-timeline.svg', e9bTimelineSvg('kishoten', '기승전결 프로브(90초)'));

writeSvg('e13b', 'time-comparison.svg', e13bTimeChartSvg());

console.log('done.');
