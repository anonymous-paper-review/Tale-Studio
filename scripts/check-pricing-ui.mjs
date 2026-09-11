// 가격표는 세 카드와 팝업 안 슬라이더로 비교하고, 구매 전에는 거래를 만들지 않는다.
// 실행: node scripts/check-pricing-ui.mjs --page <격리된 localhost 탭 UUID>
// 기존 smoke.mjs의 명시적 page·JSON·스크린샷 저장 패턴만 재사용한다. 탭/프로필/쿠키/로그인 조작 없음.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

const { values } = parseArgs({ options: { page: { type: 'string' }, help: { type: 'boolean' } } })
if (values.help) {
  console.log('사용법: node scripts/check-pricing-ui.mjs --page <격리된 localhost 탭 UUID>')
  process.exit(0)
}
assert.match(values.page ?? '', /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i, '--page UUID가 필요합니다.')
const page = values.page
const orcaCommand = process.env.ORCA_CLI_COMMAND || (process.env.ORCA_DEV_REPO_ROOT ? 'orca-dev' : process.platform === 'linux' ? 'orca-ide' : 'orca')
const shotDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '../.claude/docs/2026-09-09')

// catalog.ts + plan-limits.ts의 승인된 13개 옵션. [분량, 연결 프로젝트, 월 Take, 계정 수], export 여부.
const expected = {
  starter: [
    { id: 's1', name: 'Starter1', price: 15, allowances: [1, 1, 16, 1], export: false },
    { id: 's2', name: 'Starter2', price: 30, allowances: [2, 1, 30, 1], export: false },
    { id: 's5', name: 'Starter5', price: 60, allowances: [5, 1, 60, 1], export: false },
    { id: 's10', name: 'Starter10', price: 110, allowances: [10, 1, 100, 1], export: false },
  ],
  production: [
    { id: 'p10', name: 'Producer10', price: 199, allowances: [10, 2, 150, 3], export: true },
    { id: 'p15', name: 'Producer15', price: 449, allowances: [15, 3, 200, 4], export: true },
    { id: 'p20', name: 'Producer20', price: 649, allowances: [20, 3, 360, 5], export: true },
    { id: 'p25', name: 'Producer25', price: 999, allowances: [25, 4, 410, 6], export: true },
    { id: 'p30', name: 'Producer30', price: 1299, allowances: [30, 4, 710, 8], export: true },
  ],
  take: [
    { id: 'mini', name: 'Mini', price: 29, takes: 50 },
    { id: 'standard', name: 'Standard', price: 109, takes: 200 },
    { id: 'pro', name: 'Pro', price: 479, takes: 1000 },
    { id: 'studio', name: 'Studio', price: 2199, takes: 5000 },
  ],
}

function orca(args, json = true) {
  let raw
  try {
    raw = execFileSync(orcaCommand, [...args, '--page', page, ...(json ? ['--json'] : [])], {
      encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 30_000, stdio: ['ignore', 'pipe', 'pipe'],
    })
  } catch {
    // Screenshot stdout may contain megabytes of base64. Never expose failed command output.
    throw new Error(`Orca ${args[0]} 명령을 실행하지 못했습니다. 탭 연결과 CLI 상태를 확인하세요.`)
  }
  const parsed = JSON.parse(raw.trim())
  if (!json) return parsed
  assert.equal(parsed.ok, true, `Orca ${args[0]} 응답 실패`)
  return parsed.result
}

const initial = orca(['eval', '--expression', 'JSON.stringify({origin:location.origin,hostname:location.hostname,protocol:location.protocol})'], false)
assert.equal(initial.hostname, 'localhost', '지정한 탭이 localhost가 아닙니다. 다른 탭은 건드리지 않습니다.')
assert.ok(['http:', 'https:'].includes(initial.protocol), 'HTTP localhost 탭만 허용합니다.')
const origin = initial.origin

function evaluate(expression) {
  return orca(['eval', '--expression', `JSON.stringify((() => {
    if (location.origin !== ${JSON.stringify(origin)}) throw new Error('로컬 탭 범위를 벗어났습니다');
    return (${expression});
  })())`], false)
}

async function until(expression, promise) {
  const deadline = Date.now() + 20_000
  do {
    try {
      if (evaluate(expression)) return
    } catch {
      // 전체 이동 중 이전 JS 컨텍스트가 사라질 수 있다. 읽기만 다시 시도하며 기한 뒤 실패한다.
    }
    await new Promise(resolve => setTimeout(resolve, 250))
  } while (Date.now() < deadline)
  throw new Error(`기다림 실패: ${promise}`)
}

