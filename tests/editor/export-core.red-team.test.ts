// 파일 이름과 내려받을 자료가 어떤 입력에도 안전하게 묶여, 빠진 자료를 알 수 있게 한다
import JSZip from 'jszip'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { PathAllocator, sanitizeSegment } from '@/lib/export/sanitize'
import { escapeMd } from '@/lib/export/md'
import type { ArtifactFile } from '@/lib/export/types'
import { buildZipBlob, extOfContentType } from '@/lib/export/zip'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('파일 이름에 이상한 문자가 들어와도 안전한 이름으로 정리한다', () => {
  it('이름이 비어 있거나 쓸 수 없으면 안전한 기본 이름을 쓴다', () => {
    expect(sanitizeSegment('')).toBe('untitled')
    expect(sanitizeSegment('<>:"/\\|?*\u0000\u001F')).toBe('untitled')
    expect(sanitizeSegment(' ...   . .  ')).toBe('untitled')
  })

  it('한글 이름은 글자 수를 기준으로 알맞은 길이로 줄인다', () => {
    const safe = sanitizeSegment('가'.repeat(120))

    expect(Array.from(safe)).toHaveLength(80)
    expect(new TextEncoder().encode(safe).length).toBeGreaterThan(80)
    expect(safe).toBe('가'.repeat(80))
  })

  it('컴퓨터에서 특별한 이름으로 쓰이는 파일명도 안전하게 바꾼다', () => {
    expect(sanitizeSegment('CON.txt')).toBe('_CON.txt')
    expect(sanitizeSegment('nul')).toBe('_nul')
    expect(sanitizeSegment('NuL ')).toBe('_NuL')
  })

  it('경로처럼 보이는 이름도 한 파일 이름 안에서 안전하게 바꾼다', () => {
    expect(sanitizeSegment('../../etc/passwd')).toBe('etc-passwd')
    expect(sanitizeSegment('a/b\\c')).toBe('a-b-c')
  })

  it('조합된 글자도 올바르게 합친 뒤 이름을 정리한다', () => {
    expect(sanitizeSegment('Cafe\u0301 noir')).toBe('Café-noir')
    expect(sanitizeSegment('\u1100\u1161\u1102\u1161')).toBe('가나')
  })
})

describe('같은 이름의 자료가 겹쳐도 서로 다른 이름으로 보존한다', () => {
  it('같은 이름의 자료가 여러 개면 차례대로 다른 이름을 붙인다', () => {
    const allocator = new PathAllocator()

    expect(allocator.file('', 'base', 'md')).toBe('base.md')
    expect(allocator.file('', 'base', 'md')).toBe('base-2.md')
    expect(allocator.file('', 'base', 'md')).toBe('base-3.md')
  })

  it('대소문자만 다른 이름도 같은 이름으로 보고 겹치지 않게 한다', () => {
    const allocator = new PathAllocator()

    expect(allocator.file('media', 'IMG', 'png')).toBe('media/IMG.png')
    expect(allocator.file('media', 'img', 'png')).toBe('media/img-2.png')
  })

  it('서로 다른 위치에서는 같은 이름을 각각 그대로 쓸 수 있게 한다', () => {
    const allocator = new PathAllocator()

    expect(allocator.child('producer', 'draft')).toBe('producer/draft')
    expect(allocator.child('writer', 'draft')).toBe('writer/draft')
    expect(allocator.child('producer', 'draft')).toBe('producer/draft-2')
  })

  it('같은 위치의 자료 이름은 종류가 달라도 서로 겹치지 않게 한다', () => {
    const allocator = new PathAllocator()

    expect(allocator.child('artist', 'thumb.png')).toBe('artist/thumb.png')
    expect(allocator.file('artist', 'thumb', 'png')).toBe('artist/thumb-2.png')
  })
})

