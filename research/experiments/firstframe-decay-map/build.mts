// 첫 그림 이후 무엇이 언제 무너지는가 — 시간축 대조 지도 (발주 0, 기존 클립 재사용)
//
// 오너 관찰(2026-08-12): "첫 그림 이후가 엄청 어색하다" — 성분을 물으니 넷 다 해당:
//   ①인물이 변한다 ②공간이 다른 데로 간다 ③움직임이 이상하다 ④카메라·시간 배분이 이상하다.
// 가설: 넷은 각각의 병이 아니라 **참조 구속력의 시간 감쇠** 하나가 네 얼굴로 나타난 것이다.
//   참이면 한 클립 안에서 네 증상의 시작 시각이 서로 가깝다. 거짓이면 흩어진다.
//   기각 조건: 한 클립 안 성분 간 시작 시각 편차가 2초 이상이면 단일 원인 가설 기각(성분별 분리).
// 측정: 같은 샷(sh_04_16) 14편을 행, 시간을 열로 놓은 프레임 격자. **표시는 오너가 한다** —
//   이미지 해석은 오너 전용(rules/experiments.md 대전제). 이 스크립트는 격자만 만든다.
//
// 실행: pnpm dlx tsx research/experiments/firstframe-decay-map/build.mts
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const DIR = dirname(fileURLToPath(import.meta.url))
const AB = join(DIR, '..', 'previz-video-reference-ab')
const CACHE = join(DIR, 'frames')
mkdirSync(CACHE, { recursive: true })

// ── 클립 재고 (전부 sh_04_16 소녀 질주 · 조건만 다름) ──────────────────────
// 조건 서술은 각 폴더 notes.md 의 "넣은 것" 표에서 옮긴 것. 판별기 B(같은 지시·다른 참조)가
//   사실상 이미 실행돼 있었고, 지금까지 한 자리에 모아 시간축으로 대조한 적이 없다.
type Clip = { key: string; file: string; group: string; label: string; vref: string; start: string; endref: string; prompt: string }
const CLIPS: Clip[] = [
  { key: 'q1_a', file: 'qualitative/out_a.mp4', group: '1차 · 전달 3방식', label: '텍스트 계약만', vref: '없음', start: 'START 원본', endref: '없음', prompt: '동결 계약문' },
  { key: 'q1_b', file: 'qualitative/out_b.mp4', group: '1차 · 전달 3방식', label: '+ 끝 그림', vref: '없음', start: 'START 원본', endref: '**END 추가**', prompt: '동결 계약문' },
  { key: 'q1_c', file: 'qualitative/out_c.mp4', group: '1차 · 전달 3방식', label: '+ 3D 참조 영상', vref: '**블록아웃 v2**', start: 'START 원본', endref: '없음', prompt: '동결 계약문' },
  { key: 'q3_txt', file: 'qual3-timed/out_txt.mp4', group: '3차 · 초 단위 지시', label: '초 표기, 3D 없음', vref: '없음', start: 'START 원본', endref: '없음', prompt: '**타임코드 3구간**' },
  { key: 'q3_t3d', file: 'qual3-timed/out_t3d.mp4', group: '3차 · 초 단위 지시', label: '초 표기 + 3D', vref: '블록아웃 v2', start: 'START 원본', endref: '없음', prompt: '**타임코드 3구간**' },
  { key: 'q4_b', file: 'qual4-grammar/out_b.mp4', group: '4차 · 문법 재작성', label: '초 제거, 순서형', vref: '블록아웃 v2', start: 'START 원본', endref: '없음', prompt: '순서 서술' },
  { key: 'q4_c', file: 'qual4-grammar/out_c.mp4', group: '4차 · 문법 재작성', label: '+ 참조 역할 계약', vref: '블록아웃 v2', start: 'START 원본', endref: '없음', prompt: '순서 + **역할 계약**' },
  { key: 'q4_d', file: 'qual4-grammar/out_d.mp4', group: '4차 · 문법 재작성', label: '+ 이동량 절반', vref: '블록아웃 v2', start: 'START 원본', endref: '없음', prompt: '역할 계약 + **이동량 절반**' },
  { key: 'q4_e', file: 'qual4-grammar/out_e.mp4', group: '4차 · 문법 재작성', label: '+ 정면 구간 운동', vref: '블록아웃 v2', start: 'START 원본', endref: '없음', prompt: '역할 계약 + **정면 운동 3문장**' },
  { key: 'q5_fg', file: 'qual5-parallax/out_fg3d.mp4', group: '5차 · 시차', label: '3D에 전경 기둥 추가', vref: '**블록아웃 v3(전경)**', start: 'START 원본', endref: '없음', prompt: '3차와 동일' },
  { key: 'q5_no', file: 'qual5-parallax/out_nofg.mp4', group: '5차 · 시차', label: '시작 그림에서 전경 제거', vref: '블록아웃 v2', start: '**변형본 1088×608**', endref: '없음', prompt: '3차와 동일' },
  { key: 'q7_f1', file: 'qual7-rewrite/out_f1.mp4', group: '7차 · 보드 방향 교정', label: '재작성, 참조 그림만', vref: '없음', start: 'START 원본', endref: '없음', prompt: '**전면 재작성**' },
  { key: 'q7_f2', file: 'qual7-rewrite/out_f2.mp4', group: '7차 · 보드 방향 교정', label: '재작성 + 3D', vref: '블록아웃 v2', start: 'START 원본', endref: '없음', prompt: '재작성 + 역할 계약' },
  { key: 'q7_f3', file: 'qual7-rewrite/out_f3.mp4', group: '7차 · 보드 방향 교정', label: '재작성 + 끝 그림', vref: '없음', start: 'START 원본', endref: '**END 추가**', prompt: '재작성 + 수렴 문구' },
]

