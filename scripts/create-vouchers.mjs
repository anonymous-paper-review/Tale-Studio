// create-vouchers.mjs — 바우처 코드를 만들어 vouchers 표에 넣고 목록을 CSV 로 남긴다(2026-10-27 오너).
//
// 용도: 아이디 · 비밀번호 테스트 계정 대신 코드를 나눠 준다. 받은 사람은 구글로 로그인해 계정 화면에 코드를 넣는다.
//   - 기본은 개발 DB(NEXT_PUBLIC_SUPABASE_URL · SUPABASE_SERVICE_ROLE_KEY). --live 를 줄 때만 운영 DB(SUPABASE_LIVE_*)에 넣는다.
//   - 코드 목록은 --out 파일에만 쓴다(화면에 찍지 않는다). 이 파일이 나눠 줄 원본이다 — 저장소에 넣지 않는다.
//   - 코드는 TALE + 8자(헷갈리는 0 · O · 1 · I · L 뺌, 약 40비트). 저장은 하이픈 없이, CSV 에는 TALE-XXXX-XXXX 로.
//   - --uses 는 코드 하나를 쓸 수 있는 계정 수(1~1000, 안 주면 1). 여러 사람에게 같은 코드를 나눠 줄 때 쓴다(2026-10-29 오너).
//   약속: tests/billing/voucher.test.ts
//
// 사용:
//   node scripts/create-vouchers.mjs --plan s2 --count 45 --out ~/Downloads/vouchers-s2.csv [--uses 1] [--note "10월 테스터"] [--live]
import { randomInt } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

export const VOUCHER_PLANS = ['s1', 's2', 's5', 's10', 'p10', 'p15', 'p20', 'p25', 'p30']
export const MAX_VOUCHERS = 100
export const MAX_VOUCHER_USES = 1000
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'
const PREFIX = 'TALE'

/** 저장 모양 코드(하이픈 없음): TALE + 8자. */
export function generateVoucherCode() {
  let body = ''
  for (let i = 0; i < 8; i++) body += ALPHABET[randomInt(ALPHABET.length)]
  return `${PREFIX}${body}`
}

/** 나눠 줄 모양: TALE-XXXX-XXXX. */
export function formatVoucherCode(code) {
  const body = code.slice(PREFIX.length)
  return `${PREFIX}-${body.slice(0, 4)}-${body.slice(4)}`
}

/** --plan(유료 요금제) · --count(1~100) · --out 은 필수, --uses(1~1000)는 안 주면 1. 틀리면 던진다. */
export function parseVoucherArgs(argv) {
  const args = Array.isArray(argv) ? argv : []
  const value = (name) => {
    const i = args.indexOf(name)
    return i >= 0 ? args[i + 1] : undefined
  }
  const plan = value('--plan')
  if (!VOUCHER_PLANS.includes(plan)) throw new Error(`--plan 은 ${VOUCHER_PLANS.join(' · ')} 중 하나여야 합니다 (받은 값: ${JSON.stringify(plan)})`)
  const count = Number(value('--count'))
  if (!Number.isInteger(count) || count < 1 || count > MAX_VOUCHERS) {
    throw new Error(`--count 는 1~${MAX_VOUCHERS} 사이 정수여야 합니다 (받은 값: ${JSON.stringify(value('--count'))})`)
  }
  const out = value('--out')
  if (!out) throw new Error('--out <CSV 파일 경로> 가 필요합니다')
  const usesText = value('--uses')
  const uses = usesText === undefined ? 1 : Number(usesText)
  if (!Number.isInteger(uses) || uses < 1 || uses > MAX_VOUCHER_USES) {
    throw new Error(`--uses 는 1~${MAX_VOUCHER_USES} 사이 정수여야 합니다 (받은 값: ${JSON.stringify(usesText)})`)
  }
  return { plan, count, out, uses, note: value('--note') ?? null, live: args.includes('--live') }
}

async function main() {
  let options
  try {
    options = parseVoucherArgs(process.argv.slice(2))
  } catch (err) {
    console.error(`✗ ${err instanceof Error ? err.message : String(err)}`)
    process.exit(1)
  }
  dotenv.config({ path: '.env.local', quiet: true })
  const url = options.live ? process.env.SUPABASE_LIVE_URL : process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = options.live ? process.env.SUPABASE_LIVE_SERVICE_ROLE_KEY : process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error(`✗ .env.local 에 ${options.live ? 'SUPABASE_LIVE_URL · SUPABASE_LIVE_SERVICE_ROLE_KEY' : 'NEXT_PUBLIC_SUPABASE_URL · SUPABASE_SERVICE_ROLE_KEY'} 가 없습니다`)
    process.exit(1)
  }
  const projectRef = url.match(/https?:\/\/([a-z0-9-]+)\.supabase\.co/i)?.[1] ?? url
  const db = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })

  const codes = new Set()
  while (codes.size < options.count) codes.add(generateVoucherCode())
  const rows = [...codes].map((code) => ({ code, plan: options.plan, max_uses: options.uses, note: options.note }))
  // 한 번에 넣는다. 이미 있는 코드와 겹치면(확률 사실상 0) 전부 실패하니 다시 돌리면 된다.
  const { error } = await db.from('vouchers').insert(rows)
  if (error) {
    console.error(`✗ 코드를 넣지 못했습니다: ${error.message}`)
    process.exit(1)
  }
  const csv = ['\uFEFF코드,요금제,쓸 수 있는 계정 수,메모', ...rows.map((r) => `${formatVoucherCode(r.code)},${r.plan},${r.max_uses},${r.note ?? ''}`)].join('\n')
  writeFileSync(options.out, `${csv}\n`, 'utf8')
  console.log(`✓ ${projectRef} 에 ${options.plan} 코드 ${rows.length}개(코드마다 ${options.uses}명)를 넣었습니다 → ${options.out}`)
}

const isDirectRun = typeof process.argv[1] === 'string' && import.meta.url === pathToFileURL(process.argv[1]).href
if (isDirectRun) {
  main()
}
