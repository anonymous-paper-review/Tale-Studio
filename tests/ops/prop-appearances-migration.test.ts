// 소품 모습 · 소품 지난 그림 마이그레이션은 새 표 둘과 그 색인 · 접근 규칙만 더하고, 되돌리는 SQL 은 마이그레이션 폴더 밖에 따로 둔다 (m1126 A3 · A4, 리드 R3 2026-11-26)
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const MIGRATION = readdirSync('supabase/migrations').find((name) => name.endsWith('_create_prop_appearances_and_image_candidates.sql'))
const ROLLBACK = MIGRATION ? `supabase/rollbacks/${MIGRATION.replace(/\.sql$/, '.rollback.sql')}` : ''
const flat = (sql: string) => sql.replace(/\s+/g, ' ').toLowerCase()
/** 주석을 뺀 SQL — 설명 글에 나온 이름은 세지 않는다. */
const statements = (sql: string) => flat(sql.split('\n').map((line) => line.replace(/--.*$/, '')).join('\n'))

describe('소품 모습 · 소품 지난 그림 마이그레이션', () => {
  // 왜: .claude/rules/supabase.md — 늘리기만 하는 1단계, 새 표와 정책을 함께. 기존 표(props 등)는 바꾸지 않아 옛 코드가 그대로 돈다.
  it('소품 모습 · 지난 그림 마이그레이션은 새 표 둘과 그 색인 · 읽기 정책만 더하고 기존 표는 바꾸지 않는다', () => {
    expect(MIGRATION).toBeTruthy()
    const sql = statements(readFileSync(`supabase/migrations/${MIGRATION}`, 'utf8'))
    expect(sql).toContain('create table if not exists public.prop_appearances')
    expect(sql).toContain('create table if not exists public.prop_image_candidates')
    expect(sql).toContain('alter table public.prop_appearances enable row level security')
    expect(sql).toContain('alter table public.prop_image_candidates enable row level security')
    expect(sql.match(/create policy "owner select" on public\.prop_(appearances|image_candidates) for select/g)).toHaveLength(2)
    expect(sql).not.toMatch(/alter table public\.(?!prop_appearances |prop_image_candidates )/)
    expect(sql).not.toMatch(/drop (table|column)/)
  })

  // 왜: 기본 모습은 props 행(열쇠 'default')이라 모습 표에 'default' 가 들어오면 칸이 둘이 된다. 소품을 지우면 그 모습 · 기록도 함께 지워야 아무것도 가리키지 않는 행이 남지 않는다.
  it("소품 모습은 'default' 열쇠를 쓰지 않고, 소품을 지우면 그 모습과 지난 그림 기록도 함께 지워진다", () => {
    const sql = statements(readFileSync(`supabase/migrations/${MIGRATION}`, 'utf8'))
    expect(sql).toContain("check (appearance_key <> 'default')")
    expect(sql.match(/foreign key \(project_id, prop_id\) references public\.props \(project_id, prop_id\) on delete cascade/g)).toHaveLength(2)
  })

  // 왜: 인물 · 배경 후보 표와 같은 규칙 — 칸(소품 × 모습)마다 지금 그림(선택본)은 하나다. 모습 열쇠를 비우지 않아야(기본 'default') 기본 모습 칸에도 이 규칙이 걸린다.
  it('소품 지난 그림은 칸(소품 × 모습)마다 선택본이 하나이고, 모습 열쇠는 비우지 않는다', () => {
    const sql = statements(readFileSync(`supabase/migrations/${MIGRATION}`, 'utf8'))
    expect(sql).toContain("appearance_key text not null default 'default'")
    expect(sql).toContain('create unique index if not exists idx_prop_img_candidates_one_selected on public.prop_image_candidates (project_id, prop_id, appearance_key) where is_selected')
  })

  // 왜: 마이그레이션 폴더 안의 .sql 은 모두 마이그레이션으로 실행된다(2026-10-28 검토) — 되돌리기는 폴더 밖에 두고 새 표 둘과 기록만 지운다.
  it('되돌리는 SQL 은 마이그레이션 폴더 밖에 두고, 새 표 둘과 그 마이그레이션 기록만 지운다', () => {
    expect(readdirSync('supabase/migrations').filter((name) => name.includes('rollback'))).toEqual([])
    expect(existsSync(ROLLBACK)).toBe(true)
    const sql = statements(readFileSync(ROLLBACK, 'utf8'))
    expect(sql).toContain('drop table if exists public.prop_image_candidates')
    expect(sql).toContain('drop table if exists public.prop_appearances')
    expect(sql).toContain(`delete from supabase_migrations.schema_migrations where version = '${MIGRATION!.slice(0, 14)}'`)
    expect(sql).not.toMatch(/drop table if exists public\.(?!prop_appearances|prop_image_candidates)/)
  })
})
