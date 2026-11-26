// 실사 가운데 장 화살표 고치기(N4b)의 서버 — 저장(새 판 · 새 파일) · 밑층(Grok) · 읽기(실사판) · 끝 장 작업(GPT Image 2, 실사 작업 종류) · 완료 처리 · 거절 — 를 검사한다
import sharp from 'sharp'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  reserve: vi.fn(),
  confirm: vi.fn(),
  reject: vi.fn(),
  complete: vi.fn(),
  submit: vi.fn(),
  assertUserTextAllowed: vi.fn(),
  deriveEnBatch: vi.fn(),
  upload: vi.fn(),
  thumb: vi.fn(),
  generateReservedImage: vi.fn(),
  readMarks: vi.fn(),
  photoLook: vi.fn(),
  cancelled: vi.fn(),
  getUser: vi.fn(),
  owns: vi.fn(),
}))
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: mocks.from } }))
vi.mock('@/lib/supabase/auth', () => ({ getUser: mocks.getUser }))
vi.mock('@/lib/generation-jobs', () => ({
  reserveGenerationJob: mocks.reserve,
  confirmGenerationJobReceipt: mocks.confirm,
  rejectGenerationJobReservation: mocks.reject,
  completeGenerationJob: mocks.complete,
  userOwnsProject: mocks.owns,
}))
vi.mock('@/lib/writer/llm/fal', () => ({ falImageSubmit: mocks.submit }))
vi.mock('@/lib/fal/webhook-url', () => ({ resolveWebhookUrl: (jobId?: string) => `https://hook.test/fal?jobId=${jobId}` }))
vi.mock('@/lib/moderation/creem', () => ({ assertUserTextAllowed: mocks.assertUserTextAllowed, moderatedSubmitInput: (input: unknown) => input }))
vi.mock('@/lib/api/moderation', () => ({ recordModerationPass: () => {}, moderationRejectionResponse: () => null }))
vi.mock('@/lib/api/quota', () => ({ capacityReservationRejection: () => null }))
vi.mock('@/lib/writer/i18n/derive-en', () => ({ deriveEnBatch: mocks.deriveEnBatch }))
vi.mock('@/lib/storage/media', () => ({
  mediaPathFromUrl: (url: string) => (url.startsWith('https://media.test/') ? url.replace('https://media.test/', '').split('?')[0] : null),
  mediaPublicUrl: (path: string) => `https://media.test/${path}`,
  mediaUpload: mocks.upload,
}))
vi.mock('@/lib/storage-thumb', () => ({ uploadThumbnail: mocks.thumb }))
vi.mock('@/lib/fal/generate-image', () => ({ generateReservedImage: mocks.generateReservedImage }))
vi.mock('@/lib/writer/direction-read-vlm', () => ({ readDirectionMarks: mocks.readMarks }))
vi.mock('@/lib/style-facets/photo-look', () => ({ resolvePhotoLook: mocks.photoLook }))
vi.mock('@/lib/director/job-cancellations', () => ({ cancelledJobsById: async (ids: string[]) => new Map(ids.filter((id) => mocks.cancelled(id)).map((id) => [id, 'now'])), isJobCancelled: async (id: string) => !!mocks.cancelled(id) }))
// 실사 시트 쓰기는 rev 비교 쓰기 한 곳(updateStoryboardImage)만 거친다 — 시험에서는 바꾸는 함수를 지금 행에 그대로 적용한다.
vi.mock('@/lib/director/storyboard-image-store', () => ({
  updateStoryboardImage: async (_p: string, _s: string, change: (current: unknown) => unknown) => {
    const next = change(structuredClone(shotRow.storyboard_image))
    if (next) shotRow.storyboard_image = next
    return next
  },
}))

import { finalizeRealEndFrameJob, keepRealDirectionLine, readRealDirection, redrawRealEndFrame, saveRealDirectingFrame, separateRealArrowLayer } from '@/lib/storyboard/real-directing-edit'
import { POST } from '@/app/api/storyboard/real-directing-edit/route'
import { REAL_STRIP_ARROWS_PROMPT } from '@/lib/storyboard/real-arrow-prompts'
import { currentStoryboardVersion, storyboardImageVersions } from '@/lib/director/storyboard-image-versions'
import { freshDirectionRead } from '@/lib/writer/direction-read'
import { PHOTO_TEXTURE_PEOPLE } from '@/lib/style-facets/photo-sheet-line'
import type { GenerationJob } from '@/lib/generation-jobs'

