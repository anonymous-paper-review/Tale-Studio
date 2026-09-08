// 인물·배경·무대 표지의 영어 표기는 한 번 정해 저장하고 다음부터는 저장값을 쓴다 (#name-en 2026-09-08, 오너 지시)
//   왜: 러프 요청마다 이름을 새로 번역해 프레임 밖 인물이 "Fairy Clan Chief" 였다가 "Yojeong Sujang" 이 됐다(겨울_8 실측).
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const mocks = vi.hoisted(() => ({
  deriveEnBatch: vi.fn(),
  rows: new Map<string, unknown[]>(),
  updates: [] as Array<{ table: string; patch: Record<string, unknown>; where: Record<string, unknown> }>,
}))

vi.mock('@/lib/writer/i18n/derive-en', () => ({ deriveEnBatch: mocks.deriveEnBatch }))
vi.mock('@/lib/supabase/admin', () => {
  const from = (table: string) => {
    const where: Record<string, unknown> = {}
    const q: Record<string, unknown> = {}
    q.select = () => q
    q.in = () => q
    q.eq = (k: string, v: unknown) => {
      where[k] = v
      return q
    }
    q.then = (resolve: (v: unknown) => unknown) => resolve({ data: mocks.rows.get(table) ?? [], error: null })
    q.update = (patch: Record<string, unknown>) => {
      const u: Record<string, unknown> = {}
      u.eq = (k: string, v: unknown) => {
        where[k] = v
        return u
      }
      u.then = (resolve: (v: unknown) => unknown) => {
        mocks.updates.push({ table, patch, where: { ...where } })
        return resolve({ error: null })
      }
      return u
    }
    return q
  }
  return { supabaseAdmin: { from } }
})

import { ensureEntityNamesEn, ensureStageLandmarkLabelsEn, staleNameRows } from '@/lib/writer/i18n/entity-names'

const read = (rel: string) => readFileSync(path.join(process.cwd(), rel), 'utf8')

beforeEach(() => {
  vi.clearAllMocks()
  mocks.rows.clear()
  mocks.updates.length = 0
  mocks.deriveEnBatch.mockImplementation(async (items: Array<{ id: string; native: string }>) =>
    new Map(items.map((i) => [i.id, `EN(${i.native})`])),
  )
})

