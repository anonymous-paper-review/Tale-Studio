// 씬·샷 진행에서는 내부 단계 수를 숨기고, 나중에 보류한 작업은 다시 열 수 있다.
// localhost 검수 전용. tests/fixtures/mvp-feedback-page.tsx 임시 경로를 열고 page UUID를 넘긴다.
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import assert from 'node:assert/strict'
const page = process.argv[2]
assert.match(page ?? '', /^[0-9a-f-]{36}$/i)
const out = '.claude/docs/2026-09-10/mvp-feedback-followup'
mkdirSync(out, { recursive: true })
const evidence = []
function command(args, raw = false) {
  const result = JSON.parse(execFileSync('orca', [...args, '--page', page, ...(raw ? [] : ['--json'])], { encoding: 'utf8', maxBuffer: 40 * 1024 * 1024, timeout: 30000 }))
  if (raw) return result
  assert.equal(result.ok, true)
  return result.result
}
function evaluate(js) { return command(['eval', '--expression', `JSON.stringify((() => {if(!['localhost','127.0.0.1'].includes(location.hostname)) throw new Error('local only'); return (${js});})())`], true) }
async function until(js) { for (let i = 0; i < 50; i++) { if (evaluate(js)) return; await new Promise(r => setTimeout(r, 200)) } throw new Error(`Timed out: ${js}`) }
function record(name, details) { evidence.push({ name, details }); console.log(`통과: ${name}`); writeFileSync(`${out}/browser-evidence.json`, JSON.stringify(evidence, null, 2)) }
function shot(name) {
  // Electron은 창이 비활성화되면 캡처를 중단할 수 있어 검수 탭을 먼저 표시한다.
  execFileSync('orca', ['open', '--json'], { encoding: 'utf8', timeout: 10000 })
  command(['tab', 'switch'])
  const data = command(['screenshot', '--format', 'png'])
  writeFileSync(`${out}/${name}.png`, Buffer.from(data.data, 'base64'))
}
function snap() { return command(['snapshot']) }
function clickName(name) {
  const pair = Object.entries(snap().refs).find(([, v]) => v.role === 'button' && v.name === name)
  assert.ok(pair, `Missing button ${name}`)
  command(['click', '--element', `@${pair[0]}`]); snap()
}
await until('!!window.__mvp')
evaluate(`(() => {window.__mvp.state.errors=[]; window.addEventListener('error', e=>window.__mvp.state.errors.push(e.message)); window.addEventListener('unhandledrejection', e=>window.__mvp.state.errors.push(String(e.reason))); return true})()`)
command(['exec', '--command', 'set viewport 1511 728']); snap()
const initial = evaluate(`({text:document.body.innerText, bars:document.querySelectorAll('[role=progressbar]').length})`)
assert.ok(!/단계\s*\d+\/\d+/.test(initial.text), '씬·샷을 준비하는 동안 내부 처리 단계 수 대신 현재 만들고 있는 결과를 알려준다.')
assert.equal(initial.bars, 2, '시간과 내부 단계 숫자를 숨겨도 중앙과 채팅의 프로그레스바는 유지한다.')
assert.deepEqual(evaluate(`[...document.querySelectorAll('[role=progressbar]')].map(b=>Number(b.getAttribute('aria-valuenow')))`), [50, 50])
assert.ok(!initial.text.includes('Artist 호출') && !initial.text.includes('승인 대기'), '검수용 가짜 버튼을 제품처럼 보여주지 않는다.')
assert.ok(initial.text.includes('씬 초안'))
assert.ok(!initial.text.includes('18분'))
shot('progress-draft'); record('씬 초안 진행에서 내부 단계·시간·테스트 버튼 미노출', initial)
evaluate(`(() => {window.__mvp.setStatus({current_stage:'persistShots',completed_units:14});return true})()`)
await until(`document.body.innerText.includes('샷·대사') && document.body.innerText.includes('저장')`)
assert.ok(!/단계\s*\d+\/\d+/.test(evaluate('document.body.innerText')))
assert.ok(evaluate(`[...document.querySelectorAll('[role=progressbar]')].every(b=>Number(b.getAttribute('aria-valuenow'))<100)`))
shot('progress-saving'); record('저장이 끝나기 전에는 저장 중이라고 표시', true)
evaluate(`(() => {window.__mvp.chat.getState().reset(); window.__mvp.chat.setState({loadMessages:async()=>{}});const p=window.__mvp.proposal;const items=['쿄타로','코마츠'].map((name,i)=>p({stage:'artist',kind:'artistCreateAppearance',target:name+' · 잠옷',action:'새 모습 만들기',impact:['이미지 생성'],payload:{characterId:i?'komatsu':'kyotaro',label:'잠옷',appearance:'pajamas'}}));window.__mvp.chat.getState().offerPendingProposal({...items[0],target:'쿄타로, 코마츠',items});return true})()`)
await until(`document.body.innerText.includes('쿄타로, 코마츠')`)
shot('later-before')
clickName('나중에')
await until(`!window.__mvp.chat.getState().pendingProposal && window.__mvp.chat.getState().deferredProposals.length===1`)
shot('later-collapsed')
evaluate(`(() => {const s=[...document.querySelectorAll('summary')].find(s=>s.textContent?.includes('보류한 작업'));s?.click();return true})()`)
await until(`!![...document.querySelectorAll('details[open] button')].find(b=>b.textContent==='다시 열기')`)
shot('later-expanded')
record('나중에를 누르면 보류한 작업에서 다시 열기 가능', evaluate('window.__mvp.chat.getState().deferredProposals.map(p=>p.target)'))
command(['exec', '--command', 'set viewport 755 728']); snap(); shot('later-expanded-755')
clickName('다시 열기')
await until(`!!window.__mvp.chat.getState().pendingProposal && window.__mvp.chat.getState().deferredProposals.length===0`)
shot('later-restored-755')
record('다시 열면 두 대상의 승인 카드 복원, 실제 생성 요청 없음', evaluate('window.__mvp.chat.getState().pendingProposal.items.map(i=>i.target)'))
assert.ok(!evaluate(`window.__mvp.state.requests.some(r=>/generate-character|generate-world|character-appearance/.test(r))`))
record('브라우저 미처리 오류', evaluate('window.__mvp.state.errors'))
assert.deepEqual(evaluate('window.__mvp.state.errors'), [])
