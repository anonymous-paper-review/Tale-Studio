import { QueryClient } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// #shots-cache-invalidate (2026-08-24 티켓) — 감독 화면의 생성 완료 확정 지점이
// shots 사물함(@/lib/shots-cache)을 낡음으로 표시하는지 잠그는 시험.
// tests/shots-cache.test.ts 와 같은 방식: vitest(node, isServer=true)는 getQueryClient()가
// 호출마다 새 인스턴스라 공유시켜야 캐시 신선도(30초)가 시험에서 의미를 갖는다.
const shared = vi.hoisted(() => ({ client: null as unknown as QueryClient }))
vi.mock('@/lib/query-client', () => ({
  getQueryClient: () => shared.client,
}))

// supabase 읽기 체인(.from('shots').select('*').eq().order() → { data, error })만 흉내낸다
// (shots-cache.test.ts 와 동일 모양). director-store 의 다른 supabase 접근(scenes 등)은
// 이 시험이 건드리는 완료 지점(webhook job 경로)에서 타지 않는다 — hydrateFromDb 는
// no-op 스텁으로 대체해 이 시험을 무효화 신호 하나로 좁힌다(아래 beforeEach).
const db = vi.hoisted(() => ({
  rows: [] as Array<{ shot_id: string }>,
  fetchCount: 0,
}))
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          order: async () => {
            db.fetchCount += 1
            return { data: db.rows, error: null }
          },
        }),
      }),
    }),
  }),
}))

// 생성 완료를 즉시 확정 — 폴링 루프 자체는 이 시험의 대상이 아니다.
vi.mock('@/lib/generation-jobs-client', () => ({
  pollGenerationJob: vi.fn().mockResolvedValue('https://media.example/storyboard-done.png'),
}))

// 채팅 배지·throttle 타이머(생성 완료 통지)는 이 시험의 관심사가 아니다 — 무효화 신호만 잠근다.
vi.mock('@/lib/generation-notify', () => ({
  notifyGenerationComplete: vi.fn(),
  notifyGenerationFailure: vi.fn(),
}))

import { loadShots } from '@/lib/shots-cache'
import { useDirectorCanvasStore } from '@/stores/director-store'

beforeEach(() => {
  shared.client = new QueryClient()
  db.rows = [{ shot_id: 'shot-1' }]
  db.fetchCount = 0
  useDirectorCanvasStore.getState().reset()
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString()
      if (url.includes('/api/director/generate-storyboard')) {
        return new Response(JSON.stringify({ jobId: 'job-1' }), { status: 200 })
      }
      throw new Error(`이 시험이 예상하지 못한 fetch: ${url}`)
    }),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('감독 화면 생성 완료 → shots 사물함 무효화 (#shots-cache-invalidate)', () => {
  it('generateStoryboardImage 완료 뒤 다음 loadShots(다른 화면 재진입 시뮬레이션)는 30초 신선 기간과 무관하게 다시 받는다', async () => {
    // hydrateFromDb 는 이 시험의 대상이 아니다(별도 시험이 이미 잠갔다 — director-state-boundaries.test.ts).
    // no-op 로 대체해 무효화 신호 하나만 재게 한다.
    useDirectorCanvasStore.setState({ projectId: 'p1', hydrateFromDb: async () => {} })
    const store = useDirectorCanvasStore.getState()
    const sceneId = store.addSceneNode({ x: 0, y: 0 }, 'S1')
    const shotId = store.addShotNode(sceneId, { x: 100, y: 0 }, 'Shot1')
    store.updateNodeData<'shot'>(shotId, { writerShotId: 'shot-1' })

    // writer/editor 가 생성 완료 직전에 이미 사물함을 채워둔 상황(30초 신선 창 안).
    await loadShots('p1')
    expect(db.fetchCount).toBe(1)

    await useDirectorCanvasStore.getState().generateStoryboardImage(shotId)

    // 완료 확정 직후의 다음 loadShots — 무효화가 없다면 아직 신선(30초)해 네트워크 없이
    // 완료 전 캐시를 그대로 돌려준다(이 티켓이 고치는 버그의 재현). 무효화가 있으면 다시 받는다.
    await loadShots('p1')
    expect(db.fetchCount).toBe(2)
  })
})
