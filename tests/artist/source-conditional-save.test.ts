// 저장 승인 시 읽었던 원본과 실제 행이 다르면 새 값으로 덮어쓰지 않는지 확인한다.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  requireProjectAccess: vi.fn(),
  locationI18nFields: vi.fn(),
  appearanceI18nFields: vi.fn(),
}))

vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: mocks.from } }))
vi.mock('@/lib/demo/guard-server', () => ({ demoWriteBlock: () => null }))
vi.mock('@/lib/api/guard', () => ({ requireProjectAccess: mocks.requireProjectAccess }))
vi.mock('@/lib/writer/i18n/derive-en', () => ({
  locationI18nFields: mocks.locationI18nFields,
  appearanceI18nFields: mocks.appearanceI18nFields,
}))

import { POST as saveAppearance } from '@/app/api/artist/appearance/route'
import { PATCH as patchCharacterAppearance } from '@/app/api/artist/character-appearance/route'
import { PATCH as patchLocation } from '@/app/api/artist/location/route'

type Row = Record<string, unknown>
type Filter = { kind: 'eq' | 'is'; field: string; value: unknown }

type UpdateCall = {
  table: string
  patch: Row
  filters: Filter[]
  matchedRows: number
}

type Query = {
  select: (columns?: string) => Query
  update: (patch: Row) => Query
  eq: (field: string, value: unknown) => Query
  is: (field: string, value: unknown) => Query
  maybeSingle: () => Promise<{ data: Row | null; error: null }>
  then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => Promise<unknown>
}

type Database = {
  rows: Record<string, Row[]>
  from: (table: string) => Query
  updates: UpdateCall[]
}

function request(path: string, body: Row, method: 'POST' | 'PATCH') {
  return new Request(`http://localhost${path}`, {
    method,
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  })
}

function selected(row: Row, columns?: string) {
  if (!columns) return { ...row }
  return Object.fromEntries(
    columns
      .split(',')
      .map((column) => column.trim())
      .filter(Boolean)
      .map((column) => [column, row[column]]),
  )
}

function matches(row: Row, filters: Filter[]) {
  return filters.every((filter) => {
    if (filter.kind === 'is') return filter.value === null ? row[filter.field] === null : row[filter.field] === filter.value
    if (filter.value === null) return false
    return row[filter.field] === filter.value
  })
}

function database(initialRows: Record<string, Row[]>): Database {
  const db: Database = {
    rows: initialRows,
    updates: [],
    from: () => {
      throw new Error('from is initialized below')
    },
  }

  db.from = (table: string) => {
    const filters: Filter[] = []
    let operation: 'select' | 'update' = 'select'
    let patch: Row | null = null
    let columns: string | undefined

    const evaluate = () => {
      // 조건을 저장 직전에 실제 행에 적용한다. 경쟁 수정이 있으면 update 호출은 남고
      // matchedRows만 0이 되어, 라우트가 미리 409를 반환하는 가짜 대역을 피한다.
      const rows = db.rows[table] ?? []
      const matchingRows = rows.filter((row) => matches(row, filters))
      if (operation === 'select') {
        return { data: matchingRows.map((row) => selected(row, columns)), error: null }
      }

      const updatePatch = patch ?? {}
      db.updates.push({
        table,
        patch: { ...updatePatch },
        filters: filters.map((filter) => ({ ...filter })),
        matchedRows: matchingRows.length,
      })
      for (const row of matchingRows) Object.assign(row, updatePatch)
      return {
        data: columns ? matchingRows.map((row) => selected(row, columns)) : null,
        error: null,
      }
    }

    const query: Query = {
      select: vi.fn((nextColumns?: string) => {
        columns = nextColumns
        return query
      }),
      update: vi.fn((nextPatch: Row) => {
        operation = 'update'
        patch = nextPatch
        return query
      }),
      eq: vi.fn((field: string, value: unknown) => {
        filters.push({ kind: 'eq', field, value })
        return query
      }),
      is: vi.fn((field: string, value: unknown) => {
        filters.push({ kind: 'is', field, value })
        return query
      }),
      maybeSingle: vi.fn(async () => {
        const result = evaluate()
        const data = Array.isArray(result.data) ? result.data : []
        return { data: data[0] ?? null, error: result.error }
      }),
      then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
        Promise.resolve(evaluate()).then(resolve, reject),
    }
    return query
  }

  return db
}

