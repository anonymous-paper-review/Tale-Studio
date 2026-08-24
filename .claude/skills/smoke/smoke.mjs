// smoke.mjs — 브라우저에서만 드러나는 "사실"을 수집한다. 판정은 하지 않는다.
//
// 헌법(CLAUDE.md): 산출물 판정은 오너만 한다. 이 스크립트는 "좋다/나쁘다"를 출력하지 않는다.
//   출력하는 것은 렌더 여부·콘솔 에러·최종 URL·스크린샷 경로 — 오너가 판정할 재료다.
//   그래서 ok 통과는 "완료"가 아니라 "오너가 볼 재료가 준비됨"이다.
//
// 왜 필요한가 (2026-08-17 실측): tests/ 130개는 전부 vitest 라 브라우저를 못 연다.
//   "라우트가 403 뱉나"는 잠겨 있지만 "화면이 뜨긴 하나"는 커버 0% 였고 전부 사람 손으로 갔다.
//
// 사용 — 인터페이스를 `pnpm test` 와 맞췄다:
//   pnpm smoke                                  # targets.json 전부 (훅·밤 러너·CI 가 부르는 형태)
//   pnpm smoke /login --expect "로그인"          # 단건 (개발 중 손으로)
//   pnpm smoke / --click e4 --expect "이메일"    # 진입 후 클릭까지 따라가기
//   pnpm smoke /studio --tree                    # 접근성 트리 전체 (--click 에 쓸 ref 찾기)
//
// 종료 코드: 0 = 전부 ok 또는 전제 미충족 skip / 1 = 하나라도 실패 / 2 = 사용법·내부 오류
//   전제(Orca) 미충족은 실패가 아니라 skip 이다. 실패로 만들면 밤 자동화가 조용히 깨진다.
//
// 실측으로 확정된 제약 3가지 — 고치기 전에 반드시 읽을 것:
//   1) URL 은 증거가 아니다. history.pushState 로 location.pathname 이 /pricing 이 되어도
//      렌더된 DOM 은 로그인 폼 그대로였다. 그래서 ok 판정은 expect(스냅샷 텍스트)로만 한다.
//   2) 에러 수집기는 full load 로 리셋된다. goto 직후 설치하므로 진입 페이지의 hydration 에러는
//      못 잡는다. 반면 in-app 링크 클릭은 JS 월드를 보존하므로 --click 이후 에러는 전부 잡힌다
//      (/ → /login 이동에서 수집기 생존 확인).
//   3) orca screenshot 은 base64 를 stdout 으로 준다. 절대 그대로 흘리지 말 것 —
//      에이전트 컨텍스트를 수십만 토큰 단위로 오염시킨다. 파일로 쓰고 경로만 출력한다.
import { execFileSync, spawn } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ORCA = process.env.ORCA_CLI_COMMAND || 'orca'
const DEFAULT_BASE = 'http://localhost:3000'
const DEFAULT_PROFILE = 'tale-smoke'

/** 인자 파싱. 경로가 없으면 targets 모드. 반복 플래그(--expect/--click)는 배열로 모은다. */
export function parseArgs(argv) {
  const out = {
    path: null,
    base: null,
    profile: DEFAULT_PROFILE,
    expect: [],
    click: [],
    wait: 3000,
    shot: null,
    keep: false,
    json: false,
    tree: false,
    noServe: false,
    auth: false,
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--auth') out.auth = true
    else if (a === '--keep') out.keep = true
    else if (a === '--json') out.json = true
    else if (a === '--tree') out.tree = true
    else if (a === '--no-serve') out.noServe = true
    else if (a === '--expect') out.expect.push(argv[++i])
    else if (a === '--click') out.click.push(argv[++i])
    else if (a === '--base') out.base = argv[++i]
    else if (a === '--profile') out.profile = argv[++i]
    else if (a === '--shot') out.shot = argv[++i]
    else if (a === '--wait') out.wait = Number(argv[++i])
    else if (a.startsWith('--')) throw new Error(`알 수 없는 플래그: ${a}`)
    else if (out.path === null) out.path = a
    else throw new Error(`경로 인자가 둘 이상이다: ${a}`)
  }
  if (out.path && !out.path.startsWith('/')) out.path = '/' + out.path
  if (!Number.isFinite(out.wait) || out.wait < 0) throw new Error('--wait 는 0 이상의 밀리초')
  return out
}

