// 메인 생성 한도의 수용량·동시 접수 경쟁·연결 배분·사용자 순서 영향을 실제 제품 함수로 검증한다.
import { writeFileSync } from 'node:fs'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

const boundary = vi.hoisted(() => ({ from: vi.fn(), getUserById: vi.fn(), createFalClient: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: { from: boundary.from, auth: { admin: { getUserById: boundary.getUserById } } },
}))
vi.mock('@fal-ai/client', () => ({ createFalClient: boundary.createFalClient }))

type Category = 'video' | 'image'
type Row = { id: string; user_id: string; status: string; kind: string; fal_key_id: string; created_at: string }
type Observation = { scenario: string; capacity: number; verdict: string; [key: string]: unknown }
const output = process.env.CONCURRENCY_AUDIT_OUTPUT
const observations: Observation[] = []
const rows: Row[] = []
let countUnavailable = false
let sequence = 0
let checkCapacity: typeof import('@/lib/generation-quota').checkGenerationCapacity
let chooseKey: typeof import('@/lib/fal/keys').pickFalKey
let totalLimit: typeof import('@/lib/fal/keys').totalMaxInflight
let globalCount: typeof import('@/lib/generation-jobs').countQueuedJobsGlobal

// DB 연결 경계만 대체한다. 집계 조건은 제품의 generation-jobs.ts가 조립한다.
function table(name: string) {
  const predicates: Array<(row: Row) => boolean> = []
  const self = {
    select: () => self,
    eq: (key: keyof Row, value: unknown) => { predicates.push(row => row[key] === value); return self },
    in: (key: keyof Row, values: unknown[]) => { predicates.push(row => values.includes(row[key])); return self },
    gte: (key: keyof Row, value: string) => { predicates.push(row => row[key] >= value); return self },
    upsert: () => self,
    delete: () => self,
    then: (resolve: (value: { data: Row[]; error: null | { message: string }; count: number | null }) => unknown) => {
      if (name === 'generation_capacity_exempt_users') return Promise.resolve({ data: [], error: null, count: null }).then(resolve)
      if (name !== 'generation_jobs') throw new Error(`Unexpected persistence boundary: ${name}`)
      const result = countUnavailable
        ? { data: [], error: { message: 'Injected count outage' }, count: null }
        : { data: rows.filter(row => predicates.every(test => test(row))), error: null, count: rows.filter(row => predicates.every(test => test(row))).length }
      return Promise.resolve(result).then(resolve)
    },
  }
  return self
}

function insert(user: string, category: Category, key: string, ageMinutes = 0) {
  const row: Row = { id: `job-${++sequence}`, user_id: user, status: 'queued', kind: category === 'video' ? 'shot_video' : 'character_view', fal_key_id: key, created_at: new Date(Date.now() - ageMinutes * 60_000).toISOString() }
  rows.push(row)
  return row
}

function seed(count: number, ageMinutes = 0) {
  for (let index = 0; index < count; index++) insert(`seed-${index}`, 'image', index % 2 ? 'b' : 'a', ageMinutes)
}

function distribution() {
  return Object.fromEntries(['a', 'b'].map(key => [key, rows.filter(row => row.status === 'queued' && row.fal_key_id === key).length]))
}

async function configure(capacity: number) {
  vi.stubEnv('FAL_KEYS', JSON.stringify(['a', 'b'].map(id => ({ id, key: 'fixture-no-network', maxInflight: capacity / 2 }))))
  const quota = await import('@/lib/generation-quota')
  const keys = await import('@/lib/fal/keys')
  const jobs = await import('@/lib/generation-jobs')
  checkCapacity = quota.checkGenerationCapacity
  chooseKey = keys.pickFalKey
  totalLimit = keys.totalMaxInflight
  globalCount = jobs.countQueuedJobsGlobal
  expect(totalLimit()).toBe(capacity)
}

async function submit(user: string, category: Category) {
  const check = await checkCapacity(user, category)
  if (!check.ok) return { accepted: false, check }
  const key = await chooseKey()
  insert(user, category, key.id)
  return { accepted: true, check }
}

function observe(scenario: string, capacity: number, verdict: string, details: Record<string, unknown>) {
  observations.push({ scenario, capacity, verdict, ...details })
}

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  rows.length = 0
  countUnavailable = false
  boundary.from.mockImplementation(table)
  boundary.getUserById.mockImplementation(async (id: string) => ({ data: { user: { email: `${id}@concurrency.invalid` } }, error: null }))
  boundary.createFalClient.mockReturnValue({ queue: {} })
  vi.stubEnv('ADMIN_EMAILS', 'admin@concurrency.invalid')
  vi.stubGlobal('fetch', () => { throw new Error('Network access is forbidden in the capacity function probe') })
})

