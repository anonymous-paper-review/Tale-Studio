// 영상 카드와 그림을 올릴 때 권한을 확인하고, 잘못된 정보는 저장하지 않으며 안전한 주소로 보관한다
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  userOwnsProject: vi.fn(),
  listLiveDirectorVideoTakes: vi.fn(),
  createStandaloneDirectorVideoTake: vi.fn(),
  updateDirectorVideoTakeMetadata: vi.fn(),
  setDirectorVideoFinal: vi.fn(),
  softDeleteDirectorVideoTake: vi.fn(),
  from: vi.fn(),
  storageFrom: vi.fn(),
}))

vi.mock('@/lib/supabase/auth', () => ({ getUser: mocks.getUser }))
vi.mock('@/lib/generation-jobs', () => ({ userOwnsProject: mocks.userOwnsProject }))
vi.mock('@/lib/director-video-takes', () => ({
  listLiveDirectorVideoTakes: mocks.listLiveDirectorVideoTakes,
  createStandaloneDirectorVideoTake: mocks.createStandaloneDirectorVideoTake,
  updateDirectorVideoTakeMetadata: mocks.updateDirectorVideoTakeMetadata,
  setDirectorVideoFinal: mocks.setDirectorVideoFinal,
  softDeleteDirectorVideoTake: mocks.softDeleteDirectorVideoTake,
}))
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: mocks.from, storage: { from: mocks.storageFrom } } }))

import {
  GET,
  POST as createStandaloneVideo,
} from '@/app/api/director/video-takes/route'
import { PATCH, DELETE } from '@/app/api/director/video-takes/[clipId]/route'
import { POST as uploadImage } from '@/app/api/assets/upload-image/route'
import { storageKeySegment } from '@/lib/storage/key-segment'
import { mediaPublicUrl } from '@/lib/storage/media-url'
import { MEDIA_CACHE_CONTROL } from '@/lib/storage/media'

// 결과 주소는 보관함 경로에서 계산된다 — 고정 문자열로 두면 보관 위치를 옮겨도 통과한다.
const THUMB_PUBLIC_URL = mediaPublicUrl('workspace-1/project-1/videos/clip-1/job-1.jpg')
const CHAIN_FRAME_PUBLIC_URL = mediaPublicUrl(
  'workspace-1/project-1/videos/clip-1/job-1_chain-frame.jpg',
)

const USER = { id: 'user-1' }
const PROJECT = 'project-1'
const clip = { id: 'clip-1', project_id: PROJECT, shot_id: 'shot-1', take_number: 1 }
const context = { params: Promise.resolve({ clipId: 'clip-1' }) }
const JPEG_BYTES = Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAH/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAEFAqf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/Aaf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/Aaf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAY/Aqf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/IX//2gAMAwEAAgADAAAAEP/EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQMBAT8QH//EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQIBAT8QH//EABQQAQAAAAAAAAAAAAAAAAAAABD/2gAIAQEAAT8QH//Z', 'base64')
const PNG_BYTES = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==', 'base64')


