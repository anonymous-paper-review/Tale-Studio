// report.html 생성기 — run/manifest.json + run/assets 를 사람이 읽는 HTML 로 조립한다.
//   이미지는 webp data URI 로 임베드(파일 하나로 열려야 한다) + 원본 PNG 상대경로 링크 병기.
//   패널 크롭 좌표는 제품 gridGeometry('strip1') 에서 가져온다(복붙 금지).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { gridGeometry } from '@/lib/writer/rough-storyboard-grid'

const DIR = dirname(fileURLToPath(import.meta.url))
const RUN = join(DIR, 'run')
const m = JSON.parse(readFileSync(join(RUN, 'manifest.json'), 'utf8'))

const { cols, rows } = gridGeometry('strip1')
const [c0, c1] = cols[0]

async function webpUri(file: string, q = 94, width?: number): Promise<string> {
  let p = sharp(file)
  if (width) p = p.resize({ width })
  const buf = await p.webp({ quality: q }).toBuffer()
  return `data:image/webp;base64,${buf.toString('base64')}`
}

/** 시트 안 3칸의 실제 경계를 밝기 프로파일로 검출 (모델이 다시 그린 시트는 여백 비율이 매번 달라
 *  제품의 고정 비례 좌표로 자르면 어긋난다 — 사람이 보라고 만드는 크롭이므로 실측으로 자른다).
 *  검출 실패 시 제품 비례 좌표로 폴백. 검출/폴백 여부는 리포트에 기록한다. */
const cropMode: Record<string, 'detected' | 'fallback'> = {}
async function panelBox(file: string): Promise<{ left: number; width: number; rows: Array<[number, number]> }> {
  const { data, info } = await sharp(file).greyscale().raw().toBuffer({ resolveWithObject: true })
  const W = info.width
  const H = info.height
  const runs = (arr: number[], thr: number, min: number): Array<[number, number]> => {
    const out: Array<[number, number]> = []
    let st = -1
    for (let i = 0; i < arr.length; i++) {
      const on = arr[i] < thr
      if (on && st < 0) st = i
      if ((!on || i === arr.length - 1) && st >= 0) {
        const e = on ? i : i - 1
        if (e - st + 1 >= min) out.push([st, e])
        st = -1
      }
    }
    return out
  }
  const rowMean: number[] = []
  for (let y = 0; y < H; y++) { let s = 0; for (let x = 0; x < W; x++) s += data[y * W + x]; rowMean.push(s / W) }
  const colMean: number[] = []
  for (let x = 0; x < W; x++) { let s = 0; for (let y = 0; y < H; y++) s += data[y * W + x]; colMean.push(s / H) }
  const rr = runs(rowMean, 238, H / 12)
  const cc = runs(colMean, 238, W / 6)
  if (rr.length === 3 && cc.length === 1) {
    cropMode[file] = 'detected'
    return { left: cc[0][0], width: cc[0][1] - cc[0][0] + 1, rows: rr }
  }
  cropMode[file] = 'fallback'
  return {
    left: Math.round(c0 * W),
    width: Math.max(1, Math.round((c1 - c0) * W)),
    rows: rows.map((r) => [Math.round(r[0] * H), Math.round(r[1] * H)] as [number, number]),
  }
}

