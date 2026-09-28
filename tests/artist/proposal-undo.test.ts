// 에이전트 제안이 걸린 카드를 표시하고, 승인한 글 변경 한 건을 이전 문장으로 되돌린다
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const db = vi.hoisted(() => ({ createClient: vi.fn() }))
vi.mock('@/lib/supabase/client', () => ({ createClient: db.createClient, createCatalogClient: vi.fn() }))
vi.mock('@/lib/chat-persistence', () => ({ saveChatMessage: vi.fn(), saveChatTrace: vi.fn(), saveChatTracePatch: vi.fn(), loadLatestChatTrace: vi.fn() }))

import { proposalTargetsCard } from '@/lib/artist/proposal-target'
import { createPendingProposal } from '@/lib/pending-proposal'
import { useArtistStore } from '@/stores/artist-store'
import { useGlobalChatStore } from '@/stores/global-chat-store'
import { useProjectStore } from '@/stores/project-store'
import { useLocaleStore } from '@/stores/locale-store'
import type { CharacterAsset, WorldAsset } from '@/types/asset'

/** readTable(select().eq()) 만 쓰는 도구 경로용 최소 DB — 테이블별 행 배열을 그대로 돌려준다. */
function stubDatabase(tables: Record<string, Record<string, unknown>[]>) {
  db.createClient.mockImplementation(() => ({
    from: (table: string) => {
      const filters: Record<string, unknown> = {}
      let columns = '*'
      const execute = async () => {
        const rows = (tables[table] ?? []).filter((row) =>
          Object.entries(filters).every(([key, value]) => row[key] === value),
        )
        const data = rows.map((row) =>
          columns === '*'
            ? structuredClone(row)
            : Object.fromEntries(columns.split(',').map((key) => [key, row[key]])),
        )
        return { data, error: null }
      }
      const query = {
        select: (value: string) => { columns = value; return query },
        eq: (key: string, value: unknown) => { filters[key] = value; return query },
        then: (resolve: (result: Awaited<ReturnType<typeof execute>>) => unknown) => execute().then(resolve),
      }
      return query
    },
  }) as never)
}

function characterAsset(): CharacterAsset {
  return {
    characterId: 'person-1',
    name: '옥화',
    entityType: 'person',
    fixedPrompt: 'black hair',
    appearanceNative: '검은 머리',
    views: { main: null, back: null, sideLeft: null, sideRight: null },
    viewCandidates: {},
    appearances: [
      {
        appearanceKey: 'current', label: '현재', isDefault: true, narrativeTime: 'present',
        sheetUrl: null, portraitUrl: null, appearance: 'black hair',
        appearanceNative: '검은 머리', viewCandidates: {},
      },
    ],
  }
}

function worldAsset(): WorldAsset {
  return {
    locationId: 'location-1',
    sceneId: 'scene-1',
    name: '교실',
    visualDescription: 'dark classroom',
    visualDescriptionNative: '어두운 교실',
    wideShot: null,
    candidates: [],
    appearances: [],
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  db.createClient.mockImplementation(() => { throw new Error('이 테스트는 DB를 미리 준비해야 합니다') })
  useGlobalChatStore.getState().reset()
  useArtistStore.getState().reset()
  useProjectStore.setState({ projectId: 'p-undo', currentStage: 'artist', reachedStage: 'artist', projectLocale: 'ko' })
  useLocaleStore.setState({ locale: 'ko' })
})
afterEach(() => {
  useGlobalChatStore.getState().reset()
  useArtistStore.getState().reset()
  vi.unstubAllGlobals()
})

