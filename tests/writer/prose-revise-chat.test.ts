// Writer 산문을 고쳐 달라고 한 뒤 채팅 — 보낸 말만 남기고 수정안이 올 때까지 Lumi 점 세 개, 오면 "S2를 고쳐 봤어요" 한 번 · 수정안 칩(11/5 시안 WL · WS, 오너 2026-11-09)
import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/chat-persistence', () => ({ saveChatMessage: vi.fn(), saveChatTrace: vi.fn(), saveChatTracePatch: vi.fn(), loadLatestChatTrace: vi.fn() }))
vi.mock('@/lib/writer/use-writer-status', async (original) => ({ ...(await original<typeof import('@/lib/writer/use-writer-status')>()), restartWriterStatus: vi.fn() }))

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { SceneStoryProposalCard } from '@/components/layout/scene-story-proposal-card'
import type { SceneStoryProposalView } from '@/lib/producer/scene-story-proposal'
import { proposalChipText, proseRevisedMessage, reviseAnnouncement } from '@/lib/prose/revise-chat'
import { sendParagraphRequest } from '@/features/prose/paragraph-request'
import { useGlobalChatStore } from '@/stores/global-chat-store'
import { useLocaleStore } from '@/stores/locale-store'
import { useProjectStore } from '@/stores/project-store'
import { useWriterRoomStore } from '@/stores/writer-room-store'

const PROJECT = 'prose-project'
const READY: SceneStoryProposalView = {
  id: 'p1', status: 'ready', feedback: 'S2 문단만 고쳐 주세요.', createdAt: '2026-11-09T00:00:00Z', stale: false,
  before: [{ sceneId: 's1', index: 0, beats: ['첫 씬'] }, { sceneId: 's2', index: 1, beats: ['캔이 우르르 쏟아진다'] }],
  after: [{ sceneId: 's1', index: 0, beats: ['첫 씬'] }, { sceneId: 's2', index: 1, beats: ['캔이 폭포처럼 쏟아진다'] }],
}

let request: ReturnType<typeof vi.fn>

/** 정적 렌더는 스토어의 처음 값을 읽는다 — 지금 값을 처음 값으로 옮겨 그린다. */
function render(element: ReturnType<typeof createElement>) {
  for (const store of [useLocaleStore, useProjectStore, useGlobalChatStore] as Array<{ getState: () => object; getInitialState: () => object }>) Object.assign(store.getInitialState(), store.getState())
  return renderToStaticMarkup(element)
}

beforeEach(() => {
  useLocaleStore.setState({ locale: 'ko' })
  useGlobalChatStore.getState().reset()
  useWriterRoomStore.setState({ paragraph: null, revising: null, reviseAnnounce: null, rewriteOpen: false, confirmOpen: false, manualRequest: 0 })
  useProjectStore.setState({ projectId: PROJECT, currentStage: 'producer', reachedStage: 'producer', producerLocked: false, treatmentDraft: true, projectLocale: 'ko' })
  request = vi.fn(async () => Response.json({ ok: true, proposalId: 'p1' }))
  vi.stubGlobal('fetch', request)
})
afterEach(() => {
  vi.unstubAllGlobals()
  useLocaleStore.setState({ locale: 'en' })
})

