// 소품 그림 저절로 그리기 — [만들기] 때 서버가 인물 · 배경 다음에 소품을 그리고, 자리가 없어 못 그린 소품은 화면이 인물 · 배경을 다 그린 뒤 이어 그리며, 완료한 프로젝트는 저절로 그리지 않는다 (D7 · 리드 결정 2, 2026-11-22)
import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  props: [] as Array<{ prop_id: string; name: string; appearance: string | null; image_url: string | null }>,
  hasQueuedPropImageJob: vi.fn(),
  submitPropImageJob: vi.fn(),
  countFailedJobsForTarget: vi.fn(),
  events: [] as Array<[string, Record<string, unknown>]>,
}))
vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: {
    from: (table: string) => {
      const chain: Record<string, unknown> = {}
      for (const m of ['select', 'eq', 'is', 'order']) chain[m] = () => chain
      chain.maybeSingle = async () => ({ data: table === 'projects' ? { workspace_id: 'ws-1', style_anchor_key: 'jp_anime', custom_style_anchor: null } : null, error: null })
      chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: table === 'props' ? mocks.props.filter((p) => !p.image_url) : [], error: null }).then(resolve)
      return chain
    },
  },
}))
vi.mock('@/lib/artist/prop-jobs', () => ({ hasQueuedPropImageJob: mocks.hasQueuedPropImageJob, submitPropImageJob: mocks.submitPropImageJob }))
vi.mock('@/lib/generation-jobs', () => ({ countFailedJobsForTarget: mocks.countFailedJobsForTarget, AUTO_GENERATION_GIVE_UP_THRESHOLD: 2 }))
vi.mock('@/lib/style-anchor', () => ({ resolveStyleAnchor: async () => null }))
vi.mock('@/lib/style-facets/reference-image', () => ({ styleDrawsWithoutReference: async () => false }))
vi.mock('@/lib/moderation/creem', () => ({ assertUserTextAllowed: async () => ({ id: 'moderation-1' }) }))
vi.mock('@/lib/writer/debug-events', () => ({ recordWriterObservabilityEvent: async (_p: string, kind: string, detail: Record<string, unknown>) => { mocks.events.push([kind, detail]) } }))
// 소품 양식(m1126 A2) — 스토리지에 올린 양식 주소.
vi.mock('@/lib/storage/template-asset', () => ({ templateAssetUrl: async (file: string) => `https://media.test/templates/${file}` }))
// 실사 그림체의 사진 글(리드 R2) — 이 시험의 그림체(jp_anime)는 사진 글이 없다.
vi.mock('@/lib/style-facets/photo-look', () => ({ resolvePhotoLook: async () => null }))

import { triggerPropDrafts } from '@/lib/artist/prop-drafts'
import { propsAutoDrawOpen, propsToAutoDraw } from '@/lib/artist/props'
import { useArtistStore } from '@/stores/artist-store'
import { useProjectStore } from '@/stores/project-store'
import type { PropAsset } from '@/types'

const asset = (propId: string, over: Partial<PropAsset> = {}): PropAsset => ({ propId, name: propId, appearance: `${propId} look`, appearanceNative: `${propId} look`, imageUrl: null, sourceHash: null, origin: 'producer', ...over })
const artistInitial = { ...useArtistStore.getInitialState() }

beforeEach(() => {
  mocks.props = [
    { prop_id: 'obj_ring', name: '은반지', appearance: 'a thin silver ring', image_url: null },
    { prop_id: 'obj_letter', name: '편지', appearance: 'a folded letter', image_url: 'https://media.test/letter.png' },
  ]
  mocks.events.length = 0
  mocks.hasQueuedPropImageJob.mockReset().mockResolvedValue(false)
  mocks.countFailedJobsForTarget.mockReset().mockResolvedValue(0)
  mocks.submitPropImageJob.mockReset().mockResolvedValue({ id: 'job-1', model: 'openai/gpt-image-2', request_id: 'req-1' })
})
afterEach(() => {
  useArtistStore.setState({ propAssets: artistInitial.propAssets, generatingProps: artistInitial.generatingProps, propFailures: artistInitial.propFailures })
  useProjectStore.setState({ projectId: null })
  vi.unstubAllGlobals()
})

