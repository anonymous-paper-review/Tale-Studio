// 실사처럼 기준 그림을 쓰지 않게 정한 그림체는 기준 그림 없이 글로만 그리고, 그 배경은 16:9 · 글자 없이 나온다 (오너 2026-10-13 "실사는 기준 그림 없이로만 생성")
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  rows: new Map<string, { data: unknown; error: unknown }>(),
  selects: [] as string[],
  reserveGenerationJob: vi.fn(),
  confirmGenerationJobReceipt: vi.fn(),
  rejectGenerationJobReservation: vi.fn(),
  falImageSubmit: vi.fn(),
}))

// style_anchors 조회 — 고른 칸(select 문자열)마다 돌려줄 답을 정한다.
vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: {
    from: () => ({
      select: (columns: string) => {
        mocks.selects.push(columns)
        return { eq: () => ({ maybeSingle: async () => mocks.rows.get(columns) ?? { data: null, error: null } }) }
      },
    }),
  },
}))
vi.mock('@/lib/generation-jobs', () => ({
  reserveGenerationJob: mocks.reserveGenerationJob,
  confirmGenerationJobReceipt: mocks.confirmGenerationJobReceipt,
  rejectGenerationJobReservation: mocks.rejectGenerationJobReservation,
}))
vi.mock('@/lib/writer/llm/fal', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/writer/llm/fal')>()),
  falImageSubmit: mocks.falImageSubmit,
}))
vi.mock('@/lib/fal/webhook-url', () => ({ resolveWebhookUrl: () => undefined }))
vi.mock('@/lib/api/moderation', () => ({ recordModerationPass: () => undefined }))

import { _clearStyleAnchorCacheForTest, FACET_NO_TEXT, resolveStyleAnchor } from '@/lib/style-anchor'
import { styleDrawsWithoutReference } from '@/lib/style-facets/reference-image'
import { submitWorldShotJob, type SubmitWorldShotJobInput } from '@/lib/artist/world-submit'
import { buildFalImageInput } from '@/lib/writer/llm/fal'
import { MODERATION_FIXTURE } from '../fixtures/_moderation.ts'

const BY_KEY = 'key, image_url, is_active, medium, style_clause, use_preview_ref, preview_url, anchor_kind'
const FLAG = 'use_reference_image'
const FACETS = { probe_anchors: 'No outlines; photographic soft light.', negative: 'Avoid anime, logos.' }
const realRow = { key: 'real', image_url: 'https://anchor/real.png', is_active: true, medium: 'live_action', style_clause: null, use_preview_ref: false, preview_url: null, anchor_kind: 'media' }