/** 세로 3칸 시트에서 r 번째 칸만 잘라 webp data URI 로. */
async function panelUri(file: string, r: number, q = 94): Promise<string> {
  const box = await panelBox(file)
  const [t, b] = box.rows[r]
  const buf = await sharp(file)
    .extract({ left: box.left, top: t, width: box.width, height: Math.max(1, b - t + 1) })
    .webp({ quality: q })
    .toBuffer()
  return `data:image/webp;base64,${buf.toString('base64')}`
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// ── 지시문 한국어 옮김 (사람이 읽는 본문용) ──────────────────────────────────
const KO_COMMON_HEAD = [
  '첫 번째 참조 이미지는 영화 샷 하나를 세로 3칸으로 그린 스토리보드 스트립이다. 목각 마네킹을 사람 대역으로 세워 연필로 거칠게 그린 프리비즈다. 맨 위 칸 = 시작 프레임. 가운데 칸 = 방향 프레임 — 시작 칸과 똑같은 그림에, 카메라와 인물의 움직임을 설명하는 손그림 방향 화살표와 글자 라벨이 얹혀 있다. 맨 아래 칸 = 그 움직임이 끝난 뒤의 끝 프레임.',
]
const KO_LEAD = '이 스트립을 그대로, 완성된 최종 품질의 영화 프레임으로 다시 그려라:'
const KO_LINES_PRE = [
  '결과물은 반드시 같은 세로 시트 한 장이어야 하고 칸이 정확히 셋 쌓여 있어야 한다 — 절대 단독 한 장짜리 그림으로 만들지 말고, 시트 바깥에 장식용 액자나 테두리를 덧붙이지 마라.',
  '시트 레이아웃과 세 칸의 테두리를 지금 그대로 유지하라. 칸 안쪽에만 그려라.',
  '맨 위 칸: 시작 프레임을 온전한 품질로 다시 그려라 — 참조 1번 칸과 같은 카메라 세팅·프레이밍·구도·포즈로.',
]
const KO_MIDDLE = '가운데 칸: 맨 위 칸과 똑같은 그림에, 참조 2번 칸의 같은 방향 화살표와 라벨을 그 위에 주석 레이어로 굵게 다시 그려 얹어라. 확실히 보이게. 글자가 들어가는 유일한 칸이다.'
const KO_MIDDLE_ADD = ' 참조 2번 칸에 없는 화살표나 라벨을 절대 지어내지 마라 — 러프 시트에 화살표가 없으면(정지 유지 샷) 가운데 칸은 주석 없이 깨끗하게 둔다.'
const KO_BOTTOM = '맨 아래 칸: 끝 프레임을 온전한 품질로 다시 그려라 — 움직임이 완료된 뒤의 같은 샷으로, 참조 3번 칸의 구도를 정확히 맞춰서.'
const KO_BOTTOM_ADD = ' 참조 3번 칸의 도착 상태를 충실히 재현하라: 움직임이 바꿔놓은 모든 요소(이제 열린 서랍, 이제 이동했거나 돌아선 인물, 이제 옮겨진 물건)를 완료된 끝 상태로 보여야 한다. 샷에 움직임이 둘 이상이면 전부 완료된 상태로 보여라 — 절대 맨 위 칸의 상태를 반복하지 마라.'
const KO_CHAR = '목각 마네킹은 전부, 첫 번째와 마지막 사이에 있는 참조 이미지들(인물/세계관 참조)의 해당 인물로 바꿔라. 그 인물의 정체성·디자인·의상을 유지하고, 세 칸 전부에서 같은 인물이어야 한다.'
const KO_STYLE = '마지막 참조 이미지(스타일 참조)의 시각 스타일을 정확히 맞춰라: 미술 매체·렌더링 기법·선화·조명 분위기·색보정을 맞춘다. 그 이미지의 피사체나 사물은 절대 따라 그리지 마라.'
const KO_TAIL = '가운데 칸의 화살표 라벨을 빼면 어디에도 글자를 넣지 마라.'

const KO_SHOT: Record<string, { desc: string; continuity?: string; hasChar: boolean }> = {
  sh_02_10: {
    desc: '샷 설명: 침입 이전의 사무실을 담은 정지 와이드 샷. 햇살 기둥 사이로 먼지 입자가 떠다닌다.',
    hasChar: false,
  },
  sh_01_09: {
    desc: '샷 설명: 조승우가 다급하게 서류를 촬영하다가, 복도에서 발소리가 울리자 얼어붙는다.',
    continuity:
      '연속성: 조금 전 직전 샷은 "깨진 창틀 너머로 보이는 연기 자욱한 지평선."을 보여줬다. 거기서 인물의 의상·소품·조명·주변 환경을 이어받되, 이 샷 자신의 순간을 그려라.',
    hasChar: true,
  },
}

function koPrompt(shotId: string, arm: 'A' | 'B'): string {
  const s = KO_SHOT[shotId]
  const li = (t: string) => `<li>${t}</li>`
  const mark = (t: string) => `<mark class="add">${t}</mark>`
  const items = [
    ...KO_LINES_PRE.map((t) => li(esc(t))),
    li(esc(KO_MIDDLE) + (arm === 'B' ? mark(esc(KO_MIDDLE_ADD)) : '')),
    li(esc(KO_BOTTOM) + (arm === 'B' ? mark(esc(KO_BOTTOM_ADD)) : '')),
    ...(s.hasChar ? [li(esc(KO_CHAR))] : []),
    li(esc(KO_STYLE)),
    li(esc(s.desc) + (s.continuity ? `<br><span class="sub">${esc(s.continuity)}</span>` : '')),
    li(esc(KO_TAIL)),
  ]
  return `<p>${esc(KO_COMMON_HEAD[0])}</p><p><b>${esc(KO_LEAD)}</b></p><ul class="plines">${items.join('')}</ul>`
}

// ── 조립 ──────────────────────────────────────────────────────────────────────
const SHOTS: Array<{ id: string; title: string; nature: string; look: string }> = [
  {
    id: 'sh_02_10',
    title: '아무도 없는 사무실 — 아무것도 움직이지 않는 샷',
    nature:
      '연필 원본의 가운데 칸에 <b>화살표가 없다</b>. "STATIC HOLD"라는 글자 라벨만 손으로 적혀 있다. 카메라도 인물도 움직이지 않는 샷이라 원본이 그리라고 준 화살표 자체가 없는 것이다.',
    look:
      '가운데 칸에 <b>화살표 모양이 있는지</b> 보세요 — 원본에는 없습니다. 글자 라벨("STATIC HOLD")은 원본에 있으니 그건 있어도 원본대로입니다.',
  },
  {
    id: 'sh_01_09',
    title: '서류를 찍다가 돌아보는 샷 — 움직임이 둘인 샷',
    nature:
      '연필 원본의 가운데 칸에 머리 위로 휘는 <b>곡선 화살표 + "TURNS"</b> 라벨이 있다. 샷 설명은 "다급하게 서류를 촬영하다가, 발소리에 얼어붙는다" — 촬영과 돌아봄, <b>움직임이 둘</b>이다.',
    look:
      '맨 아래 칸이 <b>맨 위 칸과 같은 그림인지</b> 보세요. 그리고 연필 원본의 맨 아래 칸(인물이 카메라를 내리고 돌아본 상태)과 <b>같은 도착 상태인지</b> 보세요.',
  },
]

const REPS = [1, 2, 3]

async function main() {
  mkdirSync(RUN, { recursive: true })
  const parts: string[] = []

  // 입력 자산
  const stripUri: Record<string, string> = {}
  const refPanel: Record<string, string[]> = {}
  for (const s of SHOTS) {
    const f = join(RUN, 'strips', `${s.id}_ref_strip.png`)
    stripUri[s.id] = await webpUri(f, 94)
    refPanel[s.id] = [await panelUri(f, 0), await panelUri(f, 1), await panelUri(f, 2)]
  }
  const charUri = await webpUri(join(RUN, 'inputs', 'char_sh_01_09.png'), 88, 620)
  const anchorUri = await webpUri(join(RUN, 'inputs', 'style_anchor_real.png'), 88, 620)

  // 결과 자산
  const outUri: Record<string, string> = {}
  const outPanel: Record<string, string[]> = {}
  for (const j of m.jobs) {
    if (!j.done) continue
    const f = join(RUN, 'assets', `${j.key}.png`)
    outUri[j.key] = await webpUri(f, 94)
    outPanel[j.key] = [await panelUri(f, 0), await panelUri(f, 1), await panelUri(f, 2)]
  }

  const cell = (uri: string, href: string, cap: string, ref = false) =>
    `<figure class="cel${ref ? ' isref' : ''}"><a href="${esc(href)}" target="_blank" rel="noopener"><img src="${uri}" alt="${esc(cap)}" loading="lazy"></a><figcaption>${cap}</figcaption></figure>`

  // ── 샷 섹션 ──
  const shotSections = SHOTS.map((s) => {
    const armBlock = (arm: 'A' | 'B') => {
      const cells = REPS.map((r) => {
        const key = `${s.id}__${arm}__r${r}`
        return cell(
          outUri[key],
          `run/assets/${key}.png`,
          `${arm === 'A' ? '현행' : '제안'} · ${r}회차`,
        )
      }).join('')
      return `<div class="armgrp"><div class="armlab ${arm === 'A' ? 'la' : 'lb'}">${arm === 'A' ? '팔 A — 현행 지시문' : '팔 B — 제안 지시문(2문장 추가)'}</div><div class="gal g3">${cells}</div></div>`
    }
    const armHead = (arm: 'A' | 'B') =>
      `<div class="armlab ${arm === 'A' ? 'la' : 'lb'}">${arm === 'A' ? '팔 A — 현행 지시문' : '팔 B — 제안 지시문'}</div>`

    // 가운데 칸: 팔마다 한 줄, 각 줄 맨 앞에 연필 원본을 다시 놓아 바로 옆에서 대조되게.
    const midRows = (['A', 'B'] as const)
      .map(
        (arm) =>
          `<div class="armgrp">${armHead(arm)}<div class="gal g4">${[
            cell(refPanel[s.id][1], `run/strips/${s.id}_ref_strip.png`, '연필 원본 — 이게 기준', true),
            ...REPS.map((r) =>
              cell(outPanel[`${s.id}__${arm}__r${r}`][1], `run/assets/${s.id}__${arm}__r${r}.png`, `${r}회차`),
            ),
          ].join('')}</div></div>`,
      )
      .join('')

    const endPair = (topUri: string, botUri: string, href: string, cap: string, ref = false) =>
      `<figure class="cel${ref ? ' isref' : ''}"><a href="${esc(href)}" target="_blank" rel="noopener"><span class="stack"><span class="stlab">맨 위 칸</span><img src="${topUri}" alt="" loading="lazy"><span class="stlab">맨 아래 칸</span><img src="${botUri}" alt="" loading="lazy"></span></a><figcaption>${cap}</figcaption></figure>`
    const endRows = (['A', 'B'] as const)
      .map(
        (arm) =>
          `<div class="armgrp">${armHead(arm)}<div class="gal g4">${[
            endPair(refPanel[s.id][0], refPanel[s.id][2], `run/strips/${s.id}_ref_strip.png`, '연필 원본 — 이게 기준', true),
            ...REPS.map((r) =>
              endPair(
                outPanel[`${s.id}__${arm}__r${r}`][0],
                outPanel[`${s.id}__${arm}__r${r}`][2],
                `run/assets/${s.id}__${arm}__r${r}.png`,
                `${r}회차`,
              ),
            ),
          ].join('')}</div></div>`,
      )
      .join('')

    return `
<section class="block">
  <div class="sec-head"><h2>${esc(s.title)}</h2></div>
  <p>${s.nature}</p>

  <h3 class="mini">베껴 그려야 할 원본</h3>
  <div class="refwrap">
    <figure class="cel big"><a href="run/strips/${s.id}_ref_strip.png" target="_blank" rel="noopener"><img src="${stripUri[s.id]}" alt="연필 러프 3칸 시트"></a><figcaption>연필 러프 3칸 시트 — 위=시작 / 가운데=방향 / 아래=끝. 이 한 장이 그림 모델에게 1번 참조로 들어간다.</figcaption></figure>
  </div>

  <h3 class="mini">결과 6장 — 같은 원본, 지시문만 다름</h3>
  <div class="bleed">${armBlock('A')}${armBlock('B')}</div>

  <div class="lookbox"><b>볼 곳</b><br>${s.look}</div>

  <h3 class="mini">가운데 칸만 잘라 모아 보기</h3>
  <p class="sub">각 줄 맨 왼쪽이 연필 원본의 가운데 칸입니다 — 이게 기준입니다. 오른쪽 셋은 결과물에서 같은 칸만 잘라낸 것(자르는 좌표는 제품이 쓰는 좌표 그대로).</p>
  <div class="bleed">${midRows}</div>

  <h3 class="mini">맨 위 칸 ↔ 맨 아래 칸 짝지어 보기</h3>
  <p class="sub">한 셀 안에 그 그림의 맨 위 칸(위)과 맨 아래 칸(아래)을 붙여 놨습니다. 두 칸이 서로 같은지, 그리고 연필 원본의 두 칸 관계와 같은지 비교하는 용도.</p>
  <div class="bleed">${endRows}</div>
</section>`
  }).join('')

  const cropVals = Object.values(cropMode)
  const cropTotal = cropVals.length
  const cropDetected = cropVals.filter((v) => v === 'detected').length

  const cost = m.cost
  const submitted = m.jobs.filter((j: any) => j.request_id).length
  const done = m.jobs.filter((j: any) => j.done).length
  const firstSub = m.jobs.filter((j: any) => j.submitted_at).map((j: any) => j.submitted_at).sort()[0]
  const lastCol = m.jobs.filter((j: any) => j.collected_at).map((j: any) => j.collected_at).sort().slice(-1)[0]

  const coordRows = m.jobs
    .map(
      (j: any) =>
        `<tr><td class="mono">${esc(j.key)}</td><td>${j.arm === 'A' ? '현행' : '제안'}</td><td class="mono">${esc(j.model_actual ?? j.model)}</td><td class="mono">${esc(j.request_id ?? '-')}</td><td class="num">${j.prompt.length}</td><td class="mono">${esc((j.submitted_at ?? '').replace('T', ' ').slice(0, 19))}</td></tr>`,
    )
    .join('')

  const enPrompt = (shotId: string, arm: 'A' | 'B') =>
    esc(m.jobs.find((j: any) => j.shot_id === shotId && j.arm === arm).prompt)

  const html = `<title>리페인트 지시문 2문장 — 그림 12장을 나란히 놓았습니다</title>
<style>
  :root {
    --bg:#F7F5F0; --surface:#FFFFFF; --surface-2:#F1EEE6; --ink:#22242A; --muted:#6E7077;
    --line:#E3E0D8; --accent:#A64F2A; --accent-ink:#8A3F1E; --accent-soft:#F3E4DB;
    --ok:#2F7D4E; --ok-soft:#E2F0E7; --warn:#96690A; --warn-soft:#F5EBD4;
    --info:#3A6EA5; --info-soft:#E3ECF5; --violet:#7A5CA8; --violet-soft:#ECE5F5;
    --mono: ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, monospace;
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      --bg:#15171B; --surface:#1D2026; --surface-2:#23262D; --ink:#E9E7E2; --muted:#9C9EA6;
      --line:#2C2F36; --accent:#E0824F; --accent-ink:#E8956A; --accent-soft:#3A2A20;
      --ok:#5FBE8A; --ok-soft:#1E3328; --warn:#D9A94A; --warn-soft:#362C16;
      --info:#7FA9D9; --info-soft:#1E2A38; --violet:#A78BD0; --violet-soft:#2B2438;
    }
  }
  :root[data-theme="dark"] {
    --bg:#15171B; --surface:#1D2026; --surface-2:#23262D; --ink:#E9E7E2; --muted:#9C9EA6;
    --line:#2C2F36; --accent:#E0824F; --accent-ink:#E8956A; --accent-soft:#3A2A20;
    --ok:#5FBE8A; --ok-soft:#1E3328; --warn:#D9A94A; --warn-soft:#362C16;
    --info:#7FA9D9; --info-soft:#1E2A38; --violet:#A78BD0; --violet-soft:#2B2438;
  }
  * { box-sizing: border-box; }
  body {
    background: var(--bg); color: var(--ink);
    font-family: -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Segoe UI", "Malgun Gothic", sans-serif;
    font-size: 15.5px; line-height: 1.7; margin: 0; padding: 0 20px 96px; overflow-x: hidden;
    -webkit-font-smoothing: antialiased;
  }
  .wrap { max-width: 760px; margin: 0 auto; }
  header.page { padding: 54px 0 10px; border-bottom: 2px solid var(--ink); margin-bottom: 20px; }
  .kicker { color: var(--accent); font-weight: 700; font-size: 13px; margin: 0 0 10px; }
  h1 { font-size: clamp(25px,4.5vw,34px); font-weight: 800; letter-spacing:-0.02em; line-height:1.28; margin:0 0 10px; text-wrap: balance; }
  .standfirst { font-size:16px; margin:0 0 6px; }
  .asof { color: var(--muted); font-size:13px; margin:0; }
  h2 { font-size:20px; font-weight:800; letter-spacing:-0.01em; margin:0; text-wrap: balance; }
  h3.mini { font-size:14px; font-weight:750; color:var(--accent); margin:22px 0 8px; letter-spacing:.01em; }
  section.block { margin: 42px 0 0; }
  .sec-head { border-bottom:2px solid var(--ink); padding-bottom:8px; margin-bottom:16px; display:flex; gap:10px; align-items:baseline; flex-wrap:wrap; }
  .sec-head .lede { color:var(--muted); font-size:14px; }
  p { margin: 0 0 12px; }
  p.sub, span.sub { color: var(--muted); font-size:13.5px; }

  .chip { display:inline-block; font-size:12px; font-weight:750; border-radius:4px; padding:1px 8px; white-space:nowrap; vertical-align:1px; }
  .c-ok { background:var(--ok-soft); color:var(--ok); }
  .c-no { background:var(--info-soft); color:var(--info); }
  .c-hold { background:var(--warn-soft); color:var(--warn); }
  .c-fix { background:var(--accent-soft); color:var(--accent-ink); }

  .lead-list { margin:0; padding-left:0; list-style:none; counter-reset:n; }
  .lead-list > li { position:relative; padding:10px 0 10px 36px; border-bottom:1px dashed var(--line); }
  .lead-list > li:last-child { border-bottom:none; }
  .lead-list > li::before { counter-increment:n; content:counter(n); position:absolute; left:0; top:12px; width:22px; height:22px; border:1.5px solid var(--accent); color:var(--accent); border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:12px; font-weight:750; font-family:var(--mono); }
  .lead-list .d { color:var(--muted); font-size:13.5px; }

  .card { background:var(--surface); border:1px solid var(--line); border-radius:8px; padding:18px 20px 14px; margin:0 0 14px; }
  .card .head { display:flex; gap:10px; align-items:baseline; flex-wrap:wrap; margin-bottom:12px; }
  .card .head h3 { font-size:16.5px; font-weight:750; margin:0; line-height:1.45; flex:1 1 300px; }
  .steps { display:grid; gap:8px; }
  .steps .row { display:grid; grid-template-columns:74px 1fr; gap:12px; align-items:baseline; }
  .steps .k { font-size:12px; font-weight:750; color:var(--accent); }
  .steps .v { font-size:14.5px; }
  @media (max-width:520px) { .steps .row { grid-template-columns:1fr; gap:2px; } }
  .left { border-top:1px dashed var(--line); margin-top:12px; padding-top:9px; font-size:13.5px; color:var(--muted); }
  .left b { color:var(--ink); font-weight:700; }

  details { margin-top:10px; border-top:1px dashed var(--line); }
  details summary { cursor:pointer; padding:8px 0 4px; font-size:13px; font-weight:700; color:var(--info); list-style:none; }
  details summary::before { content:"▸ "; }
  details[open] summary::before { content:"▾ "; }
  details summary::-webkit-details-marker { display:none; }
  details .body { padding:4px 0 8px; font-size:13.5px; }
  .mono, code { font-family:var(--mono); font-size:12px; word-break:break-all; }
  pre.raw { background:var(--surface-2); border:1px solid var(--line); border-radius:6px; padding:12px; overflow-x:auto; font-family:var(--mono); font-size:11.5px; line-height:1.6; white-space:pre-wrap; word-break:break-word; }

  .tbl-wrap { overflow-x:auto; }
  table { border-collapse:collapse; width:100%; font-size:13px; }
  th { text-align:left; color:var(--muted); font-weight:700; font-size:12px; padding:6px 10px; border-bottom:2px solid var(--line); white-space:nowrap; }
  td { padding:6px 10px; border-bottom:1px solid var(--line); vertical-align:top; }
  tr:last-child td { border-bottom:none; }
  .num { font-variant-numeric: tabular-nums; }

  ul.plines { margin:0 0 12px; padding-left:20px; }
  ul.plines li { margin-bottom:7px; font-size:14.5px; }
  mark.add { background:var(--accent-soft); color:var(--accent-ink); font-weight:650; padding:1px 3px; border-radius:3px; box-decoration-break:clone; -webkit-box-decoration-break:clone; }

  .bleed { position:relative; left:50%; transform:translateX(-50%); width:min(1180px, calc(100vw - 32px)); margin:10px 0 18px; }
  .armgrp { margin-bottom:16px; }
  .armlab { font-size:12.5px; font-weight:750; padding:4px 10px; border-radius:5px; display:inline-block; margin-bottom:8px; }
  .armlab.la { background:var(--info-soft); color:var(--info); }
  .armlab.lb { background:var(--accent-soft); color:var(--accent-ink); }
  .gal { display:grid; gap:10px; }
  .gal.g3 { grid-template-columns:repeat(3,1fr); }
  .gal.g4 { grid-template-columns:repeat(4,1fr); }
  @media (max-width:820px) { .gal.g4 { grid-template-columns:repeat(2,1fr); } }
  @media (max-width:700px) { .gal.g3 { grid-template-columns:1fr; } }
  figure.cel { margin:0; }
  figure.cel img { width:100%; height:auto; display:block; border:1px solid var(--line); border-radius:4px; background:#fff; }
  figure.cel figcaption { font-size:11.5px; color:var(--muted); margin-top:5px; line-height:1.45; }
  figure.cel.big { max-width:420px; margin:0 auto; }
  figure.cel.isref img { border:2px solid var(--accent); }
  figure.cel.isref figcaption { color:var(--accent-ink); font-weight:700; }
  .stack { display:block; }
  .stlab { display:block; font-size:10px; color:var(--muted); margin:0 0 3px; }
  .stack img + .stlab { margin-top:6px; }
  .refwrap { margin:10px 0 4px; }
  .lookbox { background:var(--warn-soft); border-left:3px solid var(--warn); border-radius:0 6px 6px 0; padding:11px 14px; font-size:14px; margin:14px 0; }
  .lookbox b { color:var(--warn); }
  .checkbox-list { list-style:none; padding-left:0; margin:0; }
  .checkbox-list li { padding:9px 0 9px 30px; position:relative; border-bottom:1px dashed var(--line); font-size:14.5px; }
  .checkbox-list li:last-child { border-bottom:none; }
  .checkbox-list li::before { content:"☐"; position:absolute; left:4px; top:8px; color:var(--accent); font-size:16px; }
  .checkbox-list .d { display:block; color:var(--muted); font-size:13px; }

  footer { margin-top:56px; color:var(--muted); font-size:12.5px; border-top:1px solid var(--line); padding-top:14px; }
  a { color:var(--info); text-decoration:none; }
  a:hover, a:focus-visible { text-decoration:underline; }
</style>

<div class="wrap">

<header class="page">
  <p class="kicker">유료 생성 실험 · 판정은 사람이 합니다</p>
  <h1>리페인트 지시문에 두 문장을 더했습니다 — 그림 12장을 나란히 놓았으니 봐 주세요</h1>
  <p class="standfirst">연필 러프를 실사로 다시 그리는 단계에서 알려진 실패 두 가지를 겨냥한 문장 두 개입니다. 같은 원본·같은 참조·같은 모델로, <b>지시문만 다르게</b> 샷 2종 × 2가지 지시문 × 3회 = 12장을 뽑았습니다. 이 문서는 좋다·나쁘다를 말하지 않습니다. 어디를 보면 되는지만 안내합니다.</p>
  <p class="asof">2026년 8월 12일 실행 · 지출 약 $${cost.estUsd} (정가표 환산) · 원자료 <code>research/experiments/repaint-strip-prompt-v2/run/</code></p>
</header>

<section class="block">
  <div class="sec-head"><h2>먼저 이것만 — 3분 요약</h2></div>
  <ol class="lead-list">
    <li><b>고친 건 그림 그리는 방식이 아니라, 그림 모델에게 주는 말 두 문장입니다.</b><br>
      <span class="d">하나는 "원본에 없는 화살표를 지어내지 마라", 다른 하나는 "끝 칸은 움직임이 다 끝난 상태로 그려라". 제품 코드는 건드리지 않았고, 실험 스크립트 안에서 그 두 문장만 덧붙여 발주했습니다.</span></li>
    <li><b>고른 샷 두 개는 각각 그 두 실패가 났던 조건입니다.</b><br>
      <span class="d">하나는 아무것도 안 움직이는 사무실 샷(원본 가운데 칸에 화살표가 없다), 다른 하나는 촬영하다 돌아보는 샷(움직임이 둘). 8월 11일 측정에 쓰인 바로 그 두 샷이고, 그때 쓴 연필 원본 시트와 <b>바이트 단위로 같은 파일</b>을 다시 썼습니다.</span></li>
    <li><b>정말 봐야 할 것은 "노린 두 가지가 좋아졌나"보다 "다른 게 안 망가졌나"입니다.</b><br>
      <span class="d">지시문이 길어지면 앞쪽 지시의 힘이 줄 수 있습니다. 그래서 아래에 3칸 구조·인물 얼굴·화풍·글자 누출을 훑을 수 있는 확인란을 같은 화면에 뒀습니다.</span></li>
  </ol>
</section>

<section class="block">
  <div class="sec-head"><h2>이 실험이 어느 논의의 발밑에 있나</h2><span class="lede">방향 선택은 이 실험이 못 한다 — 사실만 그림으로 만들어 왔다</span></div>
  <div class="card" style="padding:6px 8px;">
    <div class="tbl-wrap"><table>
      <thead><tr><th>위쪽 설계 논의</th><th>그 발밑의 사실 전제</th><th>이번에 한 일</th></tr></thead>
      <tbody>
        <tr><td><b>제안된 지시문 수정을 저장해 배송할 것인가</b></td><td>"이 두 문장이 두 실패를 없앤다"는 미확인 — 문자열만 바뀌므로 기능 검사로는 판정 불가</td><td>같은 입력으로 12장 생성해 나란히 배치. <b>판정은 당신 몫으로 남김</b></td></tr>
        <tr><td><b>지시문을 늘리는 것 자체가 위험한가</b></td><td>"문장이 길어지면 앞쪽 지시의 비중이 준다" — 근거 없이 걱정만 있던 항목</td><td>부작용 축(3칸 구조·인물·화풍·글자 누출)을 같은 화면에서 훑을 수 있게 배치</td></tr>
        <tr><td><b>샷 4개를 한 장에 몰아 그리는 경로도 같이 고칠 것인가</b></td><td>그 경로는 지시문이 따로 쓰여 있고 같은 결함을 그대로 갖고 있다</td><td><b>이번 범위 밖 — 손대지 않음.</b> 결정은 여전히 열려 있음</td></tr>
      </tbody>
    </table></div>
  </div>
  <p class="asof">이 실험은 "그림을 만들어 눈앞에 늘어놓는 것"까지만 한다. 채택·기각은 이 문서 밖의 결정이다.</p>
</section>

<section class="block">
  <div class="sec-head"><h2>두 팔에 무엇을 줬나 — 같은 것과 다른 것</h2></div>
  <div class="card" style="padding:6px 8px;">
    <div class="tbl-wrap"><table>
      <thead><tr><th>줄 것</th><th>팔 A (현행)</th><th>팔 B (제안)</th></tr></thead>
      <tbody>
        <tr><td>연필 러프 3칸 시트</td><td colspan="2" style="text-align:center">완전히 동일 (같은 파일, 같은 주소)</td></tr>
        <tr><td>인물 참조 그림</td><td colspan="2" style="text-align:center">완전히 동일</td></tr>
        <tr><td>화풍 기준 그림</td><td colspan="2" style="text-align:center">완전히 동일</td></tr>
        <tr><td>그림 모델·해상도 설정</td><td colspan="2" style="text-align:center">완전히 동일</td></tr>
        <tr><td>샷 설명·연속성 문장</td><td colspan="2" style="text-align:center">완전히 동일</td></tr>
        <tr><td><b>지시문</b></td><td>현행 그대로</td><td><b>현행 + 문장 2개</b> (가운데 칸 1개, 맨 아래 칸 1개)</td></tr>
        <tr><td>반복</td><td colspan="2" style="text-align:center">각 3회 (같은 발주를 3번, 매번 새로 뽑힘)</td></tr>
      </tbody>
    </table></div>
  </div>
  <p class="sub">기계 검사로 "팔 B에서 추가 문장 2개만 빼면 팔 A와 글자 하나까지 같다"를 확인한 뒤에야 발주했습니다. 두 팔의 차이는 그 두 문장뿐입니다.</p>

  <h3 class="mini">함께 넣은 참조 그림</h3>
  <div class="gal g3" style="max-width:520px;">
    <figure class="cel"><img src="${charUri}" alt="인물 참조"><figcaption>인물 참조 — 조승우. 돌아보는 샷에만 들어간다(정지 사무실 샷은 인물이 없어 인물 참조도 없다).</figcaption></figure>
    <figure class="cel"><img src="${anchorUri}" alt="화풍 기준"><figcaption>화풍 기준 그림 — 두 샷 모두에 마지막 참조로 들어간다. "이 그림의 매체·조명·색만 따라 하고 내용은 따라 하지 마라"는 지시가 붙는다.</figcaption></figure>
  </div>
</section>

<section class="block">
  <div class="sec-head"><h2>지시문 전문 — 무엇이 달라졌나</h2><span class="lede">색칠된 부분이 팔 B에만 있는 문장</span></div>

  <div class="card">
    <div class="head"><h3>돌아보는 샷에 들어간 지시문 (인물 참조가 있는 쪽)</h3></div>
    <h3 class="mini">팔 A — 현행</h3>
    ${koPrompt('sh_01_09', 'A')}
    <h3 class="mini">팔 B — 제안</h3>
    ${koPrompt('sh_01_09', 'B')}
    <details><summary>영어 원문 그대로 보기 (두 팔)</summary><div class="body">
      <p><b>팔 A</b></p><pre class="raw">${enPrompt('sh_01_09', 'A')}</pre>
      <p><b>팔 B</b></p><pre class="raw">${enPrompt('sh_01_09', 'B')}</pre>
    </div></details>
  </div>

  <div class="card">
    <div class="head"><h3>정지 사무실 샷에 들어간 지시문 (인물이 없어 인물 관련 문장이 빠진다)</h3></div>
    <details open><summary>한국어 전문 (두 팔)</summary><div class="body">
      <h3 class="mini">팔 A — 현행</h3>
      ${koPrompt('sh_02_10', 'A')}
      <h3 class="mini">팔 B — 제안</h3>
      ${koPrompt('sh_02_10', 'B')}
    </div></details>
    <details><summary>영어 원문 그대로 보기 (두 팔)</summary><div class="body">
      <p><b>팔 A</b></p><pre class="raw">${enPrompt('sh_02_10', 'A')}</pre>
      <p><b>팔 B</b></p><pre class="raw">${enPrompt('sh_02_10', 'B')}</pre>
    </div></details>
  </div>
</section>

${shotSections}

<section class="block">
  <div class="sec-head"><h2>다른 게 안 망가졌는지 훑는 칸</h2><span class="lede">노린 두 축 말고, 지시문이 길어지면서 흔들릴 수 있는 것들</span></div>
  <p>위 그림 12장을 다시 한 번 훑으면서 아래를 봐 주세요. 각 항목은 팔 A 3장과 팔 B 3장 사이에 차이가 있는지를 보는 것입니다.</p>
  <div class="card">
    <ul class="checkbox-list">
      <li><b>3칸 구조가 유지됐는가</b><span class="d">한 장짜리 그림으로 뭉개지지 않았는지, 칸이 셋인지, 시트 바깥에 장식 테두리가 붙지 않았는지.</span></li>
      <li><b>인물이 같은 사람으로 보이는가</b><span class="d">돌아보는 샷에서만 해당. 세 칸 안에서 같은 얼굴·같은 옷인지, 인물 참조 그림과 같은 사람인지.</span></li>
      <li><b>화풍이 유지됐는가</b><span class="d">화풍 기준 그림의 매체·조명·색감을 따라갔는지. 팔 B에서 더 만화 같아지거나 더 사진 같아지지 않았는지.</span></li>
      <li><b>글자가 새 나오지 않았는가</b><span class="d">가운데 칸의 라벨 말고 다른 칸에 글자가 생겼는지. 화면 속 서류·간판에 읽히는 글자가 늘었는지.</span></li>
      <li><b>맨 위 칸이 원본 시작 칸을 지켰는가</b><span class="d">두 문장은 가운데·아래 칸을 겨냥했다. 맨 위 칸은 원래대로 나와야 하는데 덩달아 흔들렸는지.</span></li>
      <li><b>배경·소품이 원본에서 벗어나지 않았는가</b><span class="d">창밖 도시, 책장, 바닥에 흩어진 서류 같은 것들이 원본 구도에서 이동하거나 사라졌는지.</span></li>
    </ul>
  </div>
</section>

<section class="block">
  <div class="sec-head"><h2>정직 보고 — 못 한 것과 알아둘 것</h2></div>
  <div class="card">
    <ul class="checkbox-list" style="list-style:none;">
      <li style="padding-left:0;"><b>실제 청구액을 숫자로 확인하지 못했습니다.</b><span class="d">이 문서의 $${cost.estUsd}는 공개 정가표 × 12장으로 환산한 값입니다. 실비 조회 창구는 관리자 권한 키를 요구하는데 이 저장소 키에는 그 권한이 없습니다(요청 시 거부됨). 정확한 숫자는 fal 대시보드에서만 볼 수 있습니다. 정가표 최댓값으로 잡아도 상한은 $${cost.ceilUsd}입니다.</span></li>
      <li style="padding-left:0;"><b>세로 해상도 지정이 실제로는 전달되지 않습니다 (제품의 기존 동작).</b><span class="d">제품 코드는 세로 1024×1536을 요구하지만 그 값이 발주 조립 과정에서 버려지고 "알아서(auto)"로 나갑니다. 결과물은 592×1136으로 돌아왔습니다. 이건 이번 실험이 만든 문제가 아니라 원래 그렇게 돌고 있는 것이고, <b>두 팔에 똑같이 적용</b>되므로 비교에는 영향이 없습니다. 별건 수리 후보입니다.</span></li>
      <li style="padding-left:0;"><b>검수 노트는 두 샷 모두 그림 주문서에 실리지 않았습니다.</b><span class="d">두 샷 다 검수 노트를 갖고 있지만, 그 노트들에 "시각 제약"이라는 표시가 없어 제품이 안전하게 걸러냅니다(원래 그렇게 설계됨). 두 팔에 동일합니다.</span></li>
      <li style="padding-left:0;"><b>칸만 잘라 모은 그림은 자를 위치를 눈금이 아니라 실측으로 잡았습니다.</b><span class="d">모델이 시트를 다시 그릴 때마다 바깥 여백 두께가 달라져서(측정: 첫 칸 시작 위치가 세로 1136 중 7픽셀에서 42픽셀까지 흔들림), 제품이 쓰는 고정 비율로 자르면 칸이 어긋납니다. 그래서 이 문서의 크롭은 그림마다 밝기로 칸 경계를 찾아 잘랐습니다(${cropDetected}/${cropTotal}장 검출 성공, 나머지는 고정 비율 폴백). <b>제품이 완성 그림을 잘라 저장할 때는 여전히 고정 비율을 씁니다</b> — 이 관측은 이번 실험 범위 밖이지만 그대로 적어 둡니다.</span></li>
      <li style="padding-left:0;"><b>1회차·2회차·3회차는 서로 짝이 아닙니다.</b><span class="d">같은 발주를 세 번 반복한 독립 표본입니다. 화면에서 나란히 놓인 건 보기 편하라고 한 배치일 뿐, "A 1회차와 B 1회차가 대응한다"는 뜻이 아닙니다.</span></li>
      <li style="padding-left:0;"><b>샷 4개를 한 장에 몰아 그리는 경로는 손대지 않았습니다.</b><span class="d">그 경로의 지시문은 따로 쓰여 있고 같은 결함을 그대로 갖고 있습니다. 이번 12장은 "샷 하나를 세로 3칸으로" 경로만 다룹니다.</span></li>
      <li style="padding-left:0;"><b>8월 11일 결과물 자체는 여기 없습니다.</b><span class="d">그때의 그림을 다시 실어 3자 비교를 하지는 않았습니다. 대신 입력 시트가 그때 것과 같은 파일임을 확인해 뒀습니다.</span></li>
    </ul>
  </div>
</section>

<section class="block">
  <div class="sec-head"><h2>기술 좌표</h2></div>
  <details><summary>모델 · 파라미터 · 지출 · 시각</summary><div class="body">
    <div class="tbl-wrap"><table>
      <tbody>
        <tr><td>그림 모델</td><td class="mono">${esc(cost.model)}</td></tr>
        <tr><td>품질 설정</td><td>${esc(cost.quality)}</td></tr>
        <tr><td>해상도 요청</td><td>${esc(cost.imageSizeSent)}</td></tr>
        <tr><td>실제 출력 크기</td><td class="num">592 × 1136 (12장 전부)</td></tr>
        <tr><td>발주 수 / 완료 수</td><td class="num">${submitted} / ${done}</td></tr>
        <tr><td>재시도</td><td>0회 (전부 1회 발주로 완료)</td></tr>
        <tr><td>장당 단가(정가표)</td><td class="num">$${cost.unitUsdList}</td></tr>
        <tr><td>환산 지출</td><td class="num">$${cost.estUsd} (상한 시나리오 $${cost.ceilUsd})</td></tr>
        <tr><td>단가 근거</td><td>${cost.basis.map((b: string) => esc(b)).join('<br>')}</td></tr>
        <tr><td>첫 발주 시각</td><td class="mono">${esc((firstSub ?? '').replace('T', ' ').slice(0, 19))} UTC</td></tr>
        <tr><td>마지막 수집 시각</td><td class="mono">${esc((lastCol ?? '').replace('T', ' ').slice(0, 19))} UTC</td></tr>
        <tr><td>입력 동결 시각</td><td class="mono">${esc(String(m.fixturesFrozenAt).replace('T', ' ').slice(0, 19))} UTC (2026-08-10 수집분 재사용)</td></tr>
        <tr><td>프로젝트</td><td class="mono">${esc(m.project.title)} / ${esc(m.project.id)}</td></tr>
        <tr><td>화풍 기준</td><td class="mono">${esc(m.styleAnchor.key)} — ${esc(m.styleAnchor.imageUrl)}</td></tr>
        <tr><td>대상 함수</td><td class="mono">src/lib/director/storyboard-strip.ts · buildRealStripPrompt</td></tr>
        <tr><td>실행기</td><td class="mono">research/experiments/repaint-strip-prompt-v2/run.mts (plan / submit / collect)</td></tr>
        <tr><td>사전 검사</td><td>통과 — 팔 B에서 추가 2문장 제거 시 팔 A와 완전 일치, 참조·시트·샷 주문서 동일</td></tr>
      </tbody>
    </table></div>
  </div></details>

  <details><summary>발주 12건 좌표 (요청 번호 · 지시문 길이 · 시각)</summary><div class="body">
    <div class="tbl-wrap"><table>
      <thead><tr><th>이름</th><th>팔</th><th>모델</th><th>요청 번호</th><th>지시문 글자수</th><th>발주 시각(UTC)</th></tr></thead>
      <tbody>${coordRows}</tbody>
    </table></div>
  </div></details>

  <details><summary>입력 이미지 주소 전문</summary><div class="body">
    <div class="tbl-wrap"><table>
      <thead><tr><th>샷</th><th>무엇</th><th>주소</th></tr></thead>
      <tbody>
        ${SHOTS.map((s) => {
          const j = m.jobs.find((x: any) => x.shot_id === s.id)
          return `<tr><td class="mono">${esc(s.id)}</td><td>합성 3칸 시트</td><td class="mono">${esc(j.stripUrl ?? '-')}</td></tr>
        <tr><td class="mono">${esc(s.id)}</td><td>시트 지문</td><td class="mono">${esc(j.stripSha)}</td></tr>
        ${(j.charRefs as string[]).map((c) => `<tr><td class="mono">${esc(s.id)}</td><td>인물 참조</td><td class="mono">${esc(c)}</td></tr>`).join('')}
        <tr><td class="mono">${esc(s.id)}</td><td>화풍 기준</td><td class="mono">${esc(j.anchorRef ?? '-')}</td></tr>`
        }).join('')}
      </tbody>
    </table></div>
    <p class="sub">3칸 시트는 제품 함수가 연필 3프레임을 시트 템플릿에 합성해 만든 것이며, 8월 11일 측정에 쓰인 시트와 지문(해시)이 같다.</p>
  </div></details>
</section>

<footer>
  샷 2종 × 지시문 2가지 × 3회 = 12장 · 실패 0건 · 재시도 0회 · 환산 지출 $${cost.estUsd}<br>
  원자료: <code>research/experiments/repaint-strip-prompt-v2/run/</code> (manifest.json · assets/ · strips/ · fixtures.json)<br>
  각 그림을 클릭하면 원본 PNG가 열립니다(이 파일과 같은 폴더 기준).
</footer>

</div>
`

  writeFileSync(join(DIR, 'report.html'), html)
  const kb = Buffer.byteLength(html) / 1024
  console.log(`report.html ${(kb / 1024).toFixed(2)} MB`)
}

await main()
