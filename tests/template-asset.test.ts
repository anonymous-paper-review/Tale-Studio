import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  upload: vi.fn(),
  getPublicUrl: vi.fn(),
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
  mocks.getPublicUrl.mockReset()
  mocks.from.mockReset()

  mocks.from.mockReturnValue({
    list: mocks.list,
    upload: mocks.upload,
    getPublicUrl: mocks.getPublicUrl,
  })
  mocks.list.mockResolvedValue({ data: [], error: null })
  mocks.upload.mockResolvedValue({ error: null })
  mocks.getPublicUrl.mockImplementation((p: string) => ({
    data: { publicUrl: `https://cdn.test/media/${p}` },
  }))
  vi.spyOn(console, 'error').mockImplementation(() => {})
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
