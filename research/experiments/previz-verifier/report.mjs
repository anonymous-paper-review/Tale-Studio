// previz 검증기 — HTML 리포트 생성 (범용).
//   usage: node report.mjs <runDir>
//   입력: data.json, work/aggregate.json, work/readback_coverage.json, work/commentary.json, thumbs/*.jpg
//   산출: <runDir>/report.html
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const runDir = process.argv[2]
const d = JSON.parse(readFileSync(join(runDir, 'data.json'), 'utf8'))
const agg = JSON.parse(readFileSync(join(runDir, 'work', 'aggregate.json'), 'utf8'))
const rb = JSON.parse(readFileSync(join(runDir, 'work', 'readback_coverage.json'), 'utf8'))
const cm = JSON.parse(readFileSync(join(runDir, 'work', 'commentary.json'), 'utf8'))

const SCENES = agg.scenes
const hasMotion = !!agg.B.hasMotion
const thumbFile = (name) => join(runDir, 'thumbs', `${name}.jpg`)
const thumb = (name) => existsSync(thumbFile(name)) ? `data:image/jpeg;base64,${readFileSync(thumbFile(name)).toString('base64')}` : ''
const shotThumbs = (shotId) => hasMotion
  ? ['start', 'direction', 'end'].map((k) => ({ k, src: thumb(`${shotId}_${k}`) }))
  : [{ k: 'panel', src: thumb(`${shotId}_panel`) }]
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const pct = (x) => Math.round(x * 100)

const sceneMeta = (sc) => d.scenes.scenes.find((s) => s.scene_id === `scene_${Number(sc.slice(3))}`)
const stat = (sc) => agg.stats.find((s) => s.scene === sc)
const shotsBySc = new Map(SCENES.map((sc) => [sc, agg.B.rows.filter((r) => r.scene === sc)]))

const a = agg.A, b = agg.B, E = agg.E
const ruleRate = pct(a.ruleTally.MET / (a.ruleTally.MET + a.ruleTally.UNMET))
const cFlagRate = pct(1 - agg.C.flags.length / agg.C.shotCount)
const detW = agg.det.filter((f) => f.severity === 'WARNING').length
const detI = agg.det.filter((f) => f.severity === 'INFO').length
const detC = agg.det.filter((f) => f.severity === 'CRITICAL').length

const bar = (val, cls = '') => `<div class="bar"><div class="bar-fill ${cls}" style="width:${pct(val)}%"></div><span class="bar-num">${pct(val)}%</span></div>`
const vBadge = (v) => v === '✓' ? '<span class="b ok">✓ 전달</span>' : v === '△' ? '<span class="b half">△ 부분</span>' : '<span class="b miss">✗ 미전달</span>'

const strip = (sc) => shotsBySc.get(sc).map((r) => {
  const fields = ['size', 'angle', 'figures', 'background', ...(hasMotion ? ['motion'] : [])]
  const misses = fields.filter((f) => r[f]?.verdict === 'MISS')
  const cap = r.size.verdict === 'NA' ? `${r.expected.shot_type}` : `${r.expected.shot_type}→${r.read.size}`
  const imgs = shotThumbs(r.shot_id).map((t) => `<img src="${t.src}" alt="${r.shot_id} ${t.k}" loading="lazy">`).join('')
  return `<figure class="cell${misses.length ? ' cell-miss' : ''}${hasMotion ? ' cell-triple' : ''}">
    <div class="cell-imgs">${imgs}</div>
    <figcaption><span class="mono">${r.shot_id}</span><span class="mono cap-size${r.size.verdict === 'MISS' ? ' t-warn' : ''}">${cap}${hasMotion && r.motion ? ` · ${r.motion.expected}${r.motion.verdict === 'MISS' ? `→${r.motion.got}` : ''}` : ''}</span>${misses.length ? `<span class="cap-miss">${misses.join('·')}</span>` : ''}</figcaption>
  </figure>`
}).join('')

// ---- A 섹션: 씬 카드 — "설계가 하려던 것(입력)" ↔ "검증기 판별" 나란히
const tr = existsSync(join(runDir, 'work', 'translations.json'))
  ? JSON.parse(readFileSync(join(runDir, 'work', 'translations.json'), 'utf8'))
  : { purpose: {}, action: {} }
const designByIdA = new Map(d.shotDesign.map((x) => [x.intent.shot_id, x]))
const anyRefsA = d.shots.some((s) => s.design_ref)
const normIdA = (id) => { const m = id.match(/^sh_\d+_(\d+)$/); return m ? `shot_${Number(m[1])}` : id }
const designOfDb = (s) => designByIdA.get(s.design_ref) ?? (anyRefsA ? null : designByIdA.get(normIdA(s.shot_id)))
const ANGLE_KO = { eye_level: '아이레벨', low_angle: '로우앵글', slightly_low: '약간 로우', high_angle: '하이앵글' }
const MOTION_KO = { static: '고정', handheld_drift: '핸드헬드 드리프트', tracking: '트래킹', dolly_in: '달리 인', dolly_out: '달리 아웃', pan: '팬', tilt: '틸트', crane: '크레인', rack_focus: '랙 포커스' }
const RULE_KO = { RA1: '하이앵글⇒약세', RA2: 'CU⇒감정 피크', RA3: '와이드⇒상황 전달', RA4: 'FS⇒전신 액션', RA5: '점프컷⇒의도 선언' }
const vb = (v) => v === 'MET' ? '<span class="b ok">충족</span>' : v === 'UNMET' ? '<span class="b miss">불충족</span>' : '<span class="b info">해당 없음</span>'
const cb = (v) => v === 'OK' ? '<span class="b ok">문제없음</span>' : v === 'ISSUE' ? '<span class="b miss">이슈</span>' : '<span class="b info">해당 없음</span>'

