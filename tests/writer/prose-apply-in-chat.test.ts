// Writer 산문 수정안이 준비되면 채팅에도 "적용할까요?"와 [적용] · [적용 안 함] 단추가 뜨고, 산문 쪽 [적용] · [버리기]와 같은 결정을 한다 (오너 2026-11-16)
import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/chat-persistence', () => ({ saveChatMessage: vi.fn(), saveChatTrace: vi.fn(), saveChatTracePatch: vi.fn(), loadLatestChatTrace: vi.fn() }))
vi.mock('@/lib/writer/use-writer-status', async (original) => ({ ...(await original<typeof import('@/lib/writer/use-writer-status')>()), restartWriterStatus: vi.fn() }))

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { saveChatMessage } from '@/lib/chat-persistence'
import { translate } from '@/lib/i18n/translate'
import { unresolvedSceneStoryProposal, type SceneStoryProposalView } from '@/lib/producer/scene-story-proposal'
import type { TreatmentDiffRow } from '@/lib/producer/scene-story-rewrite'
import { SceneStoryProposalCard } from '@/components/layout/scene-story-proposal-card'
import { ProseProposalView } from '@/features/prose/proposal-view'
import { useGlobalChatStore } from '@/stores/global-chat-store'
import { useLocaleStore } from '@/stores/locale-store'
import { useProjectStore } from '@/stores/project-store'
import { useWriterRoomStore } from '@/stores/writer-room-store'

const PROJECT = 'prose-project'
const DECLINED_KO = '적용하지 않았어요. 원래 글은 그대로예요.'
const DECLINED_EN = 'I did not apply it. The prose stays as it was.'
// 이 시험을 위해 지은 글 — 실제 사용자의 글이 아니다.
const READY: SceneStoryProposalView = {
  id: 'p1', status: 'ready', feedback: 'S2 문단만 고쳐 주세요.', createdAt: '2026-11-16T00:00:00Z', stale: false,
  before: [{ sceneId: 's1', index: 0, beats: ['첫 씬'] }, { sceneId: 's2', index: 1, beats: ['캔이 우르르 쏟아진다'] }],
  after: [{ sceneId: 's1', index: 0, beats: ['첫 씬'] }, { sceneId: 's2', index: 1, beats: ['캔이 폭포처럼 쏟아진다'] }],
}
const ROWS: TreatmentDiffRow[] = [
  { kind: 'same', number: 1, after: '첫 씬' },
  { kind: 'changed', number: 2, before: '캔이 우르르 쏟아진다', after: '캔이 폭포처럼 쏟아진다' },
]

let request: ReturnType<typeof vi.fn>
const bodies = () => request.mock.calls.map(([url, init]) => ({ url: String(url), body: JSON.parse(String((init as RequestInit).body)) }))
const saved = () => vi.mocked(saveChatMessage).mock.calls

/** 정적 렌더는 스토어의 처음 값을 읽는다 — 지금 값을 처음 값으로 옮겨 그린다. */
function render(element: ReturnType<typeof createElement>) {
  for (const store of [useLocaleStore, useProjectStore, useGlobalChatStore, useWriterRoomStore] as Array<{ getState: () => object; getInitialState: () => object }>) Object.assign(store.getInitialState(), store.getState())
  return renderToStaticMarkup(element)
}
const chip = (proposal: SceneStoryProposalView = READY) => render(createElement(SceneStoryProposalCard, { projectId: PROJECT, proposal, look: 'writer' }))
const tagsOf = (out: string, testId: string) => out.match(new RegExp(`<[a-z]+[^>]*data-testid="${testId}"[^>]*>`, 'g')) ?? []
const source = (path: string) => readFileSync(path, 'utf8')

beforeEach(() => {
  useLocaleStore.setState({ locale: 'ko' })
  useGlobalChatStore.getState().reset()
  useWriterRoomStore.setState({ paragraph: null, revising: null, reviseAnnounce: null, rewriteOpen: false, confirmOpen: false, manualRequest: 0 })
  useProjectStore.setState({ projectId: PROJECT, currentStage: 'producer', reachedStage: 'producer', producerLocked: false, treatmentDraft: true, projectLocale: 'ko', projectLocaleLocked: true })
  vi.mocked(saveChatMessage).mockClear()
  request = vi.fn(async () => Response.json({ ok: true }))
  vi.stubGlobal('fetch', request)
})
afterEach(() => {
  vi.unstubAllGlobals()
  useLocaleStore.setState({ locale: 'en' })
})

