// Writer 의 "다음 단계로 넘어갈까요?" 카드가 떠 있을 때 말로 한 "응 · 아니"는 그 질문에 대한 답이다 — 수정 요청으로 보내지 않는다 (오너 2026-11-14 답 F ①)
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/chat-persistence', () => ({ saveChatMessage: vi.fn(), saveChatTrace: vi.fn(), saveChatTracePatch: vi.fn(), loadLatestChatTrace: vi.fn() }))
vi.mock('@/lib/writer/use-writer-status', async (original) => ({ ...(await original<typeof import('@/lib/writer/use-writer-status')>()), restartWriterStatus: vi.fn() }))

import { pickRoute } from '@/features/prose/paragraph-request'
import { answerToNextStep } from '@/lib/prose/next-answer'
import { translate } from '@/lib/i18n/translate'
import { useChatUiStore } from '@/stores/chat-ui-store'
import { useGlobalChatStore } from '@/stores/global-chat-store'
import { useLocaleStore } from '@/stores/locale-store'
import { useProjectStore } from '@/stores/project-store'
import { useWriterRoomStore } from '@/stores/writer-room-store'
import type { ParagraphPick } from '@/lib/prose/paragraph-pick'

const PROJECT = 'prose-project'
const ko = (key: string) => translate('ko', key)
const S2: ParagraphPick = { projectId: PROJECT, index: 1, text: '서윤이 카운터 뒤에서 나와 창가로 걸어간다.' }
const CONFIRM_LINE = 'Check the prose, then confirm it to move on. Once you confirm, the prose is locked and Artist picks the characters and backgrounds.'

let request: ReturnType<typeof vi.fn>
const bodies = () => request.mock.calls.map(([url, init]) => ({ url: String(url), body: JSON.parse(String((init as RequestInit).body)) }))
const ask = () => useGlobalChatStore.getState().offerWriterNext('ask')
const send = (said: string) => useGlobalChatStore.getState().sendMessage(said, undefined, { stageOverride: 'producer' })

beforeEach(() => {
  useLocaleStore.setState({ locale: 'ko' })
  useGlobalChatStore.getState().reset()
  useWriterRoomStore.setState({ paragraph: null, rewriteOpen: false, confirmOpen: false, manualRequest: 0 })
  useChatUiStore.setState({ collapsed: false, focusRequest: null })
  useProjectStore.setState({ projectId: PROJECT, currentStage: 'producer', reachedStage: 'producer', producerLocked: false, treatmentDraft: true, projectLocale: 'ko' })
  request = vi.fn(async () => Response.json({ ok: true, proposalId: 'p1' }))
  vi.stubGlobal('fetch', request)
})
afterEach(() => {
  vi.unstubAllGlobals()
  useLocaleStore.setState({ locale: 'en' })
})

describe('짧은 대답 가르기', () => {
  // 왜: "응 · 네 · yes"만 쓴 짧은 대답만 카드의 답이다. 다른 말이 섞이면 고쳐 달라는 말이다.
  it.each(['응', '응!', '네', '넵', '네네', '예', '그래', '그래요', '좋아', '좋아요', '좋습니다', 'ㅇㅇ', 'ㅇㅋ', '오케이', '콜', '가자', 'yes', 'Yes!', 'yeah', 'yep', 'sure', 'ok', 'OK', 'okay', 'yes please', 'go ahead', "let's go", '응 좋아', '네, 좋아요', "yes, let's go"])(
    '넘어가자는 대답으로 읽는다: %s',
    (text) => {
      expect(answerToNextStep(text)).toBe('yes')
    },
  )

  // 왜: "아니 · no"도 같다 — 더 고치겠다는 대답이다.
  it.each(['아니', '아니요', '아니오', '아뇨', '아냐', '아니야', 'no', 'No.', 'nope', 'nah', 'not yet', 'not now', 'no thanks', 'later', '나중에', '아직', '아직요', '더 고칠래요', '더 고칠게', 'keep editing'])(
    '더 고치겠다는 대답으로 읽는다: %s',
    (text) => {
      expect(answerToNextStep(text)).toBe('no')
    },
  )

  // 왜: 잘못 읽으면 고쳐 달라는 말이 확정 창으로 간다 — 길거나 섞이거나 물음표가 붙은 말은 대답이 아니다.
  it.each(['응 그런데 결말을 더 슬프게 해줘', 'yes but make the ending sadder', '응?', '네?', 'yes?', '아니 근데 이게 왜 이래', 'no way', '그래서 어떻게 되는데', '결말 고쳐줘', '다음 단계로 가자', '', '   '])(
    '대답으로 읽지 않는다: %j',
    (text) => {
      expect(answerToNextStep(text)).toBeNull()
    },
  )
})

