// 시험용 메모리 Supabase — 표(행 배열) · 보관함(경로 → 바이트)을 메모리에 두고 라우트가 쓰는 쿼리 사슬만 흉내 낸다.
//   여러 표를 오가는 라우트(작품 스타일 기록 등)를 "쿼리 하나 = 모의 하나"로 짜면 시험이 구현 순서를 외우게 된다 —
//   대신 행을 넣고 라우트를 돌린 뒤 행 · 파일을 본다. 유일 제약(부분 유일 포함)은 표마다 적어 주면 23505 로 거절한다.
//   지원: select · eq · neq · is · in · gte · gt · lte · lt · order · limit · maybeSingle · single · insert · update · delete · match,
//   storage.from(bucket).copy · upload · remove · download · info. 열 이름 고르기(select 'a, b')는 무시하고 행 전체를 돌려준다.

export type Row = Record<string, unknown>
export interface UniqueRule {
  columns: readonly string[]
  /** 부분 유일 인덱스(where 조건) — 참인 행끼리만 겹치면 안 된다. */
  where?: (row: Row) => boolean
  /** 열 값을 비교 전에 바꾼다(coalesce 등). */
  normalize?: Partial<Record<string, (value: unknown) => unknown>>
}

type Filter = (row: Row) => boolean

let idCounter = 0
const nextId = () => `id-${++idCounter}`

