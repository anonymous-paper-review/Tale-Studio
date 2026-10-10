// Writer 가 인물을 저장할 때 사물은 사람으로 저장하지 않고(사물 목록으로), Producer 에서 온 인물의 출처를 덮어쓰지 않는다 (오너 2026-10-10 · 운영 806e2cc2)
import { beforeEach, describe, expect, it, vi } from 'vitest'

const rpcCalls: Array<{ name: string; args: { p_project_id: string; p_people: Array<Record<string, unknown>> } }> = []
const inserts: Array<{ table: string; rows: unknown }> = []
const upserts: Array<{ table: string; rows: Array<Record<string, unknown>>; opts: Record<string, unknown> | undefined }> = []
function chain(table: string) {
  const c: Record<string, unknown> = {}
  for (const m of ['select', 'update', 'delete', 'eq', 'neq', 'order', 'limit', 'in']) c[m] = () => c
  c.upsert = (rows: Array<Record<string, unknown>>, opts?: Record<string, unknown>) => {
    upserts.push({ table, rows, opts })
    return c
  }
  c.insert = (rows: unknown) => {
    inserts.push({ table, rows })
    return c
  }
  c.maybeSingle = () => Promise.resolve({ data: null, error: null })
  c.single = () => Promise.resolve({ data: null, error: null })
  c.then = (ok: (v: unknown) => unknown, err?: (e: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(ok, err)
  return c
}
vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: {
    from: (table: string) => chain(table),
    rpc: (name: string, args: (typeof rpcCalls)[number]['args']) => {
      rpcCalls.push({ name, args })
      return Promise.resolve({ data: null, error: null })
    },
  },
}))
vi.mock('@/lib/writer/i18n/derive-en', () => ({
  deriveEnBatch: async (rows: Array<{ id: string; native: string }>) => new Map(rows.map((r) => [r.id, r.native])),
  deriveNativeBatch: async (rows: Array<{ id: string; en: string }>) => new Map(rows.map((r) => [r.id, r.en])),
  i18nHash: () => 'h',
  isTargetScript: () => true,
}))

import { persistAssetsToDb } from '@/lib/writer/pipeline/util/persist_manifest'

const PROJECT_ID = '00000000-0000-0000-0000-000000000001'
const characters = {
  characters: [
    { id: 'char', name: '남자', role: 'protagonist', entity_type: 'person', appearance_description: '20대 남성' },
    { id: 'char_2', name: '소녀', role: 'protagonist', entity_type: 'person', appearance_description: '작은 체구의 소녀' },
  ],
}

beforeEach(() => {
  rpcCalls.length = 0
  inserts.length = 0
  upserts.length = 0
})
const NOTEBOOK = { id: 'char_3', name: '생활 메모 공책', role: 'supporting', entity_type: 'object', appearance_description: '스프링이 달린 줄 공책' }
const save = (list: Array<Record<string, unknown>>) =>
  persistAssetsToDb(PROJECT_ID, { characters: list } as never, { scenes: [] } as never, { locations: [] } as never, { characters: [] } as never)

describe('Writer 의 인물 저장', () => {
  it('Writer가 인물을 저장할 때 Producer에서 온 인물의 출처를 Writer로 덮어쓰지 않는다', async () => {
    // 왜: 10/10 운영 806e2cc2 — 남자 · 소녀의 출처가 Producer 에서 Writer 로 바뀌었다. 출처는 Artist 가 누가 시트를 그릴지 고르는 근거다.
    //   새로 생기는 인물은 저장 창구가 Writer 출처로 넣고, 이미 있는 인물은 출처를 그대로 둔다.
    await persistAssetsToDb(PROJECT_ID, characters as never, { scenes: [] } as never, { locations: [] } as never, { characters: [] } as never)
    const people = rpcCalls.find((c) => c.name === 'upsert_people_with_default_appearances')?.args.p_people ?? []
    expect(people.map((p) => p.character_id)).toEqual(['char', 'char_2'])
    expect(people.every((p) => !('origin' in p))).toBe(true)
  })

  it('Writer가 인물을 저장할 때 사물(공책 등)은 사람으로 저장하지 않는다', async () => {
    // 왜: 10/10 운영 806e2cc2 — 넘길 때 사물 목록에 맞게 들어간 공책을 Writer 가 사람 전용 저장에 함께 보내 사람으로 한 번 더 생겼고,
    //   Artist 가 사람 시트로 그렸다. 8월에 사물을 사물 목록으로 나눈 구조대로 사람만 저장한다.
    await save([...characters.characters, NOTEBOOK])
    const people = rpcCalls.find((c) => c.name === 'upsert_people_with_default_appearances')?.args.p_people ?? []
    expect(people.map((p) => p.character_id)).toEqual(['char', 'char_2'])
  })

  it('Writer가 새로 만든 사물은 사물 목록에 넣고, 이미 있는 사물은 그대로 둔다', async () => {
    // 왜: 빼기만 하면 Writer 가 이야기에서 새로 찾은 사물이 어디에도 남지 않는다. 넘길 때 들어간 사물(사람이 고친 것)은 덮지 않는다.
    await save([...characters.characters, NOTEBOOK])
    const props = upserts.find((u) => u.table === 'props')
    expect(props?.rows.map((r) => r.prop_id)).toEqual(['char_3'])
    expect(props?.rows[0]).toMatchObject({ project_id: PROJECT_ID, name: '생활 메모 공책', origin: 'writer' })
    expect(props?.opts).toMatchObject({ onConflict: 'project_id,prop_id', ignoreDuplicates: true })
  })
})