describe('이름 영어 표기 — 한 번 정해 저장', () => {
  it('인물·배경의 영어 이름은 처음 한 번 정해 저장하고, 다음 요청은 저장값을 써서 다시 번역하지 않는다', async () => {
    // 왜: 정상 경로 고정 — 요청마다 번역하면 표기가 흔들린다.
    mocks.rows.set('characters', [{ character_id: 'char', name: '용족 수장', name_en: null, name_en_source: null }])
    mocks.rows.set('locations', [{ location_id: 'cliff', name: '수직 암벽', name_en: null, name_en_source: null }])
    const first = await ensureEntityNamesEn('p1')
    expect(first.characters.get('char')).toBe('EN(용족 수장)')
    expect(first.locations.get('cliff')).toBe('EN(수직 암벽)')
    expect(mocks.deriveEnBatch).toHaveBeenCalledTimes(2)
    expect(mocks.updates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ table: 'characters', patch: { name_en: 'EN(용족 수장)', name_en_source: '용족 수장' }, where: expect.objectContaining({ character_id: 'char' }) }),
        expect.objectContaining({ table: 'locations', patch: { name_en: 'EN(수직 암벽)', name_en_source: '수직 암벽' } }),
      ]),
    )
    // 저장된 뒤 — 번역 호출 없음.
    mocks.rows.set('characters', [{ character_id: 'char', name: '용족 수장', name_en: 'Dragon Chief', name_en_source: '용족 수장' }])
    mocks.rows.set('locations', [{ location_id: 'cliff', name: '수직 암벽', name_en: 'Vertical Cliff', name_en_source: '수직 암벽' }])
    mocks.deriveEnBatch.mockClear()
    const second = await ensureEntityNamesEn('p1', { characterIds: ['char'] })
    expect(second.characters.get('char')).toBe('Dragon Chief')
    expect(second.locations.get('cliff')).toBe('Vertical Cliff')
    expect(mocks.deriveEnBatch).not.toHaveBeenCalled()
  })

  it('이름이 바뀌면(저장한 원문과 다르면) 영어 이름을 다시 정한다', async () => {
    // 왜: 사람이 카드에서 이름을 고쳤는데 옛 영어 표기가 프롬프트에 남으면 안 된다.
    const rows = [
      { id: 'a', name: '용족 왕', name_en: 'Dragon Chief', name_en_source: '용족 수장' },
      { id: 'b', name: '요정 수장', name_en: 'Fairy Chief', name_en_source: '요정 수장' },
      { id: 'c', name: '', name_en: null, name_en_source: null },
    ]
    expect(staleNameRows(rows).map((r) => r.id)).toEqual(['a'])
    mocks.rows.set('characters', [{ character_id: 'a', name: '용족 왕', name_en: 'Dragon Chief', name_en_source: '용족 수장' }])
    const r = await ensureEntityNamesEn('p1')
    expect(r.characters.get('a')).toBe('EN(용족 왕)')
    expect(mocks.updates[0]?.patch).toEqual({ name_en: 'EN(용족 왕)', name_en_source: '용족 왕' })
  })

  it('영어 표기를 못 정하면 원문 이름을 그대로 쓰고 저장하지 않는다(다음에 다시 시도)', async () => {
    // 왜: 번역 실패가 빈 이름·잘못된 저장으로 굳으면 안 된다.
    mocks.deriveEnBatch.mockResolvedValue(new Map())
    mocks.rows.set('characters', [{ character_id: 'char', name: '용족 수장', name_en: null, name_en_source: null }])
    const r = await ensureEntityNamesEn('p1')
    expect(r.characters.get('char')).toBe('용족 수장')
    expect(mocks.updates).toEqual([])
  })

  it('무대 표지 라벨의 영어 표기는 첫 파생 뒤 무대에 저장해 다시 쓴다', async () => {
    // 왜: 표지 라벨도 요청마다 번역했다 — 배경 문장의 표기가 샷마다 달라질 수 있다.
    const scenes = [{ scene_id: 'sc_02', stage: { landmarks: [{ id: 'cliff', label: '수직 암벽', x: 0, y: 5 }] } }]
    const first = await ensureStageLandmarkLabelsEn('p1', scenes)
    expect(first.get('sc_02|cliff')).toBe('EN(수직 암벽)')
    expect(mocks.updates[0]).toEqual(
      expect.objectContaining({ table: 'scenes', where: expect.objectContaining({ scene_id: 'sc_02' }) }),
    )
    const saved = (mocks.updates[0].patch.stage as { landmarks: Array<Record<string, unknown>> }).landmarks[0]
    expect(saved.label_en).toBe('EN(수직 암벽)')
    expect(saved.label_en_source).toBe('수직 암벽')
    mocks.deriveEnBatch.mockClear()
    const second = await ensureStageLandmarkLabelsEn('p1', scenes)
    expect(second.get('sc_02|cliff')).toBe('EN(수직 암벽)')
    expect(mocks.deriveEnBatch).not.toHaveBeenCalled()
  })

  it('러프 라우트와 작가 시작은 이름을 요청마다 번역하지 않고 저장된 영어 표기를 읽는다', () => {
    // 왜: 정상 경로 고정 — 호출부가 옛 방식(요청마다 deriveEnBatch)으로 돌아가면 약속이 깨진다.
    const rough = read('src/app/api/writer/rough-storyboard/route.ts')
    expect(rough).toMatch(/ensureEntityNamesEn\(projectId, \{ characterIds/)
    expect(rough).toMatch(/sceneLocationLabelsEn\(/)
    expect(rough).toMatch(/ensureStageLandmarkLabelsEn\(/)
    expect(rough).not.toMatch(/character name \(transliterate to Latin\)/)
    const start = read('src/app/api/writer/start/route.ts')
    expect(start).toMatch(/ensureEntityNamesEn\(projectId\)/)
  })
})
