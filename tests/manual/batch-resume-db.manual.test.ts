// #batch-resume: "영상 다 만들기" 를 처음 요청한 목록·준비된 입력 그대로 서버가 이어간다.
//   프로세스가 죽어도 item.id 가 안정적 요청키라 다른 키로 재제출하지 않는다. 이 파일은 실제
//   PostgreSQL 트랜잭션으로 그 계약(director_video_batches/director_video_batch_items +
//   create_director_video_batch/claim_director_video_batch/reserve_director_video_batch_item)을
//   검증한다 — 제품·마이그레이션 코드는 아직 없다(빨강 예정, 부모가 DB 를 구현한다).
//
// tests/manual/*.manual.test.ts 는 scripts/test-suites.mjs 의 MANUAL_RE 로 core(기본 검사)에서
//   제외된다. 직접 실행할 때 BATCH_RESUME_TEST_DATABASE_URL 이 없으면(아래 최상위 it) 명확한
//   안내로 실패한다 — describe.skip 처럼 조용히 건너뛰지 않는다.
import { Client, type QueryResultRow } from 'pg'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const databaseUrl = process.env.BATCH_RESUME_TEST_DATABASE_URL
// 부모 확인: DNS 로 직접 접속 불가(db.<ref>.supabase.co) → Management API 로 얻은 pooler(6543) 호스트만 접속 가능.
//   TLS 는 Supabase 공식 prod-ca-2021.crt 를 ca 로 넣어 rejectUnauthorized:true 로 검증한다.
//   비밀번호/URL 은 로그에 남기지 않는다 — env 값을 그대로 pg 설정에 넘길 뿐 어디에도 출력하지 않는다.
const caCert = process.env.BATCH_RESUME_TEST_CA
const describeDatabase = databaseUrl ? describe : describe.skip

function clientConfig(connectionString: string) {
  return caCert
    ? { connectionString, ssl: { ca: caCert, rejectUnauthorized: true } }
    : { connectionString }
}

let client: Client

async function query<T extends QueryResultRow = QueryResultRow>(text: string, values: unknown[] = []) {
  return client.query<T>(text, values)
}
let savepointId = 0

async function expectQueryError(text: string, values: unknown[], pattern?: RegExp): Promise<void> {
  const name = `batch_resume_expected_${++savepointId}`
  await query(`savepoint ${name}`)
  let caught: unknown
  try {
    await query(text, values)
  } catch (error) {
    caught = error
  }
  await query(`rollback to savepoint ${name}`)
  await query(`release savepoint ${name}`)
  expect(caught).toBeDefined()
  if (pattern) {
    expect(() => {
      throw caught
    }).toThrow(pattern)
  }
}

/** 테스트 전용 auth.users 행 — 실제 인증 흐름은 검증하지 않으므로 최소 필드만 채운다. */
async function createTestUser(): Promise<string> {
  const { rows } = await query<{ id: string }>(`
    insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
    values (
      gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      'batch-resume-' || gen_random_uuid() || '@test.local', 'not-a-real-hash', now(), now(), now(), '{}'::jsonb, '{}'::jsonb
    )
    returning id
  `)
  return rows[0].id
}

interface FixtureIds {
  ownerId: string
  workspaceId: string
  projectId: string
  shotIds: string[]
}

async function fixture(shotCount = 1): Promise<FixtureIds> {
  const ownerId = await createTestUser()
  const shotLabels = Array.from({ length: shotCount }, (_, i) => `shot-${i + 1}`)
  const { rows } = await query<{ workspace_id: string; project_id: string; shot_id: string }>(
    `
    with workspace as (
      insert into public.workspaces(name, slug, owner_id)
      values ('Batch resume integration', 'batch-resume-' || gen_random_uuid(), $2)
      returning id
    ), project as (
      insert into public.projects(workspace_id, title)
      select id, 'Batch resume integration' from workspace returning id, workspace_id
    ), scene as (
      insert into public.scenes(project_id, scene_id, narrative_time)
      select id, 'scene-1', 'present' from project returning id, project_id
    )
    insert into public.shots(project_id, scene_id, shot_id, shot_type, character_appearance_keys)
    select scene.project_id, scene.id, s, 'wide', '{}'::jsonb from scene, unnest($1::text[]) as s
    returning (select workspace_id from project) as workspace_id, project_id, shot_id
    `,
    [shotLabels, ownerId],
  )
  return {
    ownerId,
    workspaceId: rows[0].workspace_id,
    projectId: rows[0].project_id,
    shotIds: rows.map((r) => r.shot_id),
  }
}

