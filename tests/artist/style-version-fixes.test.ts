// 작품 스타일 기록 서버 검토 지적(2026-10-28) — 불러오다 멈춰도 마저 불러오고, 실패하면 떠난 버전으로 돌아가고, 남긴 그림은 다시 복사하지 않고, 멈춘 재생성은 그만두고 돌아갈 수 있다
import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { memorySupabase, mediaUrlOf, type Row } from '../fixtures/_memory-supabase'

const state = vi.hoisted(() => ({
  db: null as unknown as ReturnType<typeof import('../fixtures/_memory-supabase').memorySupabase>,
  crop: 'face' as 'face' | 'throw',
}))

vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: new Proxy({}, { get: (_target, key) => (state.db.client as unknown as Record<string | symbol, unknown>)[key] }),
}))
vi.mock('@/lib/demo/guard-server', () => ({ demoWriteBlock: () => null }))
vi.mock('@/lib/api/guard', () => ({
  requireProjectAccess: vi.fn(async (_req: Request, projectId: string) => ({ ok: true, projectId, userId: 'owner-1', viaShare: false })),
}))
vi.mock('@/lib/storage-thumb', async (original) => ({
  ...await original<typeof import('@/lib/storage-thumb')>(),
  uploadThumbnail: vi.fn(async () => {}),
}))
vi.mock('@/lib/artist/portrait', () => ({
  cropTurnaroundPortrait: vi.fn(async () => {
    if (state.crop === 'throw') throw new Error('crop failed')
    return Buffer.from('face')
  }),
}))

import { GET as getVersions } from '@/app/api/artist/versions/route'
import { POST as regenerate } from '@/app/api/artist/versions/regenerate/route'
import { POST as loadVersion } from '@/app/api/artist/versions/load/route'
import { POST as selectCandidate } from '@/app/api/artist/select-candidate/route'
import { thumbObjectPath } from '@/lib/storage-thumb'

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
  roof: mediaUrlOf(place('roof_wide_shot_g0.png')),
}
const T0 = '2026-10-27T00:00:00.000Z'
const REAL_L1 = { art_style: 'live_action', line_quality: 'none', shape_language: 'natural', texture_philosophy: 'photorealistic', character_proportion: '7.5:1' }

function seed(extra: Record<string, Row[]> = {}) {
  const db = memorySupabase({
    projects: [{ id: P, workspace_id: WS, current_stage: 'artist', style_anchor_key: 'real', custom_style_anchor: null, design_tokens: { l0: { aspect_ratio: '16:9' }, l1: REAL_L1 } }],
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
    // 옥상은 다른 모습이 없는 배경 — 불러오면 그 버전 그림으로 돌아간다(다른 모습이 있는 복도는 지금 그림 그대로, 2026-10-31 오너 결정 A).
    locations: [
      { project_id: P, location_id: 'hall', name: '회사 복도', wide_shot: URLS.hall },
      { project_id: P, location_id: 'roof', name: '옥상', wide_shot: URLS.roof },
    ],
    location_appearances: [{ project_id: P, location_id: 'hall', appearance_key: 'night', label: '밤', wide_shot: URLS.night }],
    location_image_candidates: [
      { id: 'lc-hall', project_id: P, location_id: 'hall', view: 'wide_shot', variant_key: null, url: URLS.hall, source_hash: 'sh-hall', appearance_hash: 'ah-hall', is_selected: true, pinned: false, generated_at: T0 },
      { id: 'lc-night', project_id: P, location_id: 'hall', view: 'wide_shot', variant_key: 'night', url: URLS.night, source_hash: 'sh-night', appearance_hash: 'ah-night', is_selected: false, pinned: false, generated_at: T0 },
      { id: 'lc-roof', project_id: P, location_id: 'roof', view: 'wide_shot', variant_key: null, url: URLS.roof, source_hash: 'sh-roof', appearance_hash: 'ah-roof', is_selected: true, pinned: false, generated_at: T0 },
    ],
    generation_jobs: [],
    shots: [],
    writer_runs: [],
    artist_versions: [],
    ...extra,
  }, {
    artist_versions: [{ columns: ['project_id', 'n'] }, { columns: ['project_id'], where: (row) => row.is_current === true }],
    character_image_candidates: [{ columns: ['project_id', 'character_id', 'appearance_key', 'view'], where: (row) => row.is_selected === true }],
    // 배경 카드 기록의 "지금"은 배경 한 곳(뷰)에 하나 — 운영 DB 색인 그대로(2026-10-31 오너: 모습마다로 바꾸기는 보류).
    location_image_candidates: [{ columns: ['project_id', 'location_id', 'view'], where: (row) => row.is_selected === true }],
  })
  for (const url of Object.values(URLS)) {
    db.objects.set(pathOf(url), { bytes: Buffer.from(`image:${pathOf(url)}`) })
    db.objects.set(thumbObjectPath(pathOf(url)), { bytes: Buffer.from(`thumb:${pathOf(url)}`) })
  }
  return db
}

