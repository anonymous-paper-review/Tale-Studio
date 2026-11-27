// 끝 장 ②(읽는 AI 가 연출 장을 한 줄로 읽고 GPT Image 2 가 시작 장 + 그 줄로 그린다)가 읽기 · 작업 내기 · 끼우기 · [그대로]로 고친 줄 남기기를 약속대로 하는지 검사한다(D10 · 2026-11-22 오너 Q1 · Q3 · 2026-11-23 리드 (A))
import sharp from 'sharp'
import { readFileSync } from 'node:fs'
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
}))
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: mocks.from } }))
vi.mock('@/lib/generation-jobs', () => ({
  reserveGenerationJob: mocks.reserve,
  confirmGenerationJobReceipt: mocks.confirm,
  rejectGenerationJobReservation: mocks.reject,
  completeGenerationJob: mocks.complete,
}))
vi.mock('@/lib/writer/llm/fal', () => ({ falImageSubmit: mocks.submit }))
vi.mock('@/lib/fal/webhook-url', () => ({ resolveWebhookUrl: () => 'https://hook.test/fal' }))
vi.mock('@/lib/moderation/creem', () => ({ assertUserTextAllowed: mocks.assertUserTextAllowed, moderatedSubmitInput: (input: unknown) => input }))
vi.mock('@/lib/api/moderation', () => ({ recordModerationPass: () => {} }))
vi.mock('@/lib/writer/i18n/derive-en', () => ({ deriveEnBatch: mocks.deriveEnBatch }))
vi.mock('@/lib/storage/media', () => ({
  mediaPathFromUrl: (url: string) => url.replace('https://media.test/', '').split('?')[0],
  mediaPublicUrl: (path: string) => `https://media.test/${path}`,
  mediaUpload: mocks.upload,
}))
vi.mock('@/lib/storage-thumb', () => ({ uploadThumbnail: mocks.thumb }))
vi.mock('@/lib/fal/generate-image', () => ({ generateReservedImage: mocks.generateReservedImage }))

import { DirectionTranslateError, DirectionUnreadableError, END_FRAME_METHOD, StaleDirectionError, endFrameImageSize, finalizeRoughEndFrameJob, keepEditedDirectionLine, readDirection, regenerateEndFrame } from '@/lib/writer/directing-edit'
import { freshDirectionLine } from '@/lib/writer/direction-read'

// 이 시험을 위해 지은 샷 — 행동 글(이름 · 대사 · 카메라 문장)과 샷 설계의 카메라 무브가 있다. 연출 장은 사람이 화살표를 고친 것이다.
const WS = 'ws-1'
const PROJECT = 'p1'
const BASE = `https://media.test/${WS}/${PROJECT}/shots`
const FRAMES = { start: `${BASE}/sh_1_start.png?v=1`, direction: `${BASE}/sh_1_direction.png?v=2`, end: `${BASE}/sh_1_end.png?v=1` }
const LINE_EN = 'The figure on the left turns around and walks toward the camera, ending large in the lower right.'
const LINE_KO = '왼쪽 인물이 돌아서 카메라 쪽으로 걸어와 오른쪽 아래에 크게 선다.'
let shotRow: Record<string, unknown>
let jobs: Array<Record<string, unknown>>
let updates: Array<Record<string, unknown>>
let selected: string[]
let gemini: { status: number; body: unknown }
let geminiCalls: Array<{ url: string; body: { contents: Array<{ parts: Array<Record<string, unknown>> }> } }>

function query(table: string) {
  const q: Record<string, unknown> = {}
  let patch: Record<string, unknown> | null = null
  q.select = (cols: string) => { selected.push(`${table}:${cols}`); return q }
  q.eq = () => q
  q.in = () => q
  q.order = () => q
  q.limit = () => q
  q.update = (value: Record<string, unknown>) => { patch = value; updates.push(value); return q }
  q.maybeSingle = async () => ({ data: table === 'shots' ? structuredClone(shotRow) : table === 'projects' ? { workspace_id: WS } : null, error: null })
  q.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
    Promise.resolve({ data: table === 'generation_jobs' ? jobs : patch ? [{ id: 'row' }] : [], error: null }).then(resolve, reject)
  return q
}