interface BatchItem {
  id: string
  shot_id: string
  prepared: Record<string, unknown>
}

function itemsFor(shotIds: readonly string[]): BatchItem[] {
  return shotIds.map((shotId) => ({
    id: crypto.randomUUID(),
    shot_id: shotId,
    prepared: { note: 'fixture prepared input', shotId },
  }))
}

async function createBatch(projectId: string, ownerId: string, items: BatchItem[], batchId = crypto.randomUUID()) {
  const { rows } = await query<{ create_director_video_batch: string }>(
    `select public.create_director_video_batch($1, $2, $3, $4::jsonb) as create_director_video_batch`,
    [batchId, projectId, ownerId, JSON.stringify(items)],
  )
  expect(rows[0].create_director_video_batch).toBe(batchId)
  return batchId
}

async function claimBatch(batchId: string, token = crypto.randomUUID()) {
  const result = await query<{
    id: string
    status: string
    lease_token: string | null
    lease_expires_at: string | null
  }>(`select * from public.claim_director_video_batch($1, $2)`, [batchId, token])
  return { token, result }
}

function reserveArgs(ids: FixtureIds, item: BatchItem, overrides: Record<string, unknown> = {}) {
  return {
    shotId: item.shot_id,
    model: 'model-a',
    target: { retakeMode: 'new_take', writerShotId: item.shot_id, workspaceId: ids.workspaceId },
    inputSnapshot: {},
    userId: ids.ownerId,
    workspaceId: ids.workspaceId,
    provider: 'fal',
    actor: 'ui',
    takeLabel: null,
    override: {},
    canvasPosition: null,
    projectId: ids.projectId,
    idempotencyKey: item.id,
    ...overrides,
  }
}

async function reserveItem(itemId: string, leaseToken: string, args: Record<string, unknown>) {
  return query<{ video_clip_id: string; job_id: string; take_number: number; replayed: boolean }>(
    `select * from public.reserve_director_video_batch_item($1, $2, $3::jsonb)`,
    [itemId, leaseToken, JSON.stringify(args)],
  )
}

async function jobCountForProject(projectId: string): Promise<number> {
  const { rows } = await query<{ count: string }>(
    `select count(*) from public.generation_jobs where project_id = $1 and kind = 'shot_video'`,
    [projectId],
  )
  return Number(rows[0].count)
}

async function clipCountForProject(projectId: string): Promise<number> {
  const { rows } = await query<{ count: string }>(`select count(*) from public.video_clips where project_id = $1`, [projectId])
  return Number(rows[0].count)
}

// video_user_at_capacity 오너 승인 설계(개별+일괄 합산 3개 한도) 검증용 — kind in
//   (shot_video, shot_previz_video) 이고 status='queued' 인 전체를 project 단위로 센다.
async function queuedVideoJobCount(projectId: string): Promise<number> {
  const { rows } = await query<{ count: string }>(
    `select count(*) from public.generation_jobs where project_id = $1 and kind in ('shot_video', 'shot_previz_video') and status = 'queued'`,
    [projectId],
  )
  return Number(rows[0].count)
}

/** 개별(비일괄) 경로 — 20260720044000 의 13-인자 reserve_director_video_take 를 named-arg 로 직접 호출한다. */
function directTakeCall(ids: FixtureIds, shotId: string, idempotencyKey: string) {
  const target = { retakeMode: 'new_take', writerShotId: shotId, workspaceId: ids.workspaceId }
  return {
    text: `select * from public.reserve_director_video_take(p_project_id => $1::uuid, p_shot_id => $2, p_model => $3, p_target => $4::jsonb, p_idempotency_key => $5::uuid, p_user_id => $6::uuid, p_workspace_id => $7::uuid)`,
    values: [ids.projectId, shotId, 'model-a', JSON.stringify(target), idempotencyKey, ids.ownerId, ids.workspaceId],
  }
}

