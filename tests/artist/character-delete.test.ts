// 채팅으로 만들어진 인물 카드는 산문 · 씬 · 샷이 쓰지 않고 그리는 중도 아니면 Artist 카드에서 지울 수 있고, 지우면 다시 생기지 않는다 (2026-10-27 디자이너 QA 1차)
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// 개발 DB 대신 쓰는 메모리 표 — 서버 라우트(supabaseAdmin)와 화면(브라우저 클라이언트)이 같은 표를 본다.
const fake = vi.hoisted(() => {
  type Row = Record<string, unknown>
  const tables: Record<string, Row[]> = {}
  function query(table: string) {
    let op: 'select' | 'update' | 'delete' = 'select'
    let patch: Row = {}
    let returning = false
    const filters: Array<(row: Row) => boolean> = []
    const rows = () => (tables[table] ??= [])
    const run = (): Row[] | null => {
      const hit = rows().filter((row) => filters.every((f) => f(row)))
      if (op === 'update') {
        for (const row of hit) Object.assign(row, structuredClone(patch))
        return returning ? hit : null
      }
      if (op === 'delete') {
        tables[table] = rows().filter((row) => !hit.includes(row))
        return null
      }
      return hit.map((row) => structuredClone(row))
    }
    const builder = {
      select: () => { if (op !== 'select') returning = true; return builder },
      update: (value: Row) => { op = 'update'; patch = value; return builder },
      delete: () => { op = 'delete'; return builder },
      eq: (column: string, value: unknown) => { filters.push((row) => row[column] === value); return builder },
      in: (column: string, values: unknown[]) => { filters.push((row) => values.includes(row[column])); return builder },
      order: () => builder,
      maybeSingle: async () => ({ data: run()?.[0] ?? null, error: null }),
      single: async () => {
        const data = run()?.[0] ?? null
        return data ? { data, error: null } : { data: null, error: { message: 'No rows' } }
      },
      then: (resolve: (value: { data: Row[] | null; error: null }) => unknown, reject?: (reason: unknown) => unknown) =>
        Promise.resolve({ data: run(), error: null }).then(resolve, reject),
    }
    return builder
  }
  return { tables, query }
})
vi.mock('@/lib/demo/guard-server', () => ({ demoWriteBlock: () => null }))
vi.mock('@/lib/api/guard', () => ({ requireProjectAccess: async (_req: Request, projectId: string) => ({ ok: true, projectId, userId: 'owner', viaShare: false }) }))
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: (table: string) => fake.query(table) } }))
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ from: (table: string) => fake.query(table) }),
  createCatalogClient: () => ({ from: (table: string) => fake.query(table) }),
}))
vi.mock('@/lib/chat-persistence', () => ({ saveChatMessage: vi.fn(), saveChatTrace: vi.fn(), saveChatTracePatch: vi.fn(), loadLatestChatTrace: vi.fn() }))
// 서버 렌더(renderToStaticMarkup)는 스토어의 처음 언어(en)를 읽는다 — 한국어 화면 문구로 확인하려고 단추의 t 만 한국어로 고정한다.
vi.mock('@/lib/i18n', async (original) => {
  const actual = await original<typeof import('@/lib/i18n')>()
  return { ...actual, useT: () => (text: string, params?: Record<string, string | number>) => actual.translate('ko', text, params) }
})

import { DELETE } from '@/app/api/artist/character/route'
import { CharacterDeleteButton } from '@/features/artist/character-delete-button'
import { characterUsage, removeCharacterFromProducerDraft } from '@/lib/artist/character-delete'
import { deleteChatMadeCharacter } from '@/lib/artist/character-delete-client'
import { breakdownRows } from '@/lib/artist/breakdown'
import { translate } from '@/lib/i18n/translate'
import { useArtistStore } from '@/stores/artist-store'
import { useProducerStore } from '@/stores/producer-store'
import { useProjectStore } from '@/stores/project-store'
import { useLocaleStore } from '@/stores/locale-store'

