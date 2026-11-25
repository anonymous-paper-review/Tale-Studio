// 제출 전 내용 검사에 걸린 그림 칸을 화면이 이름과 함께 기억하고, 그려지면 지우고, 이어 그리기는 멈춘 채로 둔다 (2026-11-25 오너)
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  poll: vi.fn(),
  toastError: vi.fn(),
  sheet: { status: 200, body: {} as Record<string, unknown> },
  world: { status: 200, body: {} as Record<string, unknown> },
}))

vi.mock('@/lib/demo/context', () => ({ isDemoSession: () => false }))
vi.mock('sonner', () => ({
  toast: { error: mocks.toastError, success: vi.fn(), info: vi.fn(), warning: vi.fn(), message: vi.fn() },
}))
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
vi.mock('@/stores/asset-storage-store', () => ({ registerCharacterCard: vi.fn() }))
vi.mock('@/lib/generation-jobs-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/generation-jobs-client')>()),
  pollGenerationJob: mocks.poll,
}))

import { characterRefusalKey } from '@/lib/artist/failure-badge'
import { useArtistStore, worldFailureKey } from '@/stores/artist-store'
import { useProjectStore } from '@/stores/project-store'
import type { GenerationJobReceipt } from '@/lib/generation-jobs-client'
import type { CharacterAsset } from '@/types/asset'

const BLOCKED = {
  error: 'This request breaks the content rules, so it was not generated. Edit the description and try again.',
  code: 'content_policy_blocked',
  policyUrl: '/acceptable-use',
}

const appearance = {
  appearanceKey: 'current', label: '현재', isDefault: true, narrativeTime: 'present' as const,
  sheetUrl: null, portraitUrl: null, appearance: null, appearanceNative: null, viewCandidates: {},
}
const person = (id: string, name: string): CharacterAsset => ({
  characterId: id, name, entityType: 'person',
  views: { main: null, back: null, sideLeft: null, sideRight: null } as never,
  appearances: [appearance], viewCandidates: {}, origin: 'producer',
})

const maraMain = characterRefusalKey('mara', 'current', 'main')
const realGenerateCharacterView = useArtistStore.getState().generateCharacterView

beforeEach(() => {
  vi.clearAllMocks()
  mocks.sheet = { status: 200, body: { jobId: 'job-1' } }
  mocks.world = { status: 200, body: { jobId: 'job-2' } }
  mocks.poll.mockResolvedValue('https://example.test/drawn.png')
  vi.stubGlobal('fetch', vi.fn(async (input: unknown) => {
    const url = String(input)
    if (url.includes('/api/artist/generate-sheet')) return Response.json(mocks.sheet.body, { status: mocks.sheet.status })
    if (url.includes('/api/artist/generate-world')) return Response.json(mocks.world.body, { status: mocks.world.status })
    return Response.json({ failures: [], worldFailures: [], capacitySkips: {} }, { status: 200 })
  }))
  useProjectStore.setState({ projectId: 'art-1' })
  useArtistStore.setState({
    imageProvider: 'fal',
    characterAssets: [person('mara', '마라')],
    worldAssets: [{ locationId: 'roof', name: '옥상', sceneId: 's1', wideShot: null }] as never,
    sceneManifest: {
      characters: [],
      locations: [{ locationId: 'roof', name: '옥상', visualDescription: '밤의 옥상', timeOfDay: 'night', lightingDirection: '', lightingSources: [], styleDescription: '', props: [], purpose: '' }],
      scenes: [],
    } as never,
    generatingViews: [],
    generatingLocations: [],
    viewFailures: {},
    worldFailures: {},
    contentRefusals: {},
    capacitySkips: {},
    drawContinue: { projectId: null, rounds: 0, stopped: false, running: false, paused: false, userWaitSince: null },
    generateCharacterView: realGenerateCharacterView,
  })
})

