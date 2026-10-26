// Artist 채팅은 산문에 없는 인물 · 배경 카드를 만들지 않고 산문에서 고치라고 안내하며, 있는 인물의 새 모습은 지금처럼 승인 카드로 받는다 (2026-10-27 디자이너 QA 1차)
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ llm: vi.fn(), roster: vi.fn() }))
vi.mock('@/lib/llm', () => ({ llmChat: mocks.llm }))
vi.mock('@/lib/supabase/auth', () => ({ getUser: vi.fn(async () => ({ id: 'owner', user_metadata: { locale: 'ko' } })) }))
vi.mock('@/lib/demo/guard-server', () => ({ demoWriteBlock: vi.fn(() => null) }))
vi.mock('@/lib/generation-jobs', async (original) => ({
  ...await original<typeof import('@/lib/generation-jobs')>(),
  userOwnsProject: vi.fn(async () => true),
}))
vi.mock('@/lib/artist/chat-context', async (original) => ({
  ...await original<typeof import('@/lib/artist/chat-context')>(),
  buildArtistActivityContext: vi.fn(async () => ''),
}))
vi.mock('@/lib/chat-format', async (original) => ({
  ...await original<typeof import('@/lib/chat-format')>(),
  resolveChatLocale: vi.fn(async () => ({ locale: 'ko', switched: null })),
}))
vi.mock('@/lib/chat-trace-server', () => ({ persistChatTraceBestEffort: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: () => ({ select: () => ({ eq: mocks.roster }) }) } }))
vi.mock('@/lib/chat-persistence', () => ({ saveChatMessage: vi.fn(), saveChatTrace: vi.fn(), saveChatTracePatch: vi.fn(), loadLatestChatTrace: vi.fn() }))

import { POST } from '@/app/api/artist/chat/route'
import { useGlobalChatStore } from '@/stores/global-chat-store'
import { useArtistStore } from '@/stores/artist-store'
import { useProjectStore } from '@/stores/project-store'
import type { CharacterAsset, WorldAsset } from '@/types/asset'

// 오너가 정한 안내 문장(2026-10-27 "채팅 추가 막고 안내").
const GUIDANCE = '인물 · 배경은 확정한 산문에서 뽑아요. 산문에 없는 인물 · 배경은 Artist에서 새로 만들 수 없어요. 산문에서 고쳐야 해요. 이미 있는 인물의 모습(옷 · 나이)은 여기서 더할 수 있어요.'

const doyun: CharacterAsset = {
  characterId: 'char_doyun', name: '도윤', entityType: 'person', origin: 'producer',
  views: { main: null, back: null, sideLeft: null, sideRight: null }, viewCandidates: {},
  appearances: [{ appearanceKey: 'current', label: '현재', isDefault: true, narrativeTime: 'present', sheetUrl: null, portraitUrl: null, appearance: null, appearanceNative: null, viewCandidates: {} }],
}
const alley: WorldAsset = { locationId: 'loc_alley', name: '빗속 골목', sceneId: 'scene_1', wideShot: null, appearances: [] }

function modelSays(reply: string, updates: unknown[]) {
  mocks.llm.mockResolvedValue(`${reply}\n\n\`\`\`json\n${JSON.stringify({ updates })}\n\`\`\``)
}
async function routeChat(message: string) {
  const response = await POST(new Request('http://localhost/api/artist/chat', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId: 'project-qa', message, history: [], uiLocale: 'ko' }),
  }))
  expect(response.status).toBe(200)
  return response.json()
}
/** 화면 쪽 — 서버(예전 판 포함)가 돌려준 답을 그대로 받는다. */
function serverReturns(payload: Record<string, unknown>) {
  const fetchMock = vi.fn(async (url: string) => (String(url).includes('/messages') ? Response.json({ messages: [] }) : Response.json({ reply: '확인해 주세요.', updates: [], ...payload })))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}
const systemPrompt = () => mocks.llm.mock.calls[0][0] as string
const originalCreateAppearance = useArtistStore.getState().createAppearance

beforeEach(() => {
  vi.clearAllMocks()
  mocks.roster.mockResolvedValue({ data: [{ character_id: 'char_doyun', name: '도윤' }], error: null })
  useGlobalChatStore.getState().reset()
  useProjectStore.setState({ projectId: 'project-qa', currentStage: 'artist', reachedStage: 'artist', projectLocale: 'ko', projectLocaleLocked: true })
  useArtistStore.setState({ characterAssets: [doyun], worldAssets: [alley], sceneManifest: null, generatingViews: [], error: null })
})
afterEach(() => {
  useArtistStore.setState({ createAppearance: originalCreateAppearance })
  useGlobalChatStore.getState().reset()
  vi.unstubAllGlobals()
})

