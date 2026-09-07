import { readFileSync } from 'node:fs'
import { Client, type QueryResultRow } from 'pg'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const databaseUrl = process.env.DIRECTOR_VIDEO_RETAKES_TEST_DATABASE_URL
const describeDatabase = databaseUrl ? describe : describe.skip
let client: Client

async function query<T extends QueryResultRow = QueryResultRow>(text: string, values: unknown[] = []) {
  return client.query<T>(text, values)
}
let savepointId = 0

async function expectQueryError(
  text: string,
  values: unknown[],
  pattern: RegExp,
): Promise<void> {
  const name = `director_retakes_expected_${++savepointId}`
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
  expect(() => {
    throw caught
  }).toThrow(pattern)
}

async function fixture() {
  const { rows: [row] } = await query<{ workspace_id: string, project_id: string, shot_id: string }>(`
    with workspace as (
      insert into public.workspaces(name, slug)
      values ('Director retakes integration', 'director-retakes-' || gen_random_uuid())
      returning id
    ), project as (
      insert into public.projects(workspace_id, title)
      select id, 'Director retakes integration' from workspace returning id, workspace_id
    ), scene as (
      insert into public.scenes(project_id, scene_id)
      select id, 'scene-1' from project returning id, project_id
    )
    insert into public.shots(project_id, scene_id, shot_id, shot_type)
    select scene.project_id, scene.id, 'shot-1', 'wide' from scene
    returning (select workspace_id from project) as workspace_id, project_id, shot_id
  `)
  return row
}

async function reserveNewTake(ids: { workspace_id: string, project_id: string, shot_id: string }, key = crypto.randomUUID()) {
  return query<{ video_clip_id: string, job_id: string, take_number: number, replayed: boolean }>(
    `select * from public.reserve_director_video_take($1, $2, $3, $4::jsonb, $5, $6::jsonb, null, $7)`,
    [ids.project_id, ids.shot_id, 'model-a', JSON.stringify({ retakeMode: 'new_take', writerShotId: ids.shot_id, workspaceId: ids.workspace_id }), key, '{}', ids.workspace_id],
  )
}

