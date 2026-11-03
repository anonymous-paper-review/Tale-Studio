// Writer 산문의 문단을 누르면 그 문단이 채팅 입력칸 위에 붙고, 붙은 채로 보내면 그 문단만 고쳐 달라는 수정 요청이 된다 (v3 오너 2026-11-03)
import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/chat-persistence', () => ({ saveChatMessage: vi.fn(), saveChatTrace: vi.fn(), saveChatTracePatch: vi.fn(), loadLatestChatTrace: vi.fn() }))
vi.mock('@/lib/writer/use-writer-status', async (original) => ({ ...(await original<typeof import('@/lib/writer/use-writer-status')>()), restartWriterStatus: vi.fn() }))

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { keptParagraphPick, nextParagraphPick, paragraphClickPicks, paragraphKeyPicks, type ParagraphPick } from '@/lib/prose/paragraph-pick'
import { proseTools } from '@/lib/prose/conditions'
import { goesToParagraph, sendParagraphRequest } from '@/features/prose/paragraph-request'
import { ParagraphChip } from '@/features/prose/paragraph-chip'
import { ProseDocument } from '@/features/prose/prose-document'
import type { ProseState } from '@/features/prose/use-prose'
import { useChatUiStore } from '@/stores/chat-ui-store'
import { useGlobalChatStore } from '@/stores/global-chat-store'
import { useLocaleStore } from '@/stores/locale-store'
import { useProjectStore } from '@/stores/project-store'
import { useWriterRoomStore } from '@/stores/writer-room-store'

const PROJECT = 'prose-project'
const P1 = '회사 복도, 오후 세 시. 민호가 자판기 버튼을 누르지만 아무것도 나오지 않는다.'
const P2 = '자판기가 덜컹거리더니 캔이 우르르 쏟아진다. 지나가던 팀장이 하나를 집어 들고 "고마워" 하고 간다.'
const S1: ParagraphPick = { projectId: PROJECT, index: 0, text: P1 }
const S2: ParagraphPick = { projectId: PROJECT, index: 1, text: P2 }
const EDITABLE = proseTools({ preserved: false, locked: false, hasProse: true, busy: false })

/** 산문 본문이 읽는 값만 채운 산문 상태(고칠 수 있는 산문 초안 두 문단). */
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
    tools: EDITABLE,
    ...over,
  } as unknown as ProseState
}

/** 정적 렌더는 스토어의 처음 값을 읽는다 — 지금 값을 처음 값으로 옮겨 그린다(style-version-screen 과 같은 방법). */
function serveCurrent() {
  for (const store of [useLocaleStore, useProjectStore, useWriterRoomStore] as Array<{ getState: () => object; getInitialState: () => object }>) Object.assign(store.getInitialState(), store.getState())
}
const render = (element: ReturnType<typeof createElement>) => {
  serveCurrent()
  return renderToStaticMarkup(element)
}

let request: ReturnType<typeof vi.fn>
const bodies = () => request.mock.calls.map(([url, init]) => ({ url: String(url), body: JSON.parse(String((init as RequestInit).body)) }))

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

