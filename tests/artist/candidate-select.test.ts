// 카드 기록에서 예전 그림을 고르면 인물은 대표 얼굴까지 그 그림으로 바뀌고, 배경은 고른 모습의 선택만 바뀐다 (2026-10-28 작품 스타일 기록 작업 중 고침)
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { memorySupabase, mediaUrlOf, type Row } from '../fixtures/_memory-supabase'

const state = vi.hoisted(() => ({
  db: null as unknown as ReturnType<typeof import('../fixtures/_memory-supabase').memorySupabase>,
}))
vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: new Proxy({}, { get: (_target, key) => (state.db.client as unknown as Record<string | symbol, unknown>)[key] }),
}))
vi.mock('@/lib/demo/guard-server', () => ({ demoWriteBlock: () => null }))
vi.mock('@/lib/api/guard', () => ({ requireProjectAccess: vi.fn(async (_req: Request, projectId: string) => ({ ok: true, projectId, userId: 'owner-1', viaShare: false })) }))
vi.mock('@/lib/storage-thumb', async (original) => ({ ...await original<typeof import('@/lib/storage-thumb')>(), uploadThumbnail: vi.fn() }))
vi.mock('@/lib/artist/portrait', () => ({ cropTurnaroundPortrait: vi.fn(async () => Buffer.from('face')) }))

import { POST as selectCandidate } from '@/app/api/artist/select-candidate/route'
import { POST as selectLocationCandidate } from '@/app/api/artist/select-location-candidate/route'

