// Director 배선 2 — 러프·previz 재생성 결과는 새로고침 없이 카드에 뜬다 (2026-09-06)
//
//   Director 카드는 러프 3장과 previz 영상을 writer 스토어에서 읽는다. 잡이 큐에서 빠진 순간 writer 스토어의
//   그 두 칸만 DB 로 다시 채운다(다른 칸·손대지 않은 샷의 객체는 그대로). 러프 잡도 감시 목록에 든다.
//   문장 하나 = 테스트 하나.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import type { Shot } from '@/types'

const cache = vi.hoisted(() => ({
  rows: [] as Array<Record<string, unknown>>,
  invalidated: 0,
}))
vi.mock('@/lib/shots-cache', () => ({
  loadShotsResult: async () => ({ data: cache.rows, error: null }),
  loadShots: async () => cache.rows,
  invalidateShots: async () => {
    cache.invalidated += 1
  },
  shotsKey: (id: string) => ['shots', id],
}))
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => ({ update: () => ({ eq: async () => ({ error: null }) }) }),
  }),
}))

import { useWriterStore } from '@/stores/writer-store'

const ROOT = process.cwd()
const read = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8')

function shot(shotId: string, extra: Partial<Shot> = {}): Shot {
  return {
    shotId,
    sceneId: 'sc_01',
    shotType: 'MS',
    actionDescription: `action ${shotId}`,
    characters: [],
    durationSeconds: 5,
    generationMethod: 'T2V',
    dialogueLines: [],
    camera: {} as Shot['camera'],
    lighting: {} as Shot['lighting'],
    roughStoryboard: null,
    previzVideo: null,
    ...extra,
  }
}

beforeEach(() => {
  cache.rows = []
  cache.invalidated = 0
})

describe('러프와 미리보기 영상을 다시 만들면 새로고침 없이 카드에 바로 반영된다', () => {
  it('그림을 새로 고치면 러프와 미리보기 영상만 최신 내용으로 바뀌고 다른 내용은 그대로 둔다', async () => {
    const a = shot('sh_01_01', { actionDescription: 'typed but unsaved' })
    const b = shot('sh_01_02')
    useWriterStore.setState({ shots: [a, b] })
    const rough = { url: 'https://x/rough.png', status: 'completed', errorMessage: null, generatedAt: 2 }
    const previz = { url: 'https://x/previz.mp4', status: 'completed', errorMessage: null, generatedAt: 3 }
    cache.rows = [
      { shot_id: 'sh_01_01', action_description: 'db text', rough_storyboard: rough, previz_video: previz },
      { shot_id: 'sh_01_02', action_description: 'db text', rough_storyboard: null, previz_video: null },
    ]

    await useWriterStore.getState().refreshShotMedia('p1')

    const [na, nb] = useWriterStore.getState().shots
    expect(na.roughStoryboard).toEqual(rough)
    expect(na.previzVideo).toEqual(previz)
    expect(na.actionDescription).toBe('typed but unsaved')
    expect(nb).toBe(b)
  })

  it('러프 그림 작업이 끝나면 새로고침 없이 Director 카드의 러프와 미리보기 영상이 갱신된다', () => {
    const hook = read('src/features/director/hooks/use-queue-rehydrate.ts')
    expect(hook).toMatch(/'shot_rough_storyboard',/)
    expect(hook).toMatch(/'shot_previz_video',/)
    // 정산(settle)과 복귀(re-entry) 두 자리 모두에서 부른다.
    expect(hook.match(/refreshShotMedia\(projectId\)/g)?.length ?? 0).toBeGreaterThanOrEqual(2)
  })
})
