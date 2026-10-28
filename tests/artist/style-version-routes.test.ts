// 작품 스타일 기록 서버 — v1 은 처음 필요할 때 생기고, [다시 만들기]는 지금 버전을 버전 폴더에 남긴 뒤 새 버전 · 새 스타일을 열고, 불러오기는 그 버전 그림과 스타일로 돌린다 (2026-10-28 오너)
import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { memorySupabase, mediaUrlOf, type Row } from '../fixtures/_memory-supabase'

const state = vi.hoisted(() => ({
  db: null as unknown as ReturnType<typeof import('../fixtures/_memory-supabase').memorySupabase>,
  access: { ok: true } as { ok: boolean },
  run: null as unknown,
}))

vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: new Proxy({}, { get: (_target, key) => (state.db.client as unknown as Record<string | symbol, unknown>)[key] }),
}))
vi.mock('@/lib/demo/guard-server', () => ({ demoWriteBlock: () => null }))
vi.mock('@/lib/api/guard', () => ({
  requireProjectAccess: vi.fn(async (_req: Request, projectId: string) =>
    state.access.ok
      ? { ok: true, projectId, userId: 'owner-1', viaShare: false }
      : { ok: false, response: Response.json({ error: 'Forbidden' }, { status: 403 }) }),
}))
vi.mock('@/lib/writer/run-store', () => ({ getActiveRun: vi.fn(async () => state.run) }))

import { GET as getVersions } from '@/app/api/artist/versions/route'
import { POST as regenerate } from '@/app/api/artist/versions/regenerate/route'
import { POST as loadVersion } from '@/app/api/artist/versions/load/route'
import { POST as regenProgress } from '@/app/api/artist/versions/regen/route'
import { POST as selectCandidate } from '@/app/api/artist/select-candidate/route'

const P = 'p1'
const WS = 'ws1'
const file = (name: string) => `${WS}/${P}/characters/${name}`
const place = (name: string) => `${WS}/${P}/locations/${name}`
const URLS = {
  minho: mediaUrlOf(file('minho_current_main_g0.png')),
  minhoFace: mediaUrlOf(file('minho_current_main_g0_portrait.png')),
  young: mediaUrlOf(file('minho_young_main_g0.png')),
  youngFace: mediaUrlOf(file('minho_young_main_g0_portrait.png')),
  soonja: mediaUrlOf(file('soonja_current_main.png')),
  soonjaFace: mediaUrlOf(file('soonja_current_portrait.png')),
  hall: mediaUrlOf(place('hall_wide_shot_g0.png')),
  night: mediaUrlOf(place('hall_night_wide_shot_g0.png')),
}
const T0 = '2026-10-27T00:00:00.000Z'
const REAL_L1 = { art_style: 'live_action', line_quality: 'none', shape_language: 'natural', texture_philosophy: 'photorealistic', character_proportion: '7.5:1' }

