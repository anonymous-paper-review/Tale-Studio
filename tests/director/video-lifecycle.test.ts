// 영상 결과 주소가 안전하고 재생 가능할 때만 보관하고 완료 처리한다
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ uploadImmutableObject: vi.fn(), complete: vi.fn(), fail: vi.fn(), completeJob: vi.fn(), failJob: vi.fn(), patch: vi.fn(), from: vi.fn(), falVideoFetch: vi.fn() }))
vi.mock('@/lib/storage/immutable-object', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/storage/immutable-object')>(),
  uploadImmutableObject: mocks.uploadImmutableObject,
}))
vi.mock('@/lib/director-video-takes', () => ({ completeDirectorVideoAttempt: mocks.complete, markDirectorVideoAttemptFailed: mocks.fail }))
vi.mock('@/lib/generation-jobs', () => ({
  completeGenerationJob: mocks.completeJob,
  failGenerationJob: mocks.failJob,
  patchGenerationJobResponseSnapshotByRequestId: mocks.patch,
  // reconcile 의 터미널 전이 dedupe(2026-07-22)가 instanceof 로 판별하는 클래스 — 목에도 제공.
  GenerationJobTerminalTransitionError: class GenerationJobTerminalTransitionError extends Error {},
}))
vi.mock('@/lib/fal/observability', () => ({ buildFalResponseSnapshot: () => ({}) }))
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: mocks.from, storage: { from: mocks.from } } }))
vi.mock('@/lib/artist/portrait', () => ({ cropTurnaroundPortrait: vi.fn() }))
vi.mock('@/lib/storage-thumb', () => ({ uploadThumbnail: vi.fn() }))
vi.mock('@/lib/writer/llm/fal', () => ({ falVideoFetch: mocks.falVideoFetch, falImageFetch: vi.fn() }))

import { finalizeShotVideoJob, readProviderVideoBytes } from '@/lib/fal/finalize'
import { ImmutableObjectMismatchError } from '@/lib/storage/immutable-object'
import { mediaPublicUrl } from '@/lib/storage/media-url'

// 영상 결과 주소는 보관함 경로에서 계산된다. 하드코딩해 두면 보관 위치를 옮겼을 때
// 테스트가 옛 주소를 계속 통과시켜 회귀를 놓친다.
const LINKED_VIDEO_KEY = 'workspace-1/project-1/videos/clip-1/job-1.mp4'
const LINKED_VIDEO_URL = mediaPublicUrl(LINKED_VIDEO_KEY)

function box(type: string, ...payload: Buffer[]): Buffer {
  const body = Buffer.concat(payload)
  const header = Buffer.alloc(8)
  header.writeUInt32BE(header.length + body.length)
  header.write(type, 4, 'ascii')
  return Buffer.concat([header, body])
}

function u32(...values: number[]): Buffer {
  const bytes = Buffer.alloc(values.length * 4)
  values.forEach((value, index) => bytes.writeUInt32BE(value, index * 4))
  return bytes
}

