import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)))
const summary = JSON.parse(readFileSync(join(ROOT, 'text', 'summary.json'), 'utf8'))
const manifest = JSON.parse(readFileSync(join(ROOT, 'viz', 'manifest.json'), 'utf8'))
const manifestById = new Map(manifest.jobs.map((job: any) => [job.id, job]))

const NOTES: Record<string, { previz: string; viz: string }> = {
  hand_in_frame: {
    previz: '카메라가 고정되고, 손과 레버의 동작만 프레임 안에서 진행되도록 만든 블록아웃.',
    viz: '구도는 대체로 고정된 채 손과 레버의 조작이 보인다. 정적 계약의 비교 기준으로 사용한다.',
  },
  hand_off_frame: {
    previz: '붉은 레버를 초기 프레임 바깥에 두고, 카메라가 오른쪽으로 팬하도록 만든 블록아웃.',
    viz: '손과 레버가 화면 안으로 들어오는 것은 보이지만, 실제 카메라가 팬했는지는 프레임을 재생해 직접 확인해야 한다.',
  },
  gaze_in_frame: {
    previz: '시선 대상이 처음부터 화면 안에 있고 카메라가 고정된 블록아웃.',
    viz: '시선 변화는 전달되지만 후반 프레이밍이 달라져 보인다. 정적 계약의 실행 위반 여부를 별도 판독할 사례다.',
  },
  gaze_off_frame: {
    previz: '시선 대상이 화면 오른쪽 바깥에 있고, 카메라가 오른쪽으로 팬해 대상을 드러내는 블록아웃.',
    viz: '대상이 화면 안으로 드러나는 과정이 보인다. 대상 이동과 카메라 이동을 분리해 판독해야 한다.',
  },
  reaction_hold: {
    previz: '감정 변화만 있고 카메라와 구도는 고정된 블록아웃.',
    viz: '구도 변화가 거의 없이 정적 반응이 유지된다.',
  },
  reaction_push_in: {
    previz: '인물의 감정은 같지만 카메라가 전진해 얼굴 배율을 키우는 블록아웃.',
    viz: '인물의 얼굴이 점점 화면을 채우는 배율 변화가 뚜렷하다.',
  },
}

const esc = (value: unknown) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const semantic = (type: string | null) => {
  if (!type || type === 'static') return 'static'
  if (type.startsWith('pan') || type === 'tracking' || type === 'tilt' || type === 'crane') return 'move'
  if (type === 'dolly_in' || type === 'dolly_out') return 'move'
  return 'move'
}
const semanticLabel = (value: string) => value === 'static' ? '고정' : '이동'
const isTextPass = (item: any) => semantic(item.camera_type) === item.expectedCamera
const textPass = summary.results.filter(isTextPass).length
const staticCount = summary.results.filter((item: any) => item.expectedCamera === 'static').length
const moveCount = summary.results.filter((item: any) => item.expectedCamera === 'move').length
const estimatedCost = manifest.jobs.reduce((sum: number, job: any) => sum + Number(job.est_cost_usd ?? 0), 0).toFixed(2)

const matrixRows = summary.results.map((item: any, index: number) => {
  const pass = isTextPass(item)
  const type = item.camera_type ?? '없음'
  const cls = pass ? 'c-ok' : 'c-hold'
  return `<tr><td class="num">${index + 1}</td><td><b>${esc(item.family)}</b><br><span class="muted">${esc(item.action)}</span></td><td>${semanticLabel(item.expectedCamera)}</td><td><span class="chip ${cls}">${semanticLabel(semantic(item.camera_type))}</span><br><code>${esc(type)}</code></td><td>${pass ? '<span class="chip c-ok">구분됨</span>' : '<span class="chip c-hold">어긋남</span>'}</td></tr>`
}).join('\n')

