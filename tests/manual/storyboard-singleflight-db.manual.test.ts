// 개발 DB의 임시 공간에서 같은 샷 이미지의 동시 예약을 실행하고 작업이 한 번만 접수되는지 확인한다.
import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { parse } from 'dotenv'
import { Client, type ClientConfig } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const enabled = process.env.DIRECTOR_STORYBOARD_DB_VERIFY === '1'
const schema = `storyboard_verify_${randomUUID().replaceAll('-', '')}`
const migrationPath = 'supabase/migrations/20260914160000_storyboard_singleflight.sql'
const output = '.claude/docs/2026-09-14/button-gating/image-db-verification.json'
const report: Record<string, unknown> = { testedAt: new Date().toISOString(), observations: [], paidRequests: 0, publicRowsWritten: 0 }
let config: ClientConfig
let db: Client
let created = false

describe.skipIf(!enabled)('동시 이미지 요청의 실제 DB 예약', () => {
  beforeAll(async () => {
    const env = parse(readFileSync('.env.local'))
    const ref = 'pbiumddivadgbzxuymak'
    if (new URL(env.SUPABASE_DEV_URL).hostname !== `${ref}.supabase.co` || new URL(env.SUPABASE_LIVE_URL).hostname === `${ref}.supabase.co`) throw new Error('Development identity mismatch')
    const response = await fetch(`https://api.supabase.com/v1/projects/${ref}/config/database/pooler`, { headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}` }, signal: AbortSignal.timeout(20000) })
    if (!response.ok) throw new Error(`Development pooler HTTP ${response.status}`)
    const pool = (await response.json()).find((p: { database_type: string }) => p.database_type === 'PRIMARY')
    if (pool.db_user !== `postgres.${ref}` || !pool.db_host.endsWith('.pooler.supabase.com') || pool.db_name !== 'postgres') throw new Error('Development pooler identity mismatch')
    const cert = await fetch('https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt', { signal: AbortSignal.timeout(20000) })
    if (!cert.ok) throw new Error('Certificate unavailable')
    config = { host: pool.db_host, port: pool.db_port, user: pool.db_user, database: pool.db_name, password: env.SUPABASE_DEV_DB_PASSWORD, ssl: { ca: await cert.text(), rejectUnauthorized: true }, connectionTimeoutMillis: 20000 }
    db = new Client(config)
    await db.connect()
    await db.query(`create schema ${schema}`)
    created = true
    await db.query(`create table ${schema}.generation_jobs (id uuid primary key default gen_random_uuid(), project_id uuid not null, kind text not null, status text not null default 'queued', target jsonb not null default '{}')`)
    if (existsSync(migrationPath)) {
      // 검사 대상 SQL은 그대로 실행하고 이름 공간과 잠금 이름만 격리한다.
      const sql = readFileSync(migrationPath, 'utf8').replaceAll('public.', `${schema}.`).replaceAll('search_path = public,', `search_path = ${schema},`).replaceAll("'generation-capacity'", `'${schema}:capacity'`)
      await db.query(sql)
    }
    report.migrationPresent = existsSync(migrationPath)
  }, 60000)

  afterAll(async () => {
    if (created) {
      await db.query(`drop schema ${schema} cascade`)
      report.temporarySchemaRemoved = !(await db.query('select 1 from pg_namespace where nspname=$1', [schema])).rowCount
    }
    if (db) await db.end()
    mkdirSync('.claude/docs/2026-09-14/button-gating', { recursive: true })
    writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`)
  })

  async function race(targets: Array<{ kind: string; target: unknown }>) {
    const project = randomUUID()
    const clients = targets.map(() => new Client(config))
    try {
      await Promise.all(clients.map((client) => client.connect()))
      const outcomes = await Promise.all(targets.map(async (t, index) => {
        try {
          const result = await clients[index].query(`insert into ${schema}.generation_jobs(project_id,kind,target) values($1,$2,$3) returning id`, [project, t.kind, t.target])
          return { inserted: true, jobId: result.rows[0].id }
        } catch (error) {
          const e = error as { message: string; detail?: string }
          return { inserted: false, message: e.message, jobId: e.detail }
        }
      }))
      const rows = (await db.query(`select * from ${schema}.generation_jobs where project_id=$1`, [project])).rows
      ;(report.observations as unknown[]).push({ targets, outcomes, jobs: rows.length })
      return { outcomes, rows, project }
    } finally { await Promise.all(clients.map((client) => client.end())) }
  }

  it('같은 샷의 이미지를 동시에 요청하면 한 작업만 접수하고 나머지는 기존 작업을 안내한다', async () => {
    const { outcomes, rows } = await race(Array.from({ length: 6 }, () => ({ kind: 'shot_storyboard', target: { writerShotId: 'shot-1' } })))
    expect(rows).toHaveLength(1)
    expect(outcomes.filter((o) => !o.inserted)).toHaveLength(5)
    expect(outcomes.every((o) => o.jobId === rows[0].id)).toBe(true)
  })

  it('일괄 이미지와 개별 이미지가 같은 샷을 동시에 요청하면 한 작업만 접수한다', async () => {
    const { rows } = await race([{ kind: 'shot_storyboard', target: { writerShotId: 'shot-1' } }, { kind: 'storyboard_real_grid', target: { writerShotIds: ['shot-1', 'shot-2'] } }])
    expect(rows).toHaveLength(1)
  })

  it('서로 다른 샷의 이미지를 요청하면 각각 접수한다', async () => {
    const { rows } = await race(['shot-1', 'shot-2'].map((writerShotId) => ({ kind: 'shot_storyboard', target: { writerShotId } })))
    expect(rows).toHaveLength(2)
  })

  it('이전 이미지 작업이 끝났으면 같은 샷을 다시 생성할 수 있다', async () => {
    const { rows, project } = await race([{ kind: 'shot_storyboard', target: { writerShotId: 'shot-1' } }])
    await db.query(`update ${schema}.generation_jobs set status='completed' where id=$1`, [rows[0].id])
    await db.query(`insert into ${schema}.generation_jobs(project_id,kind,target) values($1,'shot_storyboard',$2)`, [project, { writerShotId: 'shot-1' }])
    expect((await db.query(`select id from ${schema}.generation_jobs where project_id=$1`, [project])).rowCount).toBe(2)
  })
})