describe('다음 단계 카드에 말로 답하기', () => {
  it('"넘어갈까요?" 카드가 떠 있을 때 "응 · 네 · yes"는 수정 요청을 보내지 않고 확정 창을 연다', async () => {
    // 왜: 카드에 "응"이라고 답했더니 수정 요청이 가서 카드가 지워지고 "바꿀 곳을 못 찾았어요"가 나왔다(바우처 사용자 채팅 F).
    for (const said of ['응', '네', 'yes']) {
      useWriterRoomStore.setState({ confirmOpen: false })
      ask()

      await send(said)

      expect(request).not.toHaveBeenCalled()
      expect(useWriterRoomStore.getState().confirmOpen).toBe(true)
      // 확정 창이 열리면 채팅의 같은 질문은 내린다(디자이너 QA 1차 #08 — 한 곳에서만 묻는다).
      expect(useGlobalChatStore.getState().suggestion).toBeNull()
    }
    const lines = useGlobalChatStore.getState().messages.map((m) => `${m.role}:${m.content}`)
    expect(lines.slice(-2)).toEqual(['user:yes', `model:${ko(CONFIRM_LINE)}`])
  })

  it('"아니 · 아니요 · no"는 수정 요청을 보내지 않고 [아니요, 더 고칠래요] 단추와 같이 더 고치는 길 카드로 바꾼다', async () => {
    // 왜: 말로 해도 단추와 같은 일이 일어나야 한다. 카드가 "수정 요청"으로 지워지지 않고 다음에 할 일을 보여 준다.
    ask()

    await send('아니요')

    expect(request).not.toHaveBeenCalled()
    expect(useWriterRoomStore.getState().confirmOpen).toBe(false)
    expect(useGlobalChatStore.getState().suggestion?.action).toEqual({ kind: 'writerNext', step: 'more' })
    // 채팅에는 사용자가 한 말 다음에 더 고치는 길 카드의 물음이 남는다(단추를 눌렀을 때 카드가 남기는 줄과 같다).
    const lines = useGlobalChatStore.getState().messages
    expect(lines.at(-2)).toMatchObject({ role: 'user', content: '아니요' })
    expect(lines.at(-1)).toMatchObject({ role: 'model' })
  })

  it('카드가 없을 때의 "응"은 지금처럼 수정 요청이고 카드가 있어도 다른 말이 섞이면 수정 요청이다', async () => {
    // 왜: 정상 경로 고정 — 카드가 묻지 않았으면 "응"은 대답이 아니다. 대답에 고칠 점이 섞여 있으면 고치는 쪽이 먼저다.
    await send('응')
    expect(bodies().map((b) => b.url)).toEqual(['/api/writer/scene-gate'])
    // 첫 수정안을 정한 뒤(안이 기다리는 동안은 새 말이 튕긴다) 카드가 있는 채로 고칠 점이 섞인 대답을 한다.
    useGlobalChatStore.setState({ sceneStoryProposalPending: null })
    ask()
    await send('응 그런데 결말을 더 슬프게 해줘')

    expect(bodies().map((b) => b.url)).toEqual(['/api/writer/scene-gate', '/api/writer/scene-gate'])
    expect(useWriterRoomStore.getState().confirmOpen).toBe(false)
  })

  it('문단이 붙어 있어도 카드에 대한 대답은 문단 수정이 아니라 카드로 가고 문단 칩은 그대로다', async () => {
    // 왜: 문단을 눌러 읽다 붙은 채로 "응"이라고 해도 S2 를 고치는 말이 아니다.
    useWriterRoomStore.setState({ paragraph: S2 })
    ask()

    expect(pickRoute('응')).toBe('chat')
    await send('응')

    expect(request).not.toHaveBeenCalled()
    expect(useWriterRoomStore.getState().confirmOpen).toBe(true)
    expect(useWriterRoomStore.getState().paragraph).toEqual(S2)
  })
})
