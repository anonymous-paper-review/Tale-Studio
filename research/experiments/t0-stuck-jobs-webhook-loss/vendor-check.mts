// t0-stuck-jobs-webhook-loss — 바깥 업체(FAL) 쪽 실제 상태 대조. 읽기 전용.
//   재현성 3규칙: 제품의 falImageFetch 를 그대로 import(복붙 없음). submit 계열은 절대 부르지 않는다.
//   실행: pnpm dlx tsx research/experiments/t0-stuck-jobs-webhook-loss/vendor-check.mts
import { config } from 'dotenv'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

config({ path: '.env.local' })

// 제품 모듈은 import 시점에 process.env.FAL_KEY 를 읽는다(fal.ts:11). ESM import 는 hoist 되어
//   dotenv 보다 먼저 돌기 때문에, 반드시 dotenv 이후 동적 import 해야 키가 잡힌다.
const { falImageFetch } = await import('@/lib/writer/llm/fal')

const DIR = dirname(fileURLToPath(import.meta.url))
const results = JSON.parse(readFileSync(join(DIR, 'results.json'), 'utf8')) as {
  stuck_12h_list: Array<{ id: string; request_id: string; model: string; kind: string; created_at: string }>
}

const out: unknown[] = []
for (const job of results.stuck_12h_list) {
  const row: Record<string, unknown> = {
    job_id: job.id,
    request_id: job.request_id,
    model: job.model,
    kind: job.kind,
    created_at: job.created_at,
  }
  try {
    const r = await falImageFetch(job.model, job.request_id)
    row.vendor_status = r.status
    if (r.status === 'COMPLETED') row.vendor_result_url = r.url
    if (r.status === 'FAILED') row.vendor_error = r.error
  } catch (e) {
    row.vendor_status = '(lookup error)'
    row.vendor_lookup_error = e instanceof Error ? e.message : String(e)
    row.vendor_lookup_http_status = (e as { status?: number })?.status ?? null
  }
  out.push(row)
  console.log(JSON.stringify(row))
}

writeFileSync(join(DIR, 'vendor-check.json'), JSON.stringify({ checked_at: new Date().toISOString(), rows: out }, null, 2))
