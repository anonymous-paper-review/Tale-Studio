// 작품 스타일 기록 마이그레이션은 새 표와 그 표의 색인 · 접근 규칙만 더하고, 되돌리는 SQL 은 마이그레이션 폴더 밖에 따로 둔다 (2026-10-28 검토 · 10-31 오너)
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const MIGRATION = readdirSync('supabase/migrations').find((name) => name.endsWith('_artist_versions.sql'))!
const ROLLBACK = `supabase/rollbacks/${MIGRATION.replace(/\.sql$/, '.rollback.sql')}`
const flat = (sql: string) => sql.replace(/\s+/g, ' ').toLowerCase()
/** 주석을 뺀 SQL — 설명 글에 나온 이름은 세지 않는다. */
const statements = (sql: string) => flat(sql.split('\n').map((line) => line.replace(/--.*$/, '')).join('\n'))

describe('작품 스타일 기록 마이그레이션', () => {
  it('작품 스타일 기록 마이그레이션은 새 표와 그 표의 색인 · 접근 규칙만 더하고, 배경 카드 기록의 "지금 그림" 색인은 바꾸지 않는다', () => {
    // 왜: 2026-10-31 오너 결정 A — 배경 "지금 그림"을 모습마다 따로 두는 색인 바꾸기는 보류했다. 기존 표는 건드리지 않는다(오너 결정 4).
    const sql = statements(readFileSync(`supabase/migrations/${MIGRATION}`, 'utf8'))
    expect(sql).toContain('create table public.artist_versions')
    expect(sql).toContain('create unique index artist_versions_one_current on public.artist_versions (project_id) where is_current')
    expect(sql).toContain('alter table public.artist_versions enable row level security')
    expect(sql).not.toContain('idx_loc_img_candidates_one_selected')
    expect(sql).not.toContain('location_image_candidates')
    expect(sql).not.toMatch(/alter table public\.(?!artist_versions)/)
  })

  it('되돌리는 SQL 은 마이그레이션 폴더 밖에 두고, 작품 스타일 기록 표와 그 마이그레이션 기록만 지운다', () => {
    // 왜: 마이그레이션 폴더 안의 .sql 은 다음 배포 때 마이그레이션으로 실행된다(2026-10-28 검토 지적). 색인은 바꾸지 않으니 되돌릴 것도 표뿐이다.
    expect(readdirSync('supabase/migrations').filter((name) => name.includes('rollback'))).toEqual([])
    expect(existsSync(ROLLBACK)).toBe(true)
    const sql = statements(readFileSync(ROLLBACK, 'utf8'))
    expect(sql).toContain('drop table if exists public.artist_versions')
    expect(sql).toContain("delete from supabase_migrations.schema_migrations where version = '20261028100000'")
    expect(sql).not.toContain('location_image_candidates')
  })
})