describe('문단 붙이기', () => {
  // 왜: 오너 결정 7 — 화면에서 고르던 것과 채팅으로 고치던 것을 한 화면에 합쳤다. 고칠 문단을 말로 설명하지 않고 눌러서 가리킨다.
  it('문단을 누르면 그 문단이 채팅 입력칸 위에 붙는다', () => {
    useWriterRoomStore.getState().toggleParagraph(S2, EDITABLE.manual)

    expect(useWriterRoomStore.getState().paragraph).toEqual(S2)
    const chip = render(createElement(ParagraphChip))
    expect(chip).toContain('S2')
    expect(chip).toContain('자판기가 덜컹거리더니')
    const document = render(createElement(ProseDocument, { prose: prose() }))
    expect(document).toMatch(/aria-pressed="true"[^>]*data-testid="prose-paragraph-2"|data-testid="prose-paragraph-2"[^>]*aria-pressed="true"/)
  })

  // 왜: 검토 A L2 — 문단 전체가 단추라 글을 끌어 고를(복사할) 수 없었다. 글은 고를 수 있어야 하고, 끌어 고른 것은 "이 문단을 붙여"가 아니다.
  it('문단 글을 끌어 고르면 문단을 붙이지 않는다', () => {
    expect(paragraphClickPicks('자판기가 덜컹거리더니')).toBe(false)
    expect(paragraphClickPicks('')).toBe(true)
    // 글을 고를 수 있게 문단은 단추가 아니라 누르는 칸이다.
    const document = render(createElement(ProseDocument, { prose: prose() }))
    expect(document).not.toMatch(/<button[^>]*data-testid="prose-paragraph-2"/)
    expect(document).toMatch(/<div role="button" tabindex="0" aria-pressed="false"[^>]*data-testid="prose-paragraph-2"/)
    // 화면은 끌어 고르기를 기본으로 꺼 둔다(캔버스 · 타임라인 끌기) — 문단 글은 고를 수 있는 글로 둔다.
    expect(document).toMatch(/data-testid="prose-paragraph-2"><span[^>]*>S2<\/span><span class="[^"]*\bselect-text\b/)
  })

  // 왜: 마우스 없이 쓰는 사람도 문단을 붙인다 — 단추였을 때처럼 Tab 으로 옮겨 가 Enter · 스페이스로 누른다.
  it('문단은 키보드로 옮겨 가 Enter · 스페이스로 붙이고 뗄 수 있다', () => {
    expect(paragraphKeyPicks('Enter')).toBe(true)
    expect(paragraphKeyPicks(' ')).toBe(true)
    expect(paragraphKeyPicks('a')).toBe(false)
    expect(paragraphKeyPicks('Tab')).toBe(false)
  })

  // 왜: 잘못 누른 문단을 떼는 길이 같은 자리에 있어야 한다.
  it('붙은 문단을 다시 누르면 떨어진다', () => {
    useWriterRoomStore.getState().toggleParagraph(S2, EDITABLE.manual)
    useWriterRoomStore.getState().toggleParagraph(S2, EDITABLE.manual)

    expect(useWriterRoomStore.getState().paragraph).toBeNull()
    expect(render(createElement(ParagraphChip))).toBe('')
  })

  // 왜: 확정한 산문은 잠겨서 고칠 수 없다 — 붙여 봐야 보낼 곳이 없다.
  it('산문이 확정되면 문단을 눌러도 붙지 않는다', () => {
    const locked = proseTools({ preserved: false, locked: true, hasProse: true, busy: false })

    useWriterRoomStore.getState().toggleParagraph(S2, locked.manual)

    expect(useWriterRoomStore.getState().paragraph).toBeNull()
    const document = render(createElement(ProseDocument, { prose: prose({ locked: true, tools: locked }) }))
    expect(document).toContain('자판기가 덜컹거리더니')
    expect(document).not.toContain('aria-pressed')
  })

  // 왜: 한 번에 한 문단만 가리킨다 — 시안 안내 "그 문단만 채팅에서 고칠 수 있어요".
  it('다른 문단을 누르면 붙은 문단이 그 문단으로 바뀐다', () => {
    expect(nextParagraphPick(S1, S2, true)).toEqual(S2)
  })

  // 왜: 직접 고칠 수 없는 때(대본 그대로 · AI 작업 중 · 직접 작성 창 · 고르지 않은 수정안)에는 수정 요청도 받지 않는다.
  it('대본을 그대로 쓰는 프로젝트 · AI가 일하는 중에는 문단을 눌러도 붙지 않는다', () => {
    const preserved = proseTools({ preserved: true, locked: false, hasProse: true, busy: false })
    const busy = proseTools({ preserved: false, locked: false, hasProse: true, busy: true })

    expect(nextParagraphPick(null, S2, preserved.manual)).toBeNull()
    expect(nextParagraphPick(null, S2, busy.manual)).toBeNull()
  })

  // 왜: 붙여 둔 채 확정하거나 AI 가 고치기 시작하면 칩이 남아 보낼 수 없는 요청을 들고 있게 된다.
  it('붙일 수 없게 되면 붙어 있던 문단은 떨어진다', () => {
    expect(keptParagraphPick(S2, { projectId: PROJECT, pickable: false, paragraphs: [P1, P2] })).toBeNull()
    expect(keptParagraphPick(S2, { projectId: PROJECT, pickable: true, paragraphs: [P1, P2] })).toBe(S2)
  })

  // 왜: 수정안을 적용하거나 직접 저장해 문단 글이 바뀌면 붙어 있던 글은 지금 산문이 아니다.
  it('붙은 문단의 글이 바뀌면 붙은 문단은 떨어진다', () => {
    expect(keptParagraphPick(S2, { projectId: PROJECT, pickable: true, paragraphs: [P1, '팀장이 캔을 모두 가져간다.'] })).toBeNull()
  })

  // 왜: 앞 프로젝트의 문단을 들고 다른 프로젝트 채팅에 보내지 않는다.
  it('다른 프로젝트를 열면 붙은 문단은 떨어진다', () => {
    expect(keptParagraphPick(S2, { projectId: 'other-project', pickable: true, paragraphs: [P1, P2] })).toBeNull()
  })

  // 왜: 누른 다음 바로 고칠 말을 적게 한다 — 채팅을 접어 두었으면 붙은 칩이 보이지 않는다.
  it('문단을 붙이면 채팅 입력칸에 커서가 가고 접혀 있던 채팅이 펼쳐진다', () => {
    useChatUiStore.setState({ collapsed: true, focusRequest: null })

    useWriterRoomStore.getState().toggleParagraph(S2, EDITABLE.manual)

    expect(useChatUiStore.getState().collapsed).toBe(false)
    expect(useChatUiStore.getState().focusRequest).not.toBeNull()
  })

  // 왜: 보내기 전에 마음이 바뀌면 칩에서 바로 뗀다.
  it('칩의 X를 누르면 붙은 문단이 떨어진다', () => {
    useWriterRoomStore.getState().toggleParagraph(S2, EDITABLE.manual)
    expect(render(createElement(ParagraphChip))).toContain('aria-label="문단 떼기"')

    useWriterRoomStore.getState().clearParagraph()

    expect(useWriterRoomStore.getState().paragraph).toBeNull()
  })
})

