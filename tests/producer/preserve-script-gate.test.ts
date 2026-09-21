// 이 파일이 지키는 약속: 붙여 넣은 글이 대본이면 채팅이 먼저 "그대로 보존할까요"를 묻고, 그 답이 Writer 시작 요청까지 실린다 (#script-preserve 2026-09-17).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProjectSettings } from '@/types'
import type { BackgroundSource } from '@/lib/producer-gate'

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => ({
      update: () => ({ eq: async () => ({ error: null }) }),
    }),
  }),
}))

import { useGlobalChatStore } from '@/stores/global-chat-store'
import { useProducerStore } from '@/stores/producer-store'
import { useProjectStore } from '@/stores/project-store'
import { readPreserveScript } from '@/app/api/writer/start/preserve-flag'
import { mergeDraftWithDb, parseProducerDraft } from '@/stores/producer-store'

const SCRIPT = `INT. KITCHEN - NIGHT
Mira sets the kettle down.

MIRA
You came back.

JUN
(quietly)
I never left.

EXT. YARD - CONTINUOUS
Jun walks out.

JUN
Stay.`
const PROSE = '미라는 주전자를 내려놓는다. 준이 돌아왔다고 그녀는 생각한다. 밖에서 개가 짖는다.'

const readySettings: ProjectSettings = { playtime: 30, genre: 'drama', subGenre: 'family', format: 'horizontal_16:9', tone: ['quiet'], targetEmotion: [], dialogueLanguage: 'ko' }
const background: BackgroundSource = { localId: 'loc-1', locationId: 'kitchen', name: '부엌', visualDescription: '밤의 부엌', purpose: '재회', origin: 'producer', userEdited: false, stale: false }

beforeEach(() => {
  useGlobalChatStore.getState().reset()
  useProducerStore.getState().reset()
  useProjectStore.getState().resetProject()
  useProjectStore.setState({ projectId: 'proj-1', currentStage: 'producer' })
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe('대본 보존 관문 — 채팅', () => {
  // 왜: 지금은 붙여 넣은 글이 채팅 LLM 을 거쳐 "각색 문단"으로 압축된다. 대본이면 압축 전에 물어야 한다.
  it('붙여 넣은 글이 대본이면 그 글을 그대로 스토리로 두고 "그대로 보존할까요" 승인 카드를 띄운다', () => {
    const offered = useGlobalChatStore.getState().offerScriptPreserve(SCRIPT)
    expect(offered).toBe(true)
    expect(useProducerStore.getState().storyText).toBe(SCRIPT)
    expect(useProducerStore.getState().preserveScript).toBeNull()
    const p = useGlobalChatStore.getState().pendingProposal
    expect(p?.kind).toBe('producerPreserveScript')
    expect(p?.stage).toBe('producer')
  })

  // 왜: 줄거리 산문은 종전대로(채팅 LLM 각색) 가야 한다 — 관문이 끼어들면 안 된다.
  it('붙여 넣은 글이 대본이 아니면 관문을 띄우지 않는다', () => {
    expect(useGlobalChatStore.getState().offerScriptPreserve(PROSE)).toBe(false)
    expect(useGlobalChatStore.getState().pendingProposal).toBeNull()
    expect(useProducerStore.getState().storyText).toBe('')
  })

  // 왜: 승인은 "보존", 거절은 "참고 자료(각색)" — 둘 다 사람이 명시적으로 고른 값이다.
  it('승인하면 보존 표시가 켜지고, 거절하면 꺼진다', async () => {
    useGlobalChatStore.getState().offerScriptPreserve(SCRIPT)
    const ok = await useGlobalChatStore.getState().approvePendingProposal()
    expect(ok).toBe(true)
    expect(useProducerStore.getState().preserveScript).toBe(true)

    useGlobalChatStore.getState().offerScriptPreserve(SCRIPT)
    useGlobalChatStore.getState().declineScriptPreserve()
    expect(useProducerStore.getState().preserveScript).toBe(false)
    expect(useGlobalChatStore.getState().pendingProposal).toBeNull()
  })

  // 왜: 다른 글을 붙여 넣으면 전에 한 결정은 그 글에 대한 것이 아니다 — 다시 묻는다.
  it('스토리 글이 바뀌면 보존 결정은 지워져 다시 묻는다', () => {
    useProducerStore.getState().setPreserveScript(true)
    useProducerStore.getState().setStoryText(PROSE)
    expect(useProducerStore.getState().preserveScript).toBeNull()
  })
})

describe('대본 보존 관문 — Writer 시작 요청', () => {
  // 왜: 결정이 요청에 안 실리면 Writer 는 종전대로 각색한다.
  it('Writer 로 넘길 때 보존 결정이 시작 요청에 실린다', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ runId: 'r1' }), { status: 200 }))
    useProducerStore.setState({ storyText: SCRIPT, storyReady: true, styleAnchorKey: 'style_a', projectSettings: readySettings, cast: [], backgrounds: [background], preserveScript: true })
    const ok = await useProducerStore.getState().saveAndHandoff()
    expect(ok).toBe(true)
    const call = fetchSpy.mock.calls.find((c) => c[0] === '/api/writer/start')!
    const body = JSON.parse(String((call[1] as RequestInit).body))
    expect(body.preserveScript).toBe(true)
    expect(body.story).toBe(SCRIPT)
  })

  // 왜: 서버는 클라이언트가 보낸 값 중 명시적 true 만 보존으로 읽는다 — 문자열·누락은 종전 경로.
  it('시작 라우트는 명시적 true 만 보존으로 읽는다', () => {
    expect(readPreserveScript({ preserveScript: true })).toBe(true)
    expect(readPreserveScript({ preserveScript: 'true' })).toBe(false)
    expect(readPreserveScript({})).toBe(false)
    expect(readPreserveScript(null)).toBe(false)
  })
})