const P = 'p1'
const WS = 'ws1'
const pathOf = (url: unknown) => new URL(String(url)).pathname.replace('/storage/v1/object/public/media/', '')
const OLD = `${WS}/${P}/characters/minho/current_main_g00000001-0000-4000-8000-000000000000.png`
const NEW = `${WS}/${P}/characters/minho/current_main_g00000002-0000-4000-8000-000000000000.png`
const post = (path: string, body: unknown) => new NextRequest(`http://localhost${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

function seed(appearance: Partial<Row> = {}, entityType = 'person') {
  const db = memorySupabase({
    projects: [{ id: P, workspace_id: WS, style_anchor_key: 'real', custom_style_anchor: null }],
    characters: [{ project_id: P, character_id: 'minho', entity_type: entityType }],
    character_appearances: [{ project_id: P, character_id: 'minho', appearance_key: 'current', is_default: true, sheet_url: mediaUrlOf(NEW), portrait_url: mediaUrlOf(NEW.replace(/\.png$/, '_portrait.png')), derived_from_url: null, ...appearance }],
    character_image_candidates: [
      { id: 'old', project_id: P, character_id: 'minho', appearance_key: 'current', view: 'main', url: mediaUrlOf(OLD), is_selected: false, generated_at: '2026-10-27T01:00:00.000Z' },
      { id: 'new', project_id: P, character_id: 'minho', appearance_key: 'current', view: 'main', url: mediaUrlOf(NEW), is_selected: true, generated_at: '2026-10-27T02:00:00.000Z' },
    ],
    locations: [{ project_id: P, location_id: 'hall', wide_shot: mediaUrlOf(`${WS}/${P}/locations/hall_b.png`) }],
    location_appearances: [{ project_id: P, location_id: 'hall', appearance_key: 'night', wide_shot: mediaUrlOf(`${WS}/${P}/locations/night_b.png`) }],
    location_image_candidates: [
      { id: 'hall-a', project_id: P, location_id: 'hall', view: 'wide_shot', variant_key: null, url: mediaUrlOf(`${WS}/${P}/locations/hall_a.png`), is_selected: false, generated_at: '2026-10-27T01:00:00.000Z' },
      { id: 'hall-b', project_id: P, location_id: 'hall', view: 'wide_shot', variant_key: null, url: mediaUrlOf(`${WS}/${P}/locations/hall_b.png`), is_selected: true, generated_at: '2026-10-27T02:00:00.000Z' },
      { id: 'night-a', project_id: P, location_id: 'hall', view: 'wide_shot', variant_key: 'night', url: mediaUrlOf(`${WS}/${P}/locations/night_a.png`), is_selected: false, generated_at: '2026-10-27T01:00:00.000Z' },
      { id: 'night-b', project_id: P, location_id: 'hall', view: 'wide_shot', variant_key: 'night', url: mediaUrlOf(`${WS}/${P}/locations/night_b.png`), is_selected: true, generated_at: '2026-10-27T02:00:00.000Z' },
    ],
    artist_versions: [],
  }, {
    character_image_candidates: [{ columns: ['project_id', 'character_id', 'appearance_key', 'view'], where: (row) => row.is_selected === true }],
    location_image_candidates: [{ columns: ['project_id', 'location_id', 'view', 'variant_key'], where: (row) => row.is_selected === true, normalize: { variant_key: (value) => value ?? '' } }],
  })
  db.objects.set(OLD, { bytes: Buffer.from('old-sheet') })
  db.objects.set(NEW, { bytes: Buffer.from('new-sheet') })
  return db
}

beforeEach(() => {
  state.db = seed()
})

const minho = () => state.db.rows('character_appearances')[0]

describe('인물 카드 기록에서 고르기', () => {
  it('카드 기록에서 인물 그림을 고르면 대표 얼굴도 그 그림에서 다시 잘라 바꾼다', async () => {
    // 왜: 시트만 바뀌고 대표 얼굴은 나중 그림 그대로 남아, 카드 얼굴 · 다른 모습의 얼굴 참고가 고른 그림과 달랐다.
    const res = await selectCandidate(post('/api/artist/select-candidate', { projectId: P, characterId: 'minho', appearanceKey: 'current', view: 'main', candidateId: 'old' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(pathOf(minho().sheet_url)).toBe(OLD)
    expect(pathOf(minho().portrait_url)).toBe(OLD.replace(/\.png$/, '_portrait.png'))
    expect(state.db.objects.has(OLD.replace(/\.png$/, '_portrait.png'))).toBe(true)
    expect(pathOf(body.portraitUrl)).toBe(OLD.replace(/\.png$/, '_portrait.png'))
    expect(state.db.rows('character_image_candidates').filter((row) => row.is_selected).map((row) => row.id)).toEqual(['old'])
  })

  it('작품 스타일 기록을 읽지 못해도(기록 표가 아직 없는 곳) 카드 기록에서 고르기는 지금처럼 된다', async () => {
    // 왜: 스타일 확인은 덧붙인 검사다 — 코드가 마이그레이션보다 먼저 배포돼도 카드 기록 되돌리기가 멈추면 안 된다(혼자 정한 것).
    state.db.failReads.add('artist_versions')
    const res = await selectCandidate(post('/api/artist/select-candidate', { projectId: P, characterId: 'minho', appearanceKey: 'current', view: 'main', candidateId: 'old' }))
    expect(res.status).toBe(200)
    expect(pathOf(minho().sheet_url)).toBe(OLD)
  })

  it('사람이 올린 원본이 있는 모습은 기록에서 골라도 대표 얼굴을 원본 그대로 둔다', async () => {
    // 왜: 올린 사진이 그 인물의 대표 얼굴이다(#image-to-artist) — 시트 크롭으로 덮으면 사람이 고른 얼굴이 사라진다.
    const source = mediaUrlOf(`${WS}/${P}/produce/photo.png`)
    state.db = seed({ derived_from_url: source, portrait_url: source })
    await selectCandidate(post('/api/artist/select-candidate', { projectId: P, characterId: 'minho', appearanceKey: 'current', view: 'main', candidateId: 'old' }))
    expect(pathOf(minho().sheet_url)).toBe(OLD)
    expect(minho().portrait_url).toBe(source)
  })

  it('사물은 기록에서 고른 그림이 그대로 대표 그림이 된다', async () => {
    // 왜: 사물 그림은 시트가 아니라 한 장짜리라 자를 얼굴 칸이 없다(그림을 만들 때와 같은 규칙).
    state.db = seed({}, 'object')
    await selectCandidate(post('/api/artist/select-candidate', { projectId: P, characterId: 'minho', appearanceKey: 'current', view: 'main', candidateId: 'old' }))
    expect(pathOf(minho().portrait_url)).toBe(OLD)
  })
})

describe('배경 카드 기록에서 고르기', () => {
  it('배경 기록에서 그림을 고르면 그 모습의 선택만 바뀌고 다른 모습의 선택은 그대로다', async () => {
    // 왜: 기본 모습 그림을 고르면 다른 모습(밤 등)의 "지금" 표시까지 지워져 그 모습 기록이 비어 보였다.
    const res = await selectLocationCandidate(post('/api/artist/select-location-candidate', { projectId: P, locationId: 'hall', candidateId: 'hall-a' }))
    expect(res.status).toBe(200)
    const selected = state.db.rows('location_image_candidates').filter((row) => row.is_selected).map((row) => row.id).sort()
    expect(selected).toEqual(['hall-a', 'night-b'])
    expect(pathOf(state.db.rows('locations')[0].wide_shot)).toBe(`${WS}/${P}/locations/hall_a.png`)
    expect(pathOf(state.db.rows('location_appearances')[0].wide_shot)).toBe(`${WS}/${P}/locations/night_b.png`)

    await selectLocationCandidate(post('/api/artist/select-location-candidate', { projectId: P, locationId: 'hall', candidateId: 'night-a', appearanceKey: 'night' }))
    expect(state.db.rows('location_image_candidates').filter((row) => row.is_selected).map((row) => row.id).sort()).toEqual(['hall-a', 'night-a'])
  })

  it('배경 기록은 다른 모습의 그림을 고를 수 없다', async () => {
    // 왜: 밤 모습의 그림을 기본 모습 자리에 넣으면 카드와 기록이 서로 다른 모습을 가리킨다.
    const res = await selectLocationCandidate(post('/api/artist/select-location-candidate', { projectId: P, locationId: 'hall', candidateId: 'night-a' }))
    expect(res.status).toBe(404)
    expect(state.db.rows('location_image_candidates').filter((row) => row.is_selected).map((row) => row.id).sort()).toEqual(['hall-b', 'night-b'])
  })
})
