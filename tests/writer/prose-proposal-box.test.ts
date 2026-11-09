// Writer 산문 수정안은 고친 문단 바로 아래 "AI 수정안" 상자에 보이고, 그 상자에서 버리기 · 적용한다(11/5 시안 WS, 오너 2026-11-09 결정 5)
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/chat-persistence', () => ({ saveChatMessage: vi.fn(), saveChatTrace: vi.fn(), saveChatTracePatch: vi.fn(), loadLatestChatTrace: vi.fn() }))
vi.mock('@/lib/writer/use-writer-status', async (original) => ({ ...(await original<typeof import('@/lib/writer/use-writer-status')>()), restartWriterStatus: vi.fn() }))

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { proseTools } from '@/lib/prose/conditions'
import type { SceneStoryProposalView } from '@/lib/producer/scene-story-proposal'
import type { TreatmentDiffRow } from '@/lib/producer/scene-story-rewrite'
import { ProseDocument } from '@/features/prose/prose-document'
import type { ProseState } from '@/features/prose/use-prose'
import { useGlobalChatStore } from '@/stores/global-chat-store'
import { useLocaleStore } from '@/stores/locale-store'
import { useProjectStore } from '@/stores/project-store'
import { useWriterRoomStore } from '@/stores/writer-room-store'

const PROJECT = 'prose-project'
const P1 = '회사 복도, 오후 세 시. 민호가 자판기 버튼을 누르지만 아무것도 나오지 않는다.'
const P2 = '자판기가 덜컹거리더니 캔이 우르르 쏟아진다.'
const P2_NEW = '자판기가 덜컹거리더니 캔이 폭포처럼 쏟아진다.'
const P3 = '팀장이 하나를 집어 들고 "고마워" 하고 간다.'
const P3_NEW = '팀장이 하나를 집어 들고 고맙다는 말도 없이 간다.'
const PROPOSAL: SceneStoryProposalView = { id: 'p1', status: 'ready', feedback: '', createdAt: '2026-11-09T00:00:00Z', stale: false, before: [], after: [] }
const ONE_CHANGE: TreatmentDiffRow[] = [
  { kind: 'same', number: 1, after: P1 },
  { kind: 'changed', number: 2, before: P2, after: P2_NEW },
]

function prose(over: Partial<ProseState> = {}): ProseState {
  return {
    projectId: PROJECT,
    view: { kind: 'scenes', paragraphs: [P1, P2] },
    paragraphs: [P1, P2],
    diffRows: ONE_CHANGE,
    proposal: PROPOSAL,
    rewriting: false,
    phase: 'gate',
    draftLive: true,
    startOffered: false,
    locked: false,
    preserved: false,
    tools: proseTools({ preserved: false, locked: false, hasProse: true, busy: true }),
    busy: null,
    ...over,
  } as unknown as ProseState
}

/** 정적 렌더는 스토어의 처음 값을 읽는다 — 지금 값을 처음 값으로 옮겨 그린다. */
function render(state: ProseState) {
  for (const store of [useLocaleStore, useProjectStore, useGlobalChatStore, useWriterRoomStore] as Array<{ getState: () => object; getInitialState: () => object }>) Object.assign(store.getInitialState(), store.getState())
  return renderToStaticMarkup(createElement(ProseDocument, { prose: state }))
}
const tagsOf = (out: string, testId: string) => out.match(new RegExp(`<[a-z]+[^>]*data-testid="${testId}"[^>]*>`, 'g')) ?? []

beforeEach(() => {
  useLocaleStore.setState({ locale: 'ko' })
  useGlobalChatStore.getState().reset()
  useWriterRoomStore.setState({ paragraph: null, revising: null })
  useProjectStore.setState({ projectId: PROJECT, currentStage: 'producer', reachedStage: 'producer', producerLocked: false, treatmentDraft: true, projectLocale: 'ko' })
})
afterEach(() => {
  useLocaleStore.setState({ locale: 'en' })
})

