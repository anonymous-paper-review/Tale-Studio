// 동시 생성 한도에 막힌 그림이 빠지지 않게 — 겹친 요청 · 이미 있는 그림은 자리 검사 전에 건너뛰고, 내 한도 기다림은 30분까지 이어 간다 (2026-10-27 오너 재확인)
import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  capacity: vi.fn(),
  hasQueuedWorld: vi.fn(),
  hasQueuedView: vi.fn(),
  reserveJob: vi.fn(),
  countFailed: vi.fn(),
  notify: vi.fn(),
}))
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ from: mocks.from }) }))
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: mocks.from } }))
vi.mock('@/lib/demo/context', () => ({ isDemoSession: () => false }))
vi.mock('@/lib/demo/guard-server', () => ({ demoWriteBlock: () => null }))
vi.mock('@/lib/api/guard', () => ({ requireProjectAccess: async () => ({ ok: true, userId: 'owner' }) }))
vi.mock('@/lib/generation-quota', () => ({ checkGenerationCapacity: mocks.capacity }))
vi.mock('@/lib/api/quota', () => ({ quotaRejectionResponse: () => new Response(JSON.stringify({ code: 'quota_exceeded', scope: 'user' }), { status: 429 }), capacityReservationRejection: () => null }))
vi.mock('@/lib/chat-trace-server', () => ({ chatTraceBelongsToProject: async () => true }))
// 한도 안내는 띄웠는지만 본다(진짜 판정 함수는 그대로).
vi.mock('@/lib/generation-quota-toast', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/generation-quota-toast')>()),
  notifyIfQuotaExceeded: mocks.notify,
}))
vi.mock('@/lib/style-anchor', () => ({ resolveStyleAnchor: async () => null, applyStyleAnchor: (_: unknown, value: unknown) => value }))
vi.mock('@/lib/fal/webhook-url', () => ({ resolveWebhookUrl: () => 'https://example.test/webhook' }))
vi.mock('@/lib/writer/llm/fal', () => ({ falImageSubmit: vi.fn() }))
vi.mock('@/lib/generation-notify', () => ({ notifyGenerationComplete: vi.fn(), notifyGenerationFailed: vi.fn(), notifyGenerationGaveUp: vi.fn() }))
vi.mock('@/lib/generation-jobs', () => ({
  reserveGenerationJob: mocks.reserveJob,
  confirmGenerationJobReceipt: vi.fn(),
  rejectGenerationJobReservation: vi.fn(),
  hasQueuedWorldShotJob: mocks.hasQueuedWorld,
  hasQueuedCharacterViewJob: mocks.hasQueuedView,
  listFailedWorldShotJobs: async () => [],
  listFailedCharacterViewJobs: async () => [],
  countFailedJobsForTarget: mocks.countFailed,
  AUTO_GENERATION_GIVE_UP_THRESHOLD: 3,
}))

import { POST as generateWorld } from '@/app/api/artist/generate-world/route'
import { POST as generateSheet } from '@/app/api/artist/generate-sheet/route'
import { autoGenerateOnEnter, USER_LIMIT_RECHECK_MS, USER_LIMIT_WAIT_MAX_MS, writerStatusKnown } from '@/lib/artist/draw-continue'
import { useArtistStore } from '@/stores/artist-store'
import { useProjectStore } from '@/stores/project-store'
import type { GenerationJobReceipt } from '@/lib/generation-jobs-client'
import type { CharacterAsset } from '@/types/asset'

let rows: Record<string, Array<Record<string, unknown>>>
function chain(table: string) {
  let single = false
  const filters: Array<[string, unknown]> = []
  const q: Record<string, unknown> = {}
  q.select = () => q
  q.order = () => q
  q.in = () => q
  q.limit = () => q
  q.eq = (key: string, value: unknown) => { filters.push([key, value]); return q }
  q.maybeSingle = q.single = () => { single = true; return q }
  q.then = (resolve: (value: unknown) => unknown) => {
    const matches = (rows[table] ?? []).filter((row) => filters.every(([key, value]) => !(key in row) || row[key] === value))
    return Promise.resolve({ data: single ? matches[0] ?? null : matches, error: null }).then(resolve)
  }
  return q
}
const json = (body: Record<string, unknown>) => ({ method: 'POST', body: JSON.stringify(body) })

