// 세 번째 굳은 작업의 조회 오류(HTTP 500)가 status 단계인지 result 단계인지 분해. 읽기 전용.
//   falImageFetch 는 status→result 두 호출을 합치므로, 어느 쪽이 500 인지 여기서만 따로 본다.
//   실행: pnpm dlx tsx research/experiments/t0-stuck-jobs-webhook-loss/vendor-status-raw.mts
import { config } from 'dotenv'
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

config({ path: '.env.local' })

const { fal } = await import('@fal-ai/client')
fal.config({ credentials: process.env.FAL_KEY ?? '' })

const TARGETS = [
  { job_id: '49875112-b3c9-4699-8350-a7849b0fb735', request_id: '019ff9d4-1b08-7432-b6ee-e00fed20f6ac', model: 'openai/gpt-image-2/edit' },
  // 대조군: 앞서 COMPLETED 로 확인된 1건 — 같은 방법이 정상 동작함을 보인다
  { job_id: '02f99cac-d096-4c67-a58d-3ed789ef57d5', request_id: '019fe585-4520-7560-b3e7-252118de4eb8', model: 'openai/gpt-image-2/edit' },
]

const rows: unknown[] = []
for (const t of TARGETS) {
  const row: Record<string, unknown> = { ...t }
  try {
    const s = await fal.queue.status(t.model, { requestId: t.request_id, logs: false })
    row.status_call = 'ok'
    row.vendor_status = (s as { status?: string }).status ?? null
  } catch (e) {
    row.status_call = 'error'
    row.status_http = (e as { status?: number })?.status ?? null
    row.status_error = e instanceof Error ? e.message : String(e)
    row.status_body = JSON.stringify((e as { body?: unknown })?.body ?? null)
  }
  if (row.status_call === 'ok' && row.vendor_status === 'COMPLETED') {
    try {
      const r = await fal.queue.result(t.model, { requestId: t.request_id })
      row.result_call = 'ok'
      row.result_keys = Object.keys((r as { data?: object }).data ?? {})
    } catch (e) {
      row.result_call = 'error'
      row.result_http = (e as { status?: number })?.status ?? null
      row.result_error = e instanceof Error ? e.message : String(e)
      row.result_body = JSON.stringify((e as { body?: unknown })?.body ?? null)
    }
  }
  rows.push(row)
  console.log(JSON.stringify(row))
}

writeFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'vendor-status-raw.json'),
  JSON.stringify({ checked_at: new Date().toISOString(), rows }, null, 2),
)