// 이 시험을 위해 지은 샷 — 실사 시트 v1(완료, 세 장, 러프 시각 500), 행동 글 · 카메라 무브가 있는 샷 설계. 프로젝트 = 작업 공간 ws-1 · p1.
const WS = 'ws-1'
const PROJECT = '00000000-0000-4000-8000-000000000001'
const B = `https://media.test/${WS}/${PROJECT}/shots`
const V1 = { start: `${B}/a_g1_storyboard_start.png?v=1`, direction: `${B}/a_g1_storyboard_direction.png?v=1`, end: `${B}/a_g1_storyboard_end.png?v=1` }
const LINE = 'She stands and walks out of frame to the right.'
const LINE_KO = '그녀가 일어나 오른쪽으로 나간다.'
let shotRow: Record<string, unknown>
let project: Record<string, unknown>
let jobs: Array<Record<string, unknown>>
let fetched: string[]

function query(table: string) {
  const q: Record<string, unknown> = {}
  q.select = () => q
  q.eq = () => q
  q.in = () => q
  q.maybeSingle = async () => ({ data: table === 'shots' ? structuredClone(shotRow) : table === 'projects' ? project : table === 'generation_jobs' ? (jobs[0] ?? null) : null, error: null })
  q.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
    Promise.resolve({ data: table === 'generation_jobs' ? jobs : [], error: null }).then(resolve, reject)
  return q
}
async function png(width: number, height: number) {
  const raw = Buffer.alloc(width * height * 3)
  let seed = width * 7 + height
  for (let i = 0; i < raw.length; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff
    raw[i] = (seed >> 16) & 255
  }
  return sharp(raw, { raw: { width, height, channels: 3 } }).png().toBuffer()
}
let drawnPng: Buffer
let framePng: Buffer
const dataUrl = () => `data:image/png;base64,${framePng.toString('base64')}`
const current = () => shotRow.storyboard_image as Record<string, unknown>

beforeEach(async () => {
  for (const fn of Object.values(mocks)) fn.mockReset()
  framePng = await png(220, 392)
  drawnPng = await png(720, 1280)
  jobs = []
  fetched = []
  project = { workspace_id: WS, style_anchor_key: 'real', custom_style_anchor: null }
  shotRow = {
    storyboard_image: { url: V1.start, status: 'completed', errorMessage: null, generatedAt: 10, frames: { ...V1 }, roughGeneratedAt: 500 },
    duration_seconds: 5,
    characters: ['mina'],
    action_description: '미나가 사물함 앞에서 문 쪽으로 돌아선다. 카메라가 천천히 다가간다.',
    dynamic_spec: { camera_motion: { type: 'dolly_in', direction: 'forward', speed: 'slow' }, motion_prompt: 'Mina turns toward the door.' },
  }
  mocks.from.mockImplementation((table: string) => query(table))
  mocks.reserve.mockResolvedValue({ id: 'job-1', fal_key_id: 'key-a', project_id: PROJECT })
  mocks.submit.mockResolvedValue({ request_id: 'req-1', model: 'openai/gpt-image-2/edit', fal_request: {}, fal_key_id: 'key-a' })
  mocks.assertUserTextAllowed.mockResolvedValue({ receipt: 'ok' })
  mocks.upload.mockResolvedValue({ error: null })
  mocks.generateReservedImage.mockResolvedValue({ url: 'https://fal.test/clean.png' })
  mocks.readMarks.mockResolvedValue({ en: LINE, ko: LINE_KO })
  mocks.photoLook.mockResolvedValue(null)
  mocks.cancelled.mockReturnValue(false)
  mocks.deriveEnBatch.mockImplementation(async (items: Array<{ id: string }>) => new Map(items.map((item) => [item.id, 'She sits back down on the bench.'])))
  mocks.getUser.mockResolvedValue({ id: 'user-1' })
  mocks.owns.mockResolvedValue(true)
  vi.stubGlobal('fetch', vi.fn(async (input: unknown) => {
    const url = String(input)
    fetched.push(url)
    const buf = url.startsWith('https://fal.test/') ? drawnPng : framePng
    return new Response(new Uint8Array(buf), { status: 200, headers: { 'content-type': 'image/png' } })
  }))
})
afterEach(() => vi.unstubAllGlobals())

