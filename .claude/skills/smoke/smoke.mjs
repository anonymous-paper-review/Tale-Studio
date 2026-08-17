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
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--keep') out.keep = true
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
    const shotPath = resolve(opt.shot || `.smoke/${[slug(path), ...click].join('-')}.png`)
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

  // ok 는 "정상 응답이고, 렌더됐고, 기대 텍스트가 다 있고, 콘솔 에러가 없다"는 사실 진술일 뿐이다.
  result.ok =
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
  let targets
  if (opt.path) {
    targets = [{ path: opt.path, expect: opt.expect, click: opt.click }]
  } else {
    const cfg = JSON.parse(readFileSync(resolve(HERE, 'targets.json'), 'utf8'))
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
