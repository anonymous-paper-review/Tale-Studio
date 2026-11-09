// Writer 산문을 고치는 동안 기다리는 모습 — 단계 세 줄, 고쳐 달라고 보낸 문단 기억, 그 문단만 흐리게(11/5 시안 WL)
import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/chat-persistence', () => ({ saveChatMessage: vi.fn(), saveChatTrace: vi.fn(), saveChatTracePatch: vi.fn(), loadLatestChatTrace: vi.fn() }))
vi.mock('@/lib/writer/use-writer-status', async (original) => ({ ...(await original<typeof import('@/lib/writer/use-writer-status')>()), restartWriterStatus: vi.fn() }))

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { translate } from '@/lib/i18n/translate'
import { proseBusySteps } from '@/lib/prose/busy'
import { proseTools } from '@/lib/prose/conditions'
import { keptRevisingParagraph, revisingParagraphIndex, type ParagraphPick } from '@/lib/prose/paragraph-pick'
import { sendParagraphRequest } from '@/features/prose/paragraph-request'
import { ProseDocument } from '@/features/prose/prose-document'
import type { ProseState } from '@/features/prose/use-prose'
import { useGlobalChatStore } from '@/stores/global-chat-store'
import { useLocaleStore } from '@/stores/locale-store'
import { useProjectStore } from '@/stores/project-store'
import { useWriterRoomStore } from '@/stores/writer-room-store'

const PROJECT = 'prose-project'
const P1 = '회사 복도, 오후 세 시. 민호가 자판기 버튼을 누르지만 아무것도 나오지 않는다.'
const P2 = '자판기가 덜컹거리더니 캔이 우르르 쏟아진다. 지나가던 팀장이 하나를 집어 들고 "고마워" 하고 간다.'
const S2: ParagraphPick = { projectId: PROJECT, index: 1, text: P2 }
const READ_ONLY = proseTools({ preserved: false, locked: false, hasProse: true, busy: true })

/** 산문 본문이 읽는 값만 채운 산문 상태(고치는 중인 산문 초안 두 문단). */
function prose(over: Partial<ProseState> = {}): ProseState {
  return {
    projectId: PROJECT,
    view: { kind: 'scenes', paragraphs: [P1, P2] },
    paragraphs: [P1, P2],
    diffRows: null,
    phase: 'gate',
    draftLive: true,
    startOffered: false,
    locked: false,
    preserved: false,
    tools: READ_ONLY,
    busy: { kind: 'revise' },
    ...over,
  } as unknown as ProseState
}

/** 정적 렌더는 스토어의 처음 값을 읽는다 — 지금 값을 처음 값으로 옮겨 그린다(prose-paragraph 와 같은 방법). */
function render(element: ReturnType<typeof createElement>) {
  for (const store of [useLocaleStore, useProjectStore, useWriterRoomStore] as Array<{ getState: () => object; getInitialState: () => object }>) Object.assign(store.getInitialState(), store.getState())
  return renderToStaticMarkup(element)
}
const rowOf = (out: string, index: number) => out.match(/<div[^>]*class="[^"]*rounded-\[14px\][^"]*"[^>]*>/g)?.[index] ?? ''

let request: ReturnType<typeof vi.fn>

beforeEach(() => {
  useLocaleStore.setState({ locale: 'ko' })
  useGlobalChatStore.getState().reset()
  useWriterRoomStore.setState({ paragraph: null, revising: null })
  useProjectStore.setState({ projectId: PROJECT, currentStage: 'producer', reachedStage: 'producer', producerLocked: false, treatmentDraft: true, projectLocale: 'ko' })
  request = vi.fn(async () => Response.json({ ok: true, proposalId: 'p1' }))
  vi.stubGlobal('fetch', request)
})
afterEach(() => {
  vi.unstubAllGlobals()
  useLocaleStore.setState({ locale: 'en' })
})

