// 스타일을 직접 골랐을 때만 저장 결과에 맞게 안내하고 진행 중인 대화를 가리지 않는다.
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useProducerStore } from '@/stores/producer-store'
import { useProjectStore } from '@/stores/project-store'
import { useGlobalChatStore } from '@/stores/global-chat-store'
import { useLocaleStore } from '@/stores/locale-store'

vi.mock('@/lib/chat-persistence', () => ({ saveChatMessage: vi.fn() }))

beforeEach(() => {
  useProducerStore.getState().reset()
  useProjectStore.getState().resetProject()
  useGlobalChatStore.getState().reset()
  useProjectStore.setState({ projectId: 'p1', currentStage: 'producer' })
  useLocaleStore.setState({ locale: 'ko' })
  vi.spyOn(useProducerStore.getState(), 'setStyleAnchor').mockImplementation(async (key) => {
    useProducerStore.setState({ styleAnchorKey: key })
  })
})
afterEach(() => vi.restoreAllMocks())

async function select() {
  const { selectStyleAnchorFromPicker } = await import('@/features/producer/select-style-anchor')
  await selectStyleAnchorFromPicker('real_jp_melo')
}

it('스타일을 직접 고르고 필수 정보가 남아 있으면 남은 정보를 안내한다', async () => {
  await select()
  expect(useProducerStore.getState().styleAnchorKey).toBe('real_jp_melo')
  expect(useGlobalChatStore.getState().suggestion?.content).toContain('장르 필요')
})

it('장르 선택지가 떠 있으면 스타일 안내로 선택지를 가리지 않는다', async () => {
  useGlobalChatStore.getState().offerSuggestion({
    id: 'choices:genre', stage: 'producer', content: '',
    action: { kind: 'choices', options: [{ label: '일상', utterance: '일상' }, { label: '로맨스', utterance: '로맨스' }] },
  })
  await select()
  expect(useGlobalChatStore.getState().suggestion?.id).toBe('choices:genre')
})

it('스타일 저장에 실패하면 스타일을 확정했다고 안내하지 않는다', async () => {
  vi.mocked(useProducerStore.getState().setStyleAnchor).mockResolvedValue()
  await select()
  expect(useGlobalChatStore.getState().suggestion).toBeNull()
})

it('채팅 답변을 기다리는 중에 스타일을 골라도 추가 안내를 띄우지 않는다', async () => {
  useGlobalChatStore.setState({ loading: true })
  await select()
  expect(useGlobalChatStore.getState().suggestion).toBeNull()
})

it('스타일을 저장하는 동안 다른 프로젝트로 이동하면 이전 프로젝트 안내를 띄우지 않는다', async () => {
  vi.mocked(useProducerStore.getState().setStyleAnchor).mockImplementation(async (key) => {
    useProducerStore.setState({ styleAnchorKey: key })
    useProjectStore.setState({ projectId: 'p2' })
  })
  await select()
  expect(useGlobalChatStore.getState().suggestion).toBeNull()
})
