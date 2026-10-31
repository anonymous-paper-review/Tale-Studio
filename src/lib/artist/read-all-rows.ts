// 한 작품의 행을 모두 읽기(서버 전용, 2026-10-31 작품 스타일 기록 재검토) — 한 번 읽기는 1000줄까지라(운영 API 상한) 나눠 읽는다.
//   지킬 파일 목록 · 지금 그림처럼 하나라도 빠지면 잘못 지우거나 같은 줄을 또 만드는 읽기에 쓴다. 한 번이라도 실패하면 던진다.
//   id 순서로 "앞에서 읽은 마지막 id 보다 뒤"를 읽는다 — 몇 번째 줄부터 읽으면 그 사이 앞쪽 줄이 지워질 때 뒤쪽 줄이 당겨져 하나를 놓친다.
//   그 사이 새로 생긴 줄은 놓칠 수 있다 — 새로 그린 그림의 줄이라 지울 파일 · 되살릴 줄과 상관없다.
//   한 번에 PAGE_ROWS 줄을 달라고 해 그보다 적게 오면 끝이다(운영 API 상한이 PAGE_ROWS 이상이어야 한다 — Supabase 기본 1000).
//   약속: tests/artist/image-files.test.ts · tests/artist/style-version-fixes.test.ts
import { supabaseAdmin } from '@/lib/supabase/admin'

export const PAGE_ROWS = 1000

export async function readAllProjectRows<T>(table: string, columns: string, projectId: string): Promise<T[]> {
  const picked = /(^|,)\s*id\s*(,|$)/.test(columns) ? columns : `id, ${columns}`
  const rows: T[] = []
  let after: string | null = null
  for (;;) {
    let query = supabaseAdmin.from(table).select(picked).eq('project_id', projectId)
    if (after !== null) query = query.gt('id', after)
    const { data, error } = await query.order('id', { ascending: true }).limit(PAGE_ROWS)
    if (error) throw new Error(`${table} read failed: ${error.message}`)
    const page = Array.isArray(data) ? (data as unknown as Array<T & { id: unknown }>) : []
    rows.push(...page)
    if (page.length < PAGE_ROWS) return rows
    after = String(page[page.length - 1].id)
  }
}
