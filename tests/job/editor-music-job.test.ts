// Editor 음악 만들기 작업 길 — 요청 검사 · 사용자 글 검사 · 기록 → Take → fal 제출 순서 · fal 결과를 보관함에 올려 곡을 끝으로 바꾸기 · 웹훅과 폴링이 소리 주소를 꺼내기 · 목록과 [빼기]를 검사한다 (m1126 E1 · 리드 O2 · O3, 2026-11-26)
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  order: [] as string[],
  requireProjectAccess: vi.fn(),
  checkGenerationCapacity: vi.fn(),
  syncFalKeyLimits: vi.fn(),
  reserveGenerationJob: vi.fn(),
  confirmGenerationJobReceipt: vi.fn(),
  rejectGenerationJobReservation: vi.fn(),
  completeGenerationJob: vi.fn(),
  failGenerationJob: vi.fn(),
  getGenerationJobsByIds: vi.fn(),
  getGenerationJobByRequestId: vi.fn(),
  claimGenerationJobFinalize: vi.fn(async () => true),
  releaseGenerationJobFinalizeClaim: vi.fn(async () => undefined),
  holdTakesForJob: vi.fn(),
  releaseTakesForJob: vi.fn(),
  falKeyById: vi.fn(),
  falMusicSubmit: vi.fn(),
  falMusicFetch: vi.fn(),
  assertUserTextAllowed: vi.fn(),
  recordModerationPass: vi.fn(),
  recordObservability: vi.fn(),
  uploadImmutableObject: vi.fn(),
  from: vi.fn(),
  inserted: [] as Array<{ table: string; row: Record<string, unknown> }>,
  updated: [] as Array<{ table: string; patch: Record<string, unknown>; filters: Array<[string, unknown]> }>,
  rows: {} as Record<string, unknown[]>,
}))

vi.mock('@/lib/demo/guard-server', () => ({ demoWriteBlock: () => null }))
vi.mock('@/lib/api/guard', () => ({ requireProjectAccess: mocks.requireProjectAccess }))
vi.mock('@/lib/generation-quota', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/generation-quota')>()),
  checkGenerationCapacity: mocks.checkGenerationCapacity,
  syncFalKeyLimits: mocks.syncFalKeyLimits,
}))
vi.mock('@/lib/generation-jobs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/generation-jobs')>()),
  reserveGenerationJob: mocks.reserveGenerationJob,
  confirmGenerationJobReceipt: mocks.confirmGenerationJobReceipt,
  rejectGenerationJobReservation: mocks.rejectGenerationJobReservation,
  completeGenerationJob: mocks.completeGenerationJob,
  failGenerationJob: mocks.failGenerationJob,
  getGenerationJobsByIds: mocks.getGenerationJobsByIds,
  getGenerationJobByRequestId: mocks.getGenerationJobByRequestId,
  claimGenerationJobFinalize: mocks.claimGenerationJobFinalize,
  releaseGenerationJobFinalizeClaim: mocks.releaseGenerationJobFinalizeClaim,
  patchGenerationJobResponseSnapshotByRequestId: vi.fn(),
}))
vi.mock('@/lib/billing/take-hold', () => ({
  holdTakesForJob: mocks.holdTakesForJob,
  holdTakesForVideoJob: mocks.holdTakesForJob,
  releaseTakesForJob: mocks.releaseTakesForJob,
}))
vi.mock('@/lib/fal/keys', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/fal/keys')>()),
  falKeyById: mocks.falKeyById,
}))
vi.mock('@/lib/fal/music', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/fal/music')>()),
  falMusicSubmit: mocks.falMusicSubmit,
  falMusicFetch: mocks.falMusicFetch,
}))
vi.mock('@/lib/moderation/creem', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/moderation/creem')>()),
  assertUserTextAllowed: mocks.assertUserTextAllowed,
}))
vi.mock('@/lib/api/moderation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/moderation')>()),
  recordModerationPass: mocks.recordModerationPass,
}))
vi.mock('@/lib/writer/debug-events', () => ({ recordWriterObservabilityEvent: mocks.recordObservability }))
vi.mock('@/lib/storage/immutable-object', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/storage/immutable-object')>()),
  uploadImmutableObject: mocks.uploadImmutableObject,
}))
vi.mock('@/lib/fal/observability', () => ({ buildFalResponseSnapshot: () => ({}) }))
vi.mock('@/lib/fal/webhook-url', () => ({ resolveWebhookUrl: (jobId?: string) => `https://example.test/api/fal/webhook?jobId=${jobId}` }))
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: mocks.from } }))
vi.mock('@/lib/fal/verify-webhook', () => ({ readFalWebhookHeaders: () => ({}), verifyFalWebhook: async () => true }))

