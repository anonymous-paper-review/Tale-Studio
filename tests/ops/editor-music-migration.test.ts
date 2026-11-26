// Editor 음악 만들기 마이그레이션은 만든 곡 표 하나와 그 색인 · 접근 규칙만 더하고, 생성 작업 종류 제약은 걸려 있을 때만 'editor_music' 을 더하며, 되돌리는 SQL 은 마이그레이션 폴더 밖에 둔다 (2026-11-26 E1 · 리드 O3)
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const MIGRATION = readdirSync('supabase/migrations').find((name) => name.endsWith('_add_editor_music.sql'))
const ROLLBACK = MIGRATION ? `supabase/rollbacks/${MIGRATION.replace(/\.sql$/, '.rollback.sql')}` : ''
const flat = (sql: string) => sql.replace(/\s+/g, ' ').toLowerCase()
/** 주석을 뺀 SQL — 설명 글에 나온 이름은 세지 않는다. */
const statements = (sql: string) => flat(sql.split('\n').map((line) => line.replace(/--.*$/, '')).join('\n'))
const migrationSql = () => statements(readFileSync(`supabase/migrations/${MIGRATION}`, 'utf8'))

describe('Editor 음악 만들기 마이그레이션', () => {
  it('음악 마이그레이션은 만든 곡 표와 그 색인 · 접근 규칙만 더하고, 다른 표에는 칸을 더하지 않는다', () => {
    // 왜: 리드 승인(2026-11-26 O3) — 새 표 하나(editor_music). 기존 표의 칸을 바꾸지 않아야 이 마이그레이션을 먼저 적용해도 다른 갈래 코드가 그대로 돈다.
    expect(MIGRATION).toBeDefined()
    const sql = migrationSql()
    expect(sql).toContain('create table public.editor_music')
    expect(sql).toContain('create index editor_music_project_created_idx on public.editor_music (project_id, created_at desc)')
    expect(sql).toContain('alter table public.editor_music enable row level security')
    expect(sql).not.toContain('create policy')
    expect(sql).not.toContain('add column')
    expect(sql).not.toMatch(/alter table public\.(?!editor_music|generation_jobs)/)
  })

  it('만든 곡의 상태는 만드는 중 · 끝 · 실패 셋뿐이고, 프로젝트를 지우면 같이 지워지며, [빼기]는 행을 지우지 않고 시각만 찍는다', () => {
    // 왜: 화면의 세 상태(만드는 중 · 실패 · 끝)와 같은 말이다. [빼기]한 곡도 이미 타임라인에 놓은 조각이 파일을 쓰므로 행과 파일을 남긴다.
    const sql = migrationSql()
    expect(sql).toContain("status text not null default 'queued' check (status in ('queued', 'completed', 'failed'))")
    expect(sql).toContain('project_id uuid not null references public.projects(id) on delete cascade')
    expect(sql).toContain('deleted_at timestamptz')
  })

  it('생성 작업 종류에 값 목록 제약이 걸려 있을 때만 그 제약에 editor_music 을 더하고, 없으면 새 제약을 만들지 않는다', () => {
    // 왜: generation_jobs 는 마이그레이션 폴더보다 먼저 만들어져 원격 DB 에 손으로 건 제약이 있을 수 있다(리드 2026-11-26 "있으면 같은 파일에서 고친다").
    //   제약을 더하는 문장은 그 제약을 찾은 경우의 반복문 안에만 있어야 한다 — 밖에 있으면 없던 제약이 새로 생긴다.
    const sql = migrationSql()
    const block = /do \$\$(.*?)end \$\$;/.exec(sql)?.[1] ?? ''
    expect(block).toContain('pg_get_constraintdef')
    expect(block).toContain("'editor_music'")
    expect(block).toContain('add constraint')
    const outside = sql.replace(/do \$\$.*?end \$\$;/, '')
    expect(outside).not.toContain('add constraint')
    expect(outside).not.toContain('generation_jobs')
  })

  it('되돌리는 SQL 은 마이그레이션 폴더 밖에 두고, 만든 곡 표와 그 마이그레이션 기록만 지운다', () => {
    // 왜: 마이그레이션 폴더 안의 .sql 은 다음 배포 때 마이그레이션으로 실행된다(2026-10-28 검토 지적). 작업 장부 · Take 장부 행은 장부라 남긴다.
    expect(readdirSync('supabase/migrations').filter((name) => name.includes('rollback'))).toEqual([])
    expect(existsSync(ROLLBACK)).toBe(true)
    const sql = statements(readFileSync(ROLLBACK, 'utf8'))
    expect(sql).toContain('drop table if exists public.editor_music')
    expect(sql).toContain("delete from supabase_migrations.schema_migrations where version = '20261126120000'")
    expect(sql).not.toContain('generation_jobs')
    expect(sql).not.toContain('take_ledger')
  })
})
