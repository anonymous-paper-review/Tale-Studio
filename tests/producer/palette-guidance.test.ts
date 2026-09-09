// 그림체를 고르는 방법은 어려운 이름 대신 채팅 입력창 아래 팔레트 아이콘으로 안내한다.
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { buildProducerSystem } from '@/app/api/produce/chat/system-prompt'
import { useGlobalChatStore } from '@/stores/global-chat-store'
import { useProducerStore } from '@/stores/producer-store'
import { useProjectStore } from '@/stores/project-store'
import { useLocaleStore } from '@/stores/locale-store'

beforeEach(() => {
  useGlobalChatStore.getState().reset()
  useProducerStore.getState().reset()
  useProjectStore.getState().resetProject()
  useLocaleStore.setState({ locale: 'ko' })
  useProducerStore.setState({ styleAnchors: [{ key: 'available', label: '사용 가능한 그림체', medium: 'live_action', imageUrl: null, previewUrl: null, subtitle: null }] })
})
afterEach(() => vi.unstubAllGlobals())

it('채팅에서 스타일 선택 위치를 설명할 때 입력창 아래 팔레트 아이콘으로 안내하도록 한다', () => {
  // 왜: 스타일 피커라는 이름만으로는 사용자가 실제 버튼을 찾기 어렵다.
  for (const locale of ['ko', 'en'] as const) {
    expect(buildProducerSystem(locale)).toContain('palette icon below the chat input')
  }
})

it('요청한 스타일을 찾지 못하면 채팅 입력창 아래 팔레트 아이콘으로 안내한다', async () => {
  // 왜: 자동 스타일 선택이 실패한 뒤에도 사용자가 직접 고르는 위치를 알 수 있어야 한다.
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({
    reply: '그림체를 확인했어요.', extractedSettings: { styleAnchorKey: 'unknown' },
  })))
  await useGlobalChatStore.getState().sendMessage('일본 멜로 느낌으로 해줘')
  const reply = useGlobalChatStore.getState().messages.at(-1)?.content
  expect(reply).toContain('채팅 입력창 아래의 팔레트 아이콘')
  expect(reply).not.toContain('스타일 피커')
})
