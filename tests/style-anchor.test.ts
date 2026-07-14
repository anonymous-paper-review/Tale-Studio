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
  it('returns the same object reference for null anchors in every mode', () => {
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

  it('exports the exact style anchor clause strings', () => {
    expect(STYLE_ANCHOR_CLAUSE).toBe(STYLE_CLAUSE)
    expect(STYLE_ANCHOR_MULTIREF_CLAUSE).toBe(MULTIREF_CLAUSE)
    expect(STYLE_ANCHOR_TEMPLATE_CLAUSE).toBe(TEMPLATE_CLAUSE)
  })

  it('assembles the prompt clause matrix by mode', () => {
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

  it('prepends anchor references while preserving existing reference order', () => {
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

  it('pins aspect ratio only when needed and warns when single mode has no ratio source', () => {
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
  ])('$name', ({ base, expectedModel }) => {
    expect(applyStyleAnchor(anchor, base, 'single').model).toBe(expectedModel)
  })
})

describe('resolveStyleAnchorByKey', () => {
  it('returns null for empty keys without querying', async () => {
    await expect(resolveStyleAnchorByKey(null)).resolves.toBeNull()
    await expect(resolveStyleAnchorByKey(undefined)).resolves.toBeNull()
    await expect(resolveStyleAnchorByKey('')).resolves.toBeNull()

    expect(mocks.from).not.toHaveBeenCalled()
  })

  it('resolves and caches an active style anchor row', async () => {
    mocks.maybeSingle.mockResolvedValueOnce({ data: styleRow(), error: null })

    await expect(resolveStyleAnchorByKey('jp_anime')).resolves.toEqual({
      key: 'jp_anime',
      imageUrl: 'https://cdn.test/style/jp-anime.png',
    })

    expect(mocks.from).toHaveBeenCalledWith('style_anchors')
    expect(mocks.select).toHaveBeenCalledWith('key, image_url, is_active')
    expect(mocks.eq).toHaveBeenCalledWith('key', 'jp_anime')
  })

  it('returns null for inactive rows', async () => {
    mocks.maybeSingle.mockResolvedValueOnce({ data: styleRow({ is_active: false }), error: null })

    await expect(resolveStyleAnchorByKey('jp_anime')).resolves.toBeNull()
  })

  it('returns null for missing rows', async () => {
    mocks.maybeSingle.mockResolvedValueOnce({ data: null, error: null })

    await expect(resolveStyleAnchorByKey('jp_anime')).resolves.toBeNull()
  })

  it('returns null for query errors', async () => {
    const error = { message: 'permission denied' }
    mocks.maybeSingle.mockResolvedValueOnce({ data: null, error })

    await expect(resolveStyleAnchorByKey('jp_anime')).resolves.toBeNull()
    expect(console.warn).toHaveBeenCalledWith('[style-anchor] resolve failed', error)
  })

  it('returns null and warns when the query throws', async () => {
    const error = new Error('network down')
    mocks.maybeSingle.mockRejectedValueOnce(error)

    await expect(resolveStyleAnchorByKey('jp_anime')).resolves.toBeNull()
    expect(console.warn).toHaveBeenCalledWith('[style-anchor] resolve failed', error)
  })

  it('uses a positive cache hit without re-querying', async () => {
    mocks.maybeSingle.mockResolvedValueOnce({ data: styleRow(), error: null })

    await expect(resolveStyleAnchorByKey('jp_anime')).resolves.toEqual({
      key: 'jp_anime',
      imageUrl: 'https://cdn.test/style/jp-anime.png',
    })
    await expect(resolveStyleAnchorByKey('jp_anime')).resolves.toEqual({
      key: 'jp_anime',
      imageUrl: 'https://cdn.test/style/jp-anime.png',
    })

    expect(mocks.from).toHaveBeenCalledTimes(1)
    expect(mocks.maybeSingle).toHaveBeenCalledTimes(1)
  })

  it('re-queries after the positive cache TTL expires', async () => {
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
    })

    vi.advanceTimersByTime(5 * 60 * 1000 + 1)

    await expect(resolveStyleAnchorByKey('jp_anime')).resolves.toEqual({
      key: 'jp_anime',
      imageUrl: 'https://cdn.test/style/refreshed.png',
    })
    expect(mocks.from).toHaveBeenCalledTimes(2)
  })

  it.each([
    ['missing', { data: null, error: null }],
    ['inactive', { data: styleRow({ is_active: false }), error: null }],
  ])('does not cache %s results', async (_name, firstResult) => {
    mocks.maybeSingle
      .mockResolvedValueOnce(firstResult)
      .mockResolvedValueOnce({ data: styleRow(), error: null })

    await expect(resolveStyleAnchorByKey('jp_anime')).resolves.toBeNull()
    await expect(resolveStyleAnchorByKey('jp_anime')).resolves.toEqual({
      key: 'jp_anime',
      imageUrl: 'https://cdn.test/style/jp-anime.png',
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
