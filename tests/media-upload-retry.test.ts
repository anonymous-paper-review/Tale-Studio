// 보관함 업로드의 5xx 재시도(2026-09-03 실측: 러프 finalize 가 StorageApiError 520 으로 잡을 failed 로 남김).
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({ upload: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { storage: { from: () => ({ upload: mocks.upload }) } } }))

import { mediaUpload } from '@/lib/storage/media'

beforeEach(() => mocks.upload.mockReset())

describe('mediaUpload 재시도', () => {
  it('520 뒤 성공하면 성공을 돌려주고 두 번째부터는 upsert 로 올린다', async () => {
    mocks.upload
      .mockResolvedValueOnce({ data: null, error: { name: 'StorageApiError', message: '<none>', status: 520 } })
      .mockResolvedValueOnce({ data: { path: 'a/b.png' }, error: null })
    const res = await mediaUpload('a/b.png', Buffer.from('x'), { contentType: 'image/png' })
    expect(res.error).toBeNull()
    expect(mocks.upload).toHaveBeenCalledTimes(2)
    expect(mocks.upload.mock.calls[1][2]).toMatchObject({ upsert: true })
  })

  it('4xx(중복·권한)는 재시도하지 않는다', async () => {
    mocks.upload.mockResolvedValueOnce({ data: null, error: { name: 'StorageApiError', message: 'Duplicate', statusCode: '409' } })
    const res = await mediaUpload('a/b.png', Buffer.from('x'), { contentType: 'image/png' })
    expect(res.error).toBeTruthy()
    expect(mocks.upload).toHaveBeenCalledTimes(1)
  })

  it('계속 5xx 면 최대 3회 뒤 오류를 돌려준다', async () => {
    mocks.upload.mockResolvedValue({ data: null, error: { name: 'StorageApiError', message: '<none>', status: 503 } })
    const res = await mediaUpload('a/b.png', Buffer.from('x'), { contentType: 'image/png' })
    expect(res.error).toBeTruthy()
    expect(mocks.upload).toHaveBeenCalledTimes(3)
  })
})