beforeEach(() => {
  _clearStyleAnchorCacheForTest()
  mocks.rows.clear()
  mocks.selects.length = 0
  mocks.rows.set(BY_KEY, { data: realRow, error: null })
  mocks.reserveGenerationJob.mockReset()
  mocks.reserveGenerationJob.mockResolvedValue({ id: 'job-1', fal_key_id: 'key-1' })
  mocks.confirmGenerationJobReceipt.mockReset()
  mocks.confirmGenerationJobReceipt.mockResolvedValue(undefined)
  mocks.rejectGenerationJobReservation.mockReset()
  mocks.falImageSubmit.mockReset()
  mocks.falImageSubmit.mockResolvedValue({ request_id: 'req-1', model: 'openai/gpt-image-2', fal_key_id: 'key-1' })
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

describe('기준 그림을 쓰지 않는 그림체', () => {
  it('기준 그림을 쓰지 않게 정한 그림체(실사)는 그림체 없음처럼 기준 그림 · 그림체 글 없이 그린다', async () => {
    // 왜: 오너가 실사는 기준 그림 없이 그리기로 정했다(2026-10-13) — 그림체가 없는 프로젝트와 같은 길로 간다.
    mocks.rows.set(FLAG, { data: { use_reference_image: false }, error: null })
    mocks.rows.set('facets', { data: { facets: FACETS }, error: null })
    expect(await resolveStyleAnchor({ style_anchor_key: 'real' })).toBeNull()
  })

  it('기준 그림 칸이 켜져 있거나 비어 있는 그림체는 지금처럼 기준 그림과 그림체 글을 싣는다', async () => {
    // 왜: 다른 그림체(애니 · 수채 · 실사 서브룩 등)는 바뀌지 않는다(정상 경로 고정).
    mocks.rows.set(FLAG, { data: { use_reference_image: true }, error: null })
    mocks.rows.set('facets', { data: { facets: FACETS }, error: null })
    const on = await resolveStyleAnchor({ style_anchor_key: 'real' })
    expect(on?.imageUrl).toBe('https://anchor/real.png')
    expect(on?.facets?.probeAnchors).toBe('No outlines; photographic soft light.')
    _clearStyleAnchorCacheForTest()
    mocks.rows.set(FLAG, { data: {}, error: null })
    const unset = await resolveStyleAnchor({ style_anchor_key: 'real' })
    expect(unset?.imageUrl).toBe('https://anchor/real.png')
    expect(unset?.facets?.negative).toBe('Avoid anime, logos.')
  })

  it('기준 그림 칸이 아직 없는 DB 에서도 그림체 글은 지금처럼 싣는다', async () => {
    // 왜: 코드가 운영 DB 칸 추가보다 먼저 나가도 그림체가 흐트러지지 않아야 한다(배포 순서 보호).
    mocks.rows.set(FLAG, { data: null, error: { code: '42703', message: 'column style_anchors.use_reference_image does not exist' } })
    mocks.rows.set('facets', { data: { facets: FACETS }, error: null })
    const anchor = await resolveStyleAnchor({ style_anchor_key: 'real' })
    expect(anchor?.imageUrl).toBe('https://anchor/real.png')
    expect(anchor?.facets?.probeAnchors).toBe('No outlines; photographic soft light.')
  })

  it('칸을 한 번 읽은 뒤 조회가 잠깐 실패해도 마지막으로 읽은 값(기준 그림 없음)을 쓰고 경고를 남긴다', async () => {
    // 왜: 운영에서 칸을 읽은 뒤 DB 가 잠깐 실패하면 실사에 기준 그림이 다시 붙어 오너가 정한 것과 반대로 그려졌다(검토 2026-10-13).
    vi.useFakeTimers()
    try {
      mocks.rows.set(FLAG, { data: { use_reference_image: false }, error: null })
      mocks.rows.set('facets', { data: { facets: FACETS }, error: null })
      expect(await resolveStyleAnchor({ style_anchor_key: 'real' })).toBeNull()
      vi.advanceTimersByTime(5 * 60 * 1000 + 1)
      mocks.rows.set(FLAG, { data: null, error: { code: '57014', message: 'canceling statement due to statement timeout' } })
      expect(await resolveStyleAnchor({ style_anchor_key: 'real' })).toBeNull()
      expect(console.warn).toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('사용자가 올린 그림체는 이 칸과 관계없이 기준 그림을 싣는다', async () => {
    // 왜: 칸은 우리 그림체 목록(프리셋)의 설정이다 — 사용자가 고정한 그림은 그 그림을 따라야 한다.
    mocks.rows.set(FLAG, { data: { use_reference_image: false }, error: null })
    const anchor = await resolveStyleAnchor({ style_anchor_key: 'custom_1', custom_style_anchor: { url: 'https://user/style.png' } })
    expect(anchor?.imageUrl).toBe('https://user/style.png')
    expect(await styleDrawsWithoutReference({ style_anchor_key: 'custom_1', custom_style_anchor: { url: 'https://user/style.png' } })).toBe(false)
  })

  it('프로젝트의 그림체가 기준 그림 없이 그리는지 알 수 있다 — 배경의 글자 금지 줄을 정할 때 쓴다', async () => {
    // 왜: 기준 그림이 없으면 배경을 그리는 쪽이 따로 글자를 막아야 한다.
    mocks.rows.set(FLAG, { data: { use_reference_image: false }, error: null })
    expect(await styleDrawsWithoutReference({ style_anchor_key: 'real' })).toBe(true)
    _clearStyleAnchorCacheForTest()
    mocks.rows.set(FLAG, { data: { use_reference_image: true }, error: null })
    expect(await styleDrawsWithoutReference({ style_anchor_key: 'real' })).toBe(false)
    expect(await styleDrawsWithoutReference({ style_anchor_key: null })).toBe(false)
  })
})

describe('기준 그림 없이 그리는 배경', () => {
  const world = (extra: { styleWithoutReference?: boolean } = {}): SubmitWorldShotJobInput => ({
    projectId: 'project-1',
    locationId: 'location-1',
    column: 'wide_shot',
    prompt: 'Empty office, no people or characters, empty environment',
    aspectRatio: '16:9',
    actor: 'ui',
    anchor: null,
    moderation: MODERATION_FIXTURE,
    ...extra,
  })

  it('기준 그림 없이 그리는 그림체의 배경에는 글자 금지 줄을 붙이고 16:9 크기를 정해 보낸다', async () => {
    // 왜: 기준 그림 없이 그린 실사 배경 7장 중 3장에 ELENA 로고 · 간판 · 현수막 글자가 들어갔고(2026-10-12 시험),
    //   새로 그리기 모델은 비율을 무시해 1024x768(4:3)로 그렸다.
    await submitWorldShotJob(world({ styleWithoutReference: true }))
    const opts = mocks.falImageSubmit.mock.calls[0][0]
    expect(opts.prompt).toBe(`Empty office, no people or characters, empty environment\n${FACET_NO_TEXT}`)
    expect(opts.image_size).toBe('landscape_16_9')
    expect(buildFalImageInput(opts, 'openai/gpt-image-2').image_size).toBe('landscape_16_9')
  })

  it('그림체가 없는 프로젝트의 배경에는 글자 금지 줄도 크기도 붙이지 않는다', async () => {
    // 왜: 그림체 없는 길은 "고른 내용 말고는 몰래 덧붙이지 않는다"가 약속이다(정상 경로 고정).
    await submitWorldShotJob(world())
    const opts = mocks.falImageSubmit.mock.calls[0][0]
    expect(opts.prompt).toBe('Empty office, no people or characters, empty environment')
    expect(opts).not.toHaveProperty('image_size')
  })

  it('크기를 정하지 않은 GPT Image 2 새로 그리기 요청은 지금처럼 비율만 보낸다', () => {
    // 왜: 크기 바꾸기는 기준 그림 없이 그리는 배경에만 한다 — 그림체 없는 배경 · 사물 · Director 에셋 노드의 그림 크기는 그대로(정상 경로 고정).
    expect(buildFalImageInput({ prompt: 'p', aspect_ratio: '16:9' }, 'openai/gpt-image-2')).toEqual({ prompt: 'p', aspect_ratio: '16:9' })
    expect(buildFalImageInput({ prompt: 'p' }, 'openai/gpt-image-2')).toEqual({ prompt: 'p' })
  })

  it('GPT Image 2 새로 그리기에 크기를 정해 보내면 그 크기를 보낸다', () => {
    // 왜: 새로 그리기 모델은 비율이 아니라 크기만 받는다 — 정한 크기(이름 · 가로×세로)는 그대로 전달한다.
    expect(buildFalImageInput({ prompt: 'p', image_size: 'landscape_16_9' }, 'openai/gpt-image-2')).toEqual({ prompt: 'p', image_size: 'landscape_16_9' })
    expect(buildFalImageInput({ prompt: 'p', image_size: '1536x864' }, 'openai/gpt-image-2')).toEqual({ prompt: 'p', image_size: { width: 1536, height: 864 } })
  })
})
