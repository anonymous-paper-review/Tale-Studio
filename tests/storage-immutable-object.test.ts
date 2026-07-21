import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  upload: vi.fn(),
  info: vi.fn(),
  download: vi.fn(),
}))

vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: { storage: { from: mocks.from } },
}))

import { uploadImmutableObject } from '@/lib/storage/immutable-object'

const PATH = 'workspace-1/project-1/videos/clip-1/job-1.mp4'
const TYPE = 'video/mp4'

beforeEach(() => {
  vi.resetAllMocks()
  mocks.from.mockReturnValue({ upload: mocks.upload, info: mocks.info, download: mocks.download })
})

describe('uploadImmutableObject', () => {
  it('accepts an exact immutable retry only after metadata and digest match', async () => {
    const bytes = Buffer.from('same media bytes')
    mocks.upload.mockResolvedValue({ error: { status: 409 } })
    mocks.info.mockResolvedValue({ data: { metadata: { size: bytes.length, mimetype: TYPE } }, error: null })
    mocks.download.mockResolvedValue({ data: new Blob([bytes]), error: null })

    await expect(uploadImmutableObject(PATH, bytes, TYPE)).resolves.toBeUndefined()
    expect(mocks.download).toHaveBeenCalledWith(PATH)
  })
  it.each([
    ['statusCode conflict with nested contentType metadata', { statusCode: '409' }, { metadata: { size: '16', contentType: TYPE } }],
    ['code conflict with top-level MIME metadata', { code: 409 }, { size: 16, mimetype: TYPE }],
  ])('accepts exact retries for %s', async (_name, conflict, object) => {
    const bytes = Buffer.from('same media bytes')
    mocks.upload.mockResolvedValue({ error: conflict })
    mocks.info.mockResolvedValue({ data: object, error: null })
    mocks.download.mockResolvedValue({ data: new Blob([bytes]), error: null })

    await expect(uploadImmutableObject(PATH, bytes, TYPE)).resolves.toBeUndefined()
  })

  it('rejects a 409 containing different bytes without accepting it as a retry', async () => {
    const expected = Buffer.from('expected media bytes')
    const conflicting = Buffer.from('poisoned media bytes')
    mocks.upload.mockResolvedValue({ error: { status: 409 } })
    mocks.info.mockResolvedValue({ data: { metadata: { size: expected.length, mimetype: TYPE } }, error: null })
    mocks.download.mockResolvedValue({ data: new Blob([conflicting]), error: null })

    await expect(uploadImmutableObject(PATH, expected, TYPE)).rejects.toThrow('different object content')
  })
  it.each([
    ['size mismatch', { metadata: { size: 1, mimetype: TYPE } }, { data: new Blob([Buffer.from('x')]), error: null }, 'different object metadata'],
    ['MIME mismatch', { metadata: { size: 20, mimetype: 'video/webm' } }, { data: new Blob([Buffer.from('expected media bytes')]), error: null }, 'different object metadata'],
    ['download failure', { metadata: { size: 20, mimetype: TYPE } }, { data: null, error: new Error('download failed') }, 'download failed'],
  ])('rejects immutable retries with %s', async (_name, infoData, downloadResult, message) => {
    const bytes = Buffer.from('expected media bytes')
    mocks.upload.mockResolvedValue({ error: { status: 409 } })
    mocks.info.mockResolvedValue({ data: infoData, error: null })
    mocks.download.mockResolvedValue(downloadResult)

    await expect(uploadImmutableObject(PATH, bytes, TYPE)).rejects.toThrow(message)
  })

  it('propagates non-conflict upload failures without inspection', async () => {
    mocks.upload.mockResolvedValue({ error: new Error('storage unavailable') })

    await expect(uploadImmutableObject(PATH, Buffer.from('bytes'), TYPE)).rejects.toThrow('storage unavailable')
    expect(mocks.info).not.toHaveBeenCalled()
    expect(mocks.download).not.toHaveBeenCalled()
  })
})
