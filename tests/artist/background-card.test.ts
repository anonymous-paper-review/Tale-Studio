// 약속 B — 배경 카드는 캐릭터 카드와 같은 일을 할 수 있다 (_tdd.md B, 2026-09-04 오너 확정)
//
//   상위 약속: 배경 카드는 캐릭터 카드와 같은 기능을 갖고, 차이는 프롬프트에 사람이 들어가지 않는 것뿐이다.
//   문장 하나 = 테스트 하나. 화면 모양(카드가 같은 모양, 영어 문구 없음)은 스크린샷으로 검수한다.
//   오너 결정: B5 기본 모델은 "지금 것" — 배경은 종전대로 GPT Image 2(DEFAULT_WORLD_IMAGE_MODEL), 캐릭터와 같은 것은 고를 수
//   있다는 기능이다. 모습(타임라인) 탭은 C 슬라이스.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  requireProjectAccess: vi.fn(),
  checkGenerationCapacity: vi.fn(),
  resolveStyleAnchor: vi.fn(),
  submitWorldShotJob: vi.fn(),
  hasQueuedWorldShotJob: vi.fn(),
  listFailedWorldShotJobs: vi.fn(),
  countFailedJobsForTarget: vi.fn(),
  locationI18nFields: vi.fn(),
}))

vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: mocks.from } }))
vi.mock('@/lib/demo/guard-server', () => ({ demoWriteBlock: () => null }))
vi.mock('@/lib/api/guard', () => ({ requireProjectAccess: mocks.requireProjectAccess }))
vi.mock('@/lib/generation-quota', () => ({ checkGenerationCapacity: mocks.checkGenerationCapacity }))
vi.mock('@/lib/api/quota', () => ({ quotaRejectionResponse: () => new Response('quota', { status: 429 }) }))
vi.mock('@/lib/style-anchor', () => ({ resolveStyleAnchor: mocks.resolveStyleAnchor }))
vi.mock('@/lib/artist/world-submit', () => ({ submitWorldShotJob: mocks.submitWorldShotJob }))
vi.mock('@/lib/chat-trace-server', () => ({ chatTraceBelongsToProject: async () => true }))
vi.mock('@/lib/chat-trace', () => ({ isChatTraceId: (v: unknown) => typeof v === 'string' }))
vi.mock('@/lib/writer/i18n/derive-en', () => ({ locationI18nFields: mocks.locationI18nFields }))
vi.mock('@/lib/generation-jobs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/generation-jobs')>()
  return {
    ...actual,
    hasQueuedWorldShotJob: mocks.hasQueuedWorldShotJob,
    listFailedWorldShotJobs: mocks.listFailedWorldShotJobs,
    countFailedJobsForTarget: mocks.countFailedJobsForTarget,
  }
})

import { POST as generateWorld } from '@/app/api/artist/generate-world/route'
import { POST as selectLocationCandidate } from '@/app/api/artist/select-location-candidate/route'
import { PATCH as patchLocation } from '@/app/api/artist/location/route'
import {
  NO_PEOPLE_CLAUSE,
  WORLD_SAFE_TOKENS,
  applyWorldSafeMode,
  ensureNoPeopleClause,
  worldShotPrompt,
} from '@/lib/artist/world-prompt'
import {
  CANDIDATE_RETENTION,
  classifyWorldImageStale,
  computeWorldDescriptionHash,
  selectCandidatesToEvict,
} from '@/lib/image-provenance'
import { extractLocationProposals, validateUpdates } from '@/lib/artist/chat-updates'
import { createPendingProposal } from '@/lib/pending-proposal'
import { DEFAULT_IMAGE_MODEL, DEFAULT_WORLD_IMAGE_MODEL } from '@/lib/image-models'
import { SAFE_RETRY_CAP } from '@/lib/artist/safe-retry'

const ROOT = process.cwd()
const read = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8')

