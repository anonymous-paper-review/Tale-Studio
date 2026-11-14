// 고치기 안이 [적용]을 기다리는 동안 보낸 새 말이 튕기면 쓴 글을 입력칸으로 되돌린다 — 긴 글을 다시 붙여 넣지 않게 (리드 2026-11-14 C, 오너 "추천대로")
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/chat-persistence', () => ({ saveChatMessage: vi.fn(), saveChatTrace: vi.fn(), saveChatTracePatch: vi.fn(), loadLatestChatTrace: vi.fn() }))
vi.mock('@/lib/writer/use-writer-status', async (original) => ({ ...(await original<typeof import('@/lib/writer/use-writer-status')>()), restartWriterStatus: vi.fn() }))

import { readFileSync } from 'node:fs'
import { sendParagraphRequest } from '@/features/prose/paragraph-request'
import { restoreIntoInput } from '@/lib/chat-input-restore'
import { translate } from '@/lib/i18n/translate'
import { useChatUiStore } from '@/stores/chat-ui-store'
import { useGlobalChatStore } from '@/stores/global-chat-store'
import { useLocaleStore } from '@/stores/locale-store'
import { useProjectStore } from '@/stores/project-store'
import { useWriterRoomStore } from '@/stores/writer-room-store'
import type { ParagraphPick } from '@/lib/prose/paragraph-pick'

const PROJECT = 'prose-project'
const ko = (key: string) => translate('ko', key)
const PENDING = 'Apply or discard the current scene story proposal before requesting another.'
// 이 시험을 위해 새로 지은 글 — 실제 사용자의 글이 아니다.
const LONG = '새벽 네 시에 문을 여는 빵집에는 은퇴한 제빵사와 그의 손녀가 함께 일한다. 제빵사는 단골들의 이름을 전부 외우고 있고, 손녀는 대학을 쉬면서 가게 일을 돕는다. 건너편 꽃집 주인은 말수가 적고 비 오는 날에만 가게 문을 닫는다. 세 사람은 서로의 사정을 잘 모르지만 매일 아침 같은 시간에 인사를 나눈다.'
const S2: ParagraphPick = { projectId: PROJECT, index: 1, text: '서윤이 카운터 뒤에서 나와 창가로 걸어간다.' }

let request: ReturnType<typeof vi.fn>
const proposalWaiting = () => useGlobalChatStore.setState({ sceneStoryProposalPending: { projectId: PROJECT, id: 'p0' } })

beforeEach(() => {
  useLocaleStore.setState({ locale: 'ko' })
  useGlobalChatStore.getState().reset()
  useWriterRoomStore.setState({ paragraph: null, rewriteOpen: false, confirmOpen: false, manualRequest: 0 })
  useChatUiStore.setState({ collapsed: false, focusRequest: null, inputRestore: null })
  useProjectStore.setState({ projectId: PROJECT, currentStage: 'producer', reachedStage: 'producer', producerLocked: false, treatmentDraft: true, projectLocale: 'ko' })
  request = vi.fn(async () => Response.json({ ok: true, proposalId: 'p1' }))
  vi.stubGlobal('fetch', request)
})
afterEach(() => {
  vi.unstubAllGlobals()
  useLocaleStore.setState({ locale: 'en' })
})

