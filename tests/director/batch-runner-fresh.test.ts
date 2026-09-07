// Director 배선 3 — 배치 러너의 갱신은 헛돌지 않는다 (2026-09-06)
//
//   시트 하나가 끝날 때마다 하는 재수화가 30초 사물함의 옛 행을 받아 오면 화면은 빈 카드로 남고 4초 뒤 폴러가
//   고치던 것을, 재수화 전에 사물함을 낡음으로 표시해 완료된 행을 바로 받게 한다. 문장 하나 = 테스트 하나.
import { QueryClient } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const shared = vi.hoisted(() => ({ client: null as unknown as QueryClient }))
vi.mock('@/lib/query-client', () => ({ getQueryClient: () => shared.client }))

const db = vi.hoisted(() => ({ shots: [] as Array<Record<string, unknown>> }))
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: (table: string) => {
      let writing = false
      const chain: Record<string, unknown> = {}
      for (const m of ['select', 'eq', 'order', 'is', 'in', 'not', 'maybeSingle']) chain[m] = () => chain
      chain.update = () => {
        writing = true
        return chain
      }
      chain.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
        Promise.resolve(
          writing ? { data: null, error: null } : { data: table === 'shots' ? db.shots : [], error: null },
        ).then(resolve, reject)
      return chain
    },
  }),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), info: vi.fn(), error: vi.fn() } }))

import { loadShots } from '@/lib/shots-cache'
import { useDirectorCanvasStore } from '@/stores/director-store'
import { runRealBatch } from '@/lib/director/real-batch-client'
import { isShotData } from '@/types/director'

const api = () => useDirectorCanvasStore.getState()
const ROOT = process.cwd()
const read = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8')
const NEW_URL = 'https://x/s1_storyboard_start.png'

beforeEach(() => {
  shared.client = new QueryClient()
  db.shots = []
  let rounds = 0
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString()
      if (url.startsWith('/api/director/generate-storyboard-batch')) {
        rounds += 1
        const body =
          rounds === 1
            ? { data: { submitted: [{ jobId: 'job-1', shotIds: ['s1'] }], remaining: 0 } }
            : { data: { submitted: [], remaining: 0 } }
        return new Response(JSON.stringify(body), { status: 200 })
      }
      if (url.startsWith('/api/generation-jobs/job-1')) {
        // 잡이 끝났다 = 웹훅이 shots.storyboard_image 를 이미 썼다.
        db.shots = [
          {
            shot_id: 's1',
            canvas_position: null,
            storyboard_image: { url: NEW_URL, status: 'completed', errorMessage: null, generatedAt: 5 },
            image_inputs: [],
            director_refs: null,
          },
        ]
        return new Response(JSON.stringify({ data: { status: 'completed', resultUrl: NEW_URL } }), { status: 200 })
      }
      if (url.startsWith('/api/director/video-takes?')) return new Response(JSON.stringify({ takes: [] }), { status: 200 })
      return new Response(JSON.stringify({ data: { jobs: [] } }), { status: 200 })
    }),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Director 배선 3 — 배치 러너의 갱신은 헛돌지 않는다', () => {
  it('시트가 끝난 직후의 재수화는 30초 사물함의 옛 행이 아니라 완료된 행을 받아 카드에 바로 싣는다', async () => {
    api().reset()
    api().setProjectId('p1')
    const sceneId = api().addSceneNode({ x: 0, y: 0 }, 'S')
    const s1 = api().addShotNode(sceneId, { x: 300, y: 0 }, 'Shot1')
    api().updateNodeData<'shot'>(s1, { writerShotId: 's1' })
    // 배치 직전에 누군가 shots 를 읽어 사물함이 신선하다(옛 행 = 실사 없음).
    db.shots = [{ shot_id: 's1', canvas_position: null, storyboard_image: null, image_inputs: [], director_refs: null }]
    await loadShots('p1')

    const result = await runRealBatch('p1', { silent: true })

    expect(result.generated).toBe(1)
    const node = api().nodes.find((n) => n.id === s1)
    expect(node && isShotData(node.data) ? node.data.storyboardImage?.url : null).toBe(NEW_URL)
  })

  it('러너의 재수화 두 곳 모두 사물함 무효화가 앞선다', () => {
    const src = read('src/lib/director/real-batch-client.ts')
    const hydrates = src.match(/await store\.getState\(\)\.hydrateFromDb\(projectId\)/g) ?? []
    expect(hydrates.length).toBeGreaterThanOrEqual(2)
    expect(src.match(/await invalidateShots\(projectId\)\n\s*await store\.getState\(\)\.hydrateFromDb\(projectId\)/g)?.length ?? 0).toBe(hydrates.length)
  })
})
