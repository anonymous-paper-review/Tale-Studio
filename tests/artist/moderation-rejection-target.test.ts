// 제출 전 내용 검사에 걸린 그림의 거절 응답에 어느 인물·배경이 걸렸는지 이름이 실린다
import { beforeEach, describe, expect, it, vi } from 'vitest'

// 왜 이름이 필요한가(2026-11-25 오너): Creem 검사는 작업 행이 생기기 전에 거부하므로 카드에 실패 배지가
//   남지 않는다. 화면이 받는 것은 이 400 응답 하나뿐이라, 거기에 이름이 없으면 학생은 "뭔가 걸렸다"만 알고
//   어느 그림의 설명을 고쳐야 하는지 알 수 없다. 자동 재시도·문구 재작성은 하지 않는 결정이라
//   이름 안내가 유일한 회복 경로다.
const mocks = vi.hoisted(() => ({
  assertUserTextAllowed: vi.fn(),
  reserveGenerationJob: vi.fn(),
  falImageSubmit: vi.fn(),
  recordWriterObservabilityEvent: vi.fn(),
  from: vi.fn(),
}))

vi.mock('@/lib/moderation/creem', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/moderation/creem')>()),
  assertUserTextAllowed: mocks.assertUserTextAllowed,
}))
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: mocks.from } }))
vi.mock('@/lib/supabase/auth', () => ({ getUser: async () => ({ id: USER_ID }) }))
vi.mock('@/lib/demo/guard-server', () => ({ demoWriteBlock: () => null }))
vi.mock('@/lib/api/guard', () => ({
  requireProjectAccess: async () => ({ ok: true as const, projectId: PROJECT_ID, userId: USER_ID, viaShare: false }),
}))
vi.mock('@/lib/generation-jobs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/generation-jobs')>()),
  reserveGenerationJob: mocks.reserveGenerationJob,
  confirmGenerationJobReceipt: vi.fn(),
  rejectGenerationJobReservation: vi.fn(),
  hasQueuedCharacterViewJob: async () => false,
  hasQueuedWorldShotJob: async () => false,
  countFailedJobsForTarget: async () => 0,
  listFailedCharacterViewJobs: async () => [],
  listFailedWorldShotJobs: async () => [],
  userOwnsProject: async () => true,
}))
vi.mock('@/lib/generation-quota', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/generation-quota')>()),
  checkGenerationCapacity: async () => ({ ok: true, queued: 0, limit: 6, scope: 'user', category: 'image', axis: 'user_image' }),
}))
vi.mock('@/lib/writer/llm/fal', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/writer/llm/fal')>()),
  falImageSubmit: mocks.falImageSubmit,
}))
vi.mock('@/lib/writer/debug-events', () => ({ recordWriterObservabilityEvent: mocks.recordWriterObservabilityEvent }))
vi.mock('@/lib/fal/webhook-url', () => ({ resolveWebhookUrl: () => undefined, resolveWebhookBaseUrl: () => null }))
vi.mock('@/lib/storage/template-asset', () => ({ templateAssetUrl: async () => null }))
vi.mock('@/lib/style-anchor', () => ({
  resolveStyleAnchor: async () => null,
  applyStyleAnchor: (_anchor: unknown, base: unknown) => base,
}))

import { POST as generateSheetPOST } from '@/app/api/artist/generate-sheet/route'
import { POST as generateWorldPOST } from '@/app/api/artist/generate-world/route'
import { ModerationBlockedError, ModerationUnavailableError } from '@/lib/moderation/creem'

const PROJECT_ID = '11111111-1111-4111-8111-111111111111'
const USER_ID = 'user-1'
const WORKSPACE_ID = 'workspace-1'

let db: Record<string, Array<Record<string, unknown>>>

/** supabase-js 체인 최소 스텁 — 라우트가 실제로 쓰는 메서드만. */
function queryFor(table: string) {
  const q: Record<string, unknown> = {}
  for (const name of ['select', 'eq', 'in', 'order', 'gte', 'limit', 'not', 'is', 'update']) q[name] = () => q
  q.maybeSingle = q.single = async () => ({ data: db[table]?.[0] ?? null, error: null })
  q.then = (resolve: (value: unknown) => unknown) =>
    Promise.resolve({ data: db[table] ?? [], error: null }).then(resolve)
  return q
}