beforeEach(() => {
  vi.clearAllMocks()
  rows = {
    projects: [{ id: 'project-1', workspace_id: 'ws', style_anchor_key: null }],
    locations: [{ project_id: 'project-1', location_id: 'roof', name: '옥상', wide_shot: 'https://example.test/roof.png' }],
    character_appearances: [{ project_id: 'project-1', character_id: 'mara', appearance_key: 'current', sheet_url: 'https://example.test/mara.png' }],
  }
  mocks.from.mockImplementation(chain)
  // 내 그림 자리가 다 찼다.
  mocks.capacity.mockResolvedValue({ ok: false, scope: 'user', queued: 6, limit: 6, category: 'image', axis: 'user_image' })
  mocks.hasQueuedWorld.mockResolvedValue(false)
  mocks.hasQueuedView.mockResolvedValue(false)
  mocks.countFailed.mockResolvedValue(0)
  mocks.notify.mockImplementation((status: number) => status === 429)
})

describe('자리 검사보다 먼저 건너뛰는 요청', () => {
  it('이미 그려진 배경을 자동 경로가 요청하면 자리가 다 찼어도 거절하지 않고 이미 있다고 건너뛴다', async () => {
    // 왜: 자리가 찬 동안 이미 있는 그림을 물으면 "자리 없음"으로 돌아와 이어 그리기가 한 바퀴를 헛쓰고 멈췄다(2026-10-27 오너 재확인 "그림 1장이 한도에 막혀 안 그려짐").
    const res = await generateWorld(new Request('http://localhost/api/artist/generate-world', json({ projectId: 'project-1', locationId: 'roof', column: 'wide_shot', prompt: 'a roof', actor: 'auto' })))
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({ skipped: true, reason: 'exists' })
  })

  it('이미 그리는 중인 배경 · 인물 시트를 다시 요청하면 자리가 다 찼어도 거절하지 않고 그리는 중이라고 답한다', async () => {
    // 왜: 서버가 그리고 있는 그림을 화면이 다시 물으면 "자리 없음"이 아니라 "그리는 중"이어야 그 그림을 기다린다.
    mocks.hasQueuedWorld.mockResolvedValue(true)
    rows.locations = [{ project_id: 'project-1', location_id: 'roof', name: '옥상', wide_shot: null }]
    const world = await generateWorld(new Request('http://localhost/api/artist/generate-world', json({ projectId: 'project-1', locationId: 'roof', column: 'wide_shot', prompt: 'a roof', actor: 'auto' })))
    expect(world.status).toBe(200)
    await expect(world.json()).resolves.toMatchObject({ deduped: true })

    mocks.hasQueuedView.mockResolvedValue(true)
    rows.character_appearances = [{ project_id: 'project-1', character_id: 'mara', appearance_key: 'current', sheet_url: null }]
    const sheet = await generateSheet(new Request('http://localhost/api/artist/generate-sheet', json({ projectId: 'project-1', characterId: 'mara', appearanceKey: 'current', view: 'main', prompt: 'mara', actor: 'auto' })))
    expect(sheet.status).toBe(200)
    await expect(sheet.json()).resolves.toMatchObject({ deduped: true })
  })

  it('이미 그려진 인물 시트를 자동 경로가 요청하면 자리가 다 찼어도 이미 있다고 건너뛴다', async () => {
    // 왜: 배경과 같은 규칙 — 이미 있는 시트를 물었다고 자리 없음으로 바퀴를 헛쓰지 않는다.
    const res = await generateSheet(new Request('http://localhost/api/artist/generate-sheet', json({ projectId: 'project-1', characterId: 'mara', appearanceKey: 'current', view: 'main', prompt: 'mara', actor: 'auto' })))
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({ skipped: true, reason: 'exists' })
  })

  it('자동 경로가 두 번 실패해 포기한 배경 · 인물 시트를 다시 요청하면 자리가 다 찼어도 자리 없음이 아니라 포기했다고 답한다', async () => {
    // 왜: 자리 없음으로 답하면 이어 그리기가 포기한 그림을 30분 동안 기다리며 다시 두드린다 — 포기한 그림은 사람이 카드에서 다시 만든다(2026-10-27 검토 지적).
    mocks.countFailed.mockResolvedValue(3)
    rows.locations = [{ project_id: 'project-1', location_id: 'roof', name: '옥상', wide_shot: null }]
    const world = await generateWorld(new Request('http://localhost/api/artist/generate-world', json({ projectId: 'project-1', locationId: 'roof', column: 'wide_shot', prompt: 'a roof', actor: 'auto' })))
    expect(world.status).toBe(200)
    await expect(world.json()).resolves.toMatchObject({ skipped: true, reason: 'gave_up' })

    rows.character_appearances = [{ project_id: 'project-1', character_id: 'mara', appearance_key: 'current', sheet_url: null }]
    const sheet = await generateSheet(new Request('http://localhost/api/artist/generate-sheet', json({ projectId: 'project-1', characterId: 'mara', appearanceKey: 'current', view: 'main', prompt: 'mara', actor: 'auto' })))
    expect(sheet.status).toBe(200)
    await expect(sheet.json()).resolves.toMatchObject({ skipped: true, reason: 'gave_up' })
    expect(mocks.capacity).not.toHaveBeenCalled()
  })

  it('새로 그려야 하는 그림은 지금처럼 자리가 다 찼으면 거절한다', async () => {
    // 왜: 정상 경로 고정 — 자리 검사는 순서만 뒤로 갔을 뿐 새 그림은 그대로 막는다.
    rows.locations = [{ project_id: 'project-1', location_id: 'roof', name: '옥상', wide_shot: null }]
    const res = await generateWorld(new Request('http://localhost/api/artist/generate-world', json({ projectId: 'project-1', locationId: 'roof', column: 'wide_shot', prompt: 'a roof', actor: 'auto' })))
    expect(res.status).toBe(429)
    expect(mocks.reserveJob).not.toHaveBeenCalled()
  })
})

