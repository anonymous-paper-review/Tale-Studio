#!/usr/bin/env node
// smoke-billing-paid.mjs — 결제 전 구간을 사람 없이 한 바퀴 돈다 (#payments-phase-3 P10 돈 드는 검사).
//
// 왜 결제창을 안 쓰나 (2026-09-08 실측, smoke-billing-result.html 3절):
//   Orca 로 Paddle 결제창까지는 열리고 iframe 내부도 읽히지만 **카드번호 입력이 막힌다**(카드칸이 중첩 iframe).
//   그래서 오너 결정(09-08)대로 결제창 대신 **우리가 서명한 결제 알림을 웹훅으로 직접 쏜다**.
//   결제창이 뜨고 카드가 통과하는지는 라이브 키 전환 직후 사람이 한 번 본다 — 그때는 실 카드라 자동화 금지 대상이다.
//   서명은 진짜 시크릿으로 만든다. 웹훅 입장에서 Paddle 이 보낸 것과 구분되지 않는다.
//
// 도는 것: 팩 적립 → 재전송 멱등 → 구독 적립(플랜 세팅) → 영상 생성 1회(hold) → 정리.
//   영상 생성은 실제 fal 호출이라 1회 약 $0.31 이 든다. 하루 1회 기준 월 $9.3 (오너 09-08 승인).
//
// 사용:
//   pnpm smoke:billing:paid                                    # 로컬
//   pnpm smoke:billing:paid --base https://…vercel.app         # dev 배포
//   pnpm smoke:billing:paid --no-generate                      # 영상 생성 빼고(무료)
//   종료 코드: 0 = 전부 통과 / 1 = 하나라도 실패 / 2 = 전제 미충족·내부 오류

import { execFileSync } from 'node:child_process'
import { createHmac } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const ORCA = `${process.env.HOME}/.local/bin/orca`

