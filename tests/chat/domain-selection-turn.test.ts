// 채팅 요청이 시작되면 선택한 그림은 그 요청이 끝날 때까지 고정한다
import { afterEach, expect, it, vi } from 'vitest'
vi.mock('@/lib/chat-persistence', () => ({ saveChatMessage: vi.fn(), saveChatTrace: vi.fn(), saveChatTracePatch: vi.fn(), loadLatestChatTrace: vi.fn() }))
import { useGlobalChatStore as chat } from '@/stores/global-chat-store'
import { useProjectStore as project } from '@/stores/project-store'
import { useArtistStore as artist } from '@/stores/artist-store'
import type { CharacterAsset } from '@/types/asset'
afterEach(() => vi.unstubAllGlobals())
it('모델 응답 중 다른 그림을 골라도 원래 요청의 이미지 표식을 조회한다', async () => {
  // 왜: 지금 화면 선택과 사용자가 질문한 시점의 그림은 다를 수 있다.
  chat.getState().reset();artist.getState().reset()
  project.setState({ projectId: 'p', currentStage: 'artist', reachedStage: 'artist' })
  const assets = (url: string) => [{ characterId: 'c', name: '도윤', appearances: [{ appearanceKey: 'young', sheetUrl: url }] } as CharacterAsset]
  artist.setState({ characterAssets: assets('https://owned/old.png') })
  artist.getState().setChatSelection({ projectId: 'p', target: 'character', id: 'c', appearanceKey: 'young', source: 'image' })
  const original = artist.getState().chatSelection!
  const requests: Record<string, unknown>[] = []
  let calls = 0
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));requests.push(body)
    if (url.endsWith('chat-inspect')) return Response.json({ status: 'image_unavailable' })
    if (++calls === 1) {
      artist.setState({ characterAssets: assets('https://owned/new.png') })
      artist.getState().setChatSelection({ ...original, source: 'image' })
      return Response.json({ toolTurn: { stopReason: 'tool_use', content: [{ type: 'tool_use', id: 'i', name: 'inspect_project', input: { target: 'character', id: 'c', appearanceKey: 'young', includeImage: true } }] } })
    }
    return Response.json({ reply: '그림 조회 결과를 확인했어요.' })
  }))
  await chat.getState().sendMessage('이 그림을 확인해줘')
  expect(requests[0].canvasContext).toContain(original.imageRevision)
  expect(requests.find(r => r.includeImage)).toMatchObject({ expectedImageRevision: original.imageRevision })
})