describe('채팅의 수정안 줄', () => {
  it('수정안이 준비되면 Writer 채팅에 "수정안 · S2 · 1곳" 칩과 "적용할까요?"가 보이고 [적용] · [적용 안 함] 단추가 있다', () => {
    // 왜: 오너 11/16 — 산문 상자까지 가지 않고 채팅에서 바로 적용할지 정한다. 칩은 어느 문단 몇 곳인지, 단추는 정하는 자리다.
    const out = chip()

    expect(out).toContain('data-testid="scene-story-proposal-chip"')
    expect(out).toContain('수정안 · S2 · 1곳')
    expect(out).toContain('적용할까요?')
    const [apply] = tagsOf(out, 'scene-story-chip-apply')
    const [decline] = tagsOf(out, 'scene-story-chip-decline')
    expect(apply).toBeDefined()
    expect(decline).toBeDefined()
    expect(out.indexOf('scene-story-chip-apply')).toBeLessThan(out.indexOf('scene-story-chip-decline'))
    expect(out).toMatch(/>적용<\/button>/)
    expect(out).toMatch(/>적용 안 함<\/button>/)
  })

  it('영어 화면에서는 "Shall I apply it?"와 [Apply] · [Do not apply]가 보인다', () => {
    // 왜: 새 문구는 한국어 · 영어 두 말이다 — 영어는 첫 글자 대문자 · 긴 대시 없음.
    useLocaleStore.setState({ locale: 'en' })
    useProjectStore.setState({ projectLocale: 'en' })

    const out = chip()

    expect(out).toContain('Shall I apply it?')
    expect(out).toMatch(/>Apply<\/button>/)
    expect(out).toMatch(/>Do not apply<\/button>/)
    expect(out).toContain('Proposal · S2 · 1 changed')
  })

  it('[적용]은 크림 메인이고 [적용 안 함]은 한 단 밝은 보조색의 작은 알약이며 붉은 강조를 쓰지 않는다', () => {
    // 왜: 11/5 WS 의 작은 알약(높이 30)과 같은 꼴 — 채팅 말풍선 위에서는 카드색이 바탕과 거의 같아 단계 확인 단추처럼 한 단 밝은 색을 쓴다. 붉은 강조는 CTA 에만(design.md §1).
    const out = chip()
    const [apply] = tagsOf(out, 'scene-story-chip-apply')
    const [decline] = tagsOf(out, 'scene-story-chip-decline')

    expect(apply).toContain('data-variant="default"')
    expect(decline).toContain('data-variant="secondary"')
    expect(decline).toContain('bg-surface-elevated')
    for (const tag of [apply, decline]) {
      expect(tag).toContain('data-size="pill"')
      expect(tag).toContain('h-[30px]')
      expect(tag).not.toMatch(/data-variant="destructive"|bg-destructive|bg-stage|text-stage|bg-red|text-red/)
    }
  })

  it('세 가지 안을 담은 수정안이면 채팅 줄에 [적용]이 없다 — 고르기 창이 정한다', () => {
    // 왜: 세 안 가운데 무엇을 적용할지는 채팅 단추 하나로 정할 수 없다(혼자 정한 것).
    const variants = [{ id: 'v1', direction: 'light', status: 'ready', after: READY.after, stale: false }]

    const out = chip({ ...READY, variants } as unknown as SceneStoryProposalView)

    expect(out).not.toContain('scene-story-chip-apply')
    expect(out).not.toContain('scene-story-chip-decline')
  })

  it('만드는 중 · 실패 · 충돌 수정안에는 채팅 줄 단추가 없다 — 지금 카드가 맡는다', () => {
    // 왜: 적용할 수정안이 없다. 실패 · 충돌은 [최신 내용으로 다시 제안] · [버리기] 카드가 빠져나갈 길이다.
    const generating = chip({ ...READY, status: 'generating', after: [] })
    const failed = chip({ ...READY, status: 'failed' })
    const stale = chip({ ...READY, stale: true })

    for (const out of [generating, failed, stale]) {
      expect(out).not.toContain('scene-story-chip-apply')
      expect(out).not.toContain('scene-story-chip-decline')
    }
    expect(failed).toContain('scene-story-proposal-regenerate')
    expect(stale).toContain('scene-story-proposal-regenerate')
  })

  it('바꿀 곳이 없었던 수정안에는 카드도 단추도 없다', () => {
    // 왜: 정상 경로 고정 — 아무것도 안 바뀌는 수정안을 적용할지 묻지 않는다(디자이너 QA 1차 #01).
    const unchanged = { ...READY, status: 'failed' as const, error: 'scene_story_proposal_unchanged', after: [] }

    expect(chip(unchanged)).toBe('')
  })

  it('산문을 직접 고치는 창이 열려 있으면 채팅의 [적용] · [적용 안 함]이 꺼진다', () => {
    // 왜: 산문 상자와 같은 규칙 — 직접 고치는 중에 수정안을 적용하면 고친 글과 겹친다.
    useGlobalChatStore.setState({ sceneStoryEdit: { projectId: PROJECT } as never })

    const out = chip()

    expect(tagsOf(out, 'scene-story-chip-apply')[0]).toContain('disabled=""')
    expect(tagsOf(out, 'scene-story-chip-decline')[0]).toContain('disabled=""')
  })

  it('수정안을 정하는 동안에는 채팅 단추도 산문 상자 단추도 함께 꺼진다', () => {
    // 왜: 한쪽 단추를 누른 1초 안팎 사이 다른 쪽이 눌려도 조용히 무시된다 — 두 쪽이 같이 꺼져야 "맞춰진" 것으로 보인다(리드 11/16).
    useGlobalChatStore.setState({ sceneStoryResolving: { projectId: PROJECT, id: 'p1' } })

    const inChat = chip()
    const inProse = render(createElement(ProseProposalView, { rows: ROWS, proposal: { id: 'p1' } }))

    expect(tagsOf(inChat, 'scene-story-chip-apply')[0]).toContain('disabled=""')
    expect(tagsOf(inChat, 'scene-story-chip-decline')[0]).toContain('disabled=""')
    expect(tagsOf(inProse, 'prose-proposal-apply')[0]).toContain('disabled=""')
    expect(tagsOf(inProse, 'prose-proposal-discard')[0]).toContain('disabled=""')
  })

  it('다른 프로젝트의 수정안을 정하는 중이어도 이 프로젝트의 단추는 꺼지지 않는다', () => {
    // 왜: 정상 경로 고정 — 프로젝트를 옮긴 뒤 남은 처리 표시가 새 프로젝트 단추를 잠그면 안 된다.
    useGlobalChatStore.setState({ sceneStoryResolving: { projectId: 'other-project', id: 'p9' } })

    const out = chip()

    expect(tagsOf(out, 'scene-story-chip-apply')[0]).not.toContain('disabled=""')
    expect(tagsOf(out, 'scene-story-chip-decline')[0]).not.toContain('disabled=""')
  })
})

