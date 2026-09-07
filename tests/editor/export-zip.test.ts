import JSZip from 'jszip'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { ArtifactFile } from '@/lib/export/types'
import { buildZipBlob, extOfContentType } from '@/lib/export/zip'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('extOfContentType', () => {
  it('prefers Content-Type and falls back to safe URL extensions', () => {
    expect(extOfContentType('image/png; charset=binary', 'https://cdn.test/file.jpg')).toBe('png')
    expect(extOfContentType('image/jpeg', 'https://cdn.test/file.png')).toBe('jpg')
    expect(extOfContentType('video/webm', 'https://cdn.test/file.bin')).toBe('mp4')
    expect(extOfContentType(null, 'https://cdn.test/path/render.jpeg?token=1')).toBe('jpg')
    expect(extOfContentType(null, 'https://cdn.test/path/render.mp4#frag')).toBe('mp4')
    expect(extOfContentType(null, 'https://cdn.test/path/render')).toBe('bin')
  })
})

describe('buildZipBlob export core', () => {
  it('bundles text artifacts and fetched media artifacts into the expected zip entries', async () => {
    const files: ArtifactFile[] = [
      { path: 'producer/story.md', kind: 'text', content: '# Story' },
      { path: 'writer/script.txt', kind: 'text', content: 'line 1\nline 2' },
      { path: 'artist/김민준.png', kind: 'media', url: 'https://cdn.test/kim.png' },
      { path: 'director/shot-01.mp4', kind: 'media', url: 'https://cdn.test/shot-01.mp4' },
    ]
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(mockResponse('png bytes', { contentType: 'image/png' }))
      .mockResolvedValueOnce(mockResponse('mp4 bytes', { contentType: 'video/mp4' }))
    vi.stubGlobal('fetch', fetchMock)

    const { blob, result } = await buildZipBlob(files)
    const zip = await loadZip(blob)

    expect(entryPaths(zip)).toEqual([
      'artist/김민준.png',
      'director/shot-01.mp4',
      'producer/story.md',
      'writer/script.txt',
    ])
    expect(await textEntry(zip, 'producer/story.md')).toBe('# Story')
    expect(await textEntry(zip, 'writer/script.txt')).toBe('line 1\nline 2')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(result).toEqual({ total: 4, downloaded: 4, failed: 0 })
  })

  it('records failed media in _failed.txt without throwing or creating the missing entry', async () => {
    const files: ArtifactFile[] = [
      { path: 'producer/story.md', kind: 'text', content: 'safe text' },
      { path: 'artist/missing.png', kind: 'media', url: 'https://cdn.test/missing.png' },
    ]
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      mockResponse('forbidden', {
        ok: false,
        status: 403,
        contentType: 'text/plain',
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const { blob, result } = await buildZipBlob(files)
    const zip = await loadZip(blob)

    expect(entryPaths(zip)).toEqual(['_failed.txt', 'producer/story.md'])
    expect(zip.file('artist/missing.png')).toBeNull()
    expect(await textEntry(zip, '_failed.txt')).toContain(
      'artist/missing.png\thttps://cdn.test/missing.png\tHTTP 403',
    )
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(result).toEqual({ total: 2, downloaded: 1, failed: 1 })
  })

  it('writes every duplicate media URL path with one fetch and identical bytes', async () => {
    const files: ArtifactFile[] = [
      { path: 'artist/original.png', kind: 'media', url: 'https://cdn.test/shared.png' },
      { path: 'director/duplicate.png', kind: 'media', url: 'https://cdn.test/shared.png' },
    ]
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(mockResponse('shared bytes', { contentType: 'image/png' }))
    vi.stubGlobal('fetch', fetchMock)

    const { blob, result } = await buildZipBlob(files)
    const zip = await loadZip(blob)
    const original = await bytesEntry(zip, 'artist/original.png')
    const duplicate = await bytesEntry(zip, 'director/duplicate.png')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(entryPaths(zip)).toEqual(['artist/original.png', 'director/duplicate.png'])
    expect(Array.from(original)).toEqual(Array.from(new TextEncoder().encode('shared bytes')))
    expect(Array.from(duplicate)).toEqual(Array.from(original))
    expect(result).toEqual({ total: 2, downloaded: 2, failed: 0 })
  })

  it('records nullish text content in _failed.txt while preserving explicit empty text entries', async () => {
    const files: ArtifactFile[] = [
      { path: 'writer/null.md', kind: 'text', content: null },
      { path: 'writer/undefined.txt', kind: 'text' },
      { path: 'writer/empty.txt', kind: 'text', content: '' },
    ]

    const { blob, result } = await buildZipBlob(files)
    const zip = await loadZip(blob)

    expect(entryPaths(zip)).toEqual(['_failed.txt', 'writer/empty.txt'])
    expect(await textEntry(zip, 'writer/empty.txt')).toBe('')
    expect(await textEntry(zip, '_failed.txt')).toContain('writer/null.md\t\tmissing content')
    expect(await textEntry(zip, '_failed.txt')).toContain('writer/undefined.txt\t\tmissing content')
    expect(result).toEqual({ total: 3, downloaded: 1, failed: 2 })
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
