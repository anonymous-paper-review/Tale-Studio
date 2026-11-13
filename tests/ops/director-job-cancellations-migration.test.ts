// 화면에서 멈춘 생성 작업 마이그레이션은 새 표 하나와 멈추기 함수만 더하고, 같은 샷 하나만 검사 · 영상 투영이 멈춘 작업을 빼게 하며, 되돌리는 SQL 은 마이그레이션 폴더 밖에 둔다 (오너 2026-11-14 7번 · 리드 C)
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const MIGRATION = readdirSync('supabase/migrations').find((name) => name.endsWith('_director_job_cancellations.sql'))
const flat = (sql: string) => sql.replace(/\s+/g, ' ').toLowerCase()
/** 주석을 뺀 SQL — 설명 글에 나온 이름은 세지 않는다. */
const statements = (sql: string) => flat(sql.split('\n').map((line) => line.replace(/--.*$/, '')).join('\n'))
const read = (path: string) => statements(readFileSync(path, 'utf8'))
const NOT_CANCELLED = 'not exists (select 1 from public.director_job_cancellations dc where dc.job_id ='

/** 함수 하나의 본문 — create or replace function 이름부터 다음 end $$ 까지. */
function fn(sql: string, name: string): string {
  const start = sql.indexOf(`create or replace function public.${name}(`)
  expect(start, name).toBeGreaterThanOrEqual(0)
  return sql.slice(start, sql.indexOf('$$;', sql.indexOf('$$', start) + 2) + 3)
}

