// 승인 전 운영 설정을 확인한다. 구매는 열지 않으며 단일 실패 알림만 검증한다.
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { parse } from 'dotenv'

const env = parse(readFileSync('.env.local'))
const project = JSON.parse(readFileSync('.vercel/project.json'))
const target = 'ntfset_01m22f1d8tevjvf14064acb97d'
const destination = 'https://talestudio.art/api/billing/paddle/webhook'
const statePath = '.claude/docs/2026-09-09/paddle-live-preflight-result.json'
const state = existsSync(statePath) ? JSON.parse(readFileSync(statePath, 'utf8')) : {}
const action = process.argv[2]
assert(['check', 'enable', 'simulate'].includes(action))
assert.equal(project.projectId, 'prj_x0fGmBO62EJVmEZAhlUiOGZVHwnF')
assert.equal(new URL(env.SUPABASE_LIVE_URL).hostname, 'qnjnrihfpqkdhjuzvepy.supabase.co')

function save() {
  const old = existsSync(statePath) ? readFileSync(statePath, 'utf8') : null
  const next = JSON.stringify(state, null, 2) + '\n'
  const lines = text => text.trimEnd().split('\n')
  const patch = old
    ? `*** Update File: ${statePath}\n@@\n${lines(old).map(x => '-' + x).join('\n')}\n${lines(next).map(x => '+' + x).join('\n')}\n`
    : `*** Add File: ${statePath}\n${lines(next).map(x => '+' + x).join('\n')}\n`
  execFileSync('apply_patch', [`*** Begin Patch\n${patch}*** End Patch`], { stdio: 'pipe' })
}

async function paddle(path, method = 'GET', body) {
  if (method !== 'GET') {
    assert(
      (method === 'PATCH' && path === `/notification-settings/${target}`) ||
      (method === 'POST' && (path === '/simulations' || /^\/simulations\/ntfsim_[a-z0-9]{26}\/runs$/.test(path))),
      'No purchase, refund, customer or subscription mutations are allowed',
    )
  }
  const response = await fetch('https://api.paddle.com' + path, {
    method, headers: { Authorization: `Bearer ${env.PADDLE_LIVE_API_KEY}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(15000),
  })
  const json = await response.json()
  if (!response.ok) {
    const detail = json.error?.errors?.map(x => `${x.field}: ${x.message}`).join('; ') ?? ''
    throw Error(`Paddle ${method} ${path}: HTTP ${response.status} ${json.error?.code} ${detail}`)
  }
  return json
}

async function vercel(path) {
  const response = await fetch(`https://api.vercel.com${path}?teamId=${project.orgId}`, {
    headers: { Authorization: `Bearer ${env.VERCEL_TOKEN}` }, signal: AbortSignal.timeout(15000),
  })
  assert(response.ok, `Vercel HTTP ${response.status}`)
  return response.json()
}

async function databaseSnapshot() {
  const response = await fetch('https://api.supabase.com/v1/projects/qnjnrihfpqkdhjuzvepy/database/query/read-only', {
    method: 'POST', headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: `select
      (select count(*)::int from public.subscriptions) as subscriptions,
      (select count(*)::int from public.billing_events) as billing_events,
      (select count(*)::int from public.take_ledger where ref_kind in ('paddle_transaction','paddle_adjustment')) as paddle_ledger_rows,
      (select count(*)::int from public.workspaces where plan <> 'free') as paid_workspaces` }),
    signal: AbortSignal.timeout(15000),
  })
  assert(response.ok, `Live read-only SQL HTTP ${response.status}`)
  const rows = await response.json()
  assert.equal(rows.length, 1)
  return rows[0]
}

function safeSetting(setting) {
  return { id: setting.id, destination: setting.destination, active: setting.active, trafficSource: setting.traffic_source,
    secretMatches: setting.endpoint_secret_key === env.PADDLE_LIVE_WEBHOOK_SECRET,
    subscribedEvents: setting.subscribed_events.map(x => x.name ?? x) }
}

async function check() {
  const [domain, setting, transactions, subscriptions, configuration, production, db] = await Promise.all([
    paddle('/checkout-domains?domain=talestudio.art&per_page=200'), paddle(`/notification-settings/${target}`),
    paddle('/transactions?per_page=1'), paddle('/subscriptions?per_page=1'),
    vercel(`/v10/projects/${project.projectId}/env`), vercel(`/v9/projects/${project.projectId}`), databaseSnapshot(),
  ])
  assert.equal(production.targets.production.meta.githubCommitSha, '31d6edc7bd11f42cd4c7c704c57612ce3793cdb7')
  const expected = { PADDLE_API_KEY: env.PADDLE_LIVE_API_KEY, PADDLE_WEBHOOK_SECRET: env.PADDLE_LIVE_WEBHOOK_SECRET,
    NEXT_PUBLIC_PADDLE_CLIENT_TOKEN: env.NEXT_PUBLIC_PADDLE_LIVE_CLIENT_TOKEN,
    NEXT_PUBLIC_PADDLE_ENV: 'production', PADDLE_LIVE_CHECKOUT_ENABLED: 'false' }
  for (const [key, value] of Object.entries(expected)) {
    assert(value)
    const item = configuration.envs.find(x => x.key === key && x.target.includes('production') && !x.gitBranch)
    assert(item, key)
    const response = await vercel(`/v1/projects/${project.projectId}/env/${item.id}`)
    assert.equal((response.env ?? response).value, value, `Production ${key} mismatch`)
  }
  assert.equal(setting.data.type, 'url')
  assert.equal(setting.data.destination, destination)
  assert.equal(setting.data.endpoint_secret_key, env.PADDLE_LIVE_WEBHOOK_SECRET)
  for (const rows of [transactions, subscriptions]) {
    assert.equal(rows.data.length, 0, 'Unexpected existing Live business records; review before proceeding')
    assert.equal(rows.meta.pagination.has_more, false)
  }
  assert.equal(db.subscriptions, 0)
  assert.equal(db.paddle_ledger_rows, 0)
  const catalogResponse = await fetch('https://talestudio.art/api/billing/catalog-status', { signal: AbortSignal.timeout(15000) })
  const catalog = await catalogResponse.json()
  assert.equal(catalog.checkoutEnabled, false)
  assert.equal(catalog.env, 'production')
  state.checked = { at: new Date().toISOString(), domains: domain.data.map(x => ({ id: x.id, domain: x.domain, status: x.status })),
    setting: safeSetting(setting.data), productionCredentialsMatchLiveB: true, checkoutEnabled: false,
    liveTransactions: 0, liveSubscriptions: 0, database: db, productionDeployment: production.targets.production.id }
  save()
  return setting.data
}