describe('서버 첫 그림', () => {
  // 왜: 리드 결정 2(D7 "1단계 2단계 모두 진행") — 소품도 배경처럼 [만들기] 때 저절로 그린다. 인물 · 배경 그림이 먼저다(자리를 먼저 쓴다).
  it('[만들기] 때 서버가 인물 · 배경 다음에 소품 그림도 저절로 그린다', async () => {
    const result = await triggerPropDrafts('project-1')
    expect(result).toEqual({ submitted: 1, skipped: 0, failed: 0 })
    expect(mocks.submitPropImageJob).toHaveBeenCalledTimes(1)
    expect(mocks.submitPropImageJob.mock.calls[0][0]).toMatchObject({ projectId: 'project-1', propId: 'obj_ring', actor: 'writer', userId: null, workspaceId: 'ws-1' })
    const trigger = readFileSync('src/lib/artist/draft-trigger.ts', 'utf8')
    expect(trigger).toMatch(/const \[characters, worlds\] = await Promise\.all\([\s\S]*?\]\)\s*\/\/[^\n]*\n\s*const props = await triggerPropDrafts\(projectId\)/)
  })

  // 왜: [만들기] 때 서버가 그리는 첫 그림도 카드 · 창의 그리기와 같은 소품 양식(16:9)이어야 한 프로젝트 안 소품 그림이 같은 모양이다(m1126 A2).
  it('[만들기] 때 서버가 그리는 소품 그림도 소품 양식에 담아 16:9 로 그린다', async () => {
    await triggerPropDrafts('project-1')
    const plan = mocks.submitPropImageJob.mock.calls[0][0].plan
    expect(plan.submit.reference_image_urls).toEqual(['https://media.test/templates/prop-template.png'])
    expect(plan.submit.aspect_ratio).toBe('16:9')
    expect(plan.submit.prompt).toMatch(/^Fill in this prop reference-sheet template/)
  })

  // 왜: 빈칸만 채운다 — 이미 그림이 있거나 그리는 중이거나 두 번 실패한 소품을 또 그리지 않는다(배경 초안과 같은 규칙).
  it('서버 첫 그림은 그림이 있거나 그리는 중이거나 두 번 실패한 소품을 건너뛴다', async () => {
    mocks.props.push({ prop_id: 'obj_key', name: '열쇠', appearance: 'an iron key', image_url: null }, { prop_id: 'obj_cup', name: '컵', appearance: 'a cup', image_url: null })
    mocks.hasQueuedPropImageJob.mockImplementation(async (_p: string, propId: string) => propId === 'obj_key')
    mocks.countFailedJobsForTarget.mockImplementation(async (_p: string, _k: string, target: { propId: string }) => (target.propId === 'obj_cup' ? 2 : 0))
    const result = await triggerPropDrafts('project-1')
    expect(result).toEqual({ submitted: 1, skipped: 2, failed: 0 })
    expect(mocks.submitPropImageJob.mock.calls.map(([input]) => (input as { propId: string }).propId)).toEqual(['obj_ring'])
  })

  // 왜: 자리 예약이 거절되면(사람당 그림 6자리 · 모두의 자리) 그 소품은 건너뛰고 기록을 남긴다 — 화면의 이어 그리기가 나중에 채운다.
  it('서버 첫 그림이 자리가 없으면 그 소품을 건너뛰고 다른 소품은 계속한다', async () => {
    mocks.props.push({ prop_id: 'obj_key', name: '열쇠', appearance: 'an iron key', image_url: null })
    mocks.submitPropImageJob.mockImplementation(async (input: { propId: string }) => {
      if (input.propId === 'obj_ring') throw Object.assign(new Error('capacity'), { name: 'GenerationCapacityError', axis: 'user', queued: 6, limit: 6 })
      return { id: 'job-2', model: 'm', request_id: 'r' }
    })
    const result = await triggerPropDrafts('project-1')
    expect(result).toEqual({ submitted: 1, skipped: 1, failed: 0 })
    expect(mocks.events.some(([kind, detail]) => kind === 'asset_trigger_blocked' && detail.kind === 'prop_image' && detail.propId === 'obj_ring')).toBe(true)
  })
})