const realGenerateCharacterView = useArtistStore.getState().generateCharacterView

describe('내 한도에 막힌 이어 그리기', () => {
  const appearance = { appearanceKey: 'current', label: '현재', isDefault: true, narrativeTime: 'present' as const, sheetUrl: null, portraitUrl: null, appearance: null, appearanceNative: null, viewCandidates: {} }
  const person = (id: string): CharacterAsset => ({ characterId: id, name: id, entityType: 'person', views: { main: null, back: null, sideLeft: null, sideRight: null } as never, appearances: [appearance], viewCandidates: {}, origin: 'producer' })
  let view: ReturnType<typeof vi.fn>
  const userRefusal = async (...args: unknown[]) => {
    const options = (args.length > 7 ? args[7] : args[5]) as { onJob?: (receipt: GenerationJobReceipt) => void } | undefined
    options?.onJob?.({ jobId: null, status: 'failed', httpStatus: 429, quotaScope: 'user' } as GenerationJobReceipt)
    return { jobId: null, status: 'failed', httpStatus: 429 }
  }

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-27T10:00:00Z'))
    useProjectStore.setState({ projectId: 'art-1' })
    view = vi.fn(userRefusal)
    useArtistStore.setState({
      characterAssets: [person('mara')],
      worldAssets: [],
      generatingViews: [],
      generatingLocations: [],
      viewFailures: {},
      worldFailures: {},
      capacitySkips: {},
      drawContinue: { projectId: null, rounds: 0, stopped: false, running: false, paused: false },
      generateCharacterView: view as never,
    })
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  const round = async () => {
    await useArtistStore.getState().continueMissingImages()
    await vi.advanceTimersByTimeAsync(USER_LIMIT_RECHECK_MS)
  }

  it('내 한도에 막힌 이어 그리기는 세 바퀴를 넘어도 처음 막힌 뒤 30분 안이면 멈추지 않고 다시 본다', async () => {
    // 왜: 내 자리를 러프 · 다른 프로젝트 그림이 잡고 있으면 3분(세 바퀴) 안에 자리가 나지 않아 그림 1장이 그대로 빠졌다
    //   (2026-10-27 오너 재확인). 9/11 오너 (가) "내 한도에 막힌 건 내 것이 끝나면 이어 간다".
    for (let i = 0; i < 5; i++) await round()
    expect(view).toHaveBeenCalledTimes(5)
    expect(useArtistStore.getState().drawContinue).toMatchObject({ stopped: false })
  })

  it('내 한도에 막혀 기다리는 동안 1분마다 다시 볼 때는 한도 안내를 다시 띄우지 않는다', async () => {
    // 왜: 30분 기다리는 동안 1분마다 같은 "동시에 6장까지" 안내가 다시 떴다(2026-10-27 검토 지적) — 처음 막힐 때 한 번만 알린다.
    await round()
    await round()
    await round()
    const quiet = view.mock.calls.map((call) => (call[7] as { quietQuota?: boolean } | undefined)?.quietQuota === true)
    expect(quiet).toEqual([false, true, true])
  })

  it('조용히 다시 보는 그림 요청이 내 한도에 막히면 안내를 띄우지 않고 막혔다는 것만 돌려준다', async () => {
    // 왜: 기다림 중 다시 보기는 안내 없이 자리만 확인한다 — 사람이 누른 요청 · 처음 막힌 요청은 지금처럼 안내한다.
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ code: 'quota_exceeded', scope: 'user', category: 'image', limit: 6 }, { status: 429 })))
    useArtistStore.setState({ generateCharacterView: realGenerateCharacterView })
    try {
      const quiet = await useArtistStore.getState().generateCharacterView('mara', 'current', 'main', 'auto', undefined, undefined, undefined, { quietQuota: true })
      expect(quiet).toMatchObject({ status: 'failed', httpStatus: 429 })
      expect(mocks.notify).not.toHaveBeenCalled()
      await useArtistStore.getState().generateCharacterView('mara', 'current', 'main', 'auto')
      expect(mocks.notify).toHaveBeenCalledOnce()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('기다림 중 조용히 다시 보더라도 모두의 자리가 찼다는 안내는 띄운다', async () => {
    // 왜: 내 한도를 기다리다 모두의 자리가 차면 이어 그리기가 멈춘다 — 그 까닭은 알려야 한다(조용히는 내 한도 안내만, 2026-10-27 검토 지적).
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ code: 'quota_exceeded', scope: 'global', category: 'image' }, { status: 429 })))
    useArtistStore.setState({ generateCharacterView: realGenerateCharacterView })
    try {
      await useArtistStore.getState().generateCharacterView('mara', 'current', 'main', 'auto', undefined, undefined, undefined, { quietQuota: true })
      expect(mocks.notify).toHaveBeenCalledOnce()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('내 한도에 막혀 30분을 기다려도 자리가 나지 않으면 멈추고 다시 그리기 단추로 남긴다', async () => {
    // 왜: 끝없이 두드리지 않는다 — 30분이 지나면 사람이 [안 나온 그림 다시 그리기]로 다시 시작한다.
    expect(USER_LIMIT_WAIT_MAX_MS).toBe(30 * 60_000)
    await round()
    vi.setSystemTime(new Date(Date.now() + USER_LIMIT_WAIT_MAX_MS + 1))
    await useArtistStore.getState().continueMissingImages()
    expect(useArtistStore.getState().drawContinue).toMatchObject({ stopped: true, paused: false })
  })
})