describe('제출 전 내용 검사에 걸린 칸 기억하기', () => {
  it('제출 전 내용 검사에 걸린 칸은 이름과 함께 기억한다', async () => {
    // 왜: 검사에 걸린 그림은 작업 기록이 생기기 전에 끝나 카드에 아무 표시도 남지 않았다 — 어느 인물·배경이 걸렸는지 학생이 알 수 없었다(2026-11-25 오너).
    mocks.sheet = { status: 400, body: { ...BLOCKED, target: { kind: 'character', name: '마라' } } }
    mocks.world = { status: 400, body: { ...BLOCKED, target: { kind: 'world', name: '옥상' } } }

    await useArtistStore.getState().generateCharacterView('mara', 'current', 'main', 'auto')
    await useArtistStore.getState().generateWorldShot('roof', 'wideShot', undefined, 'auto')

    expect(useArtistStore.getState().contentRefusals).toEqual({
      [maraMain]: { name: '마라' },
      [worldFailureKey('roof', null)]: { name: '옥상' },
    })
  })

  it('이름을 모르는 거절은 이름 없이 기억한다', async () => {
    // 왜: 라우트가 이름을 모르는 경로(설명만 받는 요청)도 있다 — 그때도 어느 칸이 걸렸는지는 카드가 알려야 한다.
    mocks.sheet = { status: 400, body: BLOCKED }

    await useArtistStore.getState().generateCharacterView('mara', 'current', 'main', 'auto')

    expect(useArtistStore.getState().contentRefusals[maraMain]).toEqual({ name: null })
  })

  it('그 칸이 나중에 그려지면 기억을 지운다', async () => {
    // 왜: 설명을 고쳐 다시 그린 뒤에도 "내용 검사에 걸림" 배지가 남으면 학생이 아직 걸린 줄 안다.
    mocks.sheet = { status: 400, body: { ...BLOCKED, target: { kind: 'character', name: '마라' } } }
    await useArtistStore.getState().generateCharacterView('mara', 'current', 'main', 'auto')
    expect(useArtistStore.getState().contentRefusals[maraMain]).toBeTruthy()

    mocks.sheet = { status: 200, body: { jobId: 'job-1' } }
    await useArtistStore.getState().generateCharacterView('mara', 'current', 'main', 'auto')

    expect(useArtistStore.getState().contentRefusals).toEqual({})
  })

  it('그 배경이 나중에 그려지면 기억을 지운다', async () => {
    // 왜: 인물과 같은 규칙 — 배경 설명을 고쳐 다시 그렸으면 배지도 사라져야 한다.
    mocks.world = { status: 400, body: { ...BLOCKED, target: { kind: 'world', name: '옥상' } } }
    await useArtistStore.getState().generateWorldShot('roof', 'wideShot', undefined, 'auto')
    expect(useArtistStore.getState().contentRefusals[worldFailureKey('roof', null)]).toBeTruthy()

    mocks.world = { status: 200, body: { jobId: 'job-2' } }
    await useArtistStore.getState().generateWorldShot('roof', 'wideShot', undefined, 'auto')

    expect(useArtistStore.getState().contentRefusals).toEqual({})
  })

  it('다른 실패(자리 없음 429)는 기억하지 않는다', async () => {
    // 왜: 자리가 없어 못 그린 것은 설명 탓이 아니다 — 설명을 고치라고 하면 학생이 멀쩡한 설명을 망친다.
    mocks.sheet = { status: 429, body: { code: 'quota_exceeded', scope: 'user', category: 'image', limit: 6 } }

    await useArtistStore.getState().generateCharacterView('mara', 'current', 'main', 'auto')

    expect(useArtistStore.getState().contentRefusals).toEqual({})
  })

  it('프로젝트를 옮기면 기억한 거절을 모두 지운다', async () => {
    // 왜: 작업 기록이 없는 화면 기억이라 다른 화·다른 작품으로 옮겼을 때 남으면 엉뚱한 카드에 배지가 붙는다.
    mocks.sheet = { status: 400, body: { ...BLOCKED, target: { kind: 'character', name: '마라' } } }
    await useArtistStore.getState().generateCharacterView('mara', 'current', 'main', 'auto')

    useArtistStore.getState().reset()

    expect(useArtistStore.getState().contentRefusals).toEqual({})
  })

  it('제출 전 거절이면 이어 그리기는 그대로 멈추고 단추로 남기고 다시 보내지 않는다', async () => {
    // 왜: 2026-11-25 오너 — 자동 재시도·문구 다시 쓰기는 하지 않는다. 걸린 그림은 학생이 설명을 고쳐 다시 눌러야 그린다.
    const refuse = vi.fn(async (...args: unknown[]) => {
      const options = args[7] as { onJob?: (receipt: GenerationJobReceipt) => void } | undefined
      options?.onJob?.({ jobId: null, status: 'failed', httpStatus: 400, error: BLOCKED.error } as GenerationJobReceipt)
      return { jobId: null, status: 'failed', httpStatus: 400 }
    })
    useArtistStore.setState({ worldAssets: [], generateCharacterView: refuse as never })

    await useArtistStore.getState().continueMissingImages()
    await useArtistStore.getState().continueMissingImages()

    expect(useArtistStore.getState().drawContinue).toMatchObject({ projectId: 'art-1', stopped: true })
    expect(refuse).toHaveBeenCalledTimes(1)
  })
})
