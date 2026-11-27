// 콘티 끝 장 · 연출 장 읽기가 이 프로젝트 폴더 밖 그림을 가져오지 않는지, 콘티 화살표 요청의 오류 말(일반 오류 포함)이 사용자의 화면 말인지 검사한다(검토 rev-realarrow 5 · 7, 오너 2026-11-27 P3)
import sharp from 'sharp'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  reserve: vi.fn(),
  submit: vi.fn(),
  assertUserTextAllowed: vi.fn(),
  deriveEnBatch: vi.fn(),
  getUser: vi.fn(),
  owns: vi.fn(),
}))
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: mocks.from } }))
vi.mock('@/lib/supabase/auth', () => ({ getUser: mocks.getUser }))
vi.mock('@/lib/generation-jobs', () => ({
  reserveGenerationJob: mocks.reserve,
  confirmGenerationJobReceipt: vi.fn(),
  rejectGenerationJobReservation: vi.fn(),
  completeGenerationJob: vi.fn(),
  userOwnsProject: mocks.owns,
}))
vi.mock('@/lib/writer/llm/fal', () => ({ falImageSubmit: mocks.submit }))
vi.mock('@/lib/fal/webhook-url', () => ({ resolveWebhookUrl: () => 'https://hook.test/fal' }))
vi.mock('@/lib/moderation/creem', () => ({ assertUserTextAllowed: mocks.assertUserTextAllowed, moderatedSubmitInput: (input: unknown) => input }))
vi.mock('@/lib/api/moderation', () => ({ recordModerationPass: () => {}, moderationRejectionResponse: () => null }))
vi.mock('@/lib/api/quota', () => ({ capacityReservationRejection: () => null }))
vi.mock('@/lib/writer/i18n/derive-en', () => ({ deriveEnBatch: mocks.deriveEnBatch }))
vi.mock('@/lib/storage/media', () => ({
  mediaPathFromUrl: (url: string) => (url.startsWith('https://media.test/') ? url.replace('https://media.test/', '').split('?')[0] : null),
  mediaPublicUrl: (path: string) => `https://media.test/${path}`,
  mediaUpload: vi.fn(async () => ({ error: null })),
}))
vi.mock('@/lib/storage-thumb', () => ({ uploadThumbnail: vi.fn() }))
vi.mock('@/lib/fal/generate-image', () => ({ generateReservedImage: vi.fn() }))

import { readDirection, regenerateEndFrame } from '@/lib/writer/directing-edit'
import { POST } from '@/app/api/writer/rough-directing-edit/route'

// 이 시험을 위해 지은 콘티 샷 — 작업 공간 ws-1 · 프로젝트 PROJECT 의 러프 세 장, 시작 장만 남의 폴더 주소로 바꿔 본다.
const WS = 'ws-1'
const PROJECT = '00000000-0000-4000-8000-000000000002'
const B = `https://media.test/${WS}/${PROJECT}/shots`
const FRAMES = { start: `${B}/r_start.png?v=1`, direction: `${B}/r_direction.png?v=2`, end: `${B}/r_end.png?v=1` }
const FOREIGN = 'https://media.test/other-ws/other-project/shots/r_start.png?v=1'
let shotRow: Record<string, unknown>
let fetched: string[]
let geminiCalls: number

function query(table: string) {
  const q: Record<string, unknown> = {}
  q.select = () => q
  q.eq = () => q
  q.in = () => q
  q.update = () => q
  q.maybeSingle = async () => ({ data: table === 'shots' ? structuredClone(shotRow) : table === 'projects' ? { workspace_id: WS } : null, error: null })
  q.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve, reject)
  return q
}