function seed(extra: Record<string, Row[]> = {}) {
  const db = memorySupabase({
    projects: [{ id: P, workspace_id: WS, current_stage: 'artist', style_anchor_key: 'real', custom_style_anchor: null, design_tokens: { l0: { aspect_ratio: '16:9' }, l1: REAL_L1, palette: { primary: '#111111' } } }],
    style_anchors: [
      { key: 'real', label: '실사', is_active: true, preview_url: 'https://img/real.png', medium: 'live_action' },
      { key: 'watercolor', label: '수채화', is_active: true, preview_url: 'https://img/wc.png', medium: 'watercolor' },
    ],
    characters: [
      { project_id: P, character_id: 'minho', name: '민호', entity_type: 'person' },
      { project_id: P, character_id: 'soonja', name: '순자', entity_type: 'person' },
    ],
    character_appearances: [
      { project_id: P, character_id: 'minho', appearance_key: 'current', is_default: true, sheet_url: URLS.minho, portrait_url: URLS.minhoFace, derived_from_url: null },
      { project_id: P, character_id: 'minho', appearance_key: 'young', is_default: false, sheet_url: URLS.young, portrait_url: URLS.youngFace, derived_from_url: null },
      { project_id: P, character_id: 'soonja', appearance_key: 'current', is_default: true, sheet_url: URLS.soonja, portrait_url: URLS.soonjaFace, derived_from_url: null },
    ],
    character_image_candidates: [
      { id: 'cand-minho', project_id: P, character_id: 'minho', appearance_key: 'current', view: 'main', url: URLS.minho, source_hash: 'sh-minho', appearance_hash: 'ah-minho', is_selected: true, pinned: false, generated_at: T0 },
      { id: 'cand-young', project_id: P, character_id: 'minho', appearance_key: 'young', view: 'main', url: URLS.young, source_hash: 'sh-young', appearance_hash: 'ah-young', is_selected: true, pinned: false, generated_at: T0 },
      { id: 'cand-soonja', project_id: P, character_id: 'soonja', appearance_key: 'current', view: 'main', url: URLS.soonja, source_hash: 'sh-soonja', appearance_hash: 'ah-soonja', is_selected: true, pinned: false, generated_at: T0 },
    ],
    locations: [{ project_id: P, location_id: 'hall', name: '회사 복도', wide_shot: URLS.hall }],
    location_appearances: [{ project_id: P, location_id: 'hall', appearance_key: 'night', label: '밤', wide_shot: URLS.night }],
    location_image_candidates: [
      { id: 'lc-hall', project_id: P, location_id: 'hall', view: 'wide_shot', variant_key: null, url: URLS.hall, source_hash: 'sh-hall', appearance_hash: 'ah-hall', is_selected: true, pinned: false, generated_at: T0 },
      { id: 'lc-night', project_id: P, location_id: 'hall', view: 'wide_shot', variant_key: 'night', url: URLS.night, source_hash: 'sh-night', appearance_hash: 'ah-night', is_selected: true, pinned: false, generated_at: T0 },
    ],
    generation_jobs: [],
    shots: [],
    artist_versions: [],
    ...extra,
  }, {
    artist_versions: [{ columns: ['project_id', 'n'] }, { columns: ['project_id'], where: (row) => row.is_current === true }],
    character_image_candidates: [{ columns: ['project_id', 'character_id', 'appearance_key', 'view'], where: (row) => row.is_selected === true }],
    location_image_candidates: [{ columns: ['project_id', 'location_id', 'view', 'variant_key'], where: (row) => row.is_selected === true, normalize: { variant_key: (value) => value ?? '' } }],
  })
  for (const url of Object.values(URLS)) {
    const path = new URL(url).pathname.replace('/storage/v1/object/public/media/', '')
    db.objects.set(path, { bytes: Buffer.from(`image:${path}`) })
  }
  return db
}

