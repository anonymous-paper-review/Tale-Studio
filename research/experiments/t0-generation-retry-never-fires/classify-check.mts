// t0-generation-retry-never-fires — 코드 축 대조 (읽기 전용).
//   제품 코드에서 면제 목록과 분류 함수를 그대로 import 해 쓴다(복붙 금지 규칙).
//   1) 실측 실패 분류가 자동 재시도 면제 목록에 드는지 대조
//   2) 저장된 error 원문을 지금 코드로 다시 분류해 저장된 error_class 와 일치하는지 대조
//   실행: pnpm dlx tsx research/experiments/t0-generation-retry-never-fires/classify-check.mts
import { readFileSync, writeFileSync } from 'node:fs'

// 제품 모듈은 import 시점에 supabase 클라이언트를 만든다 → .env.local 을 먼저 심고 동적 import.
//   (조회는 하지 않는다. 이 스크립트는 코드 상수·분류 함수만 쓴다.)
for (const line of readFileSync(new URL('../../../.env.local', import.meta.url), 'utf8').split('\n')) {
  if (!line.includes('=') || line.trim().startsWith('#')) continue
  const i = line.indexOf('=')
  process.env[line.slice(0, i).trim()] ??= line.slice(i + 1).trim()
}

const {
  GIVE_UP_EXEMPT_CLASSES,
  AUTO_GENERATION_GIVE_UP_THRESHOLD,
  classifyJobError,
} = await import('../../../src/lib/generation-jobs')

const base = JSON.parse(readFileSync(new URL('./results.json', import.meta.url), 'utf8'))

const exempt = [...GIVE_UP_EXEMPT_CLASSES].sort()

const classTable = Object.entries(base.errorClassCounts as Record<string, number>)
  .map(([cls, count]) => ({
    errorClass: cls,
    count,
    autoRetryExempt: GIVE_UP_EXEMPT_CLASSES.has(cls),
  }))
  .sort((a, b) => b.count - a.count)

const exemptCount = classTable.filter((r) => r.autoRetryExempt).reduce((s, r) => s + r.count, 0)
const notExemptCount = classTable.filter((r) => !r.autoRetryExempt).reduce((s, r) => s + r.count, 0)

const out = {
  ...base,
  codeAxis: {
    source: 'src/lib/generation-jobs.ts (제품 코드 직접 import — 복붙 없음)',
    giveUpExemptClasses: exempt,
    autoGenerationGiveUpThreshold: AUTO_GENERATION_GIVE_UP_THRESHOLD,
    classifyJobErrorSelfTest: {
      'fal 잔액 소진': classifyJobError('fal 잔액 소진'),
      'image URL is not accessible': classifyJobError('image URL is not accessible'),
      'Bad Request': classifyJobError('Bad Request'),
      'stale queued reaped': classifyJobError('stale queued reaped'),
      '(빈 문자열)': classifyJobError(''),
    },
  },
  errorClassVsExemption: {
    note: '면제 목록은 "give-up 게이트가 세지 않는 클래스"다. 면제는 재시도를 일으키지 않고, 미래의 빈칸 채움을 막지 않을 뿐이다.',
    table: classTable,
    exemptFailures: exemptCount,
    nonExemptFailures: notExemptCount,
  },
}

writeFileSync(new URL('./results.json', import.meta.url), JSON.stringify(out, null, 2))
console.log(JSON.stringify({ codeAxis: out.codeAxis, errorClassVsExemption: out.errorClassVsExemption }, null, 2))
