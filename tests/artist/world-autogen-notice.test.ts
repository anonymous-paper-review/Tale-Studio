// 배경 그림 자동 생성은 서버가 같은 배경을 이미 그리는 중이라 건너뛴 것을 "자동 생성을 멈췄다"고 알리지 않는다 (2026-10-20)
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ gaveUp: vi.fn(), worldReply: { ok: true } as Record<string, unknown> }))

vi.mock('@/lib/demo/context', () => ({ isDemoSession: () => false }))
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
  notifyGenerationGaveUp: mocks.gaveUp,
}))

import { useArtistStore } from '@/stores/artist-store'
import { useProjectStore } from '@/stores/project-store'

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('fetch', vi.fn(async (input: unknown) => {
    const url = String(input)
    if (url.includes('/api/artist/generate-world')) return new Response(JSON.stringify(mocks.worldReply), { status: 200 })
    return new Response(JSON.stringify({ ok: true, data: [] }), { status: 200 })
  }))
  useProjectStore.setState({ projectId: 'p1' })
  useArtistStore.setState({
    imageProvider: 'fal',
    generatingLocations: [],
    sceneManifest: {
      characters: [],
      locations: [{ locationId: 'hall', name: '회사 복도', visualDescription: '밤의 회사 복도', timeOfDay: 'night', lightingDirection: '', lightingSources: [], styleDescription: '', props: [], purpose: '' }],
      scenes: [],
    } as never,
    worldAssets: [{ locationId: 'hall', name: '회사 복도', sceneId: 's1', wideShot: null }] as never,
  })
})

describe('배경 그림 자동 생성 알림', () => {
  it('서버가 같은 배경을 이미 그리는 중이라 겹친 요청을 건너뛰면 자동 생성을 멈췄다고 알리지 않는다', async () => {
    // 왜: [만들기] 직후 서버가 배경 초안을 그리는 동안 화면도 같은 배경을 한 번 더 청한다 — 겹친 요청을 건너뛴 것은 실패가 아닌데
    //   "연속으로 실패해서 자동 생성을 멈췄어요"가 떠서, 그림이 멀쩡히 나오는데도 오류처럼 보였다(2026-10-20 e2e).
    mocks.worldReply = { ok: true, status: 'queued', deduped: true, locationId: 'hall', column: 'wide_shot' }

    await useArtistStore.getState().generateWorldShot('hall', 'wideShot', undefined, 'auto')

    expect(mocks.gaveUp).not.toHaveBeenCalled()
  })

  it('반복 실패로 서버가 자동 생성을 막으면 지금처럼 멈췄다고 알린다', async () => {
    // 왜: 정상 경로 고정 — 막힌 것은 사람이 눌러야 다시 그린다는 것을 알려야 한다.
    mocks.worldReply = { ok: true, skipped: true, reason: 'gave_up' }

    await useArtistStore.getState().generateWorldShot('hall', 'wideShot', undefined, 'auto')

    expect(mocks.gaveUp).toHaveBeenCalledOnce()
  })
})