describe('[적용 안 함]', () => {
  it('[적용 안 함]을 누르면 수정안을 버리고 채팅에 "적용하지 않았어요. 원래 글은 그대로예요."를 저장해 남기며 다음 단계는 묻지 않는다', async () => {
    // 왜: 버려도 채팅에 아무 말이 없으면 눌렀는지 알 수 없고, 새로 고침 뒤에도 기록이 남아야 한다(오너 11/16 "적용했어요 · 적용하지 않았어요" 결과 글).
    expect(await useGlobalChatStore.getState().declineProseProposal('p1')).toBe(true)

    expect(bodies()).toEqual([{ url: '/api/writer/scene-gate', body: { projectId: PROJECT, action: 'discard', proposalId: 'p1' } }])
    const last = useGlobalChatStore.getState().messages.at(-1)
    expect(last).toMatchObject({ stage: 'producer', role: 'model', content: DECLINED_KO })
    expect(saved()).toContainEqual([PROJECT, 'producer', 'model', DECLINED_KO])
    expect(useGlobalChatStore.getState().suggestion).toBeNull()
    expect(useGlobalChatStore.getState().sceneStoryResolved).toEqual({ projectId: PROJECT, id: 'p1' })
  })

  it('영어 프로젝트에서는 "I did not apply it. The prose stays as it was."를 남긴다', async () => {
    // 왜: 채팅 말은 프로젝트 언어를 따른다 — 영어 프로젝트에 한국어 말이 남으면 안 된다.
    useLocaleStore.setState({ locale: 'en' })
    useProjectStore.setState({ projectLocale: 'en' })

    await useGlobalChatStore.getState().declineProseProposal('p1')

    expect(useGlobalChatStore.getState().messages.at(-1)?.content).toBe(DECLINED_EN)
  })

  it('같은 결과 말이 연달아 두 번 남아도 하나로 합치지 않는다', async () => {
    // 왜: 수정안을 두 번 버리면 두 번 결정한 것이다 — 채팅 기록은 둘 다 보여 준다(고쳐 봤다는 말 없이 새로 고침한 뒤 둘째를 버린 경우).
    await useGlobalChatStore.getState().declineProseProposal('p1')
    useGlobalChatStore.setState({ sceneStoryResolved: null })

    await useGlobalChatStore.getState().declineProseProposal('p2')

    expect(useGlobalChatStore.getState().messages.filter((message) => message.content === DECLINED_KO)).toHaveLength(2)
  })

  it('버리지 못했으면(서버가 받지 않음) 결과 말을 남기지 않고 수정안은 그대로 남는다', async () => {
    // 왜: "적용하지 않았어요"가 거짓이 된다 — 수정안이 아직 열려 있으니 단추가 다시 눌린다.
    request.mockImplementation(async () => Response.json({ code: 'nope' }, { status: 500 }))

    expect(await useGlobalChatStore.getState().declineProseProposal('p1')).toBe(false)

    expect(useGlobalChatStore.getState().messages.some((message) => message.content === DECLINED_KO)).toBe(false)
    expect(saved()).toEqual([])
    expect(useGlobalChatStore.getState().sceneStoryResolved).toBeNull()
  })

  it('그새 다른 프로젝트로 옮겼으면 다른 프로젝트 채팅에 말을 남기지 않는다', async () => {
    // 왜: 늦게 끝난 버리기가 지금 보는 프로젝트의 채팅에 끼어들면 안 된다.
    request.mockImplementation(async () => {
      useProjectStore.setState({ projectId: 'other-project' })
      return Response.json({ ok: true })
    })

    await useGlobalChatStore.getState().declineProseProposal('p1')

    expect(useGlobalChatStore.getState().messages.some((message) => message.content === DECLINED_KO)).toBe(false)
    expect(saved()).toEqual([])
  })

  it('Writer 산문이 아닌 자리에서 버린 것에는 말을 남기지 않는다', async () => {
    // 왜: 이 말은 Writer 산문 수정안 전용이다 — 다른 단계의 채팅에 "원래 글"이라는 말이 뜨면 이상하다.
    useProjectStore.setState({ currentStage: 'artist' })

    await useGlobalChatStore.getState().declineProseProposal('p1')

    expect(useGlobalChatStore.getState().messages.some((message) => message.content === DECLINED_KO)).toBe(false)
  })

  it('다시 제안 · 바꿀 곳 없음 · 세 가지 안을 버리는 길은 이 말을 남기지 않는다', async () => {
    // 왜: 정상 경로 고정 — 이 버리기들은 "적용할지 물었더니 안 한다"가 아니다(다시 제안은 곧 새 수정안이 오고, 바꿀 곳 없음은 따로 말한다).
    await useGlobalChatStore.getState().resolveSceneStoryProposal('discard', 'p1')

    expect(useGlobalChatStore.getState().messages.some((message) => message.content === DECLINED_KO)).toBe(false)
    expect(saved()).toEqual([])
  })

  it('[적용]을 누르면 지금처럼 "적용했어요. 다음 단계로 넘어갈까요?"가 결과 글로 남는다', async () => {
    // 왜: 적용 쪽 결과 글은 이미 있다(저장되는 채팅 말) — 같은 말을 한 번 더 남기지 않는다.
    expect(await useGlobalChatStore.getState().resolveSceneStoryProposal('apply', 'p1')).toBe(true)

    const contents = useGlobalChatStore.getState().messages.map((message) => message.content)
    expect(contents.filter((content) => content.startsWith('적용했어요.'))).toHaveLength(1)
    expect(contents).not.toContain(DECLINED_KO)
  })
})