const post = (path: string, body: unknown) => new NextRequest(`http://localhost${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
const get = (query: string) => new NextRequest(`http://localhost/api/artist/versions?${query}`)
const versionRows = () => state.db.rows('artist_versions')
const version = (n: number) => versionRows().find((row) => row.n === n)!
const appearance = (characterId: string, appearanceKey: string) => state.db.rows('character_appearances').find((row) => row.character_id === characterId && row.appearance_key === appearanceKey)!
const pathOf = (url: unknown) => new URL(String(url)).pathname.replace('/storage/v1/object/public/media/', '')
const objectsUnder = (prefix: string) => [...state.db.objects.keys()].filter((path) => path.startsWith(prefix)).sort()
type Snap = { characters: Array<{ characterId: string; appearanceKey: string; sheet: { url: string; candidateId: string | null; sourceHash: string | null }; portraitUrl: string | null }>; locations: Array<{ locationId: string; appearanceKey: string | null; wideShot: { url: string } }>; restoring?: unknown }
const snapshotOf = (n: number) => version(n).snapshot as Snap
const sheetIn = (n: number, characterId: string, appearanceKey: string) => snapshotOf(n).characters.find((entry) => entry.characterId === characterId && entry.appearanceKey === appearanceKey)!
const doLoad = (n: number, extra: Record<string, unknown> = {}) => loadVersion(post('/api/artist/versions/load', { projectId: P, n, ...extra }))
const doRegenerate = (styleAnchorKey: string) => regenerate(post('/api/artist/versions/regenerate', { projectId: P, styleAnchorKey }))

/** 재생성 뒤 새 그림이 들어온 것처럼 만든다(서버 webhook 이 하는 일). only 를 주면 그 칸만. */
function landNewImages(tag: string, only?: string[]) {
  const at = new Date(Date.now() + 1000).toISOString()
  for (const row of state.db.rows('character_appearances')) {
    const slot = `${row.character_id}:${row.appearance_key}`
    if (only && !only.includes(slot)) continue
    const url = mediaUrlOf(file(`${row.character_id}_${row.appearance_key}_main_${tag}.png`))
    const face = mediaUrlOf(file(`${row.character_id}_${row.appearance_key}_main_${tag}_portrait.png`))
    state.db.objects.set(pathOf(url), { bytes: Buffer.from(tag) })
    state.db.objects.set(pathOf(face), { bytes: Buffer.from(`${tag}-face`) })
    row.sheet_url = url
    row.portrait_url = face
    for (const cand of state.db.rows('character_image_candidates')) if (cand.character_id === row.character_id && cand.appearance_key === row.appearance_key) cand.is_selected = false
    state.db.rows('character_image_candidates').push({ id: `cand-${row.character_id}-${row.appearance_key}-${tag}`, project_id: P, character_id: row.character_id, appearance_key: row.appearance_key, view: 'main', url, source_hash: `sh-${tag}`, appearance_hash: 'ah', is_selected: true, pinned: false, generated_at: at })
    state.db.rows('generation_jobs').push({ id: `job-${slot}-${tag}`, project_id: P, kind: 'character_view', status: 'completed', target: { characterId: row.character_id, appearanceKey: row.appearance_key, view: 'main' }, created_at: at })
  }
  if (only) return
  const hall = state.db.rows('locations').find((row) => row.location_id === 'hall')!
  hall.wide_shot = mediaUrlOf(place(`hall_wide_shot_${tag}.png`))
  const night = state.db.rows('location_appearances')[0]
  night.wide_shot = mediaUrlOf(place(`hall_night_wide_shot_${tag}.png`))
  const roof = state.db.rows('locations').find((row) => row.location_id === 'roof')!
  roof.wide_shot = mediaUrlOf(place(`roof_wide_shot_${tag}.png`))
  for (const url of [hall.wide_shot, night.wide_shot, roof.wide_shot]) state.db.objects.set(pathOf(url), { bytes: Buffer.from(tag) })
  for (const cand of state.db.rows('location_image_candidates')) cand.is_selected = false
  state.db.rows('location_image_candidates').push(
    { id: `lc-hall-${tag}`, project_id: P, location_id: 'hall', view: 'wide_shot', variant_key: null, url: hall.wide_shot, source_hash: 'x', appearance_hash: 'x', is_selected: true, pinned: false, generated_at: at },
    { id: `lc-night-${tag}`, project_id: P, location_id: 'hall', view: 'wide_shot', variant_key: 'night', url: night.wide_shot, source_hash: 'x', appearance_hash: 'x', is_selected: false, pinned: false, generated_at: at },
    { id: `lc-roof-${tag}`, project_id: P, location_id: 'roof', view: 'wide_shot', variant_key: null, url: roof.wide_shot, source_hash: 'x', appearance_hash: 'x', is_selected: true, pinned: false, generated_at: at },
  )
  state.db.rows('generation_jobs').push(
    { id: `job-hall-${tag}`, project_id: P, kind: 'world_shot', status: 'completed', target: { locationId: 'hall', column: 'wide_shot' }, created_at: at },
    { id: `job-night-${tag}`, project_id: P, kind: 'world_shot', status: 'completed', target: { locationId: 'hall', column: 'wide_shot', appearanceKey: 'night' }, created_at: at },
    { id: `job-roof-${tag}`, project_id: P, kind: 'world_shot', status: 'completed', target: { locationId: 'roof', column: 'wide_shot' }, created_at: at },
  )
}

/** 수채화로 재생성 → 새 그림이 다 들어온 상태(v1 = 실사 · 남김, v2 = 수채화 · 지금). */
async function twoVersions() {
  expect((await doRegenerate('watercolor')).status).toBe(200)
  landNewImages('g2')
}

/** v1 불러오기가 그림을 되돌리다 멈춘다(함수가 시간 제한에 걸린 것처럼) — 멈춘 요청은 끝나지 않는다. */
async function hangingLoadOfV1() {
  state.db.failOn.push({ table: 'character_appearances', op: 'update', times: 1, hang: true })
  void doLoad(1)
  await vi.waitFor(() => expect(snapshotOf(1).restoring).toBeTruthy())
}

beforeEach(() => {
  state.db = seed()
  state.crop = 'face'
})
afterEach(() => {
  vi.useRealTimers()
})

describe('불러오다 멈췄을 때', () => {
  it('불러오다 멈춰 반쯤 바뀐 채 남은 버전은 다음에 기록을 읽을 때 그 버전 그림 · 스타일로 마저 불러온다', async () => {
    // 왜: 운영 함수는 정해진 시간이 지나면 끊긴다 — 그림을 되돌리는 도중 끊기면 되돌리기도 못 해, 그 버전이 지금으로 표시된 채
    //   그림 반은 새 스타일 · 반은 옛 스타일로 남았다(2026-10-28 검토 지적). 화면이 기록을 다시 읽을 때 마저 불러온다.
    await twoVersions()
    await hangingLoadOfV1()
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(Date.now() + 6 * 60_000)

    const view = await (await getVersions(get(`projectId=${P}`))).json()
    expect(view.currentN).toBe(1)
    expect(snapshotOf(1).restoring).toBeUndefined()
    expect(appearance('minho', 'current').sheet_url).toBe(sheetIn(1, 'minho', 'current').sheet.url)
    expect(appearance('soonja', 'current').sheet_url).toBe(sheetIn(1, 'soonja', 'current').sheet.url)
    const roofNow = state.db.rows('locations').find((row) => row.location_id === 'roof')!.wide_shot
    expect(roofNow).toBe(snapshotOf(1).locations.find((entry) => entry.locationId === 'roof')!.wideShot.url)
    expect(state.db.rows('projects')[0]).toMatchObject({ style_anchor_key: 'real' })
    expect((state.db.rows('projects')[0].design_tokens as { l1: unknown }).l1).toEqual(REAL_L1)
  })

  it('불러오다 멈춘 버전을 다시 불러오면 거절하지 않고 마저 불러온다', async () => {
    // 왜: 화면은 끊긴 요청에 "다시 해 보세요"를 보인다 — 다시 누르면 "이미 지금 버전"으로 막지 말고 끝까지 불러와야 한다.
    await twoVersions()
    await hangingLoadOfV1()
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(Date.now() + 6 * 60_000)

    const res = await doLoad(1)
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true, n: 1, styleKey: 'real' })
    expect(appearance('minho', 'young').sheet_url).toBe(sheetIn(1, 'minho', 'young').sheet.url)
    expect(snapshotOf(1).restoring).toBeUndefined()
  })

  it('불러오는 중(멈췄는지 아직 모를 때)에는 다른 불러오기 · 재생성을 받지 않는다', async () => {
    // 왜: 아직 도는 불러오기를 다른 창이 덮으면 두 요청이 같은 칸을 번갈아 바꿔 그림이 섞인다(혼자 정한 것: 잠시 뒤 다시).
    await twoVersions()
    await hangingLoadOfV1()
    const again = await doLoad(2)
    expect(again.status).toBe(409)
    expect(await again.json()).toMatchObject({ code: 'version_restoring' })
    const regen = await doRegenerate('real')
    expect(regen.status).toBe(409)
    expect(await regen.json()).toMatchObject({ code: 'version_restoring' })
  })

  it('버전을 불러오는 중이면 기록 읽기가 불러오는 중이라고 알리고, 작품 스타일은 늘 지금 작품에 걸린 것을 알려 준다', async () => {
    // 왜: 끊긴 불러오기를 화면이 몰라 머리 줄에 아무것도 안 보였고, 답을 못 받은 화면은 옛 스타일 이름 · 카드 기록 가리기를 그대로 썼다(2026-10-31 재검토 지적).
    await twoVersions()
    await hangingLoadOfV1()
    const loading = await (await getVersions(get(`projectId=${P}`))).json()
    expect(loading).toMatchObject({ restoring: true, style: { key: 'real', custom: null } })
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(Date.now() + 6 * 60_000)
    const done = await (await getVersions(get(`projectId=${P}`))).json()
    expect(done).toMatchObject({ restoring: false, currentN: 1, style: { key: 'real', custom: null } })
  })

  it('끊긴 불러오기를 마저 하다 세 번 실패하면 그만두고 불러오는 중 표시를 떼어, 불러오기 · 재생성 · 완료가 영영 막히지 않는다', async () => {
    // 왜: 마저 하기가 실패할 때마다 표시를 되돌려 두어, 고칠 수 없는 실패면 그 작품의 버전 바꾸기 · [완료하기]가 끝없이 막혔다(2026-10-31 재검토 지적).
    await twoVersions()
    await hangingLoadOfV1()
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(Date.now() + 6 * 60_000)
    state.db.failOn.push({ table: 'character_appearances', op: 'update', times: 1000 })
    for (let i = 0; i < 2; i++) {
      expect((await (await getVersions(get(`projectId=${P}`))).json()).restoring).toBe(true)
      expect((snapshotOf(1).restoring as { attempts?: number }).attempts).toBe(i + 1)
    }
    expect((await (await getVersions(get(`projectId=${P}`))).json()).restoring).toBe(false)
    expect(snapshotOf(1).restoring).toBeUndefined()
    state.db.failOn.length = 0
    expect((await doRegenerate('watercolor')).status).toBe(200)
  })

  it('얼굴을 다시 자를 시트를 받는 데 오래 걸리면 기다리지 않고 얼굴을 비운다', async () => {
    // 왜: 보관함 받기가 멈추면 불러오기 전체가 함수 시간 제한까지 기다리다 끊겼다(2026-10-31 재검토 지적).
    appearance('soonja', 'current').portrait_url = null
    await twoVersions()
    state.db.hangDownloads.add(pathOf(sheetIn(1, 'soonja', 'current').sheet.url))
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const pending = doLoad(1)
    await vi.advanceTimersByTimeAsync(60_000)
    expect((await pending).status).toBe(200)
    expect(appearance('soonja', 'current').portrait_url).toBeNull()
  })

  it('카드 기록 줄이 1000줄을 넘어도 불러올 때 그때의 줄을 찾아 고르고 같은 그림 줄을 또 만들지 않는다', async () => {
    // 왜: 한 번 읽기는 1000줄까지라 뒤쪽 줄을 못 보면 같은 그림 줄을 또 만들거나, 지킬 파일을 못 보고 지운다(2026-10-31 재검토 지적).
    const filler = Array.from({ length: 1100 }, (_, i) => ({ id: `aa-filler-${String(i).padStart(4, '0')}`, project_id: P, character_id: 'extra', appearance_key: 'current', view: 'main', url: mediaUrlOf(file(`extra_${i}.png`)), source_hash: null, appearance_hash: null, is_selected: false, pinned: false, generated_at: T0 }))
    state.db.tables.character_image_candidates = [...filler, ...state.db.rows('character_image_candidates').map((row) => ({ ...row, id: `zz-${row.id}` }))]
    await twoVersions()
    expect((await doLoad(1)).status).toBe(200)
    const minhoRows = state.db.rows('character_image_candidates').filter((row) => row.character_id === 'minho' && row.appearance_key === 'current')
    expect(minhoRows.map((row) => row.id).sort()).toEqual(['cand-minho-current-g2', 'zz-cand-minho'])
    expect(minhoRows.find((row) => row.id === 'zz-cand-minho')?.is_selected).toBe(true)
  })

  it('버전을 불러올 때 그림 칸을 한 번에 여러 개씩(최대 6개) 함께 되돌린다', async () => {
    // 왜: 칸마다 하나씩 차례로 되돌리면 인물 · 배경이 많은 작품은 운영 함수 시간 제한(60초)을 넘는다(2026-10-28 검토 지적).
    for (let i = 0; i < 9; i++) {
      state.db.rows('characters').push({ project_id: P, character_id: `extra${i}`, name: `엑스트라${i}`, entity_type: 'person' })
      const url = mediaUrlOf(file(`extra${i}_current_main.png`))
      state.db.objects.set(pathOf(url), { bytes: Buffer.from(`extra${i}`) })
      state.db.rows('character_appearances').push({ project_id: P, character_id: `extra${i}`, appearance_key: 'current', is_default: true, sheet_url: url, portrait_url: url, derived_from_url: null })
    }
    await twoVersions()
    state.db.latency.character_appearances = 5
    expect((await doLoad(1)).status).toBe(200)
    expect(state.db.maxInflight.character_appearances).toBeGreaterThan(1)
    expect(state.db.maxInflight.character_appearances).toBeLessThanOrEqual(6)
  })
})