import { GET, POST } from '@/app/api/editor/music/route'
import { POST as webhookPOST } from '@/app/api/fal/webhook/route'
import { DELETE } from '@/app/api/editor/music/[id]/route'
import { finalizeGenerationJob, DirectorVideoCompletionPersistenceError, DirectorVideoTerminalError } from '@/lib/fal/finalize'
import { reconcileJobFromFal } from '@/lib/fal/reconcile'
import { extractAudioUrl } from '@/lib/fal/music'
import { editorMusicPath } from '@/lib/editor/music-server'
import { ModerationBlockedError } from '@/lib/moderation/creem'
import { storageKeySegment } from '@/lib/storage/key-segment'
import { IMAGE_JOB_KINDS, VIDEO_JOB_KINDS } from '@/lib/generation-quota'
import { LANE_OF_KIND } from '@/lib/generation-batches'
import type { GenerationJob } from '@/lib/generation-jobs'

const PROJECT = '11111111-2222-4333-8444-555555555555'
const RECEIPT = { decision: 'skipped' as const, id: null, checked_at: '2026-11-26T00:00:00.000Z', chars: 10, text_sha256: null, reason: 'disabled' as const }

/** 표마다 가짜 질의 — 넣기 · 고치기를 적고, 읽기는 mocks.rows 의 행을 돌려준다. */
function table(name: string) {
  const filters: Array<[string, unknown]> = []
  let patch: Record<string, unknown> | null = null
  const q: Record<string, unknown> = {}
  for (const m of ['select', 'order', 'limit', 'is', 'in', 'neq', 'gte']) q[m] = vi.fn(() => q)
  q.eq = vi.fn((col: string, value: unknown) => {
    filters.push([col, value])
    return q
  })
  q.insert = vi.fn((row: Record<string, unknown>) => {
    mocks.inserted.push({ table: name, row })
    mocks.order.push(`insert:${name}`)
    return q
  })
  q.update = vi.fn((p: Record<string, unknown>) => {
    patch = p
    return q
  })
  const rows = () => {
    const all = (mocks.rows[name] ?? []) as Array<Record<string, unknown>>
    return all.filter((row) => filters.every(([col, value]) => row[col] === undefined || row[col] === value))
  }
  q.maybeSingle = vi.fn(async () => ({ data: rows()[0] ?? null, error: null }))
  q.single = vi.fn(async () => ({ data: mocks.inserted.filter((x) => x.table === name).at(-1)?.row ?? rows()[0] ?? null, error: null }))
  ;(q as { then: unknown }).then = (resolve: (v: unknown) => unknown) => {
    if (patch) mocks.updated.push({ table: name, patch, filters: [...filters] })
    return Promise.resolve({ data: patch ? rows().map((r) => ({ id: r.id })) : rows(), error: null }).then(resolve)
  }
  return q
}

function post(body: Record<string, unknown>) {
  return POST(new Request('http://localhost/api/editor/music', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId: PROJECT, ...body }) }))
}

const musicJob = (patch: Partial<GenerationJob> = {}): GenerationJob =>
  ({
    id: 'job-1',
    project_id: PROJECT,
    request_id: 'fal-req-1',
    model: 'fal-ai/elevenlabs/music',
    kind: 'editor_music',
    status: 'queued',
    provider: 'fal',
    target: { workspaceId: 'ws-1', musicId: 'music-1' },
    video_clip_id: null,
    idempotency_key: null,
    result_url: null,
    error: null,
    fal_key_id: 'key-1',
    input_snapshot: {},
    ...patch,
  }) as GenerationJob

