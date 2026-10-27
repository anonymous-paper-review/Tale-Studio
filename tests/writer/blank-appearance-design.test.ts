// 외형 설명이 빈 인물은 Writer 의 인물 디자인이 만든 외형으로 저장하고, 설명이 있는 인물은 그 설명을 그대로 둔다 (2026-10-27 산문 재점검)
import { beforeEach, describe, expect, it, vi } from 'vitest'

const rpcCalls: Array<{ name: string; args: { p_people: Array<Record<string, unknown>> } }> = []
function chain() {
  const c: Record<string, unknown> = {}
  for (const m of ['select', 'update', 'delete', 'eq', 'neq', 'order', 'limit', 'in', 'upsert', 'insert']) c[m] = () => c
  c.maybeSingle = () => Promise.resolve({ data: null, error: null })
  c.single = () => Promise.resolve({ data: null, error: null })
  c.then = (ok: (v: unknown) => unknown, err?: (e: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(ok, err)
  return c
}
vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: {
    from: () => chain(),
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

const PROJECT_ID = '00000000-0000-0000-0000-000000000002'

beforeEach(() => {
  rpcCalls.length = 0
})

describe('인물 외형 저장', () => {
  it('외형 설명이 빈 인물은 인물 디자인이 만든 외형으로 저장하고 설명이 있는 인물은 그 설명을 그대로 둔다', async () => {
    // 왜: 산문 재점검으로 넣은 인물은 외형 설명 없이 들어간다(프로토타입 "설명은 AI가 산문을 읽고 채워요"). 디자인한 외형을
    //   저장하지 않으면 카드 설명이 비고 인물 시트를 이름 · 의상만으로 그린다. 사람이 정한 설명은 디자인이 덮지 않는다.
    await persistAssetsToDb(
      PROJECT_ID,
      { characters: [
        { id: 'char', name: '민호', role: 'protagonist', entity_type: 'person', appearance_description: '서른 살 회사원, 남색 정장' },
        { id: 'char_4', name: '경비원', role: 'supporting', entity_type: 'person', appearance_description: '' },
      ] } as never,
      { scenes: [] } as never,
      { locations: [] } as never,
      { characters: [
        { character_id: 'char', appearance: '디자인한 다른 외형', costume: [], palette: [] },
        { character_id: 'char_4', appearance: '회색 경비 제복을 입은 쉰 살 남자', costume: ['경비 제복'], palette: [] },
      ] } as never,
    )

    const people = rpcCalls.find((call) => call.name === 'upsert_people_with_default_appearances')?.args.p_people ?? []
    expect(people.find((p) => p.character_id === 'char')).toMatchObject({ appearance: '서른 살 회사원, 남색 정장', appearance_native: '서른 살 회사원, 남색 정장' })
    expect(people.find((p) => p.character_id === 'char_4')).toMatchObject({ appearance: '회색 경비 제복을 입은 쉰 살 남자', appearance_native: '회색 경비 제복을 입은 쉰 살 남자' })
  })
})