/** previz 잡은 전용 RPC 가 없다(route.ts 가 createGenerationJob 으로 직접 INSERT) — 여기서도 원문 INSERT 로 재현한다. */
function previzInsertCall(ids: FixtureIds, shotId: string) {
  return {
    text: `insert into public.generation_jobs(id, project_id, request_id, model, kind, status, target, input_snapshot, user_id, workspace_id, provider, actor)
           values (gen_random_uuid(), $1, 'reserved:' || gen_random_uuid()::text, 'model-a', 'shot_previz_video', 'queued', $2::jsonb, '{}'::jsonb, $3, $4, 'fal', 'ui')
           returning id`,
    values: [ids.projectId, JSON.stringify({ workspaceId: ids.workspaceId, writerShotId: shotId }), ids.ownerId, ids.workspaceId],
  }
}

/** 이미 queued 인 잡을 직접 심어 한도·시간창 경계를 재현한다(임의 kind, 선택적 created_at). */
async function insertQueuedJob(ids: FixtureIds, kind: string, options: { createdAt?: string } = {}): Promise<string> {
  const createdAt = options.createdAt ?? new Date().toISOString()
  const { rows } = await query<{ id: string }>(
    `insert into public.generation_jobs(id, project_id, request_id, model, kind, status, target, input_snapshot, user_id, workspace_id, provider, actor, created_at, updated_at)
     values (gen_random_uuid(), $1, 'reserved:' || gen_random_uuid()::text, 'model-a', $2, 'queued', '{}'::jsonb, '{}'::jsonb, $3, $4, 'fal', 'ui', $5::timestamptz, $5::timestamptz)
     returning id`,
    [ids.projectId, kind, ids.ownerId, ids.workspaceId, createdAt],
  )
  return rows[0].id
}