describeDatabase('director video retakes database integration', () => {
  beforeEach(async () => {
    client = new Client({ connectionString: databaseUrl })
    await client.connect()
    await query('begin')
  })
  it('rejects non-object reservation snapshots before normalization', async () => {
    const ids = await fixture()
    const target = JSON.stringify({ retakeMode: 'new_take', writerShotId: ids.shot_id, workspaceId: ids.workspace_id })
    await expectQueryError(
      `select * from public.reserve_director_video_take($1,$2,$3,$4::jsonb,$5,$6::jsonb,null,$7)`,
      [ids.project_id, ids.shot_id, 'model-a', target, crypto.randomUUID(), '[]', ids.workspace_id],
      /input snapshot must be a JSON object/,
    )
    await expectQueryError(
      `select * from public.reserve_director_video_take($1,$2,$3,$4::jsonb,$5,$6::jsonb,null,$7)`,
      [ids.project_id, ids.shot_id, 'model-a', target, crypto.randomUUID(), '"scalar"', ids.workspace_id],
      /input snapshot must be a JSON object/,
    )

    const first = await reserveNewTake(ids)
    const regenerationTarget = JSON.stringify({
      retakeMode: 'regeneration',
      writerShotId: ids.shot_id,
      videoClipId: first.rows[0].video_clip_id,
      workspaceId: ids.workspace_id,
    })
    await expectQueryError(
      `select * from public.reserve_director_video_regeneration($1,$2,$3,$4::jsonb,$5,$6::jsonb,null,$7)`,
      [ids.project_id, first.rows[0].video_clip_id, 'model-a', regenerationTarget, crypto.randomUUID(), '[]', ids.workspace_id],
      /input snapshot must be a JSON object/,
    )
    await expectQueryError(
      `select * from public.reserve_director_video_regeneration($1,$2,$3,$4::jsonb,$5,$6::jsonb,null,$7)`,
      [ids.project_id, first.rows[0].video_clip_id, 'model-a', regenerationTarget, crypto.randomUUID(), 'false', ids.workspace_id],
      /input snapshot must be a JSON object/,
    )
  })

  it('projects each live clip newest linked attempt job', async () => {
    const ids = await fixture()
    const first = await reserveNewTake(ids)
    const initial = await query<{ last_attempt_job_id: string | null }>(
      `select last_attempt_job_id from public.video_clips where id = $1`,
      [first.rows[0].video_clip_id],
    )
    expect(initial.rows[0].last_attempt_job_id).toBe(first.rows[0].job_id)

    await query(`select public.fail_director_video_attempt($1, $2, 'provider failed')`, [ids.project_id, first.rows[0].job_id])
    const target = JSON.stringify({
      retakeMode: 'regeneration',
      writerShotId: ids.shot_id,
      videoClipId: first.rows[0].video_clip_id,
      workspaceId: ids.workspace_id,
    })
    const regeneration = await query<{ job_id: string }>(
      `select * from public.reserve_director_video_regeneration($1,$2,$3,$4::jsonb,$5,$6::jsonb,null,$7)`,
      [ids.project_id, first.rows[0].video_clip_id, 'model-a', target, crypto.randomUUID(), '{}', ids.workspace_id],
    )
    const latest = await query<{ last_attempt_job_id: string | null }>(
      `select last_attempt_job_id from public.video_clips where id = $1`,
      [first.rows[0].video_clip_id],
    )
    expect(latest.rows[0].last_attempt_job_id).toBe(regeneration.rows[0].job_id)
  })
  it('atomically merges submission resolution and returns false after reservation CAS loss', async () => {
    const ids = await fixture()
    const reserved = await reserveNewTake(ids)
    await query(
      `update public.generation_jobs set response_snapshot = '{"unrelated":{"preserved":true}}'::jsonb where id = $1`,
      [reserved.rows[0].job_id],
    )
    const recorded = await query<{ record_director_video_submission_resolution: boolean }>(
      `select public.record_director_video_submission_resolution($1, $2, $3, $4, $5)`,
      [ids.project_id, reserved.rows[0].job_id, 503, 'gateway timeout', 'HTTP_503'],
    )
    expect(recorded.rows[0].record_director_video_submission_resolution).toBe(true)
    const snapshot = await query<{ response_snapshot: { unrelated: { preserved: boolean }, submission_resolution: { code: string } } }>(
      `select response_snapshot from public.generation_jobs where id = $1`,
      [reserved.rows[0].job_id],
    )
    expect(snapshot.rows[0].response_snapshot).toMatchObject({
      unrelated: { preserved: true },
      submission_resolution: { code: 'HTTP_503' },
    })
    await query(`update public.generation_jobs set request_id = 'attached-request' where id = $1`, [reserved.rows[0].job_id])
    const casMiss = await query<{ record_director_video_submission_resolution: boolean }>(
      `select public.record_director_video_submission_resolution($1, $2, $3, $4, $5)`,
      [ids.project_id, reserved.rows[0].job_id, 504, 'later timeout', 'HTTP_504'],
    )
    expect(casMiss.rows[0].record_director_video_submission_resolution).toBe(false)
  })
  it('scopes regeneration replay keys to the clip and preserves new-take network replay identity', async () => {
    const ids = await fixture()
    const operationKey = crypto.randomUUID()
    const first = await reserveNewTake(ids, operationKey)
    const replay = await reserveNewTake(ids, operationKey)
    expect(replay.rows[0]).toMatchObject({
      video_clip_id: first.rows[0].video_clip_id,
      job_id: first.rows[0].job_id,
      replayed: true,
    })
    const takeJobCount = await query<{ count: string }>(
      `select count(*) from public.generation_jobs where project_id = $1 and idempotency_key = $2`,
      [ids.project_id, operationKey],
    )
    expect(takeJobCount.rows[0].count).toBe('1')

    const second = await reserveNewTake(ids)
    await query(`select public.fail_director_video_attempt($1, $2, 'retry')`, [ids.project_id, first.rows[0].job_id])
    await query(`select public.fail_director_video_attempt($1, $2, 'retry')`, [ids.project_id, second.rows[0].job_id])
    const regenerationKey = crypto.randomUUID()
    const target = (clipId: string) => JSON.stringify({
      retakeMode: 'regeneration',
      writerShotId: ids.shot_id,
      videoClipId: clipId,
      workspaceId: ids.workspace_id,
    })
    const firstRegeneration = await query<{ video_clip_id: string, job_id: string }>(
      `select * from public.reserve_director_video_regeneration($1,$2,$3,$4::jsonb,$5,$6::jsonb,null,$7)`,
      [ids.project_id, first.rows[0].video_clip_id, 'model-a', target(first.rows[0].video_clip_id), regenerationKey, '{}', ids.workspace_id],
    )
    const secondRegeneration = await query<{ video_clip_id: string, job_id: string }>(
      `select * from public.reserve_director_video_regeneration($1,$2,$3,$4::jsonb,$5,$6::jsonb,null,$7)`,
      [ids.project_id, second.rows[0].video_clip_id, 'model-a', target(second.rows[0].video_clip_id), regenerationKey, '{}', ids.workspace_id],
    )
    expect(secondRegeneration.rows[0]).toMatchObject({
      video_clip_id: second.rows[0].video_clip_id,
    })
    expect(secondRegeneration.rows[0].job_id).not.toBe(firstRegeneration.rows[0].job_id)
    const firstReplay = await query<{ job_id: string, replayed: boolean }>(
      `select * from public.reserve_director_video_regeneration($1,$2,$3,$4::jsonb,$5,$6::jsonb,null,$7)`,
      [ids.project_id, first.rows[0].video_clip_id, 'model-a', target(first.rows[0].video_clip_id), regenerationKey, '{}', ids.workspace_id],
    )
    const secondReplay = await query<{ job_id: string, replayed: boolean }>(
      `select * from public.reserve_director_video_regeneration($1,$2,$3,$4::jsonb,$5,$6::jsonb,null,$7)`,
      [ids.project_id, second.rows[0].video_clip_id, 'model-a', target(second.rows[0].video_clip_id), regenerationKey, '{}', ids.workspace_id],
    )
    expect(firstReplay.rows[0]).toMatchObject({ job_id: firstRegeneration.rows[0].job_id, replayed: true })
    expect(secondReplay.rows[0]).toMatchObject({ job_id: secondRegeneration.rows[0].job_id, replayed: true })
  })
  it('serializes a concurrent cross-shot new-take key into an idempotency conflict', async () => {
    const ids = await fixture()
    const secondShotId = 'shot-2'
    await query(
      `insert into public.shots(project_id, scene_id, shot_id, shot_type)
       select project_id, scene_id, $2, shot_type from public.shots
       where project_id = $1 and shot_id = $3`,
      [ids.project_id, secondShotId, ids.shot_id],
    )
    await query('commit')

    const competing = new Client({ connectionString: databaseUrl })
    await competing.connect()
    const key = crypto.randomUUID()
    const firstTarget = JSON.stringify({ retakeMode: 'new_take', writerShotId: ids.shot_id, workspaceId: ids.workspace_id })
    const secondTarget = JSON.stringify({ retakeMode: 'new_take', writerShotId: secondShotId, workspaceId: ids.workspace_id })
    try {
      await query('begin')
      const first = await query(
        `select * from public.reserve_director_video_take($1,$2,$3,$4::jsonb,$5,$6::jsonb,null,$7)`,
        [ids.project_id, ids.shot_id, 'model-a', firstTarget, key, '{}', ids.workspace_id],
      )
      const contender = competing.query(
        `select * from public.reserve_director_video_take($1,$2,$3,$4::jsonb,$5,$6::jsonb,null,$7)`,
        [ids.project_id, secondShotId, 'model-a', secondTarget, key, '{}', ids.workspace_id],
      )
      await new Promise<void>((resolve) => setImmediate(resolve))
      await query('commit')
      await expect(contender).rejects.toThrow(/idempotency mismatch/)
      const jobs = await query<{ count: string }>(
        `select count(*) from public.generation_jobs where project_id = $1 and idempotency_key = $2`,
        [ids.project_id, key],
      )
      expect(first.rows).toHaveLength(1)
      expect(jobs.rows[0].count).toBe('1')
    } finally {
      await competing.end()
      await query('delete from public.projects where id = $1', [ids.project_id])
      await query('begin')
    }
  })
  afterEach(async () => {
    await query('rollback')
    await client.end()
  })

  it('normalizes legacy blanks before hardening constraints validate', async () => {
    const ids = await fixture()
    const reserved = await reserveNewTake(ids)
    const clip = reserved.rows[0]
    await query('set constraints all immediate')
    await query('alter table public.video_clips drop constraint if exists video_clips_url_nonblank')
    await query('alter table public.generation_jobs drop constraint if exists generation_jobs_result_url_nonblank')
    await query(`update public.video_clips set url = '   ' where id = $1`, [clip.video_clip_id])
    await query(`update public.generation_jobs set result_url = '   ' where id = $1`, [clip.job_id])
    await query(readFileSync('supabase/migrations/20260720042900_director_video_blank_preflight.sql', 'utf8'))
    const normalized = await query<{ url: string | null, result_url: string | null }>(`
      select vc.url, gj.result_url from public.video_clips vc
      join public.generation_jobs gj on gj.video_clip_id = vc.id where gj.id = $1
    `, [clip.job_id])
    expect(normalized.rows[0]).toEqual({ url: null, result_url: null })
  })

  it('enforces service-only RPC access, replay identity, take semantics, and terminal invariants', async () => {
    const ids = await fixture()
    const grant = await query<{ take_service: boolean, take_anon: boolean, take_authenticated: boolean, regeneration_service: boolean, regeneration_anon: boolean, regeneration_authenticated: boolean, resolution_service: boolean, resolution_anon: boolean, resolution_authenticated: boolean }>(`
      select
        has_function_privilege('service_role', 'public.reserve_director_video_take(uuid,text,text,jsonb,uuid,jsonb,uuid,uuid,text,text,text,jsonb,jsonb)', 'execute') as take_service,
        has_function_privilege('anon', 'public.reserve_director_video_take(uuid,text,text,jsonb,uuid,jsonb,uuid,uuid,text,text,text,jsonb,jsonb)', 'execute') as take_anon,
        has_function_privilege('authenticated', 'public.reserve_director_video_take(uuid,text,text,jsonb,uuid,jsonb,uuid,uuid,text,text,text,jsonb,jsonb)', 'execute') as take_authenticated,
        has_function_privilege('service_role', 'public.reserve_director_video_regeneration(uuid,uuid,text,jsonb,uuid,jsonb,uuid,uuid,text,text)', 'execute') as regeneration_service,
        has_function_privilege('anon', 'public.reserve_director_video_regeneration(uuid,uuid,text,jsonb,uuid,jsonb,uuid,uuid,text,text)', 'execute') as regeneration_anon,
        has_function_privilege('authenticated', 'public.reserve_director_video_regeneration(uuid,uuid,text,jsonb,uuid,jsonb,uuid,uuid,text,text)', 'execute') as regeneration_authenticated,
        has_function_privilege('service_role', 'public.record_director_video_submission_resolution(uuid,uuid,integer,text,text)', 'execute') as resolution_service,
        has_function_privilege('anon', 'public.record_director_video_submission_resolution(uuid,uuid,integer,text,text)', 'execute') as resolution_anon,
        has_function_privilege('authenticated', 'public.record_director_video_submission_resolution(uuid,uuid,integer,text,text)', 'execute') as resolution_authenticated
    `)
    expect(grant.rows[0]).toEqual({
      take_service: true, take_anon: false, take_authenticated: false,
      regeneration_service: true, regeneration_anon: false, regeneration_authenticated: false,
      resolution_service: true, resolution_anon: false, resolution_authenticated: false,
    })

    const key = crypto.randomUUID()
    const first = await reserveNewTake(ids, key)
    const replay = await reserveNewTake(ids, key)
    expect(replay.rows[0]).toMatchObject({ video_clip_id: first.rows[0].video_clip_id, replayed: true })
    await expect(reserveNewTake(ids, key)).resolves.toBeDefined()
    await query(`select public.attach_director_video_provider_request($1, $2, 'provider-request-1', 'fal', 'provider-model-a')`, [ids.project_id, first.rows[0].job_id])
    const attached = await query<{ model: string, requested_model: string | null }>(
      `select model, input_snapshot->>'requestedModel' as requested_model from public.generation_jobs where id = $1`,
      [first.rows[0].job_id],
    )
    expect(attached.rows[0]).toEqual({ model: 'provider-model-a', requested_model: 'model-a' })
    await expectQueryError(
      `update public.generation_jobs set input_snapshot = jsonb_set(input_snapshot, '{requestedModel}', '"other-model"') where id = $1`,
      [first.rows[0].job_id],
      /requestedModel is immutable/,
    )
    await expectQueryError(
      `select * from public.reserve_director_video_take($1,$2,$3,$4::jsonb,$5,$6::jsonb,null,$7)`,
      [ids.project_id, ids.shot_id, 'other-model', JSON.stringify({ retakeMode: 'new_take', writerShotId: ids.shot_id, workspaceId: ids.workspace_id }), key, '{}', ids.workspace_id],
      /idempotency mismatch/,
    )
    await expectQueryError(
      `select * from public.reserve_director_video_take($1,$2,$3,$4::jsonb,$5,$6::jsonb,null,$7,null,null,$8,$9::jsonb,$10::jsonb)`,
      [ids.project_id, ids.shot_id, 'model-a', JSON.stringify({ retakeMode: 'new_take', writerShotId: ids.shot_id, workspaceId: ids.workspace_id }), crypto.randomUUID(), JSON.stringify({ new_take_metadata: { take_label: 'wrong', override: {}, canvas_position: null } }), ids.workspace_id, null, '{}', null],
      /new take metadata does not match immutable input snapshot/,
    )

    const second = await reserveNewTake(ids)
    expect(second.rows[0].take_number).toBe(first.rows[0].take_number + 1)
    await query(`select public.complete_director_video_attempt($1, $2, $3, $4, $5)`, [ids.project_id, first.rows[0].job_id, first.rows[0].video_clip_id, 'https://media.test/first.mp4', `${ids.workspace_id}/${ids.project_id}/videos/${first.rows[0].video_clip_id}/${first.rows[0].job_id}.mp4`])
    await expectQueryError(
      `select public.complete_director_video_attempt($1, $2, $3, $4, $5)`,
      [ids.project_id, first.rows[0].job_id, first.rows[0].video_clip_id, 'https://media.test/other.mp4', `${ids.workspace_id}/${ids.project_id}/videos/${first.rows[0].video_clip_id}/${first.rows[0].job_id}.mp4`],
      /completed video attempt replay mismatch/,
    )
    await expectQueryError(
      `select public.complete_director_video_attempt($1, $2, $3, $4, $5)`,
      [ids.project_id, first.rows[0].job_id, first.rows[0].video_clip_id, 'https://media.test/first.mp4', 'wrong/path.mp4'],
      /video storage path does not match current job/,
    )
    await query(`select public.set_director_video_final($1, $2, true)`, [ids.project_id, first.rows[0].video_clip_id])
    const projection = await query<{ is_final: boolean, url: string | null }>(`select is_final, url from public.video_clips where id = $1`, [first.rows[0].video_clip_id])
    expect(projection.rows[0]).toEqual({ is_final: true, url: 'https://media.test/first.mp4' })
    await query(`select public.complete_director_video_attempt($1, $2, $3, $4, $5)`, [
      ids.project_id,
      second.rows[0].job_id,
      second.rows[0].video_clip_id,
      'https://media.test/second.mp4',
      `${ids.workspace_id}/${ids.project_id}/videos/${second.rows[0].video_clip_id}/${second.rows[0].job_id}.mp4`,
    ])
    await query(`select public.set_director_video_final($1, $2, true)`, [ids.project_id, second.rows[0].video_clip_id])
    const finalCount = await query<{ count: string }>(
      `select count(*) from public.video_clips where project_id = $1 and shot_id = $2 and is_final`,
      [ids.project_id, ids.shot_id],
    )
    expect(finalCount.rows[0].count).toBe('1')

    const regenerationKey = crypto.randomUUID()
    const regenTarget = { retakeMode: 'regeneration', writerShotId: ids.shot_id, videoClipId: first.rows[0].video_clip_id, workspaceId: ids.workspace_id }
    const regeneration = await query<{ video_clip_id: string, job_id: string, take_number: number }>(
      `select * from public.reserve_director_video_regeneration($1,$2,$3,$4::jsonb,$5,$6::jsonb,null,$7)`,
      [ids.project_id, first.rows[0].video_clip_id, 'model-a', JSON.stringify(regenTarget), regenerationKey, '{}', ids.workspace_id],
    )
    expect(regeneration.rows[0]).toMatchObject({ video_clip_id: first.rows[0].video_clip_id, take_number: first.rows[0].take_number })
    await query(`select public.fail_director_video_attempt($1, $2, 'late failure')`, [ids.project_id, regeneration.rows[0].job_id])
    const priorSuccess = await query<{ url: string | null, is_final: boolean }>(`select url, is_final from public.video_clips where id = $1`, [first.rows[0].video_clip_id])
    expect(priorSuccess.rows[0]).toEqual({ url: 'https://media.test/first.mp4', is_final: false })
    const malformed = await reserveNewTake(ids)
    await query(`update public.generation_jobs set video_clip_id = null where id = $1`, [malformed.rows[0].job_id])
    await expectQueryError(
      `select public.fail_director_video_attempt($1, $2, 'malformed')`,
      [ids.project_id, malformed.rows[0].job_id],
      /malformed clip linkage/,
    )
    await expectQueryError(
      `update public.generation_jobs set input_snapshot = '[]'::jsonb where id = $1`,
      [first.rows[0].job_id],
      /requestedModel is immutable|generation_jobs_linked_video_input_snapshot_object/,
    )
    await expectQueryError(
      `update public.generation_jobs set status = 'failed', error = ' ', last_error = ' ' where id = $1`,
      [first.rows[0].job_id],
      /generation_jobs_linked_video_failed_error_evidence|generation_jobs_linked_video_failed_last_error_evidence/,
    )
    const deleted = await reserveNewTake(ids)
    await query(`select public.soft_delete_director_video_take($1, $2)`, [ids.project_id, deleted.rows[0].video_clip_id])
    await query(`select public.fail_director_video_attempt($1, $2, 'late callback')`, [ids.project_id, deleted.rows[0].job_id])
    const deletedState = await query<{ deleted_at: string | null, status: string }>(
      `select vc.deleted_at, gj.status from public.video_clips vc join public.generation_jobs gj on gj.video_clip_id = vc.id where gj.id = $1`,
      [deleted.rows[0].job_id],
    )
    expect(deletedState.rows[0]).toMatchObject({ status: 'failed' })
    expect(deletedState.rows[0].deleted_at).not.toBeNull()
  }, 15_000)
})

if (!databaseUrl) {
  // Set DIRECTOR_VIDEO_RETAKES_TEST_DATABASE_URL to a disposable PostgreSQL database with migrations applied.
}
