// 결제 전용 격리본만 배포한다. 운영 결제는 닫고 Preview/DB 설정은 바꾸지 않는다.
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { parse } from 'dotenv'
const root='/Users/xcape/projects/tale-studio'
const rollout='/Users/xcape/orca/workspaces/tale-studio/paddle-checkout-rollout'
// 2026-09-09: 영상 변경을 포함한 현재 운영본과 검증된 결제 통합 커밋을 함께 고정한다.
const reviewedProduction='54455bc4dad73e49ce5505a4c21abf5963c36bce'
const reviewedIntegration='31d6edc7bd11f42cd4c7c704c57612ce3793cdb7'
const env=parse(readFileSync(`${root}/.env.local`))
const project=JSON.parse(readFileSync(`${root}/.vercel/project.json`))
assert.equal(project.projectId,'prj_x0fGmBO62EJVmEZAhlUiOGZVHwnF')
const statePath=`${root}/.claude/docs/2026-09-09/paddle-deployment-result.json`
const state=existsSync(statePath)?JSON.parse(readFileSync(statePath,'utf8')):{}
function save(){
  const old=existsSync(statePath)?readFileSync(statePath,'utf8'):null
  const next=JSON.stringify(state,null,2)+'\n'
  const lines=s=>s.trimEnd().split('\n')
  const patch=old?`*** Update File: ${statePath}\n@@\n${lines(old).map(l=>'-'+l).join('\n')}\n${lines(next).map(l=>'+'+l).join('\n')}\n`:`*** Add File: ${statePath}\n${lines(next).map(l=>'+'+l).join('\n')}\n`
  execFileSync('apply_patch',[`*** Begin Patch\n${patch}*** End Patch`],{stdio:'pipe'})
}
async function api(path,method='GET',body){
  const r=await fetch(`https://api.vercel.com${path}${path.includes('?')?'&':'?'}teamId=${project.orgId}`,{method,headers:{Authorization:`Bearer ${env.VERCEL_TOKEN}`,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(30_000)})
  const j=await r.json();if(!r.ok)throw Error(`Vercel ${method}: ${r.status} ${j.error?.code}`);return j
}
async function paddle(path){
  const r=await fetch(`https://api.paddle.com${path}`,{headers:{Authorization:`Bearer ${env.PADDLE_LIVE_API_KEY}`},signal:AbortSignal.timeout(20_000)})
  const j=await r.json();if(!r.ok)throw Error(`Live config read: ${r.status} ${j.error?.code}`);return j.data
}
function cli(args){
  const ignore=readFileSync(`${rollout}/.vercelignore`,'utf8')
  assert.ok(ignore.includes('\n/*\n')&&!ignore.includes('!/.claude'))
  const output=execFileSync(process.execPath,['/Users/xcape/.npm/_npx/69f9afb961c37556/node_modules/vercel/dist/vc.js',...args,'--cwd',rollout,'--yes','--json'],{cwd:root,env:{...process.env,VERCEL_TOKEN:env.VERCEL_TOKEN,VERCEL_PROJECT_ID:project.projectId,VERCEL_ORG_ID:project.orgId,VERCEL_TELEMETRY_DISABLED:'1'},encoding:'utf8',maxBuffer:32*1024*1024,stdio:['ignore','pipe','pipe']})
  return JSON.parse(output)
}
const action=process.argv[2]
if(action==='dry'){
  assert.equal(execFileSync('git',['rev-parse','HEAD'],{cwd:rollout,encoding:'utf8'}).trim(),reviewedIntegration,'검사한 통합 커밋과 다릅니다.')
  const result=cli(['deploy','--dry','--prod'])
  const files=result.files??result.data?.files
  assert.ok(Array.isArray(files),`Unexpected dry keys: ${Object.keys(result)}`)
  const paths=files.map(x=>x.path)
  assert.ok(paths.every(p=>!/(^|\/)(\.claude|\.env[^/]*|\.omx|\.agents|\.codex|node_modules|\.next|\.git)(\/|$)/.test(p)))
  for(const required of ['src/app/pricing/page.tsx','src/app/checkout/page.tsx','src/lib/billing/checkout-availability.ts','sentry.server.config.ts','sentry.edge.config.ts','package.json','pnpm-lock.yaml','vercel.json'])assert.ok(paths.includes(required),`Missing ${required}`)
  state.dry={at:new Date().toISOString(),commit:reviewedIntegration,base:reviewedProduction,fileCount:paths.length,privatePaths:0,paths};save()
  console.log(JSON.stringify({dry:true,fileCount:paths.length,privatePaths:0,resultKeys:Object.keys(result)}))
}else if(action==='configure'){
  const catalog=JSON.parse(readFileSync(`${root}/.claude/docs/2026-09-09/paddle-live-catalog-verified.json`))
  assert.equal(catalog.sellerId,'419628');assert.equal(catalog.rows.length,13)
  const [products,tokens,webhooks]=await Promise.all([paddle('/products?status=active&include=prices&per_page=200'),paddle('/client-tokens?status=active&per_page=200'),paddle('/notification-settings?per_page=200')])
  // 이 API는 seller_id를 반환하지 않는다. B 키로 조회한 사전 검증 토큰 ID와 값 둘 다 확인한다.
  assert.ok(tokens.some(t=>t.id==='ctkn_01m22epkxdd7zjt8vgcww7sg1q'&&t.token===env.NEXT_PUBLIC_PADDLE_LIVE_CLIENT_TOKEN))
  assert.ok(webhooks.some(w=>w.id==='ntfset_01m22f1d8tevjvf14064acb97d'&&w.destination==='https://talestudio.art/api/billing/paddle/webhook'&&w.endpoint_secret_key===env.PADDLE_LIVE_WEBHOOK_SECRET))
  const values={PADDLE_LIVE_CHECKOUT_ENABLED:'false',NEXT_PUBLIC_PADDLE_ENV:'production',PADDLE_API_KEY:env.PADDLE_LIVE_API_KEY,PADDLE_WEBHOOK_SECRET:env.PADDLE_LIVE_WEBHOOK_SECRET,NEXT_PUBLIC_PADDLE_CLIENT_TOKEN:env.NEXT_PUBLIC_PADDLE_LIVE_CLIENT_TOKEN}
  for(const row of catalog.rows){
    const product=products.find(p=>p.id===row.productId)
    assert.equal(product?.tax_category,'saas')
    const price=product?.prices?.find(p=>p.id===row.priceId)
    assert.equal(price?.unit_price.currency_code,'USD');assert.equal(price?.unit_price.amount,row.amount)
    const [kind,id]=row.tag.split(':');values[`NEXT_PUBLIC_PADDLE_PRICE_${kind.toUpperCase()}_${id.toUpperCase()}`]=row.priceId
  }
  for(const value of Object.values(values))assert.ok(value)
  const before=await api(`/v10/projects/${project.projectId}/env`)
  assert.ok(before.envs.filter(e=>Object.hasOwn(values,e.key)&&e.target.includes('production')).every(e=>e.target.length===1),'공유 환경변수를 바꾸지 않습니다.')
  const previewBefore=before.envs.filter(e=>e.target.includes('preview')).map(e=>({id:e.id,key:e.key,updatedAt:e.updatedAt})).sort((a,b)=>a.id.localeCompare(b.id))
  const result=await api(`/v10/projects/${project.projectId}/env?upsert=true`,'POST',Object.entries(values).map(([key,value])=>({key,value,type:'encrypted',target:['production']})))
  assert.equal(result.failed?.length??0,0,'Some environment variables failed')
  const after=await api(`/v10/projects/${project.projectId}/env`)
  const previewAfter=after.envs.filter(e=>e.target.includes('preview')).map(e=>({id:e.id,key:e.key,updatedAt:e.updatedAt})).sort((a,b)=>a.id.localeCompare(b.id))
  assert.deepEqual(previewAfter,previewBefore)
  for(const [key,value]of Object.entries(values)){
    const item=after.envs.find(e=>e.key===key&&e.target.includes('production')&&!e.gitBranch);assert.ok(item)
    const response=await api(`/v1/projects/${project.projectId}/env/${item.id}`);assert.equal((response.env??response).value,value,`${key} readback`)
  }
  state.configuration={at:new Date().toISOString(),sellerId:'419628',productionKeysVerified:Object.keys(values),liveCheckoutEnabled:false,previewUnchanged:true,databaseVariablesUnchanged:true};save()
  console.log(JSON.stringify(state.configuration))
}else if(action==='stage'){
  assert.ok(state.dry&&state.configuration?.liveCheckoutEnabled===false)
  assert.equal(state.dry.commit,reviewedIntegration,'통합 커밋의 업로드 파일 검사를 먼저 실행해야 합니다.')
  assert.equal(execFileSync('git',['rev-parse','HEAD'],{cwd:rollout,encoding:'utf8'}).trim(),reviewedIntegration,'검사한 통합 커밋과 다릅니다.')
  assert.equal(execFileSync('git',['status','--porcelain'],{cwd:rollout,encoding:'utf8'}).trim(),'','검사 뒤 바뀐 작업 파일이 있습니다.')
  execFileSync('git',['merge-base','--is-ancestor',reviewedProduction,reviewedIntegration],{cwd:rollout})
  const current=await api(`/v9/projects/${project.projectId}`)
  assert.equal(current.targets.production.meta?.githubCommitSha??current.targets.production.meta?.gitCommitSha,reviewedProduction,'운영 버전이 변경되어 다시 비교해야 합니다.')
  const configuration=await api(`/v10/projects/${project.projectId}/env`)
  const liveGate=configuration.envs.find(e=>e.key==='PADDLE_LIVE_CHECKOUT_ENABLED'&&e.target.includes('production')&&!e.gitBranch)
  assert.ok(liveGate,'운영 구매 차단 설정이 없습니다.')
  const gateValue=await api(`/v1/projects/${project.projectId}/env/${liveGate.id}`)
  assert.equal((gateValue.env??gateValue).value,'false','운영 구매 차단을 유지해야 합니다.')
  state.previousProduction={id:current.targets.production.id,url:current.targets.production.url};save()
  if(state.staged){state.stagedHistory=[...(state.stagedHistory??[]),{...state.staged,observed:state.observed}];save()}
  const result=cli(['deploy','--prod','--skip-domain','--no-wait'])
  state.staged={at:new Date().toISOString(),...result};save()
  console.log(JSON.stringify(result))
}else if(action==='status'){
  assert.ok(state.staged)
  const id=state.staged.deployment?.id??state.staged.id??state.staged.deploymentId??state.staged.url
  assert.ok(id,'No deployment identifier')
  const d=await api(`/v13/deployments/${id}`)
  state.observed={at:new Date().toISOString(),id:d.id,url:d.url,readyState:d.readyState,readyStateReason:d.readyStateReason,errorCode:d.errorCode,errorMessage:d.errorMessage,target:d.target,aliasAssigned:d.aliasAssigned};save();console.log(JSON.stringify(state.observed))
}else{throw Error('Unknown deployment action')}