describe('[만들기] 중 Artist 화면의 자동 생성', () => {
  it('[만들기]가 도는 동안 처음 준비된 Artist 화면은 스스로 그림을 그리지 않고 서버 그림과 이어 그리기에 맡긴다', () => {
    // 왜: 화면이 배경마다 30초만 서버 그림을 기다리고 직접 그려, 디자인 단계 전 프롬프트로 그리고 내 자리를 먼저 차지했다 —
    //   그 뒤 서버가 보낸 그림이 내 한도에 막혀 빠졌다(2026-10-27 오너 재확인).
    expect(autoGenerateOnEnter({ phase: 'making' })).toBe(false)
    expect(autoGenerateOnEnter({ phase: 'list' })).toBe(false)
    expect(autoGenerateOnEnter({ phase: 'cards' })).toBe(true)
    expect(readFileSync('src/app/studio/artist/page.tsx', 'utf8')).toMatch(/autoGenerateOnEnter\(\{ phase \}\)/)
  })

  it('새로고침 뒤 Writer 진행 상태를 아직 읽지 못했으면 Artist 화면은 자동으로 그리지 않고 상태를 읽은 뒤에 정한다', () => {
    // 왜: 새로고침하면 진행 상태를 읽기 전 화면 단계가 기본값 '다 만듦'이라, [만들기]가 도는 중에도 화면이 직접 그려
    //   내 자리를 먼저 차지했다 — 위 시험의 막음이 새로고침에서는 듣지 않았다(2026-10-27 검토 지적).
    expect(writerStatusKnown({ status: null })).toBe(false)
    expect(writerStatusKnown({ status: { started: false } })).toBe(true)
    expect(readFileSync('src/app/studio/artist/page.tsx', 'utf8')).toMatch(/if \(!writerStatusKnown\(\{ status: writerStatus \}\)\) return\s+autoGenTriggeredRef\.current = projectId/)
  })

  it('새로고침 뒤 Writer 진행 상태 읽기가 한 번 실패해도 다음 읽기(3초마다)를 기다렸다가 정한다', () => {
    // 왜: 한 번 실패로 바로 정하면 [만들기] 중인데도 기본값 '다 만듦'으로 보고 화면이 직접 그려 같은 문제가 다시 생긴다(2026-10-27 검토 지적).
    expect(writerStatusKnown({ status: null })).toBe(false)
    expect(readFileSync('src/app/studio/artist/page.tsx', 'utf8')).not.toMatch(/writerStatusError/)
  })

  it('자동 생성에서 차례를 기다리던 인물 시트도 그 사이 다른 프로젝트로 옮겼으면 요청하지 않는다', () => {
    // 왜: 한 번에 1~3장씩만 보내 뒤 차례의 인물은 몇 분 뒤에 나간다 — 시리즈 화들은 인물 번호가 같아, 옮겨 간 화에 그 인물을 그릴 수 있었다(2026-10-27 검토 지적).
    expect(readFileSync('src/stores/artist-store.ts', 'utf8')).toMatch(/opencast 턴어라운드 자율[\s\S]{0,200}restTasks\.push\(async \(\) => \{\s+(?:\/\/[^\n]*\s+)?if \(useProjectStore\.getState\(\)\.projectId !== projectId\) return\s+await get\(\)\.generateCharacterView/)
  })

  it('자동 생성이 배경 그림을 기다리는 사이 다른 프로젝트로 옮기면 그 배경을 요청하지 않는다', () => {
    // 왜: 시리즈 화들은 장소 id 가 같다 — 기다리는 사이 다른 화로 옮기면 그 화에 배경을 그릴 수 있었다.
    expect(readFileSync('src/stores/artist-store.ts', 'utf8')).toMatch(/server pre-gen 미도착[\s\S]{0,400}if \(useProjectStore\.getState\(\)\.projectId !== projectId\) return/)
  })
})
