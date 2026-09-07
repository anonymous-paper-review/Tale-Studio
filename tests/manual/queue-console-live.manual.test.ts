import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

// #queue-console 라이브 검증 (수동 게이트 — 프로덕션 DB 사용, CI 항상 skip):
//   RUN_QUEUE_CONSOLE_LIVE=1 pnpm vitest run tests/queue-console-live.manual.test.ts
//
// 실 라우트 핸들러로 ① 콘솔 목록(소유권 스코프) ② stale 회수 no-op ③ 가짜 실패 잡
//   삽입→DELETE 왕복 ④ completed 삭제 거부(409) 를 실측한다. fal 호출 없음.

const LIVE = process.env.RUN_QUEUE_CONSOLE_LIVE === '1'
const OWNER = 'd93f86e2-bbd6-4a23-b0c4-11a0a4c980ac'
const PROJECT = '4f9f0f51-8313-4f60-910c-4220cee3ee71' // 오너 테스트 프로젝트(square_v2)

function loadEnv() {
  const env = readFileSync(path.join(process.cwd(), '.env.local'), 'utf8')
  for (const line of env.split('\n')) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim())
    if (m) process.env[m[1]] = m[2].replace(/^"|"$/g, '')
  }
}

vi.mock('@/lib/supabase/auth', () => ({
  getUser: async () => ({ id: 'd93f86e2-bbd6-4a23-b0c4-11a0a4c980ac' }),
}))

describe.runIf(LIVE)('queue console — 실 라우트 · 프로덕션 DB', () => {
  it('목록 → stale 회수 no-op → 가짜 실패 잡 삽입·삭제 → completed 삭제 거부', async () => {
    loadEnv()
    const { GET, POST } = await import('@/app/api/generation/queue/route')
    const { DELETE } = await import('@/app/api/generation-jobs/[id]/route')
    const { supabaseAdmin } = await import('@/lib/supabase/admin')

    // ① 목록: 소유권 스코프 — 모든 행의 프로젝트가 오너 타이틀 맵 안에 있어야 한다
    const listRes = await GET(new Request('http://localhost/api/generation/queue'))
    const list = (await listRes.json()) as {
      ok: boolean
      data: { jobs: Array<{ id: string; project_id: string; status: string }>; projectTitles: Record<string, string> }
    }
    expect(list.ok).toBe(true)
    expect(Object.keys(list.data.projectTitles).length).toBeGreaterThan(0)
    for (const j of list.data.jobs) {
      expect(list.data.projectTitles[j.project_id], `${j.id} 프로젝트 스코프`).toBeTruthy()
    }

    // ② stale 회수: 좀비가 없으니 checked 0 으로 무해 종료
    const sweepRes = await POST(
      new Request('http://localhost/api/generation/queue', {
        method: 'POST',
        body: '{}',
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    const sweep = (await sweepRes.json()) as { ok: boolean; data: { checked: number; settled: number } }
    expect(sweep.ok).toBe(true)
    expect(sweep.data.checked).toBeGreaterThanOrEqual(0)

    // ③ 가짜 실패 잡 삽입 → DELETE 라우트로 삭제 → DB 에서 소멸 확인
    const fakeId = crypto.randomUUID()
    const { error: insErr } = await supabaseAdmin.from('generation_jobs').insert({
      id: fakeId,
      project_id: PROJECT,
      request_id: `queue-console-live-${fakeId}`,
      model: 'test/fake',
      kind: 'shot_rough_storyboard',
      status: 'failed',
      error: 'queue-console live test row',
      target: {},
      user_id: OWNER,
    })
    expect(insErr).toBeNull()
    const delRes = await DELETE(new Request(`http://localhost/api/generation-jobs/${fakeId}`, { method: 'DELETE' }), {
      params: Promise.resolve({ id: fakeId }),
    })
    expect(delRes.status).toBe(200)
    const { data: gone } = await supabaseAdmin.from('generation_jobs').select('id').eq('id', fakeId)
    expect(gone).toEqual([])

    // ④ completed 는 이력 — 삭제 거부(409)
    const completed = list.data.jobs.find((j) => j.status === 'completed')
    if (completed) {
      const res409 = await DELETE(
        new Request(`http://localhost/api/generation-jobs/${completed.id}`, { method: 'DELETE' }),
        { params: Promise.resolve({ id: completed.id }) },
      )
      expect(res409.status).toBe(409)

      // ⑤ 상세: 타임라인·스냅샷 필드 동봉 (#queue-console 디버깅 표면)
      const detRes = await GET(new Request(`http://localhost/api/generation/queue?id=${completed.id}`))
      const det = (await detRes.json()) as { ok: boolean; data: { job: Record<string, unknown> } }
      expect(det.ok).toBe(true)
      expect(det.data.job).toHaveProperty('created_at')
      expect(det.data.job).toHaveProperty('input_snapshot')
      expect(det.data.job).toHaveProperty('response_snapshot')
      expect(det.data.job).toHaveProperty('submitted_at')

      // ⑥ fal 큐 상태 프록시: 오래된 완료 잡도 실패 없이 응답(실상태 또는 UNAVAILABLE+note)
      const falRes = await GET(
        new Request(`http://localhost/api/generation/queue?falStatus=${completed.id}`),
      )
      const fal = (await falRes.json()) as {
        ok: boolean
        data: { status: string; logs: unknown[]; note?: string }
      }
      expect(fal.ok).toBe(true)
      expect(typeof fal.data.status).toBe('string')
      expect(Array.isArray(fal.data.logs)).toBe(true)
    }
  }, 120_000)
})