/** supabase 쿼리 체인 모의 — 어떤 메서드를 이어 불러도 같은 결과로 끝난다. */
function query(result: unknown) {
  const value: Record<string, unknown> = {}
  for (const m of ['select', 'update', 'insert', 'delete', 'eq', 'match', 'in', 'gte', 'order']) {
    value[m] = vi.fn(() => value)
  }
  value.maybeSingle = vi.fn(async () => result)
  value.single = vi.fn(async () => result)
  value.then = (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
    Promise.resolve(result).then(onFulfilled, onRejected)
  return value
}

function post(url: string, body: unknown, method = 'POST') {
  return new NextRequest(`http://localhost${url}`, {
    method,
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  })
}

const PROJECT = 'proj-1'
const LOCATION = 'neon_market'

beforeEach(() => {
  vi.resetAllMocks()
  mocks.requireProjectAccess.mockResolvedValue({ ok: true, userId: 'user-1' })
  mocks.checkGenerationCapacity.mockResolvedValue({ ok: true })
  mocks.resolveStyleAnchor.mockResolvedValue(null)
  mocks.hasQueuedWorldShotJob.mockResolvedValue(false)
  mocks.listFailedWorldShotJobs.mockResolvedValue([])
  mocks.countFailedJobsForTarget.mockResolvedValue(0)
  mocks.submitWorldShotJob.mockResolvedValue({ id: 'job-1' })
  mocks.from.mockImplementation(() => query({ data: { workspace_id: 'ws-1', style_anchor_key: null, custom_style_anchor: null }, error: null }))
})

describe('약속 B — 배경 카드는 캐릭터 카드와 같다', () => {
  it('배경 프롬프트에는 사람이 들어가지 않는다는 지시가 항상 붙는다', async () => {
    // 기본 프롬프트 빌더
    expect(worldShotPrompt('rain-slick alley', 'night', 'tense', null, 'wideShot')).toContain(NO_PEOPLE_CLAUSE)
    // 사용자가 팝업에서 고친 프롬프트에도 붙는다(멱등)
    expect(ensureNoPeopleClause('a quiet harbor at dawn')).toBe(`a quiet harbor at dawn, ${NO_PEOPLE_CLAUSE}`)
    expect(ensureNoPeopleClause(`a quiet harbor, ${NO_PEOPLE_CLAUSE}`)).toBe(`a quiet harbor, ${NO_PEOPLE_CLAUSE}`)
    expect(ensureNoPeopleClause('empty street, no humans')).toBe('empty street, no humans')
    // 서버가 최종 보장한다 — 클라이언트가 절을 빼고 보내도 제출 프롬프트에는 들어 있다.
    const res = await generateWorld(post('/api/artist/generate-world', { projectId: PROJECT, locationId: LOCATION, column: 'wide_shot', prompt: 'a quiet harbor at dawn' }))
    expect(res.status).toBe(200)
    expect(mocks.submitWorldShotJob).toHaveBeenCalledTimes(1)
    expect(mocks.submitWorldShotJob.mock.calls[0][0].prompt).toContain(NO_PEOPLE_CLAUSE)
  })

  it('배경 카드 위에 "이미지 생성" 버튼이 없다. 캐릭터처럼 팝업이나 채팅으로 만든다', () => {
    const panel = read('src/features/artist/world-panel.tsx')
    expect(panel).not.toMatch(/t\('Generate image'\)/)
    expect(panel).not.toMatch(/generateWorldAsset\(/)
    expect(panel).not.toMatch(/Generating…/) // 카드에 남아 있던 번역 안 된 영어 문구
    // 카드 클릭은 여전히 팝업을 연다
    expect(panel).toMatch(/setViewDialog\(\{ locationId: world\.locationId, shot: 'wideShot', appearanceKey: variantKey \}\)/)
  })

  it('배경 팝업에서 프롬프트를 고치고 닫았다 열어도 남아 있고, 배경 원천 설명에 저장돼 Writer 씬에도 반영된다', async () => {
    // 팝업 텍스트 상자의 초기값은 배경 설명(원천) — 임시 프롬프트가 아니라 저장된 설명이라 닫았다 열어도 같다.
    const dialog = read('src/features/artist/world-view-dialog.tsx')
    expect(dialog).toMatch(/worldDescriptionDraft\(world\)/)
    expect(dialog).toMatch(/updateLocationDescription\(world\.locationId, next\)/)
    // 원천 저장 라우트 — locations.visual_description(+native) 를 갱신하고 user_edited 를 세운다.
    mocks.locationI18nFields.mockResolvedValue({
      visual_description: 'rainy neon market at night',
      visual_description_native: '비 오는 밤의 네온 시장',
      i18n_provenance: { visual_description: 'h' },
    })
    const q = query({ data: [{ location_id: LOCATION }], error: null })
    mocks.from.mockImplementation(() => q)
    const res = await patchLocation(post('/api/artist/location', { projectId: PROJECT, locationId: LOCATION, visualDescription: '비 오는 밤의 네온 시장' }, 'PATCH'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.visualDescription).toBe('rainy neon market at night')
    expect(body.visualDescriptionNative).toBe('비 오는 밤의 네온 시장')
    expect(mocks.from).toHaveBeenCalledWith('locations')
    const updateArg = (q.update as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(updateArg).toMatchObject({ visual_description: 'rainy neon market at night', visual_description_native: '비 오는 밤의 네온 시장', user_edited: true })
    // 빈 설명은 거부한다.
    const empty = await patchLocation(post('/api/artist/location', { projectId: PROJECT, locationId: LOCATION, visualDescription: '  ' }, 'PATCH'))
    expect(empty.status).toBe(400)
  })

  it('배경 이미지를 다시 만들면 직전 이미지들이 히스토리에 남아 되돌릴 수 있다(최근 5장)', async () => {
    // finalize 의 배경 경로가 캐릭터와 같은 보관 규칙(선택본 + 최근 5장)을 쓴다.
    const finalize = read('src/lib/fal/finalize.ts')
    const worldPart = finalize.slice(finalize.indexOf('async function recordLocationImageCandidate'), finalize.indexOf('export async function finalizeWorldShotJob'))
    expect(worldPart).toContain('selectCandidatesToEvict')
    expect(worldPart).not.toMatch(/\.delete\(\)\s*\.match\(slot\)\s*\.eq\('is_selected', false\)/)
    expect(CANDIDATE_RETENTION).toBe(5)
    const many = Array.from({ length: 8 }, (_, i) => ({ id: `c${i}`, isSelected: i === 0, pinned: false, generatedAt: `2026-09-0${i + 1}T00:00:00Z` }))
    const evicted = selectCandidatesToEvict(many)
    expect(evicted).toHaveLength(8 - CANDIDATE_RETENTION)
    expect(evicted).not.toContain('c0')
    // 되돌리기 라우트 — 슬롯 안 후보만 선택본으로 flip 하고 locations.wide_shot 을 미러한다.
    const q = query({ data: { id: 'cand-2', url: 'https://x/old.png' }, error: null })
    mocks.from.mockImplementation(() => q)
    const res = await selectLocationCandidate(post('/api/artist/select-location-candidate', { projectId: PROJECT, locationId: LOCATION, candidateId: 'cand-2' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, url: 'https://x/old.png' })
    expect(mocks.from).toHaveBeenCalledWith('location_image_candidates')
    expect(mocks.from).toHaveBeenCalledWith('locations')
    const updates = (q.update as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0])
    expect(updates).toContainEqual({ is_selected: false })
    expect(updates).toContainEqual({ is_selected: true })
    expect(updates).toContainEqual({ wide_shot: 'https://x/old.png' })
    // 팝업에 히스토리 띠가 있다(2장 이상일 때).
    expect(read('src/features/artist/world-view-dialog.tsx')).toMatch(/candidates\.length >= 2/)
  })

  it('배경 팝업에서 모델을 고를 수 있고 기본은 지금 것(GPT Image 2)이다', async () => {
    // 오너 B5: 배경은 종전대로 GPT Image 2 로 첫 생성한다(캐릭터 기본은 nano-banana-2 — 같은 것은 "고를 수 있다"는 기능).
    const dialog = read('src/features/artist/world-view-dialog.tsx')
    expect(dialog).toMatch(/useState<ImageModelKey>\(DEFAULT_WORLD_IMAGE_MODEL\)/)
    expect(dialog).toMatch(/IMAGE_MODEL_ORDER\.map/)
    expect(DEFAULT_WORLD_IMAGE_MODEL).toBe('gpt-image-2')
    expect(DEFAULT_IMAGE_MODEL).toBe('nano-banana-2')
    // 라우트: model 을 안 보내면 기본값(null → submit 이 DEFAULT_WORLD_IMAGE_MODEL 로), 보내면 그대로, 모르는 값은 무시.
    await generateWorld(post('/api/artist/generate-world', { projectId: PROJECT, locationId: LOCATION, column: 'wide_shot', prompt: 'p' }))
    expect(mocks.submitWorldShotJob.mock.calls[0][0].model).toBeNull()
    await generateWorld(post('/api/artist/generate-world', { projectId: PROJECT, locationId: LOCATION, column: 'wide_shot', prompt: 'p', model: 'gpt-image-2' }))
    expect(mocks.submitWorldShotJob.mock.calls[1][0].model).toBe('gpt-image-2')
    await generateWorld(post('/api/artist/generate-world', { projectId: PROJECT, locationId: LOCATION, column: 'wide_shot', prompt: 'p', model: 'not-a-model' }))
    expect(mocks.submitWorldShotJob.mock.calls[2][0].model).toBeNull()
  })

  it('채팅에서 배경 설명을 바꿔 달라고 하면 승인 카드가 뜨고, 승인하면 원천 설명이 바뀐다', () => {
    const raw = [
      { type: 'changeLocationDescription', locationId: LOCATION, visualDescription: '비 오는 밤의 네온 시장' },
      { type: 'changeLocationDescription', locationId: '', visualDescription: 'x' },
      { type: 'regenerateWorldAsset', locationId: LOCATION },
    ]
    // 자동 실행 화이트리스트에는 없다(원천 변경은 승인 게이트로만).
    expect(validateUpdates(raw).some((u) => (u as { type: string }).type === 'changeLocationDescription')).toBe(false)
    expect(extractLocationProposals(raw)).toEqual([{ locationId: LOCATION, visualDescription: '비 오는 밤의 네온 시장' }])
    // 승인 카드 종류가 있고 직렬화된다.
    const proposal = createPendingProposal({
      stage: 'artist',
      kind: 'artistSourceLocationPatch',
      target: '네온 시장',
      action: 'Change the background description',
      impact: [],
      payload: { locationId: LOCATION, visualDescription: '비 오는 밤의 네온 시장' },
    })
    expect(JSON.parse(JSON.stringify(proposal)).kind).toBe('artistSourceLocationPatch')
    // 승인 경로가 원천 저장 액션을 부른다.
    const store = read('src/stores/global-chat-store.ts')
    expect(store).toMatch(/proposal\.kind === 'artistSourceLocationPatch'/)
    expect(store).toMatch(/updateLocationDescription\(locationId, visualDescription\)/)
    // 채팅 라우트가 제안을 응답에 싣고, 안내문이 모델에게 그 형식을 알려 준다.
    const route = read('src/app/api/artist/chat/route.ts')
    expect(route).toMatch(/locationProposals: extractLocationProposals\(raw\)/)
    expect(route).toMatch(/"type":"changeLocationDescription"/)
  })

  it('배경 설명이 바뀐 뒤 이미지를 다시 만들지 않았으면 카드에 "설명 바뀜" 표시가 뜨고, 다시 만들면 사라진다', () => {
    const hash = computeWorldDescriptionHash('비 오는 밤의 네온 시장')
    // 이미지를 만들 때의 설명과 같으면 fresh, 설명이 바뀌면 edited.
    expect(classifyWorldImageStale('비 오는 밤의 네온 시장', { appearanceHash: hash })).toBe('fresh')
    expect(classifyWorldImageStale('맑은 낮의 네온 시장', { appearanceHash: hash })).toBe('edited')
    // 다시 만들면 새 후보가 지금 설명의 해시를 갖는다 → fresh (표시가 사라진다).
    expect(classifyWorldImageStale('맑은 낮의 네온 시장', { appearanceHash: computeWorldDescriptionHash('맑은 낮의 네온 시장') })).toBe('fresh')
    // 해시가 없는 옛 후보는 판단하지 않는다(옛 프로젝트 전체에 경고가 뜨지 않게).
    expect(classifyWorldImageStale('아무 설명', { appearanceHash: null })).toBe('fresh')
    expect(classifyWorldImageStale('아무 설명', undefined)).toBe('fresh')
    // 카드가 이 판정으로 배지를 그린다.
    const panel = read('src/features/artist/world-panel.tsx')
    expect(panel).toMatch(/classifyWorldImageStale\(variant \? variant\.visualDescription : world\.visualDescription, selectedCandidate\)/)
    expect(panel).toMatch(/t\('Description changed'\)/)
  })

  it('배경 이미지 생성이 실패하면 카드에 실패 표시가 뜨고 다시 시도할 수 있다', () => {
    // 실패 근거는 서버 상태 조회(generation-status → worldFailures), 카드는 배지, 팝업은 재생성 버튼.
    expect(read('src/app/api/artist/generation-status/route.ts')).toMatch(/listFailedWorldShotJobs\(projectId\)/)
    const panel = read('src/features/artist/world-panel.tsx')
    expect(panel).toMatch(/worldFailures\[worldFailureKey\(world\.locationId, variantKey\)\]/)
    expect(panel).toMatch(/t\('Image failed'\)/)
    const dialog = read('src/features/artist/world-view-dialog.tsx')
    expect(dialog).toMatch(/s\.worldFailures\[worldFailureKey\(locationId, variantKey\)\]/)
    expect(dialog).toMatch(/t\('Generation failed\. Please try again\.'\)/)
  })

  it('안전 필터에 걸리면 우회(safe)로 다시 시도할 수 있다', async () => {
    // 순화 변환: 유혈·그래픽 낱말을 걷고 순화 토큰을 붙인다. 평범한 프롬프트는 토큰만 더해진다.
    const safe = applyWorldSafeMode('a blood-soaked battlefield with corpses, rain-slick alley')
    expect(safe).not.toMatch(/blood|corpses/)
    expect(safe).toContain('rain-slick alley')
    expect(safe).toContain(WORLD_SAFE_TOKENS)
    // 라우트: 슬롯의 최근 실패가 moderation 류일 때만 순화 변환을 적용하고, 우회 상한을 넘으면 건너뛴다.
    mocks.listFailedWorldShotJobs.mockResolvedValue([{ locationId: LOCATION, column: 'wide_shot', error: 'content policy', failCount: 1, safeFailCount: 0, moderation: true }])
    const res = await generateWorld(post('/api/artist/generate-world', { projectId: PROJECT, locationId: LOCATION, column: 'wide_shot', prompt: 'a gory battlefield', safeMode: true }))
    expect(res.status).toBe(200)
    const submitted = mocks.submitWorldShotJob.mock.calls[0][0]
    expect(submitted.safeMode).toBe(true)
    expect(submitted.prompt).not.toMatch(/gory/)
    expect(submitted.prompt).toContain(NO_PEOPLE_CLAUSE)
    mocks.listFailedWorldShotJobs.mockResolvedValue([{ locationId: LOCATION, column: 'wide_shot', error: 'content policy', failCount: 3, safeFailCount: SAFE_RETRY_CAP, moderation: true }])
    const capped = await generateWorld(post('/api/artist/generate-world', { projectId: PROJECT, locationId: LOCATION, column: 'wide_shot', prompt: 'a gory battlefield', safeMode: true }))
    expect(await capped.json()).toMatchObject({ ok: true, skipped: true, reason: 'capped' })
    expect(mocks.submitWorldShotJob).toHaveBeenCalledTimes(1)
    // 일반 실패(모더레이션 아님)는 원본 프롬프트 그대로 재시도한다.
    mocks.listFailedWorldShotJobs.mockResolvedValue([{ locationId: LOCATION, column: 'wide_shot', error: 'timeout', failCount: 1, safeFailCount: 0, moderation: false }])
    await generateWorld(post('/api/artist/generate-world', { projectId: PROJECT, locationId: LOCATION, column: 'wide_shot', prompt: 'a gory battlefield', safeMode: true }))
    expect(mocks.submitWorldShotJob.mock.calls[1][0].safeMode).toBe(false)
    expect(mocks.submitWorldShotJob.mock.calls[1][0].prompt).toContain('a gory battlefield')
    // 팝업의 우회 버튼
    expect(read('src/features/artist/world-view-dialog.tsx')).toMatch(/retryWorldShotSafe\(world\.locationId, imageModel, variantKey\)/)
  })

  it('같은 슬롯에 이미 도는 잡이 있으면 새로 제출하지 않는다(캐릭터와 같은 중복 가드)', async () => {
    mocks.hasQueuedWorldShotJob.mockResolvedValue(true)
    const res = await generateWorld(post('/api/artist/generate-world', { projectId: PROJECT, locationId: LOCATION, column: 'wide_shot', prompt: 'p' }))
    expect(await res.json()).toMatchObject({ ok: true, deduped: true })
    expect(mocks.submitWorldShotJob).not.toHaveBeenCalled()
  })
})
