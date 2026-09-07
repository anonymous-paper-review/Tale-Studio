// 필요한 그림 파일을 최신 주소로 한 번만 보관하고, 오래된 파일은 안전하게 정리한다
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  upload: vi.fn(),
  remove: vi.fn(),
  getPublicUrl: vi.fn(),
  from: vi.fn(),
  dbFrom: vi.fn(),
  dbEq: vi.fn(),
}))

vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: { storage: { from: mocks.from }, from: mocks.dbFrom },
}))

import {
  _clearTemplateAssetCacheForTest,
  _staleSiblings,
  templateAssetUrl,
} from '@/lib/storage/template-asset'

/** 존재 확인이 정확한 객체명 매칭이 되면서, 테스트도 실제 해시로 목록을 흉내내야 한다. */
function hashedName(fileName: string): string {
  const bytes = readFileSync(path.join(process.cwd(), 'public', fileName))
  const hash = createHash('sha256').update(bytes).digest('hex').slice(0, 12)
  const ext = path.extname(fileName) || '.png'
  return `${path.basename(fileName, ext)}-${hash}${ext}`
}

beforeEach(() => {
  vi.restoreAllMocks()
  _clearTemplateAssetCacheForTest()
  mocks.list.mockReset()
  mocks.upload.mockReset()
  mocks.remove.mockReset()
  mocks.getPublicUrl.mockReset()
  mocks.from.mockReset()
  mocks.dbFrom.mockReset()
  mocks.dbEq.mockReset()

  // 주소는 이제 보관함 SDK 가 아니라 `storage/media-url` 이 만든다. 여기서 override 를 켜
  // 이전 후 구성(다른 회사 CDN 접두사)을 그대로 시험한다.
  vi.stubEnv('NEXT_PUBLIC_MEDIA_PUBLIC_BASE_URL', 'https://cdn.test/media')

  mocks.from.mockReturnValue({
    list: mocks.list,
    upload: mocks.upload,
    remove: mocks.remove,
    getPublicUrl: mocks.getPublicUrl,
  })
  mocks.list.mockResolvedValue({ data: [], error: null })
  mocks.upload.mockResolvedValue({ error: null })
  mocks.remove.mockResolvedValue({ data: null, error: null })
  mocks.getPublicUrl.mockImplementation((p: string) => ({
    data: { publicUrl: `https://cdn.test/media/${p}` },
  }))
  mocks.dbFrom.mockReturnValue({ select: () => ({ eq: mocks.dbEq }) })
  mocks.dbEq.mockResolvedValue({ data: [], error: null })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('templateAssetUrl', () => {
  it('파일 내용이 달라지면 다른 주소를 사용한다', async () => {
    const url = await templateAssetUrl('rough-storyboard-grid.png')
    expect(url).toMatch(
      /^https:\/\/cdn\.test\/media\/templates\/rough-storyboard-grid-[0-9a-f]{12}\.png$/,
    )
  })

  it('같은 파일은 한 번만 올려 불필요하게 다시 올리지 않는다', async () => {
    await templateAssetUrl('rough-storyboard-grid.png')
    await templateAssetUrl('rough-storyboard-grid.png')
    await templateAssetUrl('rough-storyboard-grid.png')
    expect(mocks.upload).toHaveBeenCalledTimes(1)
  })

  it('최신 파일이 이미 보관되어 있으면 다시 올리지 않는다', async () => {
    mocks.list.mockResolvedValue({
      data: [{ name: hashedName('character-template.png') }],
      error: null,
    })
    const url = await templateAssetUrl('character-template.png')
    expect(mocks.upload).not.toHaveBeenCalled()
    expect(url).toContain('templates/character-template-')
  })

  it('파일을 올리지 못해도 전체 작업을 막지 않고 다른 방법으로 진행한다', async () => {
    mocks.upload.mockResolvedValue({ error: new Error('storage down') })
    expect(await templateAssetUrl('rough-storyboard-strip.png')).toBeNull()
  })

  it('파일이 없어도 그림 만들기를 막지 않는다', async () => {
    expect(await templateAssetUrl('does-not-exist.png')).toBeNull()
  })

  it('파일마다 다른 주소를 사용한다', async () => {
    const grid = await templateAssetUrl('rough-storyboard-grid.png')
    const strip = await templateAssetUrl('rough-storyboard-strip.png')
    expect(grid).not.toBe(strip)
  })
})

// #template-latest-only — 승격 시 같은 base 의 구판 해시 객체를 자동 삭제 (최신 버전만 관리)
describe('_staleSiblings — 스테일 형제 판별 (순수)', () => {
  const ext = '.png'

  it('오래된 버전만 치우고 현재 버전은 남긴다', () => {
    expect(
      _staleSiblings(
        ['rough-storyboard-grid-cinema-aaaaaaaaaaaa.png', 'rough-storyboard-grid-cinema-bbbbbbbbbbbb.png'],
        'rough-storyboard-grid-cinema',
        ext,
        'rough-storyboard-grid-cinema-bbbbbbbbbbbb.png',
        [],
      ),
    ).toEqual(['rough-storyboard-grid-cinema-aaaaaaaaaaaa.png'])
  })

  it('이름이 비슷한 다른 파일은 잘못 지우지 않는다', () => {
    expect(
      _staleSiblings(
        ['rough-storyboard-grid-cinema-aaaaaaaaaaaa.png', 'rough-storyboard-grid-aaaaaaaaaaaa.png'],
        'rough-storyboard-grid',
        ext,
        'rough-storyboard-grid-bbbbbbbbbbbb.png',
        [],
      ),
    ).toEqual(['rough-storyboard-grid-aaaaaaaaaaaa.png'])
  })

  it('규칙에 맞지 않는 파일 이름은 건드리지 않는다', () => {
    expect(
      _staleSiblings(
        ['character-template-notahash.png', 'character-template-.png'],
        'character-template',
        ext,
        'character-template-aaaaaaaaaaaa.png',
        [],
      ),
    ).toEqual([])
  })

  it('진행 중인 작업이 쓰는 파일은 보호한다', () => {
    expect(
      _staleSiblings(
        ['rough-storyboard-grid-aaaaaaaaaaaa.png', 'rough-storyboard-grid-cccccccccccc.png'],
        'rough-storyboard-grid',
        ext,
        'rough-storyboard-grid-bbbbbbbbbbbb.png',
        ['https://cdn.test/media/templates/rough-storyboard-grid-aaaaaaaaaaaa.png?v=123'],
      ),
    ).toEqual(['rough-storyboard-grid-cccccccccccc.png'])
  })
})

describe('templateAssetUrl — 구판 자동 청소', () => {
  it('새 버전을 올릴 때 같은 파일의 오래된 버전을 지운다', async () => {
    mocks.list.mockResolvedValue({
      data: [{ name: 'rough-storyboard-grid-000000000000.png' }],
      error: null,
    })
    const url = await templateAssetUrl('rough-storyboard-grid.png')
    expect(url).toBeTruthy()
    expect(mocks.remove).toHaveBeenCalledWith(['templates/rough-storyboard-grid-000000000000.png'])
  })

  it('진행 중인 작업이 쓰는 오래된 파일은 지우지 않는다', async () => {
    mocks.list.mockResolvedValue({
      data: [{ name: 'rough-storyboard-grid-000000000000.png' }],
      error: null,
    })
    mocks.dbEq.mockResolvedValue({
      data: [
        {
          input_snapshot: {
            templateUrl:
              'https://cdn.test/media/templates/rough-storyboard-grid-000000000000.png',
          },
        },
      ],
      error: null,
    })
    const url = await templateAssetUrl('rough-storyboard-grid.png')
    expect(url).toBeTruthy()
    expect(mocks.remove).not.toHaveBeenCalled()
  })

  it('오래된 파일 정리에 실패해도 새 파일 주소는 돌려준다', async () => {
    mocks.list.mockResolvedValue({
      data: [{ name: 'rough-storyboard-grid-000000000000.png' }],
      error: null,
    })
    mocks.dbFrom.mockImplementation(() => {
      throw new Error('db down')
    })
    const url = await templateAssetUrl('rough-storyboard-grid.png')
    expect(url).toMatch(/rough-storyboard-grid-[0-9a-f]{12}\.png$/)
    expect(mocks.remove).not.toHaveBeenCalled()
  })
})