describe('되돌리기 길', () => {
  it('불러오다 실패하면 떠난 버전의 그림 · 작품 스타일 · 지금 버전 표시로 돌아간다', async () => {
    // 왜: 반쯤 섞인 그림이나 "지금 버전 없음"으로 남으면 다음 재생성 · 불러오기가 막힌다(되돌리기 길 시험, 2026-10-28 검토 지적).
    await twoVersions()
    state.db.failOn.push({ table: 'character_appearances', op: 'update', times: 1 })
    const res = await doLoad(1)
    expect(res.status).toBe(500)
    expect(versionRows().filter((row) => row.is_current).map((row) => row.n)).toEqual([2])
    expect(snapshotOf(1).restoring).toBeUndefined()
    expect(state.db.rows('projects')[0]).toMatchObject({ style_anchor_key: 'watercolor' })
    expect((state.db.rows('projects')[0].design_tokens as { l1: Record<string, unknown> }).l1).toMatchObject({ art_style: 'watercolor' })
    // 그림도 v2 그대로 — 고른 기록 줄은 v2 에 그린 그림이다.
    expect(pathOf(appearance('minho', 'current').sheet_url)).toBe(pathOf(sheetIn(2, 'minho', 'current').sheet.url))
    expect(state.db.rows('character_image_candidates').find((row) => row.is_selected && row.character_id === 'minho' && row.appearance_key === 'current')?.id).toBe('cand-minho-current-g2')
  })

  it('[다시 만들기]에서 작품 스타일을 바꾸지 못하면 새 버전을 거두고 떠난 버전으로 돌아간다', async () => {
    // 왜: 새 버전만 열리고 스타일이 옛것이면 다시 그린 그림이 옛 스타일로 새 버전에 들어간다(되돌리기 길 시험).
    state.db.failOn.push({ table: 'projects', op: 'update', times: 1 })
    expect((await doRegenerate('watercolor')).status).toBe(500)
    expect(versionRows().map((row) => [row.n, row.is_current])).toEqual([[1, true]])
    expect(state.db.rows('projects')[0]).toMatchObject({ style_anchor_key: 'real' })
    expect((state.db.rows('projects')[0].design_tokens as { l1: unknown }).l1).toEqual(REAL_L1)
  })

  it('지금 버전이 하나도 없게 되면(되돌리기마저 실패) 마지막에 떠난 버전을 지금 버전으로 되살리고 재생성 · 불러오기를 받는다', async () => {
    // 왜: 지금 버전이 없으면 "다른 창이 먼저 바꿨어요"로 영영 막혔다(2026-10-28 검토 지적). 그림은 그 버전 그대로다.
    await twoVersions()
    // v1 은 10분 전에 떠났고, v2 는 5분 전에 떠났는데 v1 을 지금으로 올리지 못했다.
    const left1 = new Date(Date.now() - 10 * 60_000).toISOString()
    const left2 = new Date(Date.now() - 5 * 60_000).toISOString()
    Object.assign(version(1), { active: [{ from: null, to: left1 }], updated_at: left2 })
    Object.assign(version(2), { is_current: false, active: [{ from: left1, to: left2 }], updated_at: left2 })

    const view = await (await getVersions(get(`projectId=${P}`))).json()
    expect(view.currentN).toBe(2)
    expect(versionRows().filter((row) => row.is_current).map((row) => row.n)).toEqual([2])
    expect((await doLoad(1)).status).toBe(200)
    expect(versionRows().filter((row) => row.is_current).map((row) => row.n)).toEqual([1])
  })
})