describe('Artist 카드의 제안 표시', () => {
  it('에이전트 제안이 대기 중이면 그 인물·배경 카드를 가리킨다', () => {
    // 왜: 정상 경로 고정
    const appearancePatch = createPendingProposal({
      stage: 'artist', kind: 'artistSourceAppearancePatch', target: '옥화', action: '외형 변경', impact: [],
      payload: { characterId: 'person-1', appearance: 'red hair', toolEdit: { resource: 'characters', id: 'person-1', patch: { appearance: 'red hair' }, before: { appearance: 'black hair' } } },
    })
    const locationPatch = createPendingProposal({
      stage: 'artist', kind: 'artistSourceLocationPatch', target: '교실', action: '설명 변경', impact: [],
      payload: { locationId: 'location-1', visualDescription: '밝은 교실', toolEdit: { resource: 'backgrounds', id: 'location-1', patch: { visualDescription: '밝은 교실' }, before: { visualDescription: '어두운 교실' } } },
    })
    const appearanceRow = createPendingProposal({
      stage: 'artist', kind: 'artistSourceAppearancePatch', target: '옥화', action: '기본 모습 변경', impact: [],
      payload: { toolEdit: { resource: 'appearances', id: 'person-1/current', patch: { appearance: 'red hair' }, before: { appearance: 'black hair' } } },
    })
    const deletion = createPendingProposal({
      stage: 'artist', kind: 'artistDeleteLocationAppearance', target: '교실', action: '모습 삭제', impact: [],
      payload: { locationId: 'location-1', appearanceKey: 'night' },
    })

    expect(proposalTargetsCard(appearancePatch, { characterId: 'person-1' })).toBe(true)
    expect(proposalTargetsCard(locationPatch, { locationId: 'location-1' })).toBe(true)
    expect(proposalTargetsCard(appearanceRow, { characterId: 'person-1' })).toBe(true)
    expect(proposalTargetsCard(deletion, { locationId: 'location-1' })).toBe(true)
  })

  it('대기 중인 제안이 다른 카드의 것이면 이 카드는 가리키지 않는다', () => {
    // 왜: 한 사람의 외형을 고치는 동안 옆 카드까지 잠기면 나머지 작업이 멈춘다
    const other = createPendingProposal({
      stage: 'artist', kind: 'artistSourceAppearancePatch', target: '옥화', action: '외형 변경', impact: [],
      payload: { characterId: 'person-1', toolEdit: { resource: 'characters', id: 'person-1', patch: { appearance: 'red hair' }, before: { appearance: 'black hair' } } },
    })
    const producerSide = createPendingProposal({
      stage: 'producer', kind: 'producerSourcePatch', target: '설정', action: '장르 변경', impact: [],
      payload: { patch: { genre: 'drama' } },
    })

    expect(proposalTargetsCard(other, { characterId: 'person-2' })).toBe(false)
    expect(proposalTargetsCard(other, { locationId: 'person-1' })).toBe(false)
    expect(proposalTargetsCard(producerSide, { characterId: 'person-1' })).toBe(false)
    expect(proposalTargetsCard(null, { characterId: 'person-1' })).toBe(false)
  })
})