function orca(args, { raw = false } = {}) {
  const stdout = execFileSync(ORCA, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  if (raw) return stdout
  const parsed = JSON.parse(stdout)
  if (!parsed.ok) throw new Error(`orca ${args[0]} 실패: ${stdout.slice(0, 200)}`)
  return parsed.result
}

/** 로그인 세션이 필요한 라우트를 브라우저 안에서 부른다(우리 API 는 Supabase SSR 쿠키를 본다). */
function fetchInPage(page, { method, path, body }) {
  const expr = `(async () => {
    const opts = { method: ${JSON.stringify(method)}, headers: { 'Content-Type': 'application/json' } };
    ${body ? `opts.body = ${JSON.stringify(JSON.stringify(body))};` : ''}
    const r = await fetch(${JSON.stringify(path)}, opts);
    let b = null; try { b = await r.json() } catch { b = null }
    return JSON.stringify({ status: r.status, body: b });
  })()`
  const raw = orca(['eval', '--page', page, '--expression', expr], { raw: true }).trim()
  let value = raw
  try { value = JSON.parse(raw) } catch { /* 감싸지 않은 문자열 */ }
  if (typeof value === 'string') value = JSON.parse(value)
  return value
}

function env() {
  return Object.fromEntries(
    readFileSync('.env.local', 'utf8')
      .split('\n')
      .filter((l) => l && !l.startsWith('#') && l.includes('='))
      .map((l) => {
        const i = l.indexOf('=')
        return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')]
      }),
  )
}

function parseArgs(argv) {
  const out = { base: 'http://localhost:3000', generate: true }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--base') out.base = argv[++i]
    else if (argv[i] === '--no-generate') out.generate = false
  }
  return out
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const RUN = `smoke${Date.now().toString(36)}`
const results = []

function check(title, ok, detail, guards) {
  results.push({ title, ok, detail, guards })
  console.log(`${ok ? '  ok  ' : '  실패'} ${title}`)
  if (!ok) console.log(`         받은 것: ${detail}\n         지키던 것: ${guards}`)
}

async function main() {
  const opt = parseArgs(process.argv.slice(2))
  const e = env()
  const secret = e.PADDLE_WEBHOOK_SECRET
  if (!secret) {
    console.error('[전제 미충족] PADDLE_WEBHOOK_SECRET 이 없다 — 서명을 만들 수 없다.')
    return 2
  }
  const sb = createClient(e.NEXT_PUBLIC_SUPABASE_URL, e.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

  // 스모크 계정의 워크스페이스·프로젝트·샷을 찾는다.
  const { data: users } = await sb.auth.admin.listUsers({ perPage: 1000 })
  const user = users.users.find((u) => u.email === e.TALE_SMOKE_EMAIL)
  if (!user) {
    console.error('[전제 미충족] 스모크 계정이 이 DB 에 없다.')
    return 2
  }
  const { data: ws } = await sb.from('workspaces').select('id, plan').eq('owner_id', user.id).maybeSingle()
  const { data: project } = await sb.from('projects').select('id').eq('workspace_id', ws.id).limit(1).maybeSingle()
  const { data: shot } = project
    ? await sb.from('shots').select('shot_id').eq('project_id', project.id).limit(1).maybeSingle()
    : { data: null }

  const planBefore = ws.plan
  // 구독 행은 워크스페이스당 하나다(upsert onConflict: workspace_id). 스모크의 가짜 구독이 진짜 구독 행을
  //   덮어쓰므로, 시작 전에 통째로 떠 두고 끝나면 그대로 되돌린다. 2026-09-08 실측으로 드러난 사고 —
  //   sub_${RUN} 만 지우면 덮어쓰인 진짜 행이 사라진 채로 남는다(Paddle 쪽 구독은 살아 있어 더 위험하다).
  const { data: subBefore } = await sb.from('subscriptions').select('*').eq('workspace_id', ws.id).maybeSingle()
  const balance = async () => {
    const { data } = await sb.from('take_ledger').select('delta').eq('workspace_id', ws.id)
    return (data ?? []).reduce((s, r) => s + r.delta, 0)
  }

  console.log(`결제 전 구간 검사 — ${opt.base}`)
  console.log(`  워크스페이스 ${ws.id.slice(0, 8)}… · 플랜 ${planBefore} · 시작 잔액 ${await balance()}\n`)

  // 진짜 시크릿으로 서명한다 — 웹훅 입장에서 Paddle 이 보낸 것과 구분되지 않는다.
  async function sendWebhook(event) {
    const body = JSON.stringify(event)
    const ts = Math.floor(Date.now() / 1000)
    const h1 = createHmac('sha256', secret).update(`${ts}:${body}`).digest('hex')
    const res = await fetch(`${opt.base}/api/billing/paddle/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Paddle-Signature': `ts=${ts};h1=${h1}` },
      body,
    })
    return { status: res.status, body: await res.json().catch(() => ({})) }
  }

  const now = new Date().toISOString()
  const packTxn = `txn_${RUN}_pack`
  const packEvent = {
    event_id: `evt_${RUN}_pack`,
    event_type: 'transaction.completed',
    occurred_at: now,
    data: {
      id: packTxn,
      status: 'completed',
      origin: 'web',
      subscription_id: null,
      custom_data: { workspace_id: ws.id },
      items: [{ price: { id: e.NEXT_PUBLIC_PADDLE_PRICE_PACK_MINI }, quantity: 1 }],
      details: { totals: { total: '2900', currency_code: 'USD' } },
      billing_period: null,
      billed_at: now,
    },
  }

  // ① 팩 결제 → 적립 50
  const before1 = await balance()
  const r1 = await sendWebhook(packEvent)
  await sleep(1500)
  const after1 = await balance()
  const { data: packRow } = await sb.from('take_ledger').select('kind, delta, expires_at').eq('ref_id', packTxn).maybeSingle()
  const expMonths = packRow?.expires_at
    ? Math.round((new Date(packRow.expires_at) - new Date(now)) / (1000 * 60 * 60 * 24 * 30.4))
    : 0
  check(
    '팩 결제 알림을 보내면 2분 안에 Take 50개가 12개월 유효로 들어간다',
    r1.status === 200 && after1 - before1 === 50 && packRow?.kind === 'grant_purchase' && expMonths === 12,
    `HTTP ${r1.status}, 잔액 ${before1}→${after1}, ${packRow?.kind} 만료 ${expMonths}개월`,
    '결제창 → Paddle → 웹훅 → DB 이음새. 이게 깨지면 "결제했는데 크레딧이 안 들어옴"',
  )

  // ② 같은 알림 재전송 → 적립 1회
  const r2 = await sendWebhook(packEvent)
  await sleep(1200)
  const after2 = await balance()
  check(
    '같은 알림을 다시 보내도 Take는 한 번만 들어간다',
    r2.status === 200 && after2 === after1,
    `HTTP ${r2.status}, 잔액 ${after1}→${after2}`,
    'Paddle 재전송은 정상 운영에서 반드시 일어난다(라이브 60회/3일)',
  )

  // ③ 구독 결제 → 플랜 세팅 + 포함 Take
  const subTxn = `txn_${RUN}_sub`
  const periodEnd = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString()
  const r3 = await sendWebhook({
    event_id: `evt_${RUN}_sub`,
    event_type: 'transaction.completed',
    occurred_at: now,
    data: {
      id: subTxn,
      status: 'completed',
      origin: 'web',
      subscription_id: `sub_${RUN}`,
      custom_data: { workspace_id: ws.id },
      items: [{ price: { id: e.NEXT_PUBLIC_PADDLE_PRICE_PLAN_S2 }, quantity: 1 }],
      details: { totals: { total: '3000', currency_code: 'USD' } },
      billing_period: { starts_at: now, ends_at: periodEnd },
      billed_at: now,
    },
  })
  await sleep(1500)
  const after3 = await balance()
  const { data: wsAfter } = await sb.from('workspaces').select('plan').eq('id', ws.id).maybeSingle()
  const { data: subRow } = await sb.from('take_ledger').select('kind, delta, expires_at').eq('ref_id', subTxn).maybeSingle()
  const endsMatch = subRow?.expires_at && Math.abs(new Date(subRow.expires_at) - new Date(periodEnd)) < 60_000
  check(
    '구독 결제 알림을 보내면 플랜이 바뀌고 포함 Take가 결제 주기 끝까지 유효로 들어간다',
    r3.status === 200 && wsAfter?.plan === 's2' && after3 - after2 === 30 && endsMatch,
    `HTTP ${r3.status}, 플랜 ${planBefore}→${wsAfter?.plan}, 잔액 ${after2}→${after3}, 만료 주기끝 일치 ${endsMatch}`,
    '팩과 구독은 웹훅 코드 경로가 다르다(플랜 세팅·구독 행·만료일 계산). 팩만 돌면 구독 쪽은 한 줄도 안 지나간다',
  )

  // ④ 영상 생성 1회 → hold
  let jobId = null
  let page = null
  if (opt.generate && project && shot) {
    // 실제 생성 라우트를 부른다. 로그인 세션이 필요해 브라우저 안에서 호출한다.
    //   2026-09-08: 러프 스토리보드가 없어 422 로 막혔던 것을 러프를 만들어 풀었다(dev media 버킷도 이때 만들었다).
    //   1회 약 $0.31 이 실제로 나간다.
    let status
    try {
      status = orca(['status', '--json'])
    } catch {
      status = null
    }
    if (!status?.app?.running || status?.runtime?.state !== 'ready') {
      console.log('  skip  영상 생성 — Orca 가 안 떠 있다(로그인 세션을 못 만든다)')
    } else {
      const { profiles } = orca(['tab', 'profile', 'list', '--json'])
      const profileId = profiles.find((p) => p.label === 'tale-smoke')?.id
      if (!profileId) {
        console.log('  skip  영상 생성 — tale-smoke 프로필이 없다. 먼저 pnpm smoke:billing 을 한 번 돌려라')
      } else {
        const { browserPageId } = orca(['tab', 'create', '--url', `${opt.base}/account`, '--profile', profileId, '--json'])
        page = browserPageId
        await sleep(4000)

        const before4 = await balance()
        const gen = fetchInPage(page, {
          method: 'POST',
          path: '/api/director/generate-previz-video',
          body: { projectId: project.id, writerShotId: shot.shot_id },
        })
        jobId = gen.body?.jobId ?? null
        await sleep(2000)
        const after4 = await balance()
        const { data: holdRow } = jobId
          ? await sb.from('take_ledger').select('kind, delta').eq('ref_id', jobId).maybeSingle()
          : { data: null }
        check(
          '영상 생성을 요청하면 잡아두기 행이 생기고 잔액이 그만큼 준다',
          gen.status === 200 && !!jobId && holdRow?.kind === 'hold' && before4 - after4 === Math.abs(holdRow?.delta ?? 0),
          `HTTP ${gen.status}, job ${jobId?.slice(0, 8) ?? '없음'}, ${holdRow?.kind} ${holdRow?.delta}, 잔액 ${before4}→${after4}`,
          '결제와 생성이 같은 장부를 보는지. "결제는 됐는데 생성이 못 쓴다" 를 잡는다',
        )

        // 생성이 끝날 때까지 기다린다. 성공하면 hold 가 그대로 확정(차감), 실패하면 반환된다.
        let jobState = 'unknown'
        for (let i = 0; i < 20; i++) {
          await sleep(15_000)
          const { data: j } = await sb.from('generation_jobs').select('status').eq('id', jobId).maybeSingle()
          jobState = j?.status ?? 'unknown'
          if (jobState === 'completed' || jobState === 'succeeded' || jobState === 'failed') break
        }
        const after5 = await balance()
        check(
          '생성이 끝나면 성공은 차감된 채로, 실패는 되돌려진 채로 장부가 맞는다',
          (['completed', 'succeeded'].includes(jobState) && after5 === after4) ||
            (jobState === 'failed' && after5 === before4),
          `잡 ${jobState}, 잔액 ${after4}→${after5}(생성 전 ${before4})`,
          '성공했는데 반환되면 공짜 생성, 실패했는데 안 돌아오면 환불 문의',
        )
      }
    }
  } else if (opt.generate) {
    console.log('  skip  영상 생성 — 스모크 계정에 프로젝트나 샷이 없다')
  }

  // ⑤ 정리 — 스모크가 만든 것을 전부 지우고 플랜을 되돌린다
  await sb.from('take_ledger').delete().like('ref_id', `txn_${RUN}_%`)
  // 생성 hold 는 지우지 않는다 — 실제로 영상을 만들었으니 그 차감은 진짜다(지우면 공짜 생성이 된다).
  if (page) {
    try {
      orca(['tab', 'close', '--page', page], { raw: true })
    } catch {
      /* 이미 닫혔으면 무시 */
    }
  }
  await sb.from('billing_events').delete().like('mor_event_id', `evt_${RUN}_%`)
  if (subBefore) {
    await sb.from('subscriptions').upsert({ ...subBefore, updated_at: new Date().toISOString() }, { onConflict: 'workspace_id' })
  } else {
    await sb.from('subscriptions').delete().eq('workspace_id', ws.id).eq('mor_subscription_id', `sub_${RUN}`)
  }
  await sb.from('workspaces').update({ plan: planBefore }).eq('id', ws.id)
  const final = await balance()
  const { data: wsFinal } = await sb.from('workspaces').select('plan').eq('id', ws.id).maybeSingle()
  const { data: subFinal } = await sb.from('subscriptions').select('mor_subscription_id, plan').eq('workspace_id', ws.id).maybeSingle()
  const subRestored = subBefore ? subFinal?.mor_subscription_id === subBefore.mor_subscription_id : !subFinal
  check(
    '스모크가 만든 적립·구독·플랜 변경은 끝나면 정리되고 원래 구독이 그대로 돌아온다',
    final <= before1 && wsFinal?.plan === planBefore && subRestored,
    `잔액 ${before1}→${final}(생성분은 빠진 채가 정상), 플랜 ${wsFinal?.plan}, 구독 ${subFinal?.mor_subscription_id ?? '없음'}(원래 ${subBefore?.mor_subscription_id ?? '없음'})`,
    '스모크가 진짜 구독 행을 덮어쓴 채 지우면 Paddle 에는 구독이 있는데 우리 DB 에는 없는 상태가 된다',
  )

  const failed = results.filter((r) => !r.ok)
  console.log(`\n${failed.length === 0 ? '전부 통과' : '실패 있음'} — 통과 ${results.length - failed.length} / 검사 ${results.length}`)
  if (failed.length > 0) {
    console.log('\n실패한 검사와 그때의 장부:')
    console.log(`  잔액 ${await balance()} · 플랜 ${wsFinal?.plan}`)
  }
  return failed.length === 0 ? 0 : 1
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error('[내부 오류]', err.message)
    process.exit(2)
  })