describe('대본 보존 관문 — 결정 뒤 채팅', () => {
  const okChat = () =>
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ reply: '카드를 정리했어요.' }), { status: 200 }))

  // 왜: 종전에는 붙여 넣은 글이 바로 채팅 모델로 가서 "각색 문단"이 됐다. 답을 듣기 전에는 모델을 부르지 않아야 원문이 산다.
  it('대본을 붙여 넣은 턴은 답을 듣기 전에는 채팅 모델로 보내지 않고, 붙여 넣은 글은 사용자 말풍선으로 남는다', () => {
    const fetchSpy = okChat()
    useGlobalChatStore.getState().offerScriptPreserve(SCRIPT, { held: { msg: SCRIPT } })
    // 말풍선 저장(/api/project/…/messages)은 돌아도 채팅 모델(/api/produce/chat)은 부르지 않는다.
    expect(fetchSpy.mock.calls.some((c) => c[0] === '/api/produce/chat')).toBe(false)
    const msgs = useGlobalChatStore.getState().messages
    expect(msgs.at(-2)?.role).toBe('user')
    expect(msgs.at(-2)?.content).toBe(SCRIPT)
    expect(msgs.at(-1)?.role).toBe('model')
  })

  // 왜: 보존을 골라도 인물·배경·설정 카드는 채팅이 채워 줘야 한다. 결정이 나면 그 대본으로 채팅이 이어진다.
  it('보존을 고르면 채팅이 이어져 인물·배경·설정 카드를 채우러 가고, 그 요청에는 보존 표시가 실린다', async () => {
    const fetchSpy = okChat()
    useGlobalChatStore.getState().offerScriptPreserve(SCRIPT, { held: { msg: SCRIPT } })
    await useGlobalChatStore.getState().approvePendingProposal()
    await vi.waitFor(() => expect(fetchSpy.mock.calls.some((c) => c[0] === '/api/produce/chat')).toBe(true))
    const call = fetchSpy.mock.calls.find((c) => c[0] === '/api/produce/chat')!
    const body = JSON.parse(String((call[1] as RequestInit).body))
    expect(body.preserveScript).toBe(true)
    expect(body.storyText).toBe(SCRIPT)
    // 이어지는 요청은 숨은 요청이다 — 사용자 말풍선은 붙여 넣은 글 하나뿐.
    expect(useGlobalChatStore.getState().messages.filter((m) => m.role === 'user')).toHaveLength(1)
  })

  // 왜: 참고 자료로 쓰기로 하면 종전 경로(채팅이 새 이야기로 각색)로 가야 한다.
  it('참고 자료로 쓰기로 하면 채팅이 종전대로 이어져 새 이야기를 만든다', async () => {
    const fetchSpy = okChat()
    useGlobalChatStore.getState().offerScriptPreserve(SCRIPT, { held: { msg: SCRIPT } })
    useGlobalChatStore.getState().declineScriptPreserve()
    await vi.waitFor(() => expect(fetchSpy.mock.calls.some((c) => c[0] === '/api/produce/chat')).toBe(true))
    const call = fetchSpy.mock.calls.find((c) => c[0] === '/api/produce/chat')!
    const body = JSON.parse(String((call[1] as RequestInit).body))
    expect(body.preserveScript).toBeFalsy()
    expect(useProducerStore.getState().preserveScript).toBe(false)
  })

  // 왜: 모델은 시스템 프롬프트대로 줄거리를 "각색 문단"으로 돌려준다. 보존 중이면 그 값을 버려야 원문이 산다(모델은 제안만 한다).
  it('보존을 고른 뒤에는 채팅이 제안한 줄거리로 원문 대본을 덮지 않고, 인물·배경·설정 제안만 반영한다', () => {
    useProducerStore.setState({ storyText: SCRIPT, preserveScript: true, storyReady: true })
    const outcome = useProducerStore.getState().applyExtractedSettings(
      {
        storyText: '미라와 준이 부엌에서 재회하는 짧은 이야기.',
        storyReady: true,
        genre: 'drama',
        characters: [{ name: 'Mira', entityType: 'person', appearance: '30대 여성, 앞치마' }],
      },
      null,
    )
    expect(outcome).toBe('applied')
    const s = useProducerStore.getState()
    expect(s.storyText).toBe(SCRIPT)
    expect(s.projectSettings.genre).toBe('drama')
    expect(s.cast.map((c) => c.name)).toEqual(['Mira'])
  })

  // 왜: 대본 전체가 곧 이야기다. 보존을 고르면 "스토리 준비" 항목이 채팅 판단 없이 채워져 넘김 관문을 막지 않는다.
  it('보존을 고르면 스토리는 준비된 것으로 본다', () => {
    useProducerStore.setState({ storyText: SCRIPT, storyReady: false })
    useProducerStore.getState().setPreserveScript(true)
    expect(useProducerStore.getState().storyReady).toBe(true)
  })

  // 왜: 서버 프롬프트도 같은 결정을 알아야 모델이 "줄거리를 정리했어요"라고 헛말하지 않는다. 화면 쪽 가드가 최종 방어이고 이건 1차.
  it('채팅 서버는 보존 중인 대본을 모델에 "다시 쓰지 말 것"으로 알린다', async () => {
    const { preservedScriptDirective } = await import('@/app/api/produce/chat/preserve-context')
    expect(preservedScriptDirective(true)).toMatch(/do not rewrite/i)
    expect(preservedScriptDirective(true)).toMatch(/storyText/)
    expect(preservedScriptDirective(false)).toBeNull()
    expect(preservedScriptDirective('true')).toBeNull()
    expect(preservedScriptDirective(undefined)).toBeNull()
    const { readFileSync } = await import('node:fs')
    const route = readFileSync('src/app/api/produce/chat/route.ts', 'utf8')
    expect(route).toMatch(/preservedScriptDirective\(/)
  })
})

describe('대본 보존 관문 — 새로고침', () => {
  // 왜: 보드는 새로고침하면 저장된 초안에서 되살아난다. 결정이 초안에 없으면 새로고침 뒤 넘김이 조용히 각색으로 간다.
  it('새로고침해도 보존 결정은 스토리와 함께 남는다', () => {
    const raw = { version: 1, savedAt: 1, storyText: SCRIPT, storyReady: true, settings: readySettings, cast: [], backgrounds: [], preserveScript: true }
    const draft = parseProducerDraft(raw)
    expect(draft?.preserveScript).toBe(true)
    const db = { storyText: '', storyReady: false, settings: readySettings, cast: [], backgrounds: [] }
    expect(mergeDraftWithDb(draft, db).preserveScript).toBe(true)
    // 결정이 적히지 않은 옛 초안은 "아직 안 물음"이다.
    const legacy = parseProducerDraft({ ...raw, preserveScript: undefined })
    expect(legacy?.preserveScript).toBeNull()
  })
})
