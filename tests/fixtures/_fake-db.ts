// _fake-db.ts — 라우트 시험용 supabase 조회 흉내: 표마다 넣은 행을 eq · in · is · not 으로 걸러 돌려준다. 쓰기는 기록만 한다.
//   `_` 접두라 vitest 가 테스트로 집어가지 않는다. vi.mock 은 각 테스트 파일에 둔다.
export type FakeDb = Record<string, Array<Record<string, unknown>>>

export function fakeFrom(db: () => FakeDb, writes: unknown[] = []) {
  return (table: string) => {
    const filters: Array<(row: Record<string, unknown>) => boolean> = []
    const orders: string[] = []
    let max: number | null = null
    const valueAt = (row: Record<string, unknown>, column: string): unknown => {
      const [base, key] = column.split('->>')
      const value = row[base]
      return key === undefined ? value : value && typeof value === 'object' ? (value as Record<string, unknown>)[key] : undefined
    }
    const rows = () => {
      let out = (db()[table] ?? []).filter((row) => filters.every((f) => f(row)))
      for (const column of [...orders].reverse()) out = [...out].sort((a, b) => Number(a[column] ?? 0) - Number(b[column] ?? 0))
      return max === null ? out : out.slice(0, max)
    }
    const q: Record<string, unknown> = {}
    for (const name of ['select', 'gte', 'lte', 'lt', 'gt', 'neq', 'filter', 'or', 'range']) q[name] = () => q
    q.not = (column: string, _op: string, value: unknown) => { filters.push((r) => (valueAt(r, column) ?? null) !== value); return q }
    q.is = (column: string, value: unknown) => { filters.push((r) => (valueAt(r, column) ?? null) === value); return q }
    q.eq = (column: string, value: unknown) => { filters.push((r) => valueAt(r, column) === value); return q }
    q.in = (column: string, values: unknown[]) => { filters.push((r) => values.includes(valueAt(r, column))); return q }
    q.order = (column: string) => { orders.push(column); return q }
    q.limit = (n: number) => { max = n; return q }
    for (const op of ['update', 'insert', 'upsert', 'delete']) q[op] = (value: unknown) => { writes.push({ table, op, value }); return q }
    q.maybeSingle = async () => ({ data: rows()[0] ?? null, error: null })
    q.single = q.maybeSingle
    q.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => Promise.resolve({ data: rows(), error: null, count: rows().length }).then(resolve, reject)
    return q
  }
}

/** 그림체 표 한 줄 — use_reference_image 가 false 이고 실사(live_action)인 것만 새 지시문을 쓴다. */
export const fakeStyle = (key: string, useReference: boolean, medium: string) => ({
  key, image_url: `https://style.test/${key}.png`, is_active: true, medium, style_clause: useReference ? 'Grade the whole image in this look.' : "Carry the style reference's scene language.",
  use_preview_ref: false, preview_url: null, anchor_kind: 'media', use_reference_image: useReference, facets: null,
})

/** [이름, 그림체 키, 사용자가 올린 그림체] — 실사(real)가 아닌 길. */
export const OTHER_STYLES: Array<[string, string | null, unknown]> = [
  ['일본 멜로', 'real_jp_melo', null],
  ['다른 실사 하위 그림체', 'real_psy_horror', null],
  ['애니', 'jp_anime', null],
  ['기준 그림 없는 애니', 'no_reference_anime', null],
  ['그림체 없음', null, null],
  ['사용자가 올린 그림체', 'real', { url: 'https://user.test/style.png' }],
]
export const STYLE_ROWS = [
  fakeStyle('real', false, 'live_action'), fakeStyle('real_jp_melo', true, 'live_action'), fakeStyle('real_psy_horror', true, 'live_action'),
  fakeStyle('jp_anime', true, '2d_anime'), fakeStyle('no_reference_anime', false, '2d_anime'),
]