describe('산문 쪽과 맞추기', () => {
  it('수정안을 정하는 동안 공유 표시가 켜졌다가 끝나면 꺼진다', async () => {
    // 왜: 두 쪽 단추가 같은 표시를 읽어 함께 꺼진다 — 끝나면 풀려야 단추가 다시 눌린다.
    let release: (value: Response) => void = () => {}
    request.mockImplementation(() => new Promise<Response>((resolve) => { release = resolve }))

    const pending = useGlobalChatStore.getState().resolveSceneStoryProposal('apply', 'p1')
    await Promise.resolve()
    expect(useGlobalChatStore.getState().sceneStoryResolving).toEqual({ projectId: PROJECT, id: 'p1' })

    release(Response.json({ ok: true }))
    await pending
    expect(useGlobalChatStore.getState().sceneStoryResolving).toBeNull()
  })

  it('수정안을 정하다 실패해도 공유 표시는 꺼진다', async () => {
    // 왜: 실패 뒤에도 켜져 있으면 두 쪽 단추가 영영 잠긴다.
    request.mockImplementation(async () => Response.json({ code: 'nope' }, { status: 500 }))

    expect(await useGlobalChatStore.getState().resolveSceneStoryProposal('discard', 'p1')).toBe(false)

    expect(useGlobalChatStore.getState().sceneStoryResolving).toBeNull()
  })

  it('다시 읽어 프로젝트가 바뀌거나 채팅을 비우면 공유 표시도 비워진다', () => {
    // 왜: 프로젝트를 옮겨도 남은 처리 표시가 새 프로젝트 단추를 잠그지 않게 한다.
    useGlobalChatStore.setState({ sceneStoryResolving: { projectId: PROJECT, id: 'p1' } })

    useGlobalChatStore.getState().reset()

    expect(useGlobalChatStore.getState().sceneStoryResolving).toBeNull()
  })

  it('채팅 [적용]은 산문 [적용]과 같은 행동을, [적용 안 함]은 산문 [버리기]와 같은 행동을 부른다', () => {
    // 왜: 두 쪽이 같은 결정을 같은 길로 한다 — 어느 쪽에서 눌러도 채팅 · 산문이 같은 말 · 같은 순간에 내려간다.
    const card = source('src/components/layout/scene-story-proposal-card.tsx')
    const box = source('src/features/prose/proposal-view.tsx')

    expect(card).toContain("resolveSceneStoryProposal('apply', proposal.id)")
    expect(card).toContain('declineProseProposal(proposal.id)')
    expect(box).toContain("resolveSceneStoryProposal('apply', proposal.id)")
    expect(box).toContain('declineProseProposal(proposal.id)')
    expect(card).toContain('sceneStoryResolving')
    expect(box).toContain('sceneStoryResolving')
  })

  it('두 쪽은 정한 수정안을 같은 규칙으로 내린다', () => {
    // 왜: 한쪽에서 정하면 다른 쪽이 다시 읽기를 기다리지 않고 같은 순간 내려간다(디자이너 QA 1차 관찰 26의 규칙을 채팅 단추에도).
    expect(source('src/components/layout/global-chat.tsx')).toContain('unresolvedSceneStoryProposal(')
    expect(source('src/features/prose/use-prose.ts')).toContain('unresolvedSceneStoryProposal(')
    expect(unresolvedSceneStoryProposal(READY, { projectId: PROJECT, id: 'p1' }, PROJECT)).toBeNull()
    expect(unresolvedSceneStoryProposal({ ...READY, id: 'p2' }, { projectId: PROJECT, id: 'p1' }, PROJECT)).toMatchObject({ id: 'p2' })
  })

  it('채팅 단추는 이 칩 한 군데에만 있다', () => {
    // 왜: 지난 채팅 기록(저장되는 말)에는 단추가 없다 — 열린 수정안 하나의 줄에만 있어 오래된 단추가 남지 않는다.
    const hits = ['src/components/layout/scene-story-proposal-card.tsx', 'src/components/layout/global-chat.tsx', 'src/lib/prose/revise-chat.ts', 'src/stores/global-chat-store.ts']
      .filter((path) => source(path).includes('scene-story-chip-apply'))

    expect(hits).toEqual(['src/components/layout/scene-story-proposal-card.tsx'])
  })
})

