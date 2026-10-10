// 인물·배경·일반·러프 편집 이미지 경로는 Creem 검사에 막히면 자리 예약도 외부 제출도 하지 않는다
import { beforeEach, describe, expect, it, vi } from 'vitest'

// 검사는 자리 예약(generation_jobs 행)·Take·제출보다 먼저다. 막힌 요청이 작업 행을 남기면
//   "유료 작업이 생겼는데 결과가 없다"가 되고, 제출까지 가면 돈이 나간 뒤 거절이다.
const mocks = vi.hoisted(() => ({
  assertUserTextAllowed: vi.fn(),
  reserveGenerationJob: vi.fn(),
  falImageSubmit: vi.fn(),
  generateReservedImage: vi.fn(),
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
vi.mock('@/lib/fal/generate-image', () => ({ generateReservedImage: mocks.generateReservedImage }))
vi.mock('@/lib/writer/debug-events', () => ({ recordWriterObservabilityEvent: mocks.recordWriterObservabilityEvent }))
vi.mock('@/lib/fal/webhook-url', () => ({ resolveWebhookUrl: () => undefined, resolveWebhookBaseUrl: () => null }))
vi.mock('@/lib/storage/template-asset', () => ({ templateAssetUrl: async () => null }))
vi.mock('@/lib/style-anchor', () => ({
  resolveStyleAnchor: async () => null,
  applyStyleAnchor: (_anchor: unknown, base: unknown) => base,
}))

import { POST as generateSheetPOST } from '@/app/api/artist/generate-sheet/route'
import { POST as generateWorldPOST } from '@/app/api/artist/generate-world/route'
import { POST as generateImagePOST } from '@/app/api/generate/image/route'
import { triggerCharacterDrafts } from '@/lib/artist/draft-trigger'
import { ModerationBlockedError, ModerationUnavailableError } from '@/lib/moderation/creem'
import { regenerateRoughFrame } from '@/lib/writer/directing-edit'

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
    shots: [{
      project_id: PROJECT_ID,
      shot_id: 'sh_01_01',
      action_description: '칼을 내려놓는다',
      rough_storyboard: {
        status: 'completed',
        generatedAt: 1000,
        frames: {
          start: 'https://media.test/m/a/start.png',
          direction: 'https://media.test/m/a/direction.png',
          end: 'https://media.test/m/a/end.png',
        },
      },
    }],
  }
  mocks.from.mockImplementation(queryFor)
  mocks.assertUserTextAllowed.mockRejectedValue(new ModerationBlockedError('deny', 'mod_1'))
})