/** 경로 → 파일명 조각 (`/` → `root`, `/a/b` → `a-b`). */
export function slug(path) {
  const s = path.replace(/^\/+|\/+$/g, '').replace(/[^\w가-힣]+/g, '-')
  return s || 'root'
}

function orca(args, { raw = false } = {}) {
  const stdout = execFileSync(ORCA, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  if (raw) return stdout
  const parsed = JSON.parse(stdout)
  if (!parsed.ok) throw new Error(`orca ${args[0]} 실패: ${stdout.slice(0, 200)}`)
  return parsed.result
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function ping(base) {
  try {
    await fetch(base, { signal: AbortSignal.timeout(2000) })
    return true
  } catch {
    return false
  }
}

/** 페이지 안에 설치할 수집기. console.error / 미처리 예외 / rejection 3종을 모은다. */
const COLLECTOR = `window.__smokeErrors=[];
addEventListener('error',e=>__smokeErrors.push('error: '+e.message));
addEventListener('unhandledrejection',e=>__smokeErrors.push('reject: '+String(e.reason)));
const _e=console.error;console.error=(...a)=>{__smokeErrors.push('console: '+a.map(String).join(' '));_e(...a)};
'installed'`

/** 지정 라벨의 브라우저 프로파일 id. 없으면 isolated 로 만든다. */
function ensureProfile(label) {
  const { profiles } = orca(['tab', 'profile', 'list', '--json'])
  const hit = profiles.find((p) => p.label === label || p.id === label)
  if (hit) return hit.id
  // isolated: Orca 의 default 프로파일에는 오너의 Comet 세션이 임포트돼 있다.
  //   에이전트가 도는 탭에 개인 로그인이 붙지 않도록 반드시 격리한다.
  return orca(['tab', 'profile', 'create', '--label', label, '--scope', 'isolated', '--json']).profile.id
}

/** dev 서버가 없으면 띄운다. 우리가 띄웠으면 stop() 으로 정리한다. */
async function ensureDevServer(base, { allowSpawn }) {
  if (await ping(base)) return { spawned: false, stop() {} }
  if (!allowSpawn) return null
  // detached: next dev 가 자식 프로세스를 낳으므로 프로세스 그룹째 죽여야 좀비가 안 남는다.
  const child = spawn('pnpm', ['dev'], { cwd: process.cwd(), stdio: 'ignore', detached: true })
  child.unref()
  for (let i = 0; i < 60; i++) {
    await sleep(1000)
    if (await ping(base)) {
      return {
        spawned: true,
        stop() {
          try {
            process.kill(-child.pid, 'SIGTERM')
          } catch {
            /* 이미 죽었으면 무시 */
          }
        },
      }
    }
  }
  try {
    process.kill(-child.pid, 'SIGTERM')
  } catch {
    /* noop */
  }
  return null
}

/** .env.local 을 의존성 없이 읽는다. 값은 절대 로그로 흘리지 않는다. */
function loadEnvLocal() {
  let raw
  try {
    raw = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8')
  } catch {
    return {}
  }
  const env = {}
  for (const line of raw.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
    if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
  }
  return env
}

/**
 * 스냅샷에서 `- form` 하위 블록만 잘라낸다 (들여쓰기 기준). form 이 없으면 전체를 돌려준다.
 *   폼 밖의 요소(토스트 region, "Open Next.js Dev Tools" 버튼 등)가 순서 가정을 깨는 걸 막는다 —
 *   실측에서 dev tools 버튼이 로그인 버튼 뒤에 붙었다 안 붙었다 했다.
 */
function formBlock(snapshot) {
  const lines = snapshot.split('\n')
  const start = lines.findIndex((l) => /^\s*-\s+form\b/.test(l))
  if (start === -1) return snapshot
  const indent = lines[start].search(/\S/)
  const out = [lines[start]]
  for (let i = start + 1; i < lines.length; i++) {
    if (lines[i].trim() && lines[i].search(/\S/) <= indent) break
    out.push(lines[i])
  }
  return out.join('\n')
}

/**
 * `- textbox "Email" [ref=e3]` 같은 줄에서 해당 role 의 ref 를 나온 순서대로 모은다.
 *   문구가 아니라 역할로 찾는 이유 (#smoke-auth-labels 2026-08-24): 예전엔 라벨 문자열
 *   ('이메일'/'비밀번호'/'로그인')로 찾았는데, 도입 다음 날 26cd18a(i18n 배치1)가 로그인 폼을
 *   영어로 고정하면서 --auth 가 통째로 죽었고 6일간 아무도 못 돌렸다. 역할은 번역되지 않는다.
 */
function refsByRole(block, role) {
  const re = new RegExp(`(?:^|\\n)\\s*-\\s+${role}\\b[^\\n]*\\[ref=(e\\d+)`, 'g')
  return [...block.matchAll(re)].map((m) => m[1])
}

/**
 * 로그인 세션을 확보한다. 이미 로그인돼 있으면 아무것도 하지 않는다.
 * 자격증명은 .env.local 의 TALE_SMOKE_EMAIL / TALE_SMOKE_PASSWORD 를 쓴다 —
 *   표준 프로바이더 이름을 쓰면 다른 하네스가 오인 수집해 과금 사고가 난 전례가 있어 TALE_ 접두로 고정.
 *   seed-test-accounts.mjs 로 만든 계정이며 비밀번호는 해시로만 저장돼 재조회가 불가능하다.
 */
async function ensureLoggedIn(base, profileId, wait) {
  const env = loadEnvLocal()
  const email = process.env.TALE_SMOKE_EMAIL || env.TALE_SMOKE_EMAIL
  const password = process.env.TALE_SMOKE_PASSWORD || env.TALE_SMOKE_PASSWORD
  if (!email || !password) {
    return { ok: false, reason: '.env.local 에 TALE_SMOKE_EMAIL / TALE_SMOKE_PASSWORD 가 없다.' }
  }

  const { browserPageId: page } = orca(['tab', 'create', '--url', base + '/projects', '--profile', profileId, '--json'])
  try {
    await sleep(wait)
    const where = () =>
      JSON.parse(orca(['eval', '--page', page, '--expression', 'JSON.stringify(location.pathname)'], { raw: true }).trim())
    if (!where().startsWith('/login')) return { ok: true, reason: '기존 세션 재사용' }

    const snap = orca(['snapshot', '--page', page], { raw: true })
    // 라벨 문구가 아니라 폼 안의 역할·순서로 잡는다 (refsByRole 주석 참고).
    const block = formBlock(snap)
    const boxes = refsByRole(block, 'textbox')
    const btns = refsByRole(block, 'button')
    if (boxes.length !== 2 || btns.length < 1) {
      return {
        ok: false,
        reason: `로그인 폼 모양이 바뀌었다 (textbox=${boxes.length} button=${btns.length}, 기대: 2/1+). smoke.mjs 의 폼 가정을 갱신해라.`,
      }
    }
    const [emailRef, pwRef] = boxes
    const btnRef = btns[0]
    orca(['fill', '--page', page, '--element', emailRef, '--value', email], { raw: true })
    orca(['fill', '--page', page, '--element', pwRef, '--value', password], { raw: true })
    orca(['click', '--page', page, '--element', btnRef], { raw: true })
    await sleep(wait * 2)

    if (where().startsWith('/login')) {
      return { ok: false, reason: '로그인 제출 후에도 /login 에 머물렀다 (자격증명 또는 폼 변경 확인).' }
    }
    return { ok: true, reason: '새로 로그인함' }
  } finally {
    try {
      orca(['tab', 'close', '--page', page], { raw: true })
    } catch {
      /* noop */
    }
  }
}

/** 화면 하나를 확인한다. 판정하지 않고 사실만 담아 돌려준다. */
async function checkOne(target, opt, profileId) {
  const { path, expect = [], click = [] } = target
  const url = (opt.base || DEFAULT_BASE) + path
  const { browserPageId: page } = orca(['tab', 'create', '--url', url, '--profile', profileId, '--json'])
  // 상태 코드는 브라우저 탭에서 못 얻는다. 별도로 확인해야 404 를 놓치지 않는다 —
  //   실제로 /docs 는 미들웨어가 공개 경로로 허용하는데 렌더는 404 페이지였고,
  //   expect 가 없으면 "렌더됨"만 보고 ok 로 통과해버렸다 (2026-08-17).
  let httpStatus = null
  try {
    httpStatus = (await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(10000) })).status
  } catch {
    /* 상태를 못 얻어도 렌더 확인은 계속한다 */
  }

  const result = {
    ok: false,
    path,
    httpStatus,
    finalUrl: null,
    title: null,
    rendered: false,
    expects: [],
    consoleErrors: [],
    clicked: [],
    screenshot: null,
    snapshotLines: 0,
    tree: '',
  }
  try {
    await sleep(opt.wait)
    orca(['eval', '--page', page, '--expression', COLLECTOR], { raw: true })

    // ref(e1, e2...)는 스냅샷이 등록하므로 클릭 전에 반드시 한 번 떠야 한다.
    if (click.length) orca(['snapshot', '--page', page], { raw: true })
    for (const ref of click) {
      orca(['click', '--page', page, '--element', ref], { raw: true })
      result.clicked.push(ref)
      await sleep(opt.wait)
      orca(['snapshot', '--page', page], { raw: true }) // 이동 후 새 ref 등록
    }

    const where = JSON.parse(
      orca(
        ['eval', '--page', page, '--expression', 'JSON.stringify({u:location.pathname+location.search,t:document.title})'],
        { raw: true },
      ).trim(),
    )
    result.finalUrl = where.u
    result.title = where.t

    // 앞 두 줄은 `page: <id>` 와 `undefined — undefined` 헤더라 내용이 아니다.
    const body = orca(['snapshot', '--page', page], { raw: true }).split('\n').slice(2).join('\n')
    result.tree = body
    result.snapshotLines = body.split('\n').filter((l) => l.trim()).length
    result.rendered = result.snapshotLines > 0
    result.expects = expect.map((text) => ({ text, found: body.includes(text) }))

    result.consoleErrors = JSON.parse(
      orca(['eval', '--page', page, '--expression', 'JSON.stringify(window.__smokeErrors||[])'], { raw: true }).trim(),
    )

    // Next dev 배지는 뷰포트를 가려 오너의 시각 판정을 방해한다. 찍기 직전에만 걷어낸다.
    orca(['eval', '--page', page, '--expression', "document.querySelector('nextjs-portal')?.remove();'ok'"], { raw: true })
    // 같은 진입 경로라도 클릭 체인이 다르면 도착 화면이 다르다 → 파일명에 클릭을 섞어 덮어쓰기를 막는다.
    // 파일명에 프로파일과 클릭 체인을 함께 넣는다 — 둘 다 도착 화면을 바꾼다.
    //   실측 사고(2026-08-17): 공개 스위트와 --auth 스위트가 같은 /studio/producer 를 서로 다른
    //   화면(로그인 폼 / Meeting Room)으로 찍는데 파일명이 같아 나중 실행이 앞 실행을 덮었다.
    //   스냅샷은 Meeting Room 이라 보고하는데 오너가 여는 이미지는 로그인 폼이라 판정이 어긋난다.
    const shotPath = resolve(opt.shot || `.smoke/${opt.profile}/${[slug(path), ...click].join('-')}.png`)
    mkdirSync(dirname(shotPath), { recursive: true })
    writeFileSync(shotPath, Buffer.from(orca(['screenshot', '--page', page, '--format', 'png', '--json']).data, 'base64'))
    result.screenshot = shotPath
  } finally {
    if (!opt.keep) {
      try {
        orca(['tab', 'close', '--page', page], { raw: true })
      } catch {
        /* 탭 정리 실패는 결과를 뒤집지 않는다 */
      }
    }
  }

  // 세션 만료의 가짜 ok 방지: 로그인 모드인데 /login 에 있으면 무조건 실패다.
  //   이걸 안 걸면 만료 시 "로그인 폼이 렌더됐다"로 통과해버려 아무것도 확인 못 한 채 초록불이 된다.
  result.sessionExpired = Boolean(opt.auth) && String(result.finalUrl || '').startsWith('/login')

  // ok 는 "정상 응답이고, 렌더됐고, 기대 텍스트가 다 있고, 콘솔 에러가 없다"는 사실 진술일 뿐이다.
  result.ok =
    !result.sessionExpired &&
    (result.httpStatus === null || result.httpStatus < 400) &&
    result.rendered &&
    result.expects.every((e) => e.found) &&
    result.consoleErrors.length === 0
  return result
}

