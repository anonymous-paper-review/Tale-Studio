// 새로 그린 인물 · 배경 그림은 매번 새 파일로 저장하고, 카드 기록에서 빠진 그림 파일만 지운다(버전 기록이 가리키는 파일은 남긴다) (2026-10-28 작품 스타일 기록)
import { randomUUID } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { memorySupabase, mediaUrlOf, type Row } from '../fixtures/_memory-supabase'

const state = vi.hoisted(() => ({
  db: null as unknown as ReturnType<typeof import('../fixtures/_memory-supabase').memorySupabase>,
  thumbs: [] as string[],
}))
vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: new Proxy({}, { get: (_target, key) => (state.db.client as unknown as Record<string | symbol, unknown>)[key] }),
}))
vi.mock('@/lib/storage-thumb', async (original) => ({
  ...await original<typeof import('@/lib/storage-thumb')>(),
  uploadThumbnail: vi.fn(async (path: string) => { state.thumbs.push(path) }),
}))
vi.mock('@/lib/artist/portrait', () => ({ cropTurnaroundPortrait: vi.fn(async () => Buffer.from('face')) }))
vi.mock('@/lib/fal/observability', () => ({ buildFalResponseSnapshot: () => ({}) }))
vi.mock('@/lib/generation-jobs', () => ({
  completeGenerationJob: vi.fn(),
  failGenerationJob: vi.fn(),
  patchGenerationJobResponseSnapshotByRequestId: vi.fn(),
  GenerationJobTerminalTransitionError: class GenerationJobTerminalTransitionError extends Error {},
}))

import { finalizeCharacterViewJob, finalizeWorldShotJob } from '@/lib/fal/finalize'
import { readAllProjectRows } from '@/lib/artist/read-all-rows'
import type { GenerationJob } from '@/lib/generation-jobs'

const P = 'p1'
const WS = 'ws1'
const pathOf = (url: unknown) => new URL(String(url)).pathname.replace('/storage/v1/object/public/media/', '')

const characterJob = (id = randomUUID()): GenerationJob => ({
  id, project_id: P, request_id: `req-${id}`, model: 'openai/gpt-image-2/edit', kind: 'character_view', status: 'queued',
  target: { workspaceId: WS, characterId: 'minho', appearanceKey: 'current', view: 'main', column: 'view_main' },
  input_snapshot: { source_hash: 'sh', appearance_hash: 'ah' }, video_clip_id: null, idempotency_key: null, result_url: null, error: null, fal_key_id: 'key-1',
})
const worldJob = (id = randomUUID(), appearanceKey?: string): GenerationJob => ({
  ...characterJob(id), kind: 'world_shot',
  target: { workspaceId: WS, locationId: 'hall', column: 'wide_shot', ...(appearanceKey ? { appearanceKey } : {}) },
})

function seed(extra: Record<string, Row[]> = {}) {
  return memorySupabase({
    characters: [{ project_id: P, character_id: 'minho', entity_type: 'person' }],
    character_appearances: [{ project_id: P, character_id: 'minho', appearance_key: 'current', is_default: true, sheet_url: null, portrait_url: null, derived_from_url: null }],
    character_image_candidates: [],
    locations: [{ project_id: P, location_id: 'hall', wide_shot: null }],
    location_appearances: [{ project_id: P, location_id: 'hall', appearance_key: 'night', wide_shot: null }],
    location_image_candidates: [],
    artist_versions: [],
    ...extra,
  }, {
    character_image_candidates: [{ columns: ['project_id', 'character_id', 'appearance_key', 'view'], where: (row) => row.is_selected === true }],
    // 배경 카드 기록의 "지금"은 배경 한 곳(뷰)에 하나 — 운영 DB 색인 그대로(2026-10-31 오너: 모습마다로 바꾸기는 보류).
    location_image_candidates: [{ columns: ['project_id', 'location_id', 'view'], where: (row) => row.is_selected === true }],
  })
}

beforeEach(() => {
  state.db = seed()
  state.thumbs = []
  vi.stubGlobal('fetch', vi.fn(async () => new Response(Buffer.from('png-bytes'), { status: 200 })))
})