try {
  const setting = await check()
  if (action === 'enable') {
    assert.equal(setting.traffic_source, 'platform')
    if (!setting.active) await paddle(`/notification-settings/${target}`, 'PATCH', { active: true })
    const after = (await paddle(`/notification-settings/${target}`)).data
    assert(after.active)
    assert.equal(after.traffic_source, 'platform')
    assert.equal(after.destination, destination)
    assert.equal(after.endpoint_secret_key, env.PADDLE_LIVE_WEBHOOK_SECRET)
    assert.deepEqual(after.subscribed_events, setting.subscribed_events)
    state.enabled = { at: new Date().toISOString(), setting: safeSetting(after), changedOnlyActive: !setting.active }
    save()
  }
  if (action === 'simulate') {
    assert(setting.active)
    assert.equal(setting.traffic_source, 'platform')
    assert(!state.simulation?.runId, 'Do not send a second probe automatically')
    const source = 'https://developer.paddle.com/webhooks/transactions/transaction-payment-failed.md'
    const exampleResponse = await fetch(source, { signal: AbortSignal.timeout(15000) })
    assert(exampleResponse.ok)
    const exampleMatch = (await exampleResponse.text()).match(/## Example[\s\S]*?```json\s*([\s\S]*?)```/)
    assert(exampleMatch, 'Official event example missing')
    const example = JSON.parse(exampleMatch[1])
    assert.equal(example.event_type, 'transaction.payment_failed')
    assert.equal(example.data.origin, 'web')
    assert.equal(example.data.subscription_id, null)
    const payload = { ...example.data, custom_data: null }
    const before = await databaseSnapshot()
    if (state.simulation) state.previousSimulationAttempts = [...(state.previousSimulationAttempts ?? []), { ...state.simulation, error: state.lastError }]
    delete state.lastError
    state.simulation = { at: new Date().toISOString(), before, eventType: 'transaction.payment_failed', realCharge: false, exampleSource: source }
    save()
    try {
      await paddle(`/notification-settings/${target}`, 'PATCH', { traffic_source: 'all' })
      const simulation = (await paddle('/simulations', 'POST', {
        notification_setting_id: target, name: 'Prelaunch delivery check 2026-09-09',
        type: 'transaction.payment_failed',
        payload,
      })).data
      state.simulation.id = simulation.id
      save()
      assert.equal(simulation.type, 'transaction.payment_failed')
      assert.equal(simulation.payload.origin, 'web')
      assert.equal(simulation.payload.subscription_id, null)
      assert.equal(simulation.payload.custom_data, null)
      const run = (await paddle(`/simulations/${simulation.id}/runs`, 'POST')).data
      state.simulation.runId = run.id
      save()
      for (let i = 0; i < 12; i++) {
        const events = (await paddle(`/simulations/${simulation.id}/runs/${run.id}/events`)).data
        state.simulation.events = events.map(x => ({ id: x.id, status: x.status, eventType: x.event_type,
          response: x.response, requestEventId: x.request?.body?.event_id, requestKeys: Object.keys(x.request ?? {}) }))
        save()
        if (events.length && events.every(x => ['success', 'failed'].includes(x.status))) break
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
      state.simulation.after = await databaseSnapshot()
      for (const key of ['subscriptions', 'paddle_ledger_rows', 'paid_workspaces']) assert.equal(state.simulation.after[key], before[key], `${key} changed`)
      state.simulation.noCreditPlanOrSubscriptionChange = true
      state.simulation.success = state.simulation.events?.length === 1 && state.simulation.events[0].status === 'success'
      save()
    } finally {
      await paddle(`/notification-settings/${target}`, 'PATCH', { traffic_source: 'platform' })
      const restored = (await paddle(`/notification-settings/${target}`)).data
      assert.equal(restored.traffic_source, 'platform')
      assert(restored.active)
      state.simulation.restoredPlatformOnly = true
      state.finalSetting = safeSetting(restored)
      save()
    }
  }
  console.log(JSON.stringify(state, null, 2))
} catch (error) {
  state.lastError = { at: new Date().toISOString(), action, message: error.message }
  save()
  console.error(JSON.stringify(state.lastError))
  process.exitCode = 1
}
