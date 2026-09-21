// localhost의 실제 채팅·저장·이동 소비 경로에 6씬 47샷과 통제된 응답을 공급한다.
import {execFileSync} from 'node:child_process'
import {writeFileSync} from 'node:fs'
import assert from 'node:assert/strict'
const page=process.argv[2], out='.claude/docs/2026-09-09/mvp-feedback'
assert.match(page??'',/^[0-9a-f-]{36}$/i)
function cli(args,raw=false){const r=JSON.parse(execFileSync('orca',[...args,'--page',page,...(raw?[]:['--json'])],{encoding:'utf8',maxBuffer:40*1024*1024,timeout:30000}));if(raw)return r;assert.equal(r.ok,true);return r.result}
function ev(js){return cli(['eval','--expression',`JSON.stringify((()=>{if(!['localhost','127.0.0.1'].includes(location.hostname))throw new Error('local only');return (${js})})())`],true)}
async function until(js){for(let n=0;n<80;n++){if(ev(js))return;await new Promise(r=>setTimeout(r,150))}throw new Error(`Timeout: ${js}`)}
function screenshot(name){const r=cli(['screenshot','--format','png']);writeFileSync(`${out}/${name}.png`,Buffer.from(r.data,'base64'))}
await until('!!window.__mvp?.prepareDialogue')
cli(['exec','--command','set viewport 1511 728'])
ev(`(()=>{const m=window.__mvp;m.prepareDialogue();m.state.errors=[];window.addEventListener('error',e=>m.state.errors.push(e.message));window.addEventListener('unhandledrejection',e=>m.state.errors.push(String(e.reason)));m.chat.getState().sendMessage('전체 한국어로 맞추고 넘겨줘').catch(e=>m.state.errors.push(String(e)));return true})()`)
await until('window.__mvp.state.writes.length===24')
assert.equal(ev('window.__mvp.state.dialogueRequests'),1)
assert.equal(ev('window.__mvp.project.getState().currentStage'),'writer')
assert.deepEqual(ev('window.__mvp.state.navigations'),[])
screenshot('dialogue-waiting-save')
ev('(()=>{window.__mvp.state.releaseSave();return true})()')
await until("window.__mvp.project.getState().currentStage==='director' && window.__mvp.state.navigations.length===1")
const result=ev(`(()=>{const m=window.__mvp;return {sceneCount:m.writer.getState().sceneManifest.scenes.length,shotCount:m.writer.getState().shots.length,modelRequests:m.state.dialogueRequests,writes:m.state.writes,navigations:m.state.navigations,unchangedScene6:m.writer.getState().shots.filter(s=>s.sceneId==='s6').every(s=>s.dialogueLines[0].text==='이미 한국어예요.'),remainingForeignDialogue:m.writer.getState().shots.filter(s=>s.dialogueLines.some(l=>/[A-Za-z\\u3040-\\u30ff\\u3400-\\u9fff]/u.test(l.text))).length,progressRows:m.chat.getState().messages.filter(m=>m.content.startsWith('대사 ')).length,finalMessages:m.chat.getState().messages.slice(-3).map(m=>m.content),errors:m.state.errors}})()`)
assert.equal(result.progressRows,1);assert.equal(result.sceneCount,6);assert.equal(result.shotCount,47);assert.equal(result.modelRequests,3);assert.equal(result.writes.length,40);assert.equal(new Set(result.writes).size,40);assert.equal(result.remainingForeignDialogue,0);assert.equal(result.unchangedScene6,true);assert.deepEqual(result.navigations,['/studio/director']);assert.deepEqual(result.errors,[])
ev(`(()=>{const e=document.querySelector('[data-slot="scroll-area-viewport"]');e.scrollTop=e.scrollHeight;return true})()`)
screenshot('dialogue-handoff-complete')
writeFileSync(`${out}/dialogue-browser-evidence.json`,JSON.stringify({fixture:'6 scenes / 47 shots; deterministic chat responses and local storage response stubs; router navigation intercepted',waitingSave:{writes:24,modelRequests:1,navigations:0},...result},null,2))
console.log('통과: 6씬47샷 중 일본어40샷 저장, 한국어7샷 유지, 저장응답 대기 후 남은씬 자동처리, Director 이동1회, 브라우저 오류0건')