describe('그림 파일은 그릴 때마다 새로', () => {
  it('새로 그린 인물 시트는 매번 새 파일로 저장하고, 작은 미리보기와 대표 얼굴도 그 파일 옆에 따로 만든다', async () => {
    // 왜: 한 칸에 파일이 하나뿐이면 카드 기록의 예전 그림이 모두 최신 그림을 가리켜(주소 뒤 ?v= 만 다름) 예전 그림을 불러올 수 없었다.
    const first = characterJob()
    const second = characterJob()
    const firstUrl = await finalizeCharacterViewJob(first, 'https://fal.test/a.png')
    const secondUrl = await finalizeCharacterViewJob(second, 'https://fal.test/b.png')

    expect(pathOf(firstUrl)).toMatch(new RegExp(`^${WS}/${P}/characters/.+_main_g${first.id}\\.png$`))
    expect(pathOf(secondUrl)).toMatch(new RegExp(`_main_g${second.id}\\.png$`))
    expect(pathOf(firstUrl)).not.toBe(pathOf(secondUrl))
    for (const url of [firstUrl, secondUrl]) {
      const sheet = pathOf(url)
      const face = sheet.replace(/\.png$/, '_portrait.png')
      expect(state.db.objects.has(sheet)).toBe(true)
      expect(state.db.objects.has(face)).toBe(true)
      expect(state.thumbs).toEqual(expect.arrayContaining([sheet, face]))
    }
    // 카드 기록의 두 줄은 서로 다른 파일을 가리키고, 지금 그림 · 대표 얼굴은 나중 것이다.
    const candidates = state.db.rows('character_image_candidates')
    expect(new Set(candidates.map((row) => pathOf(row.url))).size).toBe(2)
    const row = state.db.rows('character_appearances')[0]
    expect(pathOf(row.sheet_url)).toBe(pathOf(secondUrl))
    expect(pathOf(row.portrait_url)).toBe(pathOf(secondUrl).replace(/\.png$/, '_portrait.png'))
  })

  it('새로 그린 배경 그림(기본 모습 · 다른 모습)도 매번 새 파일로 저장한다', async () => {
    // 왜: 인물과 같은 까닭 — 배경 기록의 예전 그림도 그 그림 그대로 불러올 수 있어야 한다.
    const a = worldJob()
    const b = worldJob()
    const night = worldJob(randomUUID(), 'night')
    const urlA = await finalizeWorldShotJob(a, 'https://fal.test/a.png')
    const urlB = await finalizeWorldShotJob(b, 'https://fal.test/b.png')
    const urlNight = await finalizeWorldShotJob(night, 'https://fal.test/n.png')
    expect(pathOf(urlA)).toMatch(new RegExp(`^${WS}/${P}/locations/.+_wide_shot_g${a.id}\\.png$`))
    expect(pathOf(urlB)).toMatch(new RegExp(`_wide_shot_g${b.id}\\.png$`))
    expect(pathOf(urlNight)).toMatch(new RegExp(`_wide_shot_g${night.id}\\.png$`))
    expect(pathOf(state.db.rows('locations')[0].wide_shot)).toBe(pathOf(urlB))
    expect(pathOf(state.db.rows('location_appearances')[0].wide_shot)).toBe(pathOf(urlNight))
    expect(state.thumbs).toEqual(expect.arrayContaining([pathOf(urlA), pathOf(urlB), pathOf(urlNight)]))
  })
})