const uploadedPaths = () => mocks.upload.mock.calls.map((call) => call[0] as string)
const reserved = () => mocks.reserve.mock.calls[0][0] as { kind: string; model: string; inputSnapshot: { prompt: string; image_urls: string[] }; target: Record<string, unknown> }
const submitted = () => mocks.submit.mock.calls[0][0] as { model: string; prompt: string; reference_image_urls: string[]; image_size: string; webhookUrl: string }

describe('화살표 저장', () => {
  // 왜(리드 D1 A): 고친 가운데 장은 새 판이 되고 고치기 전 판은 남는다 — 옛 판이 가리키는 그림 파일을 덮으면 지난 판이 고친 그림으로 바뀐다.
  it('실사 가운데 장 저장은 새 파일에 올리고 새 판을 지금 그림으로 만들며 옛 판의 그림 파일을 덮지 않는다', async () => {
    const result = await saveRealDirectingFrame(PROJECT, 'sh_1', dataUrl(), 'ko', { expectDirection: V1.direction })
    const [path] = uploadedPaths()
    expect(path).toMatch(new RegExp(`^${WS}/${PROJECT}/shots/v1-[0-9a-f]{64}_a[0-9a-f-]{36}_storyboard_direction\\.png$`))
    expect(path).not.toBe(V1.direction.replace('https://media.test/', '').split('?')[0])
    expect(mocks.thumb).toHaveBeenCalledWith(path, expect.any(Buffer))
    const now = currentStoryboardVersion(current() as never)!
    expect(now.id).toBe(result.versionId)
    expect(result.versionId).toMatch(/^arrows-/)
    expect(current().frames).toEqual({ start: V1.start, direction: result.url, end: V1.end })
    expect(storyboardImageVersions(current() as never).map((v) => v.n)).toEqual([1, 2])
  })

  // 왜(혼자 정한 것 g): 그 샷 실사를 그리는 중(끝 장 포함)에 또 저장하면 끝 장이 엉뚱한 판에 끼거나 새 판의 끝 장이 옛 줄로 그려진다.
  it('그 샷 실사를 그리는 중이면 화살표 저장 · 끝 장 다시 그리기를 거절하고 아무것도 바꾸지 않는다', async () => {
    jobs = [{ id: 'job-full', kind: 'shot_storyboard', target: { writerShotId: 'sh_1', gridVariant: 'strip1' }, created_at: new Date().toISOString() }]
    await expect(saveRealDirectingFrame(PROJECT, 'sh_1', dataUrl(), 'en')).rejects.toMatchObject({ name: 'RealShotBusyError' })
    await expect(redrawRealEndFrame(PROJECT, 'sh_1', 'en', { userId: 'user-1' })).rejects.toMatchObject({ name: 'RealShotBusyError' })
    expect(mocks.upload).not.toHaveBeenCalled()
    expect(mocks.reserve).not.toHaveBeenCalled()
    expect(current().frames).toEqual(V1)
    // 화면에서 멈춘 작업은 세지 않는다(다시 만들 수 있다).
    mocks.cancelled.mockImplementation((id: string) => id === 'job-full')
    await expect(saveRealDirectingFrame(PROJECT, 'sh_1', dataUrl(), 'en')).resolves.toMatchObject({ versionId: expect.stringMatching(/^arrows-/) })
  })

  // 왜: 다른 창에서 다른 판을 고르는 사이 저장하면 다른 판의 가운데 장 위에 그린 그림이 지금 판의 시작 · 끝과 짝지어진다.
  it('화면이 고친 가운데 장과 지금 가운데 장이 다르면 저장하지 않는다', async () => {
    await expect(saveRealDirectingFrame(PROJECT, 'sh_1', dataUrl(), 'en', { expectDirection: `${B}/older.png` })).rejects.toMatchObject({ name: 'StaleDirectionError' })
    expect(mocks.upload).not.toHaveBeenCalled()
  })
})

