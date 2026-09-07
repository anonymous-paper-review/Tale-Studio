// 파일을 올릴 때 일시적인 서버 오류는 다시 시도하고, 계속 실패하면 오류를 알린다 (2026-09-03)
// 보관함 업로드의 5xx 재시도(2026-09-03 실측: 러프 finalize 가 StorageApiError 520 으로 잡을 failed 로 남김).
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({ upload: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { storage: { from: () => ({ upload: mocks.upload }) } } }))

import { mediaUpload } from '@/lib/storage/media'

beforeEach(() => mocks.upload.mockReset())

describe('파일 올리기 재시도 규칙', () => {
  it('일시적인 서버 오류 뒤 성공하면 파일을 올리고 이후에는 기존 파일도 덮어쓴다', async () => {
    mocks.upload
      .mockResolvedValueOnce({ data: null, error: { name: 'StorageApiError', message: '<none>', status: 520 } })
      .mockResolvedValueOnce({ data: { path: 'a/b.png' }, error: null })
    const res = await mediaUpload('a/b.png', Buffer.from('x'), { contentType: 'image/png' })
    expect(res.error).toBeNull()
    expect(mocks.upload).toHaveBeenCalledTimes(2)
    expect(mocks.upload.mock.calls[1][2]).toMatchObject({ upsert: true })
  })

  it('파일이 이미 있거나 권한이 없으면 다시 시도하지 않는다', async () => {
    mocks.upload.mockResolvedValueOnce({ data: null, error: { name: 'StorageApiError', message: 'Duplicate', statusCode: '409' } })
    const res = await mediaUpload('a/b.png', Buffer.from('x'), { contentType: 'image/png' })
    expect(res.error).toBeTruthy()
    expect(mocks.upload).toHaveBeenCalledTimes(1)
  })

  it('서버 오류가 계속되면 세 번 시도한 뒤 오류를 알린다', async () => {
    mocks.upload.mockResolvedValue({ data: null, error: { name: 'StorageApiError', message: '<none>', status: 503 } })
    const res = await mediaUpload('a/b.png', Buffer.from('x'), { contentType: 'image/png' })
    expect(res.error).toBeTruthy()
    expect(mocks.upload).toHaveBeenCalledTimes(3)
  })
})
