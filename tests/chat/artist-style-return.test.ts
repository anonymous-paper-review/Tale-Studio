// Artist 채팅에서 이전 스타일 · 버전으로 돌아가자는 말은 다시 만들지 않고 "이전 스타일로 돌아갈까요?" 카드로 답한다 (2026-10-28 오너, 프로토타입 AY)
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/chat-persistence', () => ({ saveChatMessage: vi.fn(), saveChatTrace: vi.fn(), saveChatTracePatch: vi.fn(), loadLatestChatTrace: vi.fn() }))

import { styleReturnRequest } from '@/lib/artist/style-versions'
import { useArtistVersionStore } from '@/stores/artist-version-store'
import { useGlobalChatStore } from '@/stores/global-chat-store'
import { useProducerStore } from '@/stores/producer-store'
import { useProjectStore } from '@/stores/project-store'

const STYLE_NAMES = ['실사', '수채화', '일본 애니']
const view = (n: number, styleKey: string, current = false) => ({ n, styleId: styleKey, styleKey, customStyle: null, current, active: [], createdAt: '', thumbs: [] })

function serverHas(versions: ReturnType<typeof view>[], completed = false) {
  const fetchMock = vi.fn(async (url: string) => {
    if (String(url).startsWith('/api/artist/versions')) return Response.json({ versions, currentN: versions.find((v) => v.current)?.n ?? 1, regen: null, completed })
    return Response.json({ reply: '모델 답', updates: [] })
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}
const modelCalled = (fetchMock: ReturnType<typeof vi.fn>) => fetchMock.mock.calls.some(([url]) => String(url).includes('/api/artist/chat'))

beforeEach(() => {
  useGlobalChatStore.getState().reset()
  useArtistVersionStore.getState().reset()
  useProjectStore.setState({ projectId: 'p1', currentStage: 'artist', reachedStage: 'artist', projectLocale: 'ko', projectLocaleLocked: true })
  useProducerStore.setState({
    styleAnchorKey: 'anime', customStyleAnchor: null,
    styleAnchors: [
      { key: 'real', label: '실사', medium: 'photo', imageUrl: null, previewUrl: null, subtitle: null },
      { key: 'watercolor', label: '수채화', medium: 'watercolor', imageUrl: null, previewUrl: null, subtitle: null },
      { key: 'anime', label: '일본 애니', medium: 'anime', imageUrl: null, previewUrl: null, subtitle: null },
    ],
  } as never)
})
afterEach(() => {
  useGlobalChatStore.getState().reset()
  vi.unstubAllGlobals()
})

describe('이전 스타일로 돌아가자는 말 알아듣기', () => {
  it('"이전 스타일로 돌아가고 싶어" · "실사로 돌아가고 싶어" · "전 버전으로" 같은 말은 이전 버전으로 돌아가자는 말로 듣는다', () => {
    // 왜: 오너 예시 문장 — 이 말을 모델에 보내면 그림을 새로 그리자는 제안이 나와 비용이 든다. 다시 만들지 않고 불러오는 길을 먼저 보인다.
    for (const said of ['이전 스타일로 돌아가고 싶어', '실사로 돌아가고 싶어', '전 버전으로', '예전 그림체로 되돌려 줘', '이전 버전 불러와줘', '수채화로 다시 돌아갈래', 'Go back to the previous style', 'revert to the old version']) {
      expect(styleReturnRequest(said, STYLE_NAMES), said).toBe(true)
    }
  })

  it('스타일 · 버전을 되돌리자는 말이 아니면 지금처럼 Artist 채팅(모델)으로 보낸다', async () => {
    // 왜: 정상 경로 고정 — 인물 · 배경을 고치는 말이나 질문까지 카드로 가로채면 채팅이 일을 못 한다.
    for (const said of ['민호 머리를 짧게 해줘', '이전 장면에서 민호가 뭐 했지?', '배경을 더 밝게 바꿔줘', '실사 느낌이 좋아', '민호를 다시 그려줘', '처음으로 돌아가서 다시 보여줘']) {
      expect(styleReturnRequest(said, STYLE_NAMES), said).toBe(false)
    }
    const fetchMock = serverHas([view(1, 'real'), view(2, 'anime', true)])
    await useGlobalChatStore.getState().sendMessage('민호 머리를 짧게 해줘', undefined, { stageOverride: 'artist' })
    expect(modelCalled(fetchMock)).toBe(true)
    expect(useGlobalChatStore.getState().suggestion?.action?.kind).not.toBe('artistVersions')
  })
})

describe('"이전 스타일로 돌아갈까요?" 카드', () => {
  it('이전 버전이 있으면 다시 만들지 않고 불러올 수 있다고 알리고 버전마다 [v{n} · {스타일} 불러오기]를 보인다', async () => {
    // 왜: 프로토타입 AY — 다시 그리지 않고 예전 그림으로 돌아가는 길. 불러오면 작품 스타일도 바뀐다는 것을 함께 말한다.
    const fetchMock = serverHas([view(1, 'real'), view(2, 'watercolor'), view(3, 'anime', true)])
    await useGlobalChatStore.getState().sendMessage('실사로 돌아가고 싶어', undefined, { stageOverride: 'artist' })
    expect(modelCalled(fetchMock)).toBe(false)
    const suggestion = useGlobalChatStore.getState().suggestion
    expect(suggestion?.stage).toBe('artist')
    expect(suggestion?.content).toBe('이전 스타일로 돌아갈까요?\n다시 만들지 않고 이전 버전을 불러올 수 있어요. 불러오면 작품 스타일도 그 버전으로 바뀌어요.')
    expect(suggestion?.action).toEqual({ kind: 'artistVersions', options: [{ n: 2, label: 'v2 · 수채화 불러오기' }, { n: 1, label: 'v1 · 실사 불러오기' }], regenerate: false })
    // 사용자의 말은 채팅에 남는다.
    expect(useGlobalChatStore.getState().messages.some((m) => m.role === 'user' && m.content === '실사로 돌아가고 싶어')).toBe(true)
  })

  it('이전 버전이 없으면 "아직 이전 버전이 없어요. 다른 스타일로 만들려면 재생성해 주세요."와 [재생성하기]를 보인다', async () => {
    // 왜: 프로토타입 AY — 돌아갈 버전이 없을 때는 다른 스타일로 만드는 길(재생성)을 알려 준다.
    serverHas([])
    await useGlobalChatStore.getState().sendMessage('이전 스타일로 돌아가고 싶어', undefined, { stageOverride: 'artist' })
    const suggestion = useGlobalChatStore.getState().suggestion
    expect(suggestion?.content).toBe('이전 스타일로 돌아갈까요?\n아직 이전 버전이 없어요. 다른 스타일로 만들려면 재생성해 주세요.')
    expect(suggestion?.action).toEqual({ kind: 'artistVersions', options: [], regenerate: true })
  })

  it('Storyboard를 연 뒤에는 채팅도 스타일을 바꿀 수 없다고 알리고 단추를 보이지 않는다', async () => {
    // 왜: 오너 결정(2) — [완료하기] 뒤에는 불러오기 · 재생성이 없다. 채팅도 같은 까닭을 말한다.
    useProjectStore.setState({ reachedStage: 'writer' })
    const fetchMock = serverHas([view(1, 'real'), view(2, 'anime', true)], true)
    await useGlobalChatStore.getState().sendMessage('전 버전으로', undefined, { stageOverride: 'artist' })
    expect(modelCalled(fetchMock)).toBe(false)
    expect(useGlobalChatStore.getState().suggestion?.action?.kind).not.toBe('artistVersions')
    expect(useGlobalChatStore.getState().messages.at(-1)).toMatchObject({ role: 'model', content: 'Storyboard를 연 뒤에는 스타일을 바꿀 수 없어요.' })
  })
})
