// 업체 대조 결과를 results.json 에 합치고 판정용 숫자를 계산한다. 읽기 전용(로컬 파일만 갱신).
import { readFileSync, writeFileSync } from 'node:fs'

const url = (n) => new URL(`./${n}`, import.meta.url)
const res = JSON.parse(readFileSync(url('results.json'), 'utf8'))
const vendor = JSON.parse(readFileSync(url('vendor-check.json'), 'utf8'))
const raw = JSON.parse(readFileSync(url('vendor-status-raw.json'), 'utf8'))

const rawById = Object.fromEntries(raw.rows.map((r) => [r.job_id, r]))
res.vendor_check = {
  checked_at: vendor.checked_at,
  method: 'src/lib/writer/llm/fal.ts falImageFetch (읽기 전용: fal.queue.status + fal.queue.result). 신규 submit 없음.',
  rows: vendor.rows.map((r) => ({ ...r, raw_decomposition: rawById[r.job_id] ?? null })),
}

// 판정용 숫자
const rows = res.all_rows_compact
const now = new Date(res.probed_at).getTime()
const days = {}
for (const r of rows) {
  const d = r.created_at.slice(0, 10)
  days[d] ??= { total: 0, queued: 0 }
  days[d].total++
  if (r.status === 'queued') days[d].queued++
}
res.per_day = days
res.older_than_12h_total = rows.filter((r) => now - new Date(r.created_at).getTime() >= 12 * 3600e3).length
res.stuck_rate = `${res.stuck_12h_count} / ${res.older_than_12h_total}`

// 굳은 작업의 바로 앞뒤 30분 이웃 (몰림 여부 판정 근거)
res.stuck_neighbors_30min = res.stuck_12h_list.map((s) => {
  const t = new Date(s.created_at).getTime()
  const w = rows.filter((r) => Math.abs(new Date(r.created_at).getTime() - t) <= 30 * 60000)
  return {
    stuck_job_id: s.id,
    window: `${s.created_at} ±30min`,
    neighbors: w.map((r) => ({ created_at: r.created_at, kind: r.kind, status: r.status })),
    neighbor_completed: w.filter((r) => r.status === 'completed').length,
    neighbor_queued: w.filter((r) => r.status === 'queued').length,
  }
})

res.verdict = {
  hypothesis: '완료 소식을 못 받아 진행 중/대기로 굳은 생성 작업이 데이터베이스에 남아 있다',
  stuck_12h_count: res.stuck_12h_count,
  reject_if_zero: '0건이면 기각 — 3건이므로 기각 조건 불발, 가설 성립',
  clustering: '몰리지 않음 (2026-08-09 07:55 에 2건, 2026-08-13 06:34 에 1건 — 4일 간격, 같은 분 단위 이웃 작업들은 정상 완료)',
  cause_attribution: '주소 변경으로 지목하지 않음 (사전 등록된 조건: 고르게 흩어져 있으면 지목 금지)',
  vendor_crosscheck: '3건 전부 업체 쪽 상태 COMPLETED. 2건은 완성 이미지 URL 이 지금도 받아짐, 1건은 결과 본문이 영구 500(downstream_service_error).',
}

writeFileSync(url('results.json'), JSON.stringify(res, null, 2))
console.log(JSON.stringify({ per_day: res.per_day, stuck_rate: res.stuck_rate, verdict: res.verdict }, null, 2))
