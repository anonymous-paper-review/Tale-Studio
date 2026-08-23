// seed-test-accounts.mjs — 테스트용 이메일/비밀번호 계정 시드 (service-role, 머신/서버 전용).
//
// 용도: Google OAuth 외에 이메일/비밀번호로 로그인할 수 있는 "테스트 계정"을 일괄 생성한다.
//   - service-role 키는 이 스크립트(및 서버 라우트)에서만 사용. 절대 클라이언트 번들로 가지 않는다
//     (NEXT_PUBLIC_ 접두 없는 SUPABASE_SERVICE_ROLE_KEY 라 Next 가 클라에 인라인하지 않음).
//   - admin.createUser({ email_confirm: true }) 로 즉시 확인 처리 → 메일 발송/확인 플로우 불필요.
//   - 비밀번호는 랜덤이며 Supabase 에 해시로만 저장되어 사후 조회 불가 → 생성 시 stdout 표가 유일 기록.
//   - 재실행은 누적(랜덤 local-part 라 충돌 사실상 0). 기존 계정은 조회/삭제하지 않는다.
//
// 사용:
//   node scripts/seed-test-accounts.mjs            # 기본 10개
//   node scripts/seed-test-accounts.mjs 20         # 위치 인자
//   node scripts/seed-test-accounts.mjs --count 5  # 플래그
//   npm run seed:test-accounts -- 20
import { randomBytes } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

export const EMAIL_DOMAIN = 'tale.studio'
export const DEFAULT_COUNT = 10
export const MAX_COUNT = 100

/** 랜덤 local-part: 'test-' + 8 hex (예: test-1a2b3c4d). 호출마다 상이. */
export function genLocalPart() {
  return `test-${randomBytes(4).toString('hex')}`
}

/** 완성 이메일: <local-part>@tale.studio */
export function genEmail() {
  return `${genLocalPart()}@${EMAIL_DOMAIN}`
}

/** 랜덤 비밀번호: 12바이트 base64url = 16자 (영문/숫자/-/_, 셸 안전, Supabase 기본 최소길이 충족). */
export function genPassword() {
  return randomBytes(12).toString('base64url')
}

/**
 * 생성 개수 파싱. process.argv.slice(2) 를 받는다.
 *   - 미지정: 기본 10
 *   - 위치 인자(첫 비-플래그) 또는 --count <n> / --count=<n>
 *   - 1 미만/정수 아님/NaN: 에러(throw)
 *   - 상한 100 클램프(오타로 인한 대량 생성·비번 폭증 방지)
 */
export function parseCount(argv) {
  const args = Array.isArray(argv) ? argv : []
  let raw
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === '--count') {
      raw = args[i + 1]
      break
    }
    if (typeof a === 'string' && a.startsWith('--count=')) {
      raw = a.slice('--count='.length)
      break
    }
  }
  // 위치 인자 count: 첫 인자가 '--' 플래그가 아닐 때만 (예: `seed.mjs 20`).
  //   '-5' 같은 단일-대시 토큰은 음수 count 후보로 받아 아래에서 거부한다.
  if (raw === undefined) {
    const first = args[0]
    if (typeof first === 'string' && !first.startsWith('--')) raw = first
  }
  if (raw === undefined || raw === '') return DEFAULT_COUNT
  const n = Number(raw)
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(`count 는 1 이상의 정수여야 합니다 (받은 값: ${JSON.stringify(raw)})`)
  }
  return Math.min(n, MAX_COUNT)
}

async function main() {
  dotenv.config({ path: '.env.local' })

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const missing = []
  if (!url) missing.push('NEXT_PUBLIC_SUPABASE_URL')
  if (!serviceKey) missing.push('SUPABASE_SERVICE_ROLE_KEY')
  if (missing.length > 0) {
    console.error(`✗ .env.local 에 다음 키가 없습니다: ${missing.join(', ')}`)
    process.exit(1)
  }

  let count
  try {
    count = parseCount(process.argv.slice(2))
  } catch (err) {
    console.error(`✗ ${err instanceof Error ? err.message : String(err)}`)
    process.exit(1)
  }

  const projectRef = url.match(/https?:\/\/([a-z0-9-]+)\.supabase\.co/i)?.[1] ?? url
  const supabase = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  console.log(`대상 Supabase 프로젝트: ${projectRef} · 생성 시도: ${count}개\n`)

  const results = []
  for (let i = 0; i < count; i++) {
    const email = genEmail()
    const password = genPassword()
    try {
      const { error } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      })
      results.push({ email, password, status: error ? `실패: ${error.message}` : 'ok' })
    } catch (err) {
      results.push({ email, password, status: `실패: ${err instanceof Error ? err.message : String(err)}` })
    }
  }

  console.table(results)

  const ok = results.filter((r) => r.status === 'ok').length
  const failed = results.length - ok
  console.log(`\n생성 성공 ${ok} / 실패 ${failed} / 대상 프로젝트 ${projectRef}`)
  console.log('⚠ 랜덤 비밀번호는 해시로만 저장되어 다시 조회할 수 없습니다 — 위 표를 지금 저장하세요.')

  if (failed > 0) process.exit(1)
}

// main-guard: 직접 실행(node scripts/seed-test-accounts.mjs)일 때만 main() 실행.
//   테스트가 순수 헬퍼를 import 할 때는 부작용(네트워크/생성) 없음.
const isDirectRun =
  typeof process.argv[1] === 'string' && import.meta.url === pathToFileURL(process.argv[1]).href
if (isDirectRun) {
  main()
}
