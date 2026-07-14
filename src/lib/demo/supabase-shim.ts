// project-share-demo-mode — 스냅샷 기반 supabase-js 읽기 shim.
// 데모 세션에서 createClient() 대신 이 shim 을 돌려준다:
//   - 읽기(.from().select()...): 스냅샷에서 필터/정렬/제한 후 { data, error:null } 반환(실 DB 미접근).
//   - 쓰기(.update/.insert/.delete/.upsert): no-op { data:null, error:null } (데모는 영속 안 함).
// 스토어가 실제로 쓰는 빌더 shape(select/eq/neq/in/match/order/limit/single/maybeSingle)만 구현.

import { demoTableRows } from './context'

type Row = Record<string, unknown>
type QueryResult = { data: unknown; error: null }

type Filter =
  | { kind: 'eq'; col: string; val: unknown }
  | { kind: 'neq'; col: string; val: unknown }
  | { kind: 'in'; col: string; vals: unknown[] }
  | { kind: 'match'; obj: Row }

class DemoQuery implements PromiseLike<QueryResult> {
  private filters: Filter[] = []
  private orderBy: { col: string; asc: boolean } | null = null
  private limitN: number | null = null
  private wantSingle = false
  private isWrite = false

  constructor(private readonly table: string) {}

  select(_cols?: string): this {
    return this
  }
  eq(col: string, val: unknown): this {
    this.filters.push({ kind: 'eq', col, val })
    return this
  }
  neq(col: string, val: unknown): this {
    this.filters.push({ kind: 'neq', col, val })
    return this
  }
  in(col: string, vals: unknown[]): this {
    this.filters.push({ kind: 'in', col, vals })
    return this
  }
  match(obj: Row): this {
    this.filters.push({ kind: 'match', obj })
    return this
  }
  order(col: string, opts?: { ascending?: boolean }): this {
    this.orderBy = { col, asc: opts?.ascending !== false }
    return this
  }
  limit(n: number): this {
    this.limitN = n
    return this
  }
  single(): this {
    this.wantSingle = true
    return this
  }
  maybeSingle(): this {
    this.wantSingle = true
    return this
  }

  // 쓰기 계열 — 전부 no-op.
  update(_values: unknown): this {
    this.isWrite = true
    return this
  }
  insert(_values: unknown): this {
    this.isWrite = true
    return this
  }
  upsert(_values: unknown): this {
    this.isWrite = true
    return this
  }
  delete(): this {
    this.isWrite = true
    return this
  }

  private compute(): QueryResult {
    if (this.isWrite) return { data: null, error: null }

    let rows = demoTableRows(this.table).slice()
    for (const f of this.filters) {
      if (f.kind === 'eq') rows = rows.filter((r) => r[f.col] === f.val)
      else if (f.kind === 'neq') rows = rows.filter((r) => r[f.col] !== f.val)
      else if (f.kind === 'in')
        rows = rows.filter((r) => f.vals.includes(r[f.col]))
      else
        rows = rows.filter((r) =>
          Object.entries(f.obj).every(([k, v]) => r[k] === v),
        )
    }

    if (this.orderBy) {
      const { col, asc } = this.orderBy
      rows.sort((a, b) => {
        const av = a[col]
        const bv = b[col]
        if (av === bv) return 0
        const cmp = (av as never) > (bv as never) ? 1 : -1
        return asc ? cmp : -cmp
      })
    }

    if (this.limitN != null) rows = rows.slice(0, this.limitN)

    if (this.wantSingle) return { data: rows[0] ?? null, error: null }
    return { data: rows, error: null }
  }

  then<TResult1 = QueryResult, TResult2 = never>(
    onfulfilled?:
      | ((value: QueryResult) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this.compute()).then(onfulfilled, onrejected)
  }
}

/** 데모 세션용 최소 supabase 클라이언트(스냅샷 백엔드). */
export function createDemoClient() {
  return {
    from(table: string): DemoQuery {
      return new DemoQuery(table)
    },
    auth: {
      async getUser() {
        return { data: { user: null }, error: null }
      },
    },
    storage: {
      from() {
        return {
          getPublicUrl(path: string) {
            return { data: { publicUrl: path } }
          },
          async upload() {
            return { data: null, error: null }
          },
        }
      },
    },
  }
}