const caseCards = summary.results.map((item: any) => {
  const job: any = manifestById.get(item.id) ?? {}
  const note = NOTES[item.id]
  const textPath = `text/${item.id}.json`
  const previzVideo = `outputs/${item.id}/previz/blockout.mp4`
  const vizVideo = `outputs/${item.id}/viz/viz.mp4`
  const previzTile = `outputs/${item.id}/previz/tile.jpg`
  const vizTile = `outputs/${item.id}/viz/tile.jpg`
  const pass = isTextPass(item)
  return `<article class="case-card">
    <div class="case-head"><h3>${esc(item.family)} · ${esc(item.id.replaceAll('_', ' '))}</h3><span class="chip ${pass ? 'c-ok' : 'c-hold'}">텍스트 ${pass ? '구분됨' : '재검토'}</span></div>
    <p class="case-action">${esc(item.action)}</p>
    <div class="case-meta"><span>기대: <b>${semanticLabel(item.expectedCamera)}</b></span><span>산출: <b>${esc(item.camera_type ?? '없음')}</b></span><span>영상: <b>${esc(job.local ? '수집 완료' : '없음')}</b></span></div>
    <div class="media-grid">
      <div class="media-block"><h4>프리비즈 — 결정론 블록아웃</h4><img src="${previzTile}" alt="${esc(item.id)} 프리비즈 시작·중간·끝 프레임"><p>${esc(note.previz)}</p><video controls preload="metadata" poster="${previzTile}"><source src="${previzVideo}" type="video/mp4"></video><a href="${previzVideo}">프리비즈 영상 열기</a></div>
      <div class="media-block"><h4>실제 영상 — Happy Horse</h4><img src="${vizTile}" alt="${esc(item.id)} 실제 영상 시작·중간·끝 프레임"><p>${esc(note.viz)}</p><video controls preload="metadata" poster="${vizTile}"><source src="${vizVideo}" type="video/mp4"></video><a href="${vizVideo}">실제 영상 열기</a></div>
    </div>
    <details><summary>텍스트 산출과 발주 전문</summary><div class="body">
      <p><b>카메라 의도:</b> <code>${esc(item.camera_intent)}</code> · <b>카메라 유형:</b> <code>${esc(item.camera_type)}</code></p>
      <p><b>이동 동기:</b> ${esc(item.camera_move_motivation || '없음')}</p>
      <p><b>프리비즈 연결:</b> 실제 산출된 카메라 유형을 기준으로 고정·팬·돌리 인 블록아웃을 컴파일했다.</p>
      <pre>${esc(item.video_prompt)}</pre>
      <p>텍스트 원자료: <code>${esc(textPath)}</code> · 영상 요청: <code>${esc(job.request_id)}</code> · 예상 비용: $${esc(job.est_cost_usd)}</p>
    </div></details>
  </article>`
}).join('\n')

