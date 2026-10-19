// Storyboard 의 [예, 넘기기]가 채팅의 Director 넘김과 같은 길(저장된 조건 확인 → Director 열기)을 타는지 검사한다
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
vi.mock('@/lib/chat-persistence', () => ({ saveChatMessage: vi.fn(), saveChatTrace: vi.fn(), saveChatTracePatch: vi.fn(), loadLatestChatTrace: vi.fn() }))
import { handOverToDirector } from '@/features/writer/storyboard-director'
import { useGlobalChatStore } from '@/stores/global-chat-store'
import { useProjectStore } from '@/stores/project-store'
import { useLocaleStore } from '@/stores/locale-store'

const ready = { ready: true, blockers: [], warnings: [], counts: { scenes: 3, shots: 8 }, path: '/studio/director' }
let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  useGlobalChatStore.getState().reset()
  useProjectStore.setState({ projectId: 'board-test', currentStage: 'writer', reachedStage: 'writer', projectLocale: 'ko', projectLocaleLocked: true })
  useLocaleStore.setState({ locale: 'ko' })
  fetchMock = vi.fn(async () => Response.json(ready))
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  useGlobalChatStore.getState().reset()
  vi.unstubAllGlobals()
})

// 왜: Director 로 넘기는 길은 하나여야 한다 — 채팅에 "Director로 넘겨주세요"라고 쓴 것과 같은 판정 · 같은 서버 확인 · 같은 화면 이동(버튼 = 타이핑, #handoff-to-chat). 정상 경로 고정.
it('[예, 넘기기]를 누르면 채팅으로 Director 넘김을 요청한 것과 같은 길로 저장된 조건을 확인하고 Director를 연다', async () => {
  await handOverToDirector()
  expect(fetchMock.mock.calls.map((call) => call[0])).toEqual(['/api/project/board-test/handoff'])
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ targetStage: 'director', action: 'move' })
  expect(useGlobalChatStore.getState().pendingNavigatePath).toContain('/studio/director')
  const userLines = useGlobalChatStore.getState().messages.filter((m) => m.role === 'user').map((m) => m.content)
  expect(userLines).toEqual(['Director로 넘겨주세요'])
})

// 왜: 넘길 조건이 모자라면(예: Artist 그림이 빠짐) 채팅이 이유를 말하고 넘기지 않는다 — 버튼으로 눌러도 같은 방어가 걸린다.
it('넘길 조건이 모자라면 [예, 넘기기]를 눌러도 이유를 알리고 넘기지 않는다', async () => {
  fetchMock.mockResolvedValue(Response.json({ ready: false, blockers: [{ code: 'missing_image', label: '코마츠: 기본 이미지 필요', action: 'Artist에서 코마츠 이미지를 준비해 주세요.', stage: 'artist' }], counts: { scenes: 3, shots: 8 }, warnings: [] }, { status: 409 }))
  await handOverToDirector()
  expect(useGlobalChatStore.getState().pendingNavigatePath).toBeNull()
  expect(useGlobalChatStore.getState().messages.map((m) => m.content).join('\n')).toContain('코마츠')
})