function jsonRequest(url: string, body: Record<string, unknown>) {
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function sheetRequest() {
  return generateSheetPOST(
    jsonRequest('http://localhost/api/artist/generate-sheet', {
      projectId: PROJECT_ID,
      characterId: 'character-1',
      appearanceKey: 'current',
      view: 'main',
    }),
  )
}

function worldRequest() {
  return generateWorldPOST(
    jsonRequest('http://localhost/api/artist/generate-world', {
      projectId: PROJECT_ID,
      locationId: 'location-1',
      column: 'wide_shot',
      prompt: 'a quiet harbor at dawn',
    }),
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  db = {
    projects: [{
      id: PROJECT_ID,
      workspace_id: WORKSPACE_ID,
      design_tokens: { l1: { art_style: 'ink' } },
      style_anchor_key: null,
      custom_style_anchor: null,
      settings: null,
    }],
    characters: [{
      project_id: PROJECT_ID,
      character_id: 'character-1',
      name: '카이',
      role: 'protagonist',
      costume: null,
      entity_type: 'person',
    }],
    character_appearances: [{
      project_id: PROJECT_ID,
      character_id: 'character-1',
      appearance_key: 'current',
      is_default: true,
      appearance: '은발 검사',
      costume: null,
      sheet_url: null,
      portrait_url: null,
    }],
    locations: [{
      project_id: PROJECT_ID,
      location_id: 'location-1',
      name: '새벽 항구',
      wide_shot: null,
    }],
  }
  mocks.from.mockImplementation(queryFor)
  mocks.assertUserTextAllowed.mockRejectedValue(new ModerationBlockedError('deny', 'mod_1'))
})

describe('내용 검사에 걸린 그림의 대상 알리기', () => {
  // 왜: 인물 시트가 막히면 작업 행이 없어 카드에 아무 표시도 남지 않는다 — 응답의 이름이 "어느 인물의
  //   설명을 고쳐야 하나"를 화면에 전하는 유일한 길이다.
  it('인물 그림이 제출 전 내용 검사에 걸리면 거절 응답에 그 인물 이름이 들어 있다', async () => {
    const response = await sheetRequest()

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      code: 'content_policy_blocked',
      policyUrl: '/acceptable-use',
      target: { kind: 'character', name: '카이' },
    })
    expect(mocks.reserveGenerationJob).not.toHaveBeenCalled()
    expect(mocks.falImageSubmit).not.toHaveBeenCalled()
  })

  // 왜: 배경도 같은 상태를 겪는다 — 인물만 이름이 보이면 배경이 막힌 학생은 여전히 어디를 고칠지 모른다.
  it('배경 그림이 제출 전 내용 검사에 걸리면 거절 응답에 그 배경 이름이 들어 있다', async () => {
    const response = await worldRequest()

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      code: 'content_policy_blocked',
      target: { kind: 'world', name: '새벽 항구' },
    })
    expect(mocks.falImageSubmit).not.toHaveBeenCalled()
  })

  // 왜: 검사 장애는 사용자 글의 문제가 아니다 — 이름을 붙이면 "저 인물 설명이 잘못됐다"는 잘못된 안내가 된다.
  it('검사 장애로 멈추면 거절 응답에 이름을 넣지 않는다', async () => {
    mocks.assertUserTextAllowed.mockRejectedValue(new ModerationUnavailableError('timeout'))

    const sheet = await sheetRequest()
    const world = await worldRequest()
    const sheetBody = (await sheet.json()) as Record<string, unknown>
    const worldBody = (await world.json()) as Record<string, unknown>

    expect(sheet.status).toBe(503)
    expect(world.status).toBe(503)
    expect(sheetBody.code).toBe('moderation_unavailable')
    expect(sheetBody).not.toHaveProperty('target')
    expect(worldBody).not.toHaveProperty('target')
  })

  // 왜: 거절은 작업 행을 남기지 않아 관측 이벤트가 유일한 흔적이다 — 어느 대상이 자주 걸리는지 세려면
  //   기록에도 종류와 이름이 있어야 한다.
  it('거절 기록에도 걸린 대상의 종류와 이름이 남는다', async () => {
    await sheetRequest()

    expect(mocks.recordWriterObservabilityEvent).toHaveBeenCalledWith(
      PROJECT_ID,
      'generation_submit_rejected_content_policy',
      expect.objectContaining({ kind: 'character_view', targetKind: 'character', targetName: '카이' }),
    )
  })

  // 왜: 이름은 안내를 좋게 하는 덧붙임이다 — 이름을 읽다 실패했다고 배경 생성 경로가 500 으로 죽으면
  //   덧붙임이 본 기능을 망친다(2026-11-25 오너 조건).
  it('배경 이름을 읽지 못하면 이름 없이 거절 응답을 보낸다', async () => {
    mocks.from.mockImplementation((table: string) => {
      if (table === 'locations') throw new Error('locations read failed')
      return queryFor(table)
    })

    const response = await worldRequest()

    expect(response.status).toBe(400)
    const body = (await response.json()) as Record<string, unknown>
    expect(body.code).toBe('content_policy_blocked')
    expect(body).not.toHaveProperty('target')
  })

  // 왜: 이름 읽기는 거절될 때만 필요하다 — 정상 생성에서도 매번 읽으면 모든 배경 생성에 조회가 하나 늘어난다.
  it('검사를 통과하면 배경 이름을 읽지 않는다', async () => {
    mocks.assertUserTextAllowed.mockResolvedValue({
      decision: 'allow',
      id: 'mod_ok',
      checked_at: '2026-10-11T00:00:00.000Z',
      chars: 10,
    })
    mocks.reserveGenerationJob.mockResolvedValue({
      id: 'job-1',
      project_id: PROJECT_ID,
      fal_key_id: 'key-1',
      request_id: 'reserved:job-1',
      status: 'queued',
    })
    mocks.falImageSubmit.mockResolvedValue({ request_id: 'fal-1', model: 'm', fal_key_id: 'key-1' })

    await worldRequest()

    expect(mocks.from.mock.calls.filter(([table]) => table === 'locations')).toHaveLength(0)
  })
})
