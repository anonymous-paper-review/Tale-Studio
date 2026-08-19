import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  upload: vi.fn(),
  from: vi.fn(),
}))

vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: { storage: { from: mocks.from } },
}))

import { _clearTemplateAssetCacheForTest, templateAssetUrl } from '@/lib/storage/template-asset'

beforeEach(() => {
  vi.restoreAllMocks()
  _clearTemplateAssetCacheForTest()
  mocks.list.mockReset()
  mocks.upload.mockReset()
  mocks.from.mockReset()

  // 주소는 이제 보관함 SDK 가 아니라 `storage/media-url` 이 만든다. 여기서 override 를 켜
  // 이전 후 구성(다른 회사 CDN 접두사)을 그대로 시험한다.
  vi.stubEnv('NEXT_PUBLIC_MEDIA_PUBLIC_BASE_URL', 'https://cdn.test/media')

  mocks.from.mockReturnValue({
    list: mocks.list,
    upload: mocks.upload,
  })
  mocks.list.mockResolvedValue({ data: [], error: null })
  mocks.upload.mockResolvedValue({ error: null })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('templateAssetUrl', () => {
  it('내용 해시가 경로에 들어간다 (레포 PNG 교체 시 자동 무효화)', async () => {
    const url = await templateAssetUrl('rough-storyboard-grid.png')
    expect(url).toMatch(
      /^https:\/\/cdn\.test\/media\/templates\/rough-storyboard-grid-[0-9a-f]{12}\.png$/,
    )
  })

  it('프로세스당 한 번만 올린다 (콜드스타트마다 1.4MB 재업로드 금지)', async () => {
    await templateAssetUrl('rough-storyboard-grid.png')
    await templateAssetUrl('rough-storyboard-grid.png')
    await templateAssetUrl('rough-storyboard-grid.png')
    expect(mocks.upload).toHaveBeenCalledTimes(1)
  })

  it('이미 있으면 업로드를 건너뛴다', async () => {
    mocks.list.mockResolvedValue({ data: [{ name: 'anything' }], error: null })
    const url = await templateAssetUrl('character-template.png')
    expect(mocks.upload).not.toHaveBeenCalled()
    expect(url).toContain('templates/character-template-')
  })

  it('업로드 실패는 던지지 않고 null — 호출부가 T2I 로 폴백한다', async () => {
    mocks.upload.mockResolvedValue({ error: new Error('storage down') })
    expect(await templateAssetUrl('rough-storyboard-strip.png')).toBeNull()
  })

  it('없는 파일도 null (생성 경로를 막지 않는다)', async () => {
    expect(await templateAssetUrl('does-not-exist.png')).toBeNull()
  })

  it('파일마다 다른 해시 → 다른 경로', async () => {
    const grid = await templateAssetUrl('rough-storyboard-grid.png')
    const strip = await templateAssetUrl('rough-storyboard-strip.png')
    expect(grid).not.toBe(strip)
  })
})
