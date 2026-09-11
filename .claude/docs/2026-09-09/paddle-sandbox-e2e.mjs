// 실제 Paddle 샌드박스 구매만 검사한다. 운영 API·기존 사용자·영상 생성은 호출하지 않는다.
import assert from 'node:assert/strict'
import { readFileSync, existsSync, writeFileSync } from 'node:fs'
import { createHmac } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { parse } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
// 왜: 이 도구 자체의 안전 검사는 네트워크·계정·비밀 없이 실행되어야 한다.
if (process.argv[2] === 'self-test') {
  const { test } = await import('node:test')
  await test('테스트전용거래/구독만조작하며중복이벤트는Take추가지급안함', () => {
    const context = { workspaceId: 'ws-test', customerId: 'ctm_test', transactions: [{ id: 'txn_test', subscriptionId: 'sub_test' }] }
    const transaction = { id: 'txn_test', customer_id: 'ctm_test', custom_data: { workspace_id: 'ws-test' } }
    assert.doesNotThrow(() => assertTransactionScope(transaction, context))
    assert.throws(() => assertTransactionScope({ ...transaction, customer_id: 'ctm_other' }, context))
    assert.throws(() => assertTransactionScope({ ...transaction, custom_data: { workspace_id: 'ws-other' } }, context))
    assert.doesNotThrow(() => assertSubscriptionScope({ ...transaction, id: 'sub_test' }, context))
    assert.throws(() => assertSubscriptionScope({ ...transaction, id: 'sub_other' }, context))
    const notification = { id: 'ntf_test', notification_setting_id: 'ntfset_test', origin: 'event', status: 'delivered', payload: { event_id: 'evt_test', data: transaction } }
    assert.doesNotThrow(() => assertNotificationScope(notification, 'txn_test', context, 'ntfset_test', true))
    assert.throws(() => assertNotificationScope({ ...notification, notification_setting_id: 'ntfset_other' }, 'txn_test', context, 'ntfset_test', true))
    assert.throws(() => assertNotificationScope({ ...notification, origin: 'replay' }, 'txn_test', context, 'ntfset_test', true))
    const grant = [{ id: 'grant-1', kind: 'grant_plan', delta: 16, ref_id: 'txn_test' }]
    assert.doesNotThrow(() => assertGrantUnchanged(grant, [...grant], 'txn_test'))
    assert.throws(() => assertGrantUnchanged(grant, [...grant, { ...grant[0], id: 'grant-2' }], 'txn_test'))
    assert.throws(() => checkedRows({ data: null, error: { code: 'DB_FAILED' } }, '장부'))
    assert.deepEqual(checkedRows({ data: [], error: null }, '장부'), [])
  })
  // 왜: 연결 확인은 결제 제출 없이 같은 거래만 다시 열고 포털의 일회용 세션 주소를 남기지 않는다.
  await test('결제 링크는 한 번 만든 테스트 거래만 다시 열고 포털 세션 주소는 기록하지 않는다', () => {
    assert.equal(paymentLinkCreationDecision(undefined), 'create')
    assert.equal(paymentLinkCreationDecision({ creationStartedAt: '2026-09-09T09:00:00Z' }), 'recover')
    assert.equal(paymentLinkCreationDecision({ transactionId: 'txn_test' }), 'reuse')
    const origins = portalOrigins({ overviewUrl: 'https://sandbox-customer-portal.paddle.com/cpl_private?token=secret', cancelUrl: null, updatePaymentMethodUrl: null })
    assert.deepEqual(origins, { overviewUrl: 'https://sandbox-customer-portal.paddle.com', cancelUrl: null, updatePaymentMethodUrl: null })
    assert.ok(!JSON.stringify(origins).includes('secret'))
    assert.ok(!JSON.stringify(origins).includes('cpl_private'))
    assert.throws(() => portalOrigins({ overviewUrl: 'https://customer-portal.paddle.com/cpl_live?token=secret' }))
    assert.throws(() => portalOrigins({ overviewUrl: 'https://sandbox-customer-portal.paddle.com.evil.test/' }))
    assert.throws(() => portalOrigins({ overviewUrl: 'not-a-url' }))
  })
} else {
const root = '/Users/xcape/projects/tale-studio'
const statePath = `${root}/.claude/docs/2026-09-09/paddle-sandbox-e2e-result.json`
const env = parse(readFileSync(`${root}/.env.local`))
assert.equal(env.NEXT_PUBLIC_PADDLE_ENV, 'sandbox')
assert.ok(env.PADDLE_API_KEY.includes('_sdbx'))
assert.equal(new URL(env.NEXT_PUBLIC_SUPABASE_URL).host, 'pbiumddivadgbzxuymak.supabase.co')
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {auth:{persistSession:false,autoRefreshToken:false}})
const page = '1d316599-658b-474c-b6e0-05f89545f85f'
const email = 'paddle-sandbox-20260909-01@talestudio.art'
const password = createHmac('sha256',env.TALE_SMOKE_PASSWORD).update(email).digest('base64url')
let state = existsSync(statePath) ? JSON.parse(readFileSync(statePath,'utf8')) : {environment:'sandbox',email,page,createdAt:new Date().toISOString(),transactions:[]}
const notificationSettingId = 'ntfset_01m1x9ykr2t1k432f4d39shff9'
const notificationDestination = 'https://tale-git-dev-talestudio.vercel.app/api/billing/paddle/webhook'
assert.equal(state.environment, 'sandbox')
assert.equal(state.email, email)
function save() {
  const old = existsSync(statePath) ? readFileSync(statePath,'utf8') : null
  const next = JSON.stringify(state,null,2)+'\n'
  if (old===next) return
  const lines = s=>s.trimEnd().split('\n')
  const diff = old ? `*** Update File: ${statePath}\n@@\n${lines(old).map(l=>'-'+l).join('\n')}\n${lines(next).map(l=>'+'+l).join('\n')}\n` : `*** Add File: ${statePath}\n${lines(next).map(l=>'+'+l).join('\n')}\n`
  execFileSync('apply_patch',[`*** Begin Patch\n${diff}*** End Patch`],{stdio:'pipe'})
}
function orca(args) {
  try {
    const j=JSON.parse(execFileSync('orca',[...args,'--page',page,'--json'],{encoding:'utf8',maxBuffer:32*1024*1024,stdio:['ignore','pipe','pipe']}))
    if (j.ok===false) throw new Error(j.error?.code)
    return j.result ?? j
  } catch { throw new Error(`Sandbox browser command failed: ${args[0]}`) }
}
function evalPage(js) {
  const envelope = orca(['eval','--expression',js])
  const value = envelope && typeof envelope === 'object' && 'result' in envelope ? envelope.result : envelope
  if (typeof value === 'string') {
    try { return JSON.parse(value) } catch { return value }
  }
  return value
}
async function paddle(method,path,body) {
  assert.ok(path.startsWith('/') && !path.startsWith('//'))
  const r=await fetch('https://sandbox-api.paddle.com'+path,{method,headers:{Authorization:`Bearer ${env.PADDLE_API_KEY}`,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(20_000)})
  const j=await r.json()
  if(!r.ok || j.error) throw new Error(`Sandbox ${method} ${path}: ${r.status} ${j.error?.code}`)
  assert.ok(!j.meta?.pagination?.has_more, '결과가 여러 페이지입니다. 일부 기록만으로 검증하지 않습니다.')
  return j.data
}
async function ownContext() {
  assert.equal(state.workspaceId, 'b2e9300a-9eaa-4020-b288-b1a1dbc37529', '전용 테스트 작업공간만 조회·조작합니다.')
  assert.equal(state.userId, '2b8d0ef9-94d2-49bc-ad0f-4851c69a43bd', '전용 테스트 계정만 조회·조작합니다.')
  const workspace = checkedRows(await sb.from('workspaces').select('id,owner_id,plan').eq('id', state.workspaceId).single(), 'Workspace')
  assert.equal(workspace.owner_id, state.userId)
  const account = checkedRows(await sb.auth.admin.getUserById(state.userId), 'Test identity')
  assert.equal(account.user.email, email)
  assert.equal(account.user.user_metadata.sandbox_e2e, true)
  const customer = checkedRows(await sb.from('billing_customers').select('mor_customer_id').eq('workspace_id', state.workspaceId).maybeSingle(), 'Customer')
  return { workspace, workspaceId: state.workspaceId, customerId: customer?.mor_customer_id ?? null, transactions: state.transactions }
}
async function ownTransaction(id) {
  assert.match(id ?? '', /^txn_[a-z\d]{26}$/)
  assert.ok(state.transactions.some(t => t.id === id), '이번 실행에서 기록한 테스트 거래만 조작합니다.')
  const context = await ownContext()
  const transaction = await paddle('GET', `/transactions/${id}`)
  assertTransactionScope(transaction, context)
  assert.ok(Date.parse(transaction.created_at) >= Date.parse(state.createdAt), '이번 검증보다 오래된 거래는 조작하지 않습니다.')
  return { context, transaction }
}
async function evidence(context) {
  const ledger = checkedRows(await sb.from('take_ledger').select('id,kind,delta,grant_id,ref_id,ref_kind,reason,expires_at,created_at').eq('workspace_id', context.workspaceId).order('created_at'), 'Ledger')
  const subscriptions = checkedRows(await sb.from('subscriptions').select('mor_subscription_id,status,plan,current_period_end').eq('workspace_id', context.workspaceId), 'Subscriptions')
  const transactionIds = context.transactions.map(t => t.id)
  const entityIds = [...transactionIds, ...subscriptions.map(s => s.mor_subscription_id).filter(Boolean)]
  const events = new Map()
  const eventFields = 'mor_event_id,type,processed_at,received_at'
  if (entityIds.length) {
    for (const event of checkedRows(await sb.from('billing_events').select(eventFields).in('payload->data->>id', entityIds), 'Entity events')) events.set(event.mor_event_id, event)
    for (const event of checkedRows(await sb.from('billing_events').select(eventFields).in('payload->data->>transaction_id', transactionIds), 'Transaction adjustment events')) events.set(event.mor_event_id, event)
  }
  return { at: new Date().toISOString(), workspace: { id: context.workspace.id, plan: context.workspace.plan }, ledger, subscriptions, events: [...events.values()] }
}
async function ownNotification(txn, id, replay = false) {
  assert.match(id ?? '', /^ntf_[a-z\d]{26}$/)
  const { context } = await ownTransaction(txn)
  const notification = await paddle('GET', `/notifications/${id}`)
  assertNotificationScope(notification, txn, context, notificationSettingId, replay)
  return { context, notification }
}
function summarizeNotification(n) {
  return { id: n.id, type: n.type, status: n.status, origin: n.origin, eventId: n.payload.event_id, settingId: n.notification_setting_id, deliveredAt: n.delivered_at, timesAttempted: n.times_attempted }
}
async function browserContext() {
  const context = await ownContext()
  const latest = checkedRows(await sb.from('workspaces').select('id').eq('owner_id', state.userId).order('created_at', { ascending: false }).limit(1).single(), 'Active test workspace')
  assert.equal(latest.id, state.workspaceId, '브라우저 구매가 사용하는 최신 작업공간도 전용 테스트 작업공간이어야 합니다.')
  assert.equal(evalPage('location.origin'), 'http://localhost:3000')
  return context
}
function browserBillingRequest(target) {
  assert.ok(['checkout', 'portal'].includes(target))
  // 로그인 쿠키는 브라우저 안에서만 사용한다. 계정·서버 환경을 재확인한 뒤 같은 세션으로 요청한다.
  return evalPage(`(async () => {
    if (location.origin !== 'http://localhost:3000') throw new Error('Local test page required');
    const accountResponse = await fetch('/api/billing/account', { cache: 'no-store', signal: AbortSignal.timeout(20000) });
    const account = await accountResponse.json();
    if (accountResponse.status !== 200 || account.email !== ${JSON.stringify(email)} || account.isAdmin || !account.hasPaddleCustomer) throw new Error('Dedicated test session required');
    const catalogResponse = await fetch('/api/billing/catalog-status', { cache: 'no-store', signal: AbortSignal.timeout(20000) });
    const catalog = await catalogResponse.json();
    if (catalogResponse.status !== 200 || catalog.env !== 'sandbox') throw new Error('Sandbox app required');
    const response = await fetch(${JSON.stringify(`/api/billing/${target}`)}, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      ${target === 'checkout' ? "body: JSON.stringify({ kind: 'plan', id: 's2' })," : ''}
      signal: AbortSignal.timeout(20000)
    });
    const body = await response.json();
    if (response.status !== 200) return { status: response.status };
    ${target === 'checkout' ? 'return { status: response.status, transactionId: body.transactionId };' : `return { status: response.status, origins: (${portalOrigins.toString()})(body) };`}
  })()`)
}
const action=process.argv[2]
if(action==='prepare') {
  if(!state.userId) {
    const {data,error}=await sb.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{locale:'ko',sandbox_e2e:true}})
    if(error) throw new Error(`Test account: ${error.code}`)
    state.userId=data.user.id;save()
  }
  const {data:workspace,error}=await sb.from('workspaces').select('id,plan').eq('owner_id',state.userId).maybeSingle()
  if(error) throw new Error(`Workspace read: ${error.code}`)
  if(workspace) state.workspaceId=workspace.id
  else {
    const {data,error}=await sb.from('workspaces').insert({owner_id:state.userId,name:'Paddle sandbox verification 2026-09-09',slug:'paddle-sandbox-20260909-01',plan:'free'}).select('id').single()
    if(error) throw new Error(`Test workspace: ${error.code}`)
    state.workspaceId=data.id
  }
  save();console.log(JSON.stringify({prepared:true,userId:state.userId,workspaceId:state.workspaceId,existingUsersModified:false}))
} else if(action==='login') {
  const location=evalPage('({origin:location.origin,path:location.pathname})')
  assert.equal(location.origin,'http://localhost:3000');assert.equal(location.path,'/login')
  const snapshot=orca(['snapshot'])
  const emailRef=Object.entries(snapshot.refs).find(([,v])=>v.role==='textbox'&&v.name==='Email')?.[0]
  const passwordRef=Object.entries(snapshot.refs).find(([,v])=>v.role==='textbox'&&v.name==='Password')?.[0]
  assert.ok(emailRef&&passwordRef)
  orca(['fill','--element','@'+emailRef,'--value',email])
  orca(['fill','--element','@'+passwordRef,'--value',password])
  evalPage('document.querySelector("form").requestSubmit(); true')
  console.log('전용 테스트 계정 로그인 제출. 비밀번호는 저장·출력하지 않았습니다.')
} else if(['screen','click','type','key'].includes(action)) {
  assert.equal(evalPage('location.origin'),'http://localhost:3000')
  if(action==='screen') {
    const label=process.argv[3] ?? 'current'
    assert.match(label, /^[a-z][a-z0-9-]{0,60}$/, '화면 이름은 소문자·숫자·하이픈만 사용합니다.')
    const shot=orca(['screenshot','--format','png'])
    const bytes=Buffer.from(shot.data,'base64')
    const target=`${root}/.claude/docs/2026-09-09/paddle-sandbox-${label}.png`
    writeFileSync(target,bytes)
    console.log(JSON.stringify({path:target,width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20),viewport:evalPage('({width:innerWidth,height:innerHeight})')}))
  } else {
    assert.equal(evalPage('[...document.querySelectorAll("iframe")].some(f=>new URL(f.src).origin === "https://sandbox-buy.paddle.com")'),true,'Paddle Sandbox 결제창에서만 입력합니다.')
    if(action==='click') {
      const [x,y]=process.argv.slice(3).map(Number)
      const viewport=evalPage('({width:innerWidth,height:innerHeight})')
      assert.ok(x>=0&&x<viewport.width&&y>=0&&y<viewport.height)
      orca(['mouse','move','--x',String(x),'--y',String(y)])
      orca(['mouse','down','--button','left']);orca(['mouse','up','--button','left'])
    } else if(action==='type') {
      const input=process.argv[3]
      assert.ok(['4242424242424242','4000000000000002','123','12/29','1229','Sandbox Test'].includes(input),'공식 테스트 카드 정보만 입력합니다.')
      orca(['inserttext','--text',input])
    } else {
      const key=process.argv[3];assert.ok(['Tab','Enter','Escape'].includes(key));orca(['keypress','--key',key])
    }
    console.log('전용 Sandbox 결제창 입력 완료')
  }
} else if(action==='open-payment-link') {
  let context = await browserContext()
  assert.equal(context.workspace.plan, 'free', '구독 해지와 무료 복귀를 확인한 전용 계정으로만 링크를 검사합니다.')
  const priceId = env.NEXT_PUBLIC_PADDLE_PRICE_PLAN_S2
  assert.match(priceId ?? '', /^pri_[a-z\d]{26}$/)
  const decision = paymentLinkCreationDecision(state.paymentLinkProbe)
  if (decision === 'create') {
    // 생성 여부가 불명확한 실패 뒤에 재요청하지 않도록 요청 의도를 먼저 기록한다.
    state.paymentLinkProbe = { creationStartedAt: new Date().toISOString(), product: 's2', purchaseSubmitted: false }
    save()
    const response = browserBillingRequest('checkout')
    state.paymentLinkProbe.responseStatus = response.status
    if (response.transactionId) state.paymentLinkProbe.transactionId = response.transactionId
    save()
    assert.equal(response.status, 200, '전용 세션의 결제 준비 요청이 실패했습니다. 자동으로 새 거래를 만들지 않습니다.')
    assert.match(response.transactionId ?? '', /^txn_[a-z\d]{26}$/)
  } else if (decision === 'recover') {
    const transactions = await paddle('GET', `/transactions?customer_id=${context.customerId}&per_page=200`)
    for (const transaction of transactions) assertTransactionScope(transaction, context)
    const candidates = transactions.filter(transaction => Date.parse(transaction.created_at) >= Date.parse(state.paymentLinkProbe.creationStartedAt)
      && ['draft', 'ready'].includes(transaction.status) && transaction.items.length === 1 && transaction.items[0].price.id === priceId)
    assert.equal(candidates.length, 1, '생성 여부가 불명확합니다. 중복 거래를 만들지 않고 멈춥니다. status로 확인하세요.')
    state.paymentLinkProbe.transactionId = candidates[0].id
    state.paymentLinkProbe.recovered = true
    save()
  }
  const txn = state.paymentLinkProbe.transactionId
  assert.match(txn ?? '', /^txn_[a-z\d]{26}$/)
  context = await ownContext()
  const transaction = await paddle('GET', `/transactions/${txn}`)
  assertTransactionScope(transaction, context)
  assert.ok(['draft', 'ready'].includes(transaction.status), '결제되지 않은 테스트 거래만 링크로 엽니다.')
  assert.equal(transaction.collection_mode, 'automatic')
  assert.equal(transaction.items.length, 1)
  assert.equal(transaction.items[0].price.id, priceId)
  assert.equal(transaction.items[0].quantity, 1)
  const recorded = { id: txn, status: transaction.status, subscriptionId: transaction.subscription_id, total: transaction.details?.totals?.total, currency: transaction.currency_code, priceIds: [priceId] }
  state.transactions = [...state.transactions.filter(item => item.id !== txn), recorded]
  state.paymentLinkProbe.scopeVerifiedAt = new Date().toISOString()
  save()
  // 기존 _ptxn 초기화만 검사한다. 카드 입력이나 구매 제출 명령은 호출하지 않는다.
  orca(['goto', '--url', `http://localhost:3000/checkout?_ptxn=${txn}`])
  console.log(JSON.stringify({ transactionId: txn, navigatedTo: '/checkout', purchaseSubmitted: false, reused: decision !== 'create', next: 'payment-link-status' }))
} else if(action==='payment-link-status') {
  const txn = state.paymentLinkProbe?.transactionId
  await ownTransaction(txn)
  const result = evalPage(`(() => {
    if (location.origin !== 'http://localhost:3000' || location.pathname !== '/checkout' || new URLSearchParams(location.search).get('_ptxn') !== ${JSON.stringify(txn)}) throw new Error('Recorded local payment link required');
    const origins = [...document.querySelectorAll('iframe')].flatMap(frame => {
      try { return [new URL(frame.src).origin] } catch { return [] }
    });
    return { origin: location.origin, path: location.pathname, transactionMatches: true,
      sandboxIframePresent: origins.includes('https://sandbox-buy.paddle.com'),
      liveIframePresent: origins.includes('https://buy.paddle.com'),
      heading: document.getElementById('checkout-heading')?.textContent?.trim().slice(0, 200) ?? null };
  })()`)
  const verified = result.transactionMatches && result.sandboxIframePresent && !result.liveIframePresent
    && ['Continue in the Paddle checkout', 'Paddle 결제창에서 계속하세요'].includes(result.heading)
  state.paymentLinkProbe.lastObserved = { at: new Date().toISOString(), ...result, verified }
  save();console.log(JSON.stringify(state.paymentLinkProbe.lastObserved))
  assert.ok(verified, '결제 링크의 Sandbox 창과 열림 상태가 아직 확인되지 않았습니다. 다시 조회하세요.')
} else if(action==='portal-check') {
  await browserContext()
  const response = browserBillingRequest('portal')
  assert.equal(response.status, 200, '전용 테스트 세션의 포털 연결 요청이 실패했습니다.')
  assert.equal(response.origins.overviewUrl, 'https://sandbox-customer-portal.paddle.com')
  state.portalCheck = { at: new Date().toISOString(), status: response.status, origins: response.origins, sessionUrlsStored: false, portalOpened: false, verified: true }
  save();console.log(JSON.stringify(state.portalCheck))
} else if(action==='status') {
  const context = await ownContext()
  const transactions=context.customerId ? await paddle('GET',`/transactions?customer_id=${context.customerId}&per_page=200`) : []
  for (const transaction of transactions) assertTransactionScope(transaction, context)
  state.transactions=transactions.map(t=>({id:t.id,status:t.status,subscriptionId:t.subscription_id,total:t.details?.totals?.total,currency:t.currency_code,priceIds:t.items.map(i=>i.price.id)}))
  state.lastObserved=await evidence({ ...context, transactions: state.transactions })
  save();console.log(JSON.stringify({transactions:state.transactions,...state.lastObserved},null,2))
} else if(action==='refund') {
  const txn=process.argv[3]
  assert.ok(state.transactions.some(t=>t.id===txn&&t.status==='completed'),'이번 실행의 완료된 테스트 거래만 환불할 수 있습니다.')
  const { transaction } = await ownTransaction(txn)
  assert.equal(transaction.status, 'completed')
  const existing=await paddle('GET',`/adjustments?transaction_id=${txn}`)
  const adjustment=existing.find(a=>a.action==='refund') ?? await paddle('POST','/adjustments',{action:'refund',type:'full',transaction_id:txn,reason:'Sandbox end-to-end verification'})
  state.refunds={...state.refunds,[txn]:{id:adjustment.id,status:adjustment.status}};save();console.log(JSON.stringify(state.refunds))
} else if(action==='refund-status') {
  for(const txn of Object.keys(state.refunds??{})) {
    await ownTransaction(txn)
    const items=await paddle('GET',`/adjustments?transaction_id=${txn}`)
    state.refunds[txn]=items.filter(a=>a.action==='refund').map(a=>({id:a.id,status:a.status}))
  }
  save();console.log(JSON.stringify(state.refunds))
} else if(action==='cancel-scheduled' || action==='cancel-immediately') {
  const subscriptionId = process.argv[3]
  assert.match(subscriptionId ?? '', /^sub_[a-z\d]{26}$/)
  const recorded = state.transactions.find(t => t.subscriptionId === subscriptionId && t.status === 'completed')
  assert.ok(recorded, '이번 실행의 완료된 거래에 연결된 구독만 해지합니다.')
  const { context, transaction } = await ownTransaction(recorded.id)
  assert.equal(transaction.subscription_id, subscriptionId)
  const current = await paddle('GET', `/subscriptions/${subscriptionId}`)
  assertSubscriptionScope(current, context)
  const effectiveFrom = action === 'cancel-immediately' ? 'immediately' : 'next_billing_period'
  const alreadyApplied = current.status === 'canceled' || (effectiveFrom === 'next_billing_period' && current.scheduled_change?.action === 'cancel')
  const result = alreadyApplied ? current : await paddle('POST', `/subscriptions/${subscriptionId}/cancel`, { effective_from: effectiveFrom })
  assertSubscriptionScope(result, context)
  if (effectiveFrom === 'immediately') assert.equal(result.status, 'canceled', '즉시 해지 완료 상태를 확인하지 못했습니다.')
  else assert.ok(result.status === 'canceled' || result.scheduled_change?.action === 'cancel', '해지 예약 상태를 확인하지 못했습니다.')
  state.cancellations = { ...state.cancellations, [subscriptionId]: { requested: effectiveFrom, status: result.status, scheduledChange: result.scheduled_change, at: new Date().toISOString() } }
  state.cancellationHistory = [...(state.cancellationHistory ?? []), { subscriptionId, ...state.cancellations[subscriptionId] }]
  state.lastObserved = await evidence(context)
  save();console.log(JSON.stringify({ cancellation: state.cancellations[subscriptionId], database: state.lastObserved }, null, 2))
} else if(action==='notifications') {
  const txn = process.argv[3]
  const { context } = await ownTransaction(txn)
  const notifications = await paddle('GET', `/notifications?notification_setting_id=${notificationSettingId}&filter=${txn}&per_page=200`)
  for (const notification of notifications) assertNotificationScope(notification, txn, context, notificationSettingId)
  state.notifications = { ...state.notifications, [txn]: notifications.map(summarizeNotification) }
  state.lastObserved = await evidence(context)
  save();console.log(JSON.stringify({ notifications: state.notifications[txn], database: state.lastObserved }, null, 2))
} else if(action==='notification-logs' || action==='replay') {
  const [txn, id] = process.argv.slice(3)
  const { context, notification } = await ownNotification(txn, id, action === 'replay')
  if(action === 'notification-logs') {
    const logs = await paddle('GET', `/notifications/${id}/logs?per_page=200`)
    // 원문 응답에는 개인정보가 있을 수 있으므로 상태 코드·시각·중복처리 결과만 남긴다.
    const summaries = logs.map(log => {
      let result
      try { result = JSON.parse(log.response_body)?.result } catch {}
      return { id: log.id, responseCode: log.response_code, attemptedAt: log.attempted_at, ...(typeof result === 'string' ? { result } : {}) }
    })
    state.notificationLogs = { ...state.notificationLogs, [id]: summaries }
    const replay = state.replays?.[id]
    if (replay && notification.status === 'delivered') {
      assert.equal(notification.payload.event_id, replay.eventId)
      const after = await evidence(context)
      assert.ok(after.events.some(event => event.mor_event_id === replay.eventId && event.processed_at), '동일한 결제 이벤트의 처리 완료를 확인해야 합니다.')
      assertGrantUnchanged(replay.beforeLedger, after.ledger, txn)
      replay.duplicateGrantVerified = true
      replay.verifiedAt = new Date().toISOString()
      state.lastObserved = after
    }
    save();console.log(JSON.stringify({ notification: summarizeNotification(notification), logs: summaries, replay }, null, 2))
  } else {
    assert.equal(notification.type, 'transaction.completed', '중복 지급 검증은 실제 결제 완료 알림만 재전송합니다.')
    const setting = await paddle('GET', `/notification-settings/${notificationSettingId}`)
    assert.equal(setting.id, notificationSettingId)
    assert.equal(setting.active, true)
    assert.ok(['platform', 'all'].includes(setting.traffic_source))
    assert.equal(setting.destination, notificationDestination, '검증된 개발 웹훅에만 재전송합니다.')
    const before = await evidence(context)
    assert.ok(before.events.some(event => event.mor_event_id === notification.payload.event_id && event.processed_at), '이미 처리된 동일한 이벤트만 중복 지급 검증에 사용합니다.')
    assert.ok(before.ledger.some(row => row.ref_id === txn && ['grant_plan', 'grant_purchase'].includes(row.kind)), '원래 구매의 Take 지급부터 확인해야 합니다.')
    const replay = await paddle('POST', `/notifications/${id}/replay`)
    assert.match(replay.notification_id, /^ntf_[a-z\d]{26}$/)
    state.replays = { ...state.replays, [replay.notification_id]: { sourceId: id, transactionId: txn, eventId: notification.payload.event_id, beforeLedger: before.ledger, requestedAt: new Date().toISOString(), duplicateGrantVerified: false } }
    save();console.log(JSON.stringify({ replayNotificationId: replay.notification_id, duplicateGrantVerified: false, next: `notification-logs ${txn} ${replay.notification_id}` }))
  }
} else { throw new Error('Unknown action') }
}