afterAll(() => {
  if (output) writeFileSync(output, JSON.stringify({
    commit: process.env.CONCURRENCY_AUDIT_COMMIT,
    evidenceLayer: 'actual main functions; in-memory persistence/auth/provider boundaries; forced request interleavings',
    generatedMediaRequests: 0,
    observations,
  }, null, 2) + '\n')
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe.skipIf(!output)('68칸·80칸 메인 함수 동시성 검사', () => {
  for (const capacity of [68, 80]) {
    for (const perUser of [1, 2, 3, 4, 6, 9]) {
      // 왜: 인원 대신 작업 수로 제한하는 정책의 계산과 실제 순차 접수 결과를 비교한다.
      it(`${capacity}칸에서 한 사람당 ${perUser}개를 차례로 요청하면 전체 한도까지만 접수한다`, async () => {
        await configure(capacity)
        const acceptedByUser: number[] = []
        for (let user = 0; user < Math.ceil(capacity / perUser) + 1; user++) {
          let accepted = 0
          for (let task = 0; task < perUser; task++) {
            if ((await submit(`person-${user}`, task < 3 ? 'video' : 'image')).accepted) accepted++
          }
          acceptedByUser.push(accepted)
        }
        observe('sequential_capacity', capacity, '순차 한도 확인', { perUser, accepted: rows.length, fullyServed: acceptedByUser.filter(value => value === perUser).length, partiallyServed: acceptedByUser.filter(value => value > 0 && value < perUser).length, acceptedByUser, byKey: distribution() })
        expect(rows).toHaveLength(capacity)
        expect(acceptedByUser.filter(value => value === perUser)).toHaveLength(Math.floor(capacity / perUser))
        expect(distribution()).toEqual({ a: capacity / 2, b: capacity / 2 })
      })
    }

    it(`${capacity}칸에서 한 사용자의 영상 세 개와 이미지 여섯 개는 허용하고 각각 다음 작업은 거절한다`, async () => {
      await configure(capacity)
      for (let task = 0; task < 9; task++) expect((await submit('one-person', task < 3 ? 'video' : 'image')).accepted).toBe(true)
      const video = await checkCapacity('one-person', 'video')
      const image = await checkCapacity('one-person', 'image')
      observe('individual_split_limits', capacity, '개인별 한도 확인', { active: rows.length, video, image })
      expect(video).toMatchObject({ ok: false, scope: 'user', limit: 3 })
      expect(image).toMatchObject({ ok: false, scope: 'user', limit: 6 })
    })

    it(`${capacity}칸을 이미지가 모두 사용하면 새로운 사용자의 영상도 전체 한도에 걸린다`, async () => {
      await configure(capacity)
      seed(capacity)
      const result = await checkCapacity('new-person', 'video')
      observe('shared_global_slots', capacity, '영상·이미지 전체 한도 공유 확인', { result })
      expect(result).toMatchObject({ ok: false, scope: 'global', limit: capacity })
    })

    // 왜: 실제 SQL 관측과 연결해 이미지 개인 한도의 사전 검사도 같은 읽기 경쟁을 통과하는지 확인한다.
    it(`${capacity}칸에서 이미지 다섯 개를 진행 중인 사용자가 동시에 열두 번 요청해도 개인 한도를 넘지 않는다`, async () => {
      await configure(capacity)
      for (let task = 0; task < 5; task++) insert('image-burst-person', 'image', task % 2 ? 'b' : 'a')
      const checks = await Promise.all(Array.from({ length: 12 }, () => checkCapacity('image-burst-person', 'image')))
      const keys = await Promise.all(checks.map(check => check.ok ? chooseKey() : null))
      keys.forEach(key => { if (key) insert('image-burst-person', 'image', key.id) })
      observe('individual_image_burst', capacity, rows.length > 6 ? '개인 이미지 상한 약속 실패' : '통과', { baseline: 5, arrivals: 12, accepted: keys.filter(Boolean).length, finalActive: rows.length, expectedLimit: 6 })
      expect(rows.length).toBeLessThanOrEqual(6)
    })

    // 왜: 서로 다른 서버 요청이 마지막 한 칸을 동시에 읽고, 접수 전에 모두 검사를 통과할 수 있다.
    it(`${capacity}칸의 마지막 한 자리에 여러 사용자가 동시에 요청해도 전체 접수 한도를 넘지 않는다`, async () => {
      await configure(capacity)
      seed(capacity - 1)
      const users = Array.from({ length: 12 }, (_, index) => `arrival-${index}`)
      const checks = await Promise.all(users.map(user => checkCapacity(user, 'image')))
      // 모든 읽기를 끝낸 뒤 쓰기를 시작하는 장벽: 가능한 최악의 실행 순서이며 발생 확률 측정은 아니다.
      const keys = await Promise.all(checks.map(check => check.ok ? chooseKey() : null))
      keys.forEach((key, index) => { if (key) insert(users[index], 'image', key.id) })
      observe('last_slot_burst', capacity, rows.length > capacity ? '전체 상한 약속 실패' : '통과', { arrivals: users.length, accepted: keys.filter(Boolean).length, finalActive: rows.length, overflow: rows.length - capacity, byKey: distribution(), interleaving: 'all capacity and key reads finish before any persistence' })
      expect(rows.length).toBeLessThanOrEqual(capacity)
    })

    // 왜: 계정 선택 이후 작업 기록 전까지의 틈에 같은 최소부하 계정으로 요청이 몰릴 수 있다.
    it(`${capacity}칸에서 새 요청 쉰 개가 동시에 연결을 골라도 한 연결의 설정 한도를 넘지 않는다`, async () => {
      await configure(capacity)
      const users = Array.from({ length: 50 }, (_, index) => `burst-${index}`)
      const checks = await Promise.all(users.map(user => checkCapacity(user, 'image')))
      const keys = await Promise.all(checks.map(check => check.ok ? chooseKey() : null))
      keys.forEach((key, index) => { if (key) insert(users[index], 'image', key.id) })
      const byKey = distribution()
      observe('empty_pool_key_burst', capacity, Math.max(...Object.values(byKey)) > capacity / 2 ? '계정 쏠림 재현' : '통과', { accepted: rows.length, byKey, configuredPerAccount: capacity / 2, assumedFalPerAccount: 40, hypotheticalFalWaiting: Object.values(byKey).reduce((sum, value) => sum + Math.max(0, value - 40), 0), interleaving: 'all reads finish before writes; external waiting is calculated, not measured' })
      expect(Math.max(...Object.values(byKey))).toBeLessThanOrEqual(capacity / 2)
    })

    it(`${capacity}칸이 찬 뒤 빈자리를 먼저 재신청하는 기존 사용자와 새 사용자의 접수 순서를 관측한다`, async () => {
      await configure(capacity)
      seed(capacity)
      let newcomerAccepted = 0
      let incumbentAccepted = 0
      for (let round = 0; round < 12; round++) {
        const completed = rows.find(row => row.status === 'queued')!
        completed.status = 'completed'
        if ((await submit(completed.user_id, 'image')).accepted) incumbentAccepted++
        if ((await submit('waiting-newcomer', 'image')).accepted) newcomerAccepted++
      }
      observe('incumbent_refill_order', capacity, '선착순 반복 시 새 사용자 대기 재현', { rounds: 12, incumbentAccepted, newcomerAccepted, fairnessGuarantee: false, note: '관측 시나리오이며 공평 배분을 현재 정책으로 추가하지 않는다' })
      expect(incumbentAccepted).toBe(12)
      expect(newcomerAccepted).toBe(0)
    })

    it(`${capacity}칸이 찬 뒤 새 사용자가 빈자리에 먼저 요청하면 그 사용자의 작업이 접수된다`, async () => {
      await configure(capacity)
      seed(capacity)
      const completed = rows[0]
      completed.status = 'completed'
      const newcomer = await submit('newcomer-first', 'image')
      const incumbent = await submit(completed.user_id, 'image')
      observe('newcomer_first_control', capacity, '요청 순서를 바꾼 대조군 확인', { newcomerAccepted: newcomer.accepted, incumbentAccepted: incumbent.accepted })
      expect(newcomer.accepted).toBe(true)
      expect(incumbent.accepted).toBe(false)
    })

    it(`${capacity}칸에서 작업 수 조회가 실패할 때 새 접수를 허용하는지 관측한다`, async () => {
      await configure(capacity)
      seed(capacity)
      countUnavailable = true
      const result = await checkCapacity('count-outage-person', 'image')
      observe('count_outage', capacity, '집계 실패 시 접수 허용 확인', { recordedActive: rows.length, result })
      expect(result.ok).toBe(true)
    })

    it(`${capacity}칸에서 삼십 분을 넘긴 미완료 작업이 집계에서 제외되는지 관측한다`, async () => {
      await configure(capacity)
      seed(capacity, 31)
      const counted = await globalCount()
      const result = await checkCapacity('stale-person', 'image')
      observe('stale_queued_window', capacity, '오래된 미완료 작업의 집계 제외 확인', { recordedActive: rows.length, counted, result, providerStillRunning: '미검증: 실제 외부 상태를 가정하지 않는다' })
      expect(counted).toBe(0)
      expect(result.ok).toBe(true)
    })

    it(`${capacity}칸에서 관리자는 개인 한도를 넘을 수 있지만 전체가 차면 멈춘다`, async () => {
      await configure(capacity)
      for (let task = 0; task < capacity; task++) expect((await submit('admin', 'image')).accepted).toBe(true)
      const result = await checkCapacity('admin', 'image')
      observe('admin_exemption', capacity, '관리자 개인 한도 예외와 전체 한도 확인', { accepted: rows.length, result })
      expect(result).toMatchObject({ ok: false, scope: 'global', limit: capacity })
    })
  }
})
