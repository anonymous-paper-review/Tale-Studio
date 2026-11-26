// 이어 붙일 장면 그림은 잡은 시각마다 따로 보관해, 같은 앞 영상에서 다시 잡아도 덮어쓰기 거절로 실패하지 않는다 (오너 2026-11-27 N4a ① · dev 리드 고장 2)
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  userOwnsProject: vi.fn(),
  from: vi.fn(),
  storageFrom: vi.fn(),
}))

vi.mock('@/lib/supabase/auth', () => ({ getUser: mocks.getUser }))
vi.mock('@/lib/generation-jobs', () => ({ userOwnsProject: mocks.userOwnsProject }))
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: mocks.from, storage: { from: mocks.storageFrom } } }))

import { POST as uploadImage } from '@/app/api/assets/upload-image/route'
import { mediaPublicUrl } from '@/lib/storage/media-url'

const JPEG_BYTES = Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAH/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAEFAqf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/Aaf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/Aaf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAY/Aqf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/IX//2gAMAwEAAgADAAAAEP/EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQMBAT8QH//EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQIBAT8QH//EABQQAQAAAAAAAAAAAAAAAAAAABD/2gAIAQEAAT8QH//Z', 'base64')

function single(data: unknown) {
  const query = { select: vi.fn(), eq: vi.fn(), is: vi.fn(), maybeSingle: vi.fn() }
  query.select.mockReturnValue(query); query.eq.mockReturnValue(query); query.is.mockReturnValue(query)
  query.maybeSingle.mockResolvedValue({ data, error: null })
  return query
}

function chainFrameUpload(atMs?: string) {
  const form = new FormData()
  form.set('projectId', 'project-1')
  form.set('type', 'video')
  form.set('entityId', 'clip-1')
  form.set('field', 'chain_frame')
  form.set('generationJobId', 'job-1')
  if (atMs !== undefined) form.set('atMs', atMs)
  form.set('file', new Blob([JPEG_BYTES], { type: 'image/jpeg' }), 'chain-frame.jpg')
  return new Request('http://test/api/assets/upload-image', { method: 'POST', body: form })
}

function seedCompletedTake() {
  mocks.from
    .mockReturnValueOnce(single({ workspace_id: 'workspace-1' }))
    .mockReturnValueOnce(single({ id: 'job-1', video_clip_id: 'clip-1', status: 'completed' }))
    .mockReturnValueOnce(single({ id: 'clip-1', storage_path: 'workspace-1/project-1/videos/clip-1/job-1.mp4' }))
}

beforeEach(() => {
  vi.resetAllMocks()
  mocks.getUser.mockResolvedValue({ id: 'user-1' })
  mocks.userOwnsProject.mockResolvedValue(true)
})

describe('혼자 정한 것', () => {
  // 왜: 고친 규칙으로 같은 앞 영상의 다른 시각을 다시 잡으면 그림이 달라진다 — 예전 이름(앞 작업마다 하나)에 올리면
  //   덮어쓰기 거절(내용이 다름)로 "마지막 화면을 올리지 못했다"가 났다.
  it('같은 앞 영상에서 다시 잡은 장면은 잡은 시각이 붙은 새 파일로 남긴다', async () => {
    seedCompletedTake()
    const upload = vi.fn().mockResolvedValue({ error: null })
    mocks.storageFrom.mockReturnValue({ upload })

    const response = await uploadImage(chainFrameUpload('2850'))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      publicUrl: mediaPublicUrl('workspace-1/project-1/videos/clip-1/job-1_chain-frame-2850.jpg'),
    })
    expect(upload.mock.calls[0][0]).toBe('workspace-1/project-1/videos/clip-1/job-1_chain-frame-2850.jpg')
  })

  // 왜(검토 rev-video 2): 다른 브라우저 · 기기에서 같은 앞 Take 의 같은 시각을 다시 잡으면 이름은 같고 그림 바이트는 조금 다르다(디코더 · 압축 차이) —
  //   덮어쓰지 않는 보관함이 내용이 다르다며 거절해 500 이 났다. 같은 작업 · 같은 시각이면 같은 장면이라 이미 있는 그림을 쓴다.
  it('같은 작업 · 같은 시각의 이음 장면이 이미 있으면 다른 기기에서 다시 잡아도 그 그림 주소를 돌려준다', async () => {
    seedCompletedTake()
    const upload = vi.fn().mockResolvedValue({ error: { statusCode: '409', message: 'The resource already exists' } })
    const info = vi.fn().mockResolvedValue({ data: { size: JPEG_BYTES.length + 17, metadata: { size: JPEG_BYTES.length + 17, mimetype: 'image/jpeg' } }, error: null })
    mocks.storageFrom.mockReturnValue({ upload, info })

    const response = await uploadImage(chainFrameUpload('2850'))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      publicUrl: mediaPublicUrl('workspace-1/project-1/videos/clip-1/job-1_chain-frame-2850.jpg'),
    })
  })

  // 왜: 잡은 시각은 파일 이름이 된다 — 숫자가 아닌 값(경로 글자 등)을 이름에 넣지 않는다.
  it('잡은 시각이 밀리초 숫자가 아니면 보관하지 않는다', async () => {
    mocks.from.mockReturnValueOnce(single({ workspace_id: 'workspace-1' }))
    const response = await uploadImage(chainFrameUpload('../x'))

    expect(response.status).toBe(400)
    expect(mocks.storageFrom).not.toHaveBeenCalled()
  })
})
