import JSZip from 'jszip'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { PathAllocator, sanitizeSegment } from '@/lib/export/sanitize'
import { escapeMd } from '@/lib/export/md'
import type { ArtifactFile } from '@/lib/export/types'
import { buildZipBlob, extOfContentType } from '@/lib/export/zip'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('sanitizeSegment adversarial filesystem inputs', () => {
  it('falls back for empty, all-reserved, and dot/space-only segments', () => {
    expect(sanitizeSegment('')).toBe('untitled')
    expect(sanitizeSegment('<>:"/\\|?*\u0000\u001F')).toBe('untitled')
    expect(sanitizeSegment(' ...   . .  ')).toBe('untitled')
  })

  it('caps Korean names at 80 code points rather than 80 bytes', () => {
    const safe = sanitizeSegment('가'.repeat(120))

    expect(Array.from(safe)).toHaveLength(80)
    expect(new TextEncoder().encode(safe).length).toBeGreaterThan(80)
    expect(safe).toBe('가'.repeat(80))
  })

  it('prefixes Windows device names even when cased or extension-bearing', () => {
    expect(sanitizeSegment('CON.txt')).toBe('_CON.txt')
    expect(sanitizeSegment('nul')).toBe('_nul')
    expect(sanitizeSegment('NuL ')).toBe('_NuL')
  })

  it('neutralizes traversal and embedded path separators inside one segment', () => {
    expect(sanitizeSegment('../../etc/passwd')).toBe('etc-passwd')
    expect(sanitizeSegment('a/b\\c')).toBe('a-b-c')
  })

  it('normalizes combining-mark input to NFC before trimming and capping', () => {
    expect(sanitizeSegment('Cafe\u0301 noir')).toBe('Café-noir')
    expect(sanitizeSegment('\u1100\u1161\u1102\u1161')).toBe('가나')
  })
})

describe('PathAllocator adversarial collisions', () => {
  it('dedupes many identical files as base, base-2, and base-3', () => {
    const allocator = new PathAllocator()

    expect(allocator.file('', 'base', 'md')).toBe('base.md')
    expect(allocator.file('', 'base', 'md')).toBe('base-2.md')
    expect(allocator.file('', 'base', 'md')).toBe('base-3.md')
  })

  it('treats IMG and img as a case-insensitive collision', () => {
    const allocator = new PathAllocator()

    expect(allocator.file('media', 'IMG', 'png')).toBe('media/IMG.png')
    expect(allocator.file('media', 'img', 'png')).toBe('media/img-2.png')
  })

  it('keeps the same sanitized name independent across different directories', () => {
    const allocator = new PathAllocator()

    expect(allocator.child('producer', 'draft')).toBe('producer/draft')
    expect(allocator.child('writer', 'draft')).toBe('writer/draft')
    expect(allocator.child('producer', 'draft')).toBe('producer/draft-2')
  })

  it('dedupes file() and child() calls through the same directory namespace', () => {
    const allocator = new PathAllocator()

    expect(allocator.child('artist', 'thumb.png')).toBe('artist/thumb.png')
    expect(allocator.file('artist', 'thumb', 'png')).toBe('artist/thumb-2.png')
  })
})

describe('buildZipBlob adversarial fetch and archive behavior', () => {
  it('records a thrown media fetch as a failed entry without throwing', async () => {
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

  it('records a non-ok media response as a failed entry without creating the media file', async () => {
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

  it('creates an empty archive and zeroed result for an empty files array', async () => {
    const { blob, result } = await buildZipBlob([])
    const zip = await loadZip(blob)

    expect(result).toEqual({ total: 0, downloaded: 0, failed: 0 })
    expect(entryPaths(zip)).toEqual([])
  })

  it('keeps all-media-fail archives downloadable with _failed.txt and failed equal to total', async () => {
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

  it('fetches the same media URL once while writing every sharing path', async () => {
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

  it('records nullish text content as failures while preserving explicit empty strings', async () => {
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

describe('escapeMd adversarial markdown injection', () => {
  it('collapses newlines and escapes leading heading or blockquote markers', () => {
    expect(escapeMd('# Heading\n- injected list\n> injected quote *em*')).toBe(
      '\\# Heading - injected list > injected quote \\*em\\*',
    )
    expect(escapeMd('> quote\r\n# injected heading')).toBe('\\> quote # injected heading')
  })
})

describe('extOfContentType adversarial matrix', () => {
  it('maps known content types, URL fallbacks, and unknowns to safe extensions', () => {
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