describe('새로 고침 · 다른 탭 · 쌓이는 수정안', () => {
  it('아직 정하지 않은 수정안이면 새로 고친 화면에서도 채팅 줄에 단추가 다시 보인다', () => {
    // 왜: 채팅 줄은 따로 저장한 값 없이 서버의 열린 수정안을 읽어 그린다 — 새로 고침 · 다른 탭에서 열어도 같은 줄이다.
    useGlobalChatStore.getState().reset()

    expect(unresolvedSceneStoryProposal(READY, null, PROJECT)).toEqual(READY)
    expect(chip()).toContain('scene-story-chip-apply')
  })

  it('이미 정한 수정안이면 새로 고침 뒤 서버가 수정안을 내보내지 않아 채팅 줄이 없다', () => {
    // 왜: 정상 경로 고정 — 서버에는 정한 수정안이 남지 않는다(preview 의 sceneStoryProposal 이 없다).
    expect(unresolvedSceneStoryProposal(null, null, PROJECT)).toBeNull()
    expect(unresolvedSceneStoryProposal(undefined, { projectId: PROJECT, id: 'p1' }, PROJECT)).toBeNull()
  })

  it('열린 수정안이 있으면 새 수정 부탁은 보내지 않고 먼저 정하라고 안내한다', async () => {
    // 왜: 수정안은 늘 하나라 단추도 그 하나의 줄에만 있다 — 새 부탁이 수정안을 쌓지 못한다(서버 규칙을 채팅이 먼저 막는다).
    useGlobalChatStore.setState({ sceneStoryProposalPending: { projectId: PROJECT, id: 'p1' } })

    expect(await useGlobalChatStore.getState().reviseSceneGate('팀장을 더 얄밉게 해줘')).toBe(false)

    expect(request).not.toHaveBeenCalled()
    expect(useGlobalChatStore.getState().error).toBe('현재 씬 스토리 수정안을 적용하거나 버린 뒤 다시 요청해 주세요.')
  })
})