describe('카드 기록에서 빠진 그림 파일', () => {
  it('보관 한도(5장)를 넘어 카드 기록에서 빠진 그림의 파일은 지우고, 버전 기록이 가리키는 파일 · 버전 폴더 파일 · 예전 고정 경로 파일은 지우지 않는다', async () => {
    // 왜: 그림마다 새 파일이 생기면 보관함이 끝없이 커진다 — 기록에서 빠진 그림은 다시 볼 길이 없으니 지운다(혼자 정한 것).
    //   남긴 버전 · 예전 고정 경로(여러 기록 줄이 같은 파일을 가리킨다) · 지금 그림은 지우면 안 된다.
    const dir = `${WS}/${P}/characters/minho`
    const unique = (n: number) => `${dir}/current_main_g${'0000000' + n}-0000-4000-8000-000000000000.png`
    const paths = {
      gone: unique(1),
      inVersion: unique(2),
      legacy: `${dir}/current_main.png`,
      versionCopy: `${WS}/${P}/versions/v1/c-minho-current-sheet-abcd.png`,
    }
    const at = (h: number) => `2026-10-27T0${h}:00:00.000Z`
    const rows: Row[] = [
      { id: 'gone', url: mediaUrlOf(paths.gone), generated_at: at(1) },
      { id: 'in-version', url: mediaUrlOf(paths.inVersion), generated_at: at(2) },
      { id: 'legacy', url: `${mediaUrlOf(paths.legacy)}?v=3`, generated_at: at(3) },
      { id: 'version-copy', url: mediaUrlOf(paths.versionCopy), generated_at: at(4) },
      ...[5, 6, 7, 8].map((h) => ({ id: `keep-${h}`, url: mediaUrlOf(unique(h)), generated_at: at(h) })),
    ].map((row) => ({ project_id: P, character_id: 'minho', appearance_key: 'current', view: 'main', source_hash: null, appearance_hash: null, is_selected: false, pinned: false, ...row }))
    rows.push({ id: 'selected', project_id: P, character_id: 'minho', appearance_key: 'current', view: 'main', url: mediaUrlOf(unique(9)), source_hash: null, appearance_hash: null, is_selected: true, pinned: false, generated_at: at(9) })
    state.db = seed({
      character_image_candidates: rows,
      artist_versions: [{ id: 'v1', project_id: P, n: 1, is_current: false, snapshot: { characters: [{ characterId: 'minho', appearanceKey: 'current', sheet: { url: mediaUrlOf(paths.inVersion), candidateId: 'in-version', sourceHash: null, appearanceHash: null, generatedAt: at(2) }, portraitUrl: null }], locations: [] } }],
    })
    for (const path of [...Object.values(paths), paths.gone.replace(/\.png$/, '_portrait.png'), paths.gone.replace(/\.png$/, '_thumb.webp')]) state.db.objects.set(path, { bytes: Buffer.from(path) })

    await finalizeCharacterViewJob(characterJob(), 'https://fal.test/new.png')

    const left = state.db.rows('character_image_candidates').map((row) => row.id)
    expect(left).not.toEqual(expect.arrayContaining(['gone', 'in-version', 'legacy', 'version-copy']))
    expect(state.db.objects.has(paths.gone)).toBe(false)
    expect(state.db.objects.has(paths.gone.replace(/\.png$/, '_portrait.png'))).toBe(false)
    expect(state.db.objects.has(paths.gone.replace(/\.png$/, '_thumb.webp'))).toBe(false)
    expect(state.db.objects.has(paths.inVersion)).toBe(true)
    expect(state.db.objects.has(paths.legacy)).toBe(true)
    expect(state.db.objects.has(paths.versionCopy)).toBe(true)
  })
})

describe('카드 기록 줄이 가리키는 파일', () => {
  it('카드 기록에서 빠진 줄과 같은 파일을 다른 기록 줄이 아직 가리키면 그 파일은 지우지 않는다', async () => {
    // 왜: 같은 그림 작업이 웹훅과 확인 두 길로 함께 마무리되면 한 파일에 기록 줄이 둘 생긴다 — 하나가 빠질 때 파일을 지우면
    //   남은 줄(지금 그림일 수도 있다)이 깨진 그림이 된다(2026-10-28 검토 지적).
    const dir = `${WS}/${P}/characters/minho`
    const unique = (n: number) => `${dir}/current_main_g${'0000000' + n}-0000-4000-8000-000000000000.png`
    const at = (h: number) => `2026-10-27T0${h}:00:00.000Z`
    const shared = unique(1)
    const rows: Row[] = [
      { id: 'twin-old', url: mediaUrlOf(shared), generated_at: at(1) },
      ...[2, 3, 4, 5].map((h) => ({ id: `keep-${h}`, url: mediaUrlOf(unique(h)), generated_at: at(h) })),
      { id: 'twin-new', url: mediaUrlOf(shared), generated_at: at(6) },
    ].map((row) => ({ project_id: P, character_id: 'minho', appearance_key: 'current', view: 'main', source_hash: null, appearance_hash: null, is_selected: false, pinned: false, ...row }))
    state.db = seed({ character_image_candidates: rows })
    state.db.objects.set(shared, { bytes: Buffer.from('shared') })

    await finalizeCharacterViewJob(characterJob(), 'https://fal.test/new.png')

    const left = state.db.rows('character_image_candidates').map((row) => row.id)
    expect(left).not.toContain('twin-old')
    expect(left).toContain('twin-new')
    expect(state.db.objects.has(shared)).toBe(true)
  })
})