function request(url: string, body?: unknown, method = 'PATCH') {
  return new Request(url, body === undefined ? { method } : { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
}
function imageUploadRequest(generationJobId: string) {
  const form = new FormData()
  form.set('projectId', PROJECT)
  form.set('type', 'video')
  form.set('entityId', 'clip-1')
  form.set('field', 'thumbnail')
  form.set('generationJobId', generationJobId)
  form.set('file', new Blob([JPEG_BYTES], { type: 'image/jpeg' }), 'thumbnail.jpg')
  return new Request('http://test/api/assets/upload-image', { method: 'POST', body: form })
}
function chainFrameUploadRequest(generationJobId: string) {
  const form = new FormData()
  form.set('projectId', PROJECT)
  form.set('type', 'video')
  form.set('entityId', 'clip-1')
  form.set('field', 'chain_frame')
  form.set('generationJobId', generationJobId)
  form.set('file', new Blob([JPEG_BYTES], { type: 'image/jpeg' }), 'chain-frame.jpg')
  return new Request('http://test/api/assets/upload-image', { method: 'POST', body: form })
}
function imageRequest(type: string, entityId: string, field: string, file: Blob) {
  const form = new FormData()
  form.set('projectId', PROJECT)
  form.set('type', type)
  form.set('entityId', entityId)
  form.set('field', field)
  form.set('file', file, 'image.png')
  return new Request('http://test/api/assets/upload-image', { method: 'POST', body: form })
}

function projectQuery() {
  return thumbnailQuery({ workspace_id: 'workspace-1' })
}

function requireResponse(response: Response | undefined): Response {
  if (!response) throw new Error('Route returned no response')
  return response
}
function thumbnailQuery(data: unknown) {
  const query = { select: vi.fn(), eq: vi.fn(), is: vi.fn(), maybeSingle: vi.fn() }
  query.select.mockReturnValue(query); query.eq.mockReturnValue(query); query.is.mockReturnValue(query)
  query.maybeSingle.mockResolvedValue({ data, error: null })
  return query
}

function thumbnailUpdateQuery(data: unknown) {
  const query = { update: vi.fn(), eq: vi.fn(), is: vi.fn(), select: vi.fn(), maybeSingle: vi.fn() }
  query.update.mockReturnValue(query); query.eq.mockReturnValue(query); query.is.mockReturnValue(query); query.select.mockReturnValue(query)
  query.maybeSingle.mockResolvedValue({ data, error: null })
  return query
}


beforeEach(() => {
  vi.resetAllMocks()
  vi.unstubAllGlobals()
  mocks.getUser.mockResolvedValue(USER)
  mocks.userOwnsProject.mockResolvedValue(true)
  mocks.listLiveDirectorVideoTakes.mockResolvedValue([clip])
})

describe('영상 카드의 요청 처리', () => {
  it('자연어로 적은 이름도 서로 다른 안전한 보관 주소로 바꾼다', () => {
    const transformed = storageKeySegment('서울 광장')
    expect(transformed).toMatch(/^v1-[a-f0-9]{64}$/)
    expect(storageKeySegment(transformed)).not.toBe(transformed)
    expect(storageKeySegment('safe-id')).not.toBe('safe-id')
    expect(storageKeySegment('safe-id')).not.toBe(storageKeySegment('safe_id'))
  })
  it('로그인하지 않은 요청은 거절한다', async () => {
    mocks.getUser.mockResolvedValue(null)
    expect(requireResponse(await GET(request(`http://test/api/director/video-takes?projectId=${PROJECT}`, undefined, 'GET'))).status).toBe(401)
    expect(mocks.userOwnsProject).not.toHaveBeenCalled()
  })

  it('새 영상을 만들면 장면 없이도 하나의 영상 카드로 저장한다', async () => {
    const take = {
      ...clip,
      id: 'standalone-clip',
      shot_id: 'standalone:123e4567-e89b-42d3-a456-426614174000',
      take_label: 'Video',
      override: {
        prompt: '',
        camera: { horizontal: 0, vertical: 0, pan: 0, tilt: 0, roll: 0, zoom: 0 },
        lighting: { position: 'front', brightness: 50, colorTemp: 5600 },
        cameraPreset: {
          brand: 'arri',
          focalLength: 35,
          aperture: 2.8,
          whiteBalance: 5600,
        },
        provider: 'kling-2.1',
        durationSeconds: 5,
      },
      canvas_position: { x: 120, y: 240 },
      status: 'pending',
      last_attempt_status: null,
      is_final: false,
    }
    mocks.createStandaloneDirectorVideoTake.mockResolvedValue(take)

    const response = await createStandaloneVideo(
      request(
        'http://test/api/director/video-takes',
        { projectId: PROJECT, canvasPosition: { x: 120, y: 240 } },
        'POST',
      ),
    )

    expect(response.status).toBe(200)
    expect(mocks.createStandaloneDirectorVideoTake).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: PROJECT,
        ownerKey: expect.stringMatching(
          /^standalone:[0-9a-f-]{36}$/i,
        ),
        canvasPosition: { x: 120, y: 240 },
      }),
    )
    await expect(response.json()).resolves.toEqual({ take })
  })

  it('영상 카드 위치가 올바르지 않으면 저장하지 않는다', async () => {
    const response = await createStandaloneVideo(
      request(
        'http://test/api/director/video-takes',
        { projectId: PROJECT, canvasPosition: { x: 1 } },
        'POST',
      ),
    )
    expect(response.status).toBe(400)
    expect(mocks.createStandaloneDirectorVideoTake).not.toHaveBeenCalled()
  })

  it('내 것이 아닌 프로젝트에는 변경을 허용하지 않는다', async () => {
    mocks.userOwnsProject.mockResolvedValue(false)
    expect(requireResponse(await PATCH(request('http://test/api/director/video-takes/clip-1', { projectId: PROJECT, is_final: true }), context)).status).toBe(403)
    expect(mocks.setDirectorVideoFinal).not.toHaveBeenCalled()
  })

  it('화면에서 바꿀 수 없는 항목을 보내면 거절한다', async () => {
    const response = await PATCH(request('http://test/api/director/video-takes/clip-1', { projectId: PROJECT, status: 'completed' }), context)
    expect(requireResponse(response).status).toBe(400)
    expect(mocks.updateDirectorVideoTakeMetadata).not.toHaveBeenCalled()
  })

  it('대표 영상 여부를 바꾸면 최신 영상 카드 정보를 돌려준다', async () => {
    const refreshed = { ...clip, is_final: true }
    mocks.listLiveDirectorVideoTakes.mockResolvedValueOnce([clip]).mockResolvedValueOnce([refreshed])
    const response = await PATCH(request('http://test/api/director/video-takes/clip-1', { projectId: PROJECT, is_final: true }), context)
    const result = requireResponse(response)
    expect(result.status).toBe(200)
    expect(mocks.setDirectorVideoFinal).toHaveBeenCalledWith(PROJECT, 'clip-1', true)
    await expect(result.json()).resolves.toEqual({ take: refreshed })
  })
  it.each([
    [{ take_label: null }, { take_label: null }],
    [{ override: null }, { override: null }],
    [{ canvas_position: null }, { canvas_position: null }],
    [{ take_label: 'Retake', override: { framing: 'wide' }, canvas_position: { x: 1, y: 2 } }, { take_label: 'Retake', override: { framing: 'wide' }, canvas_position: { x: 1, y: 2 } }],
  ])('허용된 영상 카드 정보는 값이 없어도 저장한다', async (metadata, expected) => {
    mocks.listLiveDirectorVideoTakes.mockResolvedValue([clip])
    const response = await PATCH(request('http://test/api/director/video-takes/clip-1', { projectId: PROJECT, ...metadata }), context)
    expect(response.status).toBe(200)
    expect(mocks.updateDirectorVideoTakeMetadata).toHaveBeenCalledWith(PROJECT, 'clip-1', expected)
    expect(mocks.setDirectorVideoFinal).not.toHaveBeenCalled()
  })

  it('대표 영상 지정과 다른 정보 변경을 함께 보내면 아무것도 저장하지 않는다', async () => {
    const response = await PATCH(request('http://test/api/director/video-takes/clip-1', {
      projectId: PROJECT, is_final: true, take_label: 'partial',
    }), context)
    expect(response.status).toBe(400)
    expect(mocks.updateDirectorVideoTakeMetadata).not.toHaveBeenCalled()
    expect(mocks.setDirectorVideoFinal).not.toHaveBeenCalled()
  })

  it.each([
    ['state conflict', { statusCode: 409 }, 409, 'Video take update conflicts with current state'],
    ['unexpected database failure', new Error('database offline'), 500, 'Unable to update video take'],
  ])('%s이면 오류 상황에 맞는 안내를 돌려준다', async (_name, error, status, message) => {
    mocks.setDirectorVideoFinal.mockRejectedValue(error)
    const response = await PATCH(request('http://test/api/director/video-takes/clip-1', { projectId: PROJECT, is_final: true }), context)
    expect(response.status).toBe(status)
    await expect(response.json()).resolves.toEqual({ error: message })
  })

  it.each([
    ['state conflict', { code: '409' }, 409, 'Video take deletion conflicts with current state'],
    ['unexpected service failure', new Error('service unavailable'), 500, 'Unable to delete video take'],
  ])('삭제 중 %s이면 상황에 맞는 안내를 돌려준다', async (_name, error, status, message) => {
    mocks.softDeleteDirectorVideoTake.mockRejectedValue(error)
    const response = await DELETE(request('http://test/api/director/video-takes/clip-1', { projectId: PROJECT }, 'DELETE'), context)
    expect(response.status).toBe(status)
    await expect(response.json()).resolves.toEqual({ error: message })
  })

  it('사용 중인 영상 카드를 삭제하면 목록에서 사라지게 한다', async () => {
    const response = await DELETE(request('http://test/api/director/video-takes/clip-1', { projectId: PROJECT }, 'DELETE'), context)
    expect(requireResponse(response).status).toBe(200)
    expect(mocks.softDeleteDirectorVideoTake).toHaveBeenCalledWith(PROJECT, 'clip-1')
  })
  it.each([
    { projectId: PROJECT, ignored: true },
    [],
    null,
  ])('삭제 요청에 프로젝트 정보 외 내용이 있거나 정보가 없으면 거절한다', async body => {
    const response = await DELETE(request('http://test/api/director/video-takes/clip-1', body, 'DELETE'), context)
    expect(response.status).toBe(400)
    expect(mocks.softDeleteDirectorVideoTake).not.toHaveBeenCalled()
  })

  it.each([
    'live clip does not belong to project',
    'live clip with URL does not belong to project',
    'clip already has a queued attempt',
  ])('약속된 충돌 상황이면 변경을 막는다', async message => {
    mocks.setDirectorVideoFinal.mockRejectedValue(new Error(message))
    expect((await PATCH(request('http://test/api/director/video-takes/clip-1', { projectId: PROJECT, is_final: true }), context)).status).toBe(409)
  })

  it('비슷하지만 다른 오류는 충돌로 처리하지 않는다', async () => {
    mocks.setDirectorVideoFinal.mockRejectedValue(new Error('clip already has a queued attempt now'))
    expect((await PATCH(request('http://test/api/director/video-takes/clip-1', { projectId: PROJECT, is_final: true }), context)).status).toBe(500)
  })

  it('최근 시도 정보가 있는 영상 카드는 그 상태를 보여주고 지난 기록은 불러오지 않는다', async () => {
    mocks.listLiveDirectorVideoTakes.mockResolvedValue([
      {
        ...clip,
        id: 'clip-a',
        shot_id: 'a',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: null,
        last_attempt_status: 'queued',
        last_attempt_job_id: 'job-a',
        last_attempt_error: null,
        last_attempt_at: '2',
      },
      {
        ...clip,
        id: 'clip-b',
        shot_id: 'b',
        created_at: '2026-01-02T00:00:00Z',
        updated_at: null,
        last_attempt_status: 'failed',
        last_attempt_job_id: 'job-b',
        last_attempt_error: 'failed safely',
        last_attempt_at: '3',
      },
      {
        ...clip,
        id: 'clip-completed',
        shot_id: 'completed',
        created_at: '2026-01-03T00:00:00Z',
        updated_at: null,
        last_attempt_status: 'completed',
        last_attempt_job_id: 'job-completed',
        last_attempt_error: null,
        last_attempt_at: '4',
      },
    ])

    const response = await GET(request(`http://test/api/director/video-takes?projectId=${PROJECT}`, undefined, 'GET'))

    expect(response.status).toBe(200)
    expect(mocks.from).not.toHaveBeenCalled()
    await expect(response.json()).resolves.toEqual({ takes: [
      expect.objectContaining({
        id: 'clip-a', updated_at: '2026-01-01T00:00:00Z', latestJobId: 'job-a',
        latestJobStatus: 'generating', latestJobError: null, latestAttemptAt: '2',
      }),
      expect.objectContaining({
        id: 'clip-b', updated_at: '2026-01-02T00:00:00Z', latestJobId: 'job-b',
        latestJobStatus: 'failed', latestJobError: 'failed safely', latestAttemptAt: '3',
      }),
      expect.objectContaining({
        id: 'clip-completed', updated_at: '2026-01-03T00:00:00Z', latestJobId: 'job-completed',
        latestJobStatus: 'completed', latestJobError: null, latestAttemptAt: '4',
      }),
    ] })
  })

  it.each([
    ['override', []],
    ['canvas_position', { x: 1 }],
    ['canvas_position', { x: 1, y: '2' }],
    ['take_label', 1],
  ])('영상 카드의 %s 정보가 올바르지 않으면 저장하지 않는다', async (field, value) => {
    const response = await PATCH(request('http://test/api/director/video-takes/clip-1', { projectId: PROJECT, [field]: value }), context)
    expect(requireResponse(response).status).toBe(400)
    expect(mocks.updateDirectorVideoTakeMetadata).not.toHaveBeenCalled()
  })
})