describe('산문 안 수정안 상자', () => {
  it('수정안이 오면 고친 문단 바로 아래 "AI 수정안" 상자에 새 글이 보이고, 원래 글은 같은 자리에 지운 줄로 남는다', () => {
    // 왜: 11/5 시안 WS — 바뀐 곳을 원래 자리에서 원문과 함께 본다. Writer 색 상자라 무엇이 AI 수정안인지 바로 보인다(Producer 트리트먼트 초록 비교는 그대로).
    const out = render(prose())
    expect(out).toContain(P1)
    expect(out).toMatch(new RegExp(`<p[^>]*line-through[^>]*>(<span[^>]*>[^<]*</span>)?${P2}</p>`))
    const box = out.slice(out.indexOf('data-testid="prose-proposal-box"'))
    expect(box).toContain('AI 수정안')
    expect(box).toContain(P2_NEW)
    expect(out).not.toContain('data-testid="treatment-diff"')
  })

  it('수정안 상자 안의 작은 알약 [버리기] · [적용]으로 정한다', () => {
    // 왜: 11/5 시안 WS — 고친 자리에서 바로 정한다. 단추 이름은 [버리기](오너 2026-11-09 결정 5: "되돌리기"는 적용한 걸 되돌리는 말이라 쓰지 않는다).
    const out = render(prose())
    const [discard] = tagsOf(out, 'prose-proposal-discard')
    const [apply] = tagsOf(out, 'prose-proposal-apply')
    expect(discard).toContain('data-variant="secondary"')
    expect(apply).toContain('data-variant="default"')
    expect(discard).toContain('h-[30px]')
    expect(out).toContain('버리기')
    expect(out).toContain('적용')
  })

  it('바꾼 문단이 여럿이면 [버리기] · [적용]은 마지막 상자에만 있다', () => {
    // 왜: 수정안은 한 덩어리로 적용된다 — 상자마다 단추가 있으면 그 문단만 적용되는 줄 안다. 바뀐 곳을 다 읽은 뒤 정하게 마지막에 둔다(혼자 정한 것).
    const out = render(prose({
      paragraphs: [P1, P2, P3],
      diffRows: [...ONE_CHANGE, { kind: 'changed', number: 3, before: P3, after: P3_NEW }],
    }))
    expect(tagsOf(out, 'prose-proposal-box')).toHaveLength(2)
    expect(tagsOf(out, 'prose-proposal-discard')).toHaveLength(1)
    expect(out.indexOf('data-testid="prose-proposal-discard"')).toBeGreaterThan(out.indexOf(P3_NEW))
  })

  it('수정안에서 빠지는 씬은 원래 글이 지운 줄로 남고 상자에 "수정안에서는 이 씬이 빠져요"가 보인다', () => {
    // 왜: 새 글이 없는 상자는 무엇이 바뀌는지 알 수 없다(혼자 정한 것).
    const out = render(prose({ diffRows: [{ kind: 'same', number: 1, after: P1 }, { kind: 'removed', number: null, before: P2 }] }))
    expect(out).toMatch(new RegExp(`line-through[^>]*>(<span[^>]*>[^<]*</span>)?${P2}`))
    expect(out).toContain('수정안에서는 이 씬이 빠져요.')
  })

  it('세 가지 안을 미리 보는 동안은 지금 비교(새 글 · 이전 글) 그대로다', () => {
    // 왜: 정상 경로 고정 — 세 가지 안은 고르기 창에서 고른다. 산문 안에 [버리기] · [적용]을 두면 창과 겹친다.
    const out = render(prose({ rewriting: true }))
    expect(out).toContain('data-testid="treatment-diff"')
    expect(out).not.toContain('data-testid="prose-proposal-box"')
  })

  it('산문을 직접 고치는 창이 열려 있으면 수정안 상자의 [버리기] · [적용]이 꺼진다', () => {
    // 왜: 정상 경로 고정 — 채팅 카드와 같은 규칙. 직접 고치는 중에 수정안을 적용하면 고친 글과 겹친다.
    useGlobalChatStore.setState({ sceneStoryEdit: { projectId: PROJECT } as never })
    const out = render(prose())
    expect(tagsOf(out, 'prose-proposal-apply')[0]).toContain('disabled=""')
    expect(tagsOf(out, 'prose-proposal-discard')[0]).toContain('disabled=""')
  })
})
