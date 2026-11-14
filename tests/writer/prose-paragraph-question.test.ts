// 문단을 붙인 채 보낸 말이 물음이면 문단 수정 요청이 아니라 AI 가 답하고, 붙은 문단 칩은 그대로 남는다 (오너 2026-11-14 답 B ①)
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/chat-persistence', () => ({ saveChatMessage: vi.fn(), saveChatTrace: vi.fn(), saveChatTracePatch: vi.fn(), loadLatestChatTrace: vi.fn() }))
vi.mock('@/lib/writer/use-writer-status', async (original) => ({ ...(await original<typeof import('@/lib/writer/use-writer-status')>()), restartWriterStatus: vi.fn() }))

import { readFileSync } from 'node:fs'
import { goesToParagraph, pickRoute } from '@/features/prose/paragraph-request'
import { useChatUiStore } from '@/stores/chat-ui-store'
import { useGlobalChatStore } from '@/stores/global-chat-store'
import { useLocaleStore } from '@/stores/locale-store'
import { useProjectStore } from '@/stores/project-store'
import { useWriterRoomStore } from '@/stores/writer-room-store'
import type { ParagraphPick } from '@/lib/prose/paragraph-pick'

const PROJECT = 'prose-project'
// 이 시험을 위해 새로 지은 글 — 실제 사용자의 글이 아니다.
const P2 = '서윤이 카운터 뒤에서 나와 창가로 걸어간다. 밖에는 비가 내리고, 가게 안은 조용하다.'
const S2: ParagraphPick = { projectId: PROJECT, index: 1, text: P2 }
const ASK = '인물 설정은 어떻게 돼 있어?'

let request: ReturnType<typeof vi.fn>
const urls = () => request.mock.calls.map(([url]) => String(url))
const bodies = () => request.mock.calls.map(([url, init]) => ({ url: String(url), body: JSON.parse(String((init as RequestInit).body)) }))

beforeEach(() => {
  useLocaleStore.setState({ locale: 'ko' })
  useGlobalChatStore.getState().reset()
  useWriterRoomStore.setState({ paragraph: null, rewriteOpen: false, confirmOpen: false, manualRequest: 0 })
  useChatUiStore.setState({ collapsed: false, focusRequest: null })
  useProjectStore.setState({ projectId: PROJECT, currentStage: 'producer', reachedStage: 'producer', producerLocked: false, treatmentDraft: true, projectLocale: 'ko' })
  request = vi.fn(async (url: string) => (String(url) === '/api/produce/chat' ? Response.json({ reply: '서윤은 카페 주인이에요.' }) : Response.json({ ok: true, proposalId: 'p1' })))
  vi.stubGlobal('fetch', request)
})
afterEach(() => {
  vi.unstubAllGlobals()
  useLocaleStore.setState({ locale: 'en' })
})

describe('문단을 붙인 채 보낸 물음', () => {
  it('문단을 붙인 채 보낸 말이 물음이면 문단 수정 요청으로 보내지 않고 그 문단 칩은 그대로 남긴다', () => {
    // 왜: 질문을 보냈는데 "그 문단만 고쳐 주세요"가 붙어 수정안이 만들어졌고, 답은 없었다(바우처 사용자 채팅 B).
    useWriterRoomStore.setState({ paragraph: S2 })

    expect(pickRoute(ASK)).toBe('question')
    expect(goesToParagraph(ASK)).toBe(false)

    expect(useWriterRoomStore.getState().paragraph).toEqual(S2)
  })

  it('물음은 산문 수정 요청 대신 Writer 채팅으로 보내 AI 가 답하고 채팅에는 보낸 말이 그대로 남는다', async () => {
    // 왜: 물음에는 수정안이 아니라 답이 와야 한다. 채팅 줄은 "S2 …" 머리 없이 사용자가 쓴 말이다.
    useWriterRoomStore.setState({ paragraph: S2 })

    await useGlobalChatStore.getState().sendMessage(ASK, undefined, { stageOverride: 'producer', askOnly: true })

    expect(urls()).toEqual(['/api/produce/chat'])
    expect(bodies()[0].body).toMatchObject({ message: ASK, treatmentDraft: true })
    const lines = useGlobalChatStore.getState().messages.map((m) => `${m.role}:${m.content}`)
    expect(lines).toEqual([`user:${ASK}`, 'model:서윤은 카페 주인이에요.'])
    expect(useWriterRoomStore.getState().paragraph).toEqual(S2)
  })

  it('영어 물음도 문단을 붙인 채 보내면 AI 가 답한다', () => {
    // 왜: 영어 화면 사용자도 같다.
    useWriterRoomStore.setState({ paragraph: S2 })
    expect(pickRoute('Who is the main character here?')).toBe('question')
    expect(pickRoute('Can you tell me how long this scene is?')).toBe('question')
  })
})

describe('고쳐 달라는 부탁은 계속 문단 수정 요청이다', () => {
  // 왜: 부탁 꼴 물음이 답변으로 바뀌면 사용자가 고치려던 문단이 그대로 남는다 — 잘못 걸리는 것이 제일 위험하다.
  it.each(['더 짧게 해 줄래?', '여기 좀 더 웃기게 바꿔 줄 수 있어?', 'can you make it shorter?', 'Could you add a joke here?', '비 오는 밤으로 바꾸면 어때?', 'What if she were older?', '더 슬프게', '계속해'])(
    '문단을 붙인 채 보낸 %s 는 그 문단 수정 요청이다',
    (said) => {
      useWriterRoomStore.setState({ paragraph: S2 })
      expect(pickRoute(said)).toBe('paragraph')
      expect(goesToParagraph(said)).toBe(true)
    },
  )
})

describe('이번에 바뀌지 않는 길', () => {
  it('붙은 문단이 없으면 물음도 지금처럼 Writer 채팅 길을 따른다', async () => {
    // 왜: 정상 경로 고정 — 문단을 안 붙인 말은 2026-10-19 약속대로 산문 수정 요청이다. 같은 가름을 거기에도 쓸지는 오너 결정으로 남아 있다.
    expect(pickRoute(ASK)).toBe('chat')

    await useGlobalChatStore.getState().sendMessage(ASK, undefined, { stageOverride: 'producer' })

    expect(bodies()).toEqual([{ url: '/api/writer/scene-gate', body: { projectId: PROJECT, action: 'revise', feedback: ASK } }])
  })

  it('붙은 문단이 있어도 확정 · 브레이크다운 말은 지금처럼 확정 창으로 가고 문단은 떨어진다', () => {
    // 왜: 정상 경로 고정(검토 A L1).
    useWriterRoomStore.setState({ paragraph: S2 })

    expect(pickRoute('확정할게')).toBe('chat')

    expect(useWriterRoomStore.getState().paragraph).toBeNull()
  })

  it('채팅 입력칸의 보내기는 문단 가름을 먼저 보고, 물음이면 AI 답으로 보낸다', () => {
    // 왜: 입력칸이 이 가름을 거치지 않으면 위 규칙이 화면에서는 일어나지 않는다.
    const source = readFileSync('src/components/layout/global-chat.tsx', 'utf8')
    expect(/goesToParagraph\(typed\)/.test(source)).toBe(true)
    expect(/questionAboutPick\(typed\)/.test(source)).toBe(true)
    expect(/askOnly: true/.test(source)).toBe(true)
  })
})
