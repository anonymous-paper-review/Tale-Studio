// 배선도 HTML 생성기 — 손으로 쓴 해석(data.mjs) + 코드에서 떠 온 사실(extract.mjs) → 한 장.
//   serve.mjs(로컬 실시간)와 build.mjs(아티팩트 스냅샷)가 같은 함수를 부른다.
import { BANDS, NODES, CHAIN } from './data.mjs'
import { FINDINGS } from './findings.mjs'
import * as ex from './extract.mjs'

// ── 모델 조립 ────────────────────────────────────────────────────────────────

/** 체인·예시가 따라갈 대표 샷을 실제 런에서 고른다 (두 번째 씬의 두 번째 샷 근처). */
function pickFocus(run) {
  const dec = ex.readRunJson(run, '10b_c_decoupage.json')
  const scenes = dec?.scenes ?? []
  const sc = scenes[1] ?? scenes[0]
  if (!sc) return { sceneId: null, shotId: null, finalShotId: null }
  const shots = sc.shots ?? []
  const target = shots.find((s) => s.operation === 'merged') ?? shots[1] ?? shots[0]
  const shotId = target?.shot_id ?? null
  const seq = ex.readRunJson(run, '13_c2_shotSequence.json')
  const match = (seq?.shots ?? []).find((s) => s.design_ref === shotId || s.source_shot_id === shotId)
  return { sceneId: sc.scene_id, shotId, finalShotId: match?.shot_id ?? null }
}

function resolvePrompts(node) {
  return (node.prompts ?? []).map((p) => {
    const r = ex.slice(p.anchor)
    return {
      label: p.label,
      note: p.note ?? null,
      text: r.ok ? r.text : '',
      broken: !r.ok,
      reason: r.reason,
      src: r.ok ? `${p.anchor.file}:${r.line}` : p.anchor.file,
    }
  })
}

function resolveChecks(node) {
  return (node.checks ?? []).map((c) => {
    const r = ex.probe(c.file, c.re)
    const value = r.ok ? r.value.replace(/\s+/g, ' ').trim() : null
    const drift = c.expect != null && value != null && value !== c.expect
    return { label: c.label, value, expect: c.expect ?? null, ok: r.ok, drift, src: r.ok ? `${c.file}:${r.line}` : c.file }
  })
}

function resolveProbes(list) {
  return (list ?? []).map((p) => {
    const hits = ex.countConsumers(p.match, { produce: p.produce })
    return { field: p.field ?? p.match, match: p.match, count: hits.length, hits: hits.slice(0, 6) }
  })
}

function resolveSamples(node, run, focus) {
  return (node.samples ?? [])
    .map((s) => {
      const json = ex.readRunJson(run, s.file)
      if (!json) return null
      let picked
      try {
        picked = s.pick(json, focus)
      } catch {
        return null
      }
      const text = ex.sample(picked)
      if (!text) return null
      return { label: s.label, text, src: `logs/${run}/${s.file}` }
    })
    .filter(Boolean)
}

const CHAIN_SAMPLE = {
  scene: (run, f) => {
    const j = ex.readRunJson(run, '05_s3_scenes.json')
    const sc = (j?.scenes ?? []).find((s) => s.scene_id === f.sceneId) ?? j?.scenes?.[0]
    return sc ? ex.sample(sc, 2600) : null
  },
  v3: (run, f) => {
    const j = ex.readRunJson(run, '10_v3_sceneCinematography.json')
    const p = (j?.scene_plans ?? []).find((x) => x.scene_id === f.sceneId) ?? j?.scene_plans?.[0]
    return p ? ex.sample(p) : null
  },
  dec: (run, f) => {
    const j = ex.readRunJson(run, '10b_c_decoupage.json')
    const sc = (j?.scenes ?? []).find((s) => s.scene_id === f.sceneId) ?? j?.scenes?.[0]
    if (!sc) return null
    return ex.sample({ 씬: sc.scene_id, 비트수: sc.beat_count, 샷수: sc.shot_count, 앞3샷: (sc.shots ?? []).slice(0, 3) }, 3000)
  },
  v4: (run, f) => {
    const j = ex.readRunJson(run, '11_v4_shotDesign.json')
    const s = (j?.shots ?? []).find((x) => x.intent?.shot_id === f.shotId) ?? j?.shots?.[0]
    return s ? ex.sample(s, 3000) : null
  },
  seq: (run, f) => {
    const j = ex.readRunJson(run, '13_c2_shotSequence.json')
    const s = (j?.shots ?? []).find((x) => x.shot_id === f.finalShotId) ?? j?.shots?.[0]
    return s ? ex.sample(s, 3000) : null
  },
  check: (run) => {
    const j = ex.readRunJson(run, '12_c2_shotCheck.json')
    if (!j) return null
    const dist = {}
    for (const i of j.issues ?? []) {
      const k = `${i.category}/${i.severity}`
      dist[k] = (dist[k] ?? 0) + 1
    }
    return ex.sample({ 요약: { passed: j.passed, 이슈수: (j.issues ?? []).length, 분할: j.shots_split_count }, 분포: dist, 표본: (j.issues ?? []).slice(0, 2) }, 2000)
  },
  v5: (run, f) => {
    const j = ex.readRunJson(run, '14_v5_renderPrompts.json')
    if (!j) return null
    const s = (j.shots ?? []).find((x) => x.shot_id === f.finalShotId) ?? j.shots?.[0]
    return ex.sample({ 샷: s, 추출요약: j.extraction_summary }, 2000)
  },
}

export function buildModel({ run: preferredRun } = {}) {
  ex.invalidate()
  const run = ex.pickRun(preferredRun)
  const focus = pickFocus(run)
  const info = ex.runInfo(run)

  const nodes = NODES.map((n) => {
    // samples/outputProbes 는 함수·앵커라 페이지로 내보내지 않는다 — 해석 결과만 싣는다.
    const { samples, outputProbes, ...rest } = n
    void samples
    void outputProbes
    return {
      ...rest,
      prompts: resolvePrompts(n),
      checks: resolveChecks(n),
      probes: resolveProbes(n.outputProbes),
      data: resolveSamples(n, run, focus),
    }
  })

  const chain = CHAIN.map((c) => ({
    ...c,
    text: CHAIN_SAMPLE[c.ref] ? CHAIN_SAMPLE[c.ref](run, focus) : null,
    src: run ? `logs/${run}` : null,
  }))

  const findings = FINDINGS.map((f) => ({
    ...f,
    liveCount: f.probe ? ex.countConsumers(f.probe.match, { produce: f.probe.produce }).length : null,
  }))

  const drift = []
  for (const n of nodes) {
    for (const c of n.checks) {
      if (!c.ok) drift.push({ node: n.label, label: c.label, kind: 'anchor', detail: `상수를 못 찾음 — ${c.src}` })
      else if (c.drift) drift.push({ node: n.label, label: c.label, kind: 'value', detail: `문서 ${c.expect} → 코드 ${c.value}` })
    }
    for (const p of n.prompts) {
      if (p.broken) drift.push({ node: n.label, label: p.label, kind: 'anchor', detail: p.reason })
    }
    for (const p of n.probes) {
      if (p.count > 0) drift.push({ node: n.label, label: `${p.field} 소비처`, kind: 'wired', detail: `0건이었는데 지금 ${p.count}건 — ${p.hits.join(', ')}` })
    }
  }
  for (const f of findings) {
    if (f.liveCount != null && f.liveCount > 0) {
      drift.push({ node: f.title, label: '소비처 재확인', kind: 'wired', detail: `${f.probe.match} 를 읽는 곳이 ${f.liveCount}건 생겼다` })
    }
  }

  return { bands: BANDS, nodes, chain, findings, run: info, focus, drift, generatedAt: new Date().toISOString() }
}

// ── HTML ─────────────────────────────────────────────────────────────────────



