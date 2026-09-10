// 개발 DB의 격리 공간에서 러프 동시 예약·소유권·응답 유실·삭제 방어를 실제로 확인한다
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { Client } from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { DELETE } from '@/app/api/generation-jobs/[id]/route'

const api = vi.hoisted(() => ({ getUser: vi.fn(), getJob: vi.fn(), owns: vi.fn(), remove: vi.fn(), release: vi.fn() }))
vi.mock('@/lib/supabase/auth', () => ({ getUser: api.getUser }))
vi.mock('@/lib/generation-jobs', () => ({ getGenerationJobById: api.getJob, userOwnsProject: api.owns, deleteGenerationJobById: api.remove }))
vi.mock('@/lib/fal/reconcile', () => ({ reconcileJobFromFal: vi.fn() }))
vi.mock('@/lib/billing/take-hold', () => ({ releaseTakesForJob: api.release }))

const connection = process.env.MVP_ROUGH_TEST_DATABASE_URL
const schema = process.env.MVP_ROUGH_TEST_SCHEMA ?? ''
const ca = process.env.MVP_ROUGH_TEST_CA
const clients: Client[] = []
let primary: Client
let secondary: Client
let project: string
let workspace: string
let owner: string
let otherProject: string
let otherWorkspace: string
let otherOwner: string
type Reservation = { job_id: string | null; shot_ids: string[]; state: string; confirmation_pending: boolean }

async function reserve(client: Client, shots = ['shot-1', 'shot-2', 'shot-3', 'shot-4'], extra: { project?: string; workspace?: string; owner?: string; force?: boolean } = {}) {
  return client.query<Reservation>(`select * from ${schema}.reserve_rough_storyboard_grid($1,$2,$3,$4,$5,$6,$7,$8)`, [
    extra.project ?? project, extra.workspace ?? workspace, extra.owner ?? owner,
    shots, 'grid4', 'local-fixture-image-model', { prompt: 'Local fixture only', shotIds: shots }, extra.force ?? false,
  ])
}

async function jobCount() {
  return Number((await primary.query(`select count(*) as count from ${schema}.generation_jobs`)).rows[0].count)
}

/** 실제로 잠긴 두 번째 세션을 관찰한 후 첫 번째 예약을 확정하거나 되돌린다. */
async function race(firstShots: string[], nextShots: string[], commit: boolean) {
  let pending: Promise<Awaited<ReturnType<typeof reserve>>> | undefined
  await primary.query('begin')
  await primary.query("set local statement_timeout = '15s'")
  try {
    const first = (await reserve(primary, firstShots)).rows[0]
    await secondary.query('begin')
    await secondary.query("set local statement_timeout = '15s'")
    const pid = (await secondary.query('select pg_backend_pid() as pid')).rows[0].pid
    pending = reserve(secondary, nextShots)
    void pending.catch(() => {})
    let waiting = false
    const started = Date.now()
    while (Date.now() - started < 5000) {
      waiting = (await primary.query("select exists(select 1 from pg_locks where pid=$1 and locktype='advisory' and not granted) as waiting", [pid])).rows[0].waiting
      if (waiting) break
      await new Promise((resolve) => setTimeout(resolve, 25))
    }
    expect(waiting).toBe(true)
    await primary.query(commit ? 'commit' : 'rollback')
    const next = (await pending).rows
    await secondary.query('commit')
    return { first, next }
  } finally {
    await primary.query('rollback').catch(() => {})
    await pending?.catch(() => {})
    await secondary.query('rollback').catch(() => {})
  }
}