describe('화면 이어 그리기', () => {
  // 왜: 서버 첫 그림이 자리 때문에 건너뛴 소품을 사람이 하나씩 누르지 않아도 채운다 — 인물 · 배경을 다 그린 뒤라 자리가 비어 있다.
  it('자리가 없어 못 그린 소품은 화면이 인물 · 배경을 다 그린 뒤 이어 그린다', () => {
    expect(propsAutoDrawOpen({ phase: 'cards', done: true, demo: false })).toBe(true)
    const props = [asset('a'), asset('b', { imageUrl: 'https://media.test/b.png' }), asset('c'), asset('d'), asset('e')]
    expect(propsToAutoDraw(props, { generating: ['c'], failures: { d: { error: 'x', moderation: false, failCount: 1, safeFailCount: 0 } }, tried: new Set(['e']) })).toEqual(['a'])
  })

  // 왜: [완료하기] 전 만드는 동안에만 — 완료한 프로젝트를 열었다고 빈 칸을 저절로 그리지 않는다(빈 그림 이어 그리기와 같은 규칙). 데모는 그리지 않는다.
  it('완료한 프로젝트를 열었다고 소품을 저절로 그리지 않는다', () => {
    expect(propsAutoDrawOpen({ phase: 'done', done: true, demo: false })).toBe(false)
    expect(propsAutoDrawOpen({ phase: 'cards', done: false, demo: false })).toBe(false)
    expect(propsAutoDrawOpen({ phase: 'cards', done: true, demo: true })).toBe(false)
    expect(propsAutoDrawOpen({ phase: 'list', done: true, demo: false })).toBe(false)
  })

  // 왜: 실패한 소품을 저절로 다시 그리면 끝없이 돈다 — 실패는 사람의 [다시 그리기]를 기다린다. 자리가 없으면(429) 거기서 멈추고 카드 단추로 남긴다.
  it('이어 그리기는 실패한 소품을 다시 그리지 않고, 자리가 없으면 멈춘다', async () => {
    useProjectStore.setState({ projectId: 'project-1' })
    useArtistStore.setState({ propAssets: [asset('p1'), asset('p2'), asset('p3'), asset('p4')], generatingProps: [], propFailures: { p2: { error: 'x', moderation: false, failCount: 1, safeFailCount: 0 } } })
    const asked: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (url === '/api/artist/generate-prop') {
        const body = JSON.parse(String(init?.body))
        asked.push(`${body.propId}:${body.actor}`)
        return new Response(JSON.stringify({ error: 'Too many' }), { status: 429 })
      }
      return new Response('{}', { status: 200 })
    }))
    await useArtistStore.getState().continueMissingProps()
    expect(asked[0]).toBe('p1:auto')
    expect(asked).not.toContain('p2:auto')
    expect(asked.length).toBeLessThanOrEqual(3)
    expect(useArtistStore.getState().propFailures.p1).toBeUndefined()
  })

  // 왜: main 이 11/24 오너 결정으로 Artist 동시 장수를 3 → 2 로 내렸다(20명 × 3장이 fal 자리를 넘었다). 소품만 3장씩 보내면 같은 일이 난다 —
  //   인물 · 배경과 같은 창구(/api/artist/generation-slots)에 물어 러프가 도는 동안 1장, 아니면 2장씩 보낸다.
  it('소품 이어 그리기는 인물 · 배경과 같은 동시 장수로 보낸다 — 러프가 도는 동안 1장, 아니면 2장', async () => {
    for (const limit of [2, 1]) {
      useProjectStore.setState({ projectId: `project-slots-${limit}` })
      useArtistStore.setState({ propAssets: [asset('p1'), asset('p2'), asset('p3'), asset('p4')], generatingProps: [], propFailures: {} })
      let inflight = 0
      let peak = 0
      const asked: string[] = []
      vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
        if (url === '/api/artist/generation-slots') return new Response(JSON.stringify({ limit }), { status: 200 })
        if (url === '/api/artist/generate-prop') {
          asked.push(JSON.parse(String(init?.body)).propId)
          inflight++
          peak = Math.max(peak, inflight)
          await new Promise((resolve) => setTimeout(resolve, 5))
          inflight--
          return new Response(JSON.stringify({ ok: true, skipped: true }), { status: 200 })
        }
        return new Response('{}', { status: 200 })
      }))
      await useArtistStore.getState().continueMissingProps()
      expect({ limit, peak }).toEqual({ limit, peak: limit })
      expect(asked.sort()).toEqual(['p1', 'p2', 'p3', 'p4'])
      vi.unstubAllGlobals()
    }
  })
})