function playableFixture({ handler = 'vide', sampleCount = 2, secondChunkOffset }: {
  handler?: string
  sampleCount?: number
  secondChunkOffset?: number
} = {}): Buffer {
  const ftyp = box('ftyp', Buffer.from('isom'), u32(0), Buffer.from('isom'))
  const mdat = box('mdat', Buffer.from([0, 0, 0, 1, 0x09, 0x10, 0, 0, 0, 1, 0x09, 0x10]))
  const stsd = box('stsd', u32(0, 1), box('avc1'))
  const stts = box('stts', u32(0, 1, sampleCount, 1))
  const stsc = box('stsc', u32(0, 2, 1, 1, 1, 2, 1, 1))
  const stsz = box('stsz', u32(0, 6, 2))
  const firstOffset = ftyp.length + 8
  const stco = box('stco', u32(0, 2, firstOffset, secondChunkOffset ?? firstOffset + 6))
  const hdlr = box('hdlr', u32(0, 0), Buffer.from(handler))
  const moov = box('moov', box('trak', box('mdia', hdlr, box('minf', box('stbl', stsd, stts, stsc, stsz, stco)))))
  return Buffer.concat([ftyp, mdat, moov])
}
function manyMdatSamplesFixture(count: number): Buffer {
  const ftyp = box('ftyp', Buffer.from('isom'), u32(0), Buffer.from('isom'))
  const mdats = Array.from({ length: count }, () => box('mdat', Buffer.from([0])))
  const offsets = mdats.map((_, index) => ftyp.length + index * 9 + 8)
  offsets[offsets.length - 1] = 0
  const stsd = box('stsd', u32(0, 1), box('avc1'))
  const stts = box('stts', u32(0, 1, count, 1))
  const stsc = box('stsc', u32(0, 1, 1, 1, 1))
  const stsz = box('stsz', u32(0, 1, count))
  const stco = box('stco', u32(0, count, ...offsets))
  const hdlr = box('hdlr', u32(0, 0), Buffer.from('vide'))
  const moov = box('moov', box('trak', box('mdia', hdlr, box('minf', box('stbl', stsd, stts, stsc, stsz, stco)))))
  return Buffer.concat([ftyp, ...mdats, moov])
}
function repeatedVideoTracksFixture(sampleCount: number, tracks: number): Buffer {
  const ftyp = box('ftyp', Buffer.from('isom'), u32(0), Buffer.from('isom'))
  const mdat = box('mdat', Buffer.alloc(sampleCount - 1))
  const stsd = box('stsd', u32(0, 1), box('avc1'))
  const stts = box('stts', u32(0, 1, sampleCount, 1))
  const stsc = box('stsc', u32(0, 1, 1, sampleCount, 1))
  const stsz = box('stsz', u32(0, 1, sampleCount))
  const stco = box('stco', u32(0, 1, ftyp.length + 8))
  const hdlr = box('hdlr', u32(0, 0), Buffer.from('vide'))
  const trak = box('trak', box('mdia', hdlr, box('minf', box('stbl', stsd, stts, stsc, stsz, stco))))
  return Buffer.concat([ftyp, mdat, box('moov', ...Array.from({ length: tracks }, () => trak))])
}