describe('고쳐 달라고 보낸 뒤', () => {
  it('Writer 채팅으로 산문을 고쳐 달라고 하면 보낸 말만 남고, 수정안이 오기 전에는 답 문장이 없다', async () => {
    // 왜: 보낸 직후 "기다리는 동안 계속 채팅하거나 직접 고칠 수 있어요"라고 했지만 화면 · 채팅은 잠긴다(고장, 오너 2026-11-09 추천대로 뺌).
    await useGlobalChatStore.getState().sendMessage('팀장을 더 얄밉게 해줘')

    const messages = useGlobalChatStore.getState().messages
    expect(messages.at(-1)).toMatchObject({ stage: 'producer', role: 'user', content: '팀장을 더 얄밉게 해줘' })
    expect(messages.some((message) => message.role === 'model')).toBe(false)
    expect(useWriterRoomStore.getState().reviseAnnounce).toEqual({ projectId: PROJECT, label: null })
  })

  it('고쳐 달라는 요청을 보내지 못하면 까닭을 답하고 수정안을 기다리지 않는다', async () => {
    // 왜: 서버가 받지 않은 요청에 점 세 개를 보이면 기다려도 오지 않는다(연결이 끊긴 때 · 이미 수정안이 있는 때).
    request.mockImplementation(async () => Response.json({ error: 'nope' }, { status: 500 }))

    await useGlobalChatStore.getState().sendMessage('팀장을 더 얄밉게 해줘')

    expect(useGlobalChatStore.getState().messages.at(-1)).toMatchObject({ role: 'model', content: '수정 요청을 보내지 못했어요. 다시 시도해 주세요.' })
    expect(useWriterRoomStore.getState().reviseAnnounce).toBeNull()
  })

  it('문단을 붙여 보내면 수정안이 왔을 때 알릴 문단 번호를 남긴다', async () => {
    // 왜: 다 되면 "S2를 고쳐 봤어요"처럼 어느 문단을 고쳤는지 말한다(11/5 시안 WS).
    useWriterRoomStore.setState({ paragraph: { projectId: PROJECT, index: 1, text: '캔이 우르르 쏟아진다' } })

    await sendParagraphRequest('더 웃기게 해 줘')

    expect(useWriterRoomStore.getState().reviseAnnounce).toEqual({ projectId: PROJECT, label: 'S2' })
  })
})

