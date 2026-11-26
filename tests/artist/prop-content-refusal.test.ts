// 소품 그림이 내용 검사에 걸리면 알림이 소품 이름을 말하고 카드 · 창에 "내용 검사에 걸림"이 보인다 — 인물 · 배경과 같다 (main 2026-11-25 오너, m1126 A1 이식 맞춤)
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  toastError: vi.fn(),
  poll: vi.fn(),
  assertUserTextAllowed: vi.fn(),
  submitPropImageJob: vi.fn(),
}))

vi.mock('@/lib/demo/context', () => ({ isDemoSession: () => false }))
vi.mock('sonner', () => ({ toast: { error: mocks.toastError, success: vi.fn(), info: vi.fn(), warning: vi.fn(), message: vi.fn() } }))
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => {
      const q: Record<string, unknown> = {}
      for (const name of ['select', 'eq', 'in', 'order', 'limit', 'update', 'is']) q[name] = () => q
      q.then = (resolve: (v: unknown) => unknown) => resolve({ data: [], error: null })
      q.maybeSingle = async () => ({ data: null, error: null })
      return q
    },
  }),
}))
vi.mock('@/lib/generation-notify', () => ({
  notifyGenerationComplete: vi.fn(),
  notifyGenerationFailed: vi.fn(),
  notifyGenerationFailure: vi.fn(),
  notifyBatchSummary: vi.fn(),
  notifyGenerationGaveUp: vi.fn(),
}))
vi.mock('@/lib/generation-jobs-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/generation-jobs-client')>()),
  pollGenerationJob: mocks.poll,
}))
// 창구(라우트) 쪽 — 내용 검사만 진짜 거절 응답(moderationRejectionResponse)을 쓴다.
vi.mock('@/lib/demo/guard-server', () => ({ demoWriteBlock: () => null }))
vi.mock('@/lib/api/guard', () => ({ requireProjectAccess: async (_req: Request, projectId: string) => ({ ok: true, projectId, userId: 'user-1', viaShare: false }) }))
vi.mock('@/lib/chat-trace-server', () => ({ chatTraceBelongsToProject: async () => true }))
vi.mock('@/lib/generation-quota', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/generation-quota')>()),
  checkGenerationCapacity: async () => ({ ok: true }),
}))
vi.mock('@/lib/moderation/creem', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/moderation/creem')>()),
  assertUserTextAllowed: mocks.assertUserTextAllowed,
}))
vi.mock('@/lib/writer/debug-events', () => ({ recordWriterObservabilityEvent: vi.fn() }))
vi.mock('@/lib/style-anchor', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/style-anchor')>()),
  resolveStyleAnchor: async () => null,
}))
vi.mock('@/lib/style-facets/reference-image', () => ({ styleDrawsWithoutReference: async () => false }))
vi.mock('@/lib/style-facets/analysis-wait', () => ({ styleAnalysisPending: () => false }))
vi.mock('@/lib/storage/template-asset', () => ({ templateAssetUrl: async () => 'https://media.test/templates/prop-template.png' }))
vi.mock('@/lib/artist/prop-jobs', () => ({
  loadPropDrawingContext: async () => ({
    prop: { prop_id: 'obj_ring', name: '은반지', appearance: 'a thin silver ring', image_url: null },
    project: { workspace_id: 'ws-1', style_anchor_key: 'jp_anime', custom_style_anchor: null },
    personClash: false,
  }),
  hasQueuedPropImageJob: async () => false,
  listFailedPropImageJobs: async () => [],
  submitPropImageJob: mocks.submitPropImageJob,
}))
vi.mock('@/lib/generation-jobs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/generation-jobs')>()),
  countFailedJobsForTarget: async () => 0,
}))

import { POST as generatePropRoute } from '@/app/api/artist/generate-prop/route'
import { PropPanel } from '@/features/artist/prop-panel'
import { PropDetailPanels } from '@/features/artist/prop-view-dialog'
import { ModerationBlockedError } from '@/lib/moderation/creem'
import { KO } from '@/lib/i18n/messages-ko'
import { useArtistStore } from '@/stores/artist-store'
import { useLocaleStore } from '@/stores/locale-store'
import { useProjectStore } from '@/stores/project-store'
import type { PropAsset } from '@/types'

