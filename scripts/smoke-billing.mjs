#!/usr/bin/env node
// smoke-billing.mjs — 결제 게이트 공짜 검사 8개를 배포된 서버에 돌린다 (#payments-phase-3 P10).
//
// 왜 브라우저 안에서 부르나: 우리 API 는 Supabase SSR 쿠키로 로그인을 본다. 그 쿠키는 브라우저가 만든다.
//   스크립트가 직접 만들려면 쿠키 인코딩을 흉내내야 하고, Supabase 가 그걸 바꾸면 조용히 깨진다.
//   그래서 smoke.mjs 와 같은 방식으로 Orca 프로필에 로그인한 뒤 그 페이지 안에서 fetch 한다.
//
// 목록과 판정은 src/lib/billing/smoke-checks.ts 하나만 안다 — 이 스크립트는 규칙을 다시 쓰지 않는다
//   (약속: tests/billing/smoke-checks.test.ts).
//
// 사용:
//   pnpm smoke:billing                       # 로컬(http://localhost:3000)
//   pnpm smoke:billing --base https://…      # dev 배포
//   종료 코드: 0 = 전부 통과 또는 전제 미충족 skip / 1 = 하나라도 실패 / 2 = 사용법·내부 오류

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { BILLING_SMOKE_CHECKS, judgeCheck, summarize } from '@/lib/billing/smoke-checks'

const ORCA = `${process.env.HOME}/.local/bin/orca`
const PROFILE_LABEL = 'tale-smoke'

function orca(args, { raw = false } = {}) {
  const stdout = execFileSync(ORCA, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  if (raw) return stdout
  const parsed = JSON.parse(stdout)
  if (!parsed.ok) throw new Error(`orca ${args[0]} 실패: ${stdout.slice(0, 200)}`)
  return parsed.result
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

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
  const out = { base: 'http://localhost:3000' }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--base') out.base = argv[++i]
  }
  return out
}

/** 페이지 안에서 fetch 한다. 로그인 쿠키는 브라우저가 붙인다. */
function fetchInPage(page, { method, path, body, anonymous }) {
  const expr = `(async () => {
    const opts = { method: ${JSON.stringify(method)}, headers: { 'Content-Type': 'application/json' } };
    ${body ? `opts.body = ${JSON.stringify(JSON.stringify(body))};` : ''}
    ${anonymous ? `opts.credentials = 'omit';` : ''}
    const r = await fetch(${JSON.stringify(path)}, opts);
    let b = null; try { b = await r.json() } catch { b = null }
    return JSON.stringify({ status: r.status, body: b });
  })()`
  const raw = orca(['eval', '--page', page, '--expression', expr], { raw: true }).trim()
  // orca eval 의 출력 모양이 버전마다 갈린다(문자열 그대로 / JSON 으로 한 번 감쌈). 둘 다 받는다.
  let value = raw
  try {
    value = JSON.parse(raw)
  } catch {
    /* 감싸지 않은 문자열 */
  }
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value)
    } catch {
      throw new Error(`eval 응답을 못 읽었다: ${raw.slice(0, 200)}`)
    }
  }
  return value
}

async function ensureLoggedIn(base, profileId) {
  const e = env()
  const { browserPageId: page } = orca(['tab', 'create', '--url', `${base}/account`, '--profile', profileId, '--json'])
  await sleep(3500)
  const where = () => JSON.parse(orca(['eval', '--page', page, '--expression', 'JSON.stringify(location.pathname)'], { raw: true }).trim())
  if (!where().startsWith('/login')) return page

  const snap = orca(['snapshot', '--page', page], { raw: true })
  const emailRef = snap.match(/\[ref=(e\d+)\][^\n]*(?:email|이메일)/i)?.[1] ?? snap.match(/textbox[^\n]*email[^\n]*\[ref=(e\d+)\]/i)?.[1]
  const pwRef = snap.match(/textbox[^\n]*(?:password|비밀번호)[^\n]*\[ref=(e\d+)\]/i)?.[1]
  if (!emailRef || !pwRef) throw new Error('로그인 폼을 못 찾았다 — 폼이 바뀌었는지 확인')
  orca(['fill', '--page', page, '--element', emailRef, '--value', e.TALE_SMOKE_EMAIL], { raw: true })
  orca(['fill', '--page', page, '--element', pwRef, '--value', e.TALE_SMOKE_PASSWORD], { raw: true })
  orca(['eval', '--page', page, '--expression', "document.querySelector('form')?.requestSubmit(); 'ok'"], { raw: true })
  await sleep(6000)
  if (where().startsWith('/login')) throw new Error('로그인 제출 후에도 /login 에 머물렀다')
  return page
}

async function main() {
  const opt = parseArgs(process.argv.slice(2))

  let status
  try {
    status = orca(['status', '--json'])
  } catch {
    console.log('[skip] Orca 가 없다 — 결제 스모크를 건너뛴다.')
    return 0
  }
  if (!status?.app?.running || status?.runtime?.state !== 'ready') {
    console.log('[skip] Orca 가 안 떠 있다 — 결제 스모크를 건너뛴다.')
    return 0
  }

  const { profiles } = orca(['tab', 'profile', 'list', '--json'])
  const profileId =
    profiles.find((p) => p.label === PROFILE_LABEL)?.id ??
    orca(['tab', 'profile', 'create', '--label', PROFILE_LABEL, '--scope', 'isolated', '--json']).profile.id

  const page = await ensureLoggedIn(opt.base, profileId)
  console.log(`결제 게이트 검사 — ${opt.base}\n`)

  // 계정 상태를 먼저 본다. onlyWhen 이 붙은 검사는 이 상태로 건너뛸지 정한다.
  const account = fetchInPage(page, { method: 'GET', path: '/api/billing/account' })
  const plan = account.body?.subscription?.plan ?? 'free'
  const packPurchased = Boolean(account.body?.packPurchasedBefore)
  const isFreeWithPurchase = plan === 'free' && packPurchased

  const results = []
  const skipped = []
  for (const check of BILLING_SMOKE_CHECKS) {
    if (check.onlyWhen === 'free-plan-with-purchase' && !isFreeWithPurchase) {
      skipped.push({ id: check.id, why: `계정이 ${plan}${packPurchased ? '' : ' · 구매 이력 없음'} — 이 판정은 무료+구매이력에서만 성립` })
      continue
    }
    const res = fetchInPage(page, check)
    const result = judgeCheck(check, res)
    results.push(result)
    console.log(`${result.ok ? '  ok  ' : '  실패'} ${result.title}`)
    if (!result.ok) console.log(`         받은 것: ${result.detail}\n         지키던 것: ${check.guards}`)
  }

  for (const s of skipped) console.log(`  skip  ${s.id} — ${s.why}`)

  const out = summarize(results)
  console.log(`\n${out.ok ? '전부 통과' : '실패 있음'} — 통과 ${out.passed} / 검사 ${results.length}${skipped.length ? ` / 건너뜀 ${skipped.length}` : ''}`)
  try {
    orca(['tab', 'close', '--page', page], { raw: true })
  } catch {
    /* 탭이 이미 닫혔으면 무시 */
  }
  return out.ok ? 0 : 1
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error('[내부 오류]', err.message)
    process.exit(2)
  })
