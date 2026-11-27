// 화살표 편집 요청(콘티 · 실사)의 오류 말이 지금 화면 말인지 — 화면이 보낸 말을 먼저, 없으면 계정에 저장된 말, 그것도 없으면 영어 — 를 검사한다(검토 rev-realarrow 2차 낮음 1)
import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ from: vi.fn(), getUser: vi.fn(), owns: vi.fn(), cancelled: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: mocks.from } }))
vi.mock('@/lib/supabase/auth', () => ({ getUser: mocks.getUser }))
vi.mock('@/lib/generation-jobs', () => ({
  reserveGenerationJob: vi.fn(),
  confirmGenerationJobReceipt: vi.fn(),
  rejectGenerationJobReservation: vi.fn(),
  completeGenerationJob: vi.fn(),
  userOwnsProject: mocks.owns,
}))
vi.mock('@/lib/writer/llm/fal', () => ({ falImageSubmit: vi.fn() }))
vi.mock('@/lib/fal/webhook-url', () => ({ resolveWebhookUrl: () => 'https://hook.test/fal' }))
vi.mock('@/lib/moderation/creem', () => ({ assertUserTextAllowed: vi.fn(async () => ({ receipt: 'ok' })), moderatedSubmitInput: (input: unknown) => input }))
vi.mock('@/lib/api/moderation', () => ({ recordModerationPass: () => {}, moderationRejectionResponse: () => null }))
vi.mock('@/lib/api/quota', () => ({ capacityReservationRejection: () => null }))
vi.mock('@/lib/storage/media', () => ({
  mediaPathFromUrl: (url: string) => (url.startsWith('https://media.test/') ? url.replace('https://media.test/', '').split('?')[0] : null),
  mediaPublicUrl: (path: string) => `https://media.test/${path}`,
  mediaUpload: vi.fn(async () => ({ error: null })),
}))
vi.mock('@/lib/storage-thumb', () => ({ uploadThumbnail: vi.fn() }))
vi.mock('@/lib/fal/generate-image', () => ({ generateReservedImage: vi.fn() }))
vi.mock('@/lib/director/job-cancellations', () => ({ cancelledJobsById: async () => new Map(), isJobCancelled: async () => false }))
vi.mock('sonner', () => ({ toast: { info: vi.fn(), success: vi.fn(), error: vi.fn() } }))

import { POST as roughPOST } from '@/app/api/writer/rough-directing-edit/route'
import { POST as realPOST } from '@/app/api/storyboard/real-directing-edit/route'
import { UI_LOCALE_HEADER, requestUiLocale } from '@/lib/locale'
import { directingEditHeaders } from '@/lib/writer/directing-edit-url'
import { endRedrawDeps, keepLineDeps } from '@/features/writer/unsaved-arrows-confirm'
import { useLocaleStore } from '@/stores/locale-store'

// 이 시험을 위해 지은 샷 — 작업 공간 ws-1 · 프로젝트 PROJECT, 콘티 러프는 아직 그리는 중(세 장 없음), 실사 시트는 세 장이고 실사 시트 일괄이 그 샷을 그리는 중.
const WS = 'ws-1'
const PROJECT = '00000000-0000-4000-8000-000000000003'
const B = `https://media.test/${WS}/${PROJECT}/shots`
const FRAMES = { start: `${B}/s.png?v=1`, direction: `${B}/d.png?v=1`, end: `${B}/e.png?v=1` }
let shotRow: Record<string, unknown>
let jobs: Array<Record<string, unknown>>

function query(table: string) {
  const q: Record<string, unknown> = {}
  q.select = () => q
  q.eq = () => q
  q.in = () => q
  q.update = () => q
  q.maybeSingle = async () => ({ data: table === 'shots' ? structuredClone(shotRow) : table === 'projects' ? { workspace_id: WS, style_anchor_key: null } : null, error: null })
  q.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => Promise.resolve({ data: table === 'generation_jobs' ? jobs : [], error: null }).then(resolve, reject)
  return q
}
const request = (url: string, body: Record<string, unknown>, screen?: 'ko' | 'en') =>
  new Request(url, { method: 'POST', headers: { 'content-type': 'application/json', ...(screen ? { [UI_LOCALE_HEADER]: screen } : {}) }, body: JSON.stringify(body) })
