// 그림체를 고르는 곳은 그림을 만들 때 여는 Artist 스타일 창으로 안내한다 — 채팅 입력창 아래 팔레트 아이콘은 이제 없다 (D6 · 리드 2026-11-22 결정 3)
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

it('채팅에서 스타일 고르는 곳을 설명할 때 그림을 만들 때 여는 Artist 스타일 창으로 안내하도록 한다', () => {
  // 왜: 스타일은 Artist [만들기] · [재생성하기] 창에서 고른다 — 예전 안내의 "채팅 입력창 아래 팔레트 아이콘"은 지금 없는 단추였다(리드 결정 3).
  for (const locale of ['ko', 'en'] as const) {
    const system = buildProducerSystem(locale)
    expect(system).toContain('the style window in Artist when you make the images')
    expect(system).not.toContain('palette icon')
  }
})

it('요청한 스타일을 찾지 못하면 그림을 만들 때 Artist 스타일 창에서 고르라고 안내한다', async () => {
  // 왜: 자동 스타일 선택이 실패한 뒤에도 사용자가 직접 고르는 곳을 알 수 있어야 한다 — 없는 단추를 가리키면 찾을 수 없다.
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({
    reply: '그림체를 확인했어요.', extractedSettings: { styleAnchorKey: 'unknown' },
  })))
  await useGlobalChatStore.getState().sendMessage('일본 멜로 느낌으로 해줘')
  const reply = useGlobalChatStore.getState().messages.at(-1)?.content
  expect(reply).toContain('그림을 만들 때 Artist 스타일 창')
  expect(reply).not.toContain('팔레트 아이콘')
  expect(reply).not.toContain('스타일 피커')
})