function snapshot() { return orca(['snapshot']) }
function restoreFetch() { evaluate('window.__talePricingRegression?.restore() ?? true') }
function guardCheckout() {
  evaluate(`(() => {
    if (window.__talePricingRegression) throw new Error('결제 감시기가 이미 있습니다');
    const original = window.fetch;
    const state = { count: 0, requests: [], restore() {
      if (window.fetch === guarded) window.fetch = original;
      delete window.__talePricingRegression;
      return true;
    }};
    async function guarded(input, init) {
      const url = new URL(input instanceof Request ? input.url : String(input), location.href);
      const method = String(init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
      if (url.pathname === '/api/billing/checkout' && method === 'POST') {
        state.count++;
        const body = input instanceof Request && !init?.body ? await input.clone().json() : JSON.parse(String(init?.body || '{}'));
        state.requests.push({ kind: body.kind, id: body.id });
        return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { 'content-type': 'application/json' } });
      }
      return original.call(this, input, init);
    }
    window.__talePricingRegression = state;
    window.fetch = guarded;
    return true;
  })()`)
}

async function goto(path, selector) {
  restoreFetch()
  assert.ok(path.startsWith('/') && !path.startsWith('//'), '내부 경로만 허용합니다.')
  orca(['goto', '--url', origin + path])
  await until(`location.pathname === ${JSON.stringify(path.split('?')[0])} && !!document.querySelector(${JSON.stringify(selector)})`, path)
  // Orca는 전체 이동 때 viewport를 원래 탭 크기로 되돌리므로 매번 화면 크기를 확정한다.
  orca(['exec', '--command', 'set viewport 1365 900'])
  await until('innerWidth === 1365 && innerHeight === 900', '데스크톱 화면 크기')
  snapshot()
  guardCheckout()
}

function screenshot(name) {
  const result = orca(['screenshot', '--format', 'png'])
  assert.equal(typeof result.data, 'string', '스크린샷 base64가 없습니다.')
  const bytes = Buffer.from(result.data, 'base64')
  assert.ok(bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), 'PNG가 아닌 스크린샷입니다.')
  mkdirSync(shotDirectory, { recursive: true })
  const path = resolve(shotDirectory, `pricing-regression-${name}.png`)
  writeFileSync(path, bytes)
  console.log(`화면: ${path}`)
}

const selected = `(() => {
  const dialog = document.querySelector('[role="dialog"]');
  const item = dialog?.querySelector('[data-selected-product]');
  const range = dialog?.querySelector('input[type="range"]');
  return {
    id: item?.dataset.selectedProduct, name: item?.textContent,
    price: Number(dialog?.querySelector('[data-selected-price]')?.textContent.replace(/[^0-9.]/g, '')),
    allowances: [...(dialog?.querySelectorAll('[data-selected-allowance]') || [])].map(el => Number(el.textContent)),
    export: !!dialog?.querySelector('dl .lucide-check'), exportDenied: !!dialog?.querySelector('dl .lucide-x'),
    quantity: Number(item?.parentElement.lastElementChild.textContent.match(/[0-9][0-9,]*/)?.[0].replaceAll(',', '')),
    text: dialog?.textContent || '', range: range?.value, max: range?.max,
    ranges: document.querySelectorAll('input[type="range"]').length,
    insideRanges: dialog?.querySelectorAll('input[type="range"]').length,
    checkoutPosts: window.__talePricingRegression?.count,
  };
})()`

async function select(index, id) {
  evaluate(`(() => {
    const input = document.querySelector('[role="dialog"] input[type="range"]');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(String(index))});
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`)
  await until(`document.querySelector('[data-selected-product]')?.dataset.selectedProduct === ${JSON.stringify(id)}`, `${id} 선택`)
  snapshot()
}