describe('이미지 경로의 내용 규칙 차단', () => {
  // 왜: 막힌 요청이 작업 행을 만들면 결과 없는 유료 작업이 장부에 남고, 제출까지 가면 돈이 먼저 나간다.
  it('인물 시트가 검사에 막히면 예약도 제출도 하지 않는다', async () => {
    const response = await generateSheetPOST(
      jsonRequest('http://localhost/api/artist/generate-sheet', {
        projectId: PROJECT_ID,
        characterId: 'character-1',
        appearanceKey: 'current',
        view: 'main',
      }),
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      code: 'content_policy_blocked',
      policyUrl: '/acceptable-use',
    })
    expect(mocks.reserveGenerationJob).not.toHaveBeenCalled()
    expect(mocks.falImageSubmit).not.toHaveBeenCalled()
    // 거절은 작업 행이 없으므로 관측 이벤트가 유일한 흔적이다.
    expect(mocks.recordWriterObservabilityEvent).toHaveBeenCalledWith(
      PROJECT_ID,
      'generation_submit_rejected_content_policy',
      expect.objectContaining({ kind: 'character_view', decision: 'deny' }),
    )
  })

  // 왜: 완화 재시도(safe)는 문구만 부드럽게 바꿔 다시 내는 경로다 — 영수증을 물려받으면 바뀐 문구가
  //   검사 없이 나간다. 매번 새로 검사해야 한다(2026-10-11 결정).
  it('문구를 완화한 재시도도 매번 다시 검사하고 막히면 제출하지 않는다', async () => {
    const response = await generateSheetPOST(
      jsonRequest('http://localhost/api/artist/generate-sheet', {
        projectId: PROJECT_ID,
        characterId: 'character-1',
        appearanceKey: 'current',
        view: 'main',
        safeMode: true,
      }),
    )

    expect(mocks.assertUserTextAllowed).toHaveBeenCalledTimes(1)
    expect(response.status).toBe(400)
    expect(mocks.falImageSubmit).not.toHaveBeenCalled()
  })

  // 왜: 배경도 같은 관문을 지난다 — 경로마다 판정이 다르면 한 곳만 열려도 전체가 뚫린다.
  it('배경 이미지가 검사에 막히면 예약도 제출도 하지 않는다', async () => {
    const response = await generateWorldPOST(
      jsonRequest('http://localhost/api/artist/generate-world', {
        projectId: PROJECT_ID,
        locationId: 'location-1',
        column: 'wide_shot',
        prompt: 'a quiet harbor at dawn',
      }),
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({ code: 'content_policy_blocked' })
    expect(mocks.reserveGenerationJob).not.toHaveBeenCalled()
    expect(mocks.falImageSubmit).not.toHaveBeenCalled()
  })

  // 왜: 자동 초안은 사람이 누르지 않은 생성이다 — 검사를 건너뛰면 아무도 안 본 글이 모델로 간다.
  it('자동 초안이 검사에 막히면 예약도 제출도 하지 않는다', async () => {
    const result = await triggerCharacterDrafts(PROJECT_ID)

    expect(result).toMatchObject({ submitted: 0, failed: 1 })
    expect(mocks.reserveGenerationJob).not.toHaveBeenCalled()
    expect(mocks.falImageSubmit).not.toHaveBeenCalled()
  })

  // 왜: 일반 이미지 라우트는 캔버스·에셋 노드가 쓰는 또 하나의 생성 입구다.
  it('일반 이미지 생성이 검사에 막히면 예약도 제출도 하지 않는다', async () => {
    const response = await generateImagePOST(
      jsonRequest('http://localhost/api/generate/image', {
        projectId: PROJECT_ID,
        prompt: 'a lantern on a wet street',
      }),
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({ code: 'content_policy_blocked' })
    expect(mocks.generateReservedImage).not.toHaveBeenCalled()
  })

  // 왜: 러프 한 장 다시 그리기에는 사용자 액션 설명이 그대로 실린다(DIRECTING 프레임).
  it('러프 한 장 다시 그리기가 검사에 막히면 예약도 제출도 하지 않는다', async () => {
    await expect(regenerateRoughFrame(PROJECT_ID, 'sh_01_01', 'direction')).rejects.toBeInstanceOf(
      ModerationBlockedError,
    )

    expect(mocks.generateReservedImage).not.toHaveBeenCalled()
  })

  // 왜: 검사 장애를 통과로 해석하면 장애 시간대의 생성이 전부 검사 없이 나간다 — 503 으로 세운다.
  it('검사 장애면 이미지를 제출하지 않고 잠시 후 다시 시도로 답한다', async () => {
    mocks.assertUserTextAllowed.mockRejectedValue(new ModerationUnavailableError('timeout'))

    const response = await generateImagePOST(
      jsonRequest('http://localhost/api/generate/image', {
        projectId: PROJECT_ID,
        prompt: 'a lantern on a wet street',
      }),
    )

    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toMatchObject({ code: 'moderation_unavailable' })
    expect(mocks.generateReservedImage).not.toHaveBeenCalled()
    expect(mocks.recordWriterObservabilityEvent).toHaveBeenCalledWith(
      PROJECT_ID,
      'generation_submit_rejected_moderation_unavailable',
      expect.objectContaining({ kind: 'image_generation', reason: 'timeout' }),
    )
  })
})

describe('이미지 경로가 검사에 보내는 글', () => {
  beforeEach(() => {
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
  })

  // 왜: 우리 고정 템플릿까지 보내면 'no people' 같은 우리 문구가 오탐을 만들고 글자 수만큼 단가가 붙는다.
  it('인물 시트는 사용자가 쓴 칸만 보내고 시트 지시문은 보내지 않는다', async () => {
    await generateSheetPOST(
      jsonRequest('http://localhost/api/artist/generate-sheet', {
        projectId: PROJECT_ID,
        characterId: 'character-1',
        appearanceKey: 'current',
        view: 'main',
      }),
    )

    const parts = (mocks.assertUserTextAllowed.mock.calls[0][0] as Array<string | null | undefined>)
      .filter((part): part is string => typeof part === 'string' && part.trim().length > 0)
    expect(parts).toContain('은발 검사')
    expect(parts.join('\n')).not.toMatch(/turnaround|reference image|full body/i)
    expect(mocks.assertUserTextAllowed.mock.calls[0][1]).toMatchObject({
      projectId: PROJECT_ID,
      kind: 'character_view',
      userId: USER_ID,
    })
  })

  // 왜: 배경 프롬프트의 사람 금지 절은 서버가 붙인 우리 문구다 — 검사 대상이 아니다.
  it('배경 이미지는 사용자가 보낸 설명만 보내고 사람 금지 절은 보내지 않는다', async () => {
    await generateWorldPOST(
      jsonRequest('http://localhost/api/artist/generate-world', {
        projectId: PROJECT_ID,
        locationId: 'location-1',
        column: 'wide_shot',
        prompt: 'a quiet harbor at dawn',
      }),
    )

    expect(mocks.assertUserTextAllowed.mock.calls[0][0]).toEqual(['a quiet harbor at dawn'])
  })

  // 왜: "이 작업은 언제 무엇으로 통과했나"를 나중에 읽을 수 있어야 한다. 생성 입력 스냅샷은 같은 요구면
  //   같은 내용이어야 하므로(채팅·화면 동일성) 영수증은 작업 기록 이벤트에 남긴다.
  it('통과한 검사를 작업 id 와 함께 기록하고 생성 입력에는 넣지 않는다', async () => {
    await generateSheetPOST(
      jsonRequest('http://localhost/api/artist/generate-sheet', {
        projectId: PROJECT_ID,
        characterId: 'character-1',
        appearanceKey: 'current',
        view: 'main',
      }),
    )

    expect(mocks.recordWriterObservabilityEvent).toHaveBeenCalledWith(
      PROJECT_ID,
      'generation_submit_moderation_passed',
      expect.objectContaining({
        jobId: 'job-1',
        kind: 'character_view',
        moderationId: 'mod_ok',
        decision: 'allow',
        checkedAt: '2026-10-11T00:00:00.000Z',
      }),
      expect.objectContaining({ generationJobId: 'job-1' }),
    )
    // 프롬프트 본문은 기록에 싣지 않는다 — 길이와 해시만.
    const payload = mocks.recordWriterObservabilityEvent.mock.calls.find(
      (call) => call[1] === 'generation_submit_moderation_passed',
    )?.[2] as Record<string, unknown>
    expect(payload).not.toHaveProperty('prompt')
    expect(mocks.reserveGenerationJob.mock.calls[0][0].inputSnapshot).not.toHaveProperty('moderation')
    // 검사가 제출보다 먼저다. 제출 인자에는 영수증이 섞이지 않는다 — fal 로 나가는 값은 "보낼 입력"
    //   뿐이고, 검사를 건너뛴 제출은 타입 표식이 없어 타입 오류가 난다
    //   (tests/moderation/_unmoderated-submit-typecheck.ts).
    expect(mocks.assertUserTextAllowed.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.falImageSubmit.mock.invocationCallOrder[0],
    )
    expect(mocks.falImageSubmit.mock.calls[0][0]).not.toHaveProperty('moderation')
    expect(mocks.falImageSubmit.mock.calls[0][1]).not.toHaveProperty('moderation')
  })
})
