// 작품 스타일 기록 마이그레이션은 배경 "지금 그림" 색인을 바꾸기 전에 확인하고, 되돌리는 SQL 을 마이그레이션 폴더 밖에 따로 둔다 (2026-10-28 검토 지적)
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const MIGRATION = readdirSync('supabase/migrations').find((name) => name.endsWith('_artist_versions.sql'))!
const ROLLBACK = `supabase/rollbacks/${MIGRATION.replace(/\.sql$/, '.rollback.sql')}`
const flat = (sql: string) => sql.replace(/\s+/g, ' ').toLowerCase()

describe('작품 스타일 기록 마이그레이션', () => {
  it('배경 지금 그림 색인을 바꾸기 전에 옛 색인이 있는지와 새 규칙으로 겹치는 지금 그림이 없는지 확인하고, 아니면 멈춘다', () => {
    // 왜: 운영 DB 에 넣을 때 색인 이름이 다르거나 이미 겹친 행이 있으면, 색인을 지운 채 새로 만들지 못하고 반쯤 바뀐다(2026-10-28 검토 지적).
    const sql = flat(readFileSync(`supabase/migrations/${MIGRATION}`, 'utf8'))
    const check = sql.indexOf('do $$')
    const drop = sql.indexOf('drop index if exists public.idx_loc_img_candidates_one_selected')
    expect(check).toBeGreaterThan(-1)
    expect(check).toBeLessThan(drop)
    const block = sql.slice(check, sql.indexOf('end $$', check))
    expect(block).toContain("indexname = 'idx_loc_img_candidates_one_selected'")
    expect(block).toContain("group by project_id, location_id, view, coalesce(variant_key, '') having count(*) > 1")
    expect(block.match(/raise exception/g)?.length).toBeGreaterThanOrEqual(2)
  })

  it('되돌리는 SQL 은 마이그레이션 폴더 밖에 두고, 색인을 옛 규칙으로 되돌리기 전에 겹치는 지금 그림부터 정리한다', () => {
    // 왜: 마이그레이션 폴더 안의 .sql 은 다음 배포 때 마이그레이션으로 실행된다. 새 규칙에서는 배경 모습마다 지금 그림이 있어
    //   정리 없이 옛 색인을 만들면 실패한다(2026-10-28 검토 지적).
    expect(readdirSync('supabase/migrations').filter((name) => name.includes('rollback'))).toEqual([])
    expect(existsSync(ROLLBACK)).toBe(true)
    const sql = flat(readFileSync(ROLLBACK, 'utf8'))
    const cleanup = sql.indexOf('update public.location_image_candidates')
    const oldIndex = sql.indexOf('create unique index idx_loc_img_candidates_one_selected on public.location_image_candidates (project_id, location_id, view) where is_selected')
    expect(cleanup).toBeGreaterThan(-1)
    expect(oldIndex).toBeGreaterThan(cleanup)
    expect(sql).toContain('drop table if exists public.artist_versions')
    expect(sql).toContain("delete from supabase_migrations.schema_migrations where version = '20261028100000'")
  })
})