describe('고치는 동안 기다리는 창의 단계', () => {
  it('산문을 고치는 동안 기다리는 창은 요청 읽기(끝남) · 수정안 쓰는 중(지금) · 바뀐 곳 표시(남음) 세 줄을 보인다', () => {
    // 왜: 11/5 시안 WL — 무엇을 하는 중이고 다음에 무엇이 오는지(바뀐 곳이 산문에 표시된다) 기다리는 동안 안다.
    const steps = proseBusySteps({ kind: 'revise' })
    expect(steps).toEqual([
      { label: 'Reading the request', state: 'done' },
      { label: 'Writing the change', state: 'current' },
      { label: 'Marking the changes', state: 'todo' },
    ])
    expect(steps?.map((step) => translate('ko', step.label))).toEqual(['요청 읽기', '수정안 쓰는 중', '바뀐 곳 표시'])
  })

  it('세 가지 안을 쓰는 동안 기다리는 창은 요청 읽기 · 세 가지 안 쓰기 두 줄 그대로다', () => {
    // 왜: 정상 경로 고정 — 세 가지 안은 산문 위 고르기 창으로 이어져 "바뀐 곳 표시" 줄이 없다.
    expect(proseBusySteps({ kind: 'rewrite' })).toEqual([
      { label: 'Reading the request', state: 'done' },
      { label: 'Writing three versions', state: 'current' },
    ])
  })

  it('산문 초안을 쓰는 동안 기다리는 창은 자료 정리 · 이야기 뼈대 · 씬 스토리 쓰기 중 지금 줄을 보이고, 진행 상태를 읽기 전에는 줄이 없다', () => {
    // 왜: 정상 경로 고정 — 다 쓴 초안이 첫 줄부터 다시 쓰는 것처럼 보이지 않게 읽기 전에는 줄을 두지 않는다.
    expect(proseBusySteps({ kind: 'draft', step: 1 })?.map((step) => step.state)).toEqual(['done', 'current', 'todo'])
    expect(proseBusySteps({ kind: 'draft', step: null })).toBeUndefined()
    expect(proseBusySteps(null)).toBeUndefined()
  })

  it('산문을 고치는 기다리는 창에는 진행 막대를 두지 않는다', () => {
    // 왜: 고치기는 진행률을 모른다 — 막대를 두면 가짜 진행이 된다(리드 2026-11-09).
    const workspace = readFileSync('src/features/prose/prose-workspace.tsx', 'utf8')
    const overlay = workspace.match(/<AiBusyOverlay[\s\S]*?\/>/)?.[0] ?? ''
    expect(overlay).toContain('steps={busySteps}')
    expect(overlay).not.toMatch(/progress=/)
  })
})

describe('고쳐 달라고 보낸 문단', () => {
  it('문단을 붙여 고쳐 달라고 보내면 수정안이 정해질 때까지 그 문단을 기억한다', async () => {
    // 왜: 11/5 시안 WL — 고치는 동안 어느 문단을 고치는지 산문에서 보인다. 붙은 문단(칩)은 보내자마자 떨어지므로 따로 기억한다.
    useWriterRoomStore.setState({ paragraph: S2 })
    await sendParagraphRequest('더 웃기게 해 줘')
    expect(useWriterRoomStore.getState().paragraph).toBeNull()
    expect(useWriterRoomStore.getState().revising).toEqual(S2)
  })

  it('고쳐 달라는 요청을 보내지 못하면 기억한 문단을 잊는다', async () => {
    // 왜: 서버가 받지 않은 요청의 문단을 흐리게 두면 고치는 중인 것처럼 보인다(연결이 끊긴 때 · 이미 수정안이 있는 때).
    request.mockImplementation(async () => Response.json({ error: 'nope' }, { status: 500 }))
    useWriterRoomStore.setState({ paragraph: S2 })
    await sendParagraphRequest('더 웃기게 해 줘')
    expect(useWriterRoomStore.getState().revising).toBeNull()
  })

  it('수정안을 적용하거나 버려 남은 수정 요청이 없어지면 기억한 문단을 잊는다', () => {
    // 왜: 다음 요청은 다른 문단일 수 있다 — 끝난 요청의 문단이 다음 기다림에 흐려지면 안 된다.
    expect(keptRevisingParagraph(S2, { projectId: PROJECT, hasProposal: true })).toEqual(S2)
    expect(keptRevisingParagraph(S2, { projectId: PROJECT, hasProposal: false })).toBeNull()
  })

  it('다른 프로젝트로 옮기면 기억한 문단을 잊는다', () => {
    // 왜: 문단 번호(S2)는 프로젝트마다 다른 글이다.
    expect(keptRevisingParagraph(S2, { projectId: 'other-project', hasProposal: true })).toBeNull()
  })
})

describe('고치는 문단 흐림', () => {
  it('수정안을 쓰는 동안 고치는 문단만 흐리게 보이고 다른 문단은 그대로다', () => {
    // 왜: 11/5 시안 WL — 고치는 문단(S2)만 30% 로 흐리고 다른 씬은 그대로 읽힌다.
    useWriterRoomStore.setState({ revising: S2 })
    expect(revisingParagraphIndex(S2, { projectId: PROJECT, busy: { kind: 'revise' } })).toBe(1)
    const out = render(createElement(ProseDocument, { prose: prose() }))
    expect(rowOf(out, 1)).toContain('opacity-30')
    expect(rowOf(out, 1)).toContain('data-revising="true"')
    expect(rowOf(out, 0)).not.toContain('opacity-30')
  })

  it('수정안이 나와 기다림이 끝나거나 세 가지 안을 쓰는 동안이면 문단을 흐리게 두지 않는다', () => {
    // 왜: 정상 경로 고정 — 다 쓰면 바뀐 곳 표시로 넘어가고, 세 가지 안은 한 문단이 아니라 산문 전체를 다시 쓴다.
    expect(revisingParagraphIndex(S2, { projectId: PROJECT, busy: null })).toBeNull()
    expect(revisingParagraphIndex(S2, { projectId: PROJECT, busy: { kind: 'rewrite' } })).toBeNull()
    expect(revisingParagraphIndex(S2, { projectId: 'other-project', busy: { kind: 'revise' } })).toBeNull()
    useWriterRoomStore.setState({ revising: S2 })
    expect(render(createElement(ProseDocument, { prose: prose({ busy: null }) }))).not.toContain('opacity-30')
  })
})