describe.skipIf(!connection)('개발 DB의 격리된 러프 예약', () => {
  beforeAll(async () => {
    if (!/^mvp_rough_[a-f0-9]{32}$/.test(schema) || !ca) throw new Error('Run the development rough database runner')
    for (let index = 0; index < 2; index++) {
      const client = new Client({ connectionString: connection, ssl: { ca, rejectUnauthorized: true }, connectionTimeoutMillis: 20000 })
      await client.connect()
      clients.push(client)
    }
    ;[primary, secondary] = clients
    await primary.query(`
      create table ${schema}.workspaces(id uuid primary key, owner_id uuid not null);
      create table ${schema}.projects(id uuid primary key, workspace_id uuid references ${schema}.workspaces(id));
      create table ${schema}.shots(project_id uuid references ${schema}.projects(id), shot_id text, action_description text, rough_storyboard jsonb, primary key(project_id, shot_id));
      create table ${schema}.generation_jobs(id uuid primary key, project_id uuid references ${schema}.projects(id), request_id text not null,
        model text not null, kind text not null, status text not null, target jsonb not null, input_snapshot jsonb, user_id uuid,
        workspace_id uuid, provider text, actor text, attempts integer, created_at timestamptz not null default now());
      alter table ${schema}.workspaces enable row level security;
      alter table ${schema}.projects enable row level security;
      alter table ${schema}.shots enable row level security;
      alter table ${schema}.generation_jobs enable row level security;
    `)
    const original = readFileSync('supabase/migrations/20260910001500_reserve_rough_storyboard_jobs.sql', 'utf8')
    const isolated = original.replaceAll('public.', `${schema}.`).replaceAll('search_path = public', `search_path = ${schema}`)
    if (/\bpublic\./.test(isolated) || isolated === original) throw new Error('Migration isolation failed')
    await primary.query(isolated)
  }, 60000)

  beforeEach(async () => {
    vi.clearAllMocks()
    await primary.query(`truncate ${schema}.generation_jobs, ${schema}.shots, ${schema}.projects, ${schema}.workspaces`)
    ;[project, workspace, owner, otherProject, otherWorkspace, otherOwner] = Array.from({ length: 6 }, () => randomUUID())
    await primary.query(`insert into ${schema}.workspaces values($1,$2),($3,$4)`, [workspace, owner, otherWorkspace, otherOwner])
    await primary.query(`insert into ${schema}.projects values($1,$2),($3,$4)`, [project, workspace, otherProject, otherWorkspace])
    for (const id of ['shot-1', 'shot-2', 'shot-3', 'shot-4', 'shot-5', 'shot-6']) {
      await primary.query(`insert into ${schema}.shots values($1,$2,'Open the door',null)`, [project, id])
    }
    await primary.query(`insert into ${schema}.shots values($1,'other-shot','Other project fixture',null)`, [otherProject])
    api.getUser.mockResolvedValue({ id: owner })
    api.getJob.mockImplementation(async (id: string) => (await primary.query(`select * from ${schema}.generation_jobs where id=$1`, [id])).rows[0])
    api.owns.mockImplementation(async (projectId: string, userId: string) => Boolean((await primary.query(`select 1 from ${schema}.projects p join ${schema}.workspaces w on w.id=p.workspace_id where p.id=$1 and w.owner_id=$2`, [projectId, userId])).rowCount))
    api.remove.mockImplementation(async (id: string) => { await primary.query(`delete from ${schema}.generation_jobs where id=$1`, [id]) })
    api.release.mockResolvedValue(undefined)
  }, 30000)

  afterAll(async () => { await Promise.allSettled(clients.map((client) => client.end())) })

  // 왜: 탭 두 개가 동시에 같은 샷을 요청해도 유료 작업의 선점은 하나여야 한다.
  it('동시에 같은 러프를 요청하면 앞선 예약이 끝날 때까지 기다리고 같은 작업을 돌려준다', async () => {
    const { first, next } = await race(['shot-1', 'shot-2'], ['shot-1', 'shot-2'], true)
    expect(first.state).toBe('reserved')
    expect(next).toEqual([{ job_id: first.job_id, shot_ids: ['shot-1', 'shot-2'], state: 'existing', confirmation_pending: true }])
    expect(await jobCount()).toBe(1)
  }, 25000)

  // 왜: 씬별 요청과 전체 요청이 일부만 겹쳐도 같은 샷을 다시 발주하면 안 된다.
  it('동시에 일부 샷이 겹치면 기존 작업을 공유하고 겹치지 않은 샷은 별도로 예약할 수 있다', async () => {
    const { first, next } = await race(['shot-1', 'shot-2', 'shot-3', 'shot-4'], ['shot-3', 'shot-4', 'shot-5', 'shot-6'], true)
    expect(next).toEqual([{ job_id: first.job_id, shot_ids: ['shot-3', 'shot-4'], state: 'existing', confirmation_pending: true }])
    expect(await jobCount()).toBe(1)
    expect((await reserve(primary, ['shot-5', 'shot-6'])).rows[0].state).toBe('reserved')
    expect(await jobCount()).toBe(2)
  }, 25000)

  // 왜: 외부 제출 전 예약 자체가 취소되면 대기 요청이 사라진 예약에 묶이면 안 된다.
  it('앞선 예약이 저장되지 않고 취소되면 기다리던 요청만 새 작업을 예약한다', async () => {
    const { first, next } = await race(['shot-1'], ['shot-1'], false)
    expect(next[0].state).toBe('reserved')
    expect(next[0].job_id).not.toBe(first.job_id)
    expect(await jobCount()).toBe(1)
  }, 25000)

  // 왜: 로그인과 프로젝트 번호만으로 다른 소유자의 유료 작업을 예약하면 안 된다.
  it('다른 소유자의 프로젝트나 다른 프로젝트의 샷으로는 러프를 예약하지 못한다', async () => {
    await expect(reserve(primary, ['other-shot'], { project: otherProject, workspace: otherWorkspace })).rejects.toThrow('access denied')
    await expect(reserve(primary, ['shot-1'], { workspace: otherWorkspace })).rejects.toThrow('access denied')
    await expect(reserve(primary, ['other-shot'])).rejects.toThrow('do not belong')
    await expect(reserve(primary, ['shot-1', 'shot-1'])).rejects.toThrow('do not belong')
    expect(await jobCount()).toBe(0)
    expect((await reserve(primary, ['other-shot'], { project: otherProject, workspace: otherWorkspace, owner: otherOwner })).rows[0].state).toBe('reserved')
  })

  // 왜: 오래 기다렸거나 다시 생성 버튼을 눌렀어도 유실된 접수가 미접수라는 뜻은 아니다.
  it('접수 응답을 잃은 예약은 오래되어도 유지하고 다시 조회할 때 확인 중 상태를 돌려준다', async () => {
    const first = (await reserve(primary)).rows[0]
    await primary.query(`update ${schema}.generation_jobs set created_at='2000-01-01', input_snapshot=input_snapshot || '{"rough_submit_state":"confirmation_pending"}'::jsonb where id=$1`, [first.job_id])
    const next = (await reserve(primary, undefined, { force: true })).rows[0]
    expect(next).toMatchObject({ job_id: first.job_id, state: 'existing', confirmation_pending: true })
    expect(await jobCount()).toBe(1)
    await primary.query(`update ${schema}.generation_jobs set request_id='fixture-provider-accepted' where id=$1`, [first.job_id])
    expect((await reserve(primary)).rows[0]).toMatchObject({ job_id: first.job_id, confirmation_pending: false })
  })

  // 왜: 다른 탭이 이미 저장한 이미지를 자동 생성이 다시 덮으면 추가 비용이 생긴다.
  it('이미 완성된 러프는 자동 생성에서 재사용하고 명시적으로 다시 만들 때만 새 작업을 예약한다', async () => {
    const first = (await reserve(primary)).rows[0]
    await primary.query(`update ${schema}.generation_jobs set status='completed' where id=$1`, [first.job_id])
    await primary.query(`update ${schema}.shots set rough_storyboard='{"status":"completed","url":"fixture"}'::jsonb where project_id=$1`, [project])
    expect((await reserve(primary)).rows[0]).toMatchObject({ job_id: null, state: 'exists', confirmation_pending: false })
    expect(await jobCount()).toBe(1)
    const next = (await reserve(primary, undefined, { force: true })).rows[0]
    expect(next.state).toBe('reserved')
    expect(next.job_id).not.toBe(first.job_id)
    expect(await jobCount()).toBe(2)
  })

  // 왜: 일부 완료가 전체 요청을 지워 버리면 아직 비어 있는 샷이 누락된다.
  it('일부 러프만 이미 완성되어 있으면 그 샷만 완료로 반환하고 나머지 예약 기회를 남긴다', async () => {
    await primary.query(`update ${schema}.shots set rough_storyboard='{"status":"completed","url":"fixture"}'::jsonb where project_id=$1 and shot_id='shot-1'`, [project])
    expect((await reserve(primary)).rows).toEqual([{ job_id: null, shot_ids: ['shot-1'], state: 'exists', confirmation_pending: false }])
    expect(await jobCount()).toBe(0)
    expect((await reserve(primary, ['shot-2', 'shot-3', 'shot-4'])).rows[0].state).toBe('reserved')
  })

  // 왜: 확실한 거절 뒤에는 다시 시도할 수 있어야 하며 뒤늦은 영수증은 실패 기록을 되살리면 안 된다.
  it('접수 거절로 끝난 작업은 새 시도를 허용하고 뒤늦은 접수 기록으로 다시 진행 중이 되지 않는다', async () => {
    const first = (await reserve(primary)).rows[0]
    await primary.query(`update ${schema}.generation_jobs set status='failed' where id=$1`, [first.job_id])
    const next = (await reserve(primary)).rows[0]
    expect(next.state).toBe('reserved')
    expect(next.job_id).not.toBe(first.job_id)
    const stale = await primary.query(`update ${schema}.generation_jobs set request_id='late-fixture-receipt' where id=$1 and project_id=$2 and kind='shot_rough_storyboard' and status='queued' and request_id=$3 returning id`, [first.job_id, project, `reserved:${first.job_id}`])
    expect(stale.rowCount).toBe(0)
  })

  // 왜: 서버용 예약 함수를 일반 클라이언트가 직접 호출해 소유자 검사를 우회하면 안 된다.
  it('러프 예약 함수는 방문자와 로그인 고객에게 직접 열리지 않는다', async () => {
    const permissions = (await primary.query(`select has_function_privilege('anon',$1,'execute') as anon, has_function_privilege('authenticated',$1,'execute') as authenticated, has_function_privilege('service_role',$1,'execute') as service_role`, [`${schema}.reserve_rough_storyboard_grid(uuid,uuid,uuid,text[],text,text,jsonb,boolean)`])).rows[0]
    expect(permissions).toEqual({ anon: false, authenticated: false, service_role: true })
  })

  // 왜: 접수 확인 중 기록을 큐 콘솔에서 지우면 같은 샷을 중복 발주할 수 있다.
  it('접수 확인 중인 러프를 삭제하려 해도 기록을 유지하고 같은 예약을 다시 돌려준다', async () => {
    const first = (await reserve(primary)).rows[0]
    const response = await DELETE(new Request(`http://localhost/api/generation-jobs/${first.job_id}`, { method: 'DELETE' }), { params: Promise.resolve({ id: first.job_id! }) })
    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({ error: { code: 'rough_submission_pending' } })
    expect(api.remove).not.toHaveBeenCalled()
    expect(api.release).not.toHaveBeenCalled()
    expect(await jobCount()).toBe(1)
    expect((await reserve(primary)).rows[0].job_id).toBe(first.job_id)
  })
})
