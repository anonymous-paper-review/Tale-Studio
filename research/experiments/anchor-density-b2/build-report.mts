// 앵커 밀도 실험 리포트 — 입력(앵커 전부·depth·프롬프트 전문)과 산출(영상+프레임 격자)을 한 페이지에.
//   readable-report 철칙 2: 이 페이지만 보고 같은 발주를 재현할 수 있어야 한다.
//   대전제: 판정·점수 없음. 무엇을 넣었고 무엇이 나왔는지만.
// 실행: pnpm dlx tsx research/experiments/anchor-density/build-report.mts
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const DIR = dirname(fileURLToPath(import.meta.url))
const EMB = join(DIR, 'embed')
mkdirSync(EMB, { recursive: true })
const m = JSON.parse(readFileSync(join(DIR, 'manifest.json'), 'utf8'))

const DUR = m.duration as number
const TIMES = [0, 0.5, 1, 1.5, 2, 3, 4, 5, 6, 7].filter((t) => t <= DUR)
const THUMB_W = 210

function imgUri(src: string, key: string, w = 300): string | null {
  if (!existsSync(src)) return null
  const jpg = join(EMB, `${key}.jpg`)
  if (!existsSync(jpg)) execFileSync('ffmpeg', ['-y', '-i', src, '-vf', `scale='min(${w},iw)':-2:flags=lanczos`, '-q:v', '4', jpg], { stdio: 'ignore' })
  return `data:image/jpeg;base64,${readFileSync(jpg).toString('base64')}`
}
function vidUri(src: string, key: string): string | null {
  if (!existsSync(src)) return null
  const mp4 = join(EMB, `${key}.mp4`)
  if (!existsSync(mp4)) {
    try {
      execFileSync('ffmpeg', ['-y', '-i', src, '-vf', 'scale=480:-2:flags=lanczos', '-c:v', 'libx264',
        '-crf', '32', '-preset', 'slow', '-an', '-movflags', '+faststart', mp4], { stdio: 'ignore' })
    } catch { return null }
  }
  return `data:video/mp4;base64,${readFileSync(mp4).toString('base64')}`
}
function frameUri(src: string, key: string, t: number, dur: number): string | null {
  if (!existsSync(src) || t > dur - 0.05) return null
  const jpg = join(EMB, `f_${key}_${String(t).replace('.', 'p')}.jpg`)
  if (!existsSync(jpg)) {
    try {
      execFileSync('ffmpeg', ['-y', '-ss', String(t), '-i', src, '-frames:v', '1',
        '-vf', `scale=${THUMB_W}:-2:flags=lanczos`, '-q:v', '5', jpg], { stdio: 'ignore' })
    } catch { return null }
  }
  return existsSync(jpg) ? `data:image/jpeg;base64,${readFileSync(jpg).toString('base64')}` : null
}
function dur(src: string): number {
  try { return Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', src]).toString().trim()) } catch { return 0 }
}
const esc = (s: string) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// ── 한국어 병기 (readable-report 철칙: 원문이 외국어면 번역을 함께 싣는다) ──
const KO_BASE: Record<string, string> = {
  'anchor-density':
    '모션 계약: 카메라 — 피사체를 따라 화면 오른쪽으로 일정하게 트래킹한다(배경은 화면 왼쪽으로 흐른다). 진폭은 보통이고 7초 전 구간에 고르게 분산한다. 피사체 — 1번: "환기구를 향해 전속력으로 질주한다" — 크고 뚜렷하게 보이며 완전히 끝나는 움직임. 7초 전 구간에 걸쳐 움직임의 속도를 배분하라 — 마지막 프레임에서는 지시된 모든 움직임이 완전히 끝나 있어야 한다. 이 계약을 넘어서는 카메라 무빙·프레이밍 변화·새 인물·새 소품·추가 동작을 절대 넣지 마라. // 소녀가 좁고 녹슨 환기 통로를 향해 전속력으로 질주한다.',
  'anchor-density-b2':
    '모션 계약: 카메라 — 삼각대에 고정된 샷. 클립 전체에서 카메라 움직임이 절대 0이다: 팬 없음, 흔들림 없음, 줌 없음, 밀고 들어가기 없음. 피사체 — 1번: "굴러 내려간다" — 크고 뚜렷하게 보이며 완전히 끝나는 움직임. 환경: 먼지 구름(보통). 4초 전 구간에 걸쳐 움직임의 속도를 배분하라 — 마지막 프레임에서는 지시된 모든 움직임이 완전히 끝나 있어야 한다. 이 계약과 뒤따르는 장면 묘사를 넘어서는 카메라 무빙·프레이밍 변화·새 인물·새 소품·추가 동작을 지어내지 마라. // 소녀가 가파른 모래 언덕 아래로 몸을 던져 바닥까지 굴러 내려간다.',
}
function koAnchorClause(times: number[], withDepth: boolean, dur: number): string {
  const L: string[] = []
  if (times.length <= 1) L.push('@Image1 은 이 샷의 첫 프레임이다.')
  else {
    L.push(`이 샷의 길이는 ${dur}초다. 참조로 준 그림들은 모두 같은 샷의 "시각이 정해진 키프레임"이다:`)
    times.forEach((t, i) => {
      const w = t === 0 ? '첫 프레임' : t === dur ? '마지막 프레임' : `${t}.0초 지점의 프레임`
      L.push(`- @Image${i + 1} = ${w} (${t}.0초)`)
    })
    L.push('정확히 그 순서로, 그 시각에 이 프레임들을 지나가라. 그 사이는 부드럽게 이어 그려라.')
  }
  if (withDepth) L.push(
    `- @Image${times.length + 1} = 첫 프레임의 깊이 지도. 밝을수록 카메라에 가깝고 어두울수록 멀다.`,
    '이것은 3차원 배치만 설명한다. 공간 구조와 물체 사이의 거리를 일관되게 유지하는 데만 쓰라.',
    '절대 그대로 렌더하지 말고, 회색조를 화면에 드러내지 말고, 그 색을 그림에 섞지 마라.')
  return L.join('\n')
}
function koMidPrompt(t: number, dur: number, scene: string): string {
  return [
    `이것은 ${dur}초짜리 연속 샷의 ${t}.0초 지점 프레임이다.`,
    `@Image1 은 그 샷의 첫 프레임(0.0초), @Image2 는 마지막 프레임(${dur}.0초)이다.`,
    '그 시각에 영상을 멈춘 것처럼, 중간 프레임 한 장을 그려라.',
    '',
    `샷 전체에서 일어나는 일: ${scene}`,
    '',
    '두 참조 프레임과 같은 인물, 같은 의상, 같은 장소, 같은 그림체, 같은 선의 질, 같은 색 처리를 유지하라 —',
    '이것은 하나의 연속된 샷이지 새로 그리는 그림이 아니다.',
    '그녀의 위치와 자세, 카메라 프레이밍만 지시된 만큼 마지막 프레임 쪽으로 진행한다.',
    '글자·자막·시간 표시·테두리·칸 구분선을 넣지 마라.',
  ].join('\n')
}
const KO_DUR = m.duration as number
const KO_SCENE = String(m.shot?.action ?? m.frozen_prompt).replace(/^.*?\.\.\s*/, '')
function koFull(times: number[], withDepth: boolean, slug: string): string {
  return `${KO_BASE[slug] ?? ''}\n\n${koAnchorClause(times, withDepth, KO_DUR)}`
}


// ── 입력 자산 ──────────────────────────────────────────────────────────────
const anchorCards: string[] = []
for (const t of Array.from({ length: DUR + 1 }, (_, i) => i)) {
  const f = join(DIR, 'inputs', `anchor_${t}.png`)
  const u = imgUri(f, `anchor_${t}`)
  const made = t !== 0 && t !== DUR
  anchorCards.push(u
    ? `<figure class="acard"><img src="${u}" alt="${t}초 앵커"><figcaption><b>${t}.0초</b><br><span class="am">${made ? '이미지 생성기가 만든 중간 프레임' : t === 0 ? '원래 있던 시작 그림' : '원래 있던 끝 그림'}</span></figcaption></figure>`
    : `<figure class="acard"><div class="failbox">없음</div><figcaption><b>${t}.0초</b></figcaption></figure>`)
}
const depthUri = m.depth?.file ? imgUri(join(DIR, m.depth.file), 'depth') : null

// ── 산출: 영상 카드 + 프레임 격자 ──────────────────────────────────────────
const done = (m.jobs ?? []).filter((j: { video_url?: string }) => j.video_url)
const vidCards: string[] = []
const gridRows: string[] = []
for (const j of done) {
  const src = join(DIR, j.file)
  const vu = vidUri(src, j.key)
  const anchorTxt = j.anchor_times.map((t: number) => `${t}s`).join(' · ')
  vidCards.push(`<figure class="vcard${j.depth ? ' hasd' : ''}">
    ${vu ? `<video src="${vu}" controls preload="metadata" playsinline muted loop></video>` : '<div class="failbox">변환 실패</div>'}
    <figcaption><b>${esc(j.label)}</b><br><span class="vm">앵커 ${anchorTxt}${j.depth ? ' <b>+ depth</b>' : ''}</span></figcaption></figure>`)

  const d = dur(src)
  const cells = TIMES.map((t) => {
    const u = frameUri(src, j.key, t, d)
    const isAnchor = j.anchor_times.includes(t)
    return u ? `<td class="${isAnchor ? 'anch' : ''}"><img src="${u}" loading="lazy" alt=""></td>` : `<td class="na">—</td>`
  }).join('')
  gridRows.push(`<tr><th class="rowh"><div class="rl">${esc(j.label)}</div><div class="rm">앵커 ${anchorTxt}</div></th>${cells}</tr>`)
}

const failed = (m.jobs ?? []).filter((j: { error?: string }) => j.error)
const midFail = (m.mid_frames ?? []).filter((f: { error?: string }) => f.error)
const samplePrompt = done[0]?.prompt ?? ''
const maxJob = done.slice().sort((a: any, b: any) => (b.anchor_times?.length ?? 0) - (a.anchor_times?.length ?? 0)).find((j: any) => j.depth)
const maxPrompt = done.find((j: { key: string }) => j.key.startsWith('f8'))?.prompt ?? ''
const css = readFileSync(join(DIR, '..', 'i2i-firstframe-resolution', 'report.css'), 'utf8')

const html = `<title>앵커 밀도 2판 — 다른 그림체</title>
<style>${css}
  .wrap { max-width: 1400px; }
  .arow { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 9px; margin-top: 14px; }
  .acard, .vcard { background: var(--surface); border: 1px solid var(--line); border-radius: 8px; overflow: hidden; }
  .acard img { display: block; width: 100%; height: auto; }
  .acard figcaption, .vcard figcaption { font-size: 12px; padding: 6px 9px; border-top: 1px solid var(--line); }
  .am, .vm { font-size: 11px; color: var(--muted); }
  .vrow { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 12px; margin-top: 12px; }
  .vcard video { display: block; width: 100%; height: auto; background: #000; }
  .vcard.hasd { border-left: 3px solid var(--violet); }
  .grid-wrap { overflow-x: auto; border: 1px solid var(--line); border-radius: 8px; background: var(--surface); }
  table.grid { border-collapse: collapse; font-size: 12px; }
  table.grid th.time { position: sticky; top: 0; background: var(--surface-2); z-index: 2; font-size: 12.5px; font-weight: 750; padding: 7px 4px; text-align: center; border-bottom: 2px solid var(--line); }
  table.grid th.rowh { position: sticky; left: 0; background: var(--surface); z-index: 1; text-align: left; padding: 8px 10px; border-right: 2px solid var(--line); border-bottom: 1px solid var(--line); min-width: 185px; max-width: 185px; white-space: normal; vertical-align: top; }
  table.grid td { padding: 2px; border-bottom: 1px solid var(--line); }
  table.grid td img { display: block; width: ${THUMB_W}px; height: auto; border-radius: 3px; }
  table.grid td.anch { background: var(--accent-soft); }
  table.grid td.na { color: var(--muted); text-align: center; }
  .rl { font-size: 13px; font-weight: 750; margin-bottom: 3px; }
  .rm { font-size: 11px; color: var(--muted); }
  pre.prompt { white-space: pre-wrap; word-break: break-word; font-family: var(--mono); font-size: 11.5px; line-height: 1.6; background: var(--surface-2); border: 1px solid var(--line); border-radius: 6px; padding: 12px; margin: 0 0 10px; }
  .callout { background: var(--accent-soft); border-left: 3px solid var(--accent); padding: 12px 14px; border-radius: 0 6px 6px 0; margin: 14px 0 0; font-size: 14.5px; }
  .note { color: var(--muted); font-size: 13.5px; }
  ul.plain { margin: 0; padding-left: 18px; }
  ul.plain li { margin-bottom: 9px; font-size: 14.5px; }
  .failbox { padding: 34px 12px; text-align: center; color: var(--violet); background: var(--violet-soft); font-weight: 700; font-size: 13px; }
</style>
<div class="wrap">

<header class="page">
  <p class="kicker">실험 산출 · 판정 대기</p>
  <h1>앵커 밀도 2판 — 다른 그림체에서도 같은가</h1>
  <p class="standfirst">1판(소녀 스토리)과 <b>같은 포맷</b>으로 그림체만 바꿨습니다. 시작 그림과 끝 그림 사이를 이미지 생성기로 1초마다 채우고, 영상 생성기에 <b>1장 · 2장 · 3장 · 4장 · 5장</b>으로 나눠 넣었습니다. 각 조건마다 <b>시작 그림의 깊이 지도를 함께 넣은 짝</b>을 두어 두 배로 돌렸습니다. <b>판정은 하지 않았습니다.</b></p>
  <p class="asof">2026년 8월 12일 · 영상 ${done.length}편${failed.length ? ` · 실패 ${failed.length}편` : ''} · 크레딧 ${m.credits_spent} · 원장 <code>research/experiments/anchor-density/</code></p>
</header>

<section class="block">
  <div class="sec-head"><h2>무엇을 묻는가</h2></div>
  <div class="callout" style="margin-bottom:14px">
    <b>이건 2판입니다.</b> 1판은 소녀 스토리(일본 애니 계열 그림체)로 돌렸고, 이번은 <b>같은 포맷 그대로 그림체만 바꾼 것</b>입니다 —
    작품 <b>${esc(m.project.title)}</b> · 그림체 <b>${esc(m.project.style_anchor)}</b> · 컷 <span class="mono">${esc(m.shot.id)}</span> (씬4, ${m.shot.duration}초).
    <br><span class="note"><b>당신이 지목한 컷</b>입니다 — 앞서 돌린 배수관 컷은 시작 그림이 잘못돼 정성 평가가 불가했습니다. 이 컷은 <b>카메라가 고정</b>이고 인물만 크게 움직여(가파른 모래 언덕 아래로 몸을 던져 굴러 내려감), 변인이 인물 움직임 하나로 좁혀집니다. 시작(언덕 위)과 끝(바닥)의 차이가 커서 중간 앵커가 실제로 채울 것이 있습니다.</span>
  </div>
  <p><b>가설(오너)</b>: 이미지 생성기가 가진 맥락을 <b>단 한 장으로만</b> 영상 생성기에게 설명하는 것이 병목이다.</p>
  <p>근거가 된 관찰: 시작 그림과 끝 그림을 같이 넣었을 때가 시작 그림 하나에 잡다한 이미지를 붙였을 때보다 <b>그림체 유지가 좋았다</b> — 다만 공간적 자연스러움은 좀 덜했다.</p>
  <p>그래서 사이를 채워 봅니다. 앵커가 늘수록 계속 좋아지는지, 아니면 <b>어느 지점부터 오히려 방해가 되는지</b>가 이 실험이 찾는 것입니다.</p>
  <div class="callout">
    <b>시간을 지정하는 입력 항목이 없습니다.</b> 영상 모델의 입력에는 이미지마다 “이건 2초 지점”이라고 붙일 자리가 없습니다(확인함). 그래서 시간은 <b>프롬프트 문장으로만</b> 알려줬습니다.
    덕분에 이 실험은 두 층을 같이 잽니다 — ① 앵커를 여러 장 주면 좋아지는가 ② <b>시간을 말해주면 그 시간을 지키는가</b>.
  </div>
</section>

<section class="block">
  <div class="sec-head"><h2>넣은 앵커</h2><span class="lede">0초와 7초는 원래 있던 것, 나머지는 만든 것</span></div>
  <p class="note">모든 앵커를 <b>${esc(m.anchor_size)}</b>. 중간 프레임만 크면 “앵커 개수” 대신 “크기”를 재게 되므로 맞췄습니다.</p>
  <div class="arow">${anchorCards.join('\n')}</div>
  ${depthUri ? `<h3 style="font-size:15px;margin:20px 0 8px">함께 넣은 깊이 지도</h3>
  <div class="arow"><figure class="acard"><img src="${depthUri}" alt="깊이 지도"><figcaption><b>시작 그림의 깊이 지도</b><br><span class="am">밝을수록 가깝고 어두울수록 멉니다. 12편 중 절반에만 추가로 넣었습니다.</span></figcaption></figure></div>
  <p class="note" style="margin-top:8px">${esc(m.depth.cost_note)}</p>` : ''}
  ${midFail.length ? `<p class="note" style="margin-top:10px">⚠️ 중간 프레임 ${midFail.length}장이 생성에 실패했습니다: ${midFail.map((f: { t: number }) => `${f.t}초`).join(', ')}. 그 앵커가 필요한 조건은 발주에서 빠졌습니다.</p>` : ''}
</section>

<section class="block">
  <div class="sec-head"><h2>조건</h2></div>
  <div class="tbl-wrap"><table>
    <tr><th>조건</th><th>시작</th><th>중간 앵커</th><th>끝</th><th>깊이 지도</th><th>총 장수</th></tr>
    ${(m.jobs ?? []).map((j: { label: string; anchor_times: number[]; depth: boolean; video_url?: string; error?: string }) => {
      const mid = j.anchor_times.slice(1, -1)
      const hasEnd = j.anchor_times.length > 1
      return `<tr><td><b>${esc(j.label)}</b>${j.error ? ' <span class="chip c-stop">실패</span>' : ''}</td><td>0초</td><td>${mid.length ? mid.map((t) => `${t}초`).join(' · ') : '—'}</td><td>${hasEnd ? '7초' : '—'}</td><td>${j.depth ? '넣음' : '—'}</td><td class="num">${j.anchor_times.length + (j.depth ? 1 : 0)}</td></tr>`
    }).join('')}
  </table></div>
  <p class="note">프롬프트 본문·모델·길이(7초)·해상도(720p)·화면비(${esc(m.aspect_ratio)})는 전부 고정. <b>변인은 앵커 구성 하나</b>입니다.</p>
  <details>
    <summary>프롬프트 전문 — 가장 적은 조건(1장)</summary>
    <div class="body">
      <p class="note"><b>한국어</b></p>
      <pre class="prompt">${esc(koFull(done[0]?.anchor_times ?? [0], Boolean(done[0]?.depth), 'anchor-density-b2'))}</pre>
      <p class="note"><b>실제로 보낸 원문(영어)</b></p>
      <pre class="prompt">${esc(samplePrompt)}</pre>
    </div>
  </details>
  <details>
    <summary>프롬프트 전문 — 가장 많은 조건(앵커 최대 + 깊이 지도)</summary>
    <div class="body">
      <p class="note"><b>한국어</b></p>
      <pre class="prompt">${esc(koFull(maxJob?.anchor_times ?? [0], true, 'anchor-density-b2'))}</pre>
      <p class="note"><b>실제로 보낸 원문(영어)</b></p>
      <pre class="prompt">${esc(maxPrompt)}</pre>
    </div>
  </details>
  <details>
    <summary>중간 프레임을 만들 때 준 지시문</summary>
    <div class="body">
      <p class="note"><b>한국어</b> (아래는 1.0초 프레임을 만들 때의 예 — 시각만 바뀝니다)</p>
      <pre class="prompt">${esc(koMidPrompt(1, KO_DUR, KO_SCENE))}</pre>
      <p class="note"><b>실제로 보낸 원문(영어)</b></p>
      <pre class="prompt">${esc((m.mid_frames ?? []).find((f: { prompt?: string }) => f.prompt)?.prompt ?? '')}</pre>
    </div>
  </details>
</section>

<section class="block">
  <div class="sec-head"><h2>영상</h2><span class="lede">${done.length}편 · 소리 없음</span></div>
  <p class="note">왼쪽에 보라색 선이 있는 것이 깊이 지도를 함께 넣은 짝입니다.</p>
  <div class="vrow">${vidCards.join('\n')}</div>
</section>

<section class="block">
  <div class="sec-head"><h2>프레임 격자</h2><span class="lede">행 = 조건 · 열 = 시간(초)</span></div>
  <p class="note"><b>주황색 칸이 앵커를 넣은 시각</b>입니다. 그 칸에서 실제로 그 그림 근처를 지나가는지, 아니면 무시하고 딴 데 있는지가 “시간을 말하면 지키는가”의 답입니다.</p>
  <div class="grid-wrap"><table class="grid">
    <tr><th class="rowh">조건</th>${TIMES.map((t) => `<th class="time">${t}초</th>`).join('')}</tr>
    ${gridRows.join('\n')}
  </table></div>
</section>

<section class="block">
  <div class="sec-head"><h2>봐야 할 것</h2></div>
  <ul class="plain">
    <li><b>앵커가 늘수록 계속 좋아지는가</b> — 1장 → 2장 → 3장 → 4장 → 5장 → 8장 순으로 훑으면서, 어디까지 나아지고 어디부터 그만 나아지는지.</li>
    <li><b>어디부터 오히려 나빠지는가</b> — 앵커가 많아지면 모델이 그 사이를 억지로 이어 붙이느라 움직임이 끊기거나 튈 수 있습니다. 그 지점이 “과잉 맥락”의 경계입니다.</li>
    <li><b>말한 시간을 지키는가</b> — 격자의 주황 칸을 보면 됩니다. 안 지킨다면 앵커를 늘리는 것은 “시간 통제”가 아니라 “재료를 더 주는 것”에 그칩니다.</li>
    <li><b>깊이 지도가 값을 하는가</b> — 같은 앵커 개수끼리 짝지어 보세요. 공간이 덜 무너지면 값을 한 것이고, 회색이 새어 나오면 오염입니다.</li>
    <li><b>그림체 유지</b> — 당신이 원래 좋다고 본 축입니다. 2장(시작+끝)보다 더 나아지는 지점이 있는지.</li>
  </ul>
</section>

<section class="block">
  <div class="sec-head"><h2>정직 보고</h2></div>
  <ul class="plain">
    <li><b>이 작품은 한 세대 앞의 것입니다.</b> ${esc(m.fixture_note)} 그림체 비교가 목적이라 지목된 작품이므로 그대로 진행했고, <b>결론의 유효 범위는 이 세대로 한정</b>됩니다.</li>
    <li><b>이 판은 재실행입니다.</b> 같은 작품의 다른 컷(배수관 진입)으로 먼저 12편을 돌렸으나 <b>시작 그림이 잘못돼 정성 평가가 불가</b>했습니다. 그 판의 원자료는 <span class="mono">research/experiments/anchor-density-b/</span> 에 지우지 않고 남겨 두었습니다(같은 컷을 다시 고르지 않기 위해).</li>
    <li><b>중간 프레임 한 장이 첫 시도에 실패했다가 재시도로 성공했습니다.</b> 프롬프트도 참조도 그대로였으므로 <b>일시적 실패</b>입니다. 무인 실행에서는 이런 실패 한 건이 그 앵커를 쓰는 조건을 통째로 빠뜨리므로, 자동 재시도를 넣는 것이 다음 개선점입니다.</li>
    <li><b>프롬프트 안에 카메라 지시가 두 개 있었습니다 — 서로 반대 방향으로.</b> 제품이 만드는 프롬프트에는 새 방식의 카메라 계약문과 옛 방식의 숫자 축(좌우·상하 값)이 <b>둘 다</b> 들어갑니다. 이 컷에서는 계약문이 “피사체를 따라 화면 안쪽으로 들어간다”인데 꼬리에 붙는 옛 문장은 <b>“카메라가 오른쪽으로 이동하고 위로 젖힌다”</b>였습니다. 1판에는 그 꼬리가 없었으므로, 두 판을 그림체만 다르게 비교하려고 이번에는 옛 축을 빼고 발주했습니다. <b>이 모순 자체는 이 실험의 변인이 아니라 제품 결함 후보</b>이며 원장에 원문을 남겼습니다.</li>
    <li><b>중간 프레임의 품질은 통제하지 않았습니다.</b> 이미지 생성기에 “7초 중 N초 시점”이라고 문장으로 지시했을 뿐이라, 그 프레임이 정말 그 시점인지는 보장되지 않습니다. 당신이 나중에 변인 통제해서 따로 보겠다고 한 부분입니다.</li>
    <li><b>시간 지정이 프롬프트 문장뿐입니다.</b> 모델 입력에 시간 필드가 없어서입니다 — 구조적 지정이 아니라 부탁에 가깝습니다.</li>
    <li><b>화면비를 4:3으로 고정했습니다.</b> 앵커 원본 비율(379×257 = 1.475)에 가장 가까운 선택지입니다. 자동으로 두면 편마다 기하가 갈립니다(지난 실험에서 같은 발주에 4:3과 16:9가 섞여 나온 실측이 있습니다).</li>
    <li><b>깊이 지도는 시작 그림 것 하나뿐입니다.</b> 앵커마다 깊이를 만들지 않았습니다 — 이번 변인은 “깊이를 주는가 마는가”이지 “몇 장 주는가”가 아닙니다.</li>
    <li><b>영상 모델은 크레딧으로, 깊이 지도만 현금입니다.</b> 사용한 플랫폼에 깊이 추정기가 없어 그 한 장만 다른 곳에서 만들었습니다.</li>
    ${failed.length ? `<li><b>영상 ${failed.length}편이 실패했습니다.</b> 사유는 원장에 남겼습니다.</li>` : ''}
  </ul>
</section>

<footer>
  <p>영상 <span class="mono">${esc(m.model.video)}</span> · 중간 프레임 <span class="mono">${esc(m.model.image)}</span> · 깊이 지도 <span class="mono">${esc(m.model.depth)}</span></p>
  <p>같은 샷의 이전 판 14편(조건별 시간축 대조): <span class="mono">research/experiments/firstframe-decay-map/</span> · 발주 payload 전문은 <span class="mono">manifest.json</span></p>
  <p>판정 없음 — 이미지·영상 해석은 오너 전용(<span class="mono">.claude/rules/experiments.md</span> 대전제).</p>
</footer>

</div>`

writeFileSync(join(DIR, 'report.html'), html)
console.log(`report.html — ${(Buffer.byteLength(html) / 1024 / 1024).toFixed(2)} MB · 영상 ${done.length}편`)