describe('대표 얼굴', () => {
  it('대표 얼굴을 남기지 않은 버전을 불러오면 불러온 시트에서 얼굴을 다시 잘라 넣는다', async () => {
    // 왜: 얼굴 없이 남은 버전을 불러오면 새 스타일 얼굴이 그대로 남아 카드 얼굴과 시트가 다른 스타일이었다(2026-10-28 검토 지적).
    appearance('soonja', 'current').portrait_url = null
    await twoVersions()
    expect(sheetIn(1, 'soonja', 'current').portraitUrl).toBeNull()
    expect((await doLoad(1)).status).toBe(200)
    const face = appearance('soonja', 'current').portrait_url as string
    const sheet = pathOf(appearance('soonja', 'current').sheet_url)
    expect(pathOf(face)).toBe(sheet.replace(/\.png$/, '_portrait.png'))
    expect(state.db.objects.get(pathOf(face))?.bytes.toString()).toBe('face')
  })

  it('불러온 시트에서 얼굴을 자르지 못하면 새 스타일 얼굴을 남기지 않고 비운다', async () => {
    // 왜: 다른 스타일 얼굴이 남는 것보다 비우는 편이 낫다 — 카드는 시트로 보인다(혼자 정한 것).
    appearance('soonja', 'current').portrait_url = null
    await twoVersions()
    state.crop = 'throw'
    expect((await doLoad(1)).status).toBe(200)
    expect(appearance('soonja', 'current').portrait_url).toBeNull()
  })

  it('올린 원본이 있는 모습은 불러와도 대표 얼굴을 바꾸지 않는다', async () => {
    // 왜: 정상 경로 고정 — 직접 올린 원본 그림이 그 모습의 대표 얼굴이다(#image-to-artist).
    const original = mediaUrlOf(file('soonja_upload.png'))
    Object.assign(appearance('soonja', 'current'), { portrait_url: null, derived_from_url: original })
    await twoVersions()
    appearance('soonja', 'current').portrait_url = original
    expect((await doLoad(1)).status).toBe(200)
    expect(appearance('soonja', 'current').portrait_url).toBe(original)
  })
})

