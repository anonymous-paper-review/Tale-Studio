// Artist 채팅 한 턴에서 그림 조회 요청이 화면 요약만으로 끝나면 실제 서버 조회로 이어간다.
import { afterEach, expect, it, vi } from 'vitest'
vi.mock('@/lib/chat-persistence', () => ({ saveChatMessage: vi.fn(), saveChatTrace: vi.fn(), saveChatTracePatch: vi.fn(), loadLatestChatTrace: vi.fn() }))
import { useGlobalChatStore as chat } from '@/stores/global-chat-store'
import { useProjectStore as project } from '@/stores/project-store'
import { useArtistStore as artist } from '@/stores/artist-store'
import type { CharacterAsset } from '@/types/asset'
afterEach(() => vi.unstubAllGlobals())
it('화면 요약에 no sheet인 모습의 그림 조회 요청은 모델이 도구 없이 답해도 저장소 조회 뒤 답한다', async () => {
  // 왜: DEV 실측 2회에서 모델이 "no sheet"만 인용해 조회 없이 없다고 답했다.
  chat.getState().reset();artist.getState().reset()
  project.setState({ projectId: 'p', currentStage: 'artist', reachedStage: 'artist' })
  artist.setState({ characterAssets: [{ characterId: 'char_doyun', name: '도윤', appearances: [
    { appearanceKey: 'current', label: '현재', isDefault: true, narrativeTime: 'present', sheetUrl: 'https://owned/current.png' },
    { appearanceKey: 'future', label: '미래 모습', isDefault: false, narrativeTime: 'future', sheetUrl: null },
  ] } as unknown as CharacterAsset] })
  const requests: Array<{ url: string; body: Record<string, unknown> }> = []
  let chatCalls = 0
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));requests.push({ url, body })
    if (url.endsWith('chat-inspect')) return Response.json({ status: 'ok', target: 'character', id: 'char_doyun', appearances: [{ appearanceKey: 'future', hasImage: true }], imageRevision: 'ab12cd34-40', image: { source: 'character_appearances.sheet_url', appearanceKey: 'future' } })
    chatCalls++
    if (chatCalls === 1) return Response.json({ toolSupport: true, reply: '도윤의 미래 모습은 이미지가 없는 상태(no sheet)입니다.' })
    if (chatCalls === 2) return Response.json({ toolTurn: { stopReason: 'tool_use', content: [{ type: 'tool_use', id: 'i', name: 'inspect_project', input: { target: 'character', id: 'char_doyun', appearanceKey: 'future', includeImage: true } }] } })
    return Response.json({ toolSupport: true, reply: '저장소를 조회하니 미래 모습 시트가 있어요. 붉은 코트가 보입니다.' })
  }))
  await chat.getState().sendMessage('도윤의 미래 모습 이미지를 직접 조회해서 옷 색을 확인해줘. 이미지가 없으면 다른 모습으로 대신 보지 말고 알려줘. 생성이나 수정은 하지 마.')
  const chatRequests = requests.filter(r => r.url.endsWith('/api/artist/chat'))
  expect(chatRequests).toHaveLength(3)
  expect(chatRequests[0].body.canvasContext).toContain('future ("미래 모습", future, no sheet)')
  const check = chatRequests[1].body.toolMessages as Array<{ role: string; content: Array<{ type: string; text?: string }> }>
  expect(check.at(-1)?.role).toBe('user')
  expect(check.at(-1)?.content[0].text).toContain('inspect_project')
  expect(requests.find(r => r.url.endsWith('chat-inspect'))?.body).toMatchObject({ stage: 'artist', target: 'character', id: 'char_doyun', appearanceKey: 'future', includeImage: true })
  const last = chat.getState().messages.at(-1)
  expect(last?.role).toBe('model')
  expect(last?.content).toContain('붉은 코트가 보입니다')
  expect(last?.content).not.toContain('조회하지 않았')
})
