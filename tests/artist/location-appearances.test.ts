// 약속 C(열 번째) — 배경도 캐릭터와 같은 모습(타임라인) 탭을 갖는다 (_tdd.md B10·C, 2026-09-04)
//
//   기본 모습 = locations 행(키 'default'), 변형 = location_appearances 행. 새 변형은 만든 직후 기본 배경을 참조해
//   이미지를 자동 생성한다(오너 C4). Writer/Director 는 씬의 서사 시점과 같은 변형에 이미지가 있으면 그것을 쓴다.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  requireProjectAccess: vi.fn(),
  locationI18nFields: vi.fn(),
  submitWorldShotJob: vi.fn(),
  hasQueuedWorldShotJob: vi.fn(),
  listFailedWorldShotJobs: vi.fn(),
  countFailedJobsForTarget: vi.fn(),
}))
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: mocks.from } }))
vi.mock('@/lib/demo/guard-server', () => ({ demoWriteBlock: () => null }))
vi.mock('@/lib/api/guard', () => ({ requireProjectAccess: mocks.requireProjectAccess }))
vi.mock('@/lib/writer/i18n/derive-en', () => ({ locationI18nFields: mocks.locationI18nFields }))
vi.mock('@/lib/generation-quota', () => ({ checkGenerationCapacity: async () => ({ ok: true }) }))
vi.mock('@/lib/api/quota', () => ({ quotaRejectionResponse: () => new Response('quota', { status: 429 }) }))
vi.mock('@/lib/style-anchor', () => ({ resolveStyleAnchor: async () => null }))
vi.mock('@/lib/artist/world-submit', () => ({ submitWorldShotJob: mocks.submitWorldShotJob }))
vi.mock('@/lib/chat-trace-server', () => ({ chatTraceBelongsToProject: async () => true }))
vi.mock('@/lib/chat-trace', () => ({ isChatTraceId: (v: unknown) => typeof v === 'string' }))
vi.mock('@/lib/generation-jobs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/generation-jobs')>()
  return {
    ...actual,
    hasQueuedWorldShotJob: mocks.hasQueuedWorldShotJob,
    listFailedWorldShotJobs: mocks.listFailedWorldShotJobs,
    countFailedJobsForTarget: mocks.countFailedJobsForTarget,
  }
})
vi.mock('@/lib/supabase/client', () => {
  const chain: Record<string, unknown> = {}
  for (const m of ['from', 'select', 'insert', 'update', 'upsert', 'eq', 'in', 'single', 'maybeSingle', 'order']) chain[m] = () => chain
  ;(chain as { then: (resolve: (value: unknown) => unknown) => unknown }).then = (resolve) => resolve({ data: null, error: null })
  return { createClient: () => chain }
})

import { POST as createAppearance, PATCH as patchAppearance, DELETE as deleteAppearance } from '@/app/api/artist/location-appearance/route'
import { POST as generateWorld } from '@/app/api/artist/generate-world/route'
import { resolveLocationAppearanceForScene, resolveSceneWorldRefs } from '@/lib/director/shot-references'
import { extractLocationAppearanceCreations, validateUpdates } from '@/lib/artist/chat-updates'
import { useArtistStore, worldFailureKey } from '@/stores/artist-store'
import { useProjectStore } from '@/stores/project-store'
import type { WorldAsset } from '@/types/asset'

const ROOT = process.cwd()
const read = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8')