describe('버전 폴더의 그림 파일', () => {
  it('불러오면 지금 그림은 그 버전 폴더에 남긴 그림을 가리켜, 그 사이 원래 파일이 덮여도 그 버전 그림 그대로 돌아온다', async () => {
    // 왜: 예전 고정 경로 파일은 나중에 올린 그림이 같은 자리에 덮어쓴다 — 원래 파일을 가리키면 다른 그림이 돌아온다(2026-10-28 검토 지적).
    await twoVersions()
    state.db.objects.set(pathOf(URLS.roof), { bytes: Buffer.from('uploaded later') })
    expect((await doLoad(1)).status).toBe(200)
    const roof = state.db.rows('locations').find((row) => row.location_id === 'roof')!.wide_shot as string
    expect(pathOf(roof).startsWith(`${WS}/${P}/versions/v1/`)).toBe(true)
    expect(state.db.objects.get(pathOf(roof))?.bytes.toString()).toBe(`image:${pathOf(URLS.roof)}`)
    // 카드 기록은 그때의 줄(같은 지문)을 다시 고른다.
    expect(state.db.rows('location_image_candidates').filter((row) => row.is_selected && row.location_id === 'roof').map((row) => row.id)).toEqual(['lc-roof'])
    expect(pathOf(appearance('minho', 'current').sheet_url)).toBe(pathOf(sheetIn(1, 'minho', 'current').sheet.url))
  })

  it('그대로 둔 버전을 다시 떠날 때는 그림을 또 복사하지 않고, 그때의 카드 기록 줄 · 지문을 이어 남긴다', async () => {
    // 왜: 버전을 오갈 때마다 모든 그림을 새로 복사하면 보관함이 끝없이 커진다(2026-10-28 검토 지적).
    await twoVersions()
    const firstCopies = objectsUnder(`${WS}/${P}/versions/v1/`)
    const firstMinho = sheetIn(1, 'minho', 'current').sheet.url
    expect((await doLoad(1)).status).toBe(200)
    expect((await doLoad(2)).status).toBe(200)
    expect(objectsUnder(`${WS}/${P}/versions/v1/`)).toEqual(firstCopies)
    expect(sheetIn(1, 'minho', 'current').sheet).toMatchObject({ url: firstMinho, candidateId: 'cand-minho', sourceHash: 'sh-minho' })
    // 다시 불러와도 같은 기록 줄을 고른다 — 같은 그림 줄이 또 생기지 않는다.
    expect((await doLoad(1)).status).toBe(200)
    expect(state.db.rows('character_image_candidates').filter((row) => row.character_id === 'minho' && row.appearance_key === 'current')).toHaveLength(2)
    expect(state.db.rows('character_image_candidates').find((row) => row.id === 'cand-minho')?.is_selected).toBe(true)
  })

  it('카드 기록에서 같은 그림을 다시 골라 둔 버전을 떠날 때도 그 그림을 또 복사하지 않는다', async () => {
    // 왜: 버전 폴더에 이미 그 그림의 복사본이 있다 — 같은 그림을 또 복사하면 보관함만 커진다.
    await twoVersions()
    expect((await doLoad(1)).status).toBe(200)
    expect((await selectCandidate(post('/api/artist/select-candidate', { projectId: P, characterId: 'minho', appearanceKey: 'current', view: 'main', candidateId: 'cand-minho' }))).status).toBe(200)
    expect(appearance('minho', 'current').sheet_url).toBe(URLS.minho)
    const before = objectsUnder(`${WS}/${P}/versions/v1/`).filter((path) => path.includes('-sheet-'))
    expect((await doLoad(2)).status).toBe(200)
    expect(objectsUnder(`${WS}/${P}/versions/v1/`).filter((path) => path.includes('-sheet-'))).toEqual(before)
  })

  it('떠나는 버전 기록이 더는 가리키지 않는 복사본은 지우고, 다른 버전 기록 · 지금 그림 · 카드 기록이 가리키는 파일은 남긴다', async () => {
    // 왜: 다시 그린 칸의 옛 복사본은 어느 기록도 가리키지 않아 다시 볼 길이 없다. 카드 기록 줄이 가리키는 파일을 지우면 그 줄이 깨진다.
    await twoVersions()
    // 순자의 v1 그림은 카드 기록에서 빠져 있다 — 불러오면 버전 폴더 그림으로 기록 줄을 다시 만든다.
    state.db.tables.character_image_candidates = state.db.rows('character_image_candidates').filter((row) => row.id !== 'cand-soonja')
    expect((await doLoad(1)).status).toBe(200)
    const minhoCopy = pathOf(sheetIn(1, 'minho', 'current').sheet.url)
    const minhoFaceCopy = pathOf(sheetIn(1, 'minho', 'current').portraitUrl)
    const soonjaCopy = pathOf(sheetIn(1, 'soonja', 'current').sheet.url)
    expect(state.db.rows('character_image_candidates').some((row) => pathOf(row.url) === soonjaCopy)).toBe(true)
    const v2Copies = objectsUnder(`${WS}/${P}/versions/v2/`)

    // v1 에서 민호 · 순자를 카드에서 다시 그렸다.
    landNewImages('g3', ['minho:current', 'soonja:current'])
    expect((await doLoad(2)).status).toBe(200)

    expect(state.db.objects.has(minhoCopy)).toBe(false)
    expect(state.db.objects.has(minhoCopy.replace(/\.png$/, '_thumb.webp'))).toBe(false)
    expect(state.db.objects.has(minhoFaceCopy)).toBe(false)
    expect(state.db.objects.has(soonjaCopy)).toBe(true)
    for (const path of v2Copies) expect(state.db.objects.has(path), path).toBe(true)
    // 새로 그린 그림은 v1 폴더에 새로 남는다.
    expect(pathOf(sheetIn(1, 'minho', 'current').sheet.url)).not.toBe(minhoCopy)
    expect(state.db.objects.has(pathOf(sheetIn(1, 'minho', 'current').sheet.url))).toBe(true)
  })
})