function report(r, opt) {
  console.log(
    `${r.ok ? 'ok    ' : 'NOT-ok'} ${r.path} → ${r.finalUrl}  HTTP ${r.httpStatus ?? '?'}  "${r.title}"  (${r.snapshotLines}줄)`,
  )
  if (r.sessionExpired) console.log('         ⚠ 세션 만료 — /login 으로 튕겼다. 확인된 것이 없다.')
  for (const e of r.expects) console.log(`         기대 "${e.text}": ${e.found ? '있음' : '없음'}`)
  if (r.consoleErrors.length) {
    console.log(`         콘솔 에러 ${r.consoleErrors.length}건:`)
    for (const e of r.consoleErrors.slice(0, 10)) console.log(`           - ${e.slice(0, 160)}`)
  }
  console.log(`         스크린샷: ${r.screenshot}`)
  // 실패했으면 "무엇이 대신 떠 있었나"를 바로 보여준다. ref(e1,e2..)는 --click 인자로 쓴다.
  if (opt.tree || !r.ok) {
    const lines = r.tree.split('\n').filter((l) => l.trim())
    console.log(`         --- 접근성 트리 (${opt.tree ? '전체' : `앞 25/${lines.length}줄`}) ---`)
    for (const l of opt.tree ? lines : lines.slice(0, 25)) console.log(`         ${l}`)
  }
}