function chain(result: unknown, single?: unknown) {
  const value: Record<string, unknown> = {}
  for (const m of ['select', 'update', 'insert', 'delete', 'eq', 'in', 'is', 'match', 'order', 'gte']) value[m] = vi.fn(() => value)
  value.maybeSingle = vi.fn(async () => single ?? result)
  value.single = vi.fn(async () => single ?? result)
  value.then = (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
    Promise.resolve(result).then(onFulfilled, onRejected)
  return value
}
function req(url: string, body: unknown, method: string) {
  return new NextRequest(`http://localhost${url}`, { method, body: JSON.stringify(body), headers: { 'content-type': 'application/json' } })
}

const world = (): WorldAsset => ({
  locationId: 'market',
  name: '네온 시장',
  sceneId: 'sc_01',
  wideShot: 'https://x/market.png',
  visualDescription: 'neon market at night',
  candidates: [],
  appearances: [
    { appearanceKey: 'burned', label: '불탄 뒤', narrativeTime: 'future', visualDescription: 'burned market', visualDescriptionNative: '불탄 시장', wideShot: null, candidates: [] },
  ],
})

beforeEach(() => {
  vi.resetAllMocks()
  mocks.requireProjectAccess.mockResolvedValue({ ok: true, userId: 'user-1' })
  mocks.locationI18nFields.mockImplementation(async (_id: string, native: string) => ({ visual_description: native, visual_description_native: native, i18n_provenance: {} }))
  mocks.hasQueuedWorldShotJob.mockResolvedValue(false)
  mocks.listFailedWorldShotJobs.mockResolvedValue([])
  mocks.countFailedJobsForTarget.mockResolvedValue(0)
  mocks.submitWorldShotJob.mockResolvedValue({ id: 'job-1' })
  useProjectStore.setState({ projectId: 'project-1' })
  useArtistStore.setState({ worldAssets: [world()], sceneManifest: null, generatingLocations: [], error: null })
})

describe('약속 C — 배경도 캐릭터와 같은 모습(타임라인) 탭을 갖는다', () => {
  it('배경 카드 위쪽에 모습 탭 줄이 항상 보이고 "+ 모습 추가"가 있다', () => {
    const panel = read('src/features/artist/world-panel.tsx')
    expect(panel).toMatch(/appearanceKey: DEFAULT_LOCATION_APPEARANCE_KEY, label: t\('Default'\)/)
    expect(panel).toMatch(/t\('\+ Add appearance'\)/)
    expect(panel).toMatch(/<LocationAppearanceCreateDialog locationId=\{createFor\}/)
    // 팝업은 고른 모습을 연다.
    expect(panel).toMatch(/appearanceKey=\{viewDialog\?\.appearanceKey \?\? null\}/)
  })

  it('"+ 모습 추가" 창에서 저장하면 변형 행이 생기고 이미지가 바로 만들어진다(기본 배경을 참조)', async () => {
    const dialog = read('src/features/artist/location-appearance-create-dialog.tsx')
    expect(dialog).toMatch(/createLocationAppearance\(world\.locationId, label\.trim\(\), description\.trim\(\), time, \{ generate: true, actor: 'ui' \}\)/)
    // 라우트: 변형 행 만들기(키 = 이름 슬러그, 'default' 는 예약).
    const q = chain({ data: [], error: null }, { data: { location_id: 'market' }, error: null })
    mocks.from.mockImplementation(() => q)
    const res = await createAppearance(req('/api/artist/location-appearance', { projectId: 'p', locationId: 'market', label: 'Default', narrativeTime: 'past', visualDescription: '전쟁 전 시장' }, 'POST'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.appearanceKey).not.toBe('default')
    expect((q.insert as ReturnType<typeof vi.fn>).mock.calls[0][0]).toMatchObject({ location_id: 'market', label: 'Default', narrative_time: 'past', visual_description: '전쟁 전 시장' })
    // 스토어: 만든 직후 그 모습으로 이미지 생성.
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true, locationId: 'market', appearanceKey: 'winter', label: '겨울', narrativeTime: 'past', visualDescription: 'snowy market', visualDescriptionNative: '눈 덮인 시장' }) })
    vi.stubGlobal('fetch', fetchMock)
    const generateWorldShot = vi.fn().mockResolvedValue(undefined)
    useArtistStore.setState({ generateWorldShot })
    const key = await useArtistStore.getState().createLocationAppearance('market', '겨울', '눈 덮인 시장', 'past', { generate: true, actor: 'ui' })
    expect(key).toBe('winter')
    expect(generateWorldShot).toHaveBeenCalledWith('market', 'wideShot', undefined, 'ui', undefined, { appearanceKey: 'winter' })
    expect(useArtistStore.getState().worldAssets[0].appearances?.map((a) => a.appearanceKey)).toEqual(['burned', 'winter'])
    vi.unstubAllGlobals()
    // 서버: 변형 생성은 기본 배경(wide_shot)을 연속성 참조로 붙이고 잡 타깃에 모습 키를 남긴다.
    mocks.from.mockImplementation((table: string) =>
      table === 'projects'
        ? chain({ data: { workspace_id: 'ws', style_anchor_key: null, custom_style_anchor: null }, error: null })
        : table === 'location_appearances'
          ? chain({ data: { appearance_key: 'burned' }, error: null })
          : chain({ data: { wide_shot: 'https://x/market.png' }, error: null }),
    )
    const gen = await generateWorld(req('/api/artist/generate-world', { projectId: 'p', locationId: 'market', column: 'wide_shot', prompt: 'burned market', appearanceKey: 'burned' }, 'POST'))
    expect(gen.status).toBe(200)
    const submitted = mocks.submitWorldShotJob.mock.calls[0][0]
    expect(submitted.appearanceKey).toBe('burned')
    expect(submitted.referenceImageUrls).toEqual(['https://x/market.png'])
    expect(mocks.hasQueuedWorldShotJob).toHaveBeenCalledWith('p', 'market', 'wide_shot', 'burned')
  })

  it('채팅에서 배경의 새 모습을 만들어 달라고 하면 승인 뒤 추가되고, 특정 모습만 다시 그릴 수 있다', () => {
    const raw = [
      { type: 'createLocationAppearance', locationId: 'market', label: '불탄 뒤', visualDescription: '불탄 시장', narrativeTime: 'future' },
      { type: 'regenerateWorldAsset', locationId: 'market', appearanceKey: 'burned' },
    ]
    expect(validateUpdates(raw)).toEqual([{ type: 'regenerateWorldAsset', locationId: 'market', appearanceKey: 'burned' }])
    expect(extractLocationAppearanceCreations(raw)).toEqual([{ locationId: 'market', label: '불탄 뒤', visualDescription: '불탄 시장', narrativeTime: 'future' }])
    const store = read('src/stores/global-chat-store.ts')
    expect(store).toMatch(/kind: 'artistCreateLocationAppearance'/)
    expect(store).toMatch(/createLocationAppearance\(locationId, label, visualDescription, time, \{ generate: true, actor: 'chat' \}\)/)
    expect(read('src/app/api/artist/chat/route.ts')).toMatch(/"type":"createLocationAppearance"/)
    // regenerateWorldAsset(appearanceKey) 는 그 변형만 다시 그린다.
    expect(read('src/stores/artist-store.ts')).toMatch(/generateWorldShot\(u\.locationId, 'wideShot', undefined, 'chat', undefined, \{ appearanceKey: variantKey \}\)/)
  })

  it('씬의 서사 시점과 같은 모습에 이미지가 있으면 Writer·Director 가 그것을 쓰고, 없으면 기본 모습을 쓴다', () => {
    const variants = [
      { location_id: 'market', appearance_key: 'burned', narrative_time: 'future', wide_shot: 'https://x/burned.png' },
      { location_id: 'market', appearance_key: 'winter', narrative_time: 'past', wide_shot: null },
    ]
    expect(resolveLocationAppearanceForScene('future', variants)?.appearance_key).toBe('burned')
    expect(resolveLocationAppearanceForScene('past', variants)).toBeNull() // 이미지가 없으면 기본으로
    expect(resolveLocationAppearanceForScene('present', variants)).toBeNull()
    const refs = resolveSceneWorldRefs(
      [
        { scene_id: 'sc_01', location: 'market', narrative_time: 'future' },
        { scene_id: 'sc_02', location: 'market', narrative_time: 'present' },
      ],
      [{ location_id: 'market', wide_shot: 'https://x/market.png' }],
      variants,
    )
    expect(refs.get('sc_01')).toBe('https://x/burned.png')
    expect(refs.get('sc_02')).toBe('https://x/market.png')
    // 러프 프롬프트의 배경 한 줄도 같은 규칙으로 고른다.
    expect(read('src/app/api/writer/rough-storyboard/route.ts')).toMatch(/locationDescForScene\(scene as Record<string, unknown> \| undefined\)/)
    // finalize 는 변형 이미지를 변형 행에, 기본은 locations 에 쓴다.
    const finalize = read('src/lib/fal/finalize.ts')
    expect(finalize).toMatch(/\.from\('location_appearances'\)\s*\.update\(\{ \[column\]: publicUrl/)
    expect(finalize).toMatch(/recordLocationImageCandidate\(job, locationId, column, publicUrl, appearanceKey\)/)
  })

  it('모습을 지우거나 이름을 바꿀 수 있고, 기본 모습은 지우지 못한다', async () => {
    const q = chain({ data: [{ appearance_key: 'burned', label: '폐허', narrative_time: 'future', visual_description: 'x', visual_description_native: 'x' }], error: null })
    mocks.from.mockImplementation(() => q)
    const r1 = await patchAppearance(req('/api/artist/location-appearance', { projectId: 'p', locationId: 'market', appearanceKey: 'burned', label: '폐허' }, 'PATCH'))
    expect(r1.status).toBe(200)
    expect((q.update as ReturnType<typeof vi.fn>).mock.calls[0][0]).toMatchObject({ label: '폐허' })
    const r2 = await deleteAppearance(req('/api/artist/location-appearance', { projectId: 'p', locationId: 'market', appearanceKey: 'default' }, 'DELETE'))
    expect(r2.status).toBe(409)
    const d = chain({ data: [{ appearance_key: 'burned' }], error: null })
    mocks.from.mockImplementation(() => d)
    const r3 = await deleteAppearance(req('/api/artist/location-appearance', { projectId: 'p', locationId: 'market', appearanceKey: 'burned' }, 'DELETE'))
    expect(r3.status).toBe(200)
    expect(mocks.from).toHaveBeenCalledWith('location_image_candidates')
    // 실패 표시·우회 재시도도 모습 단위다.
    expect(worldFailureKey('market', 'burned')).toBe('market:burned')
    expect(worldFailureKey('market', 'default')).toBe('market')
    expect(worldFailureKey('market')).toBe('market')
    const dialog = read('src/features/artist/world-view-dialog.tsx')
    expect(dialog).toMatch(/renameLocationAppearance\(world\.locationId, variant\.appearanceKey, renameDraft\.trim\(\)\)/)
    expect(dialog).toMatch(/deleteLocationAppearance\(world\.locationId, variant\.appearanceKey\)/)
  })
})