export function memorySupabase(seed: Record<string, Row[]> = {}, unique: Record<string, UniqueRule[]> = {}) {
  const tables: Record<string, Row[]> = {}
  for (const [name, rows] of Object.entries(seed)) tables[name] = rows.map((row) => ({ ...row }))
  const objects = new Map<string, { bytes: Buffer; contentType?: string }>()
  const log: Array<{ op: string; table?: string; detail?: unknown }> = []
  /** 다음 쓰기를 실패시키는 갈고리 — 표 이름 → 남은 실패 횟수. */
  const failNext: Record<string, number> = {}

  const table = (name: string) => (tables[name] ??= [])

  function violates(name: string, candidate: Row, ignore: Row | null): boolean {
    for (const rule of unique[name] ?? []) {
      if (rule.where && !rule.where(candidate)) continue
      const keyOf = (row: Row) => rule.columns.map((column) => {
        const value = row[column]
        const fn = rule.normalize?.[column]
        return JSON.stringify(fn ? fn(value) : value ?? null)
      }).join('|')
      const key = keyOf(candidate)
      for (const row of table(name)) {
        if (row === ignore) continue
        if (rule.where && !rule.where(row)) continue
        if (keyOf(row) === key) return true
      }
    }
    return false
  }

  function builder(name: string) {
    const filters: Filter[] = []
    let op: 'select' | 'insert' | 'update' | 'delete' = 'select'
    let payload: Row | Row[] | null = null
    let returning = false
    let orderBy: Array<{ column: string; ascending: boolean }> = []
    let limitTo: number | null = null

    const run = (): { data: unknown; error: { code?: string; message: string } | null } => {
      if (failNext[name] && op !== 'select') {
        failNext[name]--
        return { data: null, error: { message: `forced failure on ${name}` } }
      }
      const match = (row: Row) => filters.every((f) => f(row))
      if (op === 'insert') {
        const rows = (Array.isArray(payload) ? payload : [payload as Row]).map((row) => ({ id: nextId(), created_at: new Date().toISOString(), ...row }))
        for (const row of rows) {
          if (violates(name, row, null)) return { data: null, error: { code: '23505', message: `duplicate key value violates unique constraint on ${name}` } }
        }
        table(name).push(...rows)
        log.push({ op: 'insert', table: name, detail: rows })
        return { data: returning ? rows.map((row) => ({ ...row })) : null, error: null }
      }
      if (op === 'update') {
        const hits = table(name).filter(match)
        for (const row of hits) {
          const next = { ...row, ...(payload as Row) }
          if (violates(name, next, row)) return { data: null, error: { code: '23505', message: `duplicate key value violates unique constraint on ${name}` } }
        }
        for (const row of hits) Object.assign(row, payload as Row)
        log.push({ op: 'update', table: name, detail: { patch: payload, count: hits.length } })
        return { data: returning ? hits.map((row) => ({ ...row })) : null, error: null }
      }
      if (op === 'delete') {
        const keep = table(name).filter((row) => !match(row))
        const removed = table(name).length - keep.length
        tables[name] = keep
        log.push({ op: 'delete', table: name, detail: { count: removed } })
        return { data: null, error: null }
      }
      let rows = table(name).filter(match).map((row) => ({ ...row }))
      for (const { column, ascending } of [...orderBy].reverse()) {
        rows = [...rows].sort((a, b) => {
          const x = a[column] as string | number | null
          const y = b[column] as string | number | null
          if (x === y) return 0
          if (x == null) return 1
          if (y == null) return -1
          return (x < y ? -1 : 1) * (ascending ? 1 : -1)
        })
      }
      if (limitTo != null) rows = rows.slice(0, limitTo)
      return { data: rows, error: null }
    }

    const q = {
      select: (_columns?: string) => { if (op === 'select') op = 'select'; else returning = true; return q },
      insert: (rows: Row | Row[]) => { op = 'insert'; payload = rows; return q },
      update: (patch: Row) => { op = 'update'; payload = patch; return q },
      delete: () => { op = 'delete'; return q },
      eq: (column: string, value: unknown) => { filters.push((row) => row[column] === value); return q },
      neq: (column: string, value: unknown) => { filters.push((row) => row[column] !== value); return q },
      is: (column: string, value: unknown) => { filters.push((row) => (row[column] ?? null) === value); return q },
      in: (column: string, values: unknown[]) => { filters.push((row) => values.includes(row[column])); return q },
      gte: (column: string, value: string | number) => { filters.push((row) => (row[column] as string | number) >= value); return q },
      gt: (column: string, value: string | number) => { filters.push((row) => (row[column] as string | number) > value); return q },
      lte: (column: string, value: string | number) => { filters.push((row) => (row[column] as string | number) <= value); return q },
      lt: (column: string, value: string | number) => { filters.push((row) => (row[column] as string | number) < value); return q },
      match: (values: Row) => { for (const [k, v] of Object.entries(values)) filters.push((row) => row[k] === v); return q },
      order: (column: string, opts?: { ascending?: boolean }) => { orderBy.push({ column, ascending: opts?.ascending !== false }); return q },
      limit: (n: number) => { limitTo = n; return q },
      maybeSingle: async () => {
        const result = run()
        if (result.error) return result
        const rows = (result.data as Row[] | null) ?? []
        return { data: rows[0] ?? null, error: null }
      },
      single: async () => {
        const result = run()
        if (result.error) return result
        const rows = (result.data as Row[] | null) ?? []
        return rows.length === 1 ? { data: rows[0], error: null } : { data: null, error: { message: `expected one row, got ${rows.length}` } }
      },
      then: (resolve: (value: unknown) => unknown, reject?: (error: unknown) => unknown) => Promise.resolve(run()).then(resolve, reject),
    }
    // reset ordering defaults per builder
    orderBy = []
    return q
  }

  const storage = {
    from: (_bucket: string) => ({
      copy: async (from: string, to: string) => {
        log.push({ op: 'copy', detail: { from, to } })
        const source = objects.get(from)
        if (!source) return { data: null, error: { message: 'Object not found', statusCode: '404' } }
        if (objects.has(to)) return { data: null, error: { message: 'The resource already exists', statusCode: '409' } }
        objects.set(to, { ...source })
        return { data: { path: to }, error: null }
      },
      upload: async (path: string, data: unknown, opts?: { upsert?: boolean; contentType?: string }) => {
        log.push({ op: 'upload', detail: { path } })
        if (objects.has(path) && !opts?.upsert) return { data: null, error: { message: 'The resource already exists', statusCode: '409' } }
        objects.set(path, { bytes: Buffer.isBuffer(data) ? data : Buffer.from(String(data)), contentType: opts?.contentType })
        return { data: { path }, error: null }
      },
      remove: async (paths: string[]) => {
        log.push({ op: 'remove', detail: { paths } })
        for (const path of paths) objects.delete(path)
        return { data: paths.map((name) => ({ name })), error: null }
      },
      download: async (path: string) => {
        const object = objects.get(path)
        if (!object) return { data: null, error: { message: 'Object not found' } }
        return { data: new Blob([new Uint8Array(object.bytes)]), error: null }
      },
      info: async (path: string) => (objects.has(path) ? { data: { name: path }, error: null } : { data: null, error: { message: 'Object not found' } }),
      list: async () => ({ data: [], error: null }),
    }),
  }

  return {
    client: { from: (name: string) => builder(name), storage },
    tables,
    rows: (name: string) => table(name),
    objects,
    log,
    failNext,
  }
}

/** 보관함 공개 주소 접두사(시험 env 의 NEXT_PUBLIC_SUPABASE_URL 과 같게 맞춘다). */
export function mediaUrlOf(path: string, base = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://test.supabase.co'): string {
  return `${base.replace(/\/+$/, '')}/storage/v1/object/public/media/${path}`
}
