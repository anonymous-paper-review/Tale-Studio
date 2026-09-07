// 같은 파일을 다시 올릴 때 내용과 형식이 같으면 안전하게 이어가고, 다르면 덮어쓰지 않는다
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
  it('같은 파일을 다시 올릴 때 내용과 파일 정보가 모두 같으면 그대로 이어간다', async () => {
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
  ])('같은 파일을 다시 올릴 때 내용과 파일 정보가 맞으면 그대로 이어간다 (%s)', async (_name, conflict, object) => {
    const bytes = Buffer.from('same media bytes')
    mocks.upload.mockResolvedValue({ error: conflict })
    mocks.info.mockResolvedValue({ data: object, error: null })
    mocks.download.mockResolvedValue({ data: new Blob([bytes]), error: null })

    await expect(uploadImmutableObject(PATH, bytes, TYPE)).resolves.toBeUndefined()
  })

  it('같은 이름이라도 내용이 다르면 기존 파일을 대신 쓰지 않는다', async () => {
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
  ])('파일 정보가 다르거나 가져오기에 실패하면 다시 올리지 않는다 (%s)', async (_name, infoData, downloadResult, message) => {
    const bytes = Buffer.from('expected media bytes')
    mocks.upload.mockResolvedValue({ error: { status: 409 } })
    mocks.info.mockResolvedValue({ data: infoData, error: null })
    mocks.download.mockResolvedValue(downloadResult)

    await expect(uploadImmutableObject(PATH, bytes, TYPE)).rejects.toThrow(message)
  })

  it('충돌이 아닌 업로드 실패는 원래 이유를 그대로 알린다', async () => {
    mocks.upload.mockResolvedValue({ error: new Error('storage unavailable') })

    await expect(uploadImmutableObject(PATH, Buffer.from('bytes'), TYPE)).rejects.toThrow('storage unavailable')
    expect(mocks.info).not.toHaveBeenCalled()
    expect(mocks.download).not.toHaveBeenCalled()
  })
})