beforeEach(() => {
  vi.clearAllMocks()
  vi.unstubAllGlobals()
  mocks.order = []
  mocks.inserted = []
  mocks.updated = []
  mocks.rows = { projects: [{ id: PROJECT, workspace_id: 'ws-1' }] }
  mocks.requireProjectAccess.mockResolvedValue({ ok: true, projectId: PROJECT, userId: 'user-1', viaShare: false })
  mocks.checkGenerationCapacity.mockResolvedValue({ ok: true })
  mocks.assertUserTextAllowed.mockResolvedValue(RECEIPT)
  mocks.reserveGenerationJob.mockImplementation(async (input: { target: { musicId: string } }) => {
    mocks.order.push('reserve')
    return { id: 'job-1', fal_key_id: 'key-1', request_id: 'reserved:job-1', target: input.target }
  })
  mocks.holdTakesForJob.mockImplementation(async () => {
    mocks.order.push('hold')
    return { ok: true, insufficient: false, held: 1, balance: 9, skipped: null }
  })
  mocks.falKeyById.mockImplementation((id: string) => (id === 'key-1' ? { id: 'key-1' } : null))
  mocks.falMusicSubmit.mockImplementation(async () => {
    mocks.order.push('submit')
    return { request_id: 'fal-req-1', model: 'fal-ai/elevenlabs/music', fal_key_id: 'key-1' }
  })
  mocks.confirmGenerationJobReceipt.mockImplementation(async () => {
    mocks.order.push('confirm')
  })
  mocks.from.mockImplementation((name: string) => table(name))
})

describe('같이 정한 것', () => {
  it('음악 만들기 요청은 작업 기록(곡 행 · 생성 작업)을 먼저 남기고 Take 를 묶은 뒤에 fal 로 보낸다', async () => {
    // 왜: 미리보기 영상과 같은 순서(#previz-record-before-submit) — 제출이 먼저면 응답을 잃었을 때 추적 행 없이 fal 비용만 나가고, Take 가 모자란 사람도 비용을 만든다.
    const res = await post({ model: 'elevenlabs-music', prompt: '잔잔한 피아노와 새벽 바다', instrumental: true, durationSec: 45 })
    expect(res.status).toBe(200)
    expect(mocks.order).toEqual(['reserve', 'insert:editor_music', 'hold', 'submit', 'confirm'])
    const reserved = mocks.reserveGenerationJob.mock.calls[0][0] as { kind: string; target: { workspaceId: string; musicId: string }; model: string }
    expect(reserved).toMatchObject({ kind: 'editor_music', model: 'fal-ai/elevenlabs/music', target: { workspaceId: 'ws-1' } })
    const row = mocks.inserted.find((x) => x.table === 'editor_music')?.row
    expect(row).toMatchObject({ id: reserved.target.musicId, project_id: PROJECT, job_id: 'job-1', created_by: 'user-1', model: 'elevenlabs-music', prompt: '잔잔한 피아노와 새벽 바다', instrumental: true, requested_duration_sec: 45, status: 'queued' })
    const body = (await res.json()) as { item: { id: string; status: string; jobId: string } }
    expect(body.item).toMatchObject({ id: reserved.target.musicId, status: 'queued', jobId: 'job-1' })
  })

  it('fal 에는 고른 모델의 입력 그대로, 작업 번호를 심은 웹훅 주소와 예약 행에 적힌 키로 한 번만 보낸다', async () => {
    // 왜: 웹훅이 접수 번호를 놓쳐도 작업 번호로 되찾고(C05), 조회는 제출한 키로만 된다(#fal-key-pool). 제출은 과금이라 다시 보내지 않는다.
    await post({ model: 'minimax-music-2.6', prompt: '시티팝, 80년대, 따뜻한 여자 목소리', instrumental: false, lyrics: '[verse]\n밤바람' })
    const [opts, key] = mocks.falMusicSubmit.mock.calls[0] as [{ endpoint: string; input: Record<string, unknown>; webhookUrl: string }, { id: string }]
    expect(opts.endpoint).toBe('fal-ai/minimax-music/v2.6')
    expect(opts.input).toEqual({ prompt: '시티팝, 80년대, 따뜻한 여자 목소리', is_instrumental: false, lyrics: '[verse]\n밤바람' })
    expect(opts.webhookUrl).toBe('https://example.test/api/fal/webhook?jobId=job-1')
    expect(key).toEqual({ id: 'key-1' })
    expect(mocks.falMusicSubmit).toHaveBeenCalledTimes(1)
  })

  it('분위기 글 · 가사는 모델로 보내기 전에 검사하고, 막히면 작업 기록 · Take · 제출 없이 내용 규칙 안내로 끝난다', async () => {
    // 왜: 이미 있는 약속(정책 문서 "모델에 보내기 전에 본다", src/lib/moderation/creem.ts) — 음악도 사용자가 쓴 글을 fal 로 보낸다.
    mocks.assertUserTextAllowed.mockRejectedValueOnce(new ModerationBlockedError('deny', 'mod-1'))
    const res = await post({ model: 'minimax-music-2.6', prompt: '어두운 신스웨이브 노래', instrumental: false, lyrics: '[verse] 밤' })
    expect(mocks.assertUserTextAllowed).toHaveBeenCalledWith(['어두운 신스웨이브 노래', '[verse] 밤'], expect.objectContaining({ projectId: PROJECT, kind: 'editor_music', userId: 'user-1' }))
    expect(res.status).toBe(400)
    expect(((await res.json()) as { code?: string }).code).toBe('content_policy_blocked')
    expect(mocks.reserveGenerationJob).not.toHaveBeenCalled()
    expect(mocks.holdTakesForJob).not.toHaveBeenCalled()
    expect(mocks.falMusicSubmit).not.toHaveBeenCalled()
  })

  it('fal 이 끝나면 곡 파일을 보관함 {작업 공간}/{프로젝트}/editor/music/{곡}.mp3 에 올리고, 곡을 끝 상태와 그 주소로 바꾼 뒤 작업을 끝낸다', async () => {
    // 왜: fal 주소는 오래 가지 않는다 — 우리 보관함에 두어야 타임라인 조각 · 다른 브라우저가 계속 그 곡을 쓴다(리드 승인 경로).
    vi.stubGlobal('fetch', vi.fn(async () => new Response(Buffer.from('ID3 music bytes'), { status: 200, headers: { 'content-type': 'audio/mpeg' } })))
    const url = await finalizeGenerationJob(musicJob(), { media: 'audio', url: 'https://v3b.fal.media/files/b/music.mp3' })
    const path = `${storageKeySegment('ws-1')}/${storageKeySegment(PROJECT)}/editor/music/music-1.mp3`
    expect(editorMusicPath('ws-1', PROJECT, 'music-1')).toBe(path)
    expect(mocks.uploadImmutableObject).toHaveBeenCalledWith(path, expect.any(Buffer), 'audio/mpeg')
    expect(url).toContain(path)
    const update = mocks.updated.find((x) => x.table === 'editor_music')
    expect(update?.patch).toMatchObject({ status: 'completed', url, error: null })
    expect(update?.filters).toEqual(expect.arrayContaining([['id', 'music-1'], ['project_id', PROJECT]]))
    expect(mocks.completeGenerationJob).toHaveBeenCalledWith('job-1', url)
  })
})