export function renderHtml(model, { live = false } = {}) {
  // application/json 블록이라 이스케이프가 필요한 건 스크립트 종료 시퀀스뿐이다.
  const payload = JSON.stringify(model).replace(/</g, String.fromCharCode(92)+String.fromCharCode(92)+"u003c")
  return `<title>비주얼축·샷층 배선도</title>

<style>${CSS}</style>

<div class="wrap">
  <header class="top">
    <p class="eyebrow">tale-studio · writer 백엔드 · <span id="stamp"></span></p>
    <h1>비주얼축·샷층 배선도</h1>
    <p class="lede">스토리 한 편이 <strong>샷 시퀀스</strong>가 되기까지, 비주얼 축과 샷 층(데쿠파주 · 샷 설계 · 샷 검수)에서 실제로 실행되는 기능 단위를 전부 노드로 세우고, 그 사이에 무엇이 실려 가는지를 엣지로 그렸다.</p>
    <p class="lede">노드와 <strong>엣지 둘 다 클릭</strong>할 수 있다. 지시문 원문·상수·실제 산출 예시·소비처 유무는 <strong>이 페이지를 열 때마다 코드와 런 로그에서 다시 읽는다</strong> — 손으로 적어 둔 것은 해석뿐이라 낡을 수가 없다.</p>
    <div class="meta-row" id="metaRow"></div>
    <div id="driftBox"></div>
  </header>

  <section id="map">
    <h2>배선도</h2>
    <p class="sec-note">왼쪽에서 오른쪽으로 한 밴드 안의 흐름, 위에서 아래로 밴드 사이의 흐름. 휠로 확대·축소, 빈 곳을 끌어 이동. 노드나 엣지를 누르면 관련된 것만 남는다.</p>
    <div class="legend" id="legend"></div>
    <div class="graph-shell">
      <div class="graph-col">
        <div class="graph-toolbar">
          <div class="tb-group">
            <button type="button" class="tb-btn" data-zoom="out" aria-label="축소">−</button>
            <span class="tb-zoom" id="zoomLabel">100%</span>
            <button type="button" class="tb-btn" data-zoom="in" aria-label="확대">＋</button>
          </div>
          <div class="tb-group">
            <button type="button" class="tb-btn wide" data-zoom="fit">화면 맞춤</button>
            <button type="button" class="tb-btn wide" data-zoom="reset">원래 크기</button>
          </div>
          <div class="tb-group tb-right">
            <label class="tb-check"><input type="checkbox" id="labelToggle"> 엣지 이름 항상 보기</label>
            <button type="button" class="tb-btn wide" id="clearSel">선택 해제</button>
          </div>
        </div>
        <div class="graph-pane" id="graphPane"></div>
        <p class="graph-hint">휠 = 확대·축소 · 빈 곳 끌기 = 이동 · 더블클릭 = 화면 맞춤 · Esc = 선택 해제</p>
      </div>
      <aside class="detail-pane" id="detailPane"></aside>
    </div>
  </section>

  <section id="chain">
    <h2>샷 하나가 지나간 길</h2>
    <p class="sec-note" id="chainNote"></p>
    <div class="chain" id="chainWrap"></div>
  </section>

  <section id="ledger">
    <h2>현황표</h2>
    <p class="sec-note">노드 하나가 한 줄. 연결 상태는 출력마다 소비처를 실제로 찾아본 결과다.</p>
    <div class="table-scroll">
      <table>
        <thead><tr><th>노드</th><th>종류</th><th>모델축</th><th>호출 형태</th><th>주 입력</th><th>주 출력</th><th>연결</th></tr></thead>
        <tbody id="ledgerBody"></tbody>
      </table>
    </div>
  </section>

  <section id="breaks">
    <h2>끊긴 곳과 새는 곳</h2>
    <p class="sec-note">"만들었는데 아무도 안 읽는 것"과 "두 벌인데 한 벌만 살아 있는 것". 표시가 붙은 항목은 반증을 목표로 한 별도 검증을 한 번 더 통과했다. 소비처 숫자는 <b>이 페이지를 열 때 다시 세는 값</b>이라, 누군가 배선을 이으면 여기서 먼저 드러난다.</p>
    <div class="findings" id="findingsWrap"></div>
  </section>
</div>

<script id="mapData" type="application/json">${payload}</script>
<script>${CLIENT}</script>
${live ? `<script>${LIVE}</script>` : ''}
`
}

