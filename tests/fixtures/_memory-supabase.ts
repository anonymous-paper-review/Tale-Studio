// 시험용 메모리 Supabase — 표(행 배열) · 보관함(경로 → 바이트)을 메모리에 두고 라우트가 쓰는 쿼리 사슬만 흉내 낸다.
//   여러 표를 오가는 라우트(작품 스타일 기록 등)를 "쿼리 하나 = 모의 하나"로 짜면 시험이 구현 순서를 외우게 된다 —
//   대신 행을 넣고 라우트를 돌린 뒤 행 · 파일을 본다. 유일 제약(부분 유일 포함)은 표마다 적어 주면 23505 로 거절한다.
//   지원: select · eq · neq · is · in · gte · gt · lte · lt · order · limit · maybeSingle · single · insert · update · delete · match,
//   storage.from(bucket).copy · upload · remove · download · info. 열 이름 고르기(select 'a, b')는 무시하고 행 전체를 돌려준다 —
//   단 jsonb 글 꺼내기 별칭(`prose_locked:state->>_proseLocked`)은 그 별칭 칸을 글로 더해 준다. 읽은 열 이름은 log 에 남는다.
//   한 번 읽기는 운영 API 처럼 최대 1000줄(range 로 나눠 읽는다).

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
  /** 읽기를 실패시키는 표(아직 없는 표 등). */
  const failReads = new Set<string>()
  /** 특정 표 · 쓰기 종류를 정해진 횟수만큼 실패시킨다(되돌리기 길 시험). hang 이면 답하지 않는다(함수가 시간 제한에 걸려 멈춘 것처럼). */
  const failOn: Array<{ table: string; op: 'insert' | 'update' | 'delete'; times: number; hang?: boolean }> = []
  /** 표의 쓰기마다 걸리는 시간(ms) — 동시에 몇 개가 함께 도는지(maxInflight) 재려고. */
  const latency: Record<string, number> = {}
  /** 표 → 이 줄 번호부터의 읽기(range)를 실패시킨다(나눠 읽다 중간에 실패하는 경우). */
  const failReadsFrom: Record<string, number> = {}
  /** 받기(download)가 끝나지 않는 파일 경로. */
  const hangDownloads = new Set<string>()
  /** 이 파일에서 복사(copy)하면 끝나지 않는다(함수가 시간 제한에 걸린 것처럼). */
  const hangCopyFrom = new Set<string>()
  /** 표 → 읽기 실패(오류 코드 · 글을 정한다 — 표가 없는 것과 읽기 오류를 가르는 시험). */
  const failReadErrors: Record<string, { code?: string; message: string }> = {}
  /** 이어 읽기(id 보다 뒤 — .gt('id', …))를 실패시키는 표. */
  const failPagedReads = new Set<string>()
  /** 읽기가 끝날 때마다 부르는 갈고리(읽는 사이에 다른 요청이 행을 지우는 경우 등). */
  const afterRead: Array<(table: string) => void> = []
  const MAX_ROWS = 1000
  const inflight: Record<string, number> = {}
  const maxInflight: Record<string, number> = {}

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
    let columns = '*'
    let orderBy: Array<{ column: string; ascending: boolean }> = []
    let limitTo: number | null = null
    let rangeFrom = 0
    let rangeTo: number | null = null
    let pagedAfterId = false

    const run = (): { data: unknown; error: { code?: string; message: string } | null } => {
      if (failReads.has(name) && op === 'select') return { data: null, error: { code: 'PGRST205', message: `Could not find the table 'public.${name}'` } }
      if (failReadErrors[name] && op === 'select') return { data: null, error: { ...failReadErrors[name] } }
      const rule = op !== 'select' ? failOn.find((item) => item.table === name && item.op === op && item.times > 0) : undefined
      if (rule && !rule.hang) {
        rule.times--
        return { data: null, error: { message: `forced ${op} failure on ${name}` } }
      }
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
      if (failReadsFrom[name] != null && rangeFrom >= failReadsFrom[name]) return { data: null, error: { message: `forced read failure on ${name} from row ${rangeFrom}` } }
      if (failPagedReads.has(name) && pagedAfterId) return { data: null, error: { message: `forced paged read failure on ${name}` } }
      if (rangeTo != null) rows = rows.slice(rangeFrom, rangeTo + 1)
      if (limitTo != null) rows = rows.slice(0, limitTo)
      rows = rows.slice(0, MAX_ROWS)
      // jsonb 글 꺼내기 별칭 — "별칭:칸->>열쇠"는 그 칸 안 값을 글로(없으면 null).
      for (const item of columns.split(',').map((part) => part.trim())) {
        const alias = item.match(/^([a-z_][a-z0-9_]*):([a-z_][a-z0-9_]*)->>([A-Za-z_][A-Za-z0-9_]*)$/)
        if (!alias) continue
        for (const row of rows) {
          const holder = row[alias[2]]
          const value = holder && typeof holder === 'object' ? (holder as Row)[alias[3]] : undefined
          row[alias[1]] = value === undefined || value === null ? null : typeof value === 'object' ? JSON.stringify(value) : String(value)
        }
      }
      for (const hook of afterRead) hook(name)
      return { data: rows, error: null }
    }

    /** 쓰기 시간 · 멈춤을 흉내 내고 run 한다. */
    const exec = async (): Promise<{ data: unknown; error: { code?: string; message: string } | null }> => {
      if (op !== 'select') {
        const hang = failOn.find((item) => item.table === name && item.op === op && item.times > 0 && item.hang)
        if (hang) {
          hang.times--
          return new Promise(() => {})
        }
        const wait = latency[name]
        if (wait) {
          inflight[name] = (inflight[name] ?? 0) + 1
          maxInflight[name] = Math.max(maxInflight[name] ?? 0, inflight[name])
          await new Promise((resolve) => setTimeout(resolve, wait))
          inflight[name]--
        }
      }
      return run()
    }

    const q = {
      select: (picked?: string) => {
        if (op === 'select') {
          columns = picked ?? '*'
          log.push({ op: 'select', table: name, detail: columns })
        } else returning = true
        return q
      },
      insert: (rows: Row | Row[]) => { op = 'insert'; payload = rows; return q },
      update: (patch: Row) => { op = 'update'; payload = patch; return q },
      delete: () => { op = 'delete'; return q },
      eq: (column: string, value: unknown) => { filters.push((row) => row[column] === value); return q },
      neq: (column: string, value: unknown) => { filters.push((row) => row[column] !== value); return q },
      is: (column: string, value: unknown) => { filters.push((row) => (row[column] ?? null) === value); return q },
      in: (column: string, values: unknown[]) => { filters.push((row) => values.includes(row[column])); return q },
      gte: (column: string, value: string | number) => { filters.push((row) => (row[column] as string | number) >= value); return q },
      gt: (column: string, value: string | number) => {
        if (column === 'id') pagedAfterId = true
        filters.push((row) => (row[column] as string | number) > value)
        return q
      },
      lte: (column: string, value: string | number) => { filters.push((row) => (row[column] as string | number) <= value); return q },
      lt: (column: string, value: string | number) => { filters.push((row) => (row[column] as string | number) < value); return q },
      match: (values: Row) => { for (const [k, v] of Object.entries(values)) filters.push((row) => row[k] === v); return q },
      order: (column: string, opts?: { ascending?: boolean }) => { orderBy.push({ column, ascending: opts?.ascending !== false }); return q },
      limit: (n: number) => { limitTo = n; return q },
      range: (from: number, to: number) => { rangeFrom = from; rangeTo = to; return q },
      maybeSingle: async () => {
        const result = await exec()
        if (result.error) return result
        const rows = (result.data as Row[] | null) ?? []
        return { data: rows[0] ?? null, error: null }
      },
      single: async () => {
        const result = await exec()
        if (result.error) return result
        const rows = (result.data as Row[] | null) ?? []
        return rows.length === 1 ? { data: rows[0], error: null } : { data: null, error: { message: `expected one row, got ${rows.length}` } }
      },
      then: (resolve: (value: unknown) => unknown, reject?: (error: unknown) => unknown) => exec().then(resolve, reject),
    }
    // reset ordering defaults per builder
    orderBy = []
    return q
  }

  const storage = {
    from: (_bucket: string) => ({
      copy: async (from: string, to: string) => {
        log.push({ op: 'copy', detail: { from, to } })
        if (hangCopyFrom.has(from)) return new Promise(() => {})
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
        if (hangDownloads.has(path)) return new Promise(() => {})
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
    failReads,
    failOn,
    latency,
    maxInflight,
    failReadsFrom,
    hangDownloads,
    failPagedReads,
    afterRead,
    failReadErrors,
    hangCopyFrom,
  }
}

/** 보관함 공개 주소 접두사(시험 env 의 NEXT_PUBLIC_SUPABASE_URL 과 같게 맞춘다). */
export function mediaUrlOf(path: string, base = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://test.supabase.co'): string {
  return `${base.replace(/\/+$/, '')}/storage/v1/object/public/media/${path}`
}
