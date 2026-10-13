// 서버 배경 초안도 기준 그림 없이 그리는 그림체(실사)면 글자 금지 줄 · 16:9 크기를 정해 보낸다 (오너 2026-10-13 "실사는 기준 그림 없이로만 생성")
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  project: { workspace_id: 'ws-1', style_anchor_key: 'real', custom_style_anchor: null } as Record<string, unknown>,
  location: {
    location_id: 'office', name: '사무실', visual_description: 'Empty office', style_description: null, lighting_direction: null,
    lighting_sources: null, time_of_day: null, purpose: null, props: null, wide_shot: null,
  },
  withoutReference: true,
  submitWorldShotJob: vi.fn(),
}))

vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: {
    from: (table: string) => {
      const query: Record<string, unknown> = {}
      query.select = () => query
      query.eq = () => query
      query.is = () => Promise.resolve({ data: table === 'locations' ? [mocks.location] : [], error: null })
      query.maybeSingle = async () => ({ data: table === 'projects' ? mocks.project : null, error: null })
      return query
    },
  },
}))
vi.mock('@/lib/style-anchor', () => ({ resolveStyleAnchor: async () => null, applyStyleAnchor: (_: unknown, base: unknown) => base }))
vi.mock('@/lib/style-facets/reference-image', () => ({ styleDrawsWithoutReference: async () => mocks.withoutReference }))
vi.mock('@/lib/artist/world-submit', () => ({ submitWorldShotJob: mocks.submitWorldShotJob }))
vi.mock('@/lib/generation-jobs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/generation-jobs')>()),
  hasQueuedWorldShotJob: async () => false,
}))
vi.mock('@/lib/moderation/creem', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/moderation/creem')>()),
  assertUserTextAllowed: async () => ({ id: 'moderation-1' }),
}))
vi.mock('@/lib/writer/debug-events', () => ({ recordWriterObservabilityEvent: async () => undefined }))

import { triggerWorldDrafts } from '@/lib/artist/draft-trigger'

beforeEach(() => {
  mocks.withoutReference = true
  mocks.submitWorldShotJob.mockReset()
  mocks.submitWorldShotJob.mockResolvedValue({ id: 'job-1', request_id: 'req-1', model: 'openai/gpt-image-2', fal_key_id: 'key-1' })
})

describe('기준 그림 없이 그리는 그림체의 서버 배경 초안', () => {
  it('기준 그림 없이 그리는 그림체(실사)의 배경 초안은 글자 금지 줄 · 16:9 크기를 정해 보내라고 넘긴다', async () => {
    // 왜: Writer 가 끝나면 서버가 배경 초안을 먼저 그린다 — 화면에서 그린 배경(generate-world)과 같은 규칙이어야 한다.
    await triggerWorldDrafts('project-1')
    expect(mocks.submitWorldShotJob).toHaveBeenCalledTimes(1)
    expect(mocks.submitWorldShotJob.mock.calls[0][0]).toMatchObject({ anchor: null, styleWithoutReference: true })
  })

  it('그림체가 없는 프로젝트의 배경 초안은 종전 그대로 넘긴다', async () => {
    // 왜: 그림체 없는 길은 바뀌지 않는다(정상 경로 고정).
    mocks.withoutReference = false
    await triggerWorldDrafts('project-1')
    expect(mocks.submitWorldShotJob.mock.calls[0][0]).toMatchObject({ anchor: null, styleWithoutReference: false })
  })
})