describe('붙은 문단으로 보내기', () => {
  // 왜: Writer 는 문단 번호(S2)와 그 글 앞부분으로 어느 씬인지 안다 — 다른 문단은 그대로 두라고 함께 말한다.
  it('문단이 붙은 채로 보내면 그 문단 번호와 앞부분을 실어 그 문단만 고쳐 달라고 요청한다', async () => {
    useWriterRoomStore.setState({ paragraph: S2 })

    expect(await sendParagraphRequest('팀장을 더 얄밉게')).toBe(true)

    expect(bodies()).toEqual([{
      url: '/api/writer/scene-gate',
      body: { projectId: PROJECT, action: 'revise', feedback: 'S2 문단만 고쳐 주세요. "자판기가 덜컹거리더니 캔이 우르르 쏟아진다. 지나가던…"\n팀장을 더 얄밉게' },
    }])
  })

  // 왜: 문단을 붙였으면 그 문단을 고치려는 것이다 — "다시 써줘"가 산문 전체 다시 쓰기 조건 창을 열면 붙인 문단이 버려진다.
  it('문단이 붙어 있으면 "다시 써줘"도 다시 쓰기 조건을 열지 않고 그 문단 수정 요청으로 간다', async () => {
    useWriterRoomStore.setState({ paragraph: S2 })

    await sendParagraphRequest('다시 써줘')

    expect(useWriterRoomStore.getState().rewriteOpen).toBe(false)
    expect(bodies()).toHaveLength(1)
    expect(bodies()[0].body).toMatchObject({ action: 'revise', feedback: expect.stringMatching(/^S2 문단만 고쳐 주세요\.[\s\S]*\n다시 써줘$/) })
  })

  // 왜: 검토 A L1 — 문단을 붙여 둔 채 "확정할게"라고 하면 확정 창 대신 그 문단 수정 요청(모델 호출)이 나갔다.
  //   넘김 · 확정 말은 문단과 상관없이 지금처럼 확정 창을 연다. 붙어 있던 문단은 떨어진다.
  it('문단이 붙어 있어도 확정 · 브레이크다운을 말하면 지금처럼 확정 창이 열린다', async () => {
    for (const said of ['확정할게', '브레이크다운하자']) {
      useWriterRoomStore.setState({ paragraph: S2, confirmOpen: false })

      expect(goesToParagraph(said)).toBe(false)
      expect(useWriterRoomStore.getState().paragraph).toBeNull()
      await useGlobalChatStore.getState().sendMessage(said, undefined, { stageOverride: 'producer' })

      expect(useWriterRoomStore.getState().confirmOpen).toBe(true)
    }
    expect(request).not.toHaveBeenCalled()
    // 채팅 입력칸의 보내기는 이 판정을 먼저 본다.
    expect(readFileSync('src/components/layout/global-chat.tsx', 'utf8')).toMatch(/currentStage === 'producer' && typed && goesToParagraph\(typed\)/)
  })

  // 왜: 한 번 보낸 문단이 칩에 남으면 다음 말도 그 문단 요청으로 간다. 무엇을 보냈는지는 채팅에 남는다.
  it('보내면 붙은 문단은 떨어지고 보낸 말이 채팅에 남는다', async () => {
    useWriterRoomStore.setState({ paragraph: S2 })

    await sendParagraphRequest('팀장을 더 얄밉게')

    expect(useWriterRoomStore.getState().paragraph).toBeNull()
    const [mine, reply] = useGlobalChatStore.getState().messages.slice(-2)
    expect(mine).toMatchObject({ stage: 'producer', role: 'user', content: expect.stringContaining('팀장을 더 얄밉게') })
    expect(mine.content).toContain('S2 문단만 고쳐 주세요.')
    expect(reply).toMatchObject({ stage: 'producer', role: 'model', content: '씬 스토리 수정안을 만들고 있어요. 기다리는 동안 계속 채팅하거나 직접 고칠 수 있어요.' })
  })

  // 왜: 정상 경로 고정 — 붙인 문단이 없으면 채팅은 지금처럼 말을 읽어 보낸다.
  it('붙은 문단이 없으면 아무것도 보내지 않고 지금 채팅 길로 넘긴다', async () => {
    expect(await sendParagraphRequest('팀장을 더 얄밉게')).toBe(false)
    useWriterRoomStore.setState({ paragraph: { ...S2, projectId: 'other-project' } })
    expect(await sendParagraphRequest('팀장을 더 얄밉게')).toBe(false)

    expect(request).not.toHaveBeenCalled()
  })
})