const post = (path: string, body: unknown) => new NextRequest(`http://localhost${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
const get = (query: string) => new NextRequest(`http://localhost/api/artist/versions?${query}`)
const versionRows = () => state.db.rows('artist_versions')
const appearance = (characterId: string, appearanceKey: string) => state.db.rows('character_appearances').find((row) => row.character_id === characterId && row.appearance_key === appearanceKey)!
const pathOf = (url: unknown) => new URL(String(url)).pathname.replace('/storage/v1/object/public/media/', '')

/** 재생성 뒤 새 그림이 들어온 것처럼 만든다(서버 webhook 이 하는 일). */
function landNewImages(tag: string) {
  const at = new Date(Date.now() + 1000).toISOString()
  for (const row of state.db.rows('character_appearances')) {
    const url = mediaUrlOf(file(`${row.character_id}_${row.appearance_key}_main_${tag}.png`))
    state.db.objects.set(pathOf(url), { bytes: Buffer.from(tag) })
    row.sheet_url = url
    row.portrait_url = mediaUrlOf(file(`${row.character_id}_${row.appearance_key}_main_${tag}_portrait.png`))
    for (const cand of state.db.rows('character_image_candidates')) if (cand.character_id === row.character_id && cand.appearance_key === row.appearance_key) cand.is_selected = false
    state.db.rows('character_image_candidates').push({ id: `cand-${row.character_id}-${row.appearance_key}-${tag}`, project_id: P, character_id: row.character_id, appearance_key: row.appearance_key, view: 'main', url, source_hash: `sh-${tag}`, appearance_hash: 'ah', is_selected: true, pinned: false, generated_at: at })
  }
  const hall = state.db.rows('locations')[0]
  hall.wide_shot = mediaUrlOf(place(`hall_wide_shot_${tag}.png`))
  const night = state.db.rows('location_appearances')[0]
  night.wide_shot = mediaUrlOf(place(`hall_night_wide_shot_${tag}.png`))
  for (const cand of state.db.rows('location_image_candidates')) cand.is_selected = false
  state.db.rows('location_image_candidates').push(
    { id: `lc-hall-${tag}`, project_id: P, location_id: 'hall', view: 'wide_shot', variant_key: null, url: hall.wide_shot, source_hash: 'x', appearance_hash: 'x', is_selected: true, pinned: false, generated_at: at },
    { id: `lc-night-${tag}`, project_id: P, location_id: 'hall', view: 'wide_shot', variant_key: 'night', url: night.wide_shot, source_hash: 'x', appearance_hash: 'x', is_selected: true, pinned: false, generated_at: at },
  )
  for (const slot of ['minho:current', 'minho:young', 'soonja:current']) {
    const [characterId, appearanceKey] = slot.split(':')
    state.db.rows('generation_jobs').push({ id: `job-${slot}-${tag}`, project_id: P, kind: 'character_view', status: 'completed', target: { characterId, appearanceKey, view: 'main' }, created_at: at })
  }
  state.db.rows('generation_jobs').push(
    { id: `job-hall-${tag}`, project_id: P, kind: 'world_shot', status: 'completed', target: { locationId: 'hall', column: 'wide_shot' }, created_at: at },
    { id: `job-night-${tag}`, project_id: P, kind: 'world_shot', status: 'completed', target: { locationId: 'hall', column: 'wide_shot', appearanceKey: 'night' }, created_at: at },
  )
}

beforeEach(() => {
  state.db = seed()
  state.access = { ok: true }
  state.run = null
})

describe('기록 읽기 · v1', () => {
  it('처음 기록을 열면 지금 그림과 지금 스타일로 v1이 생기고, 그 전에는 기록 행을 만들지 않는다', async () => {
    // 왜: 혼자 정한 것 — 이 기능 전에 그린 그림은 v1 이다. 화면을 열기만 해도 행이 생기면 쓰지 않는 프로젝트에도 기록이 쌓인다.
    const plain = await (await getVersions(get(`projectId=${P}`))).json()
    expect(plain).toMatchObject({ versions: [], currentN: 1, completed: false, regen: null })
    expect(versionRows()).toHaveLength(0)

    const opened = await (await getVersions(get(`projectId=${P}&ensure=1`))).json()
    expect(opened.versions).toHaveLength(1)
    expect(opened.versions[0]).toMatchObject({ n: 1, styleId: 'real', current: true })
    // 지금 버전 썸네일은 지금 그림이다(인물 대표 얼굴 · 배경 그림).
    expect(opened.versions[0].thumbs).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'character', id: 'minho', url: URLS.minhoFace }),
      expect.objectContaining({ kind: 'location', id: 'hall', url: URLS.hall }),
    ]))
    expect(versionRows()).toEqual([expect.objectContaining({ project_id: P, n: 1, style_anchor_key: 'real', is_current: true, active: [{ from: null, to: null }] })])
  })

  it('주인이 아니면 기록을 읽거나 바꿀 수 없다', async () => {
    // 왜: 다른 사람 프로젝트의 그림 · 스타일을 바꾸면 안 된다(#access-audit 와 같은 가드).
    state.access = { ok: false }
    expect((await getVersions(get(`projectId=${P}&ensure=1`))).status).toBe(403)
    expect((await regenerate(post('/api/artist/versions/regenerate', { projectId: P, styleAnchorKey: 'watercolor' }))).status).toBe(403)
    expect((await loadVersion(post('/api/artist/versions/load', { projectId: P, n: 1 }))).status).toBe(403)
    expect(versionRows()).toHaveLength(0)
  })
})