describe('혼자 정한 것', () => {
  it('모델 이름이 틀렸거나 글이 모델 규칙에 맞지 않으면 작업을 만들지 않고 400 으로 그 까닭을 돌려준다', async () => {
    // 왜: 화면 검사를 건너뛴 요청도 서버가 같은 규칙(music-models.ts)으로 막는다 — Take 를 묶었다 돌려주는 헛걸음이 없다.
    expect((await post({ model: 'lyria-3.5', prompt: '피아노', instrumental: true })).status).toBe(400)
    const short = await post({ model: 'minimax-music-2.6', prompt: '짧은 글', instrumental: true })
    expect(short.status).toBe(400)
    expect(((await short.json()) as { error: string }).error).toBe('prompt_short')
    expect(mocks.reserveGenerationJob).not.toHaveBeenCalled()
  })

  it('음악은 사용자당 동시 생성 자리를 이미지 자리(6)와 같이 센다 — 자리가 없으면 작업 없이 429 로 알린다', async () => {
    // 왜: DB 자리 트리거가 영상 두 종류 밖을 모두 이미지 축으로 센다(마이그레이션 없음). 미리 물어 헛 예약을 줄인다.
    mocks.checkGenerationCapacity.mockResolvedValueOnce({ ok: false, scope: 'user', category: 'image', queued: 6, limit: 6 })
    const res = await post({ model: 'elevenlabs-music', prompt: '잔잔한 피아노', instrumental: true, durationSec: 30 })
    expect(mocks.checkGenerationCapacity).toHaveBeenCalledWith('user-1', 'image')
    expect(res.status).toBe(429)
    expect(mocks.reserveGenerationJob).not.toHaveBeenCalled()
  })

  it('생성 작업 종류는 모두 영상 자리나 그림 자리 하나에만 들고 영상 자리는 영상 · 미리보기 영상뿐이라, 음악은 서버 사전 검사 · 채팅 "내 자리" 줄 · DB 자리 트리거 모두에서 그림 자리로 센다', () => {
    // 왜: 리드 답(2026-11-26, 근거 E1) — 트리거는 영상 두 종류 밖을 모두 그림 축으로 센다. 서버 목록이 음악을 빼면 "내 자리"가 남아 보이는데 트리거가 막는다.
    const allKinds = Object.keys(LANE_OF_KIND)
    expect(allKinds).toContain('editor_music')
    expect([...VIDEO_JOB_KINDS].sort()).toEqual(['shot_previz_video', 'shot_video'])
    for (const kind of allKinds) {
      const inVideo = (VIDEO_JOB_KINDS as readonly string[]).includes(kind)
      const inImage = (IMAGE_JOB_KINDS as readonly string[]).includes(kind)
      expect([kind, inVideo !== inImage]).toEqual([kind, true])
    }
    expect(IMAGE_JOB_KINDS).toContain('editor_music')
  })

  it('남의 프로젝트에는 음악을 만들 수 없고 목록도 읽을 수 없다', async () => {
    // 왜: 다른 생성 길과 같은 주인 확인(requireProjectAccess) — 로그인만으로 남의 프로젝트에 Take 를 쓰게 하지 않는다.
    const denied = new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 })
    mocks.requireProjectAccess.mockResolvedValue({ ok: false, response: denied })
    expect((await post({ model: 'elevenlabs-music', prompt: '피아노', instrumental: true })).status).toBe(403)
    expect((await GET(new Request(`http://localhost/api/editor/music?projectId=${PROJECT}`))).status).toBe(403)
    expect(mocks.reserveGenerationJob).not.toHaveBeenCalled()
  })

  it('fal 결과의 audio 가 주소 글이든 파일 칸이든 주소를 꺼내고, 웹훅이 그 주소로 곡을 마무리한다', async () => {
    // 왜: 모델마다 결과 모양이 다르다 — ElevenLabs · MiniMax 는 {audio: {url}}, 같은 fal 계열 예시에는 {audio: "주소"}도 있다(fal 문서).
    expect(extractAudioUrl({ audio: { url: 'https://v3b.fal.media/a.mp3' } })).toBe('https://v3b.fal.media/a.mp3')
    expect(extractAudioUrl({ audio: 'https://v3b.fal.media/b.mp3' })).toBe('https://v3b.fal.media/b.mp3')
    expect(extractAudioUrl({ video: { url: 'https://v3b.fal.media/c.mp4' } })).toBe('')
    mocks.getGenerationJobByRequestId.mockResolvedValueOnce(musicJob())
    vi.stubGlobal('fetch', vi.fn(async () => new Response(Buffer.from('ID3 music bytes'), { status: 200, headers: { 'content-type': 'audio/mpeg' } })))
    const res = await webhookPOST(
      new Request('http://localhost/api/fal/webhook', {
        method: 'POST',
        body: JSON.stringify({ request_id: 'fal-req-1', status: 'OK', payload: { audio: 'https://v3b.fal.media/files/b/music.mp3' } }),
      }),
    )
    expect(res.status).toBe(200)
    expect(mocks.uploadImmutableObject).toHaveBeenCalledTimes(1)
    expect(mocks.completeGenerationJob).toHaveBeenCalledWith('job-1', expect.stringContaining('/editor/music/music-1.mp3'))
  })

  it('폴링이 fal 에 물어 음악 작업이 끝났으면 그 소리 주소로 마무리한다', async () => {
    // 왜: 로컬처럼 웹훅이 없는 곳에서는 화면 폴링(/api/generation-jobs/[id])이 유일한 마무리 길이다.
    mocks.falMusicFetch.mockResolvedValueOnce({ status: 'COMPLETED', url: 'https://v3b.fal.media/files/b/music.mp3', raw: {} })
    vi.stubGlobal('fetch', vi.fn(async () => new Response(Buffer.from('ID3 music bytes'), { status: 200, headers: { 'content-type': 'audio/mpeg' } })))
    const job = await reconcileJobFromFal(musicJob())
    expect(mocks.falMusicFetch).toHaveBeenCalledWith('fal-ai/elevenlabs/music', 'fal-req-1', 'key-1')
    expect(mocks.uploadImmutableObject).toHaveBeenCalledTimes(1)
    expect(job.kind).toBe('editor_music')
  })

  it('fal.media 밖 주소는 내려받지 않고 되돌릴 수 없는 실패로 끝내고, 내려받기가 잠깐 실패하면 실패로 굳히지 않고 다음 웹훅 · 폴링에 맡긴다', async () => {
    // 왜: 우리가 내려받는 곳을 fal 도메인으로 묶는다(#fal-cdn-host, SSRF 방어). 일시 실패는 다시 하면 공짜다(fal 이 이미 만들었다).
    const fetchSpy = vi.fn(async () => new Response('busy', { status: 503 }))
    vi.stubGlobal('fetch', fetchSpy)
    await expect(finalizeGenerationJob(musicJob(), { media: 'audio', url: 'https://evil.example.com/music.mp3' })).rejects.toBeInstanceOf(DirectorVideoTerminalError)
    expect(fetchSpy).not.toHaveBeenCalled()
    await expect(finalizeGenerationJob(musicJob(), { media: 'audio', url: 'https://v3b.fal.media/files/b/music.mp3' })).rejects.toBeInstanceOf(DirectorVideoCompletionPersistenceError)
    expect(mocks.completeGenerationJob).not.toHaveBeenCalled()
  })

  it('목록은 뺀 곡을 빼고 새것이 위이며, 작업이 실패한 곡은 실패와 고칠 수 있는 까닭(내용 규칙 · Take 부족 · 그 밖)으로 보인다', async () => {
    // 왜: 실패를 곡 행에 따로 적지 않아도 작업 장부(generation_jobs)가 진실이다 — 웹훅 · 폴링 · 유령 청소 어느 길로 실패해도 목록이 같다.
    mocks.rows.editor_music = [
      { id: 'm3', project_id: PROJECT, job_id: 'job-3', model: 'minimax-music-2.6', prompt: '어두운 신스웨이브 노래', lyrics: null, instrumental: false, requested_duration_sec: null, url: null, status: 'queued', error: null, created_at: '2026-11-26T10:03:00.000Z', deleted_at: null },
      { id: 'm2', project_id: PROJECT, job_id: 'job-2', model: 'elevenlabs-music', prompt: '잔잔한 피아노', lyrics: null, instrumental: true, requested_duration_sec: 30, url: 'https://media.test/m2.mp3', status: 'completed', error: null, created_at: '2026-11-26T10:02:00.000Z', deleted_at: null },
    ]
    mocks.getGenerationJobsByIds.mockResolvedValueOnce([{ id: 'job-3', status: 'failed', error: '[moderation] content blocked', kind: 'editor_music' }])
    const res = await GET(new Request(`http://localhost/api/editor/music?projectId=${PROJECT}`))
    const body = (await res.json()) as { items: Array<{ id: string; status: string; error: string | null; title: string }> }
    expect(body.items.map((x) => [x.id, x.status, x.error])).toEqual([
      ['m3', 'failed', 'content_policy'],
      ['m2', 'completed', null],
    ])
    expect(body.items[1].title).toBe('잔잔한 피아노')
    const listQuery = mocks.from.mock.results.find((r, i) => mocks.from.mock.calls[i][0] === 'editor_music')?.value as { is: ReturnType<typeof vi.fn>; order: ReturnType<typeof vi.fn> }
    expect(listQuery.is).toHaveBeenCalledWith('deleted_at', null)
    expect(listQuery.order).toHaveBeenCalledWith('created_at', { ascending: false })
  })

  it('[빼기]는 곡 행에 뺀 시각만 찍고 파일은 지우지 않으며, 만드는 중인 곡은 409 로 막는다', async () => {
    // 왜: 이미 타임라인에 놓은 조각이 그 파일을 쓴다. 만드는 중인 곡은 Take 를 묶었고 서버가 만들고 있다.
    mocks.rows.editor_music = [
      { id: 'm2', project_id: PROJECT, status: 'completed', deleted_at: null },
      { id: 'm3', project_id: PROJECT, status: 'queued', deleted_at: null },
    ]
    const del = (id: string) => DELETE(new Request(`http://localhost/api/editor/music/${id}?projectId=${PROJECT}`, { method: 'DELETE' }), { params: Promise.resolve({ id }) })
    expect((await del('m2')).status).toBe(200)
    const update = mocks.updated.find((x) => x.table === 'editor_music')
    expect(Object.keys(update?.patch ?? {})).toEqual(['deleted_at'])
    expect(update?.filters).toEqual(expect.arrayContaining([['id', 'm2'], ['project_id', PROJECT]]))
    expect((await del('m3')).status).toBe(409)
    expect((await del('m9')).status).toBe(404)
  })
})