// ── 스타일 ───────────────────────────────────────────────────────────────────
const CSS = `
:root{--ground:#F6F4F0;--surface:#FFFFFF;--surface-2:#EEEBE4;--surface-3:#E5E1D8;--line:#D8D2C6;--line-soft:#E7E2D8;--ink:#16191C;--ink-2:#3C4247;--muted:#6C7278;--faint:#9AA0A6;--v:#2E7BB8;--s:#B57A16;--c:#7A56A8;--x:#6C7278;--flag:#C1272D;--dead:#9AA0A6;--v-wash:#E4EFF8;--s-wash:#F7EEDC;--c-wash:#EEE7F6;--x-wash:#EAE7E1;--flag-wash:#F8E4E4;--sans:-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Pretendard","Segoe UI",system-ui,sans-serif;--mono:ui-monospace,SFMono-Regular,"SF Mono",Menlo,Consolas,monospace;--radius:3px}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--ground:#0D1013;--surface:#14181C;--surface-2:#1A1F25;--surface-3:#222932;--line:#2A323B;--line-soft:#212932;--ink:#E4E8EB;--ink-2:#BFC6CC;--muted:#858F98;--faint:#5F6971;--v:#5B9DD6;--s:#E8B14C;--c:#A98BD9;--x:#858F98;--flag:#E05A55;--dead:#5F6971;--v-wash:#16283A;--s-wash:#33280F;--c-wash:#241C36;--x-wash:#1E242B;--flag-wash:#351A1A}}
:root[data-theme="dark"]{--ground:#0D1013;--surface:#14181C;--surface-2:#1A1F25;--surface-3:#222932;--line:#2A323B;--line-soft:#212932;--ink:#E4E8EB;--ink-2:#BFC6CC;--muted:#858F98;--faint:#5F6971;--v:#5B9DD6;--s:#E8B14C;--c:#A98BD9;--x:#858F98;--flag:#E05A55;--dead:#5F6971;--v-wash:#16283A;--s-wash:#33280F;--c-wash:#241C36;--x-wash:#1E242B;--flag-wash:#351A1A}
*{box-sizing:border-box}
body{margin:0;background:var(--ground);color:var(--ink);font-family:var(--sans);font-size:15px;line-height:1.7;-webkit-font-smoothing:antialiased}
.wrap{max-width:1440px;margin:0 auto;padding:0 28px 120px}
header.top{padding:72px 0 40px;border-bottom:1px solid var(--line);margin-bottom:40px}
.eyebrow{font-family:var(--mono);font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);margin:0 0 18px}
h1{font-size:clamp(30px,4.4vw,46px);line-height:1.14;letter-spacing:-.022em;font-weight:640;margin:0 0 22px;text-wrap:balance;max-width:20ch}
.lede{font-size:17px;line-height:1.72;color:var(--ink-2);max-width:70ch;margin:0 0 14px}
.lede strong{font-weight:620;color:var(--ink)}
.meta-row{display:flex;flex-wrap:wrap;gap:10px 26px;margin-top:28px;font-family:var(--mono);font-size:12px;color:var(--muted)}
.meta-row b{color:var(--ink);font-weight:500;font-variant-numeric:tabular-nums}
section{margin:0 0 76px;scroll-margin-top:20px}
h2{font-size:25px;line-height:1.25;letter-spacing:-.015em;font-weight:640;margin:0 0 10px;text-wrap:balance}
.sec-note{color:var(--muted);max-width:78ch;margin:0 0 26px;font-size:14.5px}
.sec-note b{color:var(--ink-2)}
.legend{display:grid;grid-template-columns:repeat(auto-fit,minmax(215px,1fr));border:1px solid var(--line);border-radius:var(--radius);overflow:hidden;margin-bottom:18px;background:var(--surface)}
.legend-cell{padding:15px 18px;border-right:1px solid var(--line);border-bottom:1px solid var(--line)}
.legend-title{font-family:var(--mono);font-size:10.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin-bottom:9px}
.legend-item{display:flex;align-items:center;gap:9px;font-size:13px;color:var(--ink-2);padding:2.5px 0}
.swatch{width:22px;height:12px;border-radius:2px;flex:none;border:1.5px solid}
.edge-key{width:26px;height:0;border-top:2px solid;flex:none}
.edge-key.dash{border-top-style:dashed;border-color:var(--dead)}
.edge-key.dot{border-top-style:dotted}
.graph-shell{display:grid;grid-template-columns:minmax(0,1fr) 440px;gap:22px;align-items:start}
.graph-col{min-width:0}
.graph-toolbar{display:flex;flex-wrap:wrap;gap:10px;align-items:center;border:1px solid var(--line);border-bottom:0;border-radius:var(--radius) var(--radius) 0 0;background:var(--surface-2);padding:8px 10px}
.tb-group{display:flex;align-items:center;gap:6px}
.tb-right{margin-left:auto}
.tb-btn{font-family:var(--mono);font-size:12px;line-height:1;color:var(--ink-2);background:var(--surface);border:1px solid var(--line);border-radius:2px;padding:6px 9px;cursor:pointer}
.tb-btn.wide{padding:6px 11px}
.tb-btn:hover{background:var(--surface-3);color:var(--ink)}
.tb-btn:focus-visible{outline:2px solid var(--v);outline-offset:1px}
.tb-zoom{font-family:var(--mono);font-size:11.5px;color:var(--muted);min-width:44px;text-align:center;font-variant-numeric:tabular-nums}
.tb-check{font-family:var(--mono);font-size:11.5px;color:var(--muted);display:flex;align-items:center;gap:6px;cursor:pointer}
.graph-pane{border:1px solid var(--line);border-radius:0 0 var(--radius) var(--radius);background:var(--surface);overflow:hidden;position:relative;height:min(78vh,940px);touch-action:none}
.graph-pane svg{display:block;width:100%;height:100%;cursor:grab}
.graph-pane svg.panning{cursor:grabbing}
.graph-hint{font-family:var(--mono);font-size:10.5px;color:var(--faint);margin:8px 0 0}
.node-box{cursor:pointer}
.node-box:focus{outline:none}
.node-box:focus-visible .focus-ring{opacity:1}
.focus-ring{opacity:0;pointer-events:none}
.node-rect{transition:opacity .16s ease}
.node-label{font-family:var(--sans);font-size:12.5px;font-weight:560;pointer-events:none}
.node-sub{font-family:var(--mono);font-size:9.5px;pointer-events:none}
.band-label{font-family:var(--mono);font-size:10.5px;letter-spacing:.13em;text-transform:uppercase;fill:var(--muted)}
.band-count{font-family:var(--mono);font-size:10px;fill:var(--faint)}
.edge-halo{fill:none;stroke:var(--surface);stroke-linecap:round}
.edge{fill:none;transition:opacity .14s ease,stroke-width .14s ease}
.edge-hit{fill:none;stroke:transparent;stroke-width:14;cursor:pointer}
.edge-hit:focus{outline:none}
.edge-lab{font-family:var(--mono);font-size:9px;fill:var(--muted);pointer-events:none;opacity:0;transition:opacity .14s ease}
.edge-lab-bg{fill:var(--surface);opacity:0;transition:opacity .14s ease}
.eg.show .edge-lab,.eg.show .edge-lab-bg{opacity:1}
.eg.hot .edge{stroke-width:2.6}
.dim{opacity:.1}
.detail-pane{border:1px solid var(--line);border-radius:var(--radius);background:var(--surface);position:sticky;top:16px;max-height:calc(100vh - 32px);overflow-y:auto}
.detail-empty{padding:44px 26px;color:var(--muted);font-size:14px;line-height:1.75}
.detail-empty b{color:var(--ink);font-weight:600}
.d-head{padding:20px 22px 16px;border-bottom:1px solid var(--line);position:sticky;top:0;background:var(--surface);z-index:3}
.d-kicker{font-family:var(--mono);font-size:10px;letter-spacing:.11em;text-transform:uppercase;margin-bottom:8px;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.d-title{font-size:20px;font-weight:640;letter-spacing:-.012em;margin:0 0 6px;line-height:1.3}
.d-fn{font-family:var(--mono);font-size:11.5px;color:var(--muted);word-break:break-all}
.d-body{padding:4px 22px 30px}
.d-block{margin-top:22px}
.d-h{font-family:var(--mono);font-size:10px;letter-spacing:.11em;text-transform:uppercase;color:var(--muted);padding-bottom:7px;border-bottom:1px solid var(--line-soft);margin-bottom:12px}
.d-summary{font-size:14.5px;line-height:1.72;color:var(--ink-2)}
.io-row{display:grid;grid-template-columns:96px minmax(0,1fr);gap:10px;padding:9px 0;border-bottom:1px solid var(--line-soft);font-size:13px;align-items:start}
.io-row:last-child{border-bottom:0}
.io-from{font-family:var(--mono);font-size:10.5px;color:var(--muted);line-height:1.5;padding-top:2px;word-break:break-word}
.io-from a{color:var(--muted);text-decoration:underline;text-underline-offset:2px;cursor:pointer}
.io-fields{font-family:var(--mono);font-size:11.5px;color:var(--ink);line-height:1.65;word-break:break-word}
.io-note{color:var(--muted);font-size:12.5px;margin-top:3px;line-height:1.6}
.tag{display:inline-block;font-family:var(--mono);font-size:9.5px;letter-spacing:.05em;text-transform:uppercase;padding:1.5px 6px;border-radius:2px;border:1px solid;white-space:nowrap;vertical-align:1px}
.t-v{color:var(--v);border-color:var(--v);background:var(--v-wash)}
.t-s{color:var(--s);border-color:var(--s);background:var(--s-wash)}
.t-c{color:var(--c);border-color:var(--c);background:var(--c-wash)}
.t-x{color:var(--x);border-color:var(--x);background:var(--x-wash)}
.t-dead{color:var(--dead);border-color:var(--dead);background:transparent}
.t-flag{color:var(--flag);border-color:var(--flag);background:var(--flag-wash)}
pre.prompt{font-family:var(--mono);font-size:11.5px;line-height:1.62;background:var(--surface-2);border:1px solid var(--line);border-left:2px solid var(--muted);border-radius:2px;padding:13px 14px;overflow-x:auto;white-space:pre-wrap;word-break:break-word;margin:0 0 6px;color:var(--ink)}
pre.prompt.is-s{border-left-color:var(--s)}
pre.prompt.is-v{border-left-color:var(--v)}
pre.prompt.is-c{border-left-color:var(--c)}
pre.prompt.broken{border-left-color:var(--flag);color:var(--muted)}
pre.data{font-family:var(--mono);font-size:11px;line-height:1.6;background:var(--surface-2);border:1px solid var(--line);border-radius:2px;padding:12px 13px;overflow-x:auto;margin:0;color:var(--ink);white-space:pre}
.prompt-cap{font-family:var(--mono);font-size:10px;color:var(--muted);margin:0 0 16px;display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap}
.prompt-cap b{color:var(--ink-2);font-weight:500}
.pnote{font-size:12.5px;color:var(--muted);line-height:1.6;margin:0 0 14px;padding-left:10px;border-left:2px solid var(--line)}
.why-item{padding:12px 0;border-bottom:1px solid var(--line-soft)}
.why-item:last-child{border-bottom:0}
.why-what{font-size:13.5px;font-weight:600;margin-bottom:5px;line-height:1.5}
.why-why{font-size:13px;color:var(--ink-2);line-height:1.68}
.why-src{font-family:var(--mono);font-size:10px;color:var(--faint);margin-top:6px;word-break:break-all}
.contract-list{margin:0;padding-left:17px;font-size:13px;color:var(--ink-2);line-height:1.66}
.contract-list li{margin-bottom:6px}
.contract-list code,.io-note code,.f-body code{font-family:var(--mono);font-size:11.5px;background:var(--surface-2);padding:.5px 4px;border-radius:2px}
.chk-row{display:flex;justify-content:space-between;gap:12px;font-family:var(--mono);font-size:11.5px;padding:7px 0;border-bottom:1px solid var(--line-soft)}
.chk-row:last-child{border-bottom:0}
.chk-row span:first-child{color:var(--muted)}
.chk-val{color:var(--ink)}
.chk-val.drift{color:var(--flag)}
.chain{border:1px solid var(--line);border-radius:var(--radius);background:var(--surface);overflow:hidden}
.chain-step{display:grid;grid-template-columns:180px minmax(0,1fr);border-bottom:1px solid var(--line)}
.chain-step:last-child{border-bottom:0}
.chain-left{padding:18px;border-right:1px solid var(--line);background:var(--surface-2)}
.chain-stage{font-family:var(--mono);font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin-bottom:6px}
.chain-name{font-size:14.5px;font-weight:620;line-height:1.4;margin-bottom:8px}
.chain-what{font-size:12.5px;color:var(--muted);line-height:1.6}
.chain-right{padding:18px 20px 20px;min-width:0}
.chain-say{font-size:13.5px;color:var(--ink-2);line-height:1.7;margin:0 0 12px}
.chain-say b{color:var(--ink);font-weight:600}
.delta{font-family:var(--mono);font-size:11px;color:var(--flag);margin-top:10px;line-height:1.6}
.table-scroll{overflow-x:auto;border:1px solid var(--line);border-radius:var(--radius);background:var(--surface)}
table{border-collapse:collapse;width:100%;min-width:900px;font-size:13px}
thead th{text-align:left;font-family:var(--mono);font-size:10px;letter-spacing:.09em;text-transform:uppercase;color:var(--muted);font-weight:400;padding:12px 14px;border-bottom:1px solid var(--line);background:var(--surface-2);white-space:nowrap;position:sticky;top:0}
tbody td{padding:11px 14px;border-bottom:1px solid var(--line-soft);vertical-align:top;line-height:1.55}
tbody tr:last-child td{border-bottom:0}
tbody tr{cursor:pointer}
tbody tr:hover{background:var(--surface-2)}
td.mono{font-family:var(--mono);font-size:11.5px}
.row-name{font-weight:570}
.row-file{font-family:var(--mono);font-size:10.5px;color:var(--faint);display:block;margin-top:3px;word-break:break-all}
.findings{display:grid;gap:14px}
.finding{border:1px solid var(--line);border-left:3px solid var(--flag);border-radius:var(--radius);background:var(--surface);padding:17px 20px 18px}
.finding.soft{border-left-color:var(--dead)}
.finding.note{border-left-color:var(--s)}
.f-head{display:flex;gap:10px;align-items:baseline;flex-wrap:wrap;margin-bottom:8px}
.f-title{font-size:15px;font-weight:630;line-height:1.45}
.f-body{font-size:13.5px;color:var(--ink-2);line-height:1.72}
.f-body p{margin:0 0 9px}
.f-body p:last-child{margin-bottom:0}
.f-ev{font-family:var(--mono);font-size:10.5px;color:var(--faint);margin-top:10px;line-height:1.65;word-break:break-all}
.drift{border:1px solid var(--flag);border-radius:var(--radius);background:var(--flag-wash);padding:14px 18px;margin-top:24px}
.drift-t{font-family:var(--mono);font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--flag);margin-bottom:8px}
.drift ul{margin:0;padding-left:18px;font-size:13px;color:var(--ink-2);line-height:1.65}
.reload{position:fixed;right:16px;bottom:16px;font-family:var(--mono);font-size:11px;background:var(--surface);border:1px solid var(--line);border-radius:2px;padding:7px 11px;color:var(--muted);z-index:9}
@media (max-width:1120px){.graph-shell{grid-template-columns:minmax(0,1fr)}.detail-pane{position:static;max-height:none}.graph-pane{height:min(64vh,680px)}}
@media (max-width:700px){.wrap{padding:0 18px 80px}header.top{padding-top:48px}.chain-step{grid-template-columns:minmax(0,1fr)}.chain-left{border-right:0;border-bottom:1px solid var(--line)}}
@media (prefers-reduced-motion:reduce){*{transition:none!important}}
`

