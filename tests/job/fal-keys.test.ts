// 여러 생성 요청이 몰려도 사용 가능한 연결로 나누어 처리하고, 잘못된 설정은 알려준다 (#fal-key-pool)
// fal 다중 키 레지스트리(#fal-key-pool) 회귀 가드.
//   lazy 파싱(모듈 캐시 리셋으로 검증) + least-loaded 선택 + 미지정 키 조회 계약.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  countQueuedJobsByKey: vi.fn<(falKeyId: string) => Promise<number>>(),
}))

vi.mock('@/lib/generation-jobs', () => ({
  countQueuedJobsByKey: mocks.countQueuedJobsByKey,
}))
// @fal-ai/client 는 실제 네트워크 클라이언트 인스턴스를 만든다 — 순수 배분 로직 검증에는
//   자격증명 함수만 보존하는 가벼운 스텁이면 충분하다.
vi.mock('@fal-ai/client', () => ({
  createFalClient: (config: { credentials?: () => string }) => ({
    __credentials: config?.credentials,
    queue: {},
  }),
}))

const ORIGINAL_FAL_KEYS = process.env.FAL_KEYS

beforeEach(() => {
  vi.resetModules()
  mocks.countQueuedJobsByKey.mockReset()
  delete process.env.FAL_KEYS
})

afterEach(() => {
  if (ORIGINAL_FAL_KEYS === undefined) delete process.env.FAL_KEYS
  else process.env.FAL_KEYS = ORIGINAL_FAL_KEYS
})

describe('falKeys — 설정이 잘못된 경우', () => {
  it('설정값이 없으면 오류를 알려준다', async () => {
    const { falKeys } = await import('@/lib/fal/keys')
    expect(() => falKeys()).toThrow(/FAL_KEYS not set or invalid/)
  })

  it('설정 형식을 읽을 수 없으면 오류를 알려준다', async () => {
    process.env.FAL_KEYS = '{not json'
    const { falKeys } = await import('@/lib/fal/keys')
    expect(() => falKeys()).toThrow(/FAL_KEYS not set or invalid/)
  })

  it('사용할 연결 목록이 비어 있으면 오류를 알려준다', async () => {
    process.env.FAL_KEYS = '[]'
    const { falKeys } = await import('@/lib/fal/keys')
    expect(() => falKeys()).toThrow(/FAL_KEYS not set or invalid/)
  })

  it('연결 이름이 중복되면 오류를 알려준다', async () => {
    process.env.FAL_KEYS = JSON.stringify([
      { id: 'a', key: 'k1', maxInflight: 10 },
      { id: 'a', key: 'k2', maxInflight: 10 },
    ])
    const { falKeys } = await import('@/lib/fal/keys')
    expect(() => falKeys()).toThrow(/duplicate id/)
  })

  it('설정 오류는 실제 사용 시점에만 알려준다', async () => {
    // FAL_KEYS 미설정 상태에서 모듈을 import 만 해도 안전해야 한다(테스트/빌드가 env 없이도 돈다).
    await expect(import('@/lib/fal/keys')).resolves.toBeTruthy()
  })
})

describe('pickFalKey — 가장 여유 있는 연결 선택', () => {
  it('처리 여유가 가장 큰 연결로 새 요청을 보낸다', async () => {
    process.env.FAL_KEYS = JSON.stringify([
      { id: 'k1', key: 'secret1', maxInflight: 40 },
      { id: 'k2', key: 'secret2', maxInflight: 40 },
    ])
    const { pickFalKey } = await import('@/lib/fal/keys')
    // k1: headroom 40-30=10, k2: headroom 40-5=35 → k2 선택.
    mocks.countQueuedJobsByKey.mockImplementation(async (id: string) => (id === 'k1' ? 30 : 5))

    const picked = await pickFalKey()

    expect(picked.id).toBe('k2')
  })

  it('여유가 같으면 먼저 등록된 연결을 선택한다', async () => {
    process.env.FAL_KEYS = JSON.stringify([
      { id: 'first', key: 'secret1', maxInflight: 20 },
      { id: 'second', key: 'secret2', maxInflight: 20 },
    ])
    const { pickFalKey } = await import('@/lib/fal/keys')
    mocks.countQueuedJobsByKey.mockResolvedValue(5) // 두 키 모두 headroom 15 동률

    const picked = await pickFalKey()

    expect(picked.id).toBe('first')
  })

  it('모든 연결이 한도에 닿아도 가장 덜 바쁜 연결을 고른다', async () => {
    process.env.FAL_KEYS = JSON.stringify([
      { id: 'over-a', key: 'secret1', maxInflight: 10 },
      { id: 'over-b', key: 'secret2', maxInflight: 10 },
    ])
    const { pickFalKey } = await import('@/lib/fal/keys')
    // over-a: headroom 10-15=-5, over-b: headroom 10-9=1 → over-b (least overloaded) 선택.
    mocks.countQueuedJobsByKey.mockImplementation(async (id: string) => (id === 'over-a' ? 15 : 9))

    const picked = await pickFalKey()

    expect(picked.id).toBe('over-b')
  })
})

describe('falKeyById', () => {
  it('등록되지 않은 연결 이름을 찾으면 없다고 알려준다', async () => {
    process.env.FAL_KEYS = JSON.stringify([{ id: 'known', key: 'secret', maxInflight: 10 }])
    const { falKeyById } = await import('@/lib/fal/keys')

    expect(falKeyById('unknown')).toBeNull()
  })

  it('등록된 연결 이름을 찾으면 해당 연결을 돌려준다', async () => {
    process.env.FAL_KEYS = JSON.stringify([{ id: 'known', key: 'secret', maxInflight: 10 }])
    const { falKeyById } = await import('@/lib/fal/keys')

    expect(falKeyById('known')?.id).toBe('known')
  })
})

describe('totalMaxInflight', () => {
  it('등록된 모든 연결의 처리 한도를 합산한다', async () => {
    process.env.FAL_KEYS = JSON.stringify([
      { id: 'a', key: 's1', maxInflight: 34 },
      { id: 'b', key: 's2', maxInflight: 20 },
    ])
    const { totalMaxInflight } = await import('@/lib/fal/keys')

    expect(totalMaxInflight()).toBe(54)
  })
})
