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

const fetchMock = vi.fn(async () => Response.json({ reply: '일반 응답', updates: [] }))
beforeEach(() => {
  vi.clearAllMocks()
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
  expect(await resources.backgrounds.write('location-1', { visualDescription: '밝은 교실' }, { name: '교실', visualDescription: '어두운 교실' }))
    .toMatchObject({ status: 'approval_required' })
  expect(useGlobalChatStore.getState().pendingProposal).toMatchObject({ stage: 'artist', kind: 'artistSourceLocationPatch', payload: { toolEdit: { resource: 'backgrounds' } } })

  await useGlobalChatStore.getState().sendMessage('취소해줘')

  expect(useGlobalChatStore.getState().pendingProposal).toBeNull()
  expect(useGlobalChatStore.getState().deferredProposals).toEqual([])
  expect(fetchMock).not.toHaveBeenCalled()
  expect(db.createClient).not.toHaveBeenCalled()
  expect(useGlobalChatStore.getState().messages.at(-1)).toMatchObject({ stage: 'writer', role: 'model', content: expect.stringContaining('취소') })
})