function checkedRows(result, label) {
  if (result.error) throw new Error(`${label}: ${result.error.code ?? 'query_failed'}`)
  return result.data
}
function assertTransactionScope(transaction, context) {
  assert.ok(context.customerId, '전용 테스트 고객이 확인되지 않았습니다.')
  assert.equal(transaction.customer_id, context.customerId)
  assert.equal(transaction.custom_data?.workspace_id, context.workspaceId)
}
function assertSubscriptionScope(subscription, context) {
  assert.ok(context.transactions.some(transaction => transaction.subscriptionId === subscription.id), '기록된 테스트 구독만 조작합니다.')
  assertTransactionScope(subscription, context)
}
function assertNotificationScope(notification, txn, context, settingId, replay = false) {
  assert.equal(notification.notification_setting_id, settingId)
  assert.ok(context.transactions.some(transaction => transaction.id === txn), '기록된 테스트 거래의 알림만 조작합니다.')
  const data = notification.payload?.data
  assert.ok(data && (data.id === txn || data.transaction_id === txn), '다른 거래의 알림은 조작하지 않습니다.')
  if (data.id === txn) assertTransactionScope(data, context)
  else if (data.customer_id) assert.equal(data.customer_id, context.customerId)
  assert.ok(notification.payload.event_id)
  if (replay) {
    assert.equal(notification.origin, 'event', '재전송에서 생긴 알림은 다시 재전송하지 않습니다.')
    assert.ok(['delivered', 'failed'].includes(notification.status), '전송 완료·실패가 확정된 원본 알림만 재전송합니다.')
  }
}
function assertGrantUnchanged(before, after, txn) {
  const grants = rows => rows.filter(row => row.ref_id === txn && ['grant_plan', 'grant_purchase'].includes(row.kind))
    .map(({ id, kind, delta, ref_id }) => ({ id, kind, delta, ref_id })).sort((a, b) => a.id.localeCompare(b.id))
  assert.deepEqual(grants(after), grants(before), '중복 결제 이벤트가 Take를 추가 지급했습니다.')
}
function paymentLinkCreationDecision(probe) {
  if (probe?.transactionId) return 'reuse'
  return probe?.creationStartedAt ? 'recover' : 'create'
}
function portalOrigins(links) {
  const result = {}
  for (const key of ['overviewUrl', 'cancelUrl', 'updatePaymentMethodUrl']) {
    const value = links?.[key]
    if (key !== 'overviewUrl' && (value === null || value === undefined)) { result[key] = null; continue }
    let origin
    try { origin = new URL(value).origin } catch { throw new Error('Invalid portal link') }
    if (origin !== 'https://sandbox-customer-portal.paddle.com') throw new Error('Sandbox portal required')
    result[key] = origin
  }
  return result
}