describe('밑층(층 나누기)', () => {
  // 왜(혼자 정한 것 d): 실사 가운데 장은 시작 장과 화소가 달라, 그 장에서 화살표 · 글씨만 지운 밑층이어야 긁은 자리가 맞는다. 같은 장이면 그림 값을 다시 쓰지 않는다.
  it('밑층은 Grok 이 실사 가운데 장에서 화살표만 지운 그림이고, 같은 가운데 장이면 다시 그리지 않는다', async () => {
    const first = await separateRealArrowLayer(PROJECT, 'sh_1', 'en', { expectDirection: V1.direction, userId: 'user-1' })
    expect(first.cached).toBe(false)
    const call = mocks.generateReservedImage.mock.calls[0][0] as { model: string; prompt: string; reference_image_urls: string[] }
    expect(call).toMatchObject({ model: 'xai/grok-imagine-image/edit', prompt: REAL_STRIP_ARROWS_PROMPT, reference_image_urls: [V1.direction] })
    expect(uploadedPaths()[0]).toBe(`${WS}/${PROJECT}/shots/a_g1_storyboard_direction_clean.png`)
    expect(current().cleanDirection).toEqual({ url: first.cleanUrl, direction: V1.direction })
    // 다른 그림 파일 크기로 맞춰 올린다(편집기 위층과 같은 자리).
    const uploaded = mocks.upload.mock.calls[0][1] as Buffer
    expect(await sharp(uploaded).metadata()).toMatchObject({ width: 220, height: 392 })
    const again = await separateRealArrowLayer(PROJECT, 'sh_1', 'en', { expectDirection: V1.direction })
    expect(again).toEqual({ cleanUrl: first.cleanUrl, cached: true })
    expect(mocks.generateReservedImage).toHaveBeenCalledTimes(1)
  })
})