const aSceneCards = SCENES.map((sc) => {
  const res = a.scenes[sc]
  const st = stat(sc)
  const meta = sceneMeta(sc)
  const dbShots = d.shots.filter((s) => s.scene_id === sc).sort((x, y) => x.sort_order - y.sort_order)
  const flow = dbShots.map((s) => { const dg = designOfDb(s); return dg ? dg.static_spec.shot_type : '(분할)' }).join('→')
  const dialogueShots = dbShots.filter((s) => Array.isArray(s.dialogue_lines) && s.dialogue_lines.length).map((s) => s.shot_id)
  const ratio = st.estimatedSeconds ? st.totalSeconds / st.estimatedSeconds : null
  const beats = (meta.scene_actions ?? []).map((b) => `<li>${esc(b)}</li>`).join('')
  const ruleRows = res.shotRules.map((r) => {
    const db = dbShots.find((s) => s.shot_id === r.shot_id)
    const dg = db ? designOfDb(db) : null
    const spec = dg ? `${dg.static_spec.shot_type} · ${ANGLE_KO[dg.static_spec.camera_angle] ?? dg.static_spec.camera_angle} · ${MOTION_KO[dg.dynamic_spec?.camera_motion?.type] ?? ''} · ${dg.intent.duration_seconds}s` : ''
    const purpose = tr.purpose[r.shot_id] ? `“${tr.purpose[r.shot_id]}”` : ''
    return `<tr><td class="mono" style="white-space:nowrap">${r.shot_id}</td>
      <td><span class="mono" style="font-size:11.5px">${spec}</span><br><span class="quote">${esc(purpose)}</span></td>
      <td style="white-space:nowrap">${vb(r.verdict)}<br><span class="mono" style="font-size:11px;color:var(--muted)">${RULE_KO[r.rule] ?? r.rule}</span></td>
      <td class="quote">${esc(r.evidence)}</td></tr>`
  }).join('')
  const SC_INPUT = {
    SC1: `샷 ${dbShots.length}개의 목적·액션 전체 (중복 여부)`,
    SC2: `beat ${meta.scene_actions?.length ?? 0}개 ↔ 샷 커버리지 (빈 구멍)`,
    SC3: `길이 [${st.durations.join(', ')}]s · 합 ${st.totalSeconds}s (파이프라인 자체 예상 ${st.estimatedSeconds}s는 참고용 — 독립 판정은 아래 오라클)`,
    SC4: `사이즈 흐름 ${flow} · 감정 ${meta.emotion_beat?.start}→${meta.emotion_beat?.end}`,
    SC5: `대사 실린 샷: ${dialogueShots.length ? dialogueShots.join(', ') : '없음'}`,
  }
  const checkRows = res.sceneChecks.map((c) => `<tr>
    <td style="width:38%"><span class="mono" style="font-size:11px;color:var(--muted)">${c.check}</span> ${esc(SC_INPUT[c.check] ?? '')}</td>
    <td style="white-space:nowrap">${cb(c.verdict)}</td>
    <td class="quote">${c.targets?.length ? `<span class="mono">${c.targets.join(', ')}</span> — ` : ''}${esc(c.evidence)}</td></tr>`).join('')
  const designless = st.designlessShots?.length ? `<p class="muted" style="font-size:12.5px;margin:8px 0 0">설계 없는 분할 자식: <span class="mono">${st.designlessShots.join(', ')}</span>${st.designlessShots.map((id) => tr.action[id] ? ` — “${tr.action[id]}”` : '').join('')} · 샷 규칙 판정 제외</p>` : ''
  return `<div class="card">
    <div class="card-head"><h4>${sc} <span class="muted">· ${esc(meta.purpose)} · 감정 ${esc(meta.emotion_beat?.start)}→${esc(meta.emotion_beat?.end)}</span></h4>
      <span class="mono cov ${ratio && (ratio < 0.7 || ratio > 1.3) ? 't-warn' : 't-ok'}">${st.totalSeconds}s / ${st.estimatedSeconds}s</span></div>
    <p style="font-size:13px;margin:6px 0 2px"><strong>씬이 하려던 것</strong> — beat 원문</p>
    <ol style="font-size:13px;margin:2px 0 10px;padding-left:20px">${beats}</ol>
    <p style="font-size:13px;margin:12px 0 2px"><strong>샷 규칙 판정</strong> — 왼쪽: 설계 입력 (형식 스펙 + 의도 원문 번역) / 오른쪽: 검증기 판별</p>
    <table class="tbl"><thead><tr><th>샷</th><th style="width:38%">설계가 하려던 것</th><th>판별</th><th>판별 근거</th></tr></thead><tbody>${ruleRows || '<tr><td colspan="4" class="muted">트리거된 샷 규칙 없음</td></tr>'}</tbody></table>
    <p style="font-size:13px;margin:12px 0 2px"><strong>씬 구성 판정</strong> — 왼쪽: 무엇을 입력으로 검사했나 / 오른쪽: 판별</p>
    <table class="tbl"><thead><tr><th>검사 대상 (입력)</th><th>판별</th><th>근거</th></tr></thead><tbody>${checkRows}</tbody></table>
    ${(() => {
      const a2 = agg.A2?.perScene?.[sc]
      if (!a2) return ''
      const ab = (v) => v === '적정' ? '<span class="b ok">적정</span>' : v === '과함' ? '<span class="b half">과함</span>' : v === '부족' ? '<span class="b miss">부족</span>' : '<span class="b info">—</span>'
      const rows2 = a2.shots.map((s2) => `<tr><td class="mono" style="white-space:nowrap">${s2.shot_id}</td>
        <td><span class="mono">${s2.est_min}~${s2.est_max}s</span><br><span class="quote">${esc(s2.reasoning)}</span></td>
        <td class="mono num" style="white-space:nowrap">${s2.designed ?? '—'}s</td><td>${ab(s2.verdict)}</td></tr>`).join('')
      const missRows = a2.missing.map((m) => `<tr><td><span class="b miss">샷 부족</span></td><td><strong>${esc(m.where)}</strong> — ${esc(m.proposal)}<br><span class="quote">${esc(m.reason)}</span></td></tr>`).join('')
      const redRows = a2.redundant.map((m) => `<tr><td><span class="b half">중복</span></td><td><span class="mono">${(m.shots ?? []).join(' + ')}</span> — 컷 후보 <span class="mono">${esc(m.cut_candidate)}</span><br><span class="quote">${esc(m.reason)}</span></td></tr>`).join('')
      return `<p style="font-size:13px;margin:12px 0 2px"><strong>시간 오라클</strong> — 검증기가 설계 길이를 <em>모른 채</em> 내용(대사 발화량·액션·정보량)만으로 추정한 필요 길이 ↔ 설계 길이 대조.
씬 총계: 오라클 <span class="mono">${a2.sceneTotal?.min}~${a2.sceneTotal?.max}s</span> vs 설계 <span class="mono">${a2.designedTotal}s</span> <span class="muted">(파이프라인 자체 예상 ${a2.pipelineEstimated}s — 참고용, 검증 근거 아님)</span>
<span class="quote" style="display:block;margin-top:2px">오라클 근거: ${esc(a2.sceneTotal?.reasoning ?? '')}</span></p>
      <table class="tbl"><thead><tr><th>샷</th><th style="width:52%">오라클 추정 (근거의 수치 분해)</th><th>설계</th><th>판정</th></tr></thead><tbody>${rows2}</tbody></table>
      ${missRows || redRows ? `<table class="tbl"><tbody>${missRows}${redRows}</tbody></table>` : '<p class="muted" style="font-size:12.5px">오라클 판정: 부족한 샷 없음 · 중복 샷 없음</p>'}`
    })()}
    ${designless}
  </div>`
}).join('')