const TIMES = [0, 0.5, 1, 1.5, 2, 3, 4, 5, 6, 7]
const THUMB_W = 232

function probeDuration(path: string): number {
  const out = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', path]).toString().trim()
  return Number(out)
}

function frameUri(clip: Clip, t: number, dur: number): string | null {
  if (t > dur - 0.05) return null
  const jpg = join(CACHE, `${clip.key}_${String(t).replace('.', 'p')}.jpg`)
  if (!existsSync(jpg)) {
    execFileSync('ffmpeg', ['-y', '-ss', String(t), '-i', join(AB, clip.file), '-frames:v', '1',
      '-vf', `scale=${THUMB_W}:-2:flags=lanczos`, '-q:v', '5', jpg], { stdio: 'ignore' })
  }
  if (!existsSync(jpg)) return null
  return `data:image/jpeg;base64,${readFileSync(jpg).toString('base64')}`
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const bold = (s: string) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')

// 영상 자체도 페이지에 싣는다 (오너 요청 — 프레임과 영상을 같이 본다).
//   Artifact 는 외부 호스트를 막으므로 파일에 직접 넣어야 한다 → 폭 480·무음으로 줄여 data URI.
const VID_CACHE = join(DIR, 'clips')
mkdirSync(VID_CACHE, { recursive: true })
function videoUri(clip: Clip): string | null {
  const mp4 = join(VID_CACHE, `${clip.key}.mp4`)
  if (!existsSync(mp4)) {
    try {
      execFileSync('ffmpeg', ['-y', '-i', join(AB, clip.file), '-vf', 'scale=480:-2:flags=lanczos',
        '-c:v', 'libx264', '-crf', '32', '-preset', 'slow', '-an', '-movflags', '+faststart', mp4], { stdio: 'ignore' })
    } catch { return null }
  }
  if (!existsSync(mp4)) return null
  return `data:video/mp4;base64,${readFileSync(mp4).toString('base64')}`
}

// ── 격자 조립 ───────────────────────────────────────────────────────────────
const rows: string[] = []
const vidCards: string[] = []
let lastVidGroup = ''
let lastGroup = ''
for (const c of CLIPS) {
  const path = join(AB, c.file)
  if (!existsSync(path)) { console.log(`없음 — skip: ${c.file}`); continue }
  const dur = probeDuration(path)

  // 영상 카드 (격자와 같은 순서·같은 라벨 — 두 보기를 눈으로 짝지을 수 있게)
  const vuri = videoUri(c)
  if (c.group !== lastVidGroup) {
    vidCards.push(`<h3 class="vgrp">${esc(c.group)}</h3><div class="vrow">`)
    if (lastVidGroup) vidCards.splice(vidCards.length - 1, 0, '</div>')
    lastVidGroup = c.group
  }
  vidCards.push(vuri
    ? `<figure class="vcard"><video src="${vuri}" controls preload="metadata" playsinline muted loop></video>
       <figcaption><b>${bold(c.label)}</b><br><span class="vm">참조영상 ${bold(c.vref)} · 시작그림 ${bold(c.start)} · 끝그림 ${bold(c.endref)}<br>지시 ${bold(c.prompt)}</span></figcaption></figure>`
    : `<figure class="vcard"><div class="failbox">영상 변환 실패</div><figcaption><b>${bold(c.label)}</b></figcaption></figure>`)
  if (c.group !== lastGroup) {
    rows.push(`<tr class="grp"><td colspan="${TIMES.length + 1}">${esc(c.group)}</td></tr>`)
    lastGroup = c.group
  }
  const cells = TIMES.map((t) => {
    const uri = frameUri(c, t, dur)
    return uri
      ? `<td><img src="${uri}" alt="${esc(c.label)} ${t}초" loading="lazy"></td>`
      : `<td class="na">—</td>`
  }).join('')
  rows.push(`<tr>
    <th class="rowh">
      <div class="rl">${bold(c.label)}</div>
      <div class="rm">참조영상 ${bold(c.vref)}<br>시작그림 ${bold(c.start)}<br>끝그림 ${bold(c.endref)}<br>지시 ${bold(c.prompt)}</div>
      <div class="rd">${dur.toFixed(2)}초</div>
    </th>${cells}</tr>`)
  console.log(`격자 행 완성: ${c.key} (${dur.toFixed(2)}s)`)
}

const css = readFileSync(join(DIR, '..', 'i2i-firstframe-resolution', 'report.css'), 'utf8')

const html = `<title>첫 그림 이후 무엇이 언제 무너지는가</title>
<style>${css}
  .wrap { max-width: 1400px; }
  .grid-wrap { overflow-x: auto; border: 1px solid var(--line); border-radius: 8px; background: var(--surface); }
  table.grid { border-collapse: collapse; font-size: 12px; }
  table.grid th.time { position: sticky; top: 0; background: var(--surface-2); z-index: 2; font-size: 12.5px; color: var(--ink); font-weight: 750; padding: 7px 4px; text-align: center; border-bottom: 2px solid var(--line); }
  table.grid th.rowh { position: sticky; left: 0; background: var(--surface); z-index: 1; text-align: left; padding: 8px 10px; border-right: 2px solid var(--line); border-bottom: 1px solid var(--line); min-width: 210px; max-width: 210px; white-space: normal; vertical-align: top; }
  table.grid td { padding: 2px; border-bottom: 1px solid var(--line); vertical-align: top; }
  table.grid td img { display: block; width: ${THUMB_W}px; height: auto; border-radius: 3px; }
  table.grid td.na { color: var(--muted); text-align: center; font-size: 18px; }
  tr.grp td { background: var(--accent-soft); color: var(--accent-ink); font-weight: 750; font-size: 13px; padding: 6px 10px; position: sticky; left: 0; }
  .rl { font-size: 13.5px; font-weight: 750; color: var(--ink); margin-bottom: 4px; }
  .rm { font-size: 11px; color: var(--muted); line-height: 1.5; }
  .rd { font-size: 11px; color: var(--muted); font-family: var(--mono); margin-top: 4px; }
  .marker { display:grid; grid-template-columns: repeat(auto-fit, minmax(230px,1fr)); gap: 10px; margin-top: 14px; }
  .mk { background: var(--surface); border: 1px solid var(--line); border-left: 3px solid var(--accent); border-radius: 0 6px 6px 0; padding: 11px 13px; }
  .mk b { display:block; font-size: 14px; margin-bottom: 3px; }
  .mk span { font-size: 12.5px; color: var(--muted); }
  .vgrp { font-size: 14px; font-weight: 750; color: var(--accent-ink); margin: 20px 0 8px; padding-bottom: 5px; border-bottom: 1px solid var(--line); }
  .vrow { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 12px; }
  .vcard { background: var(--surface); border: 1px solid var(--line); border-radius: 8px; overflow: hidden; }
  .vcard video { display: block; width: 100%; height: auto; background: #000; }
  .vcard figcaption { font-size: 13px; padding: 8px 10px; border-top: 1px solid var(--line); color: var(--ink); }
  .vm { font-size: 11px; color: var(--muted); line-height: 1.5; }
</style>
<div class="wrap">

<header class="page">
  <p class="kicker">시간축 대조 · 발주 $0</p>
  <h1>첫 그림 이후, 무엇이 언제 무너지는가</h1>
  <p class="standfirst">같은 샷(소녀 질주)으로 이미 만들어 둔 클립 ${CLIPS.length}편을 <b>행은 조건, 열은 시간</b>으로 한 자리에 폈습니다. 새로 만든 것은 없습니다 — 지금까지 조건마다 따로 보기만 했지, 시간축으로 나란히 대조한 적이 없었습니다.</p>
  <p class="asof">2026년 8월 12일 · 기존 클립 재사용 · 지출 $0 · 원장 <code>research/experiments/firstframe-decay-map/</code></p>
</header>

<section class="block">
  <div class="sec-head"><h2>무엇을 가르려는가</h2></div>
  <p>“첫 그림 이후가 어색하다”에서 어색함의 성분을 물었더니 <b>넷 다 해당</b>이었습니다 — 인물이 변한다 · 공간이 다른 데로 간다 · 움직임이 이상하다 · 카메라와 시간 배분이 이상하다.</p>
  <p>넷이 동시에 나온다면 가능성은 둘입니다.</p>
  <div class="tbl-wrap"><table>
    <tr><th>가능성</th><th>참이라면 이 격자에서 보일 것</th><th>그러면 처방은</th></tr>
    <tr><td><b>원인이 하나</b><br>참조의 힘이 시간이 갈수록 약해진다</td><td>한 줄(한 조건) 안에서 네 증상이 <b>대체로 같은 열부터</b> 함께 시작된다</td><td>“참조를 얼마나 오래 붙잡아 두는가” 한 문제로 좁혀진다</td></tr>
    <tr><td><b>원인이 넷</b><br>각각 다른 병</td><td>성분마다 시작하는 열이 <b>제각각</b>이다</td><td>성분별로 실험을 쪼개야 한다</td></tr>
  </table></div>
  <p class="note">기각 조건(사전 등록): 한 조건 안에서 네 증상의 시작 시각이 <b>2초 이상 벌어지면</b> “원인이 하나” 가설을 접고 성분별로 분리합니다.</p>
</section>

<section class="block">
  <div class="sec-head"><h2>표시해 주실 것</h2></div>
  <p>제가 판정하지 않습니다 — 그림이 어떻게 보이는지는 당신만 판단합니다. 각 줄에서 <b>몇 초 칸부터</b> 아래 넷이 시작되는지만 짚어 주시면 됩니다.</p>
  <div class="marker">
    <div class="mk"><b>① 인물이 변한다</b><span>얼굴·체형·의상이 첫 칸과 달라지기 시작하는 열</span></div>
    <div class="mk"><b>② 공간이 다른 데로 간다</b><span>벽·재질·구조가 다른 공간으로 바뀌기 시작하는 열</span></div>
    <div class="mk"><b>③ 움직임이 이상하다</b><span>미끄러짐·늘어남·부자연스러운 꿈틀거림이 보이는 열</span></div>
    <div class="mk"><b>④ 카메라·시간 배분</b><span>카메라가 딴 데로 가거나, 할 일이 끝나 멈춰 있는 열</span></div>
  </div>
  <p class="note" style="margin-top:12px">넷 다 없는 줄이 있으면 그것도 값어치가 큽니다 — <b>어떤 조건이 안 무너지는지</b>가 곧 처방이기 때문입니다.</p>
</section>

<section class="block">
  <div class="sec-head"><h2>영상으로 보기</h2><span class="lede">아래 격자와 같은 순서·같은 이름</span></div>
  <p class="note">프레임 격자는 “몇 초부터”를 짚기 좋고, 영상은 움직임의 어색함(미끄러짐·꿈틀거림처럼 정지 화면에 안 잡히는 것)을 보기 좋습니다. 같은 조건을 두 방식으로 나란히 두었습니다. 소리는 뺐습니다.</p>
  ${vidCards.join('\n')}</div>
</section>

<section class="block">
  <div class="sec-head"><h2>격자</h2><span class="lede">행 = 조건 · 열 = 시간(초)</span></div>
  <p class="note">가로로 읽으면 한 조건이 시간에 따라 어떻게 가는지, 세로로 읽으면 같은 시각에 조건들이 어떻게 갈리는지 보입니다. 왼쪽 열과 맨 윗줄은 스크롤해도 고정됩니다.</p>
  <div class="grid-wrap">
    <table class="grid">
      <tr><th class="rowh">조건</th>${TIMES.map((t) => `<th class="time">${t}초</th>`).join('')}</tr>
      ${rows.join('\n')}
    </table>
  </div>
</section>

<section class="block">
  <div class="sec-head"><h2>이 격자가 겸하는 것</h2></div>
  <p>조건들이 이미 <b>참조를 바꿔가며</b> 만들어져 있었기 때문에, 이 한 장이 “생성기가 범인인가 입력이 범인인가”의 절반도 같이 답합니다.</p>
  <ul class="plain">
    <li><b>참조 영상(3D)이 있고 없고</b> — 있는 줄과 없는 줄이 같은 열에서 무너지면 3D는 무관합니다.</li>
    <li><b>끝 그림이 있고 없고</b> — 끝 그림을 준 줄이 더 오래 버티면 그것이 붙잡는 장치라는 뜻입니다.</li>
    <li><b>시작 그림이 크고 작고</b> — 5차의 한 줄만 시작 그림이 1088×608이고 나머지는 379×257입니다.</li>
    <li><b>지시문 방식</b> — 초 단위 표기, 순서 서술, 역할 계약, 전면 재작성이 각각 다른 줄입니다.</li>
  </ul>
  <p class="note">다만 이 격자로는 <b>생성기 자체의 분산</b>은 못 가릅니다 — 그건 같은 입력으로 여러 번 돌려야 보이고, 지금 모든 줄이 1편씩입니다. 그 판별은 이 표시 결과를 보고 필요할 때 설계하겠습니다.</p>
</section>

<footer>
  <p>클립 출처 <span class="mono">research/experiments/previz-video-reference-ab/</span> · 전부 같은 샷 <span class="mono">sh_04_16</span> · 새 발주 없음</p>
  <p>판정 없음 — 이미지·영상 해석은 오너 전용(<span class="mono">.claude/rules/experiments.md</span> 대전제).</p>
</footer>

</div>`

writeFileSync(join(DIR, 'report.html'), html)
console.log(`\nreport.html — ${(Buffer.byteLength(html) / 1024 / 1024).toFixed(2)} MB`)