describe('승인한 글 변경 되돌리기', () => {
  it('인물 외형 변경 제안을 승인한 뒤 되돌리기를 누르면 이전 문장으로 돌아간다', async () => {
    // 왜: 정상 경로 고정
    const appearances = [{
      project_id: 'p-undo', character_id: 'person-1', appearance_key: 'current', is_default: true,
      appearance: 'black hair', appearance_native: '검은 머리', updated_at: 'v1',
    }]
    stubDatabase({
      characters: [{ project_id: 'p-undo', character_id: 'person-1', name: '옥화', role: 'protagonist', description: '', entity_type: 'person' }],
      character_appearances: appearances,
      props: [],
    })
    useArtistStore.setState({ characterAssets: [characterAsset()] })
    // 도구 경로가 읽고 쓰는 외형은 사용자 언어 문장(appearance_native)이다.
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as { appearance: string }
      expect(url).toBe('/api/artist/appearance')
      appearances[0].appearance = body.appearance
      appearances[0].appearance_native = body.appearance
      appearances[0].updated_at = `v${Number(appearances[0].updated_at.slice(1)) + 1}`
      return Response.json({ ok: true, appearance: body.appearance, appearanceNative: body.appearance })
    })
    vi.stubGlobal('fetch', fetchMock)
    useGlobalChatStore.getState().offerPendingProposal(createPendingProposal({
      id: 'undo-appearance', projectId: 'p-undo', stage: 'artist', kind: 'artistSourceAppearancePatch',
      target: '옥화', action: '외형 변경', impact: [],
      payload: {
        characterId: 'person-1',
        toolEdit: {
          resource: 'characters', id: 'person-1',
          patch: { appearance: '붉은 머리' },
          before: { name: '옥화', role: 'protagonist', description: '', appearance: '검은 머리' },
          sourceSnapshot: { table: 'character_appearances', values: { appearance_key: 'current', is_default: true, appearance: 'black hair', appearance_native: '검은 머리', updated_at: 'v1' } },
        },
      },
    }))

    await expect(useGlobalChatStore.getState().approvePendingProposal('undo-appearance')).resolves.toBe(true)
    expect(useArtistStore.getState().characterAssets[0].fixedPrompt).toBe('붉은 머리')
    expect(useArtistStore.getState().proposalUndo).toMatchObject({
      kind: 'artistSourceAppearancePatch', resource: 'characters', id: 'person-1',
      before: { appearance: '검은 머리' },
    })

    await expect(useArtistStore.getState().undoLastProposal()).resolves.toBe(true)

    expect(appearances[0].appearance_native).toBe('검은 머리')
    expect(useArtistStore.getState().characterAssets[0].fixedPrompt).toBe('검은 머리')
    expect(useArtistStore.getState().characterAssets[0].appearances[0].appearanceNative).toBe('검은 머리')
    expect(useArtistStore.getState().proposalUndo).toBeNull()
  })

  it('배경 설명 변경 제안을 승인한 뒤 되돌리기를 누르면 이전 문장으로 돌아간다', async () => {
    // 왜: 정상 경로 고정
    const locations = [{
      project_id: 'p-undo', location_id: 'location-1', name: '교실',
      visual_description: 'dark classroom', visual_description_native: '어두운 교실', updated_at: 'v1',
    }]
    stubDatabase({ locations })
    useArtistStore.setState({ worldAssets: [worldAsset()] })
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as { visualDescription: string }
      expect(url).toBe('/api/artist/location')
      locations[0].visual_description = body.visualDescription
      locations[0].visual_description_native = body.visualDescription
      locations[0].updated_at = `v${Number(locations[0].updated_at.slice(1)) + 1}`
      return Response.json({ visualDescription: body.visualDescription, visualDescriptionNative: body.visualDescription })
    })
    vi.stubGlobal('fetch', fetchMock)
    useGlobalChatStore.getState().offerPendingProposal(createPendingProposal({
      id: 'undo-location', projectId: 'p-undo', stage: 'artist', kind: 'artistSourceLocationPatch',
      target: '교실', action: '설명 변경', impact: [],
      payload: {
        locationId: 'location-1',
        toolEdit: {
          resource: 'backgrounds', id: 'location-1',
          patch: { visualDescription: '밝은 교실' },
          before: { name: '교실', visualDescription: '어두운 교실' },
          sourceSnapshot: { table: 'locations', values: { visual_description: 'dark classroom', visual_description_native: '어두운 교실', updated_at: 'v1' } },
        },
      },
    }))

    await expect(useGlobalChatStore.getState().approvePendingProposal('undo-location')).resolves.toBe(true)
    expect(useArtistStore.getState().worldAssets[0].visualDescriptionNative).toBe('밝은 교실')
    expect(useArtistStore.getState().proposalUndo).toMatchObject({
      kind: 'artistSourceLocationPatch', resource: 'backgrounds', id: 'location-1',
      before: { visualDescription: '어두운 교실' },
    })

    await expect(useArtistStore.getState().undoLastProposal()).resolves.toBe(true)

    expect(locations[0].visual_description_native).toBe('어두운 교실')
    expect(useArtistStore.getState().worldAssets[0].visualDescriptionNative).toBe('어두운 교실')
    expect(useArtistStore.getState().proposalUndo).toBeNull()
  })

  it('되돌리기는 마지막 승인 한 건만 되돌린다', async () => {
    // 왜: 승인이 두 번 쌓인 뒤 되돌리기를 누른 사람은 방금 바뀐 한 건만 되돌아가길 기대한다
    useArtistStore.setState({ worldAssets: [worldAsset()] })
    useArtistStore.getState().recordProposalUndo({
      kind: 'artistSourceLocationPatch', resource: 'backgrounds', id: 'location-1',
      before: { visualDescription: '어두운 교실' }, patch: { visualDescription: '밝은 교실' },
    })
    useArtistStore.getState().recordProposalUndo({
      kind: 'artistSourceLocationPatch', resource: 'backgrounds', id: 'location-1',
      before: { visualDescription: '밝은 교실' }, patch: { visualDescription: '비 오는 교실' },
    })

    expect(useArtistStore.getState().proposalUndo).toMatchObject({ before: { visualDescription: '밝은 교실' } })

    const fetchMock = vi.fn(async () => Response.json({ visualDescription: 'bright classroom', visualDescriptionNative: '밝은 교실' }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(useArtistStore.getState().undoLastProposal()).resolves.toBe(true)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(useArtistStore.getState().worldAssets[0].visualDescriptionNative).toBe('밝은 교실')
    expect(useArtistStore.getState().proposalUndo).toBeNull()
    // 되돌린 뒤에는 되돌릴 것이 남아 있지 않다 — 그 앞의 승인까지 거슬러 올라가지 않는다.
    await expect(useArtistStore.getState().undoLastProposal()).resolves.toBe(false)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('모습 삭제·재생성 승인은 되돌리기 대상이 아니다', async () => {
    // 왜: 서버에서 지워지거나 과금이 된 작업을 되돌리기 줄이 약속하면 사용자를 속인다
    useArtistStore.setState({ characterAssets: [characterAsset()] })
    for (const kind of ['artistDeleteAppearance', 'artistDeleteLocationAppearance', 'artistRegenerateCharacterView', 'artistCreateAppearance'] as const) {
      useArtistStore.getState().recordProposalUndo({
        kind, resource: 'characters', id: 'person-1',
        before: { appearance: 'black hair' }, patch: { appearance: 'red hair' },
      })
      expect(useArtistStore.getState().proposalUndo).toBeNull()
    }

    const fetchMock = vi.fn(async () => Response.json({ ok: true }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(useArtistStore.getState().undoLastProposal()).resolves.toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
