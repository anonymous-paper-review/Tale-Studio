// fal 다중 키 레지스트리 (#fal-key-pool) — 단일 FAL_KEY 전역 싱글턴을 키별 클라이언트 맵으로 대체.
//
// 설계 근거: .claude/docs/2026-09-01/fal-key-pool.md
//   ① fal 잡 status/result 는 제출한 키로만 조회 가능(다른 키면 404) — 그래서 잡마다 fal_key_id
//     를 기록하고, 조회 계열은 그 id 의 client 를 명시적으로 받는다(fal.ts 참고).
//   ② fal 은 초과 제출을 거부하지 않고 큐에 태운다 — 세마포어(maxInflight 상한)는 우리 쪽 책임.
//     pickFalKey 는 headroom(여유량)이 가장 큰 키를 고르는 least-loaded 방식이고, 실제 상한
//     집행은 generation-quota.ts(totalMaxInflight 합산)가 한다 — 여기는 배분만.
import { createFalClient, type FalClient } from '@fal-ai/client'
import { countQueuedJobsByKey } from '@/lib/generation-jobs'

export interface FalKeyEntry {
  id: string
  maxInflight: number
  client: FalClient
}

interface FalKeysEnvEntry {
  id: string
  key: string
  maxInflight: number
}

function parseFalKeysEnv(raw: string): FalKeyEntry[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (e) {
    throw new Error(`FAL_KEYS not set or invalid: not valid JSON (${e instanceof Error ? e.message : String(e)})`)
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error('FAL_KEYS not set or invalid: expected a nonempty JSON array')
  }
  const seenIds = new Set<string>()
  const entries: FalKeyEntry[] = []
  for (const [i, item] of parsed.entries()) {
    if (
      !item
      || typeof item !== 'object'
      || typeof (item as FalKeysEnvEntry).id !== 'string'
      || !(item as FalKeysEnvEntry).id.trim()
      || typeof (item as FalKeysEnvEntry).key !== 'string'
      || !(item as FalKeysEnvEntry).key.trim()
      || typeof (item as FalKeysEnvEntry).maxInflight !== 'number'
      || !Number.isFinite((item as FalKeysEnvEntry).maxInflight)
      || (item as FalKeysEnvEntry).maxInflight <= 0
    ) {
      throw new Error(`FAL_KEYS not set or invalid: entry ${i} must have {id: string, key: string, maxInflight: positive number}`)
    }
    const entry = item as FalKeysEnvEntry
    if (seenIds.has(entry.id)) {
      throw new Error(`FAL_KEYS not set or invalid: duplicate id "${entry.id}"`)
    }
    seenIds.add(entry.id)
    entries.push({
      id: entry.id,
      maxInflight: entry.maxInflight,
      client: createFalClient({ credentials: () => entry.key }),
    })
  }
  return entries
}

// lazy 싱글턴 — 임포트 시점 throw 금지(테스트가 FAL_KEYS 없이도 이 모듈을 import 할 수 있어야 한다).
let cached: FalKeyEntry[] | null = null

export function falKeys(): FalKeyEntry[] {
  if (cached) return cached
  const raw = process.env.FAL_KEYS
  if (!raw || !raw.trim()) {
    throw new Error('FAL_KEYS not set or invalid: environment variable is empty')
  }
  cached = parseFalKeysEnv(raw)
  return cached
}

export function falKeyById(id: string): FalKeyEntry | null {
  return falKeys().find((k) => k.id === id) ?? null
}

export function totalMaxInflight(): number {
  return falKeys().reduce((sum, k) => sum + k.maxInflight, 0)
}

/** 알 수 없는/누락된 키 id — 영구 실패(재시도 무의미)로 취급된다(reconcile 이 터미널 처리). */
export class FalUnknownKeyError extends Error {
  constructor(id: string | null | undefined) {
    super(`unknown fal key id: ${id ?? '(missing)'}`)
    this.name = 'FalUnknownKeyError'
  }
}

/**
 * headroom(maxInflight - inflight)이 가장 큰 키를 고른다. 동률이면 배열 앞쪽(레지스트리 순서 우선).
 * 전부 포화여도 최소부하 키를 반환한다 — 429(quota 게이트)는 generation-quota.ts 의 몫이고,
 * 여기는 "어느 키로 보낼까"만 배분한다(fal 은 초과 제출을 거부하지 않고 큐에 태운다, #fal-key-pool ②).
 */
export async function pickFalKey(): Promise<FalKeyEntry> {
  const keys = falKeys()
  const inflightByKey = await Promise.all(keys.map((k) => countQueuedJobsByKey(k.id)))
  let best = keys[0]
  let bestHeadroom = best.maxInflight - inflightByKey[0]
  for (let i = 1; i < keys.length; i++) {
    const headroom = keys[i].maxInflight - inflightByKey[i]
    if (headroom > bestHeadroom) {
      best = keys[i]
      bestHeadroom = headroom
    }
  }
  return best
}
