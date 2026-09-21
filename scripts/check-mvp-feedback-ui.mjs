// 격리된 localhost 검수 탭에서 실제 화면 컴포넌트의 상태·스크롤·표시 URL을 확인한다.
// 준비: tests/fixtures/mvp-feedback-page.tsx를 src/app/playground/mvp-feedback/page.tsx로 임시 복사.
// 실행: node scripts/check-mvp-feedback-ui.mjs <page UUID>. 완료 후 임시 page.tsx는 제거한다.
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import assert from 'node:assert/strict'
const page = process.argv[2]
assert.match(page ?? '', /^[0-9a-f-]{36}$/i)
const out = '.claude/docs/2026-09-09/mvp-feedback'
mkdirSync(out, {recursive:true})
const evidence = []
function command(args, raw=false) {
  const result = JSON.parse(execFileSync('orca', [...args,'--page',page,...(raw?[]:['--json'])], {encoding:'utf8',maxBuffer:40*1024*1024,timeout:30000}))
  if (raw) return result
  assert.equal(result.ok,true)
  return result.result
}
function evaluate(js) { return command(['eval','--expression',`JSON.stringify((() => {if(!['localhost','127.0.0.1'].includes(location.hostname)) throw new Error('local only'); return (${js});})())`],true) }
async function until(js) { for(let i=0;i<50;i++){ if(evaluate(js)) return; await new Promise(r=>setTimeout(r,200)) } throw new Error(`Timed out: ${js}`) }
function record(name, details) { evidence.push({name,details}); console.log(`통과: ${name}`); writeFileSync(`${out}/browser-evidence.json`,JSON.stringify(evidence,null,2)) }
function shot(name) { const data=command(['screenshot','--format','png']); writeFileSync(`${out}/${name}.png`,Buffer.from(data.data,'base64')) }
function shotBoth(name) { shot(name);command(['exec','--command','set viewport 755 728']);snap();shot(`${name}-755`);command(['exec','--command','set viewport 1511 728']);snap() }
function snap() { return command(['snapshot']) }
function clickName(name) { evaluate(`(() => {const b=[...document.querySelectorAll('button')].find(b=>(b.getAttribute('aria-label')||b.textContent)===${JSON.stringify(name)});b?.scrollIntoView({block:'center'});return true})()`);const s=snap();const pair=Object.entries(s.refs).find(([,v])=>v.role==='button' && v.name===name); assert.ok(pair,`Missing button ${name}`);command(['click','--element',`@${pair[0]}`]);snap() }
await until('!!window.__mvp')
evaluate(`(() => {window.__mvp.state.errors=[]; window.addEventListener('error', e=>window.__mvp.state.errors.push(e.message)); window.addEventListener('unhandledrejection', e=>window.__mvp.state.errors.push(String(e.reason)));return true})()`)
for(const width of [1511,755]) {
 command(['exec','--command',`set viewport ${width} 728`]);snap()
 await until(`(() => {const b=document.querySelector('[role=progressbar]');return b && Number(b.getAttribute('aria-valuenow'))===50 && Math.abs(b.firstElementChild.getBoundingClientRect().width/b.getBoundingClientRect().width-0.5)<0.03})()`)
 const facts=evaluate(`(() => {const bars=[...document.querySelectorAll('[role=progressbar]')]; const nav=[...document.querySelector('aside').querySelectorAll('button')];return {viewport:[innerWidth,innerHeight],bars:bars.map(b=>({label:b.getAttribute('aria-label'),value:Number(b.getAttribute('aria-valuenow')),ratio:b.firstElementChild?.getBoundingClientRect().width/b.getBoundingClientRect().width})),icons:nav.map(b=>({label:b.getAttribute('aria-label')||b.textContent,size:b.querySelector('svg')?.getBoundingClientRect().width,stroke:b.querySelector('svg')?.getAttribute('stroke-width')})),primary:getComputedStyle(document.documentElement).getPropertyValue('--primary')}})()`)
 assert.equal(facts.bars.length,2); assert.deepEqual(facts.bars.map(b=>b.value),[50,50]);assert.ok(Math.abs(facts.bars[0].ratio-0.5)<0.03)
 shot(`after-${width}`);record(`중앙·채팅 초안 진행 일치 ${width}px`,facts)
}
command(['exec','--command','set viewport 1511 728'])
clickName('문의 / Help');assert.ok(snap().snapshot.includes('Feedback')||evaluate('!!document.querySelector("[role=dialog]")'));shotBoth('help-open');record('Help 열기',true)
evaluate(`(() => {document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));return true})()`)
evaluate(`(() => {window.__mvp.setStatus({current_status:'awaiting_confirmation',current_stage:'storyCheck',completed_units:4});return true})()`)
await until(`document.body.innerText.includes('씬 스토리 초안이 준비') && document.querySelectorAll('[role=progressbar]').length===0`)
shotBoth('review-wait');record('초안 검토 대기에는 진행 중 막대 없음',true)
evaluate(`(() => {window.__mvp.setStatus({current_status:'running',current_stage:'persistShots',completed_units:14});return true})()`)
await until(`document.querySelectorAll('[role=progressbar]').length===2 && document.body.innerText.includes('샷과 대사를 저장하고 있어요.')`)
assert.ok(!/단계\s*\d+\/\d+/.test(evaluate('document.body.innerText')))
shotBoth('saving');record('내부 단계 숫자 없이 최종 저장 진행 표시',evaluate(`[...document.querySelectorAll('[role=progressbar]')].map(b=>({label:b.getAttribute('aria-label'),value:b.getAttribute('aria-valuenow')}))`))
evaluate(`(() => {window.__mvp.badge();return true})()`)
await until(`!!document.querySelector('button[aria-label*="아직 확인하지 않은 완료 9개"]')`)
shotBoth('unseen-nine');clickName('Artist · 아직 확인하지 않은 완료 9개')
await until(`!document.querySelector('button[aria-label*="아직 확인하지 않은 완료 9개"]')`)
record('현재 보고 있는 Artist 배지 숨김',true)
const before=evaluate(`[...document.querySelectorAll('main img')].map(i=>i.getAttribute('src'))`)
shotBoth('appearance-default');clickName('밤')
await until(`window.__mvp.artist.getState().selectedLocationAppearances.roof === 'night' && [...document.querySelectorAll('main img')].some(i=>decodeURIComponent(i.src).includes('밤 모습 테스트 이미지'))`)
const after=evaluate(`[...document.querySelectorAll('main img')].map(i=>i.getAttribute('src'))`)
assert.notDeepEqual(before,after);shotBoth('appearance-night');record('모습 탭 선택 시 저장 이미지 URL 변경',{before,after})
evaluate(`(() => {window.__mvp.go('writer'); const c=window.__mvp.chat.getState();c.offerSuggestion({id:'rough-test',stage:'writer',content:'러프 스토리보드 완료 안내입니다.',action:null});c.dismissSuggestion({implicit:true});for(let i=0;i<18;i++)c.appendLocalExchange('writer','대화 '+i,'이후 대화 '+i);return true})()`)
await until(`document.body.innerText.includes('러프 스토리보드 완료 안내입니다.')`)
const chatBefore=evaluate(`window.__mvp.chat.getState().messages.map(m=>({id:m.id,content:m.content,stage:m.stage}))`)
evaluate(`(() => {const e=document.querySelector('[data-slot="scroll-area-viewport"]');e.scrollTop=100;e.dispatchEvent(new Event('scroll'));return true})()`)
const readingPosition=evaluate(`document.querySelector('[data-slot="scroll-area-viewport"]').scrollTop`)
evaluate(`(() => {window.__mvp.go('artist');return true})()`)
await until(`!![...document.querySelectorAll('main button')].find(b=>b.textContent==='밤')`)
evaluate(`(() => {window.__mvp.go('writer');return true})()`)
await until(`document.querySelectorAll('[role=progressbar]').length===2`)
await new Promise(r=>setTimeout(r,300))
assert.equal(evaluate(`document.querySelector('[data-slot="scroll-area-viewport"]').scrollTop`),readingPosition)
record('실제 단계 왕복 후 읽던 스크롤 위치 유지',readingPosition)
assert.deepEqual(evaluate(`window.__mvp.chat.getState().messages.map(m=>({id:m.id,content:m.content,stage:m.stage}))`),chatBefore)
assert.equal(evaluate(`window.__mvp.chat.getState().messages.filter(m=>m.content==='러프 스토리보드 완료 안내입니다.').length`),1)
record('탭 이동 후 안내 1개·대화 ID와 순서 유지',chatBefore.length)
evaluate(`(() => {const p=window.__mvp.proposal;const items=['쿄타로','코마츠'].map((name,i)=>p({stage:'artist',kind:'artistCreateAppearance',target:name+' · 잠옷',action:'새 모습 만들기',impact:['이미지 생성'],payload:{characterId:i?'komatsu':'kyotaro',label:'잠옷',appearance:'pajamas'}}));window.__mvp.chat.getState().dismissSuggestion({implicit:true});window.__mvp.chat.getState().offerPendingProposal({...items[0],target:'쿄타로, 코마츠',items});return true})()`)
await until(`document.body.innerText.includes('쿄타로, 코마츠')`)
evaluate(`(() => {const e=document.querySelector('[data-slot="scroll-area-viewport"]');e.scrollTop=e.scrollHeight;return true})()`);shotBoth('global-approval');record('Writer에서 Artist의 두 대상 승인 표시',evaluate(`window.__mvp.chat.getState().pendingProposal.items.map(i=>i.target)`))
clickName('나중에')
await until(`!window.__mvp.chat.getState().pendingProposal && window.__mvp.chat.getState().deferredProposals.length===1`)
evaluate(`(() => {const s=[...document.querySelectorAll('summary')].find(s=>s.textContent?.includes('보류한 작업'));s?.scrollIntoView({block:'center'});s?.click();return true})()`)
await until(`!![...document.querySelectorAll('details[open] button')].find(b=>b.textContent==='다시 열기')`)
shotBoth('deferred');record('나중에 보류 목록 보존',evaluate(`window.__mvp.chat.getState().deferredProposals.map(p=>p.target)`))
clickName('다시 열기')
await until(`!!window.__mvp.chat.getState().pendingProposal && window.__mvp.chat.getState().deferredProposals.length===0`)
record('보류 목록에서 수동 재개',true)
record('브라우저 미처리 오류',evaluate('window.__mvp.state.errors'))
assert.deepEqual(evaluate('window.__mvp.state.errors'),[])
