// 서버가 그리는 인물 그림은 그리는 중으로 세고, 다 그리면 새로고침 없이 카드에 들어온다 (2026-10-27 디자이너 QA 1차)
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ from: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: mocks.from } }))

import { listQueuedMainJobs } from '@/lib/generation-jobs'
import { useArtistStore } from '@/stores/artist-store'
import { useProjectStore } from '@/stores/project-store'
import type { CharacterAsset } from '@/types/asset'

function rows(data: unknown) {
  const q: Record<string, unknown> = {}
  for (const name of ['select', 'eq', 'in', 'order']) q[name] = () => q
  q.then = (resolve: (value: unknown) => unknown) => Promise.resolve({ data, error: null }).then(resolve)
  return q
}

const person = (id: string): CharacterAsset => ({
  characterId: id, name: id, entityType: 'person', views: { main: null, back: null, sideLeft: null, sideRight: null } as never,
  appearances: [{ appearanceKey: 'young', label: '젊은 시절', isDefault: true, narrativeTime: 'present', sheetUrl: null, portraitUrl: null, appearance: null, appearanceNative: null, viewCandidates: {} }],
  viewCandidates: {}, origin: 'producer',
})

describe('서버가 그리는 인물 그림', () => {
  beforeEach(() => {
    useProjectStore.setState({ projectId: 'art-1' })
    useArtistStore.setState({ characterAssets: [person('soonja')], worldAssets: [], generatingViews: [], generatingLocations: [], serverDrawCheckedAt: null })
  })
  afterEach(() => vi.unstubAllGlobals())

  it('서버는 기다리는 인물 그림이 어느 모습인지 함께 알려 준다', async () => {
    // 왜: 모습을 빼고 알려 줘서 화면이 다 그려진 그림을 카드에 넣지 못했다(새로고침해야 보였다 · 디자이너 QA 1차 #06).
    mocks.from.mockReturnValueOnce(rows([
      { id: 'job-1', target: { characterId: 'soonja', appearanceKey: 'young', view: 'main' } },
      { id: 'job-2', target: { characterId: 'soonja', appearanceKey: 'young', view: 'back' } },
    ]))

    await expect(listQueuedMainJobs('art-1')).resolves.toEqual([{ characterId: 'soonja', appearanceKey: 'young', jobId: 'job-1' }])
  })

  it('서버가 그리는 인물 그림은 그리는 중으로 센다', async () => {
    // 왜: 서버 그림을 세지 않아 그리는 중인데도 '남은 그림 다시 그리기'가 떴다(디자이너 QA 1차 #05).
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.startsWith('/api/artist/generation-status')) {
        return Response.json({ failures: [], worldFailures: [], queuedWorld: [], queuedMain: [{ characterId: 'soonja', appearanceKey: 'young', jobId: 'job-9' }] })
      }
      return new Promise<Response>(() => {})
    }))

    await useArtistStore.getState().syncGenerationStatus('art-1')

    expect(useArtistStore.getState().generatingViews).toEqual([{ characterId: 'soonja', appearanceKey: 'young', view: 'main' }])
    expect(useArtistStore.getState().serverDrawCheckedAt).not.toBeNull()
  })

  it('서버가 그린 인물 그림은 다 그리면 새로고침 없이 카드에 들어온다', async () => {
    // 왜: 젊은 순자 그림이 나중에 그려졌는데 새로고침해야 보였다(디자이너 QA 1차 #06 · 관찰 43).
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.startsWith('/api/artist/generation-status')) {
        return Response.json({ failures: [], worldFailures: [], queuedWorld: [], queuedMain: [{ characterId: 'soonja', appearanceKey: 'young', jobId: 'job-7' }] })
      }
      if (url.startsWith('/api/generation-jobs/job-7')) return Response.json({ data: { status: 'completed', resultUrl: 'https://img/soonja.png', error: null } })
      return Response.json({ data: [] })
    }))

    await useArtistStore.getState().syncGenerationStatus('art-1')
    await vi.waitFor(() => expect(useArtistStore.getState().generatingViews).toEqual([]))

    expect(useArtistStore.getState().characterAssets[0].appearances[0].sheetUrl).toBe('https://img/soonja.png')
  })
})
