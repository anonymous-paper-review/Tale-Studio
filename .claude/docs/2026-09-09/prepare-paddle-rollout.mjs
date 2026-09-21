// 승인받은 결제 변경만 현재 운영 버전의 별도 작업공간에 옮긴다. 비밀값·영상·정책 파일은 제외한다.
import assert from 'node:assert/strict'
import { readFileSync, existsSync, symlinkSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'

const source = '/Users/xcape/projects/tale-studio'
const target = '/Users/xcape/orca/workspaces/tale-studio/paddle-checkout-rollout'
const files = [
  '.gitignore', '.vercelignore', 'DESIGN.md',
  'scripts/check-pricing-ui.mjs', 'scripts/paddle-register-catalog.mts',
  'src/app/pricing/page.tsx', 'src/app/checkout/page.tsx',
  'src/app/api/billing/catalog-status/route.ts',
  'src/app/api/billing/change-plan/route.ts',
  'src/app/api/billing/checkout/route.ts',
  'src/components/billing/checkout-button.tsx',
  'src/components/billing/pricing-page.tsx',
  'src/components/billing/plan-change-dialog.tsx',
  'src/components/billing/pricing-families.tsx',
  'src/components/billing/payment-link-checkout.tsx',
  'src/lib/billing/checkout.ts', 'src/lib/billing/paddle-client.ts',
  'src/lib/billing/checkout-availability.ts',
  'src/lib/billing/use-checkout.ts', 'src/lib/billing/pricing-selection.ts',
  'src/lib/billing/payment-link-checkout.ts',
  'src/lib/i18n/messages-ko.ts', 'src/middleware.ts',
  'tests/billing/paddle-checkout.test.ts', 'tests/billing/paddle-payment-policy.test.ts',
  'tests/billing/paddle-register-catalog.test.ts', 'tests/billing/pricing-selection.test.ts',
  'tests/billing/payment-link-checkout.test.ts', 'tests/billing/checkout-handoff.test.ts',
  'tests/billing/live-checkout-guard.test.ts',
  'src/lib/billing/account-summary.ts', 'src/lib/billing/paddle-webhook.ts', 'src/lib/billing/webhook-deps.ts',
  'src/types/database.ts',
  'supabase/migrations/20260909130000_fix_refund_expiry.sql',
  'tests/billing/refund-expiry.test.ts', 'tests/billing/webhook-refund-link.test.ts', 'tests/billing/paddle-webhook.test.ts',
  'tests/manual/refund-expiry-db.manual.test.ts', 'scripts/test-refund-expiry-db.mjs',
]
// 이 테스트는 원본에서 다른 영상 기능 검사도 함께 바뀌었다. 분리본의 승인된 mock 수정만 보존한다.
const preservedFiles = ['tests/billing/previz-record-before-submit.test.ts']
const git = (...args) => execFileSync('git', args, { cwd: target, encoding: 'utf8' }).trim()
assert.equal(git('rev-parse', 'HEAD'), 'a399530bf461aeb8b7c079cda47a4604dddf49de')
const existingChanges = execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], {cwd:target,encoding:'utf8'})
for (const line of existingChanges.split('\n').filter(Boolean)) {
  assert.ok([...files, ...preservedFiles].includes(line.slice(3)), `허용한 결제 변경 외 파일이 있어 중단합니다: ${line.slice(3)}`)
}
function desiredContent(file) {
  const content = readFileSync(resolve(source, file), 'utf8')
  if (file !== 'src/types/database.ts') return content
  // 실제 개발 DB 생성물에서 이번 함수 타입만 가져온다. 영상용 신규 표·함수는 운영 분리본에 섞지 않는다.
  const addition = content.match(/^      take_resolved_ledger: \{[\s\S]*?(?=^      [a-z_]+:)/m)?.[0]
  assert.ok(addition, '개발 DB에서 생성한 환불 함수 타입이 필요합니다.')
  const baseline = git('show', 'HEAD:src/types/database.ts') + '\n'
  assert.ok(!baseline.includes('take_resolved_ledger:'))
  return baseline.replace('      update_person_with_default_appearance:', addition + '      update_person_with_default_appearance:')
}
let patch = '*** Begin Patch\n'
let changed = 0
for (const file of files) {
  const desired = desiredContent(file)
  assert.ok(desired.endsWith('\n'), `${file}: 마지막 줄바꿈 필요`)
  const destination = resolve(target, file)
  if (existsSync(destination)) {
    const original = readFileSync(destination, 'utf8')
    if (original === desired) continue
    assert.ok(original.endsWith('\n'), `${file}: 기존 마지막 줄바꿈 필요`)
    patch += `*** Update File: ${destination}\n@@\n`
    patch += original.slice(0, -1).split('\n').map(line => '-' + line).join('\n') + '\n'
    patch += desired.slice(0, -1).split('\n').map(line => '+' + line).join('\n') + '\n'
  } else {
    patch += `*** Add File: ${destination}\n`
    patch += desired.slice(0, -1).split('\n').map(line => '+' + line).join('\n') + '\n'
  }
  changed++
}
patch += '*** End Patch\n'
execFileSync('apply_patch', [patch], { cwd: target, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 })
for (const file of files) assert.equal(desiredContent(file), readFileSync(resolve(target, file), 'utf8'))
// 이미 설치된 같은 lockfile의 의존성을 재사용한다. 설치·개발 서버·환경변수 파일을 건드리지 않는다.
assert.equal(readFileSync(resolve(source, 'pnpm-lock.yaml'), 'utf8'), readFileSync(resolve(target, 'pnpm-lock.yaml'), 'utf8'))
if (!existsSync(resolve(target, 'node_modules'))) symlinkSync(resolve(source, 'node_modules'), resolve(target, 'node_modules'), 'dir')
console.log(JSON.stringify({ target, base: git('rev-parse', 'HEAD'), copiedFiles: changed, files, preservedFiles, secretsCopied: false, videoChangesIncluded: false }, null, 2))