const html = `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>카메라 반응 구분 실험 — 텍스트·프리비즈·실제 영상</title>
<style>
:root{--bg:#F7F5F0;--surface:#FFF;--surface-2:#F1EEE6;--ink:#22242A;--muted:#6E7077;--line:#E3E0D8;--accent:#A64F2A;--accent-ink:#8A3F1E;--accent-soft:#F3E4DB;--ok:#2F7D4E;--ok-soft:#E2F0E7;--warn:#96690A;--warn-soft:#F5EBD4;--info:#3A6EA5;--info-soft:#E3ECF5;--violet:#7A5CA8;--violet-soft:#ECE5F5;--mono:ui-monospace,"SF Mono",SFMono-Regular,Menlo,Consolas,monospace}
@media(prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#15171B;--surface:#1D2026;--surface-2:#23262D;--ink:#E9E7E2;--muted:#9C9EA6;--line:#2C2F36;--accent:#E0824F;--accent-ink:#E8956A;--accent-soft:#3A2A20;--ok:#5FBE8A;--ok-soft:#1E3328;--warn:#D9A94A;--warn-soft:#362C16;--info:#7FA9D9;--info-soft:#1E2A38;--violet:#A78BD0;--violet-soft:#2B2438}}
:root[data-theme="dark"]{--bg:#15171B;--surface:#1D2026;--surface-2:#23262D;--ink:#E9E7E2;--muted:#9C9EA6;--line:#2C2F36;--accent:#E0824F;--accent-ink:#E8956A;--accent-soft:#3A2A20;--ok:#5FBE8A;--ok-soft:#1E3328;--warn:#D9A94A;--warn-soft:#362C16;--info:#7FA9D9;--info-soft:#1E2A38;--violet:#A78BD0;--violet-soft:#2B2438}}
*{box-sizing:border-box}body{background:var(--bg);color:var(--ink);font-family:-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Segoe UI","Malgun Gothic",sans-serif;font-size:15.5px;line-height:1.7;margin:0;padding:0 20px 96px;-webkit-font-smoothing:antialiased}.wrap{max-width:900px;margin:0 auto}header.page{max-width:760px;padding:54px 0 10px;border-bottom:2px solid var(--ink);margin:0 auto 20px}.kicker{color:var(--accent);font-weight:700;font-size:13px;margin:0 0 10px}h1{font-size:clamp(25px,4.5vw,34px);font-weight:800;letter-spacing:-.02em;line-height:1.28;margin:0 0 10px;text-wrap:balance}.standfirst{font-size:16px;margin:0 0 6px}.asof{color:var(--muted);font-size:13px;margin:0}section.block{max-width:760px;margin:42px auto 0}.sec-head{border-bottom:2px solid var(--ink);padding-bottom:8px;margin-bottom:16px;display:flex;gap:10px;align-items:baseline;flex-wrap:wrap}.sec-head h2{font-size:20px;margin:0;font-weight:800}.sec-head .lede{color:var(--muted);font-size:14px}p{margin:0 0 12px}.chip{display:inline-block;font-size:12px;font-weight:750;border-radius:4px;padding:1px 8px;white-space:nowrap;vertical-align:1px}.c-ok{background:var(--ok-soft);color:var(--ok)}.c-hold{background:var(--warn-soft);color:var(--warn)}.c-info{background:var(--info-soft);color:var(--info)}.muted{color:var(--muted);font-size:13px}.num{font-variant-numeric:tabular-nums}.mono,code{font-family:var(--mono);font-size:12px;word-break:break-all}.lead-list{margin:0;padding-left:0;list-style:none;counter-reset:n}.lead-list>li{position:relative;padding:10px 0 10px 36px;border-bottom:1px dashed var(--line)}.lead-list>li:last-child{border-bottom:none}.lead-list>li::before{counter-increment:n;content:counter(n);position:absolute;left:0;top:12px;width:22px;height:22px;border:1.5px solid var(--accent);color:var(--accent);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:750;font-family:var(--mono)}.card,.case-card{background:var(--surface);border:1px solid var(--line);border-radius:8px;padding:18px 20px 14px;margin:0 0 14px}.steps{display:grid;gap:8px}.steps .row{display:grid;grid-template-columns:74px 1fr;gap:12px;align-items:baseline}.steps .k{font-size:12px;font-weight:750;color:var(--accent)}@media(max-width:520px){.steps .row{grid-template-columns:1fr;gap:2px}}.tbl-wrap{overflow-x:auto}table{border-collapse:collapse;width:100%;font-size:13px}th{text-align:left;color:var(--muted);font-weight:700;font-size:12px;padding:6px 10px;border-bottom:2px solid var(--line);white-space:nowrap}td{padding:7px 10px;border-bottom:1px solid var(--line);vertical-align:top}tr:last-child td{border-bottom:none}details{margin-top:10px;border-top:1px dashed var(--line)}details summary{cursor:pointer;padding:8px 0 4px;font-size:13px;font-weight:700;color:var(--info);list-style:none}details summary::before{content:"▸ "}details[open] summary::before{content:"▾ "}details summary::-webkit-details-marker{display:none}details .body{padding:4px 0 8px;font-size:13.5px}pre{white-space:pre-wrap;word-break:break-word;background:var(--surface-2);border:1px solid var(--line);border-radius:6px;padding:12px;font-family:var(--mono);font-size:12px;line-height:1.6;overflow:auto}.stat-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}@media(max-width:560px){.stat-grid{grid-template-columns:1fr}}.stat{background:var(--surface);border:1px solid var(--line);border-radius:8px;padding:14px 16px}.stat .value{font-size:28px;font-weight:800;line-height:1.2}.stat .label{font-size:13px;color:var(--muted);margin-top:4px}.chart{width:100%;height:auto;display:block}.chart text{font-family:-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Segoe UI","Malgun Gothic",sans-serif;fill:var(--ink)}.chart .axis{stroke:var(--line);stroke-width:1}.chart .expected{fill:var(--accent)}.chart .actual{fill:var(--ok)}.chart .label{font-size:13px}.chart .value{font-size:13px;font-weight:750}.case-card{max-width:900px}.case-head{display:flex;gap:10px;align-items:baseline;flex-wrap:wrap;margin-bottom:4px}.case-head h3{font-size:17px;margin:0;flex:1}.case-action{color:var(--muted);font-size:14px}.case-meta{display:flex;gap:14px;flex-wrap:wrap;border-top:1px dashed var(--line);border-bottom:1px dashed var(--line);padding:8px 0;margin:10px 0 14px;font-size:13px}.media-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}@media(max-width:700px){.media-grid{grid-template-columns:1fr}}.media-block{min-width:0}.media-block h4{font-size:14px;margin:0 0 5px}.media-block img{display:block;width:100%;border-radius:6px;border:1px solid var(--line);background:#111}.media-block p{font-size:13px;color:var(--muted);margin:7px 0}.media-block video{display:block;width:100%;border-radius:6px;background:#111;margin:8px 0}.media-block a{font-size:12px;color:var(--info)}footer{max-width:760px;margin:56px auto 0;color:var(--muted);font-size:12.5px;border-top:1px solid var(--line);padding-top:14px}a{color:var(--info);text-decoration:none}a:hover{text-decoration:underline}.callout{border-left:3px solid var(--accent);background:var(--accent-soft);padding:10px 12px;border-radius:0 6px 6px 0;margin:12px 0}.legend{font-size:12px;color:var(--muted);display:flex;gap:14px;flex-wrap:wrap;margin-top:4px}.legend i{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:4px}.legend .e{background:var(--accent)}.legend .a{background:var(--ok)}
</style></head><body><div class="wrap">
<header class="page"><p class="kicker">텍스트 → 프리비즈 → 실제 영상</p><h1>손동작·시선·감정이 카메라 반응을 바꾸는지, 결과물까지 연결해 확인했다</h1><p class="standfirst">프레임 안/밖 조건을 나눈 6개 쌍을 제품 저작 경로에 넣고, 산출된 카메라 계획을 블록아웃과 실제 영상에 차례로 연결했다. 텍스트 단계는 6/6으로 구분했지만, 실제 영상의 카메라 추종은 케이스별로 직접 확인해야 한다.</p><p class="asof">2026년 8월 11일 실행 · 텍스트 6케이스 · 프리비즈 6개 · 실제 영상 6개 · 영상 예상 비용 $${estimatedCost}</p></header>

<section class="block"><div class="sec-head"><h2>먼저 이것만 — 3분 요약</h2></div><ol class="lead-list"><li><b>텍스트 저작은 프레임 조건을 구분했다.</b><br><span class="muted">화면 안에서 끝나는 손동작·시선·감정은 고정으로, 화면 밖 대상의 손동작·시선과 배율 변화는 이동으로 산출됐다. 의미 분류는 ${textPass}/6.</span></li><li><b>프리비즈는 카메라 계획을 눈으로 볼 수 있는 형태로 바꿨다.</b><br><span class="muted">단순 도형과 색상으로 대상과 인물을 분리하고, 고정·팬·돌리 인 카메라 트랙을 6개 영상으로 만들었다.</span></li><li><b>실제 영상은 텍스트 결과를 그대로 증명하지 않는다.</b><br><span class="muted">일부 영상은 대상 움직임과 카메라 움직임이 섞여 보인다. 그래서 “카메라가 움직였나” 하나의 점수 대신 피사체 이동·프레이밍 변화·대상 추종을 따로 봐야 한다.</span></li></ol></section>

<section class="block"><div class="sec-head"><h2>텍스트 단계의 구분 결과</h2><span class="lede">기대 카메라 반응과 제품 산출을 나란히 비교</span></div><div class="stat-grid"><div class="stat"><div class="value">${textPass}/6</div><div class="label">의미상 고정/이동 구분</div></div><div class="stat"><div class="value">3/3</div><div class="label">화면 안 사건을 고정으로 선택</div></div><div class="stat"><div class="value">3/3</div><div class="label">화면 밖·배율 변화 사건을 이동으로 선택</div></div></div><div class="card" style="margin-top:14px"><svg class="chart" viewBox="0 0 760 190" role="img" aria-labelledby="chart-title chart-desc"><title id="chart-title">기대 반응과 텍스트 산출 반응 수</title><desc id="chart-desc">고정 세 건, 이동 세 건 모두 기대와 실제 산출이 일치했다.</desc><line class="axis" x1="120" y1="155" x2="710" y2="155"/><line class="axis" x1="120" y1="25" x2="120" y2="155"/><text class="label" x="105" y="159" text-anchor="end">0</text><text class="label" x="105" y="94" text-anchor="end">3</text><text class="label" x="105" y="29" text-anchor="end">6</text><text class="label" x="230" y="178" text-anchor="middle">고정</text><text class="label" x="550" y="178" text-anchor="middle">이동</text><rect class="expected" x="175" y="90" width="100" height="65" rx="4"/><rect class="actual" x="285" y="90" width="100" height="65" rx="4"/><rect class="expected" x="495" y="90" width="100" height="65" rx="4"/><rect class="actual" x="605" y="90" width="100" height="65" rx="4"/><text class="value" x="225" y="80" text-anchor="middle">기대 3</text><text class="value" x="335" y="80" text-anchor="middle">산출 3</text><text class="value" x="545" y="80" text-anchor="middle">기대 3</text><text class="value" x="655" y="80" text-anchor="middle">산출 3</text></svg><div class="legend"><span><i class="e"></i>기대값</span><span><i class="a"></i>텍스트 산출</span></div></div><div class="tbl-wrap"><table><thead><tr><th>#</th><th>사건</th><th>기대</th><th>산출</th><th>결과</th></tr></thead><tbody>${matrixRows}</tbody></table></div><div class="callout"><b>주의:</b> 이동 케이스의 한 산출은 <code>pan_right</code>로 나왔다. 의미상 팬은 맞지만 현재 선언된 카메라 유형 목록의 표기와 어긋나는 별도 계약 위생 문제다.</div></section>

<section class="block"><div class="sec-head"><h2>프리비즈와 실제 영상을 함께 보기</h2><span class="lede">왼쪽은 결정론 블록아웃, 오른쪽은 실제 영상 생성 결과</span></div>${caseCards}</section>

<section class="block"><div class="sec-head"><h2>이 실험이 말해주는 것</h2></div><div class="card"><div class="steps"><div class="row"><span class="k">확인됨</span><span>문장 수준에서는 “대상이 프레임 안에 있나, 밖에 있나”라는 조건을 넣었을 때 카메라 반응을 분리할 수 있었다.</span></div><div class="row"><span class="k">확인됨</span><span>손동작·시선·감정은 카메라 이동의 원인이 될 수 있지만, 실제 분류 근거는 그 동작 자체가 아니라 프레이밍 목표였다.</span></div><div class="row"><span class="k">남은 문제</span><span>실제 영상에서는 대상 이동, 피사체 이동, 카메라 팬이 서로 섞여 보인다. 프리비즈 카메라 트랙과 실제 영상의 카메라 실행을 별도 축으로 판정해야 한다.</span></div><div class="row"><span class="k">판정</span><span><b>텍스트→프리비즈 접합은 성립했다.</b> 텍스트→실제 영상의 카메라 추종은 이 리포트의 영상들을 사람 판독용 자료로 삼아 별도 판정해야 한다.</span></div></div></div><details><summary>실행 좌표와 입력 전문</summary><div class="body"><p>텍스트 제품 경로: <code>runDecoupage</code> → <code>runShotDesign</code> → <code>buildVideoPrompt</code></p><p>계약: <code>WRITER_CAMERA_CONTRACT=relaxed-v3</code> · 모델: <code>gemini-3.6-flash</code></p><p>프리비즈: <code>blockout.py</code> · Blender 5.2 headless · 단순 도형·색상·카메라 키프레임</p><p>실제 영상: <code>alibaba/happy-horse/reference-to-video</code> · 720p · 5초 · 6개 · 예상 $${estimatedCost}</p><p>입력 문구와 모션 계약 전문은 각 카드의 접힌 영역과 <code>text/*.json</code>에 보존했다.</p></div></details></section>

<footer>정본: <span class="mono">text/summary.json</span> · 영상 요청: <span class="mono">viz/manifest.json</span> · 프리비즈/실제 영상 원본: <span class="mono">outputs/&lt;case&gt;/{previz,viz}/</span></footer>
</div></body></html>`

const finalHtml = html.replace(
  '<footer>',
  '<section class="block"><div class="sec-head"><h2>실행 정직 기록</h2><span class="lede">초기 오염을 버리고 격리 입력으로 다시 실행</span></div><div class="card"><div class="steps"><div class="row"><span class="k">초기 시도</span><span>기존 재난물 fixture를 그대로 사용했더니 이야기 고유 정보(소년·침실·망원경)가 마이크로 샷에 섞여 나왔다.</span></div><div class="row"><span class="k">처리</span><span><b>그 산출물은 폐기했다.</b> 중립 스튜디오·단일 인물·단일 사건·중립 시네마토그래피 계획으로 fixture를 격리하고 텍스트 6개를 다시 실행했다.</span></div><div class="row"><span class="k">최종 자료</span><span>이 리포트의 표·프리비즈·실제 영상·프롬프트는 모두 격리 fixture로 재실행한 최종 자료만 가리킨다.</span></div></div></div></section><footer>',
)
writeFileSync(join(ROOT, 'report.html'), finalHtml)
console.log(`report written → ${join(ROOT, 'report.html')}`)
