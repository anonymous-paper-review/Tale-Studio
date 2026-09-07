// 선택한 스타일을 그림에 알맞게 반영하고, 사용할 수 없는 스타일은 안전하게 건너뛴다
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  maybeSingle: vi.fn(),
}))

vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: { from: mocks.from },
}))

import {
  STYLE_ANCHOR_CLAUSE,
  STYLE_ANCHOR_MULTIREF_CLAUSE,
  STYLE_ANCHOR_TEMPLATE_CLAUSE,
  _clearStyleAnchorCacheForTest,
  applyStyleAnchor,
  resolveStyleAnchorByKey,
  type AnchorableSubmit,
  type ResolvedStyleAnchor,
} from '@/lib/style-anchor'
import { DEFAULT_EDIT_IMAGE_MODEL } from '@/lib/writer/llm/fal'

const STYLE_CLAUSE = 'STYLE REFERENCE — the FIRST reference image sets the visual style ONLY: match its art medium, rendering technique, linework, shading, lighting mood and color grade exactly. Do NOT reproduce its subject or objects.'
const MULTIREF_CLAUSE = 'The remaining reference images are the character(s) and the location: keep their identity, design and outfit; only re-render them in the style reference\'s look.'
const TEMPLATE_CLAUSE = 'The SECOND reference image is a layout template: keep its section boxes, dividers, labels and headings exactly in place. It is NOT a style reference — take the visual style ONLY from the first image.'

const anchor: ResolvedStyleAnchor = {
  key: 'jp_anime',
  imageUrl: 'https://cdn.test/style/jp-anime.png',
}

beforeEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  _clearStyleAnchorCacheForTest()

  mocks.from.mockReset()
  mocks.select.mockReset()
  mocks.eq.mockReset()
  mocks.maybeSingle.mockReset()

  mocks.from.mockReturnValue({ select: mocks.select })
  mocks.select.mockReturnValue({ eq: mocks.eq })
  mocks.eq.mockReturnValue({ maybeSingle: mocks.maybeSingle })
  mocks.maybeSingle.mockResolvedValue({ data: null, error: null })

  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('applyStyleAnchor', () => {
  it('스타일이 없으면 모든 방식에서 기존 내용을 그대로 돌려준다', () => {
    const base: AnchorableSubmit = {
      prompt: 'Base prompt',
      reference_image_urls: ['https://cdn.test/base.png'],
      aspect_ratio: '16:9',
      model: 'openai/gpt-image-2',
    }

    expect(applyStyleAnchor(null, base, 'single')).toBe(base)
    expect(applyStyleAnchor(null, base, 'multiref')).toBe(base)
    expect(applyStyleAnchor(null, base, 'turnaround', { pinAspectRatio: '16:9' })).toBe(base)
  })

  it('스타일 안내 문구를 정해진 내용 그대로 제공한다', () => {
    expect(STYLE_ANCHOR_CLAUSE).toBe(STYLE_CLAUSE)
    expect(STYLE_ANCHOR_MULTIREF_CLAUSE).toBe(MULTIREF_CLAUSE)
    expect(STYLE_ANCHOR_TEMPLATE_CLAUSE).toBe(TEMPLATE_CLAUSE)
  })

  it('그림 종류에 따라 스타일 안내와 참고 자료 설명을 알맞게 붙인다', () => {
    const prompt = 'Render Mira on the rooftop.'

    const single = applyStyleAnchor(anchor, { prompt, aspect_ratio: '16:9' }, 'single')
    const turnaround = applyStyleAnchor(anchor, { prompt }, 'turnaround', { pinAspectRatio: '16:9' })
    const multiref = applyStyleAnchor(anchor, { prompt, aspect_ratio: '16:9' }, 'multiref')

    expect(single).not.toBe(turnaround)
    expect(single.prompt).toBe(`${STYLE_ANCHOR_CLAUSE}\n${prompt}`)
    expect(single.prompt).not.toContain(STYLE_ANCHOR_TEMPLATE_CLAUSE)
    expect(single.prompt).not.toContain(STYLE_ANCHOR_MULTIREF_CLAUSE)

    expect(turnaround.prompt).toBe(`${STYLE_ANCHOR_CLAUSE}\n${STYLE_ANCHOR_TEMPLATE_CLAUSE}\n${prompt}`)
    expect(turnaround.prompt).not.toContain(STYLE_ANCHOR_MULTIREF_CLAUSE)

    expect(multiref.prompt).toBe(`${STYLE_ANCHOR_CLAUSE}\n${STYLE_ANCHOR_MULTIREF_CLAUSE}\n${prompt}`)
    expect(multiref.prompt).not.toContain(STYLE_ANCHOR_TEMPLATE_CLAUSE)
  })

  it('스타일 참고 이미지를 먼저 두고 기존 참고 이미지 순서를 지킨다', () => {
    const withRefs = applyStyleAnchor(
      anchor,
      {
        prompt: 'Render the cast.',
        reference_image_urls: ['https://cdn.test/character.png', 'https://cdn.test/location.png'],
        aspect_ratio: '16:9',
      },
      'multiref',
    )
    const withoutRefs = applyStyleAnchor(anchor, { prompt: 'Render the prop.', aspect_ratio: '1:1' }, 'single')

    expect(withRefs.reference_image_urls).toEqual([
      anchor.imageUrl,
      'https://cdn.test/character.png',
      'https://cdn.test/location.png',
    ])
    expect(withoutRefs.reference_image_urls).toEqual([anchor.imageUrl])
  })

  it('필요할 때만 화면 비율을 고정하고 비율 정보가 없으면 알린다', () => {
    const base: AnchorableSubmit = { prompt: 'Turnaround template prompt' }
    const pinned = applyStyleAnchor(anchor, base, 'turnaround', { pinAspectRatio: '16:9' })
    const explicit = applyStyleAnchor(
      anchor,
      { prompt: 'Explicit ratio prompt', aspect_ratio: '4:3' },
      'turnaround',
      { pinAspectRatio: '16:9' },
    )
    const unpinnedSingle = applyStyleAnchor(anchor, { prompt: 'No ratio prompt' }, 'single')

    expect(pinned).not.toBe(base)
    expect(base).not.toHaveProperty('aspect_ratio')
    expect(pinned.aspect_ratio).toBe('16:9')
    expect(explicit.aspect_ratio).toBe('4:3')
    expect(unpinnedSingle).not.toHaveProperty('aspect_ratio')
    expect(console.warn).toHaveBeenCalledWith('[style-anchor] no aspect_ratio pinned for mode', 'single')
  })

  it.each<{ name: string; base: AnchorableSubmit; expectedModel: string }>([
    {
      name: 'unset model uses the default edit model',
      base: { prompt: 'Base prompt', aspect_ratio: '1:1' },
      expectedModel: DEFAULT_EDIT_IMAGE_MODEL,
    },
    {
      name: 'explicit T2I model normalizes to the default edit model',
      base: { prompt: 'Base prompt', aspect_ratio: '1:1', model: 'openai/gpt-image-2' },
      expectedModel: DEFAULT_EDIT_IMAGE_MODEL,
    },
    {
      name: 'explicit edit-class model is kept',
      base: { prompt: 'Base prompt', aspect_ratio: '1:1', model: 'openai/gpt-image-2/edit' },
      expectedModel: 'openai/gpt-image-2/edit',
    },
    {
      name: 'redux model is kept',
      base: { prompt: 'Base prompt', aspect_ratio: '1:1', model: 'fal-ai/flux-pro/v1.1/redux' },
      expectedModel: 'fal-ai/flux-pro/v1.1/redux',
    },
    {
      name: 'ip-adapter model is kept',
      base: { prompt: 'Base prompt', aspect_ratio: '1:1', model: 'fal-ai/flux/ip-adapter' },
      expectedModel: 'fal-ai/flux/ip-adapter',
    },
  ])('$name인 상황이면 알맞은 그림 방식을 선택한다', ({ base, expectedModel }) => {
    expect(applyStyleAnchor(anchor, base, 'single').model).toBe(expectedModel)
  })
})