describe('끝 장 다시 그리기', () => {
  async function arrowSaved() {
    const saved = await saveRealDirectingFrame(PROJECT, 'sh_1', dataUrl(), 'en')
    mocks.upload.mockClear()
    return saved
  }

  // 왜(같이 정한 것 · 혼자 정한 것 c): 끝 장은 오너가 고른 ②(시작 장 + 읽은 줄, GPT Image 2)로 그리고, 실사 작업 종류로 내야 같은 샷 실사 작업이 하나만 돌고(DB 트리거)
  //   카드 · 노드 기다림 · 끝난 뒤 다시 읽기가 지금 길 그대로 걸린다. 그 판 · 가운데 장 · 줄을 작업에 적어야 완료 처리가 그 판에 넣는다. 영상은 만들지 않는다(그림 작업 하나).
  it('실사 끝 장 다시 그리기는 실사판 읽기로 읽은 줄과 시작 장으로 GPT Image 2 작업을 실사 작업 종류로 내고 그 판 · 가운데 장 · 줄을 작업에 적는다', async () => {
    const saved = await arrowSaved()
    const result = await redrawRealEndFrame(PROJECT, 'sh_1', 'en', { userId: 'user-1' })
    expect(mocks.readMarks).toHaveBeenCalledWith(V1.start, saved.url, 'real')
    expect(result).toMatchObject({ jobId: 'job-1', replayed: false, read: { en: LINE, ko: LINE_KO, source: 'ai', direction: saved.url } })
    expect(reserved()).toMatchObject({
      kind: 'shot_storyboard',
      model: 'openai/gpt-image-2/edit',
      target: { workspaceId: WS, writerShotId: 'sh_1', realEnd: { versionId: saved.versionId, direction: saved.url, line: LINE } },
    })
    expect(submitted()).toMatchObject({ model: 'openai/gpt-image-2/edit', reference_image_urls: [V1.start], webhookUrl: 'https://hook.test/fal?jobId=job-1' })
    expect(submitted().prompt).toContain(LINE)
    // 다른 두 장 비율(220×392)로 시킨다.
    const [w, h] = submitted().image_size.split('x').map(Number)
    expect(Math.abs(w / h - 220 / 392)).toBeLessThan(0.02)
    // 읽은 줄은 실사 시트에 남는다(편집기 아래 · 영상이 쓴다).
    expect(freshDirectionRead(current())).toMatchObject({ en: LINE, endDrawn: null })
    expect(mocks.confirm).toHaveBeenCalledWith('job-1', PROJECT, expect.anything())
  })

  // 왜(같이 정한 것): 샷 설계의 옛 움직임 글은 고친 화살표와 다툰다 — 지시문에는 읽은 줄만, 내용 검사도 그 줄만 거친다(10/11 약속).
  it('실사 끝 장 지시는 샷 설계의 옛 움직임 글을 싣지 않고 읽은 줄만 내용 검사를 거친다', async () => {
    await arrowSaved()
    await redrawRealEndFrame(PROJECT, 'sh_1', 'en', { userId: 'user-1' })
    expect(submitted().prompt).not.toMatch(/turns toward the door|dolly|사물함/)
    expect(mocks.assertUserTextAllowed).toHaveBeenCalledWith([LINE], expect.objectContaining({ kind: 'shot_storyboard' }))
  })

  // 왜(같이 정한 것 · 리드 "실사 그림체를 지킨다"): 실사 그림체는 끝 장도 실제 사진이어야 세 장이 어긋나지 않는다 — main 실사 지시문의 사진 글을 싣는다.
  it('실사 그림체 프로젝트의 끝 장 작업 지시문은 실제 사진 문장과 그 그림체 색감 문장을 싣는다', async () => {
    mocks.photoLook.mockResolvedValue({ key: 'real', clause: 'Cool fluorescent subway light.' })
    await arrowSaved()
    await redrawRealEndFrame(PROJECT, 'sh_1', 'en', { userId: 'user-1' })
    expect(mocks.photoLook).toHaveBeenCalledWith(expect.objectContaining({ style_anchor_key: 'real' }))
    expect(submitted().prompt).toContain(PHOTO_TEXTURE_PEOPLE)
    expect(submitted().prompt).toContain('Cool fluorescent subway light.')
  })

  // 왜(혼자 정한 것 k): 줄 없이 그리면 ② 가 아니다 — 못 읽었으면 그림 값을 쓰지 않고 화면이 줄을 직접 적게 한다.
  it('읽는 AI 가 화살표를 못 읽었으면 끝 장을 그리지 않고 못 읽었다고 알린다', async () => {
    await arrowSaved()
    mocks.readMarks.mockResolvedValue(null)
    await expect(redrawRealEndFrame(PROJECT, 'sh_1', 'en', { userId: 'user-1' })).rejects.toMatchObject({ name: 'DirectionUnreadableError' })
    expect(mocks.reserve).not.toHaveBeenCalled()
  })

  // 왜(혼자 정한 것 l): 사람이 고친 줄을 다시 읽으면 고친 것이 사라진다 — 고친 줄(한국어면 영어로 옮김)로 그리고 사람이 고친 줄로 남긴다.
  it('사람이 고친 줄로 다시 그리면 다시 읽지 않고 그 줄을 영어로 옮겨 그리며 고친 줄로 남긴다', async () => {
    await arrowSaved()
    await redrawRealEndFrame(PROJECT, 'sh_1', 'ko', { userId: 'user-1', line: { text: '그녀가 다시 벤치에 앉는다.', lang: 'ko' } })
    expect(mocks.readMarks).not.toHaveBeenCalled()
    expect(submitted().prompt).toContain('She sits back down on the bench.')
    expect(freshDirectionRead(current())).toMatchObject({ en: 'She sits back down on the bench.', ko: '그녀가 다시 벤치에 앉는다.', source: 'user' })
  })

  // 왜(혼자 정한 것 l · 리드 (A) 결): [그대로]는 끝 장을 그리지 않고 고친 줄만 남긴다 — 영상이 그 줄을 쓴다. 그림 값이 들지 않는다.
  it('물음 창 [그대로]는 끝 장을 그리지 않고 고친 줄만 실사 시트에 남긴다', async () => {
    const saved = await arrowSaved()
    const kept = await keepRealDirectionLine(PROJECT, 'sh_1', { text: 'She stays seated.', lang: 'en' }, 'en', { expectDirection: saved.url })
    expect(kept).toMatchObject({ en: 'She stays seated.', source: 'user', direction: saved.url })
    expect(freshDirectionRead(current())?.en).toBe('She stays seated.')
    expect(mocks.reserve).not.toHaveBeenCalled()
    await expect(keepRealDirectionLine(PROJECT, 'sh_1', { text: 'x', lang: 'en' }, 'en', { expectDirection: V1.direction })).rejects.toMatchObject({ name: 'StaleDirectionError' })
  })

  // 왜(혼자 정한 것 c): 두 번 눌러도 같은 끝 장에 그림 값이 두 번 들지 않게 — 그 샷의 실사 끝 장 작업이 돌고 있으면 그 작업 번호를 돌려준다.
  it('그 샷의 실사 끝 장 작업이 돌고 있으면 새로 내지 않고 그 작업 번호를 돌려준다', async () => {
    await arrowSaved()
    jobs = [{ id: 'job-end', kind: 'shot_storyboard', target: { writerShotId: 'sh_1', realEnd: { versionId: 'x', direction: 'y', line: LINE } }, created_at: new Date().toISOString() }]
    await expect(redrawRealEndFrame(PROJECT, 'sh_1', 'en', { userId: 'user-1' })).resolves.toMatchObject({ jobId: 'job-end', replayed: true })
    expect(mocks.reserve).not.toHaveBeenCalled()
  })

  // 왜: 실사 시트가 세 장이 아니면(올린 한 장 · 아직 안 그림) 고칠 가운데 장이 없다 — 그림 값을 쓰기 전에 거절한다.
  it('지금 그림이 세 장 실사가 아니면 저장 · 밑층 · 끝 장 다시 그리기를 거절한다', async () => {
    shotRow.storyboard_image = { url: `${B}/up.png`, status: 'completed', errorMessage: null, generatedAt: 1 }
    await expect(saveRealDirectingFrame(PROJECT, 'sh_1', dataUrl(), 'en')).rejects.toMatchObject({ name: 'RealFramesMissingError' })
    await expect(separateRealArrowLayer(PROJECT, 'sh_1', 'en')).rejects.toMatchObject({ name: 'RealFramesMissingError' })
    await expect(redrawRealEndFrame(PROJECT, 'sh_1', 'en', {})).rejects.toMatchObject({ name: 'RealFramesMissingError' })
    await expect(readRealDirection(PROJECT, 'sh_1')).resolves.toBeNull()
    expect(mocks.generateReservedImage).not.toHaveBeenCalled()
    expect(mocks.reserve).not.toHaveBeenCalled()
  })
})

