// Artist [완료하기]는 재생성 그림이 다 그려지기 전(또는 버전을 불러오는 중)에는 서버도 받지 않고, 화면은 그 까닭을 한국어로 알린다 (2026-10-28 검토 지적)
import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { memorySupabase, mediaUrlOf, type Row } from '../fixtures/_memory-supabase'

const state = vi.hoisted(() => ({
  db: null as unknown as ReturnType<typeof import('../fixtures/_memory-supabase').memorySupabase>,
}))

vi.mock('next/server', async (orig) => {
  const actual = await orig<typeof import('next/server')>()
  return { ...actual, after: (fn: () => unknown) => { void fn() } }
})
vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: new Proxy({}, { get: (_target, key) => (state.db.client as unknown as Record<string | symbol, unknown>)[key] }),
}))
vi.mock('@/lib/api/guard', () => ({
  requireProjectAccess: vi.fn(async (_req: Request, projectId: string) => ({ ok: true, projectId, userId: 'owner-1', viaShare: false })),
}))
// [만들기]로 씬 · 샷까지 다 나눈 실행 — 완료하기는 Storyboard 를 열기만 한다.
vi.mock('@/lib/writer/run-store', () => ({ getActiveRun: vi.fn(async () => ({ id: 'run-1', status: 'completed', current_stage: 'shotCheck', state: {}, updated_at: '2026-10-28T00:00:00Z' })) }))
vi.mock('@/lib/writer/pipeline/steps', () => ({ triggerWriterStep: vi.fn() }))

import { POST as completeArtist, maxDuration as completeMaxDuration } from '@/app/api/writer/artist-complete/route'
import { completeError } from '@/features/artist-room/artist-complete-dialog'
import { KO } from '@/lib/i18n/messages-ko'

const P = 'p1'
const NOW = () => new Date().toISOString()
const slot = (kind: 'character' | 'location', id: string, appearanceKey: string | null, fromUrl: string) => ({ kind, id, appearanceKey, phase: 0, fromUrl })