beforeEach(async () => {
  for (const fn of Object.values(mocks)) fn.mockReset()
  vi.stubEnv('TALE_GEMINI_API_KEY', 'test-gemini-key')
  fetched = []
  geminiCalls = 0
  shotRow = { rough_storyboard: { status: 'completed', generatedAt: 100, frames: { ...FRAMES, start: FOREIGN } }, duration_seconds: 4 }
  mocks.from.mockImplementation((table: string) => query(table))
  mocks.assertUserTextAllowed.mockResolvedValue({ receipt: 'ok' })
  mocks.getUser.mockResolvedValue({ id: 'user-1', user_metadata: { locale: 'en' } })
  mocks.owns.mockResolvedValue(true)
  const png = await sharp({ create: { width: 64, height: 36, channels: 3, background: { r: 90, g: 90, b: 90 } } }).png().toBuffer()
  vi.stubGlobal('fetch', vi.fn(async (input: unknown) => {
    const url = String(input)
    if (url.includes('generativelanguage.googleapis.com')) {
      geminiCalls += 1
      const text = JSON.stringify({ marks: [], camera: 'none', end_en: 'x', end_ko: 'x', unclear: '' })
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }), { status: 200, headers: { 'content-type': 'application/json' } })
    }
    fetched.push(url)
    return new Response(new Uint8Array(png), { status: 200, headers: { 'content-type': 'image/png' } })
  }))
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('콘티 화살표 길의 같은 틈', () => {
  // 왜(검토 rev-realarrow 7 · 보안): 러프 기록 주소는 브라우저가 고칠 수 있는 칸이다 — 남의 프로젝트 그림을 서버가 받아 크기를 재거나 AI 에 보내지 않게.
  //   예전에는 끝 장 자리만 이 폴더인지 보고 시작 · 연출 장은 가져왔다.
  it('콘티 끝 장 다시 그리기도 시작 · 연출 장이 이 프로젝트 폴더 주소가 아니면 그 그림을 가져오지 않는다', async () => {
    await expect(regenerateEndFrame(PROJECT, 'sh_1', 'en', { projectFolderOnly: true, userId: 'user-1' })).rejects.toMatchObject({ name: 'ForeignMediaPathError' })
    expect(fetched.filter((u) => u.includes('other-ws'))).toEqual([])
    expect(geminiCalls).toBe(0)
    expect(mocks.reserve).not.toHaveBeenCalled()
  })

  // 왜(검토 rev-realarrow 7): 연출 장 읽기는 그 그림을 AI 에 보낸다 — 이 프로젝트 폴더 그림만 읽는다.
  it('콘티 연출 장 읽기도 이 프로젝트 폴더 밖의 그림은 읽지 않는다', async () => {
    await expect(readDirection(PROJECT, 'sh_1')).resolves.toBeNull()
    expect(geminiCalls).toBe(0)
  })

  // 왜(검토 rev-realarrow 5 — 콘티 길도 같은 틀): 영어 화면에 한국어 오류가 뜨지 않게 서버 말은 사용자의 화면 말(user_metadata.locale)로.
  it('콘티 화살표 요청의 오류 말도 사용자의 화면 말로 답한다', async () => {
    shotRow = { rough_storyboard: { status: 'completed', generatedAt: 100, frames: { ...FRAMES } }, duration_seconds: 4 }
    const post = () => POST(new Request('http://localhost/api/writer/rough-directing-edit', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'keep-line', projectId: PROJECT, shotId: 'sh_1', line: { text: 'x', lang: 'en' }, direction: `${B}/older.png` }) }))
    const en = await post()
    expect(en.status).toBe(409)
    expect((await en.json()).error).toBe('The directing frame changed in the meantime. Open it again and separate the layer again.')
    mocks.getUser.mockResolvedValue({ id: 'user-1', user_metadata: { locale: 'ko' } })
    expect((await (await post()).json()).error).toMatch(/[가-힣]/)
  })
})

describe('콘티 끝 장 다시 그리기의 일반 오류 말(오너 2026-11-27 P3)', () => {
  const post = (body: Record<string, unknown>) => POST(new Request('http://localhost/api/writer/rough-directing-edit', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }))
  const redraw = () => post({ action: 'regenerate-frame', projectId: PROJECT, shotId: 'sh_1', frame: 'end' })

  // 왜(오너 2026-11-27 답 3 "추천대로" · P3): 끝 장 다시 그리기 안의 일반 오류(러프 세 장이 없음 · 보관함 주소가 아님)는 알려진 오류 종류가 아니라
  //   라우트가 다시 만들지 못해 영어 화면에도 "한 장을 다시 그리려면 러프 3장 세트가 있어야 해요."가 떴다.
  it('영어 화면에서 콘티 끝 장 다시 그리기가 일반 오류로 막히면 그 말이 영어다', async () => {
    shotRow = { rough_storyboard: { status: 'pending', generatedAt: 100, frames: { ...FRAMES } }, duration_seconds: 4 }
    expect((await (await redraw()).json()).error).toBe('You need the 3-frame rough set to redraw a frame')
    shotRow = { rough_storyboard: { status: 'completed', generatedAt: 100, frames: { ...FRAMES, end: 'https://elsewhere.test/r_end.png' } }, duration_seconds: 4 }
    expect((await (await redraw()).json()).error).toBe('Not a media bucket URL: https://elsewhere.test/r_end.png')
  })

  // 왜: 정상 경로 고정 — 한국어 화면에서는 그 말이 지금처럼 한국어다.
  it('한국어 화면에서는 콘티 끝 장 다시 그리기의 일반 오류 말이 지금처럼 한국어다', async () => {
    mocks.getUser.mockResolvedValue({ id: 'user-1', user_metadata: { locale: 'ko' } })
    shotRow = { rough_storyboard: { status: 'pending', generatedAt: 100, frames: { ...FRAMES } }, duration_seconds: 4 }
    expect((await (await redraw()).json()).error).toBe('한 장을 다시 그리려면 러프 3장 세트가 있어야 해요.')
  })

  // 왜: 정상 경로 고정 — 고친 줄 남기기도 P3 부터 사용자의 화면 말을 받는다. 그 호출에서 나는 오류는 모두 알려진 종류라 고치기 전에도 화면 말이었고,
  //   말을 넘기는 호출 글자는 출시 시험(end-frame-read-draw) 한 곳이 지킨다 — 여기는 영어 화면 사용자가 받는 말만 지킨다(검토 rev-realarrow 2차 낮음 3).
  it('영어 화면에서 콘티 고친 줄 남기기가 막히면 그 말이 영어다', async () => {
    shotRow = { rough_storyboard: { status: 'completed', generatedAt: 100, frames: { ...FRAMES } }, duration_seconds: 4 }
    const keep = await post({ action: 'keep-line', projectId: PROJECT, shotId: 'sh_1', line: { text: 'x', lang: 'en' }, direction: `${B}/older.png` })
    expect((await keep.json()).error).toBe('The directing frame changed in the meantime. Open it again and separate the layer again.')
  })
})
