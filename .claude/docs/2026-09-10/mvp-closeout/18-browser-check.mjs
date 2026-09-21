// 실제 RoughStoryboardView에 고정 큐/저장 응답을 공급한다. 유료 생성·운영 데이터 호출은 없다.
// 준비: tests/fixtures/mvp-feedback-page.tsx를 localhost 임시 페이지에 복사한 뒤 해당 Orca page ID를 전달한다.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
const page = process.argv[2]
assert.match(page ?? '', /^[a-f0-9-]{36}$/i)
const out = fileURLToPath(new URL('.', import.meta.url))
mkdirSync(out, { recursive: true })
const observations = []
function cli(args, raw = false) {
  const result = JSON.parse(execFileSync('orca', [...args, '--page', page, ...(raw ? [] : ['--json'])], { encoding: 'utf8', maxBuffer: 40 * 1024 * 1024, timeout: 30000, stdio: ['ignore', 'pipe', 'pipe'] }))
  if (raw) return result
  assert.equal(result.ok, true)
  return result.result
}
function ev(js) { return cli(['eval', '--expression', `JSON.stringify((()=>{if(!['localhost','127.0.0.1'].includes(location.hostname))throw new Error('local only');return (${js})})())`], true) }
async function until(js) { for (let attempt = 0; attempt < 60; attempt++) { if (ev(js)) return; await new Promise(resolve => setTimeout(resolve, 150)) } throw new Error(`Timed out: ${js}`) }
const summary = `document.querySelector('[role="status"][aria-label="러프 스토리보드 진행 현황"]')`
function screenshot(name) { const image = cli(['screenshot', '--format', 'png']); writeFileSync(`${out}${name}.png`, Buffer.from(image.data, 'base64')) }
function facts() { return ev(`(()=>{const m=window.__mvp,e=${summary},labels=[...e.children].map(label=>{const r=label.getBoundingClientRect();return {text:label.textContent,left:r.left,right:r.right,top:r.top,bottom:r.bottom,unobscured:label.contains(document.elementFromPoint((r.left+r.right)/2,(r.top+r.bottom)/2))}});return {sample:m.state.roughSample,viewport:[innerWidth,innerHeight],summary:e.innerText,counts:(e.innerText.match(/\\d+/g)||[]).map(Number),grids:m.state.roughJobs.map(j=>j.target.writerShotIds),totalShots:m.writer.getState().shots.length,scenes:m.writer.getState().sceneManifest.scenes.map(s=>m.writer.getState().shots.filter(shot=>shot.sceneId===s.sceneId).length),summaryLabels:labels,summaryInsideViewport:labels.every(r=>r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight&&r.unobscured),errors:m.state.errors,retrySubmissions:m.state.roughSubmissions}})()`) }
async function record(sample, expected, name = `18-${sample}`) {
  await until(`JSON.stringify((${summary}?.innerText.match(/[0-9]+/g)||[]).map(Number))===${JSON.stringify(JSON.stringify(expected))}`)
  await until(`[...document.querySelectorAll('[aria-label="러프 스토리보드 보드"] img')].every(img=>img.complete&&img.naturalWidth>0)`)
  const result = facts()
  assert.deepEqual(result.counts, expected)
  assert.equal(result.counts.slice(1).reduce((sum,n)=>sum+n,0),47)
  assert.equal(result.totalShots, 47)
  assert.deepEqual(result.scenes, [9, 8, 30])
  assert.equal(result.summaryInsideViewport, true)
  assert.deepEqual(result.errors, [])
  if (['failed','retry','retry-complete'].includes(sample)) ev(`(()=>{[...document.querySelectorAll('article')].find(e=>/Scene 2 · Shot 14/.test(e.innerText)).scrollIntoView({block:'center'});return true})()`)
  screenshot(name)
  observations.push({ recordedAt: new Date().toISOString(), screenshot: `${name}.png`, ...result })
  writeFileSync(`${out}18-browser-evidence.json`, JSON.stringify({ fixture: 'Actual RoughStoryboardView; fixed local saved shots/queue; no paid provider requests', observations }, null, 2))
  console.log(`통과: ${sample} ${result.counts.join('/')} · ${result.viewport.join('×')}`)
}
await until('!!window.__mvp?.prepareRough')
cli(['exec', '--command', 'set viewport 1511 1000'])
ev(`(()=>{const m=window.__mvp;m.state.errors=[];addEventListener('error',e=>m.state.errors.push(e.message));addEventListener('unhandledrejection',e=>m.state.errors.push(String(e.reason)));m.prepareRough();return true})()`)
await until(`!!${summary}`)
ev(`(()=>{window.__mvp.chat.setState({suggestion:null,messages:[{id:'rough-verification',role:'model',stage:'writer',content:'현재 동작 검수 표본 · 3씬 47샷\\n실제 유료 생성 없이 저장 상태와 진행 큐를 대조합니다.\\n4+4 → 1+4 → 4개의 생성 중 샷을 확인하고, 실패한 샷 1개를 다시 시도해도 보드 전체는 47샷을 유지합니다.'}]});return true})()`)
await record('eight', [47,0,8,39,0])
ev(`(()=>{window.__mvp.setRoughSample('five');return true})()`)
await record('five', [47,8,5,34,0])
ev(`(()=>{window.__mvp.setRoughSample('four');return true})()`)
await record('four', [47,9,4,34,0])
ev(`(()=>{window.__mvp.setRoughSample('failed');return true})()`)
await record('failed', [47,13,0,33,1])
cli(['exec', '--command', 'set viewport 1511 1000'])
// 실제 실패 카드의 재시도 버튼을 눌러 generate([shotId], true) 호출과 큐 복구를 확인한다.
const clicked = ev(`(()=>{const card=[...document.querySelectorAll('article')].find(e=>/Scene 2 · Shot 14/.test(e.innerText));const button=card&&[...card.querySelectorAll('button')].find(b=>/다시 시도|패널 생성/.test(b.textContent));if(!button)return false;button.scrollIntoView({block:'center'});button.click();return true})()`)
assert.equal(clicked, true, 'Failed rough card retry action is missing')
await until("window.__mvp.state.roughSample==='retry'")
ev(`(()=>{document.querySelector('[aria-label="러프 스토리보드 보드"]').closest('[data-slot="scroll-area-viewport"]').scrollTop=0;return true})()`)
await record('retry', [47,13,1,33,0])
assert.deepEqual(facts().retrySubmissions, ['rough-14'])
ev(`(()=>{window.__mvp.setRoughSample('retry-complete');return true})()`)
await record('retry-complete', [47,14,0,33,0])
cli(['exec', '--command', 'set viewport 1511 1000'])
console.log('통과: 전체 목표 47 유지, 재시도 접수 1회, 브라우저 미처리 오류 0')