describe('영상이 아닌 그림 올리기 규칙', () => {
  it.each([
    ['unknown type', imageRequest('unknown', 'character-1', 'portrait', new Blob(['x'], { type: 'image/png' }))],
    ['unknown field', imageRequest('character', 'character-1', 'name', new Blob(['x'], { type: 'image/png' }))],
    ['overlong entity ID', imageRequest('character', 'a'.repeat(257), 'portrait', new Blob(['x'], { type: 'image/png' }))],
    ['unsupported MIME', imageRequest('character', 'character-1', 'portrait', new Blob(['not an image'], { type: 'text/plain' }))],
    ['oversize image', imageRequest('character', 'character-1', 'portrait', new Blob([new Uint8Array(10 * 1024 * 1024 + 1)], { type: 'image/png' }))],
  ])('%s이면 보관하기 전에 거절한다', async (_name, upload) => {
    mocks.from.mockReturnValue(projectQuery())

    expect((await uploadImage(upload)).status).toBe(400)
    expect(mocks.storageFrom).not.toHaveBeenCalled()
  })

  it('프로젝트에 속하지 않은 대상은 보관하기 전에 거절한다', async () => {
    mocks.from.mockReturnValueOnce(projectQuery()).mockReturnValueOnce(thumbnailQuery(null))

    const png = new Blob([PNG_BYTES], { type: 'image/png' })
    expect((await uploadImage(imageRequest('character', 'foreign-character', 'portrait', png))).status).toBe(404)
    expect(mocks.storageFrom).not.toHaveBeenCalled()
  })
  it('한글로 된 대상 이름도 프로젝트 소속을 확인한다', async () => {
    const targetQuery = thumbnailQuery(null)
    mocks.from.mockReturnValueOnce(projectQuery()).mockReturnValueOnce(targetQuery)

    const png = new Blob([PNG_BYTES], { type: 'image/png' })
    expect((await uploadImage(imageRequest('location', '서울 광장', 'wide_shot', png))).status).toBe(404)
    expect(targetQuery.eq).toHaveBeenCalledWith('location_id', '서울 광장')
    expect(mocks.storageFrom).not.toHaveBeenCalled()
  })
  it('Director 그림을 저장해도 원본 Character 정보는 덮어쓰지 않는다', async () => {
    const targetQuery = thumbnailQuery({ character_id: 'character-1' })
    mocks.from.mockReturnValueOnce(projectQuery()).mockReturnValueOnce(targetQuery)
    const upload = vi.fn().mockResolvedValue({ error: null })
    mocks.storageFrom.mockReturnValue({ upload })

    const response = await uploadImage(
      imageRequest(
        'director-asset',
        'character-1',
        'character',
        new Blob([PNG_BYTES], { type: 'image/png' }),
      ),
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      publicUrl: expect.stringMatching(
        /director-assets\/character\/v1-[a-f0-9]{64}\.png\?v=\d+$/,
      ),
    })
    expect(targetQuery.eq).toHaveBeenCalledWith(
      'character_id',
      'character-1',
    )
    expect(upload).toHaveBeenCalled()
    expect(targetQuery).not.toHaveProperty('update')
  })
  it('보관 뒤 대상이 사라지면 성공으로 알리지 않는다', async () => {
    const targetQuery = thumbnailQuery({ character_id: 'character-1' })
    const updateQuery = thumbnailUpdateQuery(null)
    mocks.from.mockReturnValueOnce(projectQuery()).mockReturnValueOnce(targetQuery).mockReturnValueOnce(updateQuery)
    mocks.storageFrom.mockReturnValue({
      upload: vi.fn().mockResolvedValue({ error: null }),
    })

    const response = await uploadImage(imageRequest('character', 'character-1', 'portrait', new Blob([PNG_BYTES], { type: 'image/png' })))

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({ error: 'Image target no longer exists' })
    expect(updateQuery.select).toHaveBeenCalledWith('character_id')
  })

  it('내용이 잘못된 그림은 거절하고 원인을 짧게 기록한다', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    mocks.from.mockReturnValue(projectQuery())

    const response = await uploadImage(imageRequest('character', 'character-1', 'portrait', new Blob(['not a PNG'], { type: 'image/png' })))

    expect(response.status).toBe(400)
    expect(warn).toHaveBeenCalledWith(
      '[assets/upload-image] image decoder rejected input',
      expect.any(String),
    )
    expect((warn.mock.calls[0]?.[1] as string).length).toBeLessThanOrEqual(200)
    warn.mockRestore()
  })

  it('영상 외 그림 보관 중 서버 오류 내용을 안전하게 안내한다', async () => {
    mocks.from.mockReturnValueOnce(projectQuery()).mockReturnValueOnce(thumbnailQuery({ character_id: 'character-1' }))
    mocks.storageFrom.mockReturnValue({
      upload: vi.fn().mockResolvedValue({ error: new Error('storage credential secret') }),
      getPublicUrl: vi.fn(),
    })

    const response = await uploadImage(imageRequest('character', 'character-1', 'portrait', new Blob([PNG_BYTES], { type: 'image/png' })))

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({ error: 'Unable to upload image' })
  })
})
describe('영상 미리보기 그림의 연결 규칙', () => {
  it('내 프로젝트가 아닌 영상 미리보기는 올리지 않는다', async () => {
    mocks.userOwnsProject.mockResolvedValue(false)
    const response = await uploadImage(imageUploadRequest('job-1'))
    expect(response.status).toBe(403)
    expect(mocks.from).not.toHaveBeenCalled()
  })
  it.each([
    ['empty thumbnail', new Blob([], { type: 'image/jpeg' })],
    ['thumbnail MIME/content mismatch', new Blob(['not jpeg'], { type: 'image/jpeg' })],
    ['signature-only JPEG', new Blob([Buffer.from([0xff, 0xd8, 0xff])], { type: 'image/jpeg' })],
    ['PNG thumbnail with a .jpg contract', new Blob([PNG_BYTES], { type: 'image/png' })],
  ])('%s이면 연결된 정보나 보관함을 건드리기 전에 거절한다', async (_name, file) => {
    mocks.from.mockReturnValueOnce(projectQuery())
    const form = new FormData()
    form.set('projectId', PROJECT)
    form.set('type', 'video')
    form.set('entityId', 'clip-1')
    form.set('field', 'thumbnail')
    form.set('generationJobId', 'job-1')
    form.set('file', file, 'thumbnail.jpg')

    expect((await uploadImage(new Request('http://test/api/assets/upload-image', { method: 'POST', body: form }))).status).toBe(400)
    expect(mocks.from).toHaveBeenCalledTimes(1)
    expect(mocks.storageFrom).not.toHaveBeenCalled()
  })

  it('연결된 영상 작업이 끝나야 미리보기 그림을 올린다', async () => {
    const projectQuery = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn() }
    projectQuery.select.mockReturnValue(projectQuery)
    projectQuery.eq.mockReturnValue(projectQuery)
    projectQuery.maybeSingle.mockResolvedValue({ data: { workspace_id: 'workspace-1' }, error: null })
    const jobQuery = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn() }
    jobQuery.select.mockReturnValue(jobQuery)
    jobQuery.eq.mockReturnValue(jobQuery)
    jobQuery.maybeSingle.mockResolvedValue({ data: { id: 'job-1', video_clip_id: 'clip-1', status: 'queued' }, error: null })
    mocks.from.mockReturnValueOnce(projectQuery).mockReturnValueOnce(jobQuery)

    const response = await uploadImage(imageUploadRequest('job-1'))
    expect(response.status).toBe(403)
    expect(mocks.storageFrom).not.toHaveBeenCalled()
  })
  it('이미 있는 미리보기 그림은 다시 올려도 같은 주소를 쓰고 영상 정보를 새로 고친다', async () => {
    const projectQuery = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn() }
    projectQuery.select.mockReturnValue(projectQuery); projectQuery.eq.mockReturnValue(projectQuery)
    projectQuery.maybeSingle.mockResolvedValue({ data: { workspace_id: 'workspace-1' }, error: null })
    const jobQuery = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn() }
    jobQuery.select.mockReturnValue(jobQuery); jobQuery.eq.mockReturnValue(jobQuery)
    jobQuery.maybeSingle.mockResolvedValue({ data: { id: 'job-1', video_clip_id: 'clip-1', status: 'completed' }, error: null })
    const clipQuery = { select: vi.fn(), eq: vi.fn(), is: vi.fn(), maybeSingle: vi.fn() }
    clipQuery.select.mockReturnValue(clipQuery); clipQuery.eq.mockReturnValue(clipQuery); clipQuery.is.mockReturnValue(clipQuery)
    clipQuery.maybeSingle.mockResolvedValue({ data: { id: 'clip-1', storage_path: 'workspace-1/project-1/videos/clip-1/job-1.mp4' }, error: null })
    const updateQuery = thumbnailUpdateQuery({ id: 'clip-1' })
    mocks.from.mockReturnValueOnce(projectQuery).mockReturnValueOnce(jobQuery).mockReturnValueOnce(clipQuery).mockReturnValueOnce(updateQuery)
    const upload = vi.fn().mockResolvedValue({ error: { status: 409 } })
    const info = vi.fn().mockResolvedValue({ data: { metadata: { size: JPEG_BYTES.byteLength, mimetype: 'image/jpeg' } }, error: null })
    const download = vi.fn().mockResolvedValue({ data: new Blob([JPEG_BYTES]), error: null })
    mocks.storageFrom.mockReturnValue({ upload, info, download })

    const response = await uploadImage(imageUploadRequest('job-1'))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ publicUrl: THUMB_PUBLIC_URL })
    expect(upload).toHaveBeenCalledWith(
      'workspace-1/project-1/videos/clip-1/job-1.jpg',
      expect.any(Buffer),
      { contentType: 'image/jpeg', upsert: false, cacheControl: MEDIA_CACHE_CONTROL },
    )
    expect(updateQuery.update).toHaveBeenCalledWith({
      thumbnail_url: THUMB_PUBLIC_URL,
      thumbnail_path: 'workspace-1/project-1/videos/clip-1/job-1.jpg',
    })
    expect(jobQuery.eq).toHaveBeenCalledWith('id', 'job-1')
    expect(jobQuery.eq).toHaveBeenCalledWith('project_id', PROJECT)
    expect(jobQuery.eq).toHaveBeenCalledWith('kind', 'shot_video')
    expect(clipQuery.eq).toHaveBeenCalledWith('id', 'clip-1')
    expect(clipQuery.eq).toHaveBeenCalledWith('project_id', PROJECT)
    expect(clipQuery.is).toHaveBeenCalledWith('deleted_at', null)
    expect(updateQuery.eq).toHaveBeenCalledWith('id', 'clip-1')
    expect(updateQuery.eq).toHaveBeenCalledWith('project_id', PROJECT)
    expect(updateQuery.is).toHaveBeenCalledWith('deleted_at', null)
    expect(updateQuery.eq).toHaveBeenCalledWith('storage_path', 'workspace-1/project-1/videos/clip-1/job-1.mp4')
  })
  it('연결용 장면 그림은 따로 보관하고 미리보기 정보는 바꾸지 않는다', async () => {
    mocks.from
      .mockReturnValueOnce(thumbnailQuery({ workspace_id: 'workspace-1' }))
      .mockReturnValueOnce(
        thumbnailQuery({ id: 'job-1', video_clip_id: 'clip-1', status: 'completed' }),
      )
      .mockReturnValueOnce(
        thumbnailQuery({
          id: 'clip-1',
          storage_path: 'workspace-1/project-1/videos/clip-1/job-1.mp4',
        }),
      )
    const upload = vi.fn().mockResolvedValue({ error: null })
    mocks.storageFrom.mockReturnValue({ upload })

    const response = await uploadImage(chainFrameUploadRequest('job-1'))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ publicUrl: CHAIN_FRAME_PUBLIC_URL })
    expect(upload).toHaveBeenCalledWith(
      'workspace-1/project-1/videos/clip-1/job-1_chain-frame.jpg',
      expect.any(Buffer),
      { contentType: 'image/jpeg', upsert: false, cacheControl: MEDIA_CACHE_CONTROL },
    )
    expect(mocks.from).toHaveBeenCalledTimes(3)
  })
  it.each([
    ['wrong linked clip', { id: 'job-1', video_clip_id: 'other-clip', status: 'completed' }, 403],
    ['non-completed job', { id: 'job-1', video_clip_id: 'clip-1', status: 'failed' }, 403],
  ])('%s이면 보관하기 전에 거절한다', async (_name, job, status) => {
    mocks.from.mockReturnValueOnce(thumbnailQuery({ workspace_id: 'workspace-1' })).mockReturnValueOnce(thumbnailQuery(job))
    expect((await uploadImage(imageUploadRequest('job-1'))).status).toBe(status)
    expect(mocks.storageFrom).not.toHaveBeenCalled()
  })

  it.each([
    ['missing clip', null, 404],
    ['stale current storage', { id: 'clip-1', storage_path: 'workspace-1/project-1/videos/clip-1/other-job.mp4' }, 409],
  ])('%s이면 미리보기 그림을 인정하지 않는다', async (_name, clipData, status) => {
    mocks.from.mockReturnValueOnce(thumbnailQuery({ workspace_id: 'workspace-1' }))
      .mockReturnValueOnce(thumbnailQuery({ id: 'job-1', video_clip_id: 'clip-1', status: 'completed' }))
      .mockReturnValueOnce(thumbnailQuery(clipData))
    expect((await uploadImage(imageUploadRequest('job-1'))).status).toBe(status)
    expect(mocks.storageFrom).not.toHaveBeenCalled()
  })

  it('삭제된 영상은 보관하기 전에 걸러낸다', async () => {
    const deletedClipQuery = thumbnailQuery(null)
    mocks.from.mockReturnValueOnce(thumbnailQuery({ workspace_id: 'workspace-1' }))
      .mockReturnValueOnce(thumbnailQuery({ id: 'job-1', video_clip_id: 'clip-1', status: 'completed' }))
      .mockReturnValueOnce(deletedClipQuery)

    expect((await uploadImage(imageUploadRequest('job-1'))).status).toBe(404)
    expect(deletedClipQuery.is).toHaveBeenCalledWith('deleted_at', null)
    expect(mocks.storageFrom).not.toHaveBeenCalled()
  })

  it.each([
    ['409 replay inspection failure', { status: 409 }, { data: null, error: new Error('info failed') }],
    ['non-409 upload failure', new Error('storage unavailable'), undefined],
  ])('미리보기 그림을 다시 올리는 중 %s이면 주소를 공개하거나 영상 정보를 바꾸지 않는다', async (_name, uploadError, infoResult) => {
    mocks.from.mockReturnValueOnce(thumbnailQuery({ workspace_id: 'workspace-1' }))
      .mockReturnValueOnce(thumbnailQuery({ id: 'job-1', video_clip_id: 'clip-1', status: 'completed' }))
      .mockReturnValueOnce(thumbnailQuery({ id: 'clip-1', storage_path: 'workspace-1/project-1/videos/clip-1/job-1.mp4' }))
    const info = vi.fn().mockResolvedValue(infoResult)
    const getPublicUrl = vi.fn()
    mocks.storageFrom.mockReturnValue({ upload: vi.fn().mockResolvedValue({ error: uploadError }), info, getPublicUrl })

    expect((await uploadImage(imageUploadRequest('job-1'))).status).toBe(500)
    expect(getPublicUrl).not.toHaveBeenCalled()
    expect(mocks.from).toHaveBeenCalledTimes(3)
    if (uploadError instanceof Error) expect(info).not.toHaveBeenCalled()
  })

  it('영상 정보가 동시에 바뀌면 충돌로 처리한다', async () => {
    const update = thumbnailUpdateQuery(null)
    mocks.from.mockReturnValueOnce(thumbnailQuery({ workspace_id: 'workspace-1' }))
      .mockReturnValueOnce(thumbnailQuery({ id: 'job-1', video_clip_id: 'clip-1', status: 'completed' }))
      .mockReturnValueOnce(thumbnailQuery({ id: 'clip-1', storage_path: 'workspace-1/project-1/videos/clip-1/job-1.mp4' }))
      .mockReturnValueOnce(update)
    mocks.storageFrom.mockReturnValue({ upload: vi.fn().mockResolvedValue({ error: null }), info: vi.fn() })
    expect((await uploadImage(imageUploadRequest('job-1'))).status).toBe(409)
    expect(update.eq).toHaveBeenCalledWith('storage_path', 'workspace-1/project-1/videos/clip-1/job-1.mp4')
  })
})