function locationTranslation(mutate?: () => void) {
  mocks.locationI18nFields.mockImplementation(async (_locationId: string, native: string) => {
    mutate?.()
    return {
      visual_description: `translated:${native}`,
      visual_description_native: native,
      i18n_provenance: {},
    }
  })
}

function appearanceTranslation(mutate?: () => void) {
  mocks.appearanceI18nFields.mockImplementation(async (_characterId: string, native: string) => {
    mutate?.()
    return {
      appearance: `translated:${native}`,
      appearance_native: native,
      i18n_provenance: {},
    }
  })
}

beforeEach(() => {
  vi.resetAllMocks()
  mocks.requireProjectAccess.mockResolvedValue({ ok: true, userId: 'user-1' })
  locationTranslation()
  appearanceTranslation()
})

describe('Artist 원본 확인 저장', () => {
  it('배경 설명 저장 중 다른 수정이 들어오면 새 설명으로 덮어쓰지 않는다', async () => {
    const row = {
      project_id: 'project-1',
      location_id: 'location-1',
      visual_description: 'old description',
      visual_description_native: '옛 배경',
      updated_at: '2026-09-14T08:00:00.000Z',
    }
    const db = database({ locations: [row] })
    mocks.from.mockImplementation(db.from)
    locationTranslation(() => {
      Object.assign(row, {
        visual_description: 'concurrent description',
        visual_description_native: '다른 사람이 고친 배경',
        updated_at: '2026-09-14T08:01:00.000Z',
      })
    })

    const response = await patchLocation(
      request(
        '/api/artist/location',
        {
          projectId: 'project-1',
          locationId: 'location-1',
          visualDescription: '새 배경',
          sourceSnapshot: {
            table: 'locations',
            values: {
              visual_description: 'old description',
              visual_description_native: '옛 배경',
              updated_at: '2026-09-14T08:00:00.000Z',
            },
          },
        },
        'PATCH',
      ),
    )

    expect(response.status).toBe(409)
    expect(db.updates).toHaveLength(1)
    expect(db.updates[0].matchedRows).toBe(0)
    expect(row.visual_description).toBe('concurrent description')
  })

  it('배경 설명의 원본이 일치하면 조건부 저장이 성공한다', async () => {
    const row = {
      project_id: 'project-1',
      location_id: 'location-1',
      visual_description: 'old description',
      visual_description_native: '옛 배경',
      updated_at: '2026-09-14T08:00:00.000Z',
    }
    const db = database({ locations: [row] })
    mocks.from.mockImplementation(db.from)

    const response = await patchLocation(
      request(
        '/api/artist/location',
        {
          projectId: 'project-1',
          locationId: 'location-1',
          visualDescription: '새 배경',
          sourceSnapshot: {
            table: 'locations',
            values: {
              visual_description: 'old description',
              visual_description_native: '옛 배경',
              updated_at: '2026-09-14T08:00:00.000Z',
            },
          },
        },
        'PATCH',
      ),
    )

    expect(response.status).toBe(200)
    expect(db.updates).toHaveLength(1)
    expect(db.updates[0].matchedRows).toBe(1)
    expect(typeof db.updates[0].patch.updated_at).toBe('string')
    expect(row.visual_description).toBe('translated:새 배경')
    expect(row.visual_description_native).toBe('새 배경')
  })

  it('updated_at이 null인 배경도 is(null) 조건으로 원본을 보존한다', async () => {
    const row = {
      project_id: 'project-1',
      location_id: 'location-1',
      visual_description: 'old description',
      visual_description_native: '옛 배경',
      updated_at: null,
    }
    const db = database({ locations: [row] })
    mocks.from.mockImplementation(db.from)

    const response = await patchLocation(
      request(
        '/api/artist/location',
        {
          projectId: 'project-1',
          locationId: 'location-1',
          visualDescription: '새 배경',
          sourceSnapshot: {
            table: 'locations',
            values: {
              visual_description: 'old description',
              visual_description_native: '옛 배경',
              updated_at: null,
            },
          },
        },
        'PATCH',
      ),
    )

    expect(response.status).toBe(200)
    expect(db.updates).toHaveLength(1)
    expect(db.updates[0].matchedRows).toBe(1)
    expect(db.updates[0].filters).toContainEqual({ kind: 'is', field: 'updated_at', value: null })
    expect(typeof db.updates[0].patch.updated_at).toBe('string')
    expect(row.visual_description).toBe('translated:새 배경')
  })

  it('배경 설명의 잘못된 원본은 400이고 update를 실행하지 않는다', async () => {
    const db = database({
      locations: [
        {
          project_id: 'project-1',
          location_id: 'location-1',
          visual_description: 'old description',
          visual_description_native: '옛 배경',
          updated_at: '2026-09-14T08:00:00.000Z',
        },
      ],
    })
    mocks.from.mockImplementation(db.from)

    const response = await patchLocation(
      request(
        '/api/artist/location',
        {
          projectId: 'project-1',
          locationId: 'location-1',
          visualDescription: '새 배경',
          sourceSnapshot: {
            table: 'locations',
            values: {
              visual_description: 'old description',
              visual_description_native: '옛 배경',
              updated_at: '2026-09-14T08:00:00.000Z',
              unexpected_field: 'not allowed',
            },
          },
        },
        'PATCH',
      ),
    )

    expect(response.status).toBe(400)
    expect(db.updates).toHaveLength(0)
  })

  it('기본 인물 모습 저장 중 기본 모습이 교체되면 새 설명으로 덮어쓰지 않는다', async () => {
    const row = {
      project_id: 'project-1',
      character_id: 'character-1',
      appearance_key: 'default',
      is_default: true,
      appearance: 'old appearance',
      appearance_native: '옛 외형',
      updated_at: '2026-09-14T08:00:00.000Z',
    }
    const other = {
      project_id: 'project-1',
      character_id: 'character-1',
      appearance_key: 'alternate',
      is_default: false,
      appearance: 'alternate appearance',
      appearance_native: '다른 외형',
      updated_at: '2026-09-14T08:00:00.000Z',
    }
    const db = database({
      character_appearances: [row, other],
      characters: [{ project_id: 'project-1', character_id: 'character-1', entity_type: 'person' }],
      props: [],
    })
    mocks.from.mockImplementation(db.from)
    appearanceTranslation(() => {
      row.is_default = false
      other.is_default = true
    })

    const response = await saveAppearance(
      request(
        '/api/artist/appearance',
        {
          projectId: 'project-1',
          characterId: 'character-1',
          appearance: '새 외형',
          sourceSnapshot: {
            table: 'character_appearances',
            values: {
              appearance_key: 'default',
              is_default: true,
              appearance: 'old appearance',
              appearance_native: '옛 외형',
              updated_at: '2026-09-14T08:00:00.000Z',
            },
          },
        },
        'POST',
      ),
    )

    expect(response.status).toBe(409)
    expect(db.updates).toHaveLength(1)
    expect(db.updates[0].matchedRows).toBe(0)
    expect(db.updates[0].filters).toContainEqual({ kind: 'eq', field: 'appearance_key', value: 'default' })
    expect(db.updates[0].filters).toContainEqual({ kind: 'eq', field: 'is_default', value: true })
    expect(row.appearance).toBe('old appearance')
  })

  it('기본 인물 모습의 원본이 일치하면 조건부 저장이 성공한다', async () => {
    const row = {
      project_id: 'project-1',
      character_id: 'character-1',
      appearance_key: 'default',
      is_default: true,
      appearance: 'old appearance',
      appearance_native: '옛 외형',
      updated_at: '2026-09-14T08:00:00.000Z',
    }
    const db = database({
      character_appearances: [row],
      characters: [{ project_id: 'project-1', character_id: 'character-1', entity_type: 'person' }],
      props: [],
    })
    mocks.from.mockImplementation(db.from)

    const response = await saveAppearance(
      request(
        '/api/artist/appearance',
        {
          projectId: 'project-1',
          characterId: 'character-1',
          appearance: '새 외형',
          sourceSnapshot: {
            table: 'character_appearances',
            values: {
              appearance_key: 'default',
              is_default: true,
              appearance: 'old appearance',
              appearance_native: '옛 외형',
              updated_at: '2026-09-14T08:00:00.000Z',
            },
          },
        },
        'POST',
      ),
    )

    expect(response.status).toBe(200)
    expect(db.updates).toHaveLength(1)
    expect(db.updates[0].matchedRows).toBe(1)
    expect(row.appearance).toBe('translated:새 외형')
  })

  it('기본 인물 모습의 잘못된 원본은 400이고 update를 실행하지 않는다', async () => {
    const db = database({
      character_appearances: [
        {
          project_id: 'project-1',
          character_id: 'character-1',
          appearance_key: 'default',
          is_default: true,
          appearance: 'old appearance',
          appearance_native: '옛 외형',
          updated_at: '2026-09-14T08:00:00.000Z',
        },
      ],
      characters: [{ project_id: 'project-1', character_id: 'character-1', entity_type: 'person' }],
      props: [],
    })
    mocks.from.mockImplementation(db.from)

    const response = await saveAppearance(
      request(
        '/api/artist/appearance',
        {
          projectId: 'project-1',
          characterId: 'character-1',
          appearance: '새 외형',
          sourceSnapshot: {
            table: 'character_appearances',
            values: {
              appearance_key: 'default',
              is_default: true,
              appearance: 'old appearance',
              appearance_native: '옛 외형',
              updated_at: '2026-09-14T08:00:00.000Z',
              unexpected_field: 'not allowed',
            },
          },
        },
        'POST',
      ),
    )

    expect(response.status).toBe(400)
    expect(db.updates).toHaveLength(0)
  })

  it('소품 외형 저장 중 다른 수정이 들어오면 새 외형으로 덮어쓰지 않는다', async () => {
    const row = {
      project_id: 'project-1',
      prop_id: 'prop-1',
      appearance: 'old prop',
      appearance_native: '옛 소품',
      updated_at: '2026-09-14T08:00:00.000Z',
    }
    const db = database({
      character_appearances: [],
      characters: [],
      props: [row],
    })
    mocks.from.mockImplementation(db.from)
    appearanceTranslation(() => {
      Object.assign(row, {
        appearance: 'concurrent prop',
        appearance_native: '다른 사람이 고친 소품',
        updated_at: '2026-09-14T08:01:00.000Z',
      })
    })

    const response = await saveAppearance(
      request(
        '/api/artist/appearance',
        {
          projectId: 'project-1',
          characterId: 'prop-1',
          appearance: '새 소품',
          sourceSnapshot: {
            table: 'props',
            values: {
              appearance: 'old prop',
              appearance_native: '옛 소품',
              updated_at: '2026-09-14T08:00:00.000Z',
            },
          },
        },
        'POST',
      ),
    )

    expect(response.status).toBe(409)
    expect(db.updates).toHaveLength(1)
    expect(db.updates[0].matchedRows).toBe(0)
    expect(row.appearance).toBe('concurrent prop')
  })

  it('소품 외형의 원본이 일치하면 조건부 저장이 성공한다', async () => {
    const row = {
      project_id: 'project-1',
      prop_id: 'prop-1',
      appearance: 'old prop',
      appearance_native: '옛 소품',
      updated_at: '2026-09-14T08:00:00.000Z',
    }
    const db = database({
      character_appearances: [],
      characters: [],
      props: [row],
    })
    mocks.from.mockImplementation(db.from)

    const response = await saveAppearance(
      request(
        '/api/artist/appearance',
        {
          projectId: 'project-1',
          characterId: 'prop-1',
          appearance: '새 소품',
          sourceSnapshot: {
            table: 'props',
            values: {
              appearance: 'old prop',
              appearance_native: '옛 소품',
              updated_at: '2026-09-14T08:00:00.000Z',
            },
          },
        },
        'POST',
      ),
    )

    expect(response.status).toBe(200)
    expect(db.updates).toHaveLength(1)
    expect(db.updates[0].matchedRows).toBe(1)
    expect(row.appearance).toBe('translated:새 소품')
  })

  it('소품 외형의 잘못된 원본은 400이고 update를 실행하지 않는다', async () => {
    const db = database({
      character_appearances: [],
      characters: [],
      props: [
        {
          project_id: 'project-1',
          prop_id: 'prop-1',
          appearance: 'old prop',
          appearance_native: '옛 소품',
          updated_at: '2026-09-14T08:00:00.000Z',
        },
      ],
    })
    mocks.from.mockImplementation(db.from)

    const response = await saveAppearance(
      request(
        '/api/artist/appearance',
        {
          projectId: 'project-1',
          characterId: 'prop-1',
          appearance: '새 소품',
          sourceSnapshot: {
            table: 'props',
            values: {
              appearance: 'old prop',
              appearance_native: '옛 소품',
              updated_at: '2026-09-14T08:00:00.000Z',
              unexpected_field: 'not allowed',
            },
          },
        },
        'POST',
      ),
    )

    expect(response.status).toBe(400)
    expect(db.updates).toHaveLength(0)
  })

  it('기본 모습 설명 저장 중 기본 모습이 바뀌면 다른 행에 새 설명을 쓰지 않는다', async () => {
    const row = {
      project_id: 'project-1',
      character_id: 'character-1',
      appearance_key: 'default',
      is_default: true,
      appearance: 'old appearance',
      appearance_native: '옛 외형',
      updated_at: '2026-09-14T08:00:00.000Z',
      narrative_time: 'present',
      label: '현재',
    }
    const other = {
      project_id: 'project-1',
      character_id: 'character-1',
      appearance_key: 'alternate',
      is_default: false,
      appearance: 'alternate appearance',
      appearance_native: '다른 외형',
      updated_at: '2026-09-14T08:00:00.000Z',
      narrative_time: 'past',
      label: '과거',
    }
    const db = database({ character_appearances: [row, other] })
    mocks.from.mockImplementation(db.from)
    appearanceTranslation(() => {
      row.is_default = false
      other.is_default = true
    })

    const response = await patchCharacterAppearance(
      request(
        '/api/artist/character-appearance',
        {
          projectId: 'project-1',
          characterId: 'character-1',
          appearanceKey: 'default',
          appearance: '새 외형',
          sourceSnapshot: {
            table: 'character_appearances',
            values: {
              appearance_key: 'default',
              is_default: true,
              appearance: 'old appearance',
              appearance_native: '옛 외형',
              updated_at: '2026-09-14T08:00:00.000Z',
            },
          },
        },
        'PATCH',
      ),
    )

    expect(response.status).toBe(409)
    expect(db.updates).toHaveLength(1)
    expect(db.updates[0].matchedRows).toBe(0)
    expect(db.updates[0].filters).toContainEqual({ kind: 'eq', field: 'appearance_key', value: 'default' })
    expect(db.updates[0].filters).toContainEqual({ kind: 'eq', field: 'is_default', value: true })
    expect(row.appearance).toBe('old appearance')
    expect(other.appearance).toBe('alternate appearance')
  })

  it('기본 모습 설명의 원본이 일치하면 조건부 저장이 성공한다', async () => {
    const row = {
      project_id: 'project-1',
      character_id: 'character-1',
      appearance_key: 'default',
      is_default: true,
      appearance: 'old appearance',
      appearance_native: '옛 외형',
      updated_at: '2026-09-14T08:00:00.000Z',
      narrative_time: 'present',
      label: '현재',
    }
    const db = database({ character_appearances: [row] })
    mocks.from.mockImplementation(db.from)

    const response = await patchCharacterAppearance(
      request(
        '/api/artist/character-appearance',
        {
          projectId: 'project-1',
          characterId: 'character-1',
          appearanceKey: 'default',
          appearance: '새 외형',
          sourceSnapshot: {
            table: 'character_appearances',
            values: {
              appearance_key: 'default',
              is_default: true,
              appearance: 'old appearance',
              appearance_native: '옛 외형',
              updated_at: '2026-09-14T08:00:00.000Z',
            },
          },
        },
        'PATCH',
      ),
    )

    expect(response.status).toBe(200)
    expect(db.updates).toHaveLength(1)
    expect(db.updates[0].matchedRows).toBe(1)
    expect(row.appearance).toBe('translated:새 외형')
  })

  it('기본 모습 설명의 잘못된 원본은 400이고 update를 실행하지 않는다', async () => {
    const db = database({
      character_appearances: [
        {
          project_id: 'project-1',
          character_id: 'character-1',
          appearance_key: 'default',
          is_default: true,
          appearance: 'old appearance',
          appearance_native: '옛 외형',
          updated_at: '2026-09-14T08:00:00.000Z',
          narrative_time: 'present',
          label: '현재',
        },
      ],
    })
    mocks.from.mockImplementation(db.from)

    const response = await patchCharacterAppearance(
      request(
        '/api/artist/character-appearance',
        {
          projectId: 'project-1',
          characterId: 'character-1',
          appearanceKey: 'default',
          appearance: '새 외형',
          sourceSnapshot: {
            table: 'character_appearances',
            values: {
              appearance_key: 'default',
              is_default: true,
              appearance: 'old appearance',
              appearance_native: '옛 외형',
              updated_at: '2026-09-14T08:00:00.000Z',
              unexpected_field: 'not allowed',
            },
          },
        },
        'PATCH',
      ),
    )

    expect(response.status).toBe(400)
    expect(db.updates).toHaveLength(0)
  })
})