// ── 클라이언트 ───────────────────────────────────────────────────────────────
const CLIENT = String.raw`
(function(){
var M = JSON.parse(document.getElementById('mapData').textContent);
var NODES = M.nodes, BANDS = M.bands;
var byId = {}; NODES.forEach(function(n){ byId[n.id]=n; });

var AXIS_NAME={v:'Visual 축',s:'샷 층',c:'검증 축',x:'상류·하류'};
var KIND_NAME={llm:'LLM 호출',code:'결정론 코드',check:'검증기',persist:'DB 기록',input:'상류 입력',orphan:'경로 단절',down:'하류 소비처'};
var USAGE={prompt:'지시문에 실려 감',code:'코드가 계산에만 씀',unused:'받지만 안 씀',partial:'일부만 실려 감',fallback:'폴백 경로'};
var STATUS={live:['t-v','연결됨'],dropped:['t-dead','소비처 0'],'db-only':['t-s','DB에만'],partial:['t-s','일부만'],flag:['t-flag','끊김']};

var SVGNS='http://www.w3.org/2000/svg';
var NW=156,NH=48,CG=26,RG=30,BPT=36,BPB=22,BG=28,MX=24;
function el(t,a,x){var n=document.createElementNS(SVGNS,t);if(a)for(var k in a)n.setAttribute(k,a[k]);if(x!=null)n.textContent=x;return n;}
function h(t,c,x){var n=document.createElement(t);if(c)n.className=c;if(x!=null)n.textContent=x;return n;}
function ax(a){return 'var(--'+(a||'x')+')';}

// ── 배치 ──
var pos={}, totalW=0, totalH=0;
(function layout(){
  var y=12;
  BANDS.forEach(function(b){
    var mem=NODES.filter(function(n){return n.band===b.id;});
    b._n=mem.length;
    var rows={};
    mem.forEach(function(n){ (rows[n.row||0]=rows[n.row||0]||[]).push(n); });
    var keys=Object.keys(rows).map(Number).sort(function(a,c){return a-c;});
    b.y=y;
    var iy=y+BPT;
    keys.forEach(function(rk,ri){
      rows[rk].forEach(function(n,ci){
        var col=(n.col!=null)?n.col:ci;
        pos[n.id]={x:MX+col*(NW+CG),y:iy+ri*(NH+RG),w:NW,h:NH};
      });
    });
    b.h=BPT+keys.length*NH+(keys.length-1)*RG+BPB;
    y+=b.h+BG;
  });
  totalH=y+12;
  NODES.forEach(function(n){var p=pos[n.id];if(p)totalW=Math.max(totalW,p.x+p.w);});
  totalW+=MX+12;
})();

// 같은 노드에서 나가는/들어오는 엣지에 출입구를 나눠 준다 — 겹쳐서 한 줄로 보이지 않게.
var EDGES=[];
NODES.forEach(function(n){
  (n.inputs||[]).forEach(function(inp){
    if(!pos[inp.from]||!pos[n.id])return;
    EDGES.push({from:inp.from,to:n.id,usage:inp.usage,fields:inp.fields,note:inp.note});
  });
});
var outIdx={},inIdx={};
EDGES.forEach(function(e){ (outIdx[e.from]=outIdx[e.from]||[]).push(e); (inIdx[e.to]=inIdx[e.to]||[]).push(e); });
EDGES.forEach(function(e){
  var o=outIdx[e.from],i=inIdx[e.to];
  e.oi=o.indexOf(e); e.on=o.length; e.ii=i.indexOf(e); e.inn=i.length;
});
function spread(idx,n,w){ if(n<=1)return 0; var span=Math.min(w*0.62,(n-1)*16); return -span/2+span*(idx/(n-1)); }

function pathFor(e){
  var a=pos[e.from],b=pos[e.to];
  var sameRow=Math.abs(a.y-b.y)<4;
  if(sameRow&&b.x>a.x){
    var y=a.y+a.h/2+spread(e.oi,e.on,a.h*0.5);
    return 'M'+(a.x+a.w)+' '+y+' L'+(b.x-7)+' '+(b.y+b.h/2+spread(e.ii,e.inn,b.h*0.5));
  }
  if(sameRow){ // 되돌아가기 — 아래로 우회
    var x1=a.x+a.w/2,x2=b.x+b.w/2,yy=a.y+a.h,d=yy+24;
    return 'M'+x1+' '+yy+' C'+x1+' '+d+' '+x2+' '+d+' '+x2+' '+(yy+7);
  }
  var down=b.y>a.y;
  var sx=a.x+a.w/2+spread(e.oi,e.on,a.w), sy=down?a.y+a.h:a.y;
  var tx=b.x+b.w/2+spread(e.ii,e.inn,b.w), ty=down?b.y-7:b.y+b.h+7;
  var mid=(sy+ty)/2;
  return 'M'+sx+' '+sy+' C'+sx+' '+mid+' '+tx+' '+mid+' '+tx+' '+ty;
}
function midOf(d){
  var m=d.match(/-?[\d.]+/g).map(Number);
  if(d[0]==='M'&&d.indexOf('L')>0)return {x:(m[0]+m[2])/2,y:(m[1]+m[3])/2};
  return {x:(m[0]+m[6])/2,y:(m[1]+m[7])/2};
}

// ── 그리기 ──
var svg,viewport,zoomLabel,paneEl;
function draw(){
  paneEl=document.getElementById('graphPane');
  svg=el('svg',{viewBox:'0 0 '+totalW+' '+totalH,role:'img','aria-label':'writer 비주얼 축과 샷 층의 노드 배선도',preserveAspectRatio:'xMidYMin meet'});
  var defs=el('defs');
  ['v','s','c','x','dead'].forEach(function(a){
    var mk=el('marker',{id:'ah-'+a,viewBox:'0 0 8 8',refX:'6.6',refY:'4',markerWidth:'6',markerHeight:'6',orient:'auto-start-reverse'});
    mk.appendChild(el('path',{d:'M0 .8 L7 4 L0 7.2 Z',fill:ax(a)}));
    defs.appendChild(mk);
  });
  svg.appendChild(defs);
  viewport=el('g',{id:'vp'});
  svg.appendChild(viewport);

  BANDS.forEach(function(b){
    var g=el('g');
    g.appendChild(el('rect',{x:8,y:b.y,width:totalW-16,height:b.h,rx:3,fill:'var(--surface-2)',opacity:'.5'}));
    g.appendChild(el('line',{x1:8,y1:b.y,x2:totalW-8,y2:b.y,stroke:ax(b.axis),'stroke-width':'2'}));
    g.appendChild(el('text',{x:18,y:b.y+22,class:'band-label'},b.label));
    g.appendChild(el('text',{x:totalW-18,y:b.y+22,class:'band-count','text-anchor':'end'},b._n+'개 노드'));
    viewport.appendChild(g);
  });

  var eLayer=el('g'); viewport.appendChild(eLayer);
  EDGES.forEach(function(e,i){
    var d=pathFor(e); e.d=d; e.key='e'+i;
    var src=byId[e.from];
    var a=(e.usage==='unused')?'dead':(src?src.axis:'x');
    var g=el('g',{class:'eg'}); g.dataset.edge=e.key;
    g.appendChild(el('path',{class:'edge-halo',d:d,'stroke-width':e.usage==='unused'?'3.5':'4.5'}));
    var p=el('path',{class:'edge',d:d,stroke:ax(a),'stroke-width':e.usage==='unused'?'1':'1.5','stroke-dasharray':e.usage==='unused'?'3 3':(e.usage==='fallback'?'1 3':'none'),'marker-end':'url(#ah-'+a+')',opacity:e.usage==='unused'?'.55':'.8'});
    g.appendChild(p);
    var m=midOf(d);
    var label=(e.fields||'').split(',')[0].trim().slice(0,26)||USAGE[e.usage]||'';
    var bg=el('rect',{class:'edge-lab-bg',x:m.x-label.length*2.7-4,y:m.y-7,width:label.length*5.4+8,height:13,rx:2});
    g.appendChild(bg);
    g.appendChild(el('text',{class:'edge-lab',x:m.x,y:m.y+3,'text-anchor':'middle'},label));
    var hit=el('path',{class:'edge-hit',d:d,tabindex:'0',role:'button'});
    hit.setAttribute('aria-label',(byId[e.from]?byId[e.from].label:e.from)+' 에서 '+(byId[e.to]?byId[e.to].label:e.to)+' 로 가는 연결');
    hit.addEventListener('click',function(ev){ev.stopPropagation();selectEdge(e.key);});
    hit.addEventListener('keydown',function(ev){if(ev.key==='Enter'||ev.key===' '){ev.preventDefault();selectEdge(e.key);}});
    g.addEventListener('mouseenter',function(){if(!sel)g.classList.add('show','hot');});
    g.addEventListener('mouseleave',function(){if(sel&&sel.type==='edge'&&sel.id===e.key)return;if(!alwaysLabels)g.classList.remove('show');g.classList.remove('hot');});
    g.appendChild(hit);
    e.g=g;
    eLayer.appendChild(g);
  });

  var nLayer=el('g'); viewport.appendChild(nLayer);
  NODES.forEach(function(n){
    var p=pos[n.id]; if(!p)return;
    var g=el('g',{class:'node-box',tabindex:'0',role:'button','aria-label':n.label+' — '+(KIND_NAME[n.kind]||n.kind)});
    g.dataset.node=n.id;
    g.appendChild(el('rect',{class:'focus-ring',x:p.x-4,y:p.y-4,width:p.w+8,height:p.h+8,rx:5,fill:'none',stroke:ax(n.axis),'stroke-width':'1.5'}));
    var dead=n.kind==='orphan';
    g.appendChild(el('rect',{class:'node-rect',x:p.x,y:p.y,width:p.w,height:p.h,rx:3,fill:n.kind==='llm'?'var(--surface-3)':'var(--surface)',stroke:dead?'var(--dead)':ax(n.axis),'stroke-width':n.kind==='llm'?'1.8':'1','stroke-dasharray':dead?'4 3':'none'}));
    g.appendChild(el('rect',{x:p.x,y:p.y,width:3,height:p.h,fill:dead?'var(--dead)':ax(n.axis),opacity:n.kind==='llm'?'1':'.65'}));
    g.appendChild(el('text',{class:'node-label',x:p.x+11,y:p.y+20,fill:dead?'var(--muted)':'var(--ink)'},n.label));
    g.appendChild(el('text',{class:'node-sub',x:p.x+11,y:p.y+35,fill:'var(--muted)'},n.sub||''));
    if(n.model)g.appendChild(el('text',{class:'node-sub',x:p.x+p.w-9,y:p.y+35,'text-anchor':'end',fill:ax(n.axis)},n.model+'축'));
    var bad=(n.checks||[]).filter(function(c){return !c.ok||c.drift;}).length+(n.probes||[]).filter(function(x){return x.count>0;}).length;
    if(bad)g.appendChild(el('circle',{cx:p.x+p.w-9,cy:p.y+11,r:4,fill:'var(--flag)'}));
    g.addEventListener('click',function(ev){ev.stopPropagation();selectNode(n.id);});
    g.addEventListener('keydown',function(ev){if(ev.key==='Enter'||ev.key===' '){ev.preventDefault();selectNode(n.id);}});
    nLayer.appendChild(g);
  });

  paneEl.innerHTML='';
  paneEl.appendChild(svg);
  svg.addEventListener('click',function(){clearSel();});
  svg.addEventListener('dblclick',function(){fit();});
  bindZoom();
  fit();
}

// ── 확대·축소·이동 ──
var view={k:1,x:0,y:0};
function applyView(){
  viewport.setAttribute('transform','translate('+view.x+' '+view.y+') scale('+view.k+')');
  if(zoomLabel)zoomLabel.textContent=Math.round(view.k*100)+'%';
}
function clampK(k){return Math.max(0.28,Math.min(2.6,k));}
function fit(){
  var r=paneEl.getBoundingClientRect();
  var k=clampK(Math.min(r.width/totalW,r.height/totalH)*0.98);
  view.k=k; view.x=(r.width-totalW*k)/2; view.y=(r.height-totalH*k)/2;
  syncViewBox(r); applyView();
}
function reset(){
  var r=paneEl.getBoundingClientRect();
  view.k=1; view.x=(r.width-totalW)/2; view.y=8;
  syncViewBox(r); applyView();
}
function syncViewBox(r){ svg.setAttribute('viewBox','0 0 '+r.width+' '+r.height); }
function zoomAt(cx,cy,f){
  var k2=clampK(view.k*f); if(k2===view.k)return;
  view.x=cx-(cx-view.x)*(k2/view.k);
  view.y=cy-(cy-view.y)*(k2/view.k);
  view.k=k2; applyView();
}
function bindZoom(){
  var r=paneEl.getBoundingClientRect(); syncViewBox(r);
  paneEl.addEventListener('wheel',function(ev){
    ev.preventDefault();
    var b=paneEl.getBoundingClientRect();
    zoomAt(ev.clientX-b.left,ev.clientY-b.top,ev.deltaY<0?1.12:1/1.12);
  },{passive:false});
  var drag=null;
  svg.addEventListener('pointerdown',function(ev){
    if(ev.target.closest('.node-box')||ev.target.closest('.edge-hit'))return;
    drag={x:ev.clientX,y:ev.clientY,vx:view.x,vy:view.y};
    svg.classList.add('panning'); svg.setPointerCapture(ev.pointerId);
  });
  svg.addEventListener('pointermove',function(ev){
    if(!drag)return;
    view.x=drag.vx+(ev.clientX-drag.x); view.y=drag.vy+(ev.clientY-drag.y); applyView();
  });
  ['pointerup','pointercancel'].forEach(function(t){
    svg.addEventListener(t,function(){drag=null;svg.classList.remove('panning');});
  });
  window.addEventListener('resize',function(){ syncViewBox(paneEl.getBoundingClientRect()); });
}

// ── 선택 ──
var sel=null, alwaysLabels=false;
function clearSel(){
  sel=null;
  document.querySelectorAll('.node-box,.eg').forEach(function(x){x.classList.remove('dim','hot');});
  EDGES.forEach(function(e){ if(!alwaysLabels)e.g.classList.remove('show'); });
  renderDetail(null);
}
function selectNode(id){
  if(sel&&sel.type==='node'&&sel.id===id){clearSel();return;}
  sel={type:'node',id:id};
  var rel={}; rel[id]=1;
  EDGES.forEach(function(e){ if(e.from===id)rel[e.to]=1; if(e.to===id)rel[e.from]=1; });
  document.querySelectorAll('.node-box').forEach(function(g){ g.classList.toggle('dim',!rel[g.dataset.node]); });
  EDGES.forEach(function(e){
    var on=(e.from===id||e.to===id);
    e.g.classList.toggle('dim',!on);
    e.g.classList.toggle('show',on||alwaysLabels);
    e.g.classList.toggle('hot',on);
  });
  renderDetail({type:'node',node:byId[id]});
}
function selectEdge(key){
  if(sel&&sel.type==='edge'&&sel.id===key){clearSel();return;}
  sel={type:'edge',id:key};
  var e=EDGES.filter(function(x){return x.key===key;})[0];
  document.querySelectorAll('.node-box').forEach(function(g){
    g.classList.toggle('dim',g.dataset.node!==e.from&&g.dataset.node!==e.to);
  });
  EDGES.forEach(function(x){
    var on=x.key===key;
    x.g.classList.toggle('dim',!on);
    x.g.classList.toggle('show',on||alwaysLabels);
    x.g.classList.toggle('hot',on);
  });
  renderDetail({type:'edge',edge:e});
}

// ── 상세 ──
function nodeName(id){return byId[id]?byId[id].label:id;}
function tag(cls,txt){return h('span','tag '+cls,txt);}

function renderDetail(x){
  var pane=document.getElementById('detailPane');
  pane.innerHTML=''; pane.scrollTop=0;
  if(!x){
    var e=h('div','detail-empty');
    e.innerHTML='<b>노드나 엣지를 고르면 여기에 펼쳐진다.</b><br>노드 = 그 단계의 지시문 원문·상수·실제 산출·도입 배경.<br>엣지 = 그 구간이 실제로 무엇을 실어 나르는지.';
    pane.appendChild(e); return;
  }
  if(x.type==='edge')return renderEdge(pane,x.edge);
  renderNode(pane,x.node);
}

function renderEdge(pane,e){
  var from=byId[e.from],to=byId[e.to];
  var head=h('div','d-head');
  var k=h('div','d-kicker');
  k.appendChild(tag('t-'+(from?from.axis:'x'),'연결'));
  k.appendChild(tag(e.usage==='unused'?'t-dead':'t-x',USAGE[e.usage]||e.usage));
  head.appendChild(k);
  head.appendChild(h('div','d-title',(from?from.label:e.from)+' → '+(to?to.label:e.to)));
  head.appendChild(h('div','d-fn','이 구간이 실어 나르는 것'));
  pane.appendChild(head);
  var b=h('div','d-body');
  var f=h('div','d-block');
  f.appendChild(h('div','d-h','운반 필드'));
  f.appendChild(h('div','io-fields',e.fields||'—'));
  b.appendChild(f);
  if(e.note){
    var nb=h('div','d-block');
    nb.appendChild(h('div','d-h','눈에 띄는 점'));
    var nn=h('div','d-summary'); nn.innerHTML=e.note; nb.appendChild(nn);
    b.appendChild(nb);
  }
  ['from','to'].forEach(function(side){
    var n=side==='from'?from:to;
    if(!n)return;
    var blk=h('div','d-block');
    blk.appendChild(h('div','d-h',side==='from'?'보내는 쪽':'받는 쪽'));
    var a=h('div','io-row');
    var l=h('div','io-from'); var link=h('a',null,n.label);
    link.addEventListener('click',function(){selectNode(n.id);});
    l.appendChild(link); a.appendChild(l);
    var rr=h('div'); var s=h('div','io-note'); s.innerHTML=n.summary; rr.appendChild(s); a.appendChild(rr);
    blk.appendChild(a);
    b.appendChild(blk);
  });
  pane.appendChild(b);
}

function renderNode(pane,n){
  var head=h('div','d-head');
  var k=h('div','d-kicker');
  k.appendChild(tag('t-'+n.axis,AXIS_NAME[n.axis]));
  k.appendChild(tag(n.kind==='orphan'?'t-dead':'t-x',KIND_NAME[n.kind]||n.kind));
  if(n.model)k.appendChild(tag('t-'+n.axis,'모델 '+n.model+'축'));
  head.appendChild(k);
  head.appendChild(h('div','d-title',n.label));
  if(n.fn||n.file)head.appendChild(h('div','d-fn',(n.fn?n.fn+'  ·  ':'')+(n.file||'')));
  pane.appendChild(head);

  var b=h('div','d-body');
  if(n.calls)b.appendChild(block('호출 형태',function(w){var d=h('div','d-summary');d.innerHTML=n.calls;w.appendChild(d);}));
  b.appendChild(block('하는 일',function(w){var d=h('div','d-summary');d.innerHTML=n.summary;w.appendChild(d);}));

  if((n.checks||[]).length)b.appendChild(block('코드에서 지금 읽은 값',function(w){
    n.checks.forEach(function(c){
      var r=h('div','chk-row');
      r.appendChild(h('span',null,c.label));
      var v=h('span','chk-val'+(c.drift||!c.ok?' drift':''),c.ok?c.value:'못 찾음');
      if(c.drift)v.textContent=c.value+'  (문서: '+c.expect+')';
      r.appendChild(v); w.appendChild(r);
    });
  }));

  if((n.inputs||[]).length)b.appendChild(block('받는 값',function(w){
    n.inputs.forEach(function(inp){
      var r=h('div','io-row');
      var l=h('div','io-from'); var a=h('a',null,nodeName(inp.from));
      a.addEventListener('click',function(){selectNode(inp.from);});
      l.appendChild(a); r.appendChild(l);
      var rr=h('div');
      rr.appendChild(h('div','io-fields',inp.fields||'—'));
      var nt=h('div','io-note');
      nt.appendChild(tag(inp.usage==='unused'?'t-dead':'t-x',USAGE[inp.usage]||inp.usage));
      if(inp.note)nt.appendChild(document.createTextNode(' '+inp.note));
      rr.appendChild(nt); r.appendChild(rr); w.appendChild(r);
    });
  }));

  if((n.outputs||[]).length)b.appendChild(block('내보내는 값과 그 소비처',function(w){
    n.outputs.forEach(function(o){
      var st=STATUS[o.status]||STATUS.live;
      var r=h('div','io-row');
      var l=h('div','io-from'); l.appendChild(tag(st[0],st[1])); r.appendChild(l);
      var rr=h('div');
      rr.appendChild(h('div','io-fields',o.field));
      var t=(o.consumers?'→ '+o.consumers:'')+(o.note?(o.consumers?' · ':'')+o.note:'');
      if(t){var nt=h('div','io-note');nt.innerHTML=t;rr.appendChild(nt);}
      r.appendChild(rr); w.appendChild(r);
    });
    (n.probes||[]).forEach(function(p){
      var r=h('div','io-row');
      var l=h('div','io-from'); l.appendChild(tag(p.count>0?'t-flag':'t-x',p.count>0?'배선됨':'재확인 0')); r.appendChild(l);
      var rr=h('div');
      rr.appendChild(h('div','io-fields',p.field));
      rr.appendChild(h('div','io-note',p.count>0?('지금 '+p.count+'곳이 읽는다 — '+p.hits.join(', ')):'이 페이지를 열 때 다시 세어 봤고 읽는 곳이 없었다'));
      r.appendChild(rr); w.appendChild(r);
    });
  }));

  if((n.contracts||[]).length)b.appendChild(block('이 단계가 강제하는 것',function(w){
    var ul=h('ul','contract-list');
    n.contracts.forEach(function(c){var li=document.createElement('li');li.innerHTML=c;ul.appendChild(li);});
    w.appendChild(ul);
  }));

  if((n.prompts||[]).length)b.appendChild(block('지시문 원문 — 지금 코드에서 읽어 온 것',function(w){
    n.prompts.forEach(function(p){
      var pre=h('pre','prompt is-'+n.axis+(p.broken?' broken':''));
      pre.textContent=p.broken?('앵커가 끊겼다 — '+p.reason+'\n(코드가 바뀌었다는 뜻이다. data.mjs 의 앵커를 고쳐야 한다.)'):p.text;
      w.appendChild(pre);
      var cap=h('div','prompt-cap');
      cap.appendChild(h('b',null,p.label||''));
      cap.appendChild(h('span',null,p.src||''));
      w.appendChild(cap);
      if(p.note){var nn=h('p','pnote');nn.innerHTML=p.note;w.appendChild(nn);}
    });
  }));

  if((n.data||[]).length)b.appendChild(block('실제 산출 예시 — 런 로그에서 읽어 온 것',function(w){
    n.data.forEach(function(d){
      var pre=h('pre','data'); pre.textContent=d.text; w.appendChild(pre);
      var cap=h('div','prompt-cap');
      cap.appendChild(h('b',null,d.label||''));
      cap.appendChild(h('span',null,d.src||''));
      w.appendChild(cap);
    });
  }));

  if((n.why||[]).length)b.appendChild(block('왜 이 모양이 됐나',function(w){
    n.why.forEach(function(y){
      var it=h('div','why-item');
      it.appendChild(h('div','why-what',y.what));
      var ww=h('div','why-why'); ww.innerHTML=y.why; it.appendChild(ww);
      if(y.src)it.appendChild(h('div','why-src',y.src));
      w.appendChild(it);
    });
  }));

  pane.appendChild(b);
}
function block(title,fill){
  var w=h('div','d-block');
  w.appendChild(h('div','d-h',title));
  fill(w);
  return w;
}

// ── 나머지 ──
function renderLegend(){
  var wrap=document.getElementById('legend');
  [['노드 종류',[['<span class="swatch" style="background:var(--surface-3);border-color:var(--s)"></span>','테두리 굵음 — 모델이 판단하는 단계'],['<span class="swatch" style="background:transparent;border-color:var(--s);border-width:1px"></span>','테두리 얇음 — 코드가 계산·강제하는 단계'],['<span class="swatch" style="background:transparent;border-color:var(--dead);border-style:dashed"></span>','점선 — 프로덕션에서 도달 불가']]],
   ['축',[['<span class="swatch" style="background:var(--v-wash);border-color:var(--v)"></span>','Visual 축 — 스타일·조명·씬 촬영계획'],['<span class="swatch" style="background:var(--s-wash);border-color:var(--s)"></span>','샷 층 — 분해와 설계'],['<span class="swatch" style="background:var(--c-wash);border-color:var(--c)"></span>','검증 축 — 검수와 조립']]],
   ['엣지 (클릭 가능)',[['<span class="edge-key" style="border-color:var(--v)"></span>','실선 — 값이 실제로 실려 간다'],['<span class="edge-key dot" style="border-color:var(--s)"></span>','점 — 폴백·조건부 경로'],['<span class="edge-key dash"></span>','파선 — 받지만 안 쓰거나 소비처가 없다']]],
   ['표시',[['<span class="swatch" style="background:var(--flag);border-color:var(--flag)"></span>','빨간 점 — 문서와 코드가 어긋났거나 배선이 생겼다'],['<span class="tag t-flag">끊김</span>','생산되는데 도착하지 않는 값'],['<span class="tag t-dead">소비처 0</span>','만들어지고 아무도 안 읽는 값']]]
  ].forEach(function(c){
    var cell=h('div','legend-cell');
    cell.appendChild(h('div','legend-title',c[0]));
    c[1].forEach(function(it){var r=h('div','legend-item');r.innerHTML=it[0]+'<span>'+it[1]+'</span>';cell.appendChild(r);});
    wrap.appendChild(cell);
  });
}

function renderLedger(){
  var body=document.getElementById('ledgerBody');
  NODES.forEach(function(n){
    if(n.kind==='input')return;
    var tr=document.createElement('tr');
    tr.addEventListener('click',function(){selectNode(n.id);document.getElementById('map').scrollIntoView({behavior:'smooth',block:'start'});});
    var t1=document.createElement('td');
    t1.appendChild(h('span','row-name',n.label));
    if(n.file)t1.appendChild(h('span','row-file',n.file));
    tr.appendChild(t1);
    var t2=document.createElement('td');
    t2.appendChild(tag(n.kind==='orphan'?'t-dead':'t-'+n.axis,KIND_NAME[n.kind]||n.kind));
    tr.appendChild(t2);
    var t3=document.createElement('td');t3.className='mono';t3.textContent=n.model||'—';tr.appendChild(t3);
    var t4=document.createElement('td');t4.style.fontSize='12.5px';t4.textContent=(n.calls||'—').replace(/<[^>]+>/g,'');tr.appendChild(t4);
    var t5=document.createElement('td');t5.className='mono';t5.textContent=(n.inputs||[]).map(function(i){return nodeName(i.from);}).join(', ')||'—';tr.appendChild(t5);
    var t6=document.createElement('td');t6.className='mono';t6.textContent=(n.outputs||[]).map(function(o){return o.field;}).join(', ')||'—';tr.appendChild(t6);
    var t7=document.createElement('td');
    var outs=n.outputs||[];
    var dead=outs.filter(function(o){return o.status==='dropped';}).length;
    var flag=outs.filter(function(o){return o.status==='flag';}).length;
    if(n.kind==='orphan')t7.appendChild(tag('t-dead','경로 단절'));
    else{
      if(dead)t7.appendChild(tag('t-flag','사장 '+dead));
      if(flag)t7.appendChild(tag('t-flag','끊김 '+flag));
      if(!dead&&!flag)t7.appendChild(tag('t-x','전부 소비'));
    }
    tr.appendChild(t7);
    body.appendChild(tr);
  });
}

function renderChain(){
  var wrap=document.getElementById('chainWrap');
  var note=document.getElementById('chainNote');
  if(M.run){
    note.innerHTML='실제 런 <span style="font-family:var(--mono)">'+M.run.id.slice(0,8)+'</span> 에서 한 샷을 골라, 단계마다 그 샷이 무엇으로 바뀌는지를 <b>런 로그 원본 그대로</b> 늘어놓았다. '+
      (M.run.story?('이야기: '+M.run.story+' · '):'')+
      (M.run.decoupageShots!=null?('데쿠파주 '+M.run.decoupageShots+'샷 → 최종 '+M.run.totalShots+'샷 · 추가 '+M.run.added+' · 병합 '+M.run.merged+' · 분할 '+M.run.split):'');
  } else {
    note.textContent='로컬에 런 로그가 없어 예시를 띄우지 못했다. logs/ 아래에 완결된 런이 있으면 자동으로 잡는다.';
  }
  M.chain.forEach(function(st){
    var row=h('div','chain-step');
    var l=h('div','chain-left');
    l.appendChild(h('div','chain-stage',st.stage));
    l.appendChild(h('div','chain-name',st.name));
    if(st.what)l.appendChild(h('div','chain-what',st.what));
    row.appendChild(l);
    var r=h('div','chain-right');
    if(st.say){var p=h('p','chain-say');p.innerHTML=st.say;r.appendChild(p);}
    if(st.text){var pre=h('pre','data');pre.textContent=st.text;r.appendChild(pre);}
    if(st.delta){var d=h('div','delta');d.innerHTML=st.delta;r.appendChild(d);}
    row.appendChild(r);
    wrap.appendChild(row);
  });
}

function renderFindings(){
  var wrap=document.getElementById('findingsWrap');
  M.findings.forEach(function(f){
    var card=h('div','finding'+(f.tone?' '+f.tone:''));
    var head=h('div','f-head');
    head.appendChild(h('div','f-title',f.title));
    if(f.badge)head.appendChild(tag(f.tone==='note'?'t-s':f.tone==='soft'?'t-dead':'t-flag',f.badge));
    if(f.verified)head.appendChild(tag('t-x','반증 시도 통과'));
    if(f.liveCount!=null)head.appendChild(tag(f.liveCount>0?'t-flag':'t-x',f.liveCount>0?('지금 '+f.liveCount+'곳이 읽음'):'지금도 소비처 0'));
    card.appendChild(head);
    var b=h('div','f-body'); b.innerHTML=f.body; card.appendChild(b);
    if(f.ev)card.appendChild(h('div','f-ev',f.ev));
    wrap.appendChild(card);
  });
}

function renderMeta(){
  var row=document.getElementById('metaRow');
  var llm=NODES.filter(function(n){return n.kind==='llm';}).length;
  var code=NODES.filter(function(n){return n.kind==='code'||n.kind==='check';}).length;
  var orphan=NODES.filter(function(n){return n.kind==='orphan';}).length;
  var drop=0; NODES.forEach(function(n){(n.outputs||[]).forEach(function(o){if(o.status==='dropped'||o.status==='flag')drop++;});});
  [['노드',NODES.length+'개'],['엣지',EDGES.length+'개'],['모델이 판단',llm+'단계'],['코드가 강제',code+'단계'],['프로덕션 경로 단절',orphan+'개'],['소비처 없는 출력',drop+'건']]
    .forEach(function(it){var s=document.createElement('span');s.innerHTML=it[0]+' <b>'+it[1]+'</b>';row.appendChild(s);});
  document.getElementById('stamp').textContent=M.generatedAt.slice(0,10)+' 코드 기준';

  if(M.drift.length){
    var box=document.getElementById('driftBox');
    var d=h('div','drift');
    d.appendChild(h('div','drift-t','문서와 코드가 어긋난 자리 '+M.drift.length+'건'));
    var ul=document.createElement('ul');
    M.drift.forEach(function(x){var li=document.createElement('li');li.textContent=x.node+' — '+x.label+': '+x.detail;ul.appendChild(li);});
    d.appendChild(ul); box.appendChild(d);
  }
}

document.addEventListener('keydown',function(e){
  if(e.key==='Escape')clearSel();
  if(e.target&&/INPUT|TEXTAREA/.test(e.target.tagName))return;
  if(e.key==='+'||e.key==='=')zoomAt(paneEl.clientWidth/2,paneEl.clientHeight/2,1.15);
  if(e.key==='-'||e.key==='_')zoomAt(paneEl.clientWidth/2,paneEl.clientHeight/2,1/1.15);
  if(e.key==='0')fit();
});

renderLegend();
draw();
zoomLabel=document.getElementById('zoomLabel');
applyView();
renderLedger();
renderChain();
renderFindings();
renderMeta();
renderDetail(null);

document.querySelectorAll('[data-zoom]').forEach(function(btn){
  btn.addEventListener('click',function(){
    var a=btn.dataset.zoom;
    if(a==='in')zoomAt(paneEl.clientWidth/2,paneEl.clientHeight/2,1.2);
    else if(a==='out')zoomAt(paneEl.clientWidth/2,paneEl.clientHeight/2,1/1.2);
    else if(a==='fit')fit();
    else reset();
  });
});
document.getElementById('clearSel').addEventListener('click',clearSel);
document.getElementById('labelToggle').addEventListener('change',function(e){
  alwaysLabels=e.target.checked;
  EDGES.forEach(function(x){ x.g.classList.toggle('show',alwaysLabels||(sel&&!x.g.classList.contains('dim')&&x.g.classList.contains('hot'))); });
});
})();
`

// ── 라이브 리로드 (serve 전용) ────────────────────────────────────────────────
const LIVE = String.raw`
(function(){
  var box=document.createElement('div');
  box.className='reload'; box.textContent='코드 변경 감시 중';
  document.body.appendChild(box);
  var es=new EventSource('/events');
  es.addEventListener('changed',function(){
    box.textContent='변경 감지 — 다시 그리는 중';
    location.reload();
  });
  es.onerror=function(){ box.textContent='서버 연결 끊김'; };
})();
`
