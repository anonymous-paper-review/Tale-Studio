import { beforeEach, describe, expect, it, vi } from 'vitest'
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

  it('현재 해시 객체가 이미 있으면 업로드를 건너뛴다', async () => {
    mocks.list.mockResolvedValue({
      data: [{ name: hashedName('character-template.png') }],
      error: null,
    })
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

// #template-latest-only — 승격 시 같은 base 의 구판 해시 객체를 자동 삭제 (최신 버전만 관리)
describe('_staleSiblings — 스테일 형제 판별 (순수)', () => {
  const ext = '.png'

  it('구판 해시만 고르고 현재본은 남긴다', () => {
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

  it('base 가 다른 자산의 접두여도 잘못 잡지 않는다 (grid ⊄ grid-cinema)', () => {
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

  it('해시 패턴이 아닌 이름은 무시한다', () => {
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

  it('queued 잡이 참조하는 객체는 보호한다 (?v= 쿼리 포함)', () => {
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
  it('승격 시 같은 base 의 구판 객체를 remove 한다', async () => {
    mocks.list.mockResolvedValue({
      data: [{ name: 'rough-storyboard-grid-000000000000.png' }],
      error: null,
    })
    const url = await templateAssetUrl('rough-storyboard-grid.png')
    expect(url).toBeTruthy()
    expect(mocks.remove).toHaveBeenCalledWith(['templates/rough-storyboard-grid-000000000000.png'])
  })

  it('queued 잡이 참조하는 구판은 지우지 않는다', async () => {
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

  it('청소 실패는 URL 반환을 막지 않는다 (다음 콜드스타트 재시도)', async () => {
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