describe('버전을 바꿀 때', () => {
  it('버전을 바꿀 때 10분 넘게 대기로 멈춘 이 작품의 그림 작업은 실패로 정리해, 늦게 도착한 그림이 되돌린 그림을 덮지 않는다', async () => {
    // 왜: 웹훅을 놓친 오래된 작업이 뒤늦게 끝나면 버전을 바꾼 뒤의 칸에 옛 스타일 그림이 들어간다(2026-10-28 검토 지적).
    //   늦은 결과는 대기 중인 작업만 받는다 — 실패로 바꾸면 버린다.
    const stale = new Date(Date.now() - 11 * 60_000).toISOString()
    state.db.rows('generation_jobs').push({ id: 'job-stale-1', project_id: P, kind: 'character_view', status: 'queued', target: { characterId: 'minho', appearanceKey: 'current', view: 'main' }, created_at: stale, video_clip_id: null })
    expect((await doRegenerate('watercolor')).status).toBe(200)
    expect(state.db.rows('generation_jobs').find((row) => row.id === 'job-stale-1')).toMatchObject({ status: 'failed', error: expect.stringMatching(/superseded/) })

    landNewImages('g2')
    state.db.rows('generation_jobs').push({ id: 'job-stale-2', project_id: P, kind: 'world_shot', status: 'queued', target: { locationId: 'hall', column: 'wide_shot' }, created_at: stale, video_clip_id: null })
    expect((await doLoad(1)).status).toBe(200)
    expect(state.db.rows('generation_jobs').find((row) => row.id === 'job-stale-2')).toMatchObject({ status: 'failed' })
  })

  it('버전을 떠날 때 그 버전의 스타일은 작품에 지금 걸린 스타일(직접 올린 그림체의 분석 결과까지)로 남긴다', async () => {
    // 왜: 직접 올린 그림체는 버전을 만든 뒤에 분석 결과가 붙는다 — 버전에 옛 값이 남으면 불러올 때 분석 없는 그림체로 돌아간다(2026-10-28 검토 지적).
    const custom = { url: 'https://img/mine.png', label: '내 그림체', medium: '2d_anime' }
    Object.assign(state.db.rows('projects')[0], { style_anchor_key: 'custom-mine', custom_style_anchor: custom })
    await getVersions(get(`projectId=${P}&ensure=1`))
    const analyzed = { ...custom, analysis: { palette: ['#123456'], line: 'thin' } }
    state.db.rows('projects')[0].custom_style_anchor = analyzed
    expect((await doRegenerate('watercolor')).status).toBe(200)
    expect(version(1)).toMatchObject({ style_anchor_key: 'custom-mine', custom_style_anchor: analyzed })
  })

  it('작품 스타일 잠금을 확인할 때 Writer 실행 기록 전체가 아니라 산문 확정 표시만 읽는다', async () => {
    // 왜: 그리는 동안 몇 초마다 기록을 읽는다 — 그때마다 큰 실행 기록 전체를 읽으면 느리고 비싸다(2026-10-28 검토 지적).
    state.db.rows('shots').push({ project_id: P, shot_id: 's1' })
    state.db.rows('writer_runs').push({ id: 'run-1', project_id: P, status: 'completed', created_at: T0, state: { _proseLocked: true, scenes: 'x'.repeat(5000) } })
    const view = await (await getVersions(get(`projectId=${P}`))).json()
    expect(view.completed).toBe(false)
    const reads = state.db.log.filter((entry) => entry.op === 'select' && entry.table === 'writer_runs').map((entry) => String(entry.detail))
    expect(reads.length).toBeGreaterThan(0)
    for (const columns of reads) {
      expect(columns).not.toBe('*')
      expect(columns.split(',').map((part) => part.trim())).not.toContain('state')
      expect(columns).toContain('_proseLocked')
    }
    // 산문 확정 없이 샷이 있는 예전 흐름은 지금처럼 끝난 프로젝트다.
    ;(state.db.rows('writer_runs')[0].state as Record<string, unknown>)._proseLocked = false
    expect((await (await getVersions(get(`projectId=${P}`))).json()).completed).toBe(true)
  })
})