describe('튕긴 말 되돌리기', () => {
  it('고치기 안이 [적용]을 기다리는 동안 보낸 새 말은 요청을 보내지 않고 쓴 글을 입력칸으로 되돌린다', async () => {
    // 왜: 안이 열려 있으면 새 말이 튕겼고, 입력칸은 이미 비워져 긴 글을 다시 붙여 넣어야 했다(11/14 채팅 점검 C).
    proposalWaiting()

    await useGlobalChatStore.getState().sendMessage(LONG, undefined, { stageOverride: 'producer' })

    expect(request).not.toHaveBeenCalled()
    expect(useChatUiStore.getState().inputRestore).toMatchObject({ text: LONG })
  })

  it('튕긴 말은 채팅에 사용자 말로 남기지 않고 "적용하거나 버린 뒤…" 안내만 남긴다', async () => {
    // 왜: 글이 입력칸으로 돌아가므로 같은 말이 대화에 두 번 보이지 않게 한다. 안내 문장은 지금 그대로다.
    proposalWaiting()

    await useGlobalChatStore.getState().sendMessage(LONG, undefined, { stageOverride: 'producer' })

    expect(useGlobalChatStore.getState().messages.map((m) => `${m.role}:${m.content}`)).toEqual([`model:${ko(PENDING)}`])
  })

  it('안을 버린 뒤 되돌려 받은 글을 보내면 평소대로 수정 요청이 간다', async () => {
    // 왜: 되돌리기는 기다리게 할 뿐 말을 버리는 것이 아니다.
    proposalWaiting()
    await useGlobalChatStore.getState().sendMessage(LONG, undefined, { stageOverride: 'producer' })
    request.mockImplementation(async () => Response.json({ ok: true }))
    await useGlobalChatStore.getState().resolveSceneStoryProposal('discard', 'p0')
    request.mockClear()

    await useGlobalChatStore.getState().sendMessage(useChatUiStore.getState().inputRestore!.text, undefined, { stageOverride: 'producer' })

    expect(request.mock.calls.map(([url, init]) => ({ url: String(url), body: JSON.parse(String((init as RequestInit).body)) }))).toEqual([
      { url: '/api/writer/scene-gate', body: { projectId: PROJECT, action: 'revise', feedback: LONG } },
    ])
  })

  it('문단을 붙여 보낸 말이 튕기면 글과 함께 붙인 문단도 되돌린다', async () => {
    // 왜: 다시 보낼 때 같은 문단을 또 골라야 하면 되돌린 보람이 없다.
    proposalWaiting()
    useWriterRoomStore.setState({ paragraph: S2 })

    await sendParagraphRequest('결말을 더 따뜻하게')

    expect(request).not.toHaveBeenCalled()
    expect(useChatUiStore.getState().inputRestore).toMatchObject({ text: '결말을 더 따뜻하게' })
    expect(useWriterRoomStore.getState().paragraph).toEqual(S2)
    expect(useWriterRoomStore.getState().revising).toBeNull()
    expect(useGlobalChatStore.getState().messages.map((m) => `${m.role}:${m.content}`)).toEqual([`model:${ko(PENDING)}`])
  })

  it('채팅이 접혀 있으면 되돌린 글이 보이도록 채팅을 편다', async () => {
    // 왜: 닫힌 입력칸에 글이 소리 없이 돌아가면 어디로 갔는지 모른다.
    useChatUiStore.setState({ collapsed: true })
    proposalWaiting()

    await useGlobalChatStore.getState().sendMessage(LONG, undefined, { stageOverride: 'producer' })

    expect(useChatUiStore.getState().collapsed).toBe(false)
  })

  it('고치기 요청이 막힌 까닭이 안 기다림이 아니면 글을 되돌리지 않는다', async () => {
    // 왜: 원작 그대로 쓰는 대본처럼 서버가 거절한 요청은 되돌려도 같은 답이 온다. 되돌리기는 안을 기다릴 때만이다.
    request.mockImplementation(async () => Response.json({ code: 'preserved_script' }, { status: 409 }))

    await useGlobalChatStore.getState().sendMessage('결말을 더 따뜻하게', undefined, { stageOverride: 'producer' })

    expect(useChatUiStore.getState().inputRestore).toBeNull()
  })
})

describe('입력칸에 되돌려 넣기', () => {
  it('입력칸이 비어 있으면 되돌린 글만 넣고, 새 글이 이미 있으면 되돌린 글 뒤에 이어 붙인다', () => {
    // 왜: 튕긴 사이 새로 쓰기 시작한 글이 지워지거나 되돌린 글이 사라지면 안 된다.
    expect(restoreIntoInput('', LONG)).toBe(LONG)
    expect(restoreIntoInput('   ', LONG)).toBe(LONG)
    expect(restoreIntoInput('그리고 한 가지 더', LONG)).toBe(`${LONG}\n그리고 한 가지 더`)
  })

  it('채팅 입력칸은 되돌리기 요청을 받아 글을 넣고 요청을 거둔다', () => {
    // 왜: 이 연결이 없으면 위 되돌리기가 화면에서는 일어나지 않는다.
    const source = readFileSync('src/components/layout/global-chat.tsx', 'utf8')
    expect(/inputRestore/.test(source)).toBe(true)
    expect(/consumeInputRestore/.test(source)).toBe(true)
    expect(/restoreIntoInput/.test(source)).toBe(true)
  })
})
