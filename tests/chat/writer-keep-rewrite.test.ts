// 원작을 그대로 쓰는 작품의 Writer 채팅은 "다시 써줘" · [다시 써 달라고 하기]에 러닝타임 등 조건을 묻지 않고 산문을 고칠 수 없는 까닭과 넘어가는 길을 말한다 (D15 오너 2026-11-22)
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/chat-persistence', () => ({ saveChatMessage: vi.fn(), saveChatTrace: vi.fn(), saveChatTracePatch: vi.fn(), loadLatestChatTrace: vi.fn() }))
vi.mock('@/lib/writer/use-writer-status', async (original) => ({ ...(await original<typeof import('@/lib/writer/use-writer-status')>()), restartWriterStatus: vi.fn() }))

import { useGlobalChatStore } from '@/stores/global-chat-store'
import { useProjectStore } from '@/stores/project-store'
import { useProducerStore } from '@/stores/producer-store'
import { useLocaleStore } from '@/stores/locale-store'
import { useWriterRoomStore } from '@/stores/writer-room-store'
import { translate } from '@/lib/i18n/translate'

const ko = (key: string) => translate('ko', key)
const KEPT = 'This project keeps the original script as is, so the prose cannot be changed. When you have read it, press [Run breakdown] to move on.'
// 이 시험을 위해 새로 지은 대본 — 실제 작품이 아니다.
const SCRIPT = 'INT. 회사 복도 - 낮\n\n민호: 또 안 나와?\n팀장: 고마워.'

let request: ReturnType<typeof vi.fn>

beforeEach(() => {
  useLocaleStore.setState({ locale: 'ko' })
  useGlobalChatStore.getState().reset()
  useWriterRoomStore.setState({ rewriteOpen: false, confirmOpen: false, manualRequest: 0 })
  useProjectStore.setState({ projectId: 'keep-project', currentStage: 'producer', reachedStage: 'producer', producerLocked: false, treatmentDraft: true, projectLocale: 'ko' })
  request = vi.fn(async () => Response.json({ ok: true }))
  vi.stubGlobal('fetch', request)
})
afterEach(() => {
  useProducerStore.setState({ preserveScript: null, storyText: '' })
  vi.unstubAllGlobals()
  useLocaleStore.setState({ locale: 'en' })
})

describe('원작 그대로와 Writer 채팅의 다시 쓰기', () => {
  it('원작 그대로 쓰는 작품의 Writer 채팅에 "다시 써줘"라고 하면 러닝타임 등 조건을 묻지 않고 산문을 고칠 수 없는 까닭과 넘어가는 길을 말한다', async () => {
    // 왜: "러닝타임 · 장르·분위기 · 아이디어 소재를 골라 다시 써 주세요"라고 답했지만 그대로 쓰는 작품은 조건 창이 열리지 않고 서버도 고치지 않는다(D15 틈 ③).
    useProducerStore.setState({ preserveScript: true, storyText: SCRIPT })
    await useGlobalChatStore.getState().sendMessage('다시 써줘')
    expect(request).not.toHaveBeenCalled()
    expect(useWriterRoomStore.getState().rewriteOpen).toBe(false)
    const messages = useGlobalChatStore.getState().messages
    expect(messages.at(-2)).toMatchObject({ role: 'user', content: '다시 써줘' })
    expect(messages.at(-1)).toMatchObject({ role: 'model', content: ko(KEPT) })
    expect(messages.some((message) => message.content.includes('러닝타임'))).toBe(false)
  })

  it('원작 그대로 쓰는 작품에서 [다시 써 달라고 하기]를 누르면 조건 창 대신 같은 까닭을 채팅에 남긴다', () => {
    // 왜: "아니요, 더 고칠래요" 뒤의 [다시 써 달라고 하기]는 그대로 쓰는 작품에서 눌러도 아무것도 열리지 않았다(검토에서 찾음).
    useProducerStore.setState({ preserveScript: true, storyText: SCRIPT })
    useGlobalChatStore.getState().requestProseRewrite(ko('Ask for a rewrite'))
    expect(useWriterRoomStore.getState().rewriteOpen).toBe(false)
    expect(useGlobalChatStore.getState().messages.at(-1)).toMatchObject({ role: 'model', content: ko(KEPT) })
    const card = readFileSync(path.join(process.cwd(), 'src/features/prose/writer-next-card.tsx'), 'utf8')
    expect(card).toContain("requestProseRewrite(t('Ask for a rewrite'))")
  })

  it('원작을 그대로 쓰지 않는 작품의 [다시 써 달라고 하기]는 지금처럼 조건 창을 연다', () => {
    // 왜: 정상 경로 고정 — 산문 초안은 러닝타임 · 장르·분위기 · 소재를 골라 다시 쓴다.
    useProducerStore.setState({ preserveScript: null, storyText: '자판기 앞에서 벌어진 일' })
    useGlobalChatStore.getState().requestProseRewrite(ko('Ask for a rewrite'))
    expect(useWriterRoomStore.getState().rewriteOpen).toBe(true)
  })
})