describe('자료를 묶어 내려받을 때 실패한 자료를 알려 주고 나머지는 보존한다', () => {
  it('자료를 받지 못하면 실패 목록에 기록하고 다른 자료는 계속 묶는다', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValueOnce(new Error('network down'))
    vi.stubGlobal('fetch', fetchMock)

    const { blob, result } = await buildZipBlob([
      { path: 'artist/network.png', kind: 'media', url: 'https://cdn.test/network.png' },
    ])
    const zip = await loadZip(blob)

    expect(result).toEqual({ total: 1, downloaded: 0, failed: 1 })
    expect(entryPaths(zip)).toEqual(['_failed.txt'])
    expect(await textEntry(zip, '_failed.txt')).toContain(
      'artist/network.png\thttps://cdn.test/network.png\tnetwork down',
    )
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('자료를 내려받을 수 없으면 해당 자료를 넣지 않고 실패 목록에 기록한다', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      mockResponse('server error', {
        ok: false,
        status: 503,
        contentType: 'text/plain',
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const { blob, result } = await buildZipBlob([
      { path: 'artist/bad.png', kind: 'media', url: 'https://cdn.test/bad.png' },
    ])
    const zip = await loadZip(blob)

    expect(result).toEqual({ total: 1, downloaded: 0, failed: 1 })
    expect(zip.file('artist/bad.png')).toBeNull()
    expect(await textEntry(zip, '_failed.txt')).toContain(
      'artist/bad.png\thttps://cdn.test/bad.png\tHTTP 503',
    )
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('내보낼 자료가 없으면 빈 묶음과 0건 결과를 만든다', async () => {
    const { blob, result } = await buildZipBlob([])
    const zip = await loadZip(blob)

    expect(result).toEqual({ total: 0, downloaded: 0, failed: 0 })
    expect(entryPaths(zip)).toEqual([])
  })

  it('모든 자료를 받지 못해도 실패 목록을 담은 묶음을 내려받는다', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new Error('socket closed'))
      .mockResolvedValueOnce(mockResponse('missing', { ok: false, status: 404, contentType: 'text/plain' }))
    vi.stubGlobal('fetch', fetchMock)

    const { blob, result } = await buildZipBlob([
      { path: 'artist/a.png', kind: 'media', url: 'https://cdn.test/a.png' },
      { path: 'director/b.mp4', kind: 'media', url: 'https://cdn.test/b.mp4' },
    ])
    const zip = await loadZip(blob)

    expect(result.total).toBe(2)
    expect(result.failed).toBe(result.total)
    expect(result.downloaded).toBe(0)
    expect(entryPaths(zip)).toEqual(['_failed.txt'])
    expect(await textEntry(zip, '_failed.txt')).toContain('artist/a.png\thttps://cdn.test/a.png\tsocket closed')
    expect(await textEntry(zip, '_failed.txt')).toContain('director/b.mp4\thttps://cdn.test/b.mp4\tHTTP 404')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('같은 자료를 여러 곳에서 써도 한 번만 받고 모든 위치에 넣는다', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(mockResponse('shared bytes', { contentType: 'image/png' }))
    vi.stubGlobal('fetch', fetchMock)

    const { blob, result } = await buildZipBlob([
      { path: 'artist/original.png', kind: 'media', url: 'https://cdn.test/shared.png' },
      { path: 'artist/duplicate-a.png', kind: 'media', url: 'https://cdn.test/shared.png' },
      { path: 'director/duplicate-b.png', kind: 'media', url: 'https://cdn.test/shared.png' },
    ])
    const zip = await loadZip(blob)
    const original = await bytesEntry(zip, 'artist/original.png')
    const duplicateA = await bytesEntry(zip, 'artist/duplicate-a.png')
    const duplicateB = await bytesEntry(zip, 'director/duplicate-b.png')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(result).toEqual({ total: 3, downloaded: 3, failed: 0 })
    expect(entryPaths(zip)).toEqual([
      'artist/duplicate-a.png',
      'artist/original.png',
      'director/duplicate-b.png',
    ])
    expect(Array.from(original)).toEqual(Array.from(new TextEncoder().encode('shared bytes')))
    expect(Array.from(duplicateA)).toEqual(Array.from(original))
    expect(Array.from(duplicateB)).toEqual(Array.from(original))
  })

  it('글 내용이 없으면 실패로 알리고 빈 글은 그대로 담는다', async () => {
    const { blob, result } = await buildZipBlob([
      { path: 'writer/null.txt', kind: 'text', content: null },
      { path: 'writer/undefined.txt', kind: 'text' },
      { path: 'writer/empty.txt', kind: 'text', content: '' },
    ])
    const zip = await loadZip(blob)

    expect(result).toEqual({ total: 3, downloaded: 1, failed: 2 })
    expect(entryPaths(zip)).toEqual(['_failed.txt', 'writer/empty.txt'])
    expect(await textEntry(zip, 'writer/empty.txt')).toBe('')
    expect(await textEntry(zip, '_failed.txt')).toContain('writer/null.txt\t\tmissing content')
    expect(await textEntry(zip, '_failed.txt')).toContain('writer/undefined.txt\t\tmissing content')
  })
})

describe('글 내용의 줄바꿈과 표시 문자가 문서 형식을 깨뜨리지 않게 한다', () => {
  it('줄바꿈과 제목·인용 표시가 글 형식을 깨뜨리지 않게 바꾼다', () => {
    expect(escapeMd('# Heading\n- injected list\n> injected quote *em*')).toBe(
      '\\# Heading - injected list > injected quote \\*em\\*',
    )
    expect(escapeMd('> quote\r\n# injected heading')).toBe('\\> quote # injected heading')
  })
})

describe('자료 형식과 주소를 보고 안전한 파일 확장자를 정한다', () => {
  it('자료 형식과 주소가 달라도 안전한 파일 확장자를 정한다', () => {
    expect(extOfContentType('image/png', 'https://cdn.test/file.jpg')).toBe('png')
    expect(extOfContentType('image/jpeg', 'https://cdn.test/file.png')).toBe('jpg')
    expect(extOfContentType('video/mp4', 'https://cdn.test/file.bin')).toBe('mp4')
    expect(extOfContentType('application/octet-stream', 'https://cdn.test/path/render.jpeg?sig=1')).toBe('jpg')
    expect(extOfContentType('application/x-weird', 'https://cdn.test/path/render.mp4#frag')).toBe('mp4')
    expect(extOfContentType('application/x-weird', 'https://cdn.test/path/render.unknown')).toBe('bin')
    expect(extOfContentType(null, 'https://cdn.test/path/no-extension')).toBe('bin')
  })
})

function mockResponse(
  body: BlobPart,
  opts: { ok?: boolean; status?: number; contentType: string },
): Response {
  const ok = opts.ok ?? true
  const status = opts.status ?? 200
  const contentType = opts.contentType

  return {
    ok,
    status,
    headers: {
      get: vi.fn((name: string) => (name.toLowerCase() === 'content-type' ? contentType : null)),
    },
    arrayBuffer: vi.fn(async () => new Blob([body], { type: contentType }).arrayBuffer()),
    blob: vi.fn(async () => new Blob([body], { type: contentType })),
  } as unknown as Response
}

async function loadZip(blob: Blob): Promise<JSZip> {
  return JSZip.loadAsync(await blob.arrayBuffer())
}

function entryPaths(zip: JSZip): string[] {
  return Object.keys(zip.files)
    .filter((path) => !zip.files[path]?.dir)
    .sort()
}

async function textEntry(zip: JSZip, path: string): Promise<string> {
  const entry = zip.file(path)
  expect(entry).not.toBeNull()

  return entry!.async('string')
}

async function bytesEntry(zip: JSZip, path: string): Promise<Uint8Array> {
  const entry = zip.file(path)
  expect(entry).not.toBeNull()

  return entry!.async('uint8array')
}