async function main() {
  await goto('/pricing', '[data-pricing-family]:not(:disabled)')
  assert.deepEqual(evaluate('[...document.querySelectorAll("[data-pricing-family]")].map(el => el.dataset.pricingFamily)'), Object.keys(expected))
  assert.equal(evaluate('document.querySelectorAll("input[type=range]").length'), 0)
  console.log('통과: 가격표에는 Starter·Producer·Take 카드 세 개만 있고 슬라이더는 팝업 안에서만 보인다.')
  screenshot('main')

  for (const [family, options] of Object.entries(expected)) {
    evaluate(`(() => { document.querySelector('[data-pricing-family="${family}"]').click(); return true; })()`)
    await until('!!document.querySelector("[role=dialog] input[type=range]")', `${family} 팝업`)
    const { refs } = snapshot()
    // DOM focus만으로는 백그라운드 WebContents에 키가 안 간다. 실제 클릭으로 입력 대상을 확정한다.
    const slider = Object.entries(refs).find(([, value]) => value.role === 'slider')?.[0]
    assert.ok(slider, '현재 화면에서 슬라이더를 찾지 못했습니다.')
    orca(['click', '--element', `@${slider}`])
    await select(0, options[0].id)
    // Actual browser key input, not a synthetic KeyboardEvent.
    orca(['keypress', '--key', 'ArrowRight'])
    await until(`document.querySelector('[data-selected-product]')?.dataset.selectedProduct === '${options[1].id}'`, `${family} 오른쪽 방향키`)
    snapshot()
    for (const [index, option] of options.entries()) {
      await select(index, option.id)
      const actual = evaluate(selected)
      assert.equal(actual.name, option.name)
      assert.equal(actual.price, option.price)
      assert.equal(actual.range, String(index))
      assert.equal(actual.max, String(options.length - 1))
      assert.equal(actual.ranges, 1)
      assert.equal(actual.insideRanges, 1)
      assert.equal(actual.checkoutPosts, 0, '선택만 했는데 결제 요청이 발생했습니다. 해당 요청은 가짜 401로 차단됐습니다.')
      if (option.allowances) {
        assert.deepEqual(actual.allowances, option.allowances)
        assert.equal(actual.export, option.export)
        assert.equal(actual.exportDenied, !option.export)
      } else {
        assert.equal(actual.quantity, option.takes)
        assert.match(actual.text, /12\s*(months|개월)/)
        assert.match(actual.text, /Your subscription does not change|구독 요금제는 바뀌지/)
      }
      console.log(`통과: ${option.name}의 가격과 혜택은 카탈로그와 같고, 선택만으로 결제하지 않는다.`)
      if (option.id === 's5') screenshot('s5')
      if (option.id === 'standard') screenshot('take')
    }
    orca(['keypress', '--key', 'Escape'])
    await until(`!document.querySelector('[role="dialog"]') && document.activeElement?.dataset.pricingFamily === '${family}'`, `${family} 닫기와 포커스 복귀`)
    snapshot()
    assert.equal(evaluate('document.querySelectorAll("input[type=range]").length'), 0)
    console.log(`통과: ${family} 팝업을 닫으면 열었던 카드로 키보드 포커스가 돌아간다.`)
  }

  for (const [kind, id] of [['plan', 's5'], ['pack', 'standard']]) {
    await goto(`/pricing?${kind}=${id}`, '[data-selected-product]')
    await until(`document.querySelector('[data-selected-product]')?.dataset.selectedProduct === '${id}'`, '선택 쿼리 복원')
    assert.equal(evaluate('window.__talePricingRegression.count'), 0)
    console.log(`통과: 주소의 ${kind}=${id} 선택을 복원해 같은 옵션을 보여준다.`)
  }

  await goto('/pricing?plan=s5', '[data-selected-product]')
  await until('document.querySelector("[data-selected-product]")?.dataset.selectedProduct === "s5"', 'S-5 구매 복귀 경로')
  const trace = evaluate(`(() => {
    const button = document.querySelector('[data-pricing-purchase]');
    if (!button || button.disabled) throw new Error('구매 버튼이 비활성입니다. 환경설정을 확인하세요');
    button.click();
    return { count: window.__talePricingRegression.count, requests: window.__talePricingRegression.requests };
  })()`)
  assert.equal(trace.count, 1)
  assert.deepEqual(trace.requests, [{ kind: 'plan', id: 's5' }])
  await until('location.pathname === "/login" && new URLSearchParams(location.search).get("next") === "/pricing?plan=s5"', '401 로그인 후 선택 주소 유지')
  snapshot()
  console.log('통과: 로그인이 필요하면 선택한 S-5 주소를 next에 보존한다. 구매 요청 한 건은 가짜 401이며 실제 거래는 만들지 않았다.')

  await goto('/pricing?plan=s5', '[data-selected-product]')
  orca(['exec', '--command', 'set viewport 390 844'])
  await until('innerWidth === 390 && innerHeight === 844', '모바일 화면 크기')
  const mobile = evaluate(`(() => {
    const dialog = document.querySelector('[role=dialog]');
    const bounds = dialog.getBoundingClientRect();
    return { left: bounds.left, right: bounds.right, top: bounds.top, bottom: bounds.bottom,
      overflow: document.documentElement.scrollWidth > innerWidth || dialog.scrollWidth > dialog.clientWidth,
      selected: dialog.querySelector('[data-selected-product]').dataset.selectedProduct };
  })()`)
  assert.ok(mobile.left >= 0 && mobile.right <= 390 && mobile.top >= 0 && mobile.bottom <= 844)
  assert.equal(mobile.overflow, false)
  assert.equal(mobile.selected, 's5')
  snapshot()
  screenshot('mobile-s5')
  console.log('통과: 모바일 390×844 화면에서도 선택창과 S-5 옵션이 가로 넘침 없이 보인다.')

  await goto('/checkout', '#checkout-heading')
  assert.equal(evaluate('[...document.querySelectorAll("a")].some(a => a.getAttribute("href") === "/pricing")'), true)
  assert.equal(evaluate('document.querySelectorAll("iframe").length'), 0)
  assert.equal(evaluate('window.__talePricingRegression.count'), 0)
  assert.match(evaluate('document.body.innerText'), /No payment link found|결제 링크가 없어요/)
  screenshot('checkout-missing')
  console.log('통과: 결제 링크 없이 들어오면 새 거래를 만들지 않고 가격표로 안내한다.')
  console.log('기능 회귀 확인 완료. 화면 품질은 저장된 스크린샷으로 오너가 검수한다.')
}

try {
  await main()
} catch (error) {
  console.error(`실패: ${error instanceof Error ? error.message : '회귀 검증 오류'}`)
  process.exitCode = 1
} finally {
  try { restoreFetch() } catch { console.error('참고: 탭 연결이 끊겨 가짜 fetch 해제를 확인하지 못했습니다. 해당 로컬 탭 새로고침으로 해제됩니다.') }
}