describe('끝 장 끼우기(완료 처리)', () => {
  async function drawnJob(): Promise<GenerationJob> {
    await saveRealDirectingFrame(PROJECT, 'sh_1', dataUrl(), 'en')
    await redrawRealEndFrame(PROJECT, 'sh_1', 'en', { userId: 'user-1' })
    mocks.upload.mockClear()
    return { id: 'job-1', project_id: PROJECT, kind: 'shot_storyboard', target: reserved().target, fal_key_id: 'key-a' } as unknown as GenerationJob
  }

  // 왜(리드 D1 A): 끝 장은 고친 판에 넣는다 — 새 판을 하나 더 만들지 않는다. 다른 두 장 크기로 맞추고 작업마다 새 파일에 올린다(옛 판 그림을 덮지 않게).
  it('끝 장 작업이 끝나면 그 판의 끝 장만 바꾸고 새 판을 만들지 않으며 그 줄로 그렸다는 표시를 남긴다', async () => {
    const job = await drawnJob()
    const before = storyboardImageVersions(current() as never).length
    const url = await finalizeRealEndFrameJob(job, 'https://fal.test/end.png', { stopped: false })
    const [path] = uploadedPaths()
    expect(path).toMatch(new RegExp(`^${WS}/${PROJECT}/shots/v1-[0-9a-f]{64}_gjob-1_storyboard_end\\.png$`))
    expect(await sharp(mocks.upload.mock.calls[0][1] as Buffer).metadata()).toMatchObject({ width: 220, height: 392 })
    expect(storyboardImageVersions(current() as never)).toHaveLength(before)
    expect((current().frames as { end: string }).end).toBe(url)
    expect((current().frames as { start: string }).start).toBe(V1.start)
    expect(freshDirectionRead(current())).toMatchObject({ en: LINE, endDrawn: url })
    expect(mocks.complete).toHaveBeenCalledWith('job-1', url)
  })

  // 왜(혼자 정한 것 j): 사람이 [멈추기]로 멈춘 끝 장은 끼우지 않는다 — 끝 장은 그대로이고 작업은 실패로 끝나 화면이 "그대로예요"를 알린다.
  it('[멈추기]로 멈춘 끝 장 작업은 끼우지 않는다', async () => {
    const job = await drawnJob()
    const frames = structuredClone(current().frames)
    await expect(finalizeRealEndFrameJob(job, 'https://fal.test/end.png', { stopped: true })).rejects.toThrow(/stopped/)
    expect(current().frames).toEqual(frames)
    expect(mocks.upload).not.toHaveBeenCalled()
    expect(mocks.complete).not.toHaveBeenCalled()
  })

  // 왜(혼자 정한 것 i): 그리는 사이 그 판의 가운데 장이 바뀌었으면(다시 고침 · 판이 없어짐) 옛 줄의 끝 장을 붙이지 않는다.
  it('끝 장이 오기 전에 그 판이 바뀌었으면 끼우지 않고 작업은 실패로 끝난다', async () => {
    const job = await drawnJob()
    const target = job.target as { realEnd: { versionId: string; direction: string; line: string } }
    const changed = { ...job, target: { ...job.target, realEnd: { ...target.realEnd, direction: `${B}/other.png` } } } as GenerationJob
    await expect(finalizeRealEndFrameJob(changed, 'https://fal.test/end.png', { stopped: false })).rejects.toThrow(/changed/)
    expect(mocks.complete).not.toHaveBeenCalled()
  })
})

