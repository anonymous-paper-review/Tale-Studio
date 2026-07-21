import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ uploadImmutableObject: vi.fn(), complete: vi.fn(), fail: vi.fn(), completeJob: vi.fn(), failJob: vi.fn(), patch: vi.fn(), from: vi.fn(), falVideoFetch: vi.fn() }))
vi.mock('@/lib/storage/immutable-object', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/storage/immutable-object')>(),
  uploadImmutableObject: mocks.uploadImmutableObject,
}))
vi.mock('@/lib/director-video-takes', () => ({ completeDirectorVideoAttempt: mocks.complete, markDirectorVideoAttemptFailed: mocks.fail }))
vi.mock('@/lib/generation-jobs', () => ({ completeGenerationJob: mocks.completeJob, failGenerationJob: mocks.failJob, patchGenerationJobResponseSnapshotByRequestId: mocks.patch }))
vi.mock('@/lib/fal/observability', () => ({ buildFalResponseSnapshot: () => ({}) }))
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: mocks.from, storage: { from: mocks.from } } }))
vi.mock('@/lib/artist/portrait', () => ({ cropTurnaroundPortrait: vi.fn() }))
vi.mock('@/lib/storage-thumb', () => ({ uploadThumbnail: vi.fn() }))
vi.mock('@/lib/writer/llm/fal', () => ({ falVideoFetch: mocks.falVideoFetch, falImageFetch: vi.fn() }))

