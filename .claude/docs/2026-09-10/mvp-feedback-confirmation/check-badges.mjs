// 다른 탭에서 아직 보지 않은 Writer 러프 이미지 완료 수를 표시하고 Writer에서 읽으면 지운다.
import {execFileSync} from 'node:child_process';
import {writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const page=process.argv[2], out='.claude/docs/2026-09-10/mvp-feedback-confirmation';
assert.match(page??'',/^[0-9a-f-]{36}$/);
function call(args,raw=false){const x=JSON.parse(execFileSync('orca',[...args,'--page',page,...(raw?[]:['--json'])],{encoding:'utf8',maxBuffer:16e6,timeout:30000}));if(raw)return x;assert.equal(x.ok,true);return x.result;}
const ev=js=>call(['eval','--expression',`JSON.stringify((()=>{if(location.hostname!=='127.0.0.1')throw Error('local only');return (${js})})())`],true);
async function until(js){for(let i=0;i<40;i++){if(ev(js))return;await new Promise(r=>setTimeout(r,200));}throw Error(js);}
const button="[...document.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')?.startsWith('Writer'))";
const count=`Number((${button})?.innerText.match(/\\d+/)?.[0]??0)`;
const results=[];
async function verify(expected,name,capture){await until(`${count}===${expected}`);const actual=ev(`({text:(${button}).innerText,label:(${button}).getAttribute('aria-label')})`);results.push({name,expected,actual});if(capture){execFileSync('orca',['open','--json'],{encoding:'utf8',timeout:10000});call(['tab','switch']);const data=call(['screenshot','--format','jpeg']);writeFileSync(`${out}/${capture}.jpg`,Buffer.from(data.data,'base64'));}writeFileSync(`${out}/badge-browser-evidence.json`,JSON.stringify(results,null,2));console.log('통과:',name);}
execFileSync('orca',['open','--json'],{encoding:'utf8',timeout:10000});call(['tab','switch']);await until('!!window.__mvp');call(['exec','--command','set viewport 1511 728']);
ev(`(()=>{window.__mvp.state.errors=[];window.addEventListener('error',e=>window.__mvp.state.errors.push(e.message));window.addEventListener('unhandledrejection',e=>window.__mvp.state.errors.push(String(e.reason)));window.__mvp.go('director');return true})()`);
const now=Date.now();const c=(units,at=now,stage='writer',lane='writer-rough')=>({stage,lane,at,units});let rows=[c(4)];
function set(){ev(`(()=>{window.__mvp.setCompletions(${JSON.stringify(rows)});return true})()`);}
set();await verify(4,'첫 4샷 이미지 완료 → 미확인 4');
rows.push(c(5,now+1));set();await verify(9,'추가 5샷 완료 → 미확인 9','badge-unseen-9');
rows.push(c(5,now+2));set();await verify(14,'추가 5샷 완료 → 9+ 축약 없이 14','badge-unseen-14');
set();await verify(14,'동일 완료 재수신에도 14 유지');
rows.push(c(7,now+3,'director','previz'));set();await verify(14,'Director 완료는 Writer 이미지 수에 더하지 않음');
ev(`(()=>{(${button}).click();return true})()`);await until("window.__mvp.project.getState().currentStage==='writer'");await until(`(${button}).getAttribute('aria-current')==='page'`);await verify(0,'실제 Writer 내비게이션 클릭 → 미확인 해제','badge-seen');
ev(`(()=>{window.__mvp.go('artist');return true})()`);await until(`!!document.querySelector('button[aria-label=Artist][aria-current=page]')`);await verify(0,'다시 떠나도 읽은 이미지가 되살아나지 않음');
rows.push(c(1,now+4));set();await verify(1,'떠난 뒤 새 이미지 한 개 완료 → 미확인 1','badge-new-one');
rows=[];set();await new Promise(r=>setTimeout(r,200));
ev(`(()=>{window.__mvp.go('writer');window.__mvp.project.setState({projectId:'mvp-first-image-${Date.now()}'});return true})()`);await until(`(${button}).getAttribute('aria-current')==='page'`);
ev(`(()=>{window.__mvp.go('artist');return true})()`);await until(`!!document.querySelector('button[aria-label=Artist][aria-current=page]')`);
rows=[c(1,Date.now())];set();await verify(1,'새 프로젝트에서 완료 0개일 때 Writer를 방문해도 떠난 뒤 첫 완료 1 표시');
assert.deepEqual(ev('window.__mvp.state.errors'),[]);console.log('브라우저 미처리 오류 0');