describe('resolveStyleAnchorByKey', () => {
  it('스타일 이름이 없으면 목록을 확인하지 않고 비워 둔다', async () => {
    await expect(resolveStyleAnchorByKey(null)).resolves.toBeNull()
    await expect(resolveStyleAnchorByKey(undefined)).resolves.toBeNull()
    await expect(resolveStyleAnchorByKey('')).resolves.toBeNull()

    expect(mocks.from).not.toHaveBeenCalled()
  })

  it('사용 가능한 스타일을 찾으면 다음에도 바로 쓸 수 있게 기억한다', async () => {
    mocks.maybeSingle.mockResolvedValueOnce({ data: styleRow(), error: null })

    await expect(resolveStyleAnchorByKey('jp_anime')).resolves.toEqual({
      key: 'jp_anime',
      imageUrl: 'https://cdn.test/style/jp-anime.png',
      medium: null, // #F-004 B7 — 영상 카메라 기재 억제 판정용으로 resolver 가 함께 나른다
      // #anchor-wiring(2026-08-14): 검증 절·preview 병행·앵커 종류 — DB 미설정 시 기본값
      styleClause: null,
      usePreviewRef: false,
      previewUrl: null,
      anchorKind: 'media',
    })

    expect(mocks.from).toHaveBeenCalledWith('style_anchors')
    expect(mocks.select).toHaveBeenCalledWith('key, image_url, is_active, medium, style_clause, use_preview_ref, preview_url, anchor_kind')
    expect(mocks.eq).toHaveBeenCalledWith('key', 'jp_anime')
  })

  it('사용 중지된 스타일은 찾지 못한 것으로 처리한다', async () => {
    mocks.maybeSingle.mockResolvedValueOnce({ data: styleRow({ is_active: false }), error: null })

    await expect(resolveStyleAnchorByKey('jp_anime')).resolves.toBeNull()
  })

  it('없는 스타일은 찾지 못한 것으로 처리한다', async () => {
    mocks.maybeSingle.mockResolvedValueOnce({ data: null, error: null })

    await expect(resolveStyleAnchorByKey('jp_anime')).resolves.toBeNull()
  })

  it('스타일 목록을 확인하지 못하면 찾지 못한 것으로 처리한다', async () => {
    const error = { message: 'permission denied' }
    mocks.maybeSingle.mockResolvedValueOnce({ data: null, error })

    await expect(resolveStyleAnchorByKey('jp_anime')).resolves.toBeNull()
    expect(console.warn).toHaveBeenCalledWith('[style-anchor] resolve failed', error)
  })

  it('스타일 목록을 확인하는 중 문제가 생기면 찾지 못한 것으로 처리하고 알린다', async () => {
    const error = new Error('network down')
    mocks.maybeSingle.mockRejectedValueOnce(error)

    await expect(resolveStyleAnchorByKey('jp_anime')).resolves.toBeNull()
    expect(console.warn).toHaveBeenCalledWith('[style-anchor] resolve failed', error)
  })

  it('이미 찾은 사용 가능한 스타일은 다시 확인하지 않고 바로 쓴다', async () => {
    mocks.maybeSingle.mockResolvedValueOnce({ data: styleRow(), error: null })

    await expect(resolveStyleAnchorByKey('jp_anime')).resolves.toEqual({
      key: 'jp_anime',
      imageUrl: 'https://cdn.test/style/jp-anime.png',
      medium: null, // #F-004 B7 — 영상 카메라 기재 억제 판정용으로 resolver 가 함께 나른다
      // #anchor-wiring(2026-08-14): 검증 절·preview 병행·앵커 종류 — DB 미설정 시 기본값
      styleClause: null,
      usePreviewRef: false,
      previewUrl: null,
      anchorKind: 'media',
    })
    await expect(resolveStyleAnchorByKey('jp_anime')).resolves.toEqual({
      key: 'jp_anime',
      imageUrl: 'https://cdn.test/style/jp-anime.png',
      medium: null, // #F-004 B7 — 영상 카메라 기재 억제 판정용으로 resolver 가 함께 나른다
      // #anchor-wiring(2026-08-14): 검증 절·preview 병행·앵커 종류 — DB 미설정 시 기본값
      styleClause: null,
      usePreviewRef: false,
      previewUrl: null,
      anchorKind: 'media',
    })

    expect(mocks.from).toHaveBeenCalledTimes(1)
    expect(mocks.maybeSingle).toHaveBeenCalledTimes(1)
  })

  it('기억해 둔 유효 시간이 지나면 스타일을 다시 확인한다', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-13T00:00:00.000Z'))
    mocks.maybeSingle
      .mockResolvedValueOnce({ data: styleRow(), error: null })
      .mockResolvedValueOnce({
        data: styleRow({ image_url: 'https://cdn.test/style/refreshed.png' }),
        error: null,
      })

    await expect(resolveStyleAnchorByKey('jp_anime')).resolves.toEqual({
      key: 'jp_anime',
      imageUrl: 'https://cdn.test/style/jp-anime.png',
      medium: null, // #F-004 B7 — 영상 카메라 기재 억제 판정용으로 resolver 가 함께 나른다
      // #anchor-wiring(2026-08-14): 검증 절·preview 병행·앵커 종류 — DB 미설정 시 기본값
      styleClause: null,
      usePreviewRef: false,
      previewUrl: null,
      anchorKind: 'media',
    })

    vi.advanceTimersByTime(5 * 60 * 1000 + 1)

    await expect(resolveStyleAnchorByKey('jp_anime')).resolves.toEqual({
      key: 'jp_anime',
      imageUrl: 'https://cdn.test/style/refreshed.png',
      medium: null,
      styleClause: null,
      usePreviewRef: false,
      previewUrl: null,
      anchorKind: 'media',
    })
    expect(mocks.from).toHaveBeenCalledTimes(2)
  })

  it.each([
    ['missing', { data: null, error: null }],
    ['inactive', { data: styleRow({ is_active: false }), error: null }],
  ])('없는 스타일 상태인 %s는 기억해 두지 않는다', async (_name, firstResult) => {
    mocks.maybeSingle
      .mockResolvedValueOnce(firstResult)
      .mockResolvedValueOnce({ data: styleRow(), error: null })

    await expect(resolveStyleAnchorByKey('jp_anime')).resolves.toBeNull()
    await expect(resolveStyleAnchorByKey('jp_anime')).resolves.toEqual({
      key: 'jp_anime',
      imageUrl: 'https://cdn.test/style/jp-anime.png',
      medium: null, // #F-004 B7 — 영상 카메라 기재 억제 판정용으로 resolver 가 함께 나른다
      // #anchor-wiring(2026-08-14): 검증 절·preview 병행·앵커 종류 — DB 미설정 시 기본값
      styleClause: null,
      usePreviewRef: false,
      previewUrl: null,
      anchorKind: 'media',
    })

    expect(mocks.from).toHaveBeenCalledTimes(2)
    expect(mocks.maybeSingle).toHaveBeenCalledTimes(2)
  })
})

function styleRow(overrides: Partial<{ key: string; image_url: string; is_active: boolean | null }> = {}) {
  return {
    key: 'jp_anime',
    image_url: 'https://cdn.test/style/jp-anime.png',
    is_active: true,
    ...overrides,
  }
}