function seed(versions: Row[]) {
  return memorySupabase({
    projects: [{ id: P, workspace_id: 'ws1', current_stage: 'artist', style_anchor_key: 'watercolor', custom_style_anchor: null, design_tokens: null }],
    characters: [{ project_id: P, character_id: 'minho', name: '민호', entity_type: 'person' }],
    character_appearances: [{ project_id: P, character_id: 'minho', appearance_key: 'current', is_default: true, sheet_url: 'https://img/minho-old.png', portrait_url: null, derived_from_url: null }],
    character_image_candidates: [],
    locations: [{ project_id: P, location_id: 'hall', name: '회사 복도', wide_shot: 'https://img/hall-old.png' }],
    location_appearances: [],
    location_image_candidates: [],
    generation_jobs: [],
    artist_versions: versions,
  })
}
const v1 = { id: 'v1', project_id: P, n: 1, style_anchor_key: 'real', custom_style_anchor: null, snapshot: { characters: [], locations: [] }, is_current: false, active: [{ from: null, to: NOW() }], regen: null, created_at: NOW(), updated_at: NOW() }
const v2 = (regen: Record<string, unknown> | null, extra: Record<string, unknown> = {}) => ({
  id: 'v2', project_id: P, n: 2, style_anchor_key: 'watercolor', custom_style_anchor: null, snapshot: null, is_current: true,
  active: [{ from: NOW(), to: null }], regen, created_at: NOW(), updated_at: NOW(), ...extra,
})
const pendingRegen = () => ({
  startedAt: NOW(), fromN: 1, failed: [], doneAt: null,
  slots: [slot('character', 'minho', 'current', 'https://img/minho-old.png'), slot('location', 'hall', null, 'https://img/hall-old.png')],
})
const request = () => new NextRequest('http://localhost/api/writer/artist-complete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId: P }) })

beforeEach(() => {
  state.db = seed([v1, v2(pendingRegen())])
})

describe('재생성 중 [완료하기]', () => {
  it('재생성 그림이 다 그려지기 전에는 [완료하기]를 서버도 받지 않고 Storyboard 를 열지 않는다', async () => {
    // 왜: 화면 단추가 꺼져 있어도 다른 창 · 오래된 화면에서 누를 수 있다 — 옛 스타일 그림이 섞인 채로 Storyboard 가 열리면
    //   러프 · 샷이 섞인 그림으로 만들어진다(2026-10-28 검토 지적).
    const res = await completeArtist(request())
    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({ code: 'regen_pending' })
    expect(state.db.rows('projects')[0].current_stage).toBe('artist')
  })

  it('재생성 그림을 다 그렸으면(못 그린 칸이 있어도) [완료하기]를 받는다', async () => {
    // 왜: 정상 경로 고정 — 못 그린 칸은 실패 카드로 남겨 사람이 고른다. 재생성 전체가 완료를 붙잡지 않는다.
    state.db.rows('character_appearances')[0].sheet_url = 'https://img/minho-new.png'
    ;(state.db.rows('artist_versions')[1].regen as { failed: string[] }).failed = ['l:hall:default']
    const res = await completeArtist(request())
    expect(res.status).toBe(200)
    expect(state.db.rows('projects')[0].current_stage).toBe('writer')
  })

  it('버전을 불러오는 중이면(맡은 시간 안) [완료하기]를 받지 않는다', async () => {
    // 왜: 반쯤 되돌린 그림으로 Storyboard 가 열리면 섞인 그림이 넘어간다 — 불러오기가 끝나거나 맡은 시간이 지난 뒤 다시 누른다.
    const later = new Date(Date.now() + 60_000).toISOString()
    state.db = seed([v1, v2(null, { snapshot: { characters: [], locations: [], restoring: { at: NOW(), until: later } } })])
    const res = await completeArtist(request())
    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({ code: 'version_restoring' })
  })

  it('버전을 불러오다 끊긴 뒤 맡은 시간이 지났으면 [완료하기]가 그 버전을 마저 불러온 뒤 받는다', async () => {
    // 왜: 끊긴 불러오기는 기록 읽기가 마저 했는데, 그 전에 [완료하기]를 누르면 "불러오는 중"이라는 거절만 끝없이 되풀이됐다(2026-10-31 재검토 지적).
    const copy = 'ws1/p1/versions/v1/c-minho-current-sheet-abcd.png'
    const past = new Date(Date.now() - 60_000).toISOString()
    state.db = seed([
      { ...v1, is_current: true, active: [{ from: null, to: past }, { from: past, to: null }], snapshot: {
        characters: [{ characterId: 'minho', appearanceKey: 'current', sheet: { url: mediaUrlOf(copy), candidateId: null, sourceHash: null, appearanceHash: null, generatedAt: null }, portraitUrl: mediaUrlOf(copy) }],
        locations: [], restoring: { at: past, until: past },
      } },
      v2(null, { is_current: false, active: [{ from: past, to: past }] }),
    ])
    state.db.objects.set(copy, { bytes: Buffer.from('v1-sheet') })
    const res = await completeArtist(request())
    expect(res.status).toBe(200)
    expect(state.db.rows('character_appearances')[0].sheet_url).toBe(mediaUrlOf(copy))
    expect((state.db.rows('artist_versions').find((row) => row.n === 1)!.snapshot as { restoring?: unknown }).restoring).toBeUndefined()
  })

  it('버전을 다 불러오지 못한 채면 [완료하기]를 받지 않는다', async () => {
    // 왜: 반쯤 불러온 그림이 섞인 채로 Storyboard 가 열렸다 — 다시 불러오거나 이전 버전으로 돌아간 뒤에 완료한다(2026-10-31 재검토 지적).
    state.db = seed([v1, v2(null, { snapshot: { characters: [], locations: [], loadFailed: { at: NOW(), attempts: 3, from: 1 } } })])
    const res = await completeArtist(request())
    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({ code: 'version_load_failed' })
    expect(state.db.rows('projects')[0].current_stage).toBe('artist')
    expect(completeError('version_load_failed')).toEqual({ key: 'The version could not be fully loaded. Load it again or go back to the previous version.' })
    expect(KO['The version could not be fully loaded. Load it again or go back to the previous version.']).toBe('버전을 다 불러오지 못했어요. 다시 불러오거나 이전 버전으로 돌아가 주세요.')
  })

  it('[완료하기]는 끊긴 불러오기를 마저 할 수 있게 불러오기 창구와 같은 시간 제한(300초)을 쓴다', () => {
    // 왜: 마저 하기는 그림 칸이 많으면 오래 걸린다 — 기본 시간 제한에 끊기면 그 시도만 세고 끝난다(2026-10-31 재검토 지적).
    expect(completeMaxDuration).toBe(300)
  })

  it('재생성 때문에 [완료하기]를 받지 않으면 화면은 "다시 만드는 그림을 다 그린 뒤에 완료할 수 있어요."를 알린다', () => {
    // 왜: 영어 오류 글이나 "다시 해 보세요"만으로는 왜 안 되는지 모른다(2026-10-28 검토 지적).
    expect(completeError('regen_pending')).toEqual({ key: 'You can complete once the regenerated images are drawn.' })
    expect(KO['You can complete once the regenerated images are drawn.']).toBe('다시 만드는 그림을 다 그린 뒤에 완료할 수 있어요.')
    expect(completeError('version_restoring')).toEqual({ key: 'Loading the version. Try again in a moment.' })
    expect(KO['Loading the version. Try again in a moment.']).toBe('버전을 불러오는 중이에요. 잠시 뒤 다시 해 보세요.')
  })
})
