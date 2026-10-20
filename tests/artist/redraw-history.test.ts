// 인물 그림을 다시 만들면 상세의 기록(시계)과 "바뀜" 표시가 새 그림 기준으로 바로 바뀐다 (2026-10-20 팝업 e2e 에서 발견)
import { beforeEach, describe, expect, it, vi } from 'vitest'

type Row = Record<string, unknown>
const db = vi.hoisted(() => ({ candidates: [] as Row[], fail: false }))
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: (table: string) => {
      const filters: Array<[string, unknown]> = []
      const query = {
        select: () => query,
        eq: (key: string, value: unknown) => { filters.push([key, value]); return query },
        order: () => query,
        then: (resolve: (value: unknown) => unknown) => {
          const rows = table === 'character_image_candidates' ? db.candidates.filter((row) => filters.every(([key, value]) => row[key] === value)) : []
          return Promise.resolve(db.fail ? { data: null, error: { message: 'network down' } } : { data: rows, error: null }).then(resolve)
        },
      }
      return query
    },
  }),
}))
vi.mock('@/lib/generation-jobs-client', () => ({ pollGenerationJob: vi.fn(async () => 'https://img.test/new.png') }))
vi.mock('@/lib/action-guard', () => ({ claimAction: () => true }))

import { useArtistStore } from '@/stores/artist-store'
import { useProjectStore } from '@/stores/project-store'
import type { CharacterAsset } from '@/types/asset'

const old = { id: 'old', url: 'https://img.test/old.png', sourceHash: 'aaaa', appearanceHash: 'bbbb', isSelected: true, generatedAt: '2026-10-20T00:00:00Z' }
const character = {
  characterId: 'min_ho',
  name: '민호',
  views: { main: old.url, back: null, sideLeft: null, sideRight: null },
  appearances: [{ appearanceKey: 'current', label: '현재', isDefault: true, narrativeTime: 'present', sheetUrl: old.url, portraitUrl: null, appearance: 'Tired office worker', appearanceNative: '지친 회사원', viewCandidates: { main: [old] } }],
  entityType: 'person',
  description: '',
  fixedPrompt: 'Tired office worker',
  appearanceNative: '지친 회사원',
  portrait: null,
  viewCandidates: {},
  lookFingerprint: null,
  origin: 'writer',
} as unknown as CharacterAsset

beforeEach(() => {
  db.fail = false
  db.candidates = [
    { id: 'old', project_id: 'p1', character_id: 'min_ho', appearance_key: 'current', view: 'main', url: old.url, source_hash: 'aaaa', appearance_hash: 'bbbb', is_selected: false, generated_at: '2026-10-20T00:00:00Z' },
    { id: 'new', project_id: 'p1', character_id: 'min_ho', appearance_key: 'current', view: 'main', url: 'https://img.test/new.png', source_hash: 'cccc', appearance_hash: 'dddd', is_selected: true, generated_at: '2026-10-20T01:00:00Z' },
  ]
  useProjectStore.setState({ projectId: 'p1' })
  useArtistStore.setState({ characterAssets: [structuredClone(character)], generatingViews: [], viewFailures: {}, refreshViewFailures: async () => {} } as never)
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ jobId: 'job-1' }), { status: 200 })))
})

const mainCandidates = () => useArtistStore.getState().characterAssets[0].appearances[0].viewCandidates.main ?? []

describe('다시 만든 뒤의 기록', () => {
  it('인물 그림을 다시 만들면 새 그림이 기록 맨 앞에 "지금"으로 들어간다', async () => {
    // 왜: 다시 만든 뒤에도 기록이 옛 그림을 "지금"으로 들고 있어, 상세에 "바뀜 · 다시 만들어야 반영"이 남고 시계에 새 그림이 없었다.
    //   고장: Artist 상세에서 [다시 만들기]로 그린 직후(새로고침 전).
    await useArtistStore.getState().generateCharacterView('min_ho', 'current', 'main', 'ui')

    expect(mainCandidates().map((candidate) => [candidate.id, candidate.isSelected])).toEqual([['new', true], ['old', false]])
    expect(mainCandidates()[0].appearanceHash).toBe('dddd')
  })

  it('기록을 다시 읽지 못해도 새 그림은 그대로 보인다', async () => {
    // 왜: 정상 경로 고정 — 기록 읽기는 덤이다. 실패해도 그림 바꾸기를 되돌리지 않는다.
    db.fail = true
    await useArtistStore.getState().generateCharacterView('min_ho', 'current', 'main', 'ui')

    expect(useArtistStore.getState().characterAssets[0].appearances[0].sheetUrl).toBe('https://img.test/new.png')
    expect(mainCandidates().map((candidate) => candidate.id)).toEqual(['old'])
  })
})