describe('수정안이 오면 알리기', () => {
  const marker = { projectId: PROJECT, label: 'S2' }

  it('기다리던 수정안이 오면 한 번 알리고, 아직 만드는 중이면 기다린다', () => {
    // 왜: 수정안이 준비된 때 한 번만 "고쳐 봤어요"를 남긴다 — 다시 읽을 때마다 같은 말이 쌓이면 안 된다(알린 뒤 표시는 지운다).
    expect(reviseAnnouncement(marker, { projectId: PROJECT, proposal: READY, hasProposal: true })).toBe('announce')
    expect(reviseAnnouncement(marker, { projectId: PROJECT, proposal: { ...READY, status: 'generating' }, hasProposal: true })).toBe('wait')
    expect(reviseAnnouncement(marker, { projectId: PROJECT, proposal: null, hasProposal: true })).toBe('wait')
  })

  it('수정안이 실패하거나 그새 산문이 바뀌었거나 없어졌거나 다른 프로젝트면 알리지 않고 기다림을 내린다', () => {
    // 왜: 실패 · 충돌은 채팅 카드가 까닭과 [최신 내용으로 다시 제안]을 보인다. "고쳐 봤어요"는 거짓이 된다.
    expect(reviseAnnouncement(marker, { projectId: PROJECT, proposal: { ...READY, status: 'failed' }, hasProposal: true })).toBe('drop')
    expect(reviseAnnouncement(marker, { projectId: PROJECT, proposal: { ...READY, stale: true }, hasProposal: true })).toBe('drop')
    expect(reviseAnnouncement(marker, { projectId: PROJECT, proposal: null, hasProposal: false })).toBe('drop')
    expect(reviseAnnouncement(marker, { projectId: 'other-project', proposal: READY, hasProposal: true })).toBe('drop')
    expect(reviseAnnouncement(null, { projectId: PROJECT, proposal: READY, hasProposal: true })).toBeNull()
  })

  it('문단을 고친 수정안이 오면 Lumi가 "S2를 고쳐 봤어요. 바뀐 곳은 산문에 표시해 뒀어요. [적용] 전에는 원래 글 그대로예요."라고 말한다', () => {
    // 왜: 11/5 시안 WS 문장 — 어디를 고쳤고 어디서 보면 되는지, 적용 전에는 원문이 그대로라는 것을 한 번에 말한다.
    expect(proseRevisedMessage('ko', 'S2')).toBe('S2를 고쳐 봤어요. 바뀐 곳은 산문에 표시해 뒀어요. [적용] 전에는 원래 글 그대로예요.')
    expect(proseRevisedMessage('ko', 'S3')).toBe('S3을 고쳐 봤어요. 바뀐 곳은 산문에 표시해 뒀어요. [적용] 전에는 원래 글 그대로예요.')
    expect(proseRevisedMessage('en', 'S2')).toBe('I revised S2. The changes are marked in the prose. The original stays as it is until you press [Apply].')
  })

  it('문단 없이 고친 수정안이 오면 "산문을 고쳐 봤어요"라고 말한다', () => {
    // 왜: 정상 경로 고정 — 채팅으로 산문 전체를 고쳐 달라고 한 때는 고친 문단이 따로 없다.
    expect(proseRevisedMessage('ko', null)).toBe('산문을 고쳐 봤어요. 바뀐 곳은 산문에 표시해 뒀어요. [적용] 전에는 원래 글 그대로예요.')
  })

  it('Writer 화면이 수정안이 오면 알리는 자리를 지킨다', () => {
    // 왜: 알리는 규칙(reviseAnnouncement)과 말(proseRevisedMessage)을 화면이 실제로 쓴다.
    const workspace = readFileSync('src/features/prose/prose-workspace.tsx', 'utf8')
    expect(workspace).toContain('reviseAnnouncement(')
    expect(workspace).toMatch(/notifyIssue\('producer', proseRevisedMessage\(/)
  })
})

describe('Writer 채팅의 수정안 자리', () => {
  it('수정안을 만드는 동안 Writer 채팅에는 카드 대신 Lumi 점 세 개가 보인다', () => {
    // 왜: 11/5 시안 WL — 기다리는 동안은 Lumi 가 생각 중이라는 것만 보인다(잠금 중이라 카드의 [취소]는 누를 수 없었다).
    const out = render(createElement(SceneStoryProposalCard, { projectId: PROJECT, proposal: { ...READY, status: 'generating', after: [] }, look: 'writer' }))
    expect(out).toContain('data-testid="scene-story-proposal-thinking"')
    expect(out).toContain('chat-thinking-dots')
    expect(out).not.toContain('scene-story-proposal-discard')
  })

  it('수정안이 준비되면 Writer 채팅에는 카드 대신 "수정안 · S2 · 1곳" 칩이 보이고 버리기 · 적용은 산문 안 상자에서 한다', () => {
    // 왜: 11/5 시안 WS(오너 2026-11-09 결정 5) — 바뀐 곳은 산문에서 보고 그 자리에서 정한다. 채팅은 어느 문단 몇 곳인지만 알린다.
    const out = render(createElement(SceneStoryProposalCard, { projectId: PROJECT, proposal: READY, look: 'writer' }))
    expect(out).toContain('data-testid="scene-story-proposal-chip"')
    expect(out).toContain('수정안 · S2 · 1곳')
    expect(out).not.toContain('scene-story-proposal-apply')
    expect(out).not.toContain('scene-story-proposal-discard')
    expect(proposalChipText('en', READY)).toBe('Proposal · S2 · 1 changed')
  })

  it('수정안이 실패했거나 그새 산문이 바뀌었으면 Writer 채팅에도 지금처럼 까닭과 다시 제안 · 버리기 카드가 보인다', () => {
    // 왜: 산문 안 상자는 바뀐 곳이 있을 때만 생긴다 — 실패 · 충돌일 때 빠져나갈 길은 채팅 카드가 맡는다(혼자 정한 것).
    const failed = render(createElement(SceneStoryProposalCard, { projectId: PROJECT, proposal: { ...READY, status: 'failed' }, look: 'writer' }))
    expect(failed).toContain('scene-story-proposal-regenerate')
    expect(failed).toContain('scene-story-proposal-discard')
    const stale = render(createElement(SceneStoryProposalCard, { projectId: PROJECT, proposal: { ...READY, stale: true }, look: 'writer' }))
    expect(stale).toContain('scene-story-proposal-regenerate')
  })

  it('Writer 단계 채팅은 수정안을 Writer 모양으로 그린다', () => {
    // 왜: 칩 · 점 세 개는 Writer 산문에만 — 그 밖의 자리는 지금 카드 그대로다(Producer 트리트먼트 초록 비교 포함).
    expect(readFileSync('src/components/layout/global-chat.tsx', 'utf8')).toContain("look={currentStage === 'producer' ? 'writer' : 'card'}")
  })
})