const PROJECT = 'project-qa'
const card = (id: string) => useArtistStore.getState().characterAssets.find((c) => c.characterId === id)!
const castNames = () => breakdownRows(useProducerStore.getState().cast, useProducerStore.getState().backgrounds).map((row) => row.name)
const deleteRequest = (characterId: string) => new Request('http://localhost/api/artist/character', {
  method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId: PROJECT, characterId }),
})
const look = (characterId: string) => ({
  project_id: PROJECT, character_id: characterId, appearance_key: 'current', label: '현재', is_default: true, narrative_time: 'present',
  sheet_url: null, portrait_url: null, appearance: null, appearance_native: null, derived_from_url: null, costume: null,
})

/** 산문에서 나온 도윤(씬 · 샷에 나옴)과, Artist 채팅으로 만들어진 경찰관(아무 데도 안 쓰임). */
function seed() {
  for (const key of Object.keys(fake.tables)) delete fake.tables[key]
  Object.assign(fake.tables, {
    projects: [{
      id: PROJECT, story_text: '도윤은 비 오는 골목에서 오래된 편지를 찾는다.', settings: {}, last_writer_run_id: null,
      style_anchor_key: 'real', custom_style_anchor: null, design_tokens: null,
      producer_draft: {
        version: 1, savedAt: 1, storyText: '도윤은 비 오는 골목에서 오래된 편지를 찾는다.', storyReady: true, settings: {},
        cast: [
          { localId: 'cast_doyun', characterId: 'char_doyun', name: '도윤', entityType: 'person', appearance: '검은 코트', origin: 'treatment' },
          // 예전 채팅이 만든 경찰관이 DB 에서 이름으로 접혀 들어와 초안에 저장된 줄.
          { localId: 'row-police', characterId: 'char_new_police', name: '경찰관', entityType: 'person', appearance: '남색 제복', origin: 'producer' },
        ],
        backgrounds: [{ localId: 'bg_alley', locationId: 'loc_alley', name: '빗속 골목', visualDescription: '비 오는 밤 골목', purpose: '' }],
      },
    }],
    characters: [
      { id: 'row-doyun', project_id: PROJECT, character_id: 'char_doyun', name: '도윤', role: 'protagonist', entity_type: 'person', origin: 'producer', appearance: 'black coat', appearance_native: '검은 코트' },
      { id: 'row-police', project_id: PROJECT, character_id: 'char_new_police', name: '경찰관', role: 'supporting', entity_type: 'person', origin: 'user', appearance: 'navy uniform', appearance_native: '남색 제복' },
    ],
    character_appearances: [look('char_doyun'), look('char_new_police')],
    character_image_candidates: [],
    locations: [{ id: 'row-alley', project_id: PROJECT, location_id: 'loc_alley', name: '빗속 골목', visual_description: 'rainy alley', origin: 'producer' }],
    location_image_candidates: [],
    location_appearances: [],
    scenes: [{ project_id: PROJECT, scene_id: 'scene_1', narrative_summary: '골목에서 편지를 찾는다', location: 'loc_alley', characters_present: ['char_doyun'], sort_order: 0 }],
    shots: [{ project_id: PROJECT, shot_id: 'shot_1', scene_id: 'scene_1', characters: ['char_doyun'], character_appearance_keys: { char_doyun: 'current' }, dialogue_lines: [{ characterId: 'char_doyun', text: '여기 있었네.' }], director_refs: null }],
    scene_character_appearance_overrides: [],
    generation_jobs: [],
  })
}

let fetchMock: ReturnType<typeof vi.fn>
beforeEach(async () => {
  seed()
  useLocaleStore.setState({ locale: 'ko' })
  useProjectStore.setState({ projectId: PROJECT, currentStage: 'artist', reachedStage: 'artist', producerLocked: true, treatmentDraft: false })
  useArtistStore.setState({ characterAssets: [], worldAssets: [], sceneManifest: null, generatingViews: [], viewFailures: {}, selectedCharacterId: null, error: null })
  useProducerStore.getState().reset()
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (String(url) === '/api/artist/character' && init?.method === 'DELETE') return DELETE(new Request(`http://localhost${url}`, init))
    if (String(url).startsWith('/api/artist/generation-status')) return Response.json({ failures: [], queuedMain: [], worldFailures: [], queuedWorld: [] })
    return Response.json({})
  })
  vi.stubGlobal('fetch', fetchMock)
  await useArtistStore.getState().loadData()
})
afterEach(() => {
  vi.unstubAllGlobals()
  useLocaleStore.setState({ locale: 'en' })
})