describeDatabase('#batch-resume 처음 고정한 목록·설정 그대로 서버가 이어간다', () => {
  beforeEach(async () => {
    client = new Client(clientConfig(databaseUrl as string))
    await client.connect()
    await query('begin')
  })

  afterEach(async () => {
    await query('rollback')
    await client.end()
  })

  it('중단된 묶음은 새 작업 행을 만들지 않는다', async () => {
    const ids = await fixture(1)
    const [item] = itemsFor(ids.shotIds)
    const batchId = await createBatch(ids.projectId, ids.ownerId, [item])
    const { token } = await claimBatch(batchId)

    // 오너가 중단(#batch-resume 정지 버튼) → 배치 상태가 running 을 벗어난다. 이 DB 계약 테스트는
    //   전용 취소 RPC 를 검증 범위에 두지 않으므로 상태 전이 자체는 직접 갱신해 시뮬레이션한다.
    await query(`update public.director_video_batches set status = 'cancelled' where id = $1`, [batchId])

    const before = await jobCountForProject(ids.projectId)
    await expectQueryError(
      `select * from public.reserve_director_video_batch_item($1, $2, $3::jsonb)`,
      [item.id, token, JSON.stringify(reserveArgs(ids, item))],
    )
    const after = await jobCountForProject(ids.projectId)
    expect(after).toBe(before)
    expect(after).toBe(0)
  })

  it('같은 항목 재요청은 같은 작업 하나만 반환하고, 잡의 batch_id·batch_total·item.job_id 가 같은 트랜잭션에 남는다', async () => {
    const ids = await fixture(1)
    const [item] = itemsFor(ids.shotIds)
    const batchId = await createBatch(ids.projectId, ids.ownerId, [item])
    const { token } = await claimBatch(batchId)

    const first = await reserveItem(item.id, token, reserveArgs(ids, item))
    expect(first.rows).toHaveLength(1)
    expect(first.rows[0].replayed).toBe(false)

    const replay = await reserveItem(item.id, token, reserveArgs(ids, item))
    expect(replay.rows[0]).toMatchObject({
      video_clip_id: first.rows[0].video_clip_id,
      job_id: first.rows[0].job_id,
      replayed: true,
    })

    expect(await jobCountForProject(ids.projectId)).toBe(1)

    const job = await query<{ batch_id: string; batch_total: number }>(
      `select batch_id, batch_total from public.generation_jobs where id = $1`,
      [first.rows[0].job_id],
    )
    expect(job.rows[0]).toMatchObject({ batch_id: batchId, batch_total: 1 })

    const trackedItem = await query<{ job_id: string; status: string }>(
      `select job_id, status from public.director_video_batch_items where id = $1`,
      [item.id],
    )
    expect(trackedItem.rows[0].job_id).toBe(first.rows[0].job_id)
  })

  it('다른 묶음·프로젝트·주인·키를 섞으면 거절하고 새 작업 행을 만들지 않는다', async () => {
    const idsA = await fixture(1)
    const idsB = await fixture(1)
    const [itemA] = itemsFor(idsA.shotIds)
    const [itemB] = itemsFor(idsB.shotIds)
    const batchA = await createBatch(idsA.projectId, idsA.ownerId, [itemA])
    const batchB = await createBatch(idsB.projectId, idsB.ownerId, [itemB])
    const { token: tokenA } = await claimBatch(batchA)
    const { token: tokenB } = await claimBatch(batchB)

    const beforeA = await jobCountForProject(idsA.projectId)
    const beforeB = await jobCountForProject(idsB.projectId)

    // 다른 묶음의 lease 토큰으로 이 항목을 예약하려는 시도.
    await expectQueryError(
      `select * from public.reserve_director_video_batch_item($1, $2, $3::jsonb)`,
      [itemA.id, tokenB, JSON.stringify(reserveArgs(idsA, itemA))],
    )
    // 다른 배치(B)의 토큰으로 배치 B 소속 항목을 예약하되 A 소유 토큰을 섞음(역방향도 동일 실패해야 함).
    await expectQueryError(
      `select * from public.reserve_director_video_batch_item($1, $2, $3::jsonb)`,
      [itemB.id, tokenA, JSON.stringify(reserveArgs(idsB, itemB))],
    )
    // 다른 프로젝트를 args 에 섞음(같은 배치·토큰이지만 projectId 불일치).
    await expectQueryError(
      `select * from public.reserve_director_video_batch_item($1, $2, $3::jsonb)`,
      [itemA.id, tokenA, JSON.stringify(reserveArgs(idsA, itemA, { projectId: idsB.projectId }))],
    )
    // 다른 주인을 args 에 섞음.
    await expectQueryError(
      `select * from public.reserve_director_video_batch_item($1, $2, $3::jsonb)`,
      [itemA.id, tokenA, JSON.stringify(reserveArgs(idsA, itemA, { userId: idsB.ownerId }))],
    )
    // item.id 가 안정적 요청키인데 다른 키를 보냄.
    await expectQueryError(
      `select * from public.reserve_director_video_batch_item($1, $2, $3::jsonb)`,
      [itemA.id, tokenA, JSON.stringify(reserveArgs(idsA, itemA, { idempotencyKey: crypto.randomUUID() }))],
    )

    expect(await jobCountForProject(idsA.projectId)).toBe(beforeA)
    expect(await jobCountForProject(idsB.projectId)).toBe(beforeB)
    expect(beforeA).toBe(0)
    expect(beforeB).toBe(0)
  })

  it('일괄도 사용자 전체의 영상 동시 한도 세 개를 넘기지 않는다', async () => {
    const ids = await fixture(4)
    const items = itemsFor(ids.shotIds)
    const batchId = await createBatch(ids.projectId, ids.ownerId, items)
    const { token } = await claimBatch(batchId)
    for (const item of items.slice(0, 3)) {
      await reserveItem(item.id, token, reserveArgs(ids, item))
    }
    await expectQueryError(
      `select * from public.reserve_director_video_batch_item($1, $2, $3::jsonb)`,
      [items[3].id, token, JSON.stringify(reserveArgs(ids, items[3]))],
      /batch_user_at_capacity/,
    )
    expect(await jobCountForProject(ids.projectId)).toBe(3)
  })

  it('일괄로 채운 3개 한도는 같은 사용자의 개별 네 번째 요청도 막는다(video_user_at_capacity, 새 행 없음)', async () => {
    // 이 검증은 어느 관문이 막는지가 아니라 "막혀야 함"을 먼저 밖힌다 — 지금은 새 trigger 가
    //   없으므로 반드시 빨간이어야 한다(추천 설계: generation_jobs BEFORE INSERT trigger).
    const ids = await fixture(4)
    const items = itemsFor(ids.shotIds)
    const batchId = await createBatch(ids.projectId, ids.ownerId, items.slice(0, 3))
    const { token } = await claimBatch(batchId)
    for (const item of items.slice(0, 3)) {
      await reserveItem(item.id, token, reserveArgs(ids, item))
    }
    expect(await queuedVideoJobCount(ids.projectId)).toBe(3)

    const beforeJobs = await jobCountForProject(ids.projectId)
    const beforeClips = await clipCountForProject(ids.projectId)
    const fourthShot = ids.shotIds[3]
    const direct = directTakeCall(ids, fourthShot, crypto.randomUUID())
    await expectQueryError(direct.text, direct.values, /video_user_at_capacity/)
    expect(await jobCountForProject(ids.projectId)).toBe(beforeJobs)
    expect(await clipCountForProject(ids.projectId)).toBe(beforeClips)
    expect(await queuedVideoJobCount(ids.projectId)).toBe(3)
  })

  it('개별 take 와 previz INSERT 가 실제로 동시에 들어와도 사용자 3개 한도를 넘기지 않는다(한 건만 성공, 최종 합계 3)', async () => {
    const ids = await fixture(4)
    const items = itemsFor(ids.shotIds)
    const batchId = await createBatch(ids.projectId, ids.ownerId, items.slice(0, 2))
    const { token } = await claimBatch(batchId)
    for (const item of items.slice(0, 2)) {
      await reserveItem(item.id, token, reserveArgs(ids, item))
    }
    expect(await queuedVideoJobCount(ids.projectId)).toBe(2)
    await query('commit')

    const competing = new Client(clientConfig(databaseUrl as string))
    await competing.connect()
    try {
      const thirdShot = ids.shotIds[2]
      const fourthShot = ids.shotIds[3]
      const direct = directTakeCall(ids, thirdShot, crypto.randomUUID())
      const previz = previzInsertCall(ids, fourthShot)
      const settled = await Promise.allSettled([query(direct.text, direct.values), competing.query(previz.text, previz.values)])

      const rejections = settled.filter((r): r is PromiseRejectedResult => r.status === 'rejected')
      const fulfilled = settled.filter((r) => r.status === 'fulfilled')
      expect(fulfilled).toHaveLength(1)
      expect(rejections).toHaveLength(1)
      expect(String((rejections[0].reason as { message?: string }).message ?? rejections[0].reason)).toMatch(/video_user_at_capacity/)

      expect(await queuedVideoJobCount(ids.projectId)).toBe(3)
    } finally {
      await competing.end()
      // 이 하위 케이스만 실제 동시성 확인을 위해 commit 했으므로, rollback 이 아니라 자기 fixture 만 직접 지운다.
      await query('delete from public.projects where id = $1', [ids.projectId])
      await query('delete from public.workspaces where id = $1', [ids.workspaceId])
      await query('delete from auth.users where id = $1', [ids.ownerId])
      await query('begin')
    }
  })

  it('generation_capacity_exempt_users 에 등록된 관리자는 개별 네 번째·previz 네 번째 요청도 허용한다', async () => {
    const ids = await fixture(4)
    const items = itemsFor(ids.shotIds)
    const batchId = await createBatch(ids.projectId, ids.ownerId, items.slice(0, 3))
    const { token } = await claimBatch(batchId)
    for (const item of items.slice(0, 3)) {
      await reserveItem(item.id, token, reserveArgs(ids, item))
    }
    expect(await queuedVideoJobCount(ids.projectId)).toBe(3)

    await query('insert into public.generation_capacity_exempt_users(user_id) values ($1)', [ids.ownerId])

    const fourthShot = ids.shotIds[3]
    const direct = directTakeCall(ids, fourthShot, crypto.randomUUID())
    const result = await query<{ job_id: string }>(direct.text, direct.values)
    expect(result.rows).toHaveLength(1)
    expect(await queuedVideoJobCount(ids.projectId)).toBe(4)
  })

  it('30분 이전에 queued 로 남은 잡은 새 단건 요청의 한도 계산에 들어가지 않는다', async () => {
    const ids = await fixture(4)
    await insertQueuedJob(ids, 'shot_video', { createdAt: new Date(Date.now() - 45 * 60_000).toISOString() })
    await insertQueuedJob(ids, 'shot_video', { createdAt: new Date(Date.now() - 45 * 60_000).toISOString() })
    await insertQueuedJob(ids, 'shot_video', { createdAt: new Date(Date.now() - 45 * 60_000).toISOString() })

    const shotId = ids.shotIds[0]
    const direct = directTakeCall(ids, shotId, crypto.randomUUID())
    const result = await query<{ job_id: string }>(direct.text, direct.values)
    expect(result.rows).toHaveLength(1)
  })

  it('한도 집계는 shot_video/shot_previz_video 종류에 상관없이 합산한다(이미지 잡은 영향 없음)', async () => {
    const ids = await fixture(4)
    await insertQueuedJob(ids, 'character_view')
    await insertQueuedJob(ids, 'world_shot')
    const items = itemsFor(ids.shotIds)
    const batchId = await createBatch(ids.projectId, ids.ownerId, items.slice(0, 2))
    const { token } = await claimBatch(batchId)
    for (const item of items.slice(0, 2)) {
      await reserveItem(item.id, token, reserveArgs(ids, item))
    }
    const previz = previzInsertCall(ids, ids.shotIds[2])
    await query(previz.text, previz.values)
    expect(await queuedVideoJobCount(ids.projectId)).toBe(3)

    const fourthShot = ids.shotIds[3]
    const direct = directTakeCall(ids, fourthShot, crypto.randomUUID())
    await expectQueryError(direct.text, direct.values, /video_user_at_capacity/)
    expect(await queuedVideoJobCount(ids.projectId)).toBe(3)
  })

  it('다른 요청이 먼저 샷을 채우면 기다리거나 건너뛰고 새 영상을 내지 않는다', async () => {
    const ids = await fixture(1)
    const [firstItem] = itemsFor(ids.shotIds)
    const [secondItem] = itemsFor(ids.shotIds)
    const firstBatch = await createBatch(ids.projectId, ids.ownerId, [firstItem])
    const secondBatch = await createBatch(ids.projectId, ids.ownerId, [secondItem])
    const { token: firstToken } = await claimBatch(firstBatch)
    const { token: secondToken } = await claimBatch(secondBatch)
    const first = await reserveItem(firstItem.id, firstToken, reserveArgs(ids, firstItem))
    await expectQueryError(
      `select * from public.reserve_director_video_batch_item($1, $2, $3::jsonb)`,
      [secondItem.id, secondToken, JSON.stringify(reserveArgs(ids, secondItem))],
      /batch_shot_busy/,
    )
    await query(`update public.generation_jobs set status = 'completed' where id = $1`, [first.rows[0].job_id])
    await query(`update public.video_clips set status = 'completed', url = 'https://media.test/completed.mp4' where id = $1`, [first.rows[0].video_clip_id])
    await expectQueryError(
      `select * from public.reserve_director_video_batch_item($1, $2, $3::jsonb)`,
      [secondItem.id, secondToken, JSON.stringify(reserveArgs(ids, secondItem))],
      /batch_shot_already_completed/,
    )
    expect(await jobCountForProject(ids.projectId)).toBe(1)
  })

  it('중단한 뒤에도 이미 접수한 작업은 같은 작업으로 돌려주고 계속 수집한다', async () => {
    const ids = await fixture(1)
    const [item] = itemsFor(ids.shotIds)
    const batchId = await createBatch(ids.projectId, ids.ownerId, [item])
    const { token } = await claimBatch(batchId)
    const first = await reserveItem(item.id, token, reserveArgs(ids, item))
    await query(`update public.director_video_batches set status = 'cancelled', lease_token = null where id = $1`, [batchId])
    const replay = await reserveItem(item.id, token, reserveArgs(ids, item))
    expect(replay.rows[0]).toMatchObject({ job_id: first.rows[0].job_id, replayed: true })
    const job = await query<{ status: string }>(`select status from public.generation_jobs where id = $1`, [first.rows[0].job_id])
    expect(job.rows[0].status).toBe('queued')
    expect(await jobCountForProject(ids.projectId)).toBe(1)
  })

  it('겹친 claim 은 한 실행만 임대받는다', async () => {
    const ids = await fixture(1)
    const [item] = itemsFor(ids.shotIds)
    const batchId = await createBatch(ids.projectId, ids.ownerId, [item])

    // 순차 확인: 방금 임대받은 배치를 곧바로 다시 claim 하면 만료 전이라 0 행이어야 한다.
    const { token: firstToken, result: firstClaim } = await claimBatch(batchId)
    expect(firstClaim.rows).toHaveLength(1)
    expect(firstClaim.rows[0].lease_token).toBe(firstToken)
    const staleAttempt = await claimBatch(batchId)
    expect(staleAttempt.result.rows).toHaveLength(0)

    // 실제 동시 접속 확인: 새 배치를 만들고 두 개의 실제 커넥션이 동시에 claim 을 시도한다.
    //   구현이 행 잠금(select ... for update 류)으로 배타를 건다면 한쪽은 상대 커밋을 기다렸다가
    //   조건(lease 없음/만료)이 이미 거짓이 되어 0 행을 돌려줘야 한다.
    const [secondItem] = itemsFor(idsShots(ids, 1))
    const concurrentBatchId = await createBatch(ids.projectId, ids.ownerId, [secondItem])
    await query('commit')

    const competing = new Client(clientConfig(databaseUrl as string))
    await competing.connect()
    try {
      // 각 claim은 자동 커밋한다. 한쪽 잠금을 잡은 채 상대 응답을 기다리면 교착된다.
      const tokenX = crypto.randomUUID()
      const tokenY = crypto.randomUUID()
      const claimX = query<{ id: string; lease_token: string | null }>(
        `select * from public.claim_director_video_batch($1, $2)`,
        [concurrentBatchId, tokenX],
      )
      const claimY = competing.query<{ id: string; lease_token: string | null }>(
        `select * from public.claim_director_video_batch($1, $2)`,
        [concurrentBatchId, tokenY],
      )
      const [resultX, resultY] = await Promise.all([claimX, claimY])

      const claimedRowCounts = [resultX.rows.length, resultY.rows.length]
      const totalClaimed = claimedRowCounts.reduce((sum, n) => sum + n, 0)
      expect(totalClaimed).toBe(1)
    } finally {
      await competing.end()
      // 이 하위 케이스만 실제 동시성 확인을 위해 commit 했으므로, rollback 이 아니라 직접 지운다.
      //   프로젝트 삭제는 scenes/shots/director_video_batches/*_items/generation_jobs 를 cascade 로 정리한다.
      await query('delete from public.projects where id = $1', [ids.projectId])
      await query('delete from public.workspaces where id = $1', [ids.workspaceId])
      await query('delete from auth.users where id = $1', [ids.ownerId])
      await query('begin')
    }
  })
})

/** 두 번째 픽스처 샷을 만들지 않고 기존 샷 id 를 재사용해 픽스처 비용을 줄인다. */
function idsShots(ids: FixtureIds, count: number): string[] {
  return ids.shotIds.slice(0, count)
}

if (!databaseUrl) {
  it('BATCH_RESUME_TEST_DATABASE_URL 없이 이 manual 테스트를 실행할 수 없다', () => {
    throw new Error(
      'Set BATCH_RESUME_TEST_DATABASE_URL to a disposable PostgreSQL database with the #batch-resume ' +
        'migrations applied (director_video_batches / director_video_batch_items + ' +
        'create_director_video_batch / claim_director_video_batch / reserve_director_video_batch_item) ' +
        'before running this manual test directly. Optionally set BATCH_RESUME_TEST_CA to a PEM CA cert ' +
        'string to verify TLS against a pooler host (e.g. Supabase prod-ca-2021.crt contents).',
    )
  })
}