const CONTENT_CHECK_SOFTER =
  'This description did not pass the content check, so it was not drawn. Press "Retry with a softer prompt" below, or edit the description and draw again.'
const CONTENT_CHECK_EDIT = 'This description did not pass the content check, so it was not drawn. Edit the description and draw again.'
const BLOCKED = {
  error: 'This request breaks the content rules, so it was not generated. Edit the description and try again.',
  code: 'content_policy_blocked',
  policyUrl: '/acceptable-use',
}
const ring: PropAsset = { propId: 'obj_ring', name: '은반지', appearance: 'a thin silver ring', appearanceNative: '가느다란 은반지', imageUrl: null, sourceHash: null, origin: 'writer' }
const artistInitial = { ...useArtistStore.getInitialState() }
const localeInitial = useLocaleStore.getInitialState().locale
/** 정적 그리기(renderToStaticMarkup)는 store 의 처음 상태를 읽는다 — 지금 상태와 처음 상태를 함께 넣는다(prop-image 시험과 같다). */
function seed(state: Partial<ReturnType<typeof useArtistStore.getState>>) {
  useArtistStore.setState(state)
  Object.assign(useArtistStore.getInitialState(), state)
}
const routePost = () =>
  generatePropRoute(new Request('http://test/api/artist/generate-prop', { method: 'POST', body: JSON.stringify({ projectId: 'project-1', propId: 'obj_ring', actor: 'ui' }) }))

beforeEach(() => {
  vi.clearAllMocks()
  useProjectStore.setState({ projectId: 'project-1' })
  // 한국어 화면에서 본다 — 배지 · 안내 말을 사전(KO)과 견준다.
  useLocaleStore.setState({ locale: 'ko' })
  Object.assign(useLocaleStore.getInitialState(), { locale: 'ko' })
  seed({ propAssets: [ring], propUsage: {}, generatingProps: [], propFailures: {}, propContentRefusals: {} })
  mocks.poll.mockResolvedValue('https://media.test/props/ring.png')
  mocks.assertUserTextAllowed.mockResolvedValue({ id: 'moderation-1' })
  mocks.submitPropImageJob.mockResolvedValue({ id: 'job-1' })
})
afterEach(() => {
  seed({ propAssets: artistInitial.propAssets, propUsage: artistInitial.propUsage, generatingProps: [], propFailures: {}, propContentRefusals: {} })
  useProjectStore.setState({ projectId: null })
  useLocaleStore.setState({ locale: localeInitial })
  Object.assign(useLocaleStore.getInitialState(), { locale: localeInitial })
  vi.unstubAllGlobals()
})