describe('Artist 채팅의 새 카드 만들기 막기(디자이너 QA 1차 #04)', () => {
  it('Artist 채팅에서 새 인물을 만들어 달라고 해도 인물 카드를 만들지 않고 산문에서 고쳐야 한다고 안내한다', async () => {
    // 왜: 산문에 없는 '경찰관'을 채팅으로 추가하자 카드가 생기고 그림까지 그려져 산문과 목록이 어긋났다(디자이너 QA 1차 #04 · 오너 "채팅 추가 막고 안내").
    modelSays('경찰관을 조연으로 추가했어요.', [{ type: 'createCharacter', name: '경찰관', role: 'supporting', appearance: '남색 제복' }])
    const data = await routeChat('경찰관이라는 인물을 새로 만들어줘')
    // 모델에게 새 인물 만들기 명령을 알려 주지 않고, 산문에서 고치라는 안내로 답하라고 한다.
    expect(systemPrompt()).not.toContain('"type":"createCharacter"')
    expect(systemPrompt()).toContain(GUIDANCE)
    // 모델이 그래도 만들기 명령을 내면 서버가 버리고, "추가했어요" 대신 안내만 남긴다.
    expect(data.updates).toEqual([])
    expect(data.reply).toBe(GUIDANCE)

    // 예전 서버가 만들기 명령을 보내도 화면은 카드를 만들지 않는다.
    const fetchMock = serverReturns({ reply: '경찰관을 추가했어요.', updates: [{ type: 'createCharacter', name: '경찰관' }] })
    await useGlobalChatStore.getState().sendMessage('경찰관이라는 인물을 새로 만들어줘')
    expect(useArtistStore.getState().characterAssets.map((c) => c.name)).toEqual(['도윤'])
    expect(fetchMock.mock.calls.some(([url]) => String(url) === '/api/artist/character')).toBe(false)
  })

  it('Artist 채팅에서 새 배경을 만들어 달라고 해도 배경을 만들지 않고 산문에서 고쳐야 한다고 안내한다', async () => {
    // 왜: 배경도 인물처럼 확정한 산문에서 나온다(디자이너 QA 1차 #04 · 오너 "채팅 추가 막고 안내"). 배경 만들기 명령은 원래 없지만 모델이 지어낸 명령도 막는다.
    modelSays('비 오는 부두를 새 배경으로 추가했어요.', [
      { type: 'createLocation', name: '비 오는 부두', visualDescription: '밤비가 내리는 부두' },
      { type: 'createBackground', name: '부두' },
      { type: 'addWorldAsset', name: '부두 창고' },
    ])
    const data = await routeChat('비 오는 부두 배경을 새로 만들어줘')
    expect(systemPrompt()).toMatch(/new character or background/i)
    expect(data.updates).toEqual([])
    expect(data.locationAppearanceCreations).toEqual([])
    expect(data.reply).toBe(GUIDANCE)

    // 화면도 지어낸 배경 만들기 명령으로 배경을 늘리지 않는다.
    const fetchMock = serverReturns({ reply: '부두를 추가했어요.', updates: [{ type: 'createLocation', name: '비 오는 부두' }] })
    await useGlobalChatStore.getState().sendMessage('비 오는 부두 배경을 새로 만들어줘')
    expect(useArtistStore.getState().worldAssets.map((w) => w.name)).toEqual(['빗속 골목'])
    expect(fetchMock.mock.calls.some(([url]) => /\/api\/artist\/(character|generate-world|location)/.test(String(url)))).toBe(false)
  })

  it('이미 있는 인물에 모습(옷 · 나이)을 더하는 요청은 지금처럼 승인 카드로 받는다', async () => {
    // 왜: 정상 경로 고정. 새 카드는 막아도 있는 인물의 새 모습(디자이너 QA 1차 #04 안내문 "여기서 더할 수 있어요")은 그대로 승인 카드로 받는다.
    const creation = { type: 'createAppearance', characterId: 'char_doyun', label: '젊은 시절', appearance: '교복 차림의 열일곱 살', narrativeTime: 'past' }
    modelSays('도윤의 젊은 시절 모습을 추가할게요. 승인해 주세요.', [creation])
    const data = await routeChat('도윤에게 젊은 시절 모습을 추가해줘')
    expect(systemPrompt()).toContain('"type":"createAppearance"')
    expect(data.updates).toEqual([])
    expect(data.appearanceCreations).toEqual([{ characterId: 'char_doyun', label: '젊은 시절', appearance: '교복 차림의 열일곱 살', narrativeTime: 'past' }])
    expect(data.reply).toBe('도윤의 젊은 시절 모습을 추가할게요. 승인해 주세요.')

    // 화면은 승인 카드를 띄우고, 승인 전에는 모습을 만들지 않는다.
    const createAppearance = vi.fn().mockResolvedValue('young')
    useArtistStore.setState({ createAppearance })
    serverReturns({ reply: data.reply, appearanceCreations: data.appearanceCreations })
    await useGlobalChatStore.getState().sendMessage('도윤에게 젊은 시절 모습을 추가해줘')
    const proposal = useGlobalChatStore.getState().pendingProposal
    expect(proposal).toMatchObject({ stage: 'artist', kind: 'artistCreateAppearance', target: '도윤' })
    expect(createAppearance).not.toHaveBeenCalled()
  })
})

describe('Artist 채팅 입력 예시(디자이너 QA 1차 #04)', () => {
  it('Artist 채팅 입력 예시는 새 인물을 만들자고 하지 않는다', async () => {
    // 왜: 채팅으로 새 인물을 만들 수 없게 됐는데 입력칸 예시가 "갈색 머리 Kai 캐릭터 만들어줘"였다(개발 서버 확인).
    const { STAGE_PLACEHOLDER } = await import('@/lib/constants')
    const { KO } = await import('@/lib/i18n/messages-ko')
    const example = STAGE_PLACEHOLDER.artist
    expect(example).not.toMatch(/create|new character|named/i)
    expect(KO[example as keyof typeof KO]).toBeTruthy()
    expect(String(KO[example as keyof typeof KO])).not.toMatch(/만들어|추가/)
  })
})