async function main() {
  const opt = parseArgs(process.argv.slice(2))

  // --- targets 모드: 인자 없이 부르면 등록된 화면 전부. `pnpm test` 와 같은 인터페이스 ---
  if (opt.auth && opt.profile === DEFAULT_PROFILE) opt.profile = 'tale-auth'

  let targets
  if (opt.path) {
    targets = [{ path: opt.path, expect: opt.expect, click: opt.click }]
  } else {
    const cfg = JSON.parse(readFileSync(resolve(HERE, opt.auth ? 'targets.auth.json' : 'targets.json'), 'utf8'))
    targets = cfg.targets
    opt.base = opt.base || cfg.base || DEFAULT_BASE
  }
  opt.base = opt.base || DEFAULT_BASE

  // --- 전제 확인. 미충족은 실패가 아니라 skip 이다 (밤 자동화를 깨뜨리지 않기 위해) ---
  let status
  try {
    status = orca(['status', '--json'])
  } catch {
    console.log(`skip: orca CLI(${ORCA})를 실행할 수 없다 — 스모크를 건너뛴다.`)
    process.exit(0)
  }
  if (!status.app?.running || !status.runtime?.reachable) {
    console.log('skip: Orca 런타임이 안 떠 있다 — 스모크를 건너뛴다. (`orca open` 후 재실행)')
    process.exit(0)
  }

  const server = await ensureDevServer(opt.base, { allowSpawn: !opt.noServe })
  if (!server) {
    console.log(`skip: dev 서버(${opt.base})를 띄우지 못했다 — 스모크를 건너뛴다.`)
    process.exit(0)
  }
  if (server.spawned) console.log(`(dev 서버를 띄웠다 — 끝나면 정리한다)`)

  const results = []
  try {
    const profileId = ensureProfile(opt.profile)
    if (opt.auth) {
      const login = await ensureLoggedIn(opt.base, profileId, opt.wait)
      if (!login.ok) {
        console.error(`[로그인 실패] ${login.reason}`)
        process.exit(1)
      }
      console.log(`(로그인: ${login.reason})`)
    }
    for (const t of targets) results.push(await checkOne(t, opt, profileId))
  } finally {
    server.stop()
  }

  if (opt.json) {
    console.log(JSON.stringify(opt.tree ? results : results.map(({ tree, ...r }) => r), null, 2))
  } else {
    for (const r of results) report(r, opt)
    const bad = results.filter((r) => !r.ok).length
    console.log(`\n${results.length}개 중 ${results.length - bad}개 ok${bad ? `, ${bad}개 실패` : ''}.`)
    console.log('통과는 "완료"가 아니라 오너가 판정할 재료가 준비됐다는 뜻이다 — 스크린샷을 넘길 것.')
    console.log('note: 진입 페이지의 hydration 시점 에러는 수집 범위 밖이다. 서버측 예외는 dev 서버 로그를 볼 것.')
  }
  process.exit(results.some((r) => !r.ok) ? 1 : 0)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(`[오류] ${err.message}`)
    process.exit(2)
  })
}
