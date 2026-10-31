// 한 작품의 행을 모두 읽기(서버 전용, 2026-10-31 작품 스타일 기록 재검토) — 한 번 읽기는 1000줄까지라(운영 API 상한) 나눠 읽는다.
//   지킬 파일 목록 · 지금 그림처럼 하나라도 빠지면 잘못 지우거나 같은 줄을 또 만드는 읽기에 쓴다. 한 번이라도 실패하면 던진다.
//   약속: tests/artist/image-files.test.ts · tests/artist/style-version-fixes.test.ts
import { supabaseAdmin } from '@/lib/supabase/admin'

export const PAGE_ROWS = 1000

export async function readAllProjectRows<T>(table: string, columns: string, projectId: string): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; ; from += PAGE_ROWS) {
    const { data, error } = await supabaseAdmin
      .from(table)
      .select(columns)
      .eq('project_id', projectId)
      .order('id', { ascending: true })
      .range(from, from + PAGE_ROWS - 1)
    if (error) throw new Error(`${table} read failed: ${error.message}`)
    const page = Array.isArray(data) ? (data as T[]) : []
    rows.push(...page)
    if (page.length < PAGE_ROWS) return rows
  }
}