const bBars = [
  ['샷 사이즈 (정확)', b.size.exactRate], ['샷 사이즈 (±1단계 허용)', b.size.tolRate],
  ['카메라 앵글 (±1단계)', b.angle.tolRate], ['인물 수 (정확)', b.figures.exactRate],
  ['배경 유무 (정확)', b.background.exactRate],
  ...(hasMotion ? [['카메라 모션 (동치 허용)', b.motion.exactRate], ['프레임 규율 (START=DIRECTION 구도)', b.discipline.exactRate]] : []),
]
const bMissRows = b.misses.map((m) => `<tr><td class="mono">${m.shot_id}</td><td class="mono">${m.scene}</td><td>${m.fields.map(esc).join('<br>')}</td></tr>`).join('')
const patternRows = (cm.patternRows ?? []).map((p) => `<tr><td>${esc(p.pattern)}</td><td class="num">${p.count}</td><td><span class="b ${p.cls}">${esc(p.label)}</span></td><td>${esc(p.text)}</td></tr>`).join('')

const galleryHtml = (cm.gallery ?? []).map((g) => `<div class="card"><img src="${thumb(g.image)}" alt="${g.id}">
  <div class="vs"><span class="t-warn">${esc(g.design)}</span><span>${esc(g.read)}</span></div>
  <h4>${esc(g.title)} <span class="mono muted">${g.id}</span></h4>
  <p class="note">${esc(g.note)}</p></div>`).join('')

const cBonus = agg.C.bonus
const cFlagCards = agg.C.flags.map((f) => `<div class="card"><h4>플래그 — <span class="mono">${f.shot_id}</span> (${f.id})</h4><p class="note muted">${esc(f.evidence)}</p></div>`).join('')

const rbCards = SCENES.map((sc) => {
  const r = rb.scenes[sc]; const cov = r.score / r.total
  const rows = r.beats.map((bt) => `<tr><td>${esc(bt.beat)}</td><td>${vBadge(bt.verdict)}</td><td class="quote">${esc(bt.quote)}</td></tr>`).join('')
  return `<div class="card">
    <div class="card-head"><h4>${sc} <span class="muted">· ${esc(sceneMeta(sc).purpose)}</span></h4><span class="mono cov ${cov >= 0.7 ? 't-ok' : cov >= 0.5 ? 't-warn' : 't-crit'}">${r.score}/${r.total} 비트</span></div>
    <table class="tbl"><thead><tr><th style="width:34%">설계된 beat</th><th style="width:10%">판정</th><th>관객 리드백 근거 (서술 원문 인용)</th></tr></thead><tbody>${rows}</tbody></table>
    <details><summary>관객 서술 전문 보기</summary><p class="narrative">${esc(agg.R[sc].narrative)}</p></details>
  </div>`
}).join('')