describe('채팅으로 만들어진 인물 카드 지우기(디자이너 QA 1차 #04)', () => {
  it('채팅으로 만들어진 인물이 산문 · 씬 · 샷 어디에도 쓰이지 않으면 카드에서 지울 수 있다', async () => {
    // 왜: 잘못 추가된 카드를 지울 방법이 없어 "새 프로젝트를 만들어야 해요"라는 답만 받았다(디자이너 QA 1차 #04).
    expect(card('char_new_police').origin).toBe('user')
    const button = renderToStaticMarkup(createElement(CharacterDeleteButton, { character: card('char_new_police') }))
    expect(button).toContain('aria-label="이 인물 지우기"')
    expect(translate('ko', 'This character is not in the prose, so you can delete it. Delete the {name} card? A deleted card cannot be restored.', { name: '경찰관' }))
      .toBe('산문에 없는 인물이라 지울 수 있어요. 경찰관 카드를 지울까요? 지운 카드는 되돌릴 수 없어요.')

    const result = await deleteChatMadeCharacter('char_new_police')
    expect(result).toEqual({ ok: true, message: '경찰관 카드를 지웠어요.' })
    expect(fake.tables.characters.map((row) => row.character_id)).toEqual(['char_doyun'])
    expect(useArtistStore.getState().characterAssets.map((c) => c.name)).toEqual(['도윤'])
  })

  it('산문에서 나온 인물에는 지우기 단추가 없다', async () => {
    // 왜: 산문이 만든 인물은 산문에서만 고친다(디자이너 QA 1차 #04 · 오너 "채팅 추가 막고 안내"). 단추가 보이면 산문과 카드가 다시 어긋난다.
    const doyun = card('char_doyun')
    expect(doyun.origin).toBe('producer')
    expect(renderToStaticMarkup(createElement(CharacterDeleteButton, { character: doyun }))).toBe('')
    expect(renderToStaticMarkup(createElement(CharacterDeleteButton, { character: { ...doyun, origin: 'writer' } }))).toBe('')
    // 주소를 직접 불러도 서버가 산문 인물은 지우지 않는다.
    const response = await DELETE(deleteRequest('char_doyun'))
    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({ code: 'from_prose' })
    expect(fake.tables.characters.some((row) => row.character_id === 'char_doyun')).toBe(true)
    // 인물 카드에 이 단추가 달려 있다.
    expect(readFileSync('src/features/artist/character-panel.tsx', 'utf8')).toMatch(/<CharacterDeleteButton character=\{char\} \/>/)
  })

  it('씬이나 샷에 쓰이는 인물은 지우지 않고 그 까닭을 알린다', async () => {
    // 왜: 씬 · 샷이 이 인물을 부르고 있는데 카드를 지우면 스토리보드 · 대사가 빈 인물을 가리킨다(디자이너 QA 1차 #04 지우기의 안전 조건).
    fake.tables.scenes.push({ project_id: PROJECT, scene_id: 'scene_2', characters_present: ['char_new_police'], sort_order: 1 })
    fake.tables.shots.push({ project_id: PROJECT, shot_id: 'shot_2', scene_id: 'scene_2', characters: [], character_appearance_keys: {}, dialogue_lines: [{ characterId: 'char_new_police', text: '멈춰요.' }], director_refs: null })
    const result = await deleteChatMadeCharacter('char_new_police')
    expect(result).toEqual({ ok: false, message: '경찰관 카드는 씬 1개와 샷 1개에 쓰여서 지우지 않았어요.' })
    expect(fake.tables.characters.some((row) => row.character_id === 'char_new_police')).toBe(true)
    expect(card('char_new_police')).toBeTruthy()

    // 씬 · 샷이 인물을 부르는 자리는 모두 본다(등장 인물 · 샷 인물 · 샷의 모습 · 대사 · Director 참조 · 씬별 모습).
    const empty = { scenes: [], shots: [], overrides: [] }
    expect(characterUsage('c', { ...empty, shots: [{ shot_id: 's', characters: ['c'] }] })).toEqual({ scenes: 0, shots: 1 })
    expect(characterUsage('c', { ...empty, shots: [{ shot_id: 's', character_appearance_keys: { c: 'current' } }] })).toEqual({ scenes: 0, shots: 1 })
    expect(characterUsage('c', { ...empty, shots: [{ shot_id: 's', director_refs: { characters: ['c'], locations: [] } }] })).toEqual({ scenes: 0, shots: 1 })
    expect(characterUsage('c', { ...empty, overrides: [{ scene_id: 'scene_9', character_id: 'c' }] })).toEqual({ scenes: 1, shots: 0 })
    expect(characterUsage('c', { ...empty, shots: [{ shot_id: 's', characters: ['d'], dialogue_lines: [{ characterId: 'd' }] }] })).toEqual({ scenes: 0, shots: 0 })
  })

  it('그림을 그리는 중인 인물은 지우지 않고 다 그린 뒤 지우라고 알린다', async () => {
    // 왜: 그리는 중에 지우면 다 그린 그림이 없는 카드로 돌아와 실패로 남는다(디자이너 QA 1차 #04 — 채팅으로 만든 카드도 서버 초안이 바로 그렸다).
    const drawing = '경찰관 카드는 지금 그림을 그리는 중이에요. 다 그린 뒤 지워 주세요.'
    // 화면이 그리는 중인 것을 알면 서버에 묻지 않고 알린다.
    useArtistStore.setState({ generatingViews: [{ characterId: 'char_new_police', appearanceKey: 'current', view: 'main' }] })
    expect(await deleteChatMadeCharacter('char_new_police')).toEqual({ ok: false, message: drawing })
    expect(fetchMock.mock.calls.some(([, init]) => (init as RequestInit | undefined)?.method === 'DELETE')).toBe(false)
    // 서버가 그리는 작업을 기다리고 있으면 서버도 지우지 않는다.
    useArtistStore.setState({ generatingViews: [] })
    fake.tables.generation_jobs.push({ id: 'job-1', project_id: PROJECT, kind: 'character_view', status: 'queued', target: { characterId: 'char_new_police', appearanceKey: 'current', view: 'main' } })
    expect(await deleteChatMadeCharacter('char_new_police')).toEqual({ ok: false, message: drawing })
    expect(fake.tables.characters.some((row) => row.character_id === 'char_new_police')).toBe(true)
  })

  it('인물을 지우면 브레이크다운 목록에서도 빠져 다시 생기지 않는다', async () => {
    // 왜: 채팅으로 만든 카드는 산문 초안에 이름으로 접혀 들어가 "확정 산문에서" 나온 것처럼 목록에 보였고, 다시 저장하면 되살아날 수 있었다(디자이너 QA 1차 #04).
    await useProducerStore.getState().loadProject()
    expect(castNames()).toEqual(['도윤', '경찰관', '빗속 골목'])

    expect(await deleteChatMadeCharacter('char_new_police')).toMatchObject({ ok: true })
    expect(castNames()).toEqual(['도윤', '빗속 골목'])
    const draft = fake.tables.projects[0].producer_draft as { cast: Array<{ name: string }> }
    expect(draft.cast.map((member) => member.name)).toEqual(['도윤'])

    // 다시 열어도(산문 초안 + DB 를 다시 읽어도) 돌아오지 않는다.
    useProducerStore.getState().reset()
    await useProducerStore.getState().loadProject()
    expect(castNames()).toEqual(['도윤', '빗속 골목'])
    await useArtistStore.getState().loadData()
    expect(useArtistStore.getState().characterAssets.map((c) => c.name)).toEqual(['도윤'])

    // 초안에서 아이디 없이 이름만 남은 줄은 다른 출처(산문 · 트리트먼트)가 없을 때만 같은 카드로 보고 뺀다.
    const cleaned = removeCharacterFromProducerDraft({ cast: [
      { localId: 'a', name: '경찰관', entityType: 'person', appearance: '' },
      { localId: 'b', name: '경찰관', entityType: 'person', appearance: '', origin: 'treatment' },
    ], backgrounds: [] }, { characterId: 'char_new_police', name: '경찰관' })
    expect(cleaned.changed).toBe(true)
    expect((cleaned.draft as { cast: Array<{ localId: string }> }).cast.map((member) => member.localId)).toEqual(['b'])
  })
})
