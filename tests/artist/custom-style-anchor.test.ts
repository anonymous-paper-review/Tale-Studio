// 사용자가 고른 그림체는 주소가 있으면 그대로 쓰고, 없으면 기본 그림체를 찾아준다
import { beforeEach, describe, expect, it, vi } from 'vitest'

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
  _clearStyleAnchorCacheForTest,
  parseCustomStyleAnchor,
  resolveStyleAnchor,
} from '@/lib/style-anchor'

beforeEach(() => {
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

describe('parseCustomStyleAnchor', () => {
  it('그림 주소가 있을 때만 사용자가 고른 그림체로 인정한다', () => {
    expect(parseCustomStyleAnchor({ url: 'https://x/a.jpg' })).toEqual({
      url: 'https://x/a.jpg',
      label: null,
      medium: null,
    })
    expect(parseCustomStyleAnchor({ label: '수채', medium: '2d_cartoon' })).toBeNull()
    expect(parseCustomStyleAnchor({ url: '' })).toBeNull()
    expect(parseCustomStyleAnchor(null)).toBeNull()
    expect(parseCustomStyleAnchor('https://x/a.jpg')).toBeNull()
  })

  it('그림 이름과 표현 방식은 글자로 적힌 값만 사용한다', () => {
    expect(parseCustomStyleAnchor({ url: 'u', label: 3, medium: {} })).toEqual({
      url: 'u',
      label: null,
      medium: null,
    })
  })
})

describe('resolveStyleAnchor', () => {
  it('사용자가 고른 그림체가 있으면 기본 목록을 조회하지 않는다', async () => {
    const anchor = await resolveStyleAnchor({
      style_anchor_key: 'custom_abc',
      custom_style_anchor: { url: 'https://x/mine.jpg', label: '내 그림체', medium: '2d_cartoon' },
    })

    expect(anchor).toEqual({ key: 'custom_abc', imageUrl: 'https://x/mine.jpg' })
    // DB 왕복이 없어야 한다 — 실체가 프로젝트 행 안에 있다.
    expect(mocks.from).not.toHaveBeenCalled()
  })

  it('선택한 그림체의 이름을 그대로 유지해 같은 그림체로 이어간다', async () => {
    // 여기서 다른 값을 지어내면 서버/클라 지문이 어긋나 모든 에셋이 영구 stale 이 된다.
    const anchor = await resolveStyleAnchor({
      style_anchor_key: 'custom_9f2',
      custom_style_anchor: { url: 'https://x/mine.jpg' },
    })
    expect(anchor?.key).toBe('custom_9f2')
  })

  it('사용자가 고른 그림체가 없으면 기본 목록에서 찾아준다', async () => {
    mocks.maybeSingle.mockResolvedValue({
      data: { key: 'jp_anime', image_url: 'https://cdn/jp.png', is_active: true },
      error: null,
    })

    const anchor = await resolveStyleAnchor({ style_anchor_key: 'jp_anime' })

    // 카탈로그 경로는 #anchor-wiring 확장 필드(medium·styleClause·preview·anchorKind)를 같이 싣는다 — 핵심만 대조.
    expect(anchor).toMatchObject({ key: 'jp_anime', imageUrl: 'https://cdn/jp.png' })
    expect(mocks.from).toHaveBeenCalledWith('style_anchors')
  })

  it('그림 주소가 없는 잘못된 선택은 기본 목록에서 다시 찾는다', async () => {
    mocks.maybeSingle.mockResolvedValue({
      data: { key: 'real', image_url: 'https://cdn/real.png', is_active: true },
      error: null,
    })

    const anchor = await resolveStyleAnchor({
      style_anchor_key: 'real',
      custom_style_anchor: { label: '깨진 행' },
    })

    expect(anchor?.key).toBe('real')
  })

  it('사용자 그림체와 기본 그림체가 모두 없으면 그림체 없이 진행한다 (기존 동작)', async () => {
    expect(await resolveStyleAnchor({ style_anchor_key: null })).toBeNull()
    expect(await resolveStyleAnchor(null)).toBeNull()
  })
})