describe('소품 그림의 내용 검사 거절', () => {
  // 왜: 내용 검사 거절은 작업 기록이 생기기 전에 끝난다 — 화면이 받는 것은 이 답 하나라, 이름이 없으면 어느 소품의 설명을 고칠지 모른다(인물 · 배경과 같다, 2026-11-25 오너).
  it('소품 그림 창구는 보내기 전 내용 검사에 걸리면 거절 답에 소품 이름을 싣는다', async () => {
    mocks.assertUserTextAllowed.mockRejectedValue(new ModerationBlockedError('deny', 'mod-1'))
    const res = await routePost()
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ code: 'content_policy_blocked', target: { kind: 'prop', name: '은반지' } })
    expect(mocks.submitPropImageJob).not.toHaveBeenCalled()
  })

  // 왜: 거절된 소품은 카드에 아무 표시가 없어 그림이 왜 없는지 알 수 없었다 — 인물 · 배경 카드처럼 이름을 말하는 알림과 카드 배지로 알린다.
  it('소품 그림이 보내기 전 내용 검사에 걸리면 알림이 소품 이름을 말하고 카드에 "내용 검사에 걸림"이 보인다', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) =>
      url === '/api/artist/generate-prop'
        ? new Response(JSON.stringify({ ...BLOCKED, target: { kind: 'prop', name: '은반지' } }), { status: 400 })
        : new Response('{}', { status: 200 }),
    ))
    expect(await useArtistStore.getState().generateProp('obj_ring', 'ui')).toBe('failed')
    expect(useArtistStore.getState().propContentRefusals).toEqual({ obj_ring: { name: '은반지' } })
    expect(mocks.toastError).toHaveBeenCalledTimes(1)
    expect(String(mocks.toastError.mock.calls[0][0])).toContain('은반지')
    // 제출 뒤 실패(작업 기록)와 섞지 않는다 — 순화 재시도 자격은 서버가 주는 것이다.
    expect(useArtistStore.getState().propFailures.obj_ring).toBeUndefined()
    seed({ propContentRefusals: useArtistStore.getState().propContentRefusals })
    const card = renderToStaticMarkup(createElement(PropPanel, { columns: 2 }))
    expect(card).toContain(KO['Content check'])
    expect(card).toContain('data-testid="artist-prop-redraw"')
  })

  // 왜: 보내기 전 거절은 순화 재시도 자격이 없다 — 할 수 있는 일은 설명을 고쳐 다시 그리기 하나다(인물 · 배경 창과 같은 안내).
  it('보내기 전 내용 검사에 걸린 소품 창은 설명을 고쳐 다시 그리라고 말하고 순화 단추는 없다', () => {
    seed({ propContentRefusals: { obj_ring: { name: '은반지' } } })
    const html = renderToStaticMarkup(createElement(PropDetailPanels, { propId: 'obj_ring' }))
    expect(html).toContain(KO[CONTENT_CHECK_EDIT])
    expect(html).toContain(KO['Content check'])
    expect(html).not.toContain('data-testid="prop-detail-safe-retry"')
  })

  // 왜: 그린 뒤 정책 거절도 학생이 고칠 것이 설명 쪽이다 — 카드는 "내용 검사에 걸림", 창은 순화 단추와 인물 · 배경과 같은 안내.
  it('그린 뒤 정책 거절로 실패한 소품도 카드에 "내용 검사에 걸림"이 보이고, 창은 순화 단추와 인물 · 배경과 같은 안내를 보인다', () => {
    seed({ propFailures: { obj_ring: { error: 'blocked', moderation: true, failCount: 1, safeFailCount: 0 } } })
    expect(renderToStaticMarkup(createElement(PropPanel, { columns: 2 }))).toContain(KO['Content check'])
    // 정적 그리기는 따옴표를 &quot; 로 적는다 — 글자로 되돌려 사전 문장과 견준다.
    const html = renderToStaticMarkup(createElement(PropDetailPanels, { propId: 'obj_ring' })).replace(/&quot;/g, '"')
    expect(html).toContain(KO[CONTENT_CHECK_SOFTER])
    expect(html).toContain('data-testid="prop-detail-safe-retry"')
  })

  // 왜: 정상 경로 고정 — 정책과 상관없는 실패는 설명 탓이 아니라서 "이미지 실패" 그대로다.
  it('정책과 상관없이 실패한 소품 카드는 "이미지 실패" 그대로다', () => {
    seed({ propFailures: { obj_ring: { error: 'boom', moderation: false, failCount: 1, safeFailCount: 0 } } })
    const card = renderToStaticMarkup(createElement(PropPanel, { columns: 2 }))
    expect(card).toContain(KO['Image failed'])
    expect(card).not.toContain(KO['Content check'])
  })

  // 왜: 고쳐서 다시 보낸 그림이 접수됐는데 배지가 남으면 아직 막힌 것처럼 보인다 — 인물 · 배경과 같이 다시 접수되면 지운다.
  it('내용 검사에 걸린 소품을 다시 보내 접수되면 "내용 검사에 걸림"이 사라진다', async () => {
    useArtistStore.setState({ propContentRefusals: { obj_ring: { name: '은반지' } } })
    vi.stubGlobal('fetch', vi.fn(async (url: string) =>
      url === '/api/artist/generate-prop' ? new Response(JSON.stringify({ ok: true, jobId: 'job-1', status: 'queued' }), { status: 200 }) : new Response('{}', { status: 200 }),
    ))
    expect(await useArtistStore.getState().generateProp('obj_ring', 'ui')).toBe('drawn')
    expect(useArtistStore.getState().propContentRefusals).toEqual({})
  })
})