const contiRedraw = (screen?: 'ko' | 'en') => roughPOST(request('http://localhost/api/writer/rough-directing-edit', { action: 'regenerate-frame', projectId: PROJECT, shotId: 'sh_1', frame: 'end' }, screen))
const contiKeep = (screen?: 'ko' | 'en') => roughPOST(request('http://localhost/api/writer/rough-directing-edit', { action: 'keep-line', projectId: PROJECT, shotId: 'sh_1', line: { text: 'x', lang: 'en' }, direction: `${B}/older.png` }, screen))
const realRedraw = (screen?: 'ko' | 'en') => realPOST(request('http://localhost/api/storyboard/real-directing-edit', { action: 'regenerate-frame', projectId: PROJECT, shotId: 'sh_1', frame: 'end' }, screen))
const errorOf = async (res: Response) => ((await res.json()) as { error?: string }).error

beforeEach(() => {
  vi.clearAllMocks()
  shotRow = {
    rough_storyboard: { status: 'pending', generatedAt: 100, frames: { ...FRAMES } },
    storyboard_image: { url: FRAMES.start, status: 'completed', errorMessage: null, generatedAt: 10, frames: { ...FRAMES } },
    duration_seconds: 4,
  }
  jobs = [{ id: 'job-grid', kind: 'storyboard_real_grid', target: { writerShotIds: ['sh_1'] } }]
  mocks.from.mockImplementation((table: string) => query(table))
  // 언어 메뉴를 누른 적 없는 계정 — 계정에 저장된 말이 없다(가입 · 구글 로그인 · 첫 방문은 저장하지 않는다).
  mocks.getUser.mockResolvedValue({ id: 'user-1' })
  mocks.owns.mockResolvedValue(true)
})
afterEach(() => vi.unstubAllGlobals())

describe('화살표 편집 요청의 오류 말', () => {
  // 왜(검토 rev-realarrow 2차 낮음 1): 화면 말의 진실은 지금 화면이다 — 언어를 저장하지 않은 한국어 화면 사용자는 계정에 말이 없어, 계정 말만 보면
  //   P3 뒤로 콘티 끝 장 · 고친 줄의 일반 오류를 영어로 받았다(그 전엔 lib 기본 한국어).
  it('언어를 저장하지 않은 한국어 화면이면 콘티 끝 장 다시 그리기 · 고친 줄 남기기의 오류 말이 한국어다', async () => {
    expect(await errorOf(await contiRedraw('ko'))).toBe('한 장을 다시 그리려면 러프 3장 세트가 있어야 해요.')
    shotRow = { ...shotRow, rough_storyboard: { status: 'completed', generatedAt: 100, frames: { ...FRAMES } } }
    expect(await errorOf(await contiKeep('ko'))).toBe('그사이 연출 그림이 바뀌었어요. 다시 열어 레이어를 다시 분리해 주세요.')
  })

  // 왜(같은 낮음 1 — 실사 길도 같은 틀): 실사 화살표 요청도 계정 말만 보면 한국어 화면에 영어 알림이 떴다.
  it('언어를 저장하지 않은 한국어 화면이면 실사 화살표 요청의 오류 말이 한국어다', async () => {
    expect(await errorOf(await realRedraw('ko'))).toBe('이 샷을 그리는 중이에요. 다 그린 뒤 고칠 수 있어요.')
  })

  // 왜(같은 낮음 1 덧붙임): 서버가 읽는 계정 말은 로그인 토큰에 실린 것이라 언어를 바꾼 직후에는 옛 말일 수 있다 — 화면이 보낸 말이 먼저다(채팅 라우트와 같은 차례).
  it('화면이 보낸 말이 계정에 저장된 말보다 먼저다', async () => {
    mocks.getUser.mockResolvedValue({ id: 'user-1', user_metadata: { locale: 'ko' } })
    expect(await errorOf(await contiRedraw('en'))).toBe('You need the 3-frame rough set to redraw a frame')
    expect(await errorOf(await realRedraw('en'))).toBe('This shot is being drawn. You can change it when it is done.')
  })

  // 왜: 정상 경로 고정 — 화면이 말을 보내지 않는 옛 화면 · 다른 호출이면 계정에 저장된 말, 그것도 없으면 영어(앞 고침과 같다).
  it('화면이 말을 보내지 않으면 계정에 저장된 말을, 그것도 없으면 영어를 쓴다', async () => {
    expect(requestUiLocale('ko', 'en')).toBe('ko')
    expect(requestUiLocale(null, 'ko')).toBe('ko')
    expect(requestUiLocale(null, undefined)).toBe('en')
    mocks.getUser.mockResolvedValue({ id: 'user-1', user_metadata: { locale: 'ko' } })
    expect(await errorOf(await contiRedraw())).toBe('한 장을 다시 그리려면 러프 3장 세트가 있어야 해요.')
    mocks.getUser.mockResolvedValue({ id: 'user-1' })
    expect(await errorOf(await contiRedraw())).toBe('You need the 3-frame rough set to redraw a frame')
  })
})