describe('카드 기록 줄이 많을 때', () => {
  const dir = `${WS}/${P}/characters/minho`
  const unique = (n: number) => `${dir}/current_main_g${String(n).padStart(8, '0')}-0000-4000-8000-000000000000.png`
  const at = (h: number) => `2026-10-27T0${h}:00:00.000Z`
  /** 1000줄을 넘는 다른 인물 기록 줄(앞쪽 id) + 민호 칸 6줄(뒤쪽 id). shared 파일은 빠질 줄과 남을 줄이 함께 가리킨다. */
  function manyRows() {
    const filler: Row[] = Array.from({ length: 1100 }, (_, i) => ({ id: `aa-filler-${String(i).padStart(4, '0')}`, project_id: P, character_id: 'extra', appearance_key: 'current', view: 'main', url: mediaUrlOf(`${WS}/${P}/characters/extra/${i}.png`), source_hash: null, appearance_hash: null, is_selected: false, pinned: false, generated_at: at(1) }))
    const slot: Row[] = [
      { id: 'zz-twin-old', url: mediaUrlOf(unique(1)), generated_at: at(1) },
      ...[2, 3, 4, 5].map((h) => ({ id: `zz-keep-${h}`, url: mediaUrlOf(unique(h)), generated_at: at(h) })),
      { id: 'zz-twin-new', url: mediaUrlOf(unique(1)), generated_at: at(6) },
    ].map((row) => ({ project_id: P, character_id: 'minho', appearance_key: 'current', view: 'main', source_hash: null, appearance_hash: null, is_selected: false, pinned: false, ...row }))
    state.db = seed({ character_image_candidates: [...filler, ...slot] })
    state.db.objects.set(unique(1), { bytes: Buffer.from('shared') })
  }

  it('카드 기록 줄이 1000줄을 넘어도 빠진 줄과 같은 파일을 가리키는 줄을 끝까지 찾아 그 파일을 지우지 않는다', async () => {
    // 왜: 한 번 읽기는 1000줄까지라, 뒤쪽 줄이 가리키는 파일을 못 보고 지웠다(2026-10-31 재검토 지적).
    manyRows()
    await finalizeCharacterViewJob(characterJob(), 'https://fal.test/new.png')
    expect(state.db.rows('character_image_candidates').map((row) => row.id)).not.toContain('zz-twin-old')
    expect(state.db.objects.has(unique(1))).toBe(true)
  })

  it('지킬 파일 목록을 나눠 읽다 한 번이라도 실패하면 아무 파일도 지우지 않는다', async () => {
    // 왜: 목록 일부만 보고 지우면 아직 쓰는 파일을 지울 수 있다(2026-10-31 재검토 지적).
    manyRows()
    state.db.objects.set(unique(9), { bytes: Buffer.from('only-in-evicted-row') })
    state.db.rows('character_image_candidates').find((row) => row.id === 'zz-twin-old')!.url = mediaUrlOf(unique(9))
    state.db.failPagedReads.add('character_image_candidates')
    await finalizeCharacterViewJob(characterJob(), 'https://fal.test/new.png')
    expect(state.db.rows('character_image_candidates').map((row) => row.id)).not.toContain('zz-twin-old')
    expect(state.db.objects.has(unique(9))).toBe(true)
  })

  it('나눠 읽는 사이에 다른 요청이 앞쪽 줄을 지워도 뒤쪽 줄을 건너뛰지 않는다', async () => {
    // 왜: 몇 번째 줄부터 읽기로 나누면 앞쪽 줄이 지워질 때 뒤쪽 줄이 한 칸씩 당겨져 하나를 못 읽는다 — 지킬 파일을 못 보고 지울 수 있다(2026-10-31 재검토 지적).
    //   id 보다 뒤를 읽는 식으로 나눈다(지운 줄은 다음 읽기에 영향이 없다). 새로 생긴 줄은 새 그림이라 지울 파일과 상관없다.
    manyRows()
    let deleted = false
    state.db.afterRead.push((table) => {
      if (table !== 'character_image_candidates' || deleted) return
      deleted = true
      state.db.tables.character_image_candidates = state.db.rows('character_image_candidates').filter((row) => row.id !== 'aa-filler-0500')
    })
    const rows = await readAllProjectRows<{ id: string }>('character_image_candidates', 'id', P)
    const ids = new Set(rows.map((row) => row.id))
    for (const row of state.db.rows('character_image_candidates')) expect(ids.has(row.id as string), row.id as string).toBe(true)
  })
})