import { finalizeShotVideoJob, readProviderVideoBytes } from '@/lib/fal/finalize'
import { ImmutableObjectMismatchError } from '@/lib/storage/immutable-object'

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
describe('linked director video finalization', () => {
  it('persists an immutable object and dispatches linked completion with the exact key', async () => {
    await expect(finalizeShotVideoJob(job, 'https://fal.media/video.mp4')).resolves.toBe('https://media.test/video.mp4')
    const path = 'workspace-1/project-1/videos/clip-1/job-1.mp4'
    expect(mocks.uploadImmutableObject).toHaveBeenCalledWith(path, expect.any(Buffer), 'video/mp4')
    expect(mocks.complete).toHaveBeenCalledWith('project-1', 'job-1', 'clip-1', 'https://media.test/video.mp4', path)
  })
  it('propagates immutable storage conflicts and does not falsely complete the attempt', async () => {
    mocks.uploadImmutableObject.mockRejectedValue(new ImmutableObjectMismatchError('workspace-1/project-1/videos/clip-1/job-1.mp4', 'content'))
    await expect(finalizeShotVideoJob(job, 'https://fal.media/video.mp4'))
      .rejects.toMatchObject({ code: 'storage_conflict' })
    expect(mocks.complete).not.toHaveBeenCalled()
  })
  it('rejects corrupt provider media before immutable upload', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>error</html>', { headers: { 'content-type': 'text/html' } })))
    await expect(finalizeShotVideoJob(job, 'https://fal.media/video.mp4')).rejects.toThrow('invalid MP4')
    expect(mocks.uploadImmutableObject).not.toHaveBeenCalled()
  })
  it.each([
    ['declared oversize', new Response(responseBody(validMp4), { headers: { 'content-type': 'video/mp4', 'content-length': String(129 * 1024 * 1024) } })],
    ['empty body', new Response(responseBody(Buffer.alloc(0)), { headers: { 'content-type': 'video/mp4' } })],
    ['truncated MP4', new Response(responseBody(Buffer.from([0, 0, 0, 16, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73])), { headers: { 'content-type': 'video/mp4' } })],
  ])('rejects %s before immutable upload', async (_name, response) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response))
    await expect(finalizeShotVideoJob(job, 'https://fal.media/video.mp4'))
      .rejects.toMatchObject({ code: 'invalid_provider_result' })
    expect(mocks.uploadImmutableObject).not.toHaveBeenCalled()
  })

  it('accepts a playable MP4 when its content length is absent', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
      responseBody(validMp4),
      { headers: { 'content-type': 'video/mp4' } },
    )))
    await expect(finalizeShotVideoJob(job, 'https://fal.media/video.mp4')).resolves.toBe('https://media.test/video.mp4')
    expect(mocks.uploadImmutableObject).toHaveBeenCalled()
  })
  it('rejects an ftyp-only MP4 before immutable upload', async () => {
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
  ])('rejects malformed %s before immutable upload', async (_name, bytes) => {
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
  ])('rejects invalid track metadata: %s', async (_name, bytes) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(responseBody(bytes), { headers: { 'content-type': 'video/mp4' } })))
    await expect(finalizeShotVideoJob(job, 'https://fal.media/video.mp4'))
      .rejects.toMatchObject({ code: 'invalid_provider_result' })
    expect(mocks.uploadImmutableObject).not.toHaveBeenCalled()
  })
  it('rejects an inflated fixed-size sample count without uploading', async () => {
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
  it('rejects a top-level box flood before immutable upload', async () => {
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
  it('rejects many mdat ranges with a late invalid sample without uploading', async () => {
    const bytes = manyMdatSamplesFixture(2_000)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
      responseBody(bytes),
      { headers: { 'content-type': 'video/mp4' } },
    )))
    await expect(finalizeShotVideoJob(job, 'https://fal.media/video.mp4'))
      .rejects.toMatchObject({ code: 'invalid_provider_result' })
    expect(mocks.uploadImmutableObject).not.toHaveBeenCalled()
  })
  it('rejects repeated video tracks beyond the aggregate sample budget without uploading', async () => {
    const bytes = repeatedVideoTracksFixture(600_000, 2)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
      responseBody(bytes),
      { headers: { 'content-type': 'video/mp4' } },
    )))
    await expect(finalizeShotVideoJob(job, 'https://fal.media/video.mp4'))
      .rejects.toMatchObject({ code: 'invalid_provider_result' })
    expect(mocks.uploadImmutableObject).not.toHaveBeenCalled()
  })
  it('allows configured local and FAL media origins', async () => {
    const localJob = { ...(job as object), provider: 'local', request_id: 'http://local.test/api/tasks/1' } as never
    await expect(finalizeShotVideoJob(localJob, 'http://local.test/api/tasks/1/output.mp4')).resolves.toBe('https://media.test/video.mp4')
    await expect(finalizeShotVideoJob(job, 'https://v3.fal.media/video.mp4')).resolves.toBe('https://media.test/video.mp4')

    vi.stubEnv('FAL_MEDIA_ALLOWED_HOSTS', 'media.example.test')
    await expect(finalizeShotVideoJob(job, 'https://media.example.test/video.mp4')).resolves.toBe('https://media.test/video.mp4')
  })

  it.each([
    'http://fal.media/video.mp4',
    'https://127.0.0.1/video.mp4',
    'https://evil.test/video.mp4',
    'https://user@fal.media/video.mp4',
    'https://fal.media:8443/video.mp4',
  ])('blocks unsafe FAL media target %s before fetching', async (url) => {
    await expect(finalizeShotVideoJob(job, url)).rejects.toMatchObject({ code: 'invalid_provider_result' })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('blocks local media targets outside the configured origin', async () => {
    const localJob = { ...(job as object), provider: 'local', request_id: 'http://local.test/api/tasks/1' } as never
    await expect(finalizeShotVideoJob(localJob, 'https://local.test/api/tasks/1/output.mp4'))
      .rejects.toMatchObject({ code: 'invalid_provider_result' })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('blocks redirects that leave the approved provider policy', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, {
      status: 302,
      headers: { location: 'https://evil.test/video.mp4' },
    })))
    await expect(finalizeShotVideoJob(job, 'https://fal.media/video.mp4'))
      .rejects.toMatchObject({ code: 'invalid_provider_result' })
    expect(fetch).toHaveBeenCalledTimes(1)
  })
  it('follows approved redirects and cancels each intermediate body', async () => {
    let cancelled = false
    const redirect = new Response(new ReadableStream({ cancel() { cancelled = true } }), {
      status: 302,
      headers: { location: '/video-final.mp4' },
    })
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(redirect)
      .mockResolvedValueOnce(new Response(responseBody(validMp4), { headers: { 'content-type': 'video/mp4' } })))
    await expect(finalizeShotVideoJob(job, 'https://fal.media/video.mp4')).resolves.toBe('https://media.test/video.mp4')
    expect(cancelled).toBe(true)
    expect(fetch).toHaveBeenCalledTimes(2)
  })
  it('rejects redirect budget exhaustion and cancels the final redirect body', async () => {
    let cancellations = 0
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => new Response(
      new ReadableStream({ cancel() { cancellations += 1 } }),
      { status: 302, headers: { location: '/again.mp4' } },
    )))
    await expect(finalizeShotVideoJob(job, 'https://fal.media/video.mp4'))
      .rejects.toMatchObject({ code: 'invalid_provider_result' })
    expect(cancellations).toBe(4)
  })
  it('cancels a non-success response body before terminalizing it', async () => {
    let cancelled = false
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
      new ReadableStream({ cancel() { cancelled = true } }),
      { status: 404 },
    )))
    await expect(finalizeShotVideoJob(job, 'https://fal.media/video.mp4'))
      .rejects.toMatchObject({ code: 'provider_fetch_terminal' })
    expect(cancelled).toBe(true)
  })

  it('aborts a stalled total video download deadline as retryable', async () => {
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
  it('cancels a body that stalls after headers at the download deadline', async () => {
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
  ])('rejects streamed %s content-length overruns at the configured byte limit', async (_name, contentLength) => {
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

  it('classifies immutable conflicts and explicit database failures as terminal', async () => {
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
  ])('keeps transient storage status %s=%s retryable', async (field, status) => {
    mocks.uploadImmutableObject.mockRejectedValue(Object.assign(new Error('storage transient'), { [field]: status }))
    await expect(finalizeShotVideoJob(job, 'https://fal.media/video.mp4'))
      .rejects.toMatchObject({ code: 'storage_retryable' })
  })
  it('keeps unknown persistence failures retryable after immutable upload', async () => {
    mocks.complete.mockRejectedValue(new Error('complete RPC failed'))
    await expect(finalizeShotVideoJob(job, 'https://fal.media/video.mp4'))
      .rejects.toMatchObject({ code: 'database_retryable' })
  })
})
describe('linked reconcile boundaries', () => {
  it('dispatches linked provider failure through the video-attempt RPC', async () => {
    const { reconcileJobFromFal } = await import('@/lib/fal/reconcile')
    mocks.falVideoFetch.mockResolvedValue({ status: 'FAILED', error: 'provider failed' })
    await expect(reconcileJobFromFal(job)).resolves.toMatchObject({ status: 'failed', error: 'provider failed' })
    expect(mocks.fail).toHaveBeenCalledWith('project-1', 'job-1', 'provider failed')
  })
  it('reconciles a linked local result through the Director completion dispatcher', async () => {
    const { reconcileJobFromFal } = await import('@/lib/fal/reconcile')
    const localJob = { ...(job as object), provider: 'local', request_id: 'http://local.test/api/output.mp4' } as never
    await expect(reconcileJobFromFal(localJob)).resolves.toMatchObject({
      status: 'completed',
      result_url: 'https://media.test/video.mp4',
    })
    expect(mocks.complete).toHaveBeenCalledWith(
      'project-1',
      'job-1',
      'clip-1',
      'https://media.test/video.mp4',
      'workspace-1/project-1/videos/clip-1/job-1.mp4',
    )
  })
  it('reconciles an unlinked local result through the generic completion dispatcher', async () => {
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
  it('terminalizes an invalid unlinked local result through the generic failure dispatcher', async () => {
    const { reconcileJobFromFal } = await import('@/lib/fal/reconcile')
    const localJob = {
      ...(job as object),
      provider: 'local',
      request_id: 'not a URL',
      video_clip_id: null,
      target: {},
    } as never
    await expect(reconcileJobFromFal(localJob)).resolves.toMatchObject({ status: 'failed' })
    expect(mocks.failJob).toHaveBeenCalledWith('job-1', 'local video job has no valid result URL')
  })
  it.each([
    'https://evil.test/output.mp4',
    'ftp://local.test/output.mp4',
    'http://user@local.test/output.mp4',
  ])('terminalizes unlinked local results outside the configured origin: %s', async (requestId) => {
    const { reconcileJobFromFal } = await import('@/lib/fal/reconcile')
    const localJob = {
      ...(job as object),
      provider: 'local',
      request_id: requestId,
      video_clip_id: null,
      target: {},
    } as never
    await expect(reconcileJobFromFal(localJob)).resolves.toMatchObject({ status: 'failed' })
    expect(mocks.failJob).toHaveBeenCalledWith('job-1', 'local video job has no valid result URL')
  })
  it('terminalizes a permanent linked provider lookup error through the attempt RPC', async () => {
    const { reconcileJobFromFal } = await import('@/lib/fal/reconcile')
    mocks.falVideoFetch.mockRejectedValue(Object.assign(new Error('provider request invalid'), { status: 400 }))
    await expect(reconcileJobFromFal(job)).resolves.toMatchObject({ status: 'failed', error: 'provider request invalid' })
    expect(mocks.fail).toHaveBeenCalledWith('project-1', 'job-1', 'provider request invalid')
  })

  it('retains queued state for unclassified provider lookup errors', async () => {
    const { reconcileJobFromFal } = await import('@/lib/fal/reconcile')
    mocks.falVideoFetch.mockRejectedValue(new Error('provider lookup unavailable'))
    await expect(reconcileJobFromFal(job)).resolves.toBe(job)
    expect(mocks.fail).not.toHaveBeenCalled()
  })

  it('retains queued state after a transient provider fetch failure', async () => {
    const { reconcileJobFromFal } = await import('@/lib/fal/reconcile')
    mocks.falVideoFetch.mockRejectedValue(new TypeError('temporary provider outage'))
    await expect(reconcileJobFromFal(job)).resolves.toBe(job)
  })

  it('propagates terminal linked failure persistence errors', async () => {
    const { reconcileJobFromFal } = await import('@/lib/fal/reconcile')
    mocks.falVideoFetch.mockResolvedValue({ status: 'FAILED', error: 'provider failed' })
    mocks.fail.mockRejectedValue(new Error('fail RPC unavailable'))
    await expect(reconcileJobFromFal(job)).rejects.toThrow('fail RPC unavailable')
  })
})
describe('generation job terminal transitions', () => {
  function transitionQuery(result: unknown) {
    const value = { update: vi.fn(), eq: vi.fn(), is: vi.fn(), select: vi.fn(), maybeSingle: vi.fn() }
    value.update.mockReturnValue(value)
    value.eq.mockReturnValue(value)
    value.is.mockReturnValue(value)
    value.select.mockReturnValue(value)
    value.maybeSingle.mockResolvedValue(result)
    return value
  }

  it('surfaces database write errors from terminal transitions', async () => {
    const generationJobs = await vi.importActual<typeof import('@/lib/generation-jobs')>('@/lib/generation-jobs')
    mocks.from.mockReturnValue(transitionQuery({ data: null, error: new Error('terminal write unavailable') }))

    await expect(generationJobs.completeGenerationJob('job-1', 'https://media.test/video.mp4'))
      .rejects.toThrow('terminal write unavailable')
  })

  it('distinguishes a non-terminal CAS miss from an idempotent terminal outcome', async () => {
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