describe('화면이 보내는 말', () => {
  // 왜(같은 낮음 1): 서버가 화면 말을 먼저 쓰려면 화면이 모든 화살표 편집 요청(층 나누기 · 저장 · 줄 읽기 · 끝 장 · 고친 줄 · 한 장 다시 그리기)에 실어 보내야 한다.
  //   요청 몸 모양은 출시 시험(end-frame-ask · real-arrow-dialog)이 못 박아 머리로 보낸다.
  it('화살표 편집 요청은 모두 지금 화면 말을 실어 보낸다', async () => {
    expect(directingEditHeaders('ko')).toEqual({ 'content-type': 'application/json', [UI_LOCALE_HEADER]: 'ko' })
    useLocaleStore.setState({ locale: 'ko' })
    const sent: Array<Record<string, string>> = []
    vi.stubGlobal('fetch', vi.fn(async (_url: unknown, init?: { headers?: Record<string, string> }) => {
      sent.push(init?.headers ?? {})
      return new Response(JSON.stringify({ data: { jobId: 'job-1', read: null } }), { status: 200, headers: { 'content-type': 'application/json' } })
    }))
    const target = { projectId: PROJECT, shotId: 'sh_1', onRedrawn: () => {} }
    const t = ((key: string) => key) as unknown as Parameters<typeof endRedrawDeps>[1]
    await endRedrawDeps(target, t).post({ action: 'regenerate-frame', projectId: PROJECT, shotId: 'sh_1', frame: 'end' })
    await keepLineDeps(target, t).post({ action: 'keep-line', projectId: PROJECT, shotId: 'sh_1', line: { text: 'x', lang: 'en' } })
    expect(sent.map((h) => h[UI_LOCALE_HEADER])).toEqual(['ko', 'ko'])
    // 컴포넌트 안의 요청(층 나누기 · 저장 · 줄 읽기 · 한 장 다시 그리기)도 같은 머리를 쓴다.
    const sites: Array<[string, number]> = [
      ['src/features/writer/directing-arrow-editor.tsx', 2],
      ['src/features/writer/unsaved-arrows-confirm.tsx', 3],
      ['src/features/writer/rough-frames-still.tsx', 1],
      ['src/features/writer/storyboard-shot-dialog.tsx', 1],
    ]
    for (const [file, count] of sites) {
      const source = readFileSync(file, 'utf8')
      expect(source.match(/headers: directingEditHeaders\(/g)?.length, file).toBe(count)
      expect(source, file).not.toMatch(/rough-directing-edit'?, \{\s*method: 'POST',\s*headers: \{ 'content-type'/)
    }
  })
})