describe('화면에서 멈춘 생성 작업 마이그레이션', () => {
  it('새 표 하나(멈춘 작업)와 멈추기 함수만 더하고 기존 표에는 칸을 더하지 않는다', () => {
    // 왜: 오너 결정(2026-10-28) "새 표만(기존 표 칸 추가 금지)" — 리드 C 가 video_clips.cancelled_at 대신 새 표로 정했다.
    expect(MIGRATION).toBe('20261114100000_director_job_cancellations.sql')
    const sql = read(`supabase/migrations/${MIGRATION}`)
    expect(sql).toContain('create table public.director_job_cancellations')
    expect(sql).toContain('alter table public.director_job_cancellations enable row level security')
    expect(sql).toContain('create policy "owner select" on public.director_job_cancellations for select')
    expect(sql).toContain('create or replace function public.cancel_director_jobs(p_project_id uuid, p_job_ids uuid[], p_user_id uuid default null)')
    expect(sql).not.toMatch(/alter table public\.(?!director_job_cancellations)/)
    expect(sql).not.toMatch(/add column/)
  })

  it('같은 샷 하나만 검사(이미지 트리거 · 영상 예약 셋)는 멈춘 작업을 세지 않고, 함수 서명은 그대로다', () => {
    // 왜: 오너 7번 "유저가 수정해서 다시 생성 요청할 수 있게" — 멈춘 작업이 뒤에서 돌아도 그 샷을 바로 다시 요청할 수 있다. 서명이 같아야 옛 호출이 돈다.
    const sql = read(`supabase/migrations/${MIGRATION}`)
    expect(fn(sql, 'guard_storyboard_singleflight')).toContain(`${NOT_CANCELLED} j.id)`)
    for (const name of ['reserve_director_video_take', 'reserve_director_video_regeneration', 'reserve_director_video_batch_item']) {
      expect(fn(sql, name), name).toContain(`${NOT_CANCELLED} gj.id)`)
    }
    expect(sql).toContain('create or replace function public.reserve_director_video_take(p_project_id uuid, p_shot_id text, p_model text, p_target jsonb, p_idempotency_key uuid, p_input_snapshot jsonb default')
    expect(sql).toContain('create or replace function public.reserve_director_video_batch_item( p_item_id uuid, p_lease_token uuid, p_args jsonb )')
  })

  it('멈추기는 그 프로젝트의 도는 작업(queued — 접수 뒤 fal 에서 도는 동안의 실제 상태)만 적고, 이미 끝난(completed · failed) 작업과 다른 프로젝트 작업은 적지 않는다', () => {
    // 왜: 리드 확인 1 · 2 — 오너 7번의 대상은 이미 보낸(진행 중) 작업이다. 작업 상태 값은 queued · completed · failed 셋뿐이고(개발 DB 11/14 실측),
    //   보내지 않은 것은 브라우저 실행기가 멈춘다. 남의 프로젝트 작업 id 를 섞어 보내도 그 프로젝트 것만 적는다.
    const cancel = fn(read(`supabase/migrations/${MIGRATION}`), 'cancel_director_jobs')
    expect(cancel).toContain("where gj.project_id = p_project_id and gj.id = any(coalesce(p_job_ids, '{}'::uuid[])) and gj.status = 'queued'")
    expect(cancel).not.toMatch(/'completed'|'failed'/)
  })

  it('멈추기 함수는 service role 만 부를 수 있고, 멈춘 작업 표는 브라우저가 쓸 수 없다', () => {
    // 왜: 리드 확인 2 — 남의 작업을 멈추는 길이 없게. 라우트가 주인을 확인한 뒤 service role 로만 부른다. 표에는 읽기 규칙 하나뿐이다.
    const sql = read(`supabase/migrations/${MIGRATION}`)
    expect(sql).toContain('revoke all on function public.cancel_director_jobs(uuid, uuid[], uuid) from public, anon, authenticated')
    expect(sql).toContain('grant execute on function public.cancel_director_jobs(uuid, uuid[], uuid) to service_role')
    expect(sql.match(/create policy [^;]* on public\.director_job_cancellations [^;]*;/g)).toHaveLength(1)
    expect(sql).not.toMatch(/on public\.director_job_cancellations for (insert|update|delete|all)/)
  })

  it('동시 생성 자리 검사는 바꾸지 않아 멈춘 작업도 끝날 때까지 자리를 차지한다', () => {
    // 왜: 리드 c — fal 에서는 아직 돌고 있다. 자리를 비우면 한도보다 많이 돈다.
    expect(read(`supabase/migrations/${MIGRATION}`)).not.toContain('enforce_generation_capacity')
  })

  it('영상 일괄의 "이미 다 만든 샷" 검사는 멈춘 뒤 끝난 Take 를 세지 않고, ★ 로 고른 것은 센다', () => {
    // 왜: 리드 검토 a 낮음 2 — 멈춘 Take 가 뒤늦게 끝나면 그 샷은 영상 없음이다(투영 · 넘기기 창 · 샷 상태와 같은 규칙). 세면 일괄이 그 샷을 건너뛴다.
    const batch = fn(read(`supabase/migrations/${MIGRATION}`), 'reserve_director_video_batch_item')
    expect(batch).toMatch(/and btrim\(vc\.url\) <> '' and \(vc\.is_final or not exists \(select 1 from public\.director_job_cancellations dc where dc\.job_id = vc\.last_attempt_job_id\)\) \) then raise exception 'batch_shot_already_completed'/)
  })

  it('영상 투영은 멈춘 Take 를 ★ 로 고르지 않은 한 지금 영상으로 고르지 않는다', () => {
    // 왜: 오너 7번 "백그라운드에서 끝나면 히스토리로" — 늦게 끝난 Take 가 Editor 로 가는 영상을 바꾸지 않는다.
    const projection = fn(read(`supabase/migrations/${MIGRATION}`), 'refresh_director_video_projection')
    expect(projection).toContain('and (vc.is_final or not exists (select 1 from public.director_job_cancellations dc where dc.job_id = vc.last_attempt_job_id))')
  })

  it('되돌리는 SQL 은 마이그레이션 폴더 밖에 두고, 바꾼 함수를 바꾸기 전 정의로 되돌린 뒤 새 함수 · 새 표를 지운다', () => {
    // 왜: 마이그레이션 폴더 안의 .sql 은 다음 배포 때 실행된다(10/28 검토). 함수를 바꿨으니 되돌릴 때는 옛 정의를 다시 넣어야 한다.
    expect(readdirSync('supabase/migrations').filter((name) => name.includes('rollback'))).toEqual([])
    const path = 'supabase/rollbacks/20261114100000_director_job_cancellations.rollback.sql'
    expect(existsSync(path)).toBe(true)
    const sql = read(path)
    for (const name of ['guard_storyboard_singleflight', 'reserve_director_video_take', 'reserve_director_video_regeneration', 'reserve_director_video_batch_item', 'refresh_director_video_projection']) {
      expect(fn(sql, name), name).not.toContain('director_job_cancellations')
    }
    expect(sql).toContain('drop function if exists public.cancel_director_jobs(uuid, uuid[], uuid)')
    expect(sql).toContain('drop table if exists public.director_job_cancellations')
    expect(sql).toContain("delete from supabase_migrations.schema_migrations where version = '20261114100000'")
  })
})