describe('문구와 자리', () => {
  it('새 문구는 한국어 · 영어 두 말이고 영어는 첫 글자 대문자 · 긴 대시가 없다', () => {
    // 왜: 새 문구는 전부 ko · en 두 말(STAGE1 지킬 것) — 영어 문장이 키라 한국어 사전에 값이 있어야 한다.
    const pairs: Array<[string, string]> = [
      ['Shall I apply it?', '적용할까요?'],
      ['Do not apply', '적용 안 함'],
      ['Apply', '적용'],
      ['I did not apply it. The prose stays as it was.', DECLINED_KO],
    ]
    for (const [en, ko] of pairs) {
      expect(translate('ko', en)).toBe(ko)
      expect(en).toMatch(/^[A-Z]/)
      expect(en).not.toMatch(/[—–]/)
      expect(translate('en', en)).toBe(en)
    }
  })

  it('Writer 단계 채팅은 수정안 줄을 Writer 모양으로 그린다', () => {
    // 왜: 칩 · 단추는 Writer 산문에만 — 그 밖의 자리는 지금 카드 그대로다(Producer 트리트먼트 초록 비교 포함).
    expect(source('src/components/layout/global-chat.tsx')).toContain("look={currentStage === 'producer' ? 'writer' : 'card'}")
  })

  it('이 화면은 시안이 없다는 것을 코드 설명에 적어 둔다', () => {
    // 왜: 11/5 WS 시안은 칩만 있다 — 채팅 단추는 오너 11/16 문장에서 왔으므로 다음 사람이 시안과 다르다고 놀라지 않게 한다.
    expect(source('src/components/layout/scene-story-proposal-card.tsx')).toMatch(/시안 없음/)
  })
})