async function noisePng(width: number, height: number) {
  const raw = Buffer.alloc(width * height * 3)
  let seed = width * 7 + height
  for (let i = 0; i < raw.length; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff
    raw[i] = (seed >> 16) & 255
  }
  return sharp(raw, { raw: { width, height, channels: 3 } }).png().toBuffer()
}

beforeEach(async () => {
  for (const fn of Object.values(mocks)) fn.mockReset()
  // 읽는 AI 키는 시험에서 가짜 값으로만 켠다(셸 값에 기대지 않는다).
  vi.stubEnv('TALE_GEMINI_API_KEY', 'test-gemini-key')
  updates = []
  selected = []
  jobs = []
  geminiCalls = []
  shotRow = {
    rough_storyboard: { status: 'completed', generatedAt: 100, frames: { ...FRAMES } },
    duration_seconds: 6,
    action_description: "도윤이 '마지막이야'라고 중얼거리며 앞으로 걸어간다. 카메라가 천천히 다가간다.",
    dynamic_spec: { camera_motion: { type: 'dolly_in', direction: 'forward', speed: 'slow' } },
  }
  gemini = { status: 200, body: { candidates: [{ content: { parts: [{ text: JSON.stringify({ marks: [{ on: 'figure', reading: 'turns and walks to camera' }], camera: 'none', end_en: LINE_EN, end_ko: LINE_KO, unclear: '' }) }] } }], usageMetadata: { totalTokenCount: 3400 } } }
  mocks.from.mockImplementation((table: string) => query(table))
  mocks.reserve.mockResolvedValue({ id: 'job-1', fal_key_id: 'key-a', project_id: PROJECT })
  mocks.submit.mockResolvedValue({ request_id: 'req-1', model: 'openai/gpt-image-2/edit', fal_request: {}, fal_key_id: 'key-a' })
  mocks.confirm.mockResolvedValue(undefined)
  mocks.assertUserTextAllowed.mockResolvedValue({ receipt: 'ok' })
  mocks.upload.mockResolvedValue({ error: null })
  mocks.deriveEnBatch.mockImplementation(async (items: Array<{ id: string }>) => new Map(items.map((item) => [item.id, 'The figure on the left collapses to the floor.'])))
  const frame = await noisePng(406, 223)
  const drawn = await noisePng(1280, 704)
  vi.stubGlobal('fetch', vi.fn(async (input: unknown, init?: { body?: string }) => {
    const url = String(input)
    if (url.includes('generativelanguage.googleapis.com')) {
      geminiCalls.push({ url, body: JSON.parse(String(init?.body ?? '{}')) })
      return new Response(JSON.stringify(gemini.body), { status: gemini.status, headers: { 'content-type': 'application/json' } })
    }
    const buf = url.startsWith('https://fal.test/') ? drawn : frame
    return new Response(new Uint8Array(buf), { status: 200, headers: { 'content-type': 'image/png' } })
  }))
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

const submitted = () => mocks.submit.mock.calls[0][0] as { model: string; prompt: string; reference_image_urls: string[]; image_size: string; webhookUrl: string }
const lastRough = () => (updates.at(-1) as { rough_storyboard: Record<string, unknown> }).rough_storyboard

describe('연출 장 읽기', () => {
  // 왜: 사람이 그리기 전에 줄을 보고 고칠 수 있게, 저장 직후 물음 창이 열릴 때 읽는다(혼자 정한 것 b). 줄은 읽은 연출 장 주소와 함께 남는다(리드).
  it('저장 뒤 물음 창이 열리면 읽는 AI 가 시작 장과 지금 연출 장을 보고 움직임을 영어 · 한국어 한 줄로 읽어 러프 기록에 남긴다', async () => {
    const read = await readDirection(PROJECT, 'sh_1')
    expect(read).toMatchObject({ en: LINE_EN, ko: LINE_KO, source: 'ai', direction: FRAMES.direction, endDrawn: null })
    expect(geminiCalls).toHaveLength(1)
    expect(geminiCalls[0].url).toContain('gemini-3.6-flash')
    const parts = geminiCalls[0].body.contents[0].parts
    expect(parts.filter((part) => 'inline_data' in part)).toHaveLength(2)
    expect(lastRough().directionRead).toMatchObject({ en: LINE_EN, ko: LINE_KO, source: 'ai', direction: FRAMES.direction, endDrawn: null })
    expect(lastRough().frames).toEqual(FRAMES)
  })

  // 왜: 같은 연출 장을 두 번 읽으면 시간 · 값만 든다 — 편집기 아래 줄 [고쳐서 끝 장 다시 그리기]도 남은 줄을 바로 쓴다(혼자 정한 것 b).
  it('지금 연출 장을 읽은 줄이 이미 있으면 다시 읽지 않는다', async () => {
    shotRow.rough_storyboard = { ...(shotRow.rough_storyboard as object), directionRead: { en: LINE_EN, ko: LINE_KO, source: 'ai', direction: FRAMES.direction, at: 1, endDrawn: null } }
    await expect(readDirection(PROJECT, 'sh_1')).resolves.toMatchObject({ en: LINE_EN })
    expect(geminiCalls).toHaveLength(0)
    expect(updates).toHaveLength(0)
  })

  // 왜(혼자 정한 것 f): 읽는 AI 가 안 되면(키 없음 · 오류 · 빈 답) 줄 없이 돌아와 물음 창이 "직접 적어 주세요"를 보인다.
  it('읽는 AI 가 읽지 못하면 줄 없이 돌아오고 아무것도 남기지 않는다', async () => {
    gemini = { status: 500, body: { error: 'boom' } }
    await expect(readDirection(PROJECT, 'sh_1')).resolves.toBeNull()
    gemini = { status: 200, body: { candidates: [{ content: { parts: [{ text: JSON.stringify({ end_en: '' }) }] } }] } }
    await expect(readDirection(PROJECT, 'sh_1')).resolves.toBeNull()
    expect(updates).toHaveLength(0)
  })
})

describe('끝 장 작업 내기', () => {
  // 왜: 읽기 7~11초 + 그리기 65~71초라 요청 하나 60초를 넘는다 — 있는 생성 작업 틀로 내고 작업 번호만 바로 돌려준다(혼자 정한 것 a).
  //   읽은 줄은 사용자 손글씨가 옮겨진 글이라 그림 지시에 싣기 전에 내용 검사를 거친다(10/11 약속).
  it('끝 장 그리기는 읽은 줄을 내용 검사에 보낸 뒤 작업으로 내고 작업 번호만 바로 돌려준다', async () => {
    const out = await regenerateEndFrame(PROJECT, 'sh_1', 'ko', { userId: 'owner' })
    expect(out).toMatchObject({ jobId: 'job-1', replayed: false, read: { en: LINE_EN } })
    expect(mocks.assertUserTextAllowed.mock.calls[0][0]).toEqual([LINE_EN])
    expect(mocks.assertUserTextAllowed.mock.invocationCallOrder[0]).toBeLessThan(mocks.reserve.mock.invocationCallOrder[0])
    const reserved = mocks.reserve.mock.calls[0][0]
    expect(reserved).toMatchObject({ projectId: PROJECT, kind: 'image_generation', model: 'openai/gpt-image-2/edit', userId: 'owner' })
    expect(reserved.target).toMatchObject({ writerShotId: 'sh_1', roughEnd: { generatedAt: 100, direction: FRAMES.direction, line: LINE_EN } })
    expect(submitted()).toMatchObject({ model: 'openai/gpt-image-2/edit', reference_image_urls: [FRAMES.start], webhookUrl: 'https://hook.test/fal' })
    expect(mocks.confirm).toHaveBeenCalledWith('job-1', PROJECT, expect.objectContaining({ request_id: 'req-1' }))
    expect(mocks.generateReservedImage).not.toHaveBeenCalled()
  })

  // 왜: 끝 장은 고친 화살표를 따라야 한다 — 샷 설계의 옛 움직임 글을 함께 실으면 고친 화살표와 다툰다(D10 피드백 7의 뿌리). 정해진 방식은 ②(오너 Q1 · Q3).
  it('끝 장 그리기 지시는 시작 장과 읽은 영어 줄만 싣고 샷 설계의 옛 움직임 글은 싣지 않는다', async () => {
    expect(END_FRAME_METHOD).toBe('read-then-draw')
    await regenerateEndFrame(PROJECT, 'sh_1')
    const { prompt, reference_image_urls } = submitted()
    expect(prompt).toContain(LINE_EN)
    expect(prompt).toContain('6 seconds')
    expect(prompt).not.toMatch(/Doyun|도윤|dolly|slowly moves in/i)
    expect(reference_image_urls).toEqual([FRAMES.start])
    expect(selected.some((cols) => /action_description|dynamic_spec/.test(cols))).toBe(false)
  })

  // 왜(혼자 정한 것 c · d): 고친 줄을 다시 읽으면 고친 것이 사라진다. 지시는 영어만이라 한국어로 고친 줄은 영어로 옮겨 싣는다.
  it('사람이 고친 줄로 그리면 다시 읽지 않고, 한국어로 고쳤으면 영어로 옮겨 싣는다', async () => {
    await regenerateEndFrame(PROJECT, 'sh_1', 'ko', { line: { text: '왼쪽 인물이 바닥에 쓰러진다.', lang: 'ko' } })
    expect(geminiCalls).toHaveLength(0)
    expect(mocks.deriveEnBatch).toHaveBeenCalledTimes(1)
    expect(submitted().prompt).toContain('The figure on the left collapses to the floor.')
    expect(updates[0]).toMatchObject({ rough_storyboard: { directionRead: { en: 'The figure on the left collapses to the floor.', ko: '왼쪽 인물이 바닥에 쓰러진다.', source: 'user', direction: FRAMES.direction, endDrawn: null } } })
    // 영어로 고친 줄은 옮기지 않고 그대로 싣는다.
    mocks.submit.mockClear()
    mocks.deriveEnBatch.mockClear()
    await regenerateEndFrame(PROJECT, 'sh_1', 'en', { line: { text: 'Camera pulls back to a wide shot.', lang: 'en' } })
    expect(mocks.deriveEnBatch).not.toHaveBeenCalled()
    expect(submitted().prompt).toContain('Camera pulls back to a wide shot.')
  })

  // 왜(혼자 정한 것 d): 옮기지 못한 한국어를 그대로 실으면 지시에 한국어가 섞인다 — 그리지 않고 다시 시도하라고 알린다.
  it('한국어로 고친 줄을 영어로 옮기지 못하면 그리지 않는다', async () => {
    mocks.deriveEnBatch.mockImplementation(async () => new Map())
    await expect(regenerateEndFrame(PROJECT, 'sh_1', 'ko', { line: { text: '왼쪽 인물이 쓰러진다.', lang: 'ko' } })).rejects.toBeInstanceOf(DirectionTranslateError)
    expect(mocks.reserve).not.toHaveBeenCalled()
    expect(mocks.submit).not.toHaveBeenCalled()
  })

  // 왜(혼자 정한 것 f): 줄 없이 그리면 ② 가 아니다 — 그림 값을 쓰지 않고 알린다([이 장만 다시 만들기](끝)).
  it('읽은 줄이 없고 읽지도 못하면 끝 장을 그리지 않고 알린다', async () => {
    gemini = { status: 500, body: {} }
    await expect(regenerateEndFrame(PROJECT, 'sh_1')).rejects.toBeInstanceOf(DirectionUnreadableError)
    expect(mocks.reserve).not.toHaveBeenCalled()
  })

  // 왜(혼자 정한 것 g): 같은 끝 장을 두 번 그리면 그림 값이 두 번 든다 — 돌고 있는 작업을 기다린다.
  it('그 샷의 끝 장 작업이 돌고 있으면 새로 내지 않고 그 작업 번호를 돌려준다', async () => {
    jobs = [{ id: 'job-running', target: { writerShotId: 'sh_1', roughEnd: { generatedAt: 100, direction: FRAMES.direction, line: LINE_EN } } }]
    await expect(regenerateEndFrame(PROJECT, 'sh_1')).resolves.toMatchObject({ jobId: 'job-running', replayed: true })
    expect(mocks.reserve).not.toHaveBeenCalled()
    expect(mocks.submit).not.toHaveBeenCalled()
  })

  // 왜(혼자 정한 것 i): 끝 장은 다른 두 장과 같은 비율이어야 한다 — GPT 에는 그 비율의 크기(16 의 배수, 0.66MP 이상)로 시킨다.
  it('GPT 에는 다른 두 장 비율에 맞는 크기로 시킨다', async () => {
    expect(endFrameImageSize(406, 223)).toBe('1280x704')
    expect(endFrameImageSize(255, 447)).toBe('736x1280')
    expect(endFrameImageSize(500, 500)).toBe('1024x1024')
    await regenerateEndFrame(PROJECT, 'sh_1')
    expect(submitted().image_size).toBe('1280x704')
  })
})

describe('끝 장 끼우기', () => {
  const job = (target: Record<string, unknown>) => ({ id: 'job-1', project_id: PROJECT, kind: 'image_generation', target }) as never
  const TARGET = { writerShotId: 'sh_1', workspaceId: WS, roughEnd: { generatedAt: 100, direction: FRAMES.direction, line: LINE_EN } }

  // 왜: 끝 장만 바꾸고 시작 · 연출 장은 그대로(약속 I). 그 줄로 그린 끝 장이 지금 끝 장이 되어야 실사 지시가 그 줄을 쓴다(리드 Q-a · D2).
  it('그림이 오면 끝 장만 다른 두 장 크기로 바꿔 끼우고 그 줄로 그렸다는 표시를 남긴다', async () => {
    shotRow.rough_storyboard = { ...(shotRow.rough_storyboard as object), directionRead: { en: LINE_EN, ko: LINE_KO, source: 'ai', direction: FRAMES.direction, at: 1, endDrawn: null } }
    const url = await finalizeRoughEndFrameJob(job(TARGET), 'https://fal.test/out.png')
    const [path, buf] = mocks.upload.mock.calls[0]
    expect(path).toBe(`${WS}/${PROJECT}/shots/sh_1_end.png`)
    expect((await sharp(buf as Buffer).metadata()).width).toBe(406)
    const saved = lastRough()
    expect((saved.frames as Record<string, string>).start).toBe(FRAMES.start)
    expect((saved.frames as Record<string, string>).direction).toBe(FRAMES.direction)
    expect((saved.frames as Record<string, string>).end).toBe(url)
    expect(freshDirectionLine(saved)).toBe(LINE_EN)
    expect(mocks.complete).toHaveBeenCalledWith('job-1', url)
  })

  // 왜(혼자 정한 것 h): 옛 줄로 그린 끝 장이 새 연출 장 옆에 붙지 않게 — 지금 한 장 다시 그리기와 같은 규칙.
  it('끝 장이 오기 전에 연출 장이 다시 저장됐거나 러프가 통째로 바뀌었으면 그 끝 장은 끼우지 않는다', async () => {
    shotRow.rough_storyboard = { status: 'completed', generatedAt: 300, frames: { ...FRAMES, direction: `${BASE}/sh_1_direction.png?v=3` } }
    await expect(finalizeRoughEndFrameJob(job(TARGET), 'https://fal.test/out.png')).rejects.toThrow()
    shotRow.rough_storyboard = { status: 'completed', generatedAt: 300, frames: { ...FRAMES } }
    await expect(finalizeRoughEndFrameJob(job(TARGET), 'https://fal.test/out.png')).rejects.toThrow()
    expect(mocks.upload).not.toHaveBeenCalled()
    expect(updates).toHaveLength(0)
    expect(mocks.complete).not.toHaveBeenCalled()
  })

  // 왜: 끝 장 작업은 이미 있는 완료 처리 길(웹훅 · 폴링 회수)을 그대로 탄다 — 그 길에서 끝 장 갈래로 들어간다.
  it('끝 장 작업이 끝나면 이미 있는 완료 처리 길이 끝 장 끼우기로 보낸다', () => {
    const finalize = readFileSync('src/lib/fal/finalize.ts', 'utf8')
    expect(finalize).toMatch(/if \(job\.target\.roughEnd\) return finalizeRoughEndFrameJob\(job, falImageUrl\)/)
    const route = readFileSync('src/app/api/writer/rough-directing-edit/route.ts', 'utf8')
    expect(route).toMatch(/action: z\.literal\('read-direction'\)/)
    // 2026-11-27 글 바꿈(오너 P3 "추천대로" — 일반 오류도 사용자의 화면 말로): 예전 호출 글자는 세 번째 칸이 undefined(늘 기본 말)였다.
    expect(route).toMatch(/regenerateEndFrame\(body\.projectId, body\.shotId, locale, \{ line, userId: user\.id, projectFolderOnly: true \}\)/)
  })
})

describe('[그대로]로 고친 줄 남기기', () => {
  // 왜(리드 (A) 2026-11-23): 끝 장은 그리지 않고 고친 줄만 남긴다 — 영상이 이 줄을 쓴다(리드 D2). 그림 값 · 읽기 값이 들지 않고 러프 세 장은 그대로다(약속 I).
  it('[그대로]로 남긴 고친 줄은 사람이 고친 줄로 남고 끝 장은 그리지 않는다', async () => {
    const read = await keepEditedDirectionLine(PROJECT, 'sh_1', { text: 'Camera pulls back to a wide shot.', lang: 'en' })
    expect(read).toMatchObject({ en: 'Camera pulls back to a wide shot.', ko: null, source: 'user', direction: FRAMES.direction, endDrawn: null })
    expect(lastRough().directionRead).toMatchObject({ en: 'Camera pulls back to a wide shot.', ko: null, source: 'user', direction: FRAMES.direction, endDrawn: null })
    expect(lastRough().frames).toEqual(FRAMES)
    expect(mocks.deriveEnBatch).not.toHaveBeenCalled()
    expect(geminiCalls).toHaveLength(0)
    expect(mocks.reserve).not.toHaveBeenCalled()
    expect(mocks.submit).not.toHaveBeenCalled()
    const route = readFileSync('src/app/api/writer/rough-directing-edit/route.ts', 'utf8')
    expect(route).toMatch(/action: z\.literal\('keep-line'\)/)
    // 2026-11-27 글 바꿈(오너 P3 "추천대로"): 예전 호출 글자는 네 번째 칸이 undefined(늘 기본 말)였다.
    expect(route).toMatch(/keepEditedDirectionLine\(body\.projectId, body\.shotId, body\.line, locale, \{ expectDirection: body\.direction \}\)/)
  })

  // 왜(리드 (A)): 지시는 영어만이다 — 한국어로 고친 줄은 영어로 옮겨 남기고(화면엔 한국어 그대로), 못 옮기면 아무것도 바꾸지 않는다(AI 가 읽은 줄이 그대로 남는다).
  it('한국어로 고친 줄은 영어로 옮겨 남기고, 옮기지 못하면 러프 기록을 바꾸지 않는다', async () => {
    await keepEditedDirectionLine(PROJECT, 'sh_1', { text: '왼쪽 인물이 바닥에 쓰러진다.', lang: 'ko' })
    expect(mocks.deriveEnBatch).toHaveBeenCalledTimes(1)
    expect(lastRough().directionRead).toMatchObject({ en: 'The figure on the left collapses to the floor.', ko: '왼쪽 인물이 바닥에 쓰러진다.', source: 'user', endDrawn: null })
    updates = []
    mocks.deriveEnBatch.mockImplementation(async () => new Map())
    await expect(keepEditedDirectionLine(PROJECT, 'sh_1', { text: '왼쪽 인물이 쓰러진다.', lang: 'ko' })).rejects.toBeInstanceOf(DirectionTranslateError)
    expect(updates).toHaveLength(0)
  })

  // 왜(혼자 정한 것 b): 한국어 말만 다듬어 영어 줄이 같으면 끝 장은 이미 그 줄로 그려져 있다 — "끝 장 · 실사는 다시 그려야" 알림이 잘못 뜨지 않게 표시를 둔다.
  //   영어 줄이 달라지면 끝 장은 아직 그 줄로 그리지 않았다 — 표시를 지워 실사 지시에 싣지 않는다(영상은 쓴다).
  it('남길 줄의 영어가 그 전 줄과 같으면 그 줄로 그린 끝 장 표시를 그대로 두고, 다르면 지운다', async () => {
    shotRow.rough_storyboard = { ...(shotRow.rough_storyboard as object), directionRead: { en: 'The figure on the left collapses to the floor.', ko: '왼쪽 인물이 쓰러진다.', source: 'ai', direction: FRAMES.direction, at: 1, endDrawn: FRAMES.end } }
    await keepEditedDirectionLine(PROJECT, 'sh_1', { text: '왼쪽 인물이 바닥에 쓰러진다.', lang: 'ko' })
    expect(lastRough().directionRead).toMatchObject({ ko: '왼쪽 인물이 바닥에 쓰러진다.', source: 'user', endDrawn: FRAMES.end })
    expect(freshDirectionLine(lastRough())).toBe('The figure on the left collapses to the floor.')
    await keepEditedDirectionLine(PROJECT, 'sh_1', { text: 'Camera pulls back to a wide shot.', lang: 'en' })
    expect(lastRough().directionRead).toMatchObject({ en: 'Camera pulls back to a wide shot.', endDrawn: null })
    expect(freshDirectionLine(lastRough())).toBeNull()
  })

  // 왜(혼자 정한 것 e): 화면이 본 연출 장과 지금 연출 장이 다르면(다른 창에서 저장) 고친 줄은 옛 화살표에 대한 줄이다 — 새 화살표의 줄로 남기지 않는다.
  it('화면이 본 연출 장과 지금 연출 장이 다르면 고친 줄을 남기지 않는다', async () => {
    await expect(keepEditedDirectionLine(PROJECT, 'sh_1', { text: 'Camera pulls back to a wide shot.', lang: 'en' }, 'ko', { expectDirection: `${BASE}/sh_1_direction.png?v=1` })).rejects.toBeInstanceOf(StaleDirectionError)
    expect(updates).toHaveLength(0)
    // 본 연출 장이 지금 연출 장이면 남긴다.
    await keepEditedDirectionLine(PROJECT, 'sh_1', { text: 'Camera pulls back to a wide shot.', lang: 'en' }, 'ko', { expectDirection: FRAMES.direction })
    expect(lastRough().directionRead).toMatchObject({ en: 'Camera pulls back to a wide shot.', direction: FRAMES.direction })
  })
})
