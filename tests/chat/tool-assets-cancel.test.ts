// Writer에서 요청한 Artist 원천 변경도 현재 승인 카드에서 취소하면 실행하지 않는다.
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const db = vi.hoisted(() => ({ createClient: vi.fn(() => { throw new Error('취소 경로에서 DB를 호출하면 안 됩니다') }) }))
vi.mock('@/lib/supabase/client', () => ({ createClient: db.createClient, createCatalogClient: vi.fn() }))
vi.mock('@/lib/chat-persistence', () => ({ saveChatMessage: vi.fn(), saveChatTrace: vi.fn(), saveChatTracePatch: vi.fn(), loadLatestChatTrace: vi.fn() }))

import { createStudioToolResources } from '@/stores/chat-tool-bindings'
import { useGlobalChatStore } from '@/stores/global-chat-store'
import { useProjectStore } from '@/stores/project-store'
import { useWriterStore } from '@/stores/writer-store'
import { useLocaleStore } from '@/stores/locale-store'
import { createPendingProposal } from '@/lib/pending-proposal'
import type { ArtistSourceSnapshot } from '@/lib/artist/source-snapshot'

const fetchMock = vi.fn(async () => Response.json({ reply: '일반 응답', updates: [] }))
const locationSnapshot: ArtistSourceSnapshot = {
  table: 'locations',
  values: { visual_description: 'dark classroom', visual_description_native: '어두운 교실', updated_at: '2026-09-14T00:00:00Z' },
}
beforeEach(() => {
  vi.clearAllMocks()
  db.createClient.mockImplementation(() => { throw new Error('취소 경로에서 DB를 호출하면 안 됩니다') })
  useGlobalChatStore.getState().reset()
  useProjectStore.setState({ projectId: 'p-tool-cancel', currentStage: 'writer', reachedStage: 'writer', projectLocale: 'ko' })
  useWriterStore.setState({ sceneManifest: null, shots: [] })
  useLocaleStore.setState({ locale: 'ko' })
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => { useGlobalChatStore.getState().reset(); vi.unstubAllGlobals() })

it('Writer에서 만든 Artist 배경 변경 승인을 취소하면 모델을 부르거나 저장하지 않는다', async () => {
  // 왜: 도구가 원천 담당 단계의 승인 카드를 만들더라도 사용자는 현재 대화에서 취소할 수 있어야 한다.
  const resources = createStudioToolResources({
    stage: 'writer', projectId: 'p-tool-cancel', traceId: 'trace-cancel', signal: new AbortController().signal, isCurrent: () => true,
    offerProposal: proposal => { useGlobalChatStore.getState().offerPendingProposal(proposal) },
  })
  expect(await resources.backgrounds.write('location-1', { visualDescription: '밝은 교실' }, { name: '교실', visualDescription: '어두운 교실' }, locationSnapshot))
    .toMatchObject({ status: 'approval_required' })
  expect(useGlobalChatStore.getState().pendingProposal).toMatchObject({ stage: 'artist', kind: 'artistSourceLocationPatch', payload: { toolEdit: { resource: 'backgrounds' } } })

  await useGlobalChatStore.getState().sendMessage('취소해줘')

  expect(useGlobalChatStore.getState().pendingProposal).toBeNull()
  expect(useGlobalChatStore.getState().deferredProposals).toEqual([])
  expect(fetchMock).not.toHaveBeenCalled()
  expect(db.createClient).not.toHaveBeenCalled()
  expect(useGlobalChatStore.getState().messages.at(-1)).toMatchObject({ stage: 'writer', role: 'model', content: expect.stringContaining('취소') })
})

it('승인 당시 원천 스냅샷이 오래되면 같은 값이어도 저장하지 않는다', async () => {
  // 왜: 확인값이 잠시 바뀌었다가 돌아오는 사이에도 오래된 승인으로 다른 사용자의 수정을 덮어쓰면 안 된다.
  const rows = [{ project_id: 'p-tool-cancel', location_id: 'location-1', name: '교실', visual_description: 'classroom', visual_description_native: '교실', updated_at: 'v2' }]
  db.createClient.mockImplementation(() => ({
    from: (table: string) => {
      const filters: Record<string, unknown> = {}
      let columns = '*'
      const execute = async () => {
        const selected = table === 'locations'
          ? rows.filter(row => Object.entries(filters).every(([key, value]) => row[key as keyof typeof row] === value))
          : []
        const data = selected.map(row => columns === '*' ? structuredClone(row) : Object.fromEntries(columns.split(',').map(key => [key, row[key as keyof typeof row]])))
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
  useProjectStore.setState({ currentStage: 'artist', reachedStage: 'artist' })
  useGlobalChatStore.getState().offerPendingProposal(createPendingProposal({
    id: 'artist-stale-source',
    projectId: 'p-tool-cancel',
    stage: 'artist',
    kind: 'artistSourceLocationPatch',
    target: '교실',
    action: '배경 설명 저장',
    impact: [],
    payload: {
      toolEdit: {
        resource: 'backgrounds',
        id: 'location-1',
        patch: { visualDescription: '교실' },
        before: { name: '교실', visualDescription: '교실' },
        sourceSnapshot: {
          table: 'locations',
          values: { visual_description: 'classroom', visual_description_native: '교실', updated_at: 'v1' },
        },
      },
    },
  }))

  const result = await useGlobalChatStore.getState().approvePendingProposal('artist-stale-source')

  expect(result).toBe(false)
  expect(fetchMock).not.toHaveBeenCalled()
  expect(rows[0].visual_description_native).toBe('교실')
})

it('원천 확인 정보가 없는 이전 승인 카드는 저장하지 않고 다시 요청하게 한다', async () => {
  useProjectStore.setState({ currentStage: 'artist', reachedStage: 'artist' })
  const proposal = createPendingProposal({
    id: 'artist-legacy-source', projectId: 'p-tool-cancel', stage: 'artist',
    kind: 'artistSourceLocationPatch', target: '교실', action: '설명 변경', impact: [],
    payload: { locationId: 'location-1', visualDescription: '밝은 교실' },
  })
  useGlobalChatStore.getState().offerPendingProposal(proposal)
  await expect(useGlobalChatStore.getState().approvePendingProposal(proposal.id)).resolves.toBe(false)
  expect(fetchMock).not.toHaveBeenCalled()
  expect(db.createClient).not.toHaveBeenCalled()
})