describe('실사 화살표 요청 길', () => {
  const post = (body: Record<string, unknown>) => POST(new Request('http://localhost/api/storyboard/real-directing-edit', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }))

  // 왜: 실사 시트를 바꾸는 길이다 — 로그인하고 그 프로젝트 주인일 때만 받는다(콘티 길과 같다).
  it('실사 화살표 요청은 로그인한 프로젝트 주인만 받는다', async () => {
    mocks.getUser.mockResolvedValue(null)
    expect((await post({ action: 'read-direction', projectId: PROJECT, shotId: 'sh_1' })).status).toBe(401)
    mocks.getUser.mockResolvedValue({ id: 'user-2' })
    mocks.owns.mockResolvedValue(false)
    expect((await post({ action: 'read-direction', projectId: PROJECT, shotId: 'sh_1' })).status).toBe(403)
  })

  // 왜(혼자 정한 것 g · k): 화면이 까닭을 사람 말로 알리고(그리는 중 · 못 읽음) [다시 시도]를 달 수 있게 까닭 표시를 같이 준다.
  it('그리는 중이면 까닭 표시 busy, 못 읽었으면 direction_unreadable 로 답한다', async () => {
    jobs = [{ id: 'job-full', kind: 'storyboard_real_grid', target: { writerShotIds: ['sh_1'] }, created_at: new Date().toISOString() }]
    const busy = await post({ action: 'regenerate-frame', projectId: PROJECT, shotId: 'sh_1', frame: 'end' })
    expect(busy.status).toBe(409)
    expect((await busy.json()).code).toBe('busy')
    jobs = []
    mocks.readMarks.mockResolvedValue(null)
    const unreadable = await post({ action: 'regenerate-frame', projectId: PROJECT, shotId: 'sh_1', frame: 'end' })
    expect(unreadable.status).toBe(422)
    expect((await unreadable.json()).code).toBe('direction_unreadable')
    // 실사 길은 끝 장만 다시 그린다(시작 · 가운데 장 다시 그리기는 받지 않는다).
    expect((await post({ action: 'regenerate-frame', projectId: PROJECT, shotId: 'sh_1', frame: 'start' })).status).toBe(400)
  })
})