describe('멈춘 재생성에서 돌아가기', () => {
  it('재생성 그림이 다 그려지지 않은 채 멈췄어도 재생성을 그만두고 불러오면(그리는 그림이 없을 때) 이전 버전으로 돌아가고 남은 재생성은 취소된다', async () => {
    // 왜: 모두의 자리가 차서 멈춘 재생성은 다 그릴 때까지 [완료하기] · 불러오기 · 재생성을 막아 빠져나갈 길이 없었다(2026-10-28 검토 지적).
    expect((await doRegenerate('watercolor')).status).toBe(200)
    expect(version(2).regen).toMatchObject({ fromN: 1 })
    landNewImages('g2', ['minho:current'])

    const res = await doLoad(1, { cancelRegen: true })
    expect(res.status).toBe(200)
    expect(versionRows().filter((row) => row.is_current).map((row) => row.n)).toEqual([1])
    expect(version(2).regen).toMatchObject({ cancelledAt: expect.any(String), doneAt: null })
    expect(state.db.rows('projects')[0]).toMatchObject({ style_anchor_key: 'real' })
    expect(pathOf(appearance('minho', 'current').sheet_url)).toBe(pathOf(sheetIn(1, 'minho', 'current').sheet.url))

    // 그만둔 재생성은 그 버전을 다시 불러와도 이어 그리지 않는다.
    expect((await doLoad(2)).status).toBe(200)
    expect((await (await getVersions(get(`projectId=${P}`))).json()).regen).toBeNull()
  })

  it('재생성 그림을 그리는 중이면 재생성을 그만두고 불러오기도 받지 않는다', async () => {
    // 왜: 그리던 그림이 불러온 버전의 칸에 늦게 들어가 옛 버전 그림을 덮는다 — 다 그린 뒤 다시 누른다.
    expect((await doRegenerate('watercolor')).status).toBe(200)
    state.db.rows('generation_jobs').push({ id: 'job-q', project_id: P, kind: 'character_view', status: 'queued', target: { characterId: 'minho', appearanceKey: 'current', view: 'main' }, created_at: new Date().toISOString(), video_clip_id: null })
    const res = await doLoad(1, { cancelRegen: true })
    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({ code: 'drawing' })
    expect(versionRows().filter((row) => row.is_current).map((row) => row.n)).toEqual([2])
  })
})