const detRows = agg.det.map((f) => `<tr><td><span class="b ${f.severity === 'CRITICAL' ? 'miss' : f.severity === 'WARNING' ? 'half' : 'info'}">${f.severity}</span></td><td class="mono">${f.rule}</td><td class="mono">${f.scene}${f.shots.length ? ' · ' + f.shots.join(', ') : ''}</td><td>${esc(f.detail)}</td></tr>`).join('')

// ---- 다이어트: 계약 모순 이슈 표 + 커버리지 제안 (절대 길이 판정은 오너 결정으로 제거)
const CHECK_LABEL = { SC1: '잉여 샷 (목적·액션 중복)', SC2: '부족 (beat 대비 빈 구멍)', SC3: '길이 배분', SC4: '리듬 흐름', SC5: '대사 계약 (선언 vs 샷 데이터)' }
const issueRows = a.issues.map((i) => `<tr><td class="mono">${i.scene}</td><td>${CHECK_LABEL[i.check] ?? i.check}</td><td class="quote">${i.targets?.length ? `<span class="mono">${i.targets.join(', ')}</span> — ` : ''}${esc(i.evidence)}</td></tr>`).join('')
const covRows = agg.A2 ? SCENES.flatMap((sc) => {
  const v = agg.A2.perScene[sc]; if (!v) return []
  return [
    ...v.missing.map((m) => `<tr><td class="mono">${sc}</td><td><span class="b miss">샷 부족</span></td><td><strong>${esc(m.where)}</strong> — ${esc(m.proposal)}<br><span class="quote">${esc(m.reason)}</span></td></tr>`),
    ...v.redundant.map((m) => `<tr><td class="mono">${sc}</td><td><span class="b half">중복</span></td><td><span class="mono">${(m.shots ?? []).join(' + ')}</span> — 컷 후보 <span class="mono">${esc(m.cut_candidate)}</span><br><span class="quote">${esc(m.reason)}</span></td></tr>`),
  ]
}).join('') : ''

// ---- 규칙 중심 뷰: 필기 규칙별로 선택(A)·반영(B)·효과(E)를 한 줄에
const allShotRules = Object.values(a.scenes).flatMap((s) => s.shotRules)
const eBy = new Map((E?.rows ?? []).map((r) => [r.shot_id, r]))
const cell = (num, den, warnBelow = 0.7) => den === 0 ? '<span class="muted">—</span>'
  : `<span class="mono ${num / den >= warnBelow ? 't-ok' : 't-warn'}">${num}/${den}</span>`
const ruleViewRow = (label, src, shots, opts) => {
  const ids = shots.map((r) => r.shot_id)
  const aV = allShotRules.filter((x) => opts.aRule && x.rule === opts.aRule && ids.includes(x.shot_id) && x.verdict !== 'NA')
  const aCell = opts.aRule ? cell(aV.filter((x) => x.verdict === 'MET').length, aV.length) : '<span class="muted">—</span>'
  const bV = opts.bField ? shots.filter((r) => r[opts.bField] && r[opts.bField].verdict !== 'NA') : []
  const bCell = opts.bField ? cell(bV.filter((r) => ['EXACT', 'ADJ'].includes(r[opts.bField].verdict)).length, bV.length) : '<span class="muted">—</span>'
  const eV = opts.eField ? shots.map((r) => eBy.get(r.shot_id)).filter((e) => e?.[opts.eField]) : []
  const eCell = opts.eField ? cell(eV.filter((e) => e[opts.eField].verdict === 'EXACT').length, eV.length) : '<span class="muted">—</span>'
  const badShots = [...new Set([
    ...aV.filter((x) => x.verdict === 'UNMET').map((x) => x.shot_id),
    ...bV.filter((r) => r[opts.bField].verdict === 'MISS').map((r) => r.shot_id),
    ...eV.filter((e) => e[opts.eField].verdict === 'MISS').map((e) => e.shot_id),
  ])]
  return `<tr><td><strong>${label}</strong><br><span class="muted" style="font-size:11.5px">${src}</span></td>
    <td>${aCell}</td><td>${bCell}</td><td>${eCell}</td>
    <td class="mono" style="font-size:12px">${badShots.length ? badShots.join(', ') : '<span class="t-ok">이상 없음</span>'}</td></tr>`
}
const rows = agg.B.rows
const highShots = rows.filter((r) => r.expected.camera_angle === 'high_angle')
const lowShots = rows.filter((r) => r.expected.camera_angle === 'low_angle')
const cuShots = rows.filter((r) => ['CU', 'ECU'].includes(r.expected.shot_type))
const wideShots = rows.filter((r) => ['WS', 'EWS'].includes(r.expected.shot_type))
const fsShots = rows.filter((r) => r.expected.shot_type === 'FS')
const detCount = (rule) => agg.det.filter((f) => f.rule.startsWith(rule)).length
const ruleView = `
${ruleViewRow('하이앵글 ⇒ 약세로 보여야', '필기 §하이앵글', highShots, { aRule: 'RA1', bField: 'angle', eField: 'stance' })}
${ruleViewRow('로우앵글 ⇒ 위압으로 보여야', '필기 대칭 파생', lowShots, { aRule: null, bField: 'angle', eField: 'stance' })}
${ruleViewRow('CU/ECU ⇒ 감정이 읽혀야', '필기 §클로즈업', cuShots, { aRule: 'RA2', bField: 'size', eField: 'emotion' })}
${ruleViewRow('와이드 ⇒ 상황·공간 전달', '필기 §풀샷·프레임', wideShots, { aRule: 'RA3', bField: 'size' })}
${fsShots.length ? ruleViewRow('풀샷 ⇒ 전신 액션', '필기 §풀샷', fsShots, { aRule: 'RA4', bField: 'size' }) : ''}
<tr><td><strong>점프컷은 의도 선언 필수</strong><br><span class="muted" style="font-size:11.5px">필기 §점프컷·피사체 크기</span></td>
  <td>${cell(allShotRules.filter((x) => x.rule === 'RA5' && x.verdict === 'MET').length, allShotRules.filter((x) => x.rule === 'RA5' && x.verdict !== 'NA').length)}</td>
  <td colspan="2"><span class="muted">결정론 R1 검출 ${detCount('R1')}건</span></td>
  <td class="mono" style="font-size:12px">${allShotRules.filter((x) => x.rule === 'RA5' && x.verdict === 'UNMET').map((x) => x.shot_id).join(', ') || '<span class="t-ok">이상 없음</span>'}</td></tr>
<tr><td><strong>빈도·수치 규칙</strong><br><span class="muted" style="font-size:11.5px">CU 남발 · 와이드 최소시간 · 대사 원거리 · beat 커버</span></td>
  <td colspan="3"><span class="muted">결정론 검출 — R2 ${detCount('R2')} · R3 ${detCount('R3')} · R4 ${detCount('R4')} · R5 ${detCount('R5')}건</span></td>
  <td class="mono" style="font-size:12px">${agg.det.filter((f) => !f.rule.startsWith('R1')).flatMap((f) => f.shots).join(', ') || '<span class="muted">샷 지목 없음</span>'}</td></tr>`