const validMp4 = playableFixture()
function responseBody(bytes: Buffer): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}
const job = {
  id: 'job-1',
  project_id: 'project-1',
  request_id: 'fal-1',
  model: 'model',
  provider: 'fal',
  kind: 'shot_video',
  status: 'queued',
  video_clip_id: 'clip-1',
  target: { workspaceId: 'workspace-1' },
  input_snapshot: {},
  fal_key_id: 'prod-2000',
} as never
beforeEach(() => {
  vi.stubEnv('TAILSCALE_VIDEO_API_URL', 'http://local.test/api')
  vi.stubEnv('FAL_MEDIA_ALLOWED_HOSTS', '')
  vi.resetAllMocks()
  mocks.from.mockReturnValue({ getPublicUrl: vi.fn(() => ({ data: { publicUrl: 'https://media.test/video.mp4' } })) })
  vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve(
    new Response(responseBody(validMp4), { headers: { 'content-type': 'video/mp4' } }),
  )))
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})
describe('연결된 영상 결과는 안전하게 저장하고 완료 처리한다', () => {
  it('영상 결과를 저장하면 연결된 영상이 정확한 위치로 완료된다', async () => {
    await expect(finalizeShotVideoJob(job, 'https://fal.media/video.mp4')).resolves.toBe(LINKED_VIDEO_URL)
    const path = LINKED_VIDEO_KEY
    expect(mocks.uploadImmutableObject).toHaveBeenCalledWith(path, expect.any(Buffer), 'video/mp4')
    expect(mocks.complete).toHaveBeenCalledWith('project-1', 'job-1', 'clip-1', LINKED_VIDEO_URL, path)
  })
  it('새로운 FAL 주소라도 FAL 소속이면 영상 결과로 받아들인다 (#fal-cdn-host)', async () => {
    // 2026-07-31 실패 재현: fal 이 v3b.fal.media 로 내보내자 정상 영상이 전부 죽었다.
    await expect(finalizeShotVideoJob(job, 'https://v3b.fal.media/files/b/0aa/x.mp4'))
      .resolves.toBe(LINKED_VIDEO_URL)
  })
  it('FAL처럼 보이기만 하는 주소는 영상 결과로 받아들이지 않는다', async () => {
    await expect(finalizeShotVideoJob(job, 'https://evilfal.media/video.mp4'))
      .rejects.toThrow('invalid video url in provider result')
  })
  it('같은 영상 저장 내용이 충돌하면 완료로 잘못 표시하지 않는다', async () => {
    mocks.uploadImmutableObject.mockRejectedValue(new ImmutableObjectMismatchError(LINKED_VIDEO_KEY, 'content'))
    await expect(finalizeShotVideoJob(job, 'https://fal.media/video.mp4'))
      .rejects.toMatchObject({ code: 'storage_conflict' })
    expect(mocks.complete).not.toHaveBeenCalled()
  })
  it('손상된 영상 결과는 저장하지 않고 거절한다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>error</html>', { headers: { 'content-type': 'text/html' } })))
    await expect(finalizeShotVideoJob(job, 'https://fal.media/video.mp4')).rejects.toThrow('invalid MP4')
    expect(mocks.uploadImmutableObject).not.toHaveBeenCalled()
  })
  it.each([
    ['declared oversize', new Response(responseBody(validMp4), { headers: { 'content-type': 'video/mp4', 'content-length': String(129 * 1024 * 1024) } })],
    ['empty body', new Response(responseBody(Buffer.alloc(0)), { headers: { 'content-type': 'video/mp4' } })],
    ['truncated MP4', new Response(responseBody(Buffer.from([0, 0, 0, 16, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73])), { headers: { 'content-type': 'video/mp4' } })],
  ])('영상 결과가 %s이면 저장하지 않고 거절한다', async (_name, response) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response))
    await expect(finalizeShotVideoJob(job, 'https://fal.media/video.mp4'))
      .rejects.toMatchObject({ code: 'invalid_provider_result' })
    expect(mocks.uploadImmutableObject).not.toHaveBeenCalled()
  })

  it('재생 가능한 MP4는 크기 정보가 없어도 저장한다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
      responseBody(validMp4),
      { headers: { 'content-type': 'video/mp4' } },
    )))
    await expect(finalizeShotVideoJob(job, 'https://fal.media/video.mp4')).resolves.toBe(LINKED_VIDEO_URL)
    expect(mocks.uploadImmutableObject).toHaveBeenCalled()
  })
  it('내용이 없는 MP4는 저장하지 않고 거절한다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
      Buffer.from([0, 0, 0, 16, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0, 0, 0, 0]),
      { headers: { 'content-type': 'video/mp4' } },
    )))
    await expect(finalizeShotVideoJob(job, 'https://fal.media/video.mp4'))
      .rejects.toMatchObject({ code: 'invalid_provider_result' })
    expect(mocks.uploadImmutableObject).not.toHaveBeenCalled()
  })
  it.each([
    ['trackless moov', Buffer.concat([validMp4.subarray(0, 34), box('moov')])],
    ['sample extent outside mdat', (() => {
      const malformed = Buffer.from(validMp4)
      malformed.writeUInt32BE(validMp4.length, malformed.indexOf('stco') + 12)
      return malformed
    })()],
    ['truncated moov', validMp4.subarray(0, -1)],
  ])('영상 파일 형식이 깨졌으면 %s 경우에도 저장하지 않고 거절한다', async (_name, bytes) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(responseBody(bytes), { headers: { 'content-type': 'video/mp4' } })))
    await expect(finalizeShotVideoJob(job, 'https://fal.media/video.mp4'))
      .rejects.toMatchObject({ code: 'invalid_provider_result' })
    expect(mocks.uploadImmutableObject).not.toHaveBeenCalled()
  })
  it.each([
    ['audio-only handler', playableFixture({ handler: 'soun' })],
    ['mismatched stts sample count', playableFixture({ sampleCount: 1 })],
    ['invalid later chunk extent', playableFixture({ secondChunkOffset: 0 })],
    ['malformed co64 table', (() => {
      const malformed = Buffer.from(validMp4)
      malformed.write('co64', malformed.indexOf('stco'), 'ascii')
      return malformed
    })()],
    ['zero sample count', (() => {
      const malformed = Buffer.from(validMp4)
      malformed.writeUInt32BE(0, malformed.indexOf('stsz') + 12)
      return malformed
    })()],
  ])('영상 정보가 잘못되었으면 %s 경우에도 저장하지 않고 거절한다', async (_name, bytes) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(responseBody(bytes), { headers: { 'content-type': 'video/mp4' } })))
    await expect(finalizeShotVideoJob(job, 'https://fal.media/video.mp4'))
      .rejects.toMatchObject({ code: 'invalid_provider_result' })
    expect(mocks.uploadImmutableObject).not.toHaveBeenCalled()
  })
  it('영상에 기록된 장면 수가 비정상적으로 크면 저장하지 않는다', async () => {
    const malformed = Buffer.from(validMp4)
    malformed.writeUInt32BE(0xffffffff, malformed.indexOf('stsz') + 12)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
      responseBody(malformed),
      { headers: { 'content-type': 'video/mp4' } },
    )))
    await expect(finalizeShotVideoJob(job, 'https://fal.media/video.mp4'))
      .rejects.toMatchObject({ code: 'invalid_provider_result' })
    expect(mocks.uploadImmutableObject).not.toHaveBeenCalled()
  })
  it('영상 구조가 지나치게 복잡하면 저장하지 않고 거절한다', async () => {
    const flood = Buffer.concat(Array.from({ length: 10_000 }, () => box('free')))
    const bytes = Buffer.concat([
      validMp4.subarray(0, 16),
      flood,
      validMp4.subarray(16),
    ])
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
      responseBody(bytes),
      { headers: { 'content-type': 'video/mp4' } },
    )))
    await expect(finalizeShotVideoJob(job, 'https://fal.media/video.mp4'))
      .rejects.toMatchObject({ code: 'invalid_provider_result' })
    expect(mocks.uploadImmutableObject).not.toHaveBeenCalled()
  })
  it('영상 구간이 지나치게 많고 잘못되면 저장하지 않고 거절한다', async () => {
    const bytes = manyMdatSamplesFixture(2_000)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
      responseBody(bytes),
      { headers: { 'content-type': 'video/mp4' } },
    )))
    await expect(finalizeShotVideoJob(job, 'https://fal.media/video.mp4'))
      .rejects.toMatchObject({ code: 'invalid_provider_result' })
    expect(mocks.uploadImmutableObject).not.toHaveBeenCalled()
  })
  it('영상 정보가 허용량을 넘으면 저장하지 않고 거절한다', async () => {
    const bytes = repeatedVideoTracksFixture(600_000, 2)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
      responseBody(bytes),
      { headers: { 'content-type': 'video/mp4' } },
    )))
    await expect(finalizeShotVideoJob(job, 'https://fal.media/video.mp4'))
      .rejects.toMatchObject({ code: 'invalid_provider_result' })
    expect(mocks.uploadImmutableObject).not.toHaveBeenCalled()
  })
  it('허용된 내 컴퓨터와 FAL 주소의 영상은 저장한다', async () => {
    const localJob = { ...(job as object), provider: 'local', request_id: 'http://local.test/api/tasks/1' } as never
    await expect(finalizeShotVideoJob(localJob, 'http://local.test/api/tasks/1/output.mp4')).resolves.toBe(LINKED_VIDEO_URL)
    await expect(finalizeShotVideoJob(job, 'https://v3.fal.media/video.mp4')).resolves.toBe(LINKED_VIDEO_URL)

    vi.stubEnv('FAL_MEDIA_ALLOWED_HOSTS', 'media.example.test')
    await expect(finalizeShotVideoJob(job, 'https://media.example.test/video.mp4')).resolves.toBe(LINKED_VIDEO_URL)
  })

  it.each([
    'http://fal.media/video.mp4',
    'https://127.0.0.1/video.mp4',
    'https://evil.test/video.mp4',
    'https://user@fal.media/video.mp4',
    'https://fal.media:8443/video.mp4',
  ])('안전하지 않은 FAL 영상 주소 %s는 가져오지 않는다', async (url) => {
    await expect(finalizeShotVideoJob(job, url)).rejects.toMatchObject({ code: 'invalid_provider_result' })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('허용한 내 컴퓨터 주소가 아니면 영상을 가져오지 않는다', async () => {
    const localJob = { ...(job as object), provider: 'local', request_id: 'http://local.test/api/tasks/1' } as never
    await expect(finalizeShotVideoJob(localJob, 'https://local.test/api/tasks/1/output.mp4'))
      .rejects.toMatchObject({ code: 'invalid_provider_result' })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('영상 주소가 허용 범위를 벗어나도록 바뀌면 거절한다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, {
      status: 302,
      headers: { location: 'https://evil.test/video.mp4' },
    })))
    await expect(finalizeShotVideoJob(job, 'https://fal.media/video.mp4'))
      .rejects.toMatchObject({ code: 'invalid_provider_result' })
    expect(fetch).toHaveBeenCalledTimes(1)
  })
  it('허용된 주소 변경은 따라가고 중간 내용은 정리한다', async () => {
    let cancelled = false
    const redirect = new Response(new ReadableStream({ cancel() { cancelled = true } }), {
      status: 302,
      headers: { location: '/video-final.mp4' },
    })
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(redirect)
      .mockResolvedValueOnce(new Response(responseBody(validMp4), { headers: { 'content-type': 'video/mp4' } })))
    await expect(finalizeShotVideoJob(job, 'https://fal.media/video.mp4')).resolves.toBe(LINKED_VIDEO_URL)
    expect(cancelled).toBe(true)
    expect(fetch).toHaveBeenCalledTimes(2)
  })
  it('주소 변경이 너무 많으면 마지막 내용을 정리하고 거절한다', async () => {
    let cancellations = 0
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => new Response(
      new ReadableStream({ cancel() { cancellations += 1 } }),
      { status: 302, headers: { location: '/again.mp4' } },
    )))
    await expect(finalizeShotVideoJob(job, 'https://fal.media/video.mp4'))
      .rejects.toMatchObject({ code: 'invalid_provider_result' })
    expect(cancellations).toBe(4)
  })
  it('영상 응답이 실패하면 내용을 정리하고 종료한다', async () => {
    let cancelled = false
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
      new ReadableStream({ cancel() { cancelled = true } }),
      { status: 404 },
    )))
    await expect(finalizeShotVideoJob(job, 'https://fal.media/video.mp4'))
      .rejects.toMatchObject({ code: 'provider_fetch_terminal' })
    expect(cancelled).toBe(true)
  })

  it('영상 받기가 오래 걸리면 다시 시도할 수 있게 중단한다', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn().mockImplementation((_url, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
    })))
    const finalized = expect(
      finalizeShotVideoJob(job, 'https://fal.media/video.mp4'),
    ).rejects.toMatchObject({ code: 'provider_fetch_retryable' })
    await vi.advanceTimersByTimeAsync(45_000)
    await finalized
  })
  it('영상 받기가 시작된 뒤 멈춰도 오래 기다리지 않고 다시 시도한다', async () => {
    vi.useFakeTimers()
    let cancelled = false
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
      new ReadableStream({ cancel() { cancelled = true } }),
      { headers: { 'content-type': 'video/mp4' } },
    )))
    const finalized = expect(finalizeShotVideoJob(job, 'https://fal.media/video.mp4'))
      .rejects.toMatchObject({ code: 'provider_fetch_retryable' })
    await vi.advanceTimersByTimeAsync(45_000)
    await finalized
    expect(cancelled).toBe(true)
    expect(mocks.uploadImmutableObject).not.toHaveBeenCalled()
  })
  it.each([
    ['absent', undefined],
    ['dishonest', '12'],
  ])('영상 크기가 허용량을 넘으면 %s 경우에도 중단한다', async (_name, contentLength) => {
    let cancelled = false
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(validMp4)
        controller.enqueue(new Uint8Array([1, 2, 3, 4]))
      },
      cancel() { cancelled = true },
    })
    const response = new Response(stream, {
      headers: { 'content-type': 'video/mp4', ...(contentLength ? { 'content-length': contentLength } : {}) },
    })
    await expect(readProviderVideoBytes(response, 12)).rejects.toMatchObject({ code: 'invalid_provider_result' })
    expect(cancelled).toBe(true)
  })

  it('저장 충돌과 명확한 서버 오류는 더 시도하지 않고 종료한다', async () => {
    mocks.uploadImmutableObject.mockRejectedValue(Object.assign(new Error('storage timeout'), { code: 'ETIMEDOUT' }))
    await expect(finalizeShotVideoJob(job, 'https://fal.media/video.mp4'))
      .rejects.toMatchObject({ code: 'storage_retryable' })

    mocks.uploadImmutableObject.mockRejectedValue(Object.assign(new Error('storage authorization failed'), { code: '403' }))
    await expect(finalizeShotVideoJob(job, 'https://fal.media/video.mp4'))
      .rejects.toMatchObject({ code: 'storage_terminal' })

    mocks.uploadImmutableObject.mockRejectedValue(Object.assign(new Error('storage gateway unavailable'), { status: 503 }))
    await expect(finalizeShotVideoJob(job, 'https://fal.media/video.mp4'))
      .rejects.toMatchObject({ code: 'storage_retryable' })

    mocks.uploadImmutableObject.mockResolvedValue(undefined)
    mocks.complete.mockRejectedValue(Object.assign(new Error('not null'), { code: '23502' }))
    await expect(finalizeShotVideoJob(job, 'https://fal.media/video.mp4'))
      .rejects.toMatchObject({ code: 'database_constraint' })

    mocks.complete.mockRejectedValue(Object.assign(new Error('database unavailable'), { code: '08006' }))
    await expect(finalizeShotVideoJob(job, 'https://fal.media/video.mp4'))
      .rejects.toMatchObject({ code: 'database_retryable' })

    mocks.complete.mockRejectedValue(Object.assign(new Error('schema missing'), { code: '42P01' }))
    await expect(finalizeShotVideoJob(job, 'https://fal.media/video.mp4'))
      .rejects.toMatchObject({ code: 'database_terminal' })
  })
  it.each([
    ['status', 408],
    ['status', 425],
    ['status', 429],
    ['statusCode', 408],
    ['statusCode', 425],
    ['statusCode', 429],
  ])('일시적인 저장 오류 상태 %s=%s이면 다시 시도한다', async (field, status) => {
    mocks.uploadImmutableObject.mockRejectedValue(Object.assign(new Error('storage transient'), { [field]: status }))
    await expect(finalizeShotVideoJob(job, 'https://fal.media/video.mp4'))
      .rejects.toMatchObject({ code: 'storage_retryable' })
  })
  it('원인을 알 수 없는 저장 실패는 다시 시도한다', async () => {
    mocks.complete.mockRejectedValue(new Error('complete RPC failed'))
    await expect(finalizeShotVideoJob(job, 'https://fal.media/video.mp4'))
      .rejects.toMatchObject({ code: 'database_retryable' })
  })
})
describe('연결된 영상 결과를 상태에 맞게 반영한다', () => {
  it('연결된 영상 제공처가 실패하면 실패 상태로 기록한다', async () => {
    const { reconcileJobFromFal } = await import('@/lib/fal/reconcile')
    mocks.falVideoFetch.mockResolvedValue({ status: 'FAILED', error: 'provider failed' })
    await expect(reconcileJobFromFal(job)).resolves.toMatchObject({ status: 'failed', error: 'provider failed' })
    expect(mocks.fail).toHaveBeenCalledWith('project-1', 'job-1', 'provider failed')
  })
  it('연결된 내 컴퓨터 영상은 Director 결과로 완료한다', async () => {
    const { reconcileJobFromFal } = await import('@/lib/fal/reconcile')
    const localJob = { ...(job as object), provider: 'local', request_id: 'http://local.test/api/output.mp4' } as never
    await expect(reconcileJobFromFal(localJob)).resolves.toMatchObject({
      status: 'completed',
      result_url: LINKED_VIDEO_URL,
    })
    expect(mocks.complete).toHaveBeenCalledWith(
      'project-1',
      'job-1',
      'clip-1',
      LINKED_VIDEO_URL,
      LINKED_VIDEO_KEY,
    )
  })
  it('연결되지 않은 내 컴퓨터 영상도 완료 결과로 기록한다', async () => {
    const { reconcileJobFromFal } = await import('@/lib/fal/reconcile')
    const localJob = {
      ...(job as object),
      provider: 'local',
      request_id: 'http://local.test/api/output.mp4',
      video_clip_id: null,
      target: {},
    } as never
    await expect(reconcileJobFromFal(localJob)).resolves.toMatchObject({
      status: 'completed',
      result_url: 'http://local.test/api/output.mp4',
    })
    expect(mocks.completeJob).toHaveBeenCalledWith('job-1', 'http://local.test/api/output.mp4')
  })
  it('연결되지 않은 영상 주소가 잘못되면 실패로 기록한다', async () => {
    const { reconcileJobFromFal } = await import('@/lib/fal/reconcile')
    const localJob = {
      ...(job as object),
      provider: 'local',
      request_id: 'not a URL',
      video_clip_id: null,
      target: {},
    } as never
    await expect(reconcileJobFromFal(localJob)).resolves.toMatchObject({ status: 'failed' })
    // [finalize] prefix marks the failing stage (#a2-observability 2026-08-26)
    expect(mocks.failJob).toHaveBeenCalledWith('job-1', '[finalize] local video job has no valid result URL')
  })
  it.each([
    'https://evil.test/output.mp4',
    'ftp://local.test/output.mp4',
    'http://user@local.test/output.mp4',
  ])('허용하지 않은 내 컴퓨터 영상 주소 %s는 실패로 기록한다', async (requestId) => {
    const { reconcileJobFromFal } = await import('@/lib/fal/reconcile')
    const localJob = {
      ...(job as object),
      provider: 'local',
      request_id: requestId,
      video_clip_id: null,
      target: {},
    } as never
    await expect(reconcileJobFromFal(localJob)).resolves.toMatchObject({ status: 'failed' })
    // [finalize] prefix marks the failing stage (#a2-observability 2026-08-26)
    expect(mocks.failJob).toHaveBeenCalledWith('job-1', '[finalize] local video job has no valid result URL')
  })
  it('연결된 영상 제공처의 영구 오류는 실패로 기록한다', async () => {
    const { reconcileJobFromFal } = await import('@/lib/fal/reconcile')
    mocks.falVideoFetch.mockRejectedValue(Object.assign(new Error('provider request invalid'), { status: 400 }))
    // HTTP status 를 사유에 합성한다 (#a1-inflight-block 2026-08-27) — fal 404 는 message 가 비어
    //   있어 원본만 넘기면 종결 가드("nonblank")에 걸리고, 그 잡이 샷의 재생성을 영구히 막았다.
    await expect(reconcileJobFromFal(job)).resolves.toMatchObject({ status: 'failed', error: 'provider request invalid (status 400)' })
    expect(mocks.fail).toHaveBeenCalledWith('project-1', 'job-1', 'provider request invalid (status 400)')
  })

  it('원인을 모르는 영상 제공처 오류는 대기 상태를 유지한다', async () => {
    const { reconcileJobFromFal } = await import('@/lib/fal/reconcile')
    mocks.falVideoFetch.mockRejectedValue(new Error('provider lookup unavailable'))
    await expect(reconcileJobFromFal(job)).resolves.toBe(job)
    expect(mocks.fail).not.toHaveBeenCalled()
  })

  it('일시적인 영상 제공처 오류는 대기 상태를 유지한다', async () => {
    const { reconcileJobFromFal } = await import('@/lib/fal/reconcile')
    mocks.falVideoFetch.mockRejectedValue(new TypeError('temporary provider outage'))
    await expect(reconcileJobFromFal(job)).resolves.toBe(job)
  })

  it('연결된 영상 실패를 기록할 수 없으면 그 오류를 알린다', async () => {
    const { reconcileJobFromFal } = await import('@/lib/fal/reconcile')
    mocks.falVideoFetch.mockResolvedValue({ status: 'FAILED', error: 'provider failed' })
    mocks.fail.mockRejectedValue(new Error('fail RPC unavailable'))
    await expect(reconcileJobFromFal(job)).rejects.toThrow('fail RPC unavailable')
  })
})
describe('영상 작업의 완료와 실패 상태를 올바르게 기록한다', () => {
  function transitionQuery(result: unknown) {
    const value = { update: vi.fn(), eq: vi.fn(), is: vi.fn(), select: vi.fn(), maybeSingle: vi.fn() }
    value.update.mockReturnValue(value)
    value.eq.mockReturnValue(value)
    value.is.mockReturnValue(value)
    value.select.mockReturnValue(value)
    value.maybeSingle.mockResolvedValue(result)
    return value
  }

  it('완료나 실패를 기록할 수 없으면 오류를 알린다', async () => {
    const generationJobs = await vi.importActual<typeof import('@/lib/generation-jobs')>('@/lib/generation-jobs')
    mocks.from.mockReturnValue(transitionQuery({ data: null, error: new Error('terminal write unavailable') }))

    await expect(generationJobs.completeGenerationJob('job-1', 'https://media.test/video.mp4'))
      .rejects.toThrow('terminal write unavailable')
  })

  it('처리가 끝나지 않은 충돌과 이미 끝난 처리를 구분한다', async () => {
    const generationJobs = await vi.importActual<typeof import('@/lib/generation-jobs')>('@/lib/generation-jobs')
    const casMiss = transitionQuery({ data: null, error: null })
    const currentQueued = transitionQuery({ data: { status: 'queued' }, error: null })
    mocks.from.mockReturnValueOnce(casMiss).mockReturnValueOnce(currentQueued)

    await expect(generationJobs.failGenerationJob('job-1', 'provider failed'))
      .rejects.toBeInstanceOf(generationJobs.GenerationJobTerminalTransitionError)

    const idempotentMiss = transitionQuery({ data: null, error: null })
    const currentCompleted = transitionQuery({
      data: {
        status: 'completed',
        result_url: 'https://media.test/video.mp4',
        error: null,
        last_error: null,
      },
      error: null,
    })
    mocks.from.mockReturnValueOnce(idempotentMiss).mockReturnValueOnce(currentCompleted)
    await expect(generationJobs.completeGenerationJob('job-1', 'https://media.test/video.mp4')).resolves.toBeUndefined()
  })
})