describe('[다시 만들기]', () => {
  it('[다시 만들기]를 누르면 지금 버전의 그림을 버전 폴더에 복사해 기록에 남기고, 작품 스타일을 고른 것으로 바꾸고, 인물 · 배경의 모든 모습을 그릴 새 버전 v{n+1}을 연다', async () => {
    // 왜: 오너 "지금 버전을 기록에 남기고, 작품 스타일을 고른 것으로 바꾸고, 인물 시트(모든 모습)와 배경(모든 모습) 전체를 새로 그려 새 버전 v{n+1}".
    //   복사본으로 남겨야 나중에 다시 그리거나 보관 한도로 지워져도 남긴 버전의 그림이 바뀌지 않는다(혼자 정한 것).
    const res = await regenerate(post('/api/artist/versions/regenerate', { projectId: P, styleAnchorKey: 'watercolor' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toMatchObject({ ok: true, n: 2 })
    expect(body.slots.map((slot: { kind: string; id: string; appearanceKey: string | null }) => `${slot.kind}:${slot.id}:${slot.appearanceKey ?? 'default'}`).sort())
      .toEqual(['character:minho:current', 'character:minho:young', 'character:soonja:current', 'location:hall:default', 'location:hall:night'])

    const [v1, v2] = [...versionRows()].sort((a, b) => Number(a.n) - Number(b.n))
    expect(v1).toMatchObject({ n: 1, style_anchor_key: 'real', is_current: false })
    expect((v1.active as Array<{ to: string | null }>)[0].to).toEqual(expect.any(String))
    const snapshot = v1.snapshot as { characters: Array<{ characterId: string; appearanceKey: string; sheet: { url: string; candidateId: string | null; sourceHash: string | null }; portraitUrl: string | null }>; locations: Array<{ locationId: string; appearanceKey: string | null; wideShot: { url: string } }> }
    expect(snapshot.characters).toHaveLength(3)
    expect(snapshot.locations).toHaveLength(2)
    for (const entry of snapshot.characters) {
      expect(pathOf(entry.sheet.url).startsWith(`${WS}/${P}/versions/v1/`)).toBe(true)
      expect(state.db.objects.has(pathOf(entry.sheet.url))).toBe(true)
      expect(pathOf(entry.portraitUrl).startsWith(`${WS}/${P}/versions/v1/`)).toBe(true)
    }
    expect(snapshot.characters.find((entry) => entry.characterId === 'minho' && entry.appearanceKey === 'current')?.sheet).toMatchObject({ candidateId: 'cand-minho', sourceHash: 'sh-minho' })
    for (const entry of snapshot.locations) expect(pathOf(entry.wideShot.url).startsWith(`${WS}/${P}/versions/v1/`)).toBe(true)

    expect(v2).toMatchObject({ n: 2, style_anchor_key: 'watercolor', custom_style_anchor: null, is_current: true })
    expect((v2.regen as { slots: unknown[]; doneAt: string | null }).slots).toHaveLength(5)
    expect(state.db.rows('projects')[0]).toMatchObject({ style_anchor_key: 'watercolor', custom_style_anchor: null })
    // 그림은 화면이 카드마다 다시 그린다 — 서버는 지금 그림을 지우지 않는다.
    expect(appearance('minho', 'current').sheet_url).toBe(URLS.minho)
  })

  it('[완료하기] 뒤(Storyboard 열림)에는 다시 만들기 · 불러오기를 받지 않는다', async () => {
    // 왜: 오너 결정(2) — Storyboard 를 연 뒤에는 러프 · 샷이 지금 그림으로 만들어져 있다. 화면 단추가 꺼져 있어도 서버가 한 번 더 막는다.
    state.db.rows('projects')[0].current_stage = 'writer'
    const regen = await regenerate(post('/api/artist/versions/regenerate', { projectId: P, styleAnchorKey: 'watercolor' }))
    expect(regen.status).toBe(409)
    expect(await regen.json()).toMatchObject({ code: 'artist_completed' })
    const load = await loadVersion(post('/api/artist/versions/load', { projectId: P, n: 1 }))
    expect(load.status).toBe(409)
    expect(await load.json()).toMatchObject({ code: 'artist_completed' })
    expect(state.db.rows('projects')[0].style_anchor_key).toBe('real')
    // 예전 흐름으로 샷까지 만든 프로젝트(산문 확정 없이 샷이 있음)도 끝난 프로젝트다.
    state.db.rows('projects')[0].current_stage = 'artist'
    state.db.rows('shots').push({ project_id: P, shot_id: 's1' })
    state.run = { id: 'run-1', status: 'completed', state: {} }
    expect((await regenerate(post('/api/artist/versions/regenerate', { projectId: P, styleAnchorKey: 'watercolor' }))).status).toBe(409)
    expect((await (await getVersions(get(`projectId=${P}`))).json()).completed).toBe(true)
  })

  it('그림을 그리는 중이거나 재생성 그림이 아직 남았으면 다시 만들기 · 불러오기를 받지 않는다', async () => {
    // 왜: 그리는 중에 버전을 바꾸면 그리던 그림이 다른 버전 · 스타일 카드에 들어간다(혼자 정한 것: 끝난 뒤 다시 누른다).
    state.db.rows('generation_jobs').push({ id: 'job-q', project_id: P, kind: 'character_view', status: 'queued', target: { characterId: 'minho', appearanceKey: 'current', view: 'main' }, created_at: new Date().toISOString() })
    const busy = await regenerate(post('/api/artist/versions/regenerate', { projectId: P, styleAnchorKey: 'watercolor' }))
    expect(busy.status).toBe(409)
    expect(await busy.json()).toMatchObject({ code: 'drawing' })

    state.db.rows('generation_jobs').length = 0
    expect((await regenerate(post('/api/artist/versions/regenerate', { projectId: P, styleAnchorKey: 'watercolor' }))).status).toBe(200)
    // 새 버전의 그림을 아직 하나도 안 그렸다 — 불러오기 · 또 다시 만들기는 기다린다.
    const pending = await loadVersion(post('/api/artist/versions/load', { projectId: P, n: 1 }))
    expect(pending.status).toBe(409)
    expect(await pending.json()).toMatchObject({ code: 'regen_pending' })
    expect((await regenerate(post('/api/artist/versions/regenerate', { projectId: P, styleAnchorKey: 'real' }))).status).toBe(409)
  })

  it('두 창에서 거의 같이 누르면 먼저 바뀐 쪽만 받고 나중 요청은 겹쳤다고 거절한다', async () => {
    // 왜: 같은 버전을 두 번 남기거나 지금 버전이 둘이 되면 기록이 꼬인다(혼자 정한 것: 지금 버전 행의 바뀐 시각을 비교해 바꾼다).
    await getVersions(get(`projectId=${P}&ensure=1`))
    const [a, b] = await Promise.all([
      regenerate(post('/api/artist/versions/regenerate', { projectId: P, styleAnchorKey: 'watercolor' })),
      regenerate(post('/api/artist/versions/regenerate', { projectId: P, styleAnchorKey: 'watercolor' })),
    ])
    expect([a.status, b.status].sort()).toEqual([200, 409])
    const loser = a.status === 409 ? a : b
    expect(await loser.json()).toMatchObject({ code: 'version_conflict' })
    expect(versionRows()).toHaveLength(2)
    expect(versionRows().filter((row) => row.is_current)).toHaveLength(1)
  })

  it('다 그리면 완료 알림은 한 번만 하고, 접수 전에 막힌 칸을 실패로 적으면 이어 그리기가 그 칸을 다시 보내지 않는다', async () => {
    // 왜: 두 화면 · 새로고침이 같은 완료를 두 번 채팅에 남기지 않게 한다. 실패한 칸은 9/11 규칙대로 자동으로 다시 그리지 않는다.
    await regenerate(post('/api/artist/versions/regenerate', { projectId: P, styleAnchorKey: 'watercolor' }))
    const early = await (await regenProgress(post('/api/artist/versions/regen', { projectId: P, n: 2, action: 'finish' }))).json()
    expect(early).toMatchObject({ announced: false, complete: false })

    await regenProgress(post('/api/artist/versions/regen', { projectId: P, n: 2, action: 'fail', slots: ['c:soonja:current'] }))
    const read = await (await getVersions(get(`projectId=${P}`))).json()
    expect(read.regen.states['c:soonja:current']).toBe('failed')
    expect(read.regen.states['c:minho:current']).toBe('todo')

    landNewImages('g2')
    const first = await (await regenProgress(post('/api/artist/versions/regen', { projectId: P, n: 2, action: 'finish' }))).json()
    expect(first).toMatchObject({ announced: true, complete: true, failed: 0 })
    const second = await (await regenProgress(post('/api/artist/versions/regen', { projectId: P, n: 2, action: 'finish' }))).json()
    expect(second).toMatchObject({ announced: false, complete: true })
  })
})

describe('그림 지시의 그림체 값', () => {
  it('[다시 만들기]로 스타일을 바꾸면 그림 지시의 그림체 값이 새 스타일 것으로 바뀌고, 버전을 불러오면 그 버전 때의 값으로 돌아온다', async () => {
    // 왜: 그림체 값이 옛 스타일로 남으면 새 스타일로 다시 그려도 옛 스타일로 나온다(개발 DB e2e 2026-10-28, 애니 → 실사가 애니로 나옴).
    //   색 · 화면 비율처럼 스타일과 상관없는 값은 그대로 둔다.
    await regenerate(post('/api/artist/versions/regenerate', { projectId: P, styleAnchorKey: 'watercolor' }))
    const tokens = () => state.db.rows('projects')[0].design_tokens as { l0: unknown; l1: Record<string, string>; palette: unknown }
    expect(tokens().l1).toMatchObject({ art_style: 'watercolor', texture_philosophy: 'painterly' })
    expect(tokens().palette).toEqual({ primary: '#111111' })
    expect(tokens().l0).toEqual({ aspect_ratio: '16:9' })
    expect((versionRows().find((row) => row.n === 1)?.snapshot as { look?: { l1: unknown } }).look?.l1).toEqual(REAL_L1)
    landNewImages('g2')
    await loadVersion(post('/api/artist/versions/load', { projectId: P, n: 1 }))
    expect(tokens().l1).toEqual(REAL_L1)
  })
})

describe('불러오기', () => {
  it('버전을 불러오면 그 버전의 그림(인물 모습별 시트 · 대표 얼굴, 배경 모습별 그림)으로 돌아가고 작품 스타일도 그 버전 것으로 바뀐다', async () => {
    // 왜: 오너 "그 버전의 그림 전부로 돌아가고 작품 스타일도 그 버전 것으로 바뀐다(다시 그리지 않음)".
    await regenerate(post('/api/artist/versions/regenerate', { projectId: P, styleAnchorKey: 'watercolor' }))
    landNewImages('g2')
    const res = await loadVersion(post('/api/artist/versions/load', { projectId: P, n: 1 }))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true, n: 1, styleKey: 'real' })

    // 카드 기록에 남아 있던 그 그림을 다시 고른다(같은 후보 · 같은 지문) — 대표 얼굴은 남긴 복사본.
    expect(appearance('minho', 'current').sheet_url).toBe(URLS.minho)
    expect(pathOf(appearance('minho', 'current').portrait_url).startsWith(`${WS}/${P}/versions/v1/`)).toBe(true)
    expect(appearance('minho', 'young').sheet_url).toBe(URLS.young)
    expect(appearance('soonja', 'current').sheet_url).toBe(URLS.soonja)
    expect(state.db.rows('character_image_candidates').find((row) => row.id === 'cand-minho')?.is_selected).toBe(true)
    expect(state.db.rows('character_image_candidates').find((row) => row.id === 'cand-minho-current-g2')?.is_selected).toBe(false)
    expect(state.db.rows('locations')[0].wide_shot).toBe(URLS.hall)
    expect(state.db.rows('location_appearances')[0].wide_shot).toBe(URLS.night)
    expect(state.db.rows('location_image_candidates').filter((row) => row.is_selected).map((row) => row.id).sort()).toEqual(['lc-hall', 'lc-night'])
    expect(state.db.rows('projects')[0]).toMatchObject({ style_anchor_key: 'real' })

    const [v1, v2] = [...versionRows()].sort((a, b) => Number(a.n) - Number(b.n))
    expect(v1.is_current).toBe(true)
    expect(v1.active).toHaveLength(2)
    expect(v2.is_current).toBe(false)
    // 떠난 v2 도 그 그림을 버전 폴더에 남긴다 — 다시 불러올 수 있다.
    expect(((v2.snapshot as { characters: Array<{ sheet: { url: string } }> }).characters[0].sheet.url)).toContain(`/versions/v2/`)
  })

  it('그 버전 뒤에 새로 생긴 인물 · 배경은 불러와도 지금 그림을 그대로 둔다', async () => {
    // 왜: 오너 "그 버전 뒤에 새로 생긴 인물 · 배경은 지금 그림을 그대로 둔다" — 지우거나 비우면 [완료하기]가 막힌다.
    await regenerate(post('/api/artist/versions/regenerate', { projectId: P, styleAnchorKey: 'watercolor' }))
    landNewImages('g2')
    const police = mediaUrlOf(file('police_current_main_g9.png'))
    state.db.rows('characters').push({ project_id: P, character_id: 'police', name: '경찰', entity_type: 'person' })
    state.db.rows('character_appearances').push({ project_id: P, character_id: 'police', appearance_key: 'current', is_default: true, sheet_url: police, portrait_url: police, derived_from_url: null })
    expect((await loadVersion(post('/api/artist/versions/load', { projectId: P, n: 1 }))).status).toBe(200)
    expect(appearance('police', 'current').sheet_url).toBe(police)
  })

  it('그 버전의 그림이 카드 기록에서 빠졌어도 불러오면 버전 폴더에 남긴 그림으로 돌아온다', async () => {
    // 왜: 카드 기록은 칸마다 최근 5장만 남는다 — 오래된 버전의 그림은 기록에서 빠져도 버전은 그대로 불러와야 한다.
    await regenerate(post('/api/artist/versions/regenerate', { projectId: P, styleAnchorKey: 'watercolor' }))
    landNewImages('g2')
    state.db.tables.character_image_candidates = state.db.rows('character_image_candidates').filter((row) => row.id !== 'cand-minho')
    expect((await loadVersion(post('/api/artist/versions/load', { projectId: P, n: 1 }))).status).toBe(200)
    const restored = appearance('minho', 'current').sheet_url
    expect(pathOf(restored).startsWith(`${WS}/${P}/versions/v1/`)).toBe(true)
    // 되살린 그림이 카드 기록에 "지금"으로 들어간다(그때의 지문 그대로).
    expect(state.db.rows('character_image_candidates').find((row) => row.url === restored)).toMatchObject({ is_selected: true, source_hash: 'sh-minho', appearance_hash: 'ah-minho' })
  })
})

describe('카드 기록과 스타일', () => {
  it('카드 기록에서 다른 스타일로 그린 그림을 고르면 서버도 받지 않는다', async () => {
    // 왜: 혼자 정한 것 — 화면 단추를 꺼도 채팅 도구가 같은 창구를 부른다. 작품 안에 스타일이 섞이지 않게 서버가 한 번 더 막는다.
    await regenerate(post('/api/artist/versions/regenerate', { projectId: P, styleAnchorKey: 'watercolor' }))
    landNewImages('g2')
    const res = await selectCandidate(post('/api/artist/select-candidate', { projectId: P, characterId: 'soonja', appearanceKey: 'current', view: 'main', candidateId: 'cand-soonja' }))
    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({ code: 'other_style' })
    expect(appearance('soonja', 'current').sheet_url).not.toBe(URLS.soonja)
  })
})