// ---- E 상세 행
const eDetailRows = (E?.rows ?? []).map((r) => {
  const parts = []
  if (r.stance) parts.push(`<tr><td class="mono">${r.shot_id}</td><td>앵글 효과</td><td>${r.stance.angle === 'high_angle' ? '하이앵글 → 위축 기대' : '로우앵글 → 위압 기대'}</td><td>${r.stance.verdict === 'EXACT' ? '<span class="b ok">일치</span>' : '<span class="b miss">불일치</span>'} <span class="mono">${esc(r.stance.got)}</span></td><td class="quote">${esc(r.stance.evidence)}</td></tr>`)
  if (r.emotion) parts.push(`<tr><td class="mono">${r.shot_id}</td><td>감정 가독</td><td>CU/ECU → 감정이 읽혀야</td><td>${r.emotion.verdict === 'EXACT' ? '<span class="b ok">읽힘</span>' : '<span class="b miss">안 읽힘</span>'} <span class="mono">${esc(r.emotion.got?.what ?? '')}${r.emotion.got?.intensity ? '·' + esc(r.emotion.got.intensity) : ''}</span></td><td class="quote">${esc(r.emotion.evidence)}</td></tr>`)
  return parts.join('')
}).join('')

const html = `<title>${esc(cm.title)}</title>
<style>
:root{--bg:#131315;--surface:#1b1b1f;--line:#2b2b31;--text:#eae8e2;--muted:#9a978f;--accent:#d9a13d;--ok:#7fb069;--warn:#d9a13d;--crit:#d0685a;--info:#7d8ca3;--quote:#c9c6be}
@media (prefers-color-scheme: light){:root{--bg:#f7f6f3;--surface:#fff;--line:#e3e1db;--text:#26251f;--muted:#6e6b63;--accent:#9a6c14;--ok:#4d7c3a;--warn:#9a6c14;--crit:#a94a37;--info:#54687f;--quote:#4c4a44}}
:root[data-theme="dark"]{--bg:#131315;--surface:#1b1b1f;--line:#2b2b31;--text:#eae8e2;--muted:#9a978f;--accent:#d9a13d;--ok:#7fb069;--warn:#d9a13d;--crit:#d0685a;--info:#7d8ca3;--quote:#c9c6be}
:root[data-theme="light"]{--bg:#f7f6f3;--surface:#fff;--line:#e3e1db;--text:#26251f;--muted:#6e6b63;--accent:#9a6c14;--ok:#4d7c3a;--warn:#9a6c14;--crit:#a94a37;--info:#54687f;--quote:#4c4a44}
*{box-sizing:border-box}
body{background:var(--bg);color:var(--text);font-family:"Apple SD Gothic Neo",Pretendard,"Noto Sans KR",system-ui,sans-serif;font-size:15px;line-height:1.65;margin:0;padding:0 20px 80px}
.wrap{max-width:1120px;margin:0 auto}
.mono{font-family:ui-monospace,"SF Mono",Menlo,monospace;font-size:.92em;font-variant-numeric:tabular-nums}
.num{font-variant-numeric:tabular-nums}
h1{font-size:26px;line-height:1.3;margin:48px 0 6px;text-wrap:balance}
h2{font-size:19px;margin:56px 0 4px;padding-top:20px;border-top:1px solid var(--line)}
h2 .ax{color:var(--muted);font-weight:400}
h3{font-size:16px;margin:28px 0 8px}
h4{font-size:15px;margin:0}
.sub{color:var(--muted);margin:0 0 20px}
.muted{color:var(--muted);font-weight:400}
.chips{display:flex;gap:8px;flex-wrap:wrap;margin:14px 0 6px}
.chip{border:1px solid var(--line);background:var(--surface);border-radius:4px;padding:3px 10px;font-size:12.5px;color:var(--muted)}
.chip strong{color:var(--text);font-weight:600}
.diag{background:var(--surface);border:1px solid var(--line);border-left:3px solid var(--accent);border-radius:6px;padding:18px 22px;margin:26px 0}
.diag ol{margin:8px 0 0;padding-left:20px}
.diag li{margin:6px 0}
.diag .where{display:inline-block;font-size:12px;color:var(--accent);border:1px solid var(--accent);border-radius:3px;padding:0 6px;margin-right:6px;vertical-align:1px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(196px,1fr));gap:12px;margin:22px 0}
.score{background:var(--surface);border:1px solid var(--line);border-radius:6px;padding:14px 16px}
.score .lbl{font-size:12.5px;color:var(--muted);letter-spacing:.04em}
.score .val{font-size:25px;font-weight:700;margin:2px 0;font-variant-numeric:tabular-nums}
.score .det{font-size:12.5px;color:var(--muted)}
.tbl{width:100%;border-collapse:collapse;margin:12px 0;font-size:13.5px}
.tbl th{text-align:left;color:var(--muted);font-weight:600;font-size:12px;letter-spacing:.03em;border-bottom:1px solid var(--line);padding:7px 10px}
.tbl td{border-bottom:1px solid var(--line);padding:8px 10px;vertical-align:top}
.tbl tr:last-child td{border-bottom:none}
.tblwrap{overflow-x:auto;background:var(--surface);border:1px solid var(--line);border-radius:6px}
.quote{color:var(--quote);font-size:13px}
.b{display:inline-block;font-size:11.5px;font-weight:700;border-radius:3px;padding:1px 7px;white-space:nowrap}
.b.ok{color:var(--ok);border:1px solid var(--ok)}
.b.half{color:var(--warn);border:1px solid var(--warn)}
.b.miss{color:var(--crit);border:1px solid var(--crit)}
.b.info{color:var(--info);border:1px solid var(--info)}
.t-ok{color:var(--ok)}.t-warn{color:var(--warn)}.t-crit{color:var(--crit)}
.bar{position:relative;background:var(--line);border-radius:3px;height:8px;min-width:90px;flex:1}
.bar-fill{background:var(--ok);height:100%;border-radius:3px}
.bar-fill.f-warn{background:var(--warn)}.bar-fill.f-ok{background:var(--ok)}
.bar-num{position:absolute;right:-40px;top:-5px;font-size:11.5px;color:var(--muted);font-variant-numeric:tabular-nums}
.brow{display:flex;align-items:center;gap:10px;margin:7px 0;padding-right:44px}
.brow .k{width:230px;font-size:13px;flex:none}
.dur{display:flex;align-items:center;gap:10px;padding-right:44px;min-width:230px}
.card{background:var(--surface);border:1px solid var(--line);border-radius:6px;padding:16px 18px;margin:14px 0}
.card-head{display:flex;justify-content:space-between;align-items:baseline;gap:12px}
.cov{font-size:14px;font-weight:700}
.gal{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:14px;margin:14px 0}
.gal .card{margin:0}
.gal img{width:100%;border-radius:4px;border:1px solid var(--line)}
.gal .vs{display:flex;justify-content:space-between;gap:8px;font-size:12.5px;margin:8px 0 4px}
.gal .note{font-size:13px;color:var(--muted)}
.strip{display:flex;gap:14px;overflow-x:auto;padding:12px;background:var(--surface);border:1px solid var(--line);border-radius:6px;margin:10px 0 4px}
.cell{flex:0 0 auto;margin:0}
.cell-imgs{display:flex;gap:2px}
.cell img{width:168px;border-radius:3px;display:block}
.cell-triple img{width:128px}
.cell-miss .cell-imgs{outline:2px solid var(--warn);outline-offset:2px;border-radius:3px}
.cell figcaption{display:flex;flex-direction:column;font-size:10.5px;color:var(--muted);margin-top:6px;line-height:1.5}
.cap-miss{color:var(--warn)}
details{margin:10px 0 2px}
summary{cursor:pointer;color:var(--muted);font-size:13px}
.narrative{font-size:13.5px;color:var(--quote);border-left:2px solid var(--line);padding-left:14px;margin:10px 0 4px}
.keybox{border:1px solid var(--line);border-left:3px solid var(--info);background:var(--surface);border-radius:6px;padding:14px 18px;margin:16px 0;font-size:14px}
.foot{margin-top:60px;padding-top:16px;border-top:1px solid var(--line);color:var(--muted);font-size:12.5px;line-height:2}
p{max-width:78ch}
</style>
<div class="wrap">

<h1>${esc(cm.title)}</h1>
<p class="sub">${esc(cm.subtitle)}</p>
<div class="chips">
  <span class="chip">프로젝트 <strong>${esc(cm.projectLabel)}</strong></span>
  <span class="chip"><strong>${SCENES.length}</strong>씬 · <strong>${agg.B.rows.length}</strong>샷 · ${esc(cm.formatChip)}</span>
  <span class="chip">수집 <strong>${esc(d.collectedAt.slice(0, 16).replace('T', ' '))}</strong> (live DB 스냅샷 동결)</span>
  <span class="chip">판정 <strong>서브에이전트 ${SCENES.length * 4 + (E ? SCENES.length : 0)}개</strong> (축·씬별 격리, ${esc(cm.rubricVer)})</span>
</div>

<div class="diag">
  <strong>진단 요약 — 어디를 고쳐야 하나</strong>
  <ol>${cm.diagnosis.map((x) => `<li><span class="where">${esc(x.where)}</span>${esc(x.text)}</li>`).join('')}</ol>
</div>

<div class="grid">
  <div class="score"><div class="lbl">B · 설계→그림 전달</div><div class="val">${pct(b.size.tolRate)}%</div><div class="det">샷 사이즈 정합(±1단계)<br>앵글 ${pct(b.angle.tolRate)}% · 인원 ${pct(b.figures.exactRate)}%${hasMotion ? ` · 모션 ${pct(b.motion.exactRate)}%` : ''}</div></div>
  <div class="score"><div class="lbl">종단 · 스토리 판독성</div><div class="val">${pct(rb.coverage)}%</div><div class="det">beat 전달 ${rb.totalScore}/${rb.totalBeats}<br>이미지만 본 관객의 재구성 대조</div></div>
  <div class="score"><div class="lbl">결정론 검출</div><div class="val">${detC + detW + detI}건</div><div class="det">${detC ? `CRITICAL ${detC} · ` : ''}WARNING ${detW} · INFO ${detI}<br>코드 계산 (LLM 0)</div></div>
  <div class="score"><div class="lbl">씬 구성 발견</div><div class="val">${a.issues.length}건</div><div class="det">계약 모순 등 구조 검출<br>커버리지 제안 ${agg.A2 ? agg.A2.missingCount + agg.A2.redundantCount : 0}건 (미검증, 접힘)</div></div>
</div>

<h2>이 리포트를 읽는 법</h2>
<p>판정자마다 <em>다른 정보</em>를 보고(식단 분리), 서로의 결과를 모른 채(격리 호출) 판정했다.
본문에는 <strong>두 run에서 변별력이 입증된 판정면만</strong> 실었다 — 품질 판단 계열(샷 규칙 정합·구도·효과·절대 길이)은 "전부 통과" 수준의 무른 판정이라 보류(부록 참조).</p>
<div class="tblwrap"><table class="tbl">
<thead><tr><th>판정면</th><th>질문</th><th>판정자가 본 것</th><th>판정자가 못 본 것</th><th>채점</th></tr></thead>
<tbody>
<tr><td><strong>B</strong> 전달률</td><td>의도가 그림에 반영됐는가</td><td>그림만</td><td>설계 JSON</td><td>블라인드 개방형 판독 → 코드가 설계와 대조</td></tr>
<tr><td><strong>종단</strong> 리드백</td><td>이야기가 읽히는가</td><td>그림만 (순서대로)</td><td>beat·설계 전부</td><td>자유 서술 → beat별 전달 대조(✓/△/✗)</td></tr>
<tr><td><strong>결정론</strong></td><td>수치 규칙 위반</td><td>설계 JSON</td><td>—</td><td>순수 코드 (재현성 100%)</td></tr>
<tr><td><strong>구조 검출</strong></td><td>선언 vs 데이터 모순 · 빠진/중복 샷</td><td>설계 JSON (길이 제외)</td><td>그림</td><td>사실 대조 — 제안류는 미검증 라벨로 격리</td></tr>
</tbody></table></div>

<h2>씬 구성 발견 <span class="ax">— 선언 vs 데이터의 구조 모순 (${a.issues.length}건)</span></h2>
<p>LLM이 "좋은가"를 판단한 게 아니라, 설계 안에서 서로 모순되는 사실을 대조해 찾은 것들 — 이 계열은 두 run에서 변별력이 확인됐다.</p>
<div class="tblwrap"><table class="tbl"><thead><tr><th>씬</th><th>검사</th><th>발견 (근거)</th></tr></thead><tbody>${issueRows}</tbody></table></div>
${covRows ? `<details><summary>커버리지 제안 ${agg.A2.missingCount + agg.A2.redundantCount}건 — 오라클의 부족/중복 샷 지목 (미검증: 채택/기각을 기록해 적중률을 재기 전까지 참고용)</summary>
<div class="tblwrap"><table class="tbl"><thead><tr><th>씬</th><th>유형</th><th>제안</th></tr></thead><tbody>${covRows}</tbody></table></div></details>` : ''}

<h2>B <span class="ax">— 전달률: 설계 의도가 그림에 반영됐는가</span></h2>
<p>판독자는 설계를 전혀 모른 채 그림만 보고 개방형으로 답했고("이 프레임 샷 사이즈는?"), 대조와 채점은 전부 코드가 했다. LLM은 점수를 매기지 않았다.</p>
<div class="card">
${bBars.map(([k, v]) => `<div class="brow"><span class="k">${k}</span>${bar(v, v < 0.6 ? 'f-warn' : 'f-ok')}</div>`).join('')}
</div>

<h3>불일치 ${b.misses.length}샷의 원인 분해</h3>
<div class="tblwrap"><table class="tbl"><thead><tr><th>패턴</th><th>건수</th><th>분류</th><th>내용</th></tr></thead><tbody>${patternRows}</tbody></table></div>

${cm.gallery?.length ? `<h3>대표 사례 (스팟체크 포함)</h3><div class="gal">${galleryHtml}</div>` : ''}

<details><summary>불일치 전체 목록 (${b.misses.length}샷)</summary>
<div class="tblwrap"><table class="tbl"><thead><tr><th>샷</th><th>씬</th><th>불일치 필드</th></tr></thead><tbody>${bMissRows}</tbody></table></div>
</details>

<h2>종단 <span class="ax">— 스토리 판독성: 그림만 보고 이야기가 읽히는가</span></h2>
<p>씬마다 "처음 보는 관객" 에이전트가 그림만 보고 이야기를 재구성했고, 그 서술을 설계 beat와 대조했다.
전체 <strong>${rb.totalScore}/${rb.totalBeats} 비트 전달 (${pct(rb.coverage)}%)</strong>.</p>
<div class="keybox"><strong>핵심 발견.</strong> ${esc(rb.keyFinding)}</div>
${rbCards}

<h2>결정론 <span class="ax">— 코드가 검출한 수치 규칙 위반 (LLM 0)</span></h2>
<p>오너의 연출 필기에서 유도한 규칙 v0: 인접 샷 사이즈 미변화(R1), CU 남발(R2), 와이드샷 최소 시간(R3), 대사 샷 원거리(R4), beat 미커버(R5).</p>
<div class="tblwrap"><table class="tbl"><thead><tr><th>심각도</th><th>규칙</th><th>위치</th><th>내용</th></tr></thead><tbody>${detRows}</tbody></table></div>

<h2>씬별 필름스트립 <span class="ax">${hasMotion ? '— START · DIRECTION · END' : '— 설계 사이즈 → 판독 사이즈'}</span></h2>
<p class="muted" style="font-size:13px">주황 테두리 = B축 불일치 샷. 캡션은 <span class="mono">설계→판독</span> 사이즈${hasMotion ? ' · 설계 모션(불일치 시 →판독)' : ''}.</p>
${SCENES.map((sc) => `<h3 style="margin-bottom:2px">${sc} <span class="muted">· ${esc(sceneMeta(sc).purpose)} · ${esc(sceneMeta(sc).emotion_beat.start)}→${esc(sceneMeta(sc).emotion_beat.end)}</span></h3><div class="strip">${strip(sc)}</div>`).join('')}

<h2>부록 <span class="ax">— 보류한 판정면 (변별력 미달)</span></h2>
<p style="font-size:13.5px">두 run 데이터에서 "전부 통과" 수준의 무른 판정으로 확인돼 본문에서 뺀 것들. 원자료는 aggregate.json에 보존.</p>
<ul style="font-size:13.5px">
<li><strong>A 샷 규칙 정합</strong> — 12/12 MET(변별력 0). 설계의 dramatic_purpose가 LLM의 자기 정당화라 심사가 자기 채점이 됨. 결정론 트리거 + 사람 스팟 리뷰로 강등.</li>
<li><strong>C 구도</strong> — 플래그 ${agg.C.flags.length}/${agg.C.shotCount}, 가점 리딩라인 ${cBonus.leading}/${agg.C.shotCount}. VLM의 구도 판단이 일관되게 후함(ShotBench 경고와 일치). 보류.</li>
${E ? `<li><strong>E 효과</strong> — 앵글 효과 ${E.stance.exact}/${E.stance.n} · 감정 가독 ${E.emotion.exact}/${E.emotion.n}. 블라인드 인상 구조는 유효하나 기대 맵(앵글→인상 고정)이 미성숙 — dramatic_purpose에서 기대를 유도하도록 고친 뒤 재평가.</li>` : ''}
<li><strong>절대 길이 판정</strong> — "이 샷은 X초가 맞다"는 발화 속도 휴리스틱 위의 미검증 추정이라 제거(오너 결정). 커버리지 제안(부족/중복)만 미검증 라벨로 유지.</li>
</ul>

<h2>한계와 다음 단계</h2>
<ol>${cm.limitations.map((x) => `<li>${esc(x)}</li>`).join('')}</ol>

<div class="foot">
재현 좌표 — projectId <span class="mono">${esc(cm.projectId)}</span> · writer_run <span class="mono">${esc(d.writerRun?.id ?? '')}</span> · 수집 <span class="mono">${esc(d.collectedAt)}</span> (live DB 스냅샷 data.json으로 동결)<br>
채점 기준 — 결정론 규칙 v0 + 프롬프트 ${esc(cm.rubricVer)} (research/experiments/previz-verifier/) · 판정 서브에이전트 ${SCENES.length * 4}개 (A·B·C·리드백 × ${SCENES.length}씬, 식단 분리·격리 호출) · 집계는 전부 코드<br>
가설·기각 조건 — research/experiments/previz-verifier/HYPOTHESIS.md
</div>
</div>`

writeFileSync(join(runDir, 'report.html'), html)
console.log(JSON.stringify({ bytes: Buffer.byteLength(html), path: join(runDir, 'report.html') }))
