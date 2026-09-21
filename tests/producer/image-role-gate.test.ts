// 이 파일이 지키는 약속: Producer 채팅에 올린 그림은 각색 시드가 아니라 카드의 그림이 된다. 인물·배경이면 카드에 붙어 Artist 까지 가고, 참고 자료면 종전대로 채팅이 본다 (#image-to-artist 2026-09-17).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProjectSettings } from '@/types'

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => ({
      update: () => ({ eq: async () => ({ error: null }) }),
    }),
  }),
}))

import { useGlobalChatStore } from '@/stores/global-chat-store'
import { useProducerStore, mergeDraftWithDb, parseProducerDraft } from '@/stores/producer-store'
import { useProjectStore } from '@/stores/project-store'
import { matchImageRoleAnswer, matchImageRoleInText } from '@/lib/producer/image-role'

const MEDIA = 'https://example.supabase.co/storage/v1/object/public/media/ws-1/proj-1/uploads'
const komatsu = { id: 'att-1', name: 'komatsu.png', thumbUrl: `${MEDIA}/u1/original.png`, sliceUrls: [`${MEDIA}/u1/s000.jpg`] }
const classroom = { id: 'att-2', name: 'classroom.png', thumbUrl: `${MEDIA}/u2/original.png`, sliceUrls: [`${MEDIA}/u2/s000.jpg`] }
const chibi = { id: 'att-3', name: 'chibi.png', thumbUrl: `${MEDIA}/u3/original.png`, sliceUrls: [`${MEDIA}/u3/s000.jpg`] }

const readySettings: ProjectSettings = { playtime: 30, genre: 'drama', subGenre: 'school', format: 'horizontal_16:9', tone: ['quiet'], targetEmotion: [], dialogueLanguage: 'ko' }

type FetchSpy = { mock: { calls: ReadonlyArray<ReadonlyArray<unknown>> } }
const chatCalls = (spy: FetchSpy) =>
  spy.mock.calls.filter((c) => c[0] === '/api/produce/chat').map((c) => JSON.parse(String((c[1] as RequestInit | undefined)?.body)))
const okChat = (reply = '카드를 채웠어요.') =>
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ reply }), { status: 200 }))

beforeEach(() => {
  useGlobalChatStore.getState().reset()
  useProducerStore.getState().reset()
  useProjectStore.getState().resetProject()
  useProjectStore.setState({ projectId: 'proj-1', currentStage: 'producer' })
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe('그림 역할 관문 — 채팅', () => {
  // 왜: 종전엔 올린 그림이 바로 채팅 모델로 가서 이야기 시드로 각색됐다. 쓰임새를 먼저 정해야 원본이 산다.
  it('그림을 올리면 그 턴은 모델로 보내지 않고 "이 그림을 어떻게 쓸까요" 선택지(인물·배경·참고 자료)를 먼저 띄운다', () => {
    const fetchSpy = okChat()
    const offered = useGlobalChatStore.getState().offerImageRoles([komatsu], { typed: '', msg: '그림을 올렸어요' })
    expect(offered).toBe(true)
    expect(chatCalls(fetchSpy)).toHaveLength(0)
    const s = useGlobalChatStore.getState().suggestion
    expect(s?.stage).toBe('producer')
    expect(s?.dismissible).toBe(false)
    expect(s?.action?.kind).toBe('choices')
    const labels = s?.action?.kind === 'choices' ? s.action.options.map((o) => o.label) : []
    expect(labels).toHaveLength(3)
    expect(matchImageRoleAnswer(labels[0])).toBe('character')
    expect(matchImageRoleAnswer(labels[1])).toBe('background')
    expect(matchImageRoleAnswer(labels[2])).toBe('reference')
  })

  // 왜: "이 인물로 해줘"처럼 뜻이 분명한데 또 물으면 성가시다. 짧고 분명한 말만 받는다.
  it('함께 쓴 말에 인물이나 배경이라고 적혀 있으면 묻지 않고 그 역할로 바로 쓴다', () => {
    expect(matchImageRoleInText('이 인물로 써줘')).toBe('character')
    expect(matchImageRoleInText('배경 사진이야')).toBe('background')
    expect(matchImageRoleInText('참고만 해줘')).toBe('reference')
    expect(matchImageRoleInText('use this as the main character')).toBe('character')
    // 길거나 두 역할이 섞이면 묻는다.
    expect(matchImageRoleInText('이 사진 속 인물이 배경 앞에 서 있는 장면으로 이야기를 만들어 줘')).toBeNull()
    expect(matchImageRoleInText('')).toBeNull()

    okChat()
    useGlobalChatStore.getState().offerImageRoles([komatsu], { typed: '이 인물로 써줘', msg: '이 인물로 써줘' })
    expect(useGlobalChatStore.getState().suggestion).toBeNull()
    expect(useProducerStore.getState().cast.map((c) => c.sourceImageUrl)).toEqual([komatsu.thumbUrl])
  })

  // 왜: 카드의 글 칸(외형)은 채팅이 그림을 보고 채워야 Writer 프롬프트가 쓸 수 있다. 줄거리를 짓는 것은 각색이라 막는다.
  it('인물로 쓰면 인물 카드가 생겨 그 그림이 붙고, 채팅은 그림을 보고 외형 설명만 채운다(줄거리를 만들지 않는다)', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          reply: '외형을 채웠어요.',
          extractedSettings: {
            storyText: '교복을 입은 소녀가 주인공인 이야기.',
            storyReady: true,
            genre: 'drama',
            characters: [{ name: '코마츠', entityType: 'person', appearance: '17세 여고생, 흑발 단발, 흰 셔츠와 리본' }],
            backgrounds: [{ name: '교실', visualDescription: '햇살 드는 교실', purpose: '일상' }],
          },
        }),
        { status: 200 },
      ),
    )
    useGlobalChatStore.getState().offerImageRoles([komatsu], { typed: '', msg: '그림을 올렸어요' })
    await useGlobalChatStore.getState().sendMessage('인물')
    await vi.waitFor(() => expect(chatCalls(fetchSpy)).toHaveLength(1))
    const body = chatCalls(fetchSpy)[0]
    const cast = useProducerStore.getState().cast
    expect(cast).toHaveLength(1)
    expect(body.cardFill).toEqual({ kind: 'character', ref: cast[0].localId })
    expect(body.attachmentImageUrls).toEqual(komatsu.sliceUrls)
    await vi.waitFor(() => expect(useProducerStore.getState().cast[0].appearance).toContain('여고생'))
    const p = useProducerStore.getState()
    expect(p.cast[0].name).toBe('코마츠')
    expect(p.cast[0].sourceImageUrl).toBe(komatsu.thumbUrl)
    // 줄거리·설정·다른 카드 제안은 버린다 — 이 턴은 카드 하나만 채운다.
    expect(p.storyText).toBe('')
    expect(p.projectSettings.genre).toBe('')
    expect(p.backgrounds).toHaveLength(0)
  })

  // 왜: 배경도 같은 이유 — 카드의 시각 설명·용도는 그림에서 읽어 채우고, 그림 자체는 나중에 그대로 와이드샷이 된다.
  it('배경으로 쓰면 배경 카드가 생겨 그 그림이 붙고, 채팅은 그림을 보고 시각 설명과 용도만 채운다', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          reply: '설명을 채웠어요.',
          extractedSettings: {
            storyText: '교실에서 벌어지는 이야기.',
            backgrounds: [{ name: '교실', visualDescription: '햇살이 커튼 사이로 드는 일본 고등학교 교실', purpose: '일상의 무대' }],
            characters: [{ name: '학생', entityType: 'person', appearance: '교복' }],
          },
        }),
        { status: 200 },
      ),
    )
    useGlobalChatStore.getState().offerImageRoles([classroom], { typed: '', msg: '그림을 올렸어요' })
    await useGlobalChatStore.getState().sendMessage('배경')
    await vi.waitFor(() => expect(chatCalls(fetchSpy)).toHaveLength(1))
    const body = chatCalls(fetchSpy)[0]
    const bg = useProducerStore.getState().backgrounds
    expect(bg).toHaveLength(1)
    expect(body.cardFill).toEqual({ kind: 'background', ref: bg[0].localId })
    await vi.waitFor(() => expect(useProducerStore.getState().backgrounds[0].visualDescription).toContain('교실'))
    const p = useProducerStore.getState()
    expect(p.backgrounds[0].name).toBe('교실')
    expect(p.backgrounds[0].purpose).toBe('일상의 무대')
    expect(p.backgrounds[0].sourceImageUrl).toBe(classroom.thumbUrl)
    expect(p.storyText).toBe('')
    expect(p.cast).toHaveLength(0)
  })

  // 왜: 레퍼런스는 지금 동작(화풍 앵커·이야기 제안)이 맞다. 그림과 사용자의 말이 종전 그대로 채팅에 간다.
  it('참고 자료로 쓰면 종전대로 그림을 채팅에 보내 화풍·이야기 제안을 받는다', async () => {
    const fetchSpy = okChat()
    useGlobalChatStore.getState().offerImageRoles([chibi], { typed: '이거 어때', msg: '이거 어때' })
    expect(useGlobalChatStore.getState().suggestion?.action?.kind).toBe('choices')
    await useGlobalChatStore.getState().sendMessage('참고 자료')
    await vi.waitFor(() => expect(chatCalls(fetchSpy)).toHaveLength(1))
    const body = chatCalls(fetchSpy)[0]
    expect(body.message).toBe('이거 어때')
    expect(body.attachmentImageUrls).toEqual(chibi.sliceUrls)
    expect(body.cardFill).toBeUndefined()
    expect(useProducerStore.getState().cast).toHaveLength(0)
    expect(useProducerStore.getState().backgrounds).toHaveLength(0)
  })

  // 왜: 인물 둘과 배경 하나를 한 번에 올려도 장마다 답이 다르다. 다 답한 뒤에 한꺼번에 처리한다.
  it('그림이 여러 장이면 한 장씩 차례로 묻고, 다 답한 뒤 장마다 정한 대로 쓴다', async () => {
    const fetchSpy = okChat()
    useGlobalChatStore.getState().offerImageRoles([komatsu, classroom, chibi], { typed: '', msg: '그림을 올렸어요' })
    const q1 = useGlobalChatStore.getState().suggestion
    expect(q1?.content).toContain('komatsu.png')
    await useGlobalChatStore.getState().sendMessage('인물')
    const q2 = useGlobalChatStore.getState().suggestion
    expect(q2?.content).toContain('classroom.png')
    expect(q2?.id).not.toBe(q1?.id)
    await useGlobalChatStore.getState().sendMessage('배경')
    expect(useGlobalChatStore.getState().suggestion?.content).toContain('chibi.png')
    await useGlobalChatStore.getState().sendMessage('참고 자료')
    expect(useGlobalChatStore.getState().suggestion).toBeNull()
    await vi.waitFor(() => expect(chatCalls(fetchSpy)).toHaveLength(3))
    const bodies = chatCalls(fetchSpy)
    expect(bodies.map((b: { cardFill?: { kind: string } }) => b.cardFill?.kind ?? 'reference')).toEqual(['character', 'background', 'reference'])
    expect(useProducerStore.getState().cast[0].sourceImageUrl).toBe(komatsu.thumbUrl)
    expect(useProducerStore.getState().backgrounds[0].sourceImageUrl).toBe(classroom.thumbUrl)
  })

  // 왜: 올린 그림이 조용히 사라지면 안 된다. 답이 아니면 다시 묻고 그림은 그대로 붙들어 둔다.
  it('선택지에 답하지 않고 다른 말을 하면 먼저 고르라고 하고 그림은 버리지 않는다', async () => {
    const fetchSpy = okChat()
    useGlobalChatStore.getState().offerImageRoles([komatsu], { typed: '', msg: '그림을 올렸어요' })
    await useGlobalChatStore.getState().sendMessage('오늘 날씨 좋다')
    expect(chatCalls(fetchSpy)).toHaveLength(0)
    const s = useGlobalChatStore.getState()
    expect(s.suggestion?.action?.kind).toBe('choices')
    expect(s.messages.at(-1)?.role).toBe('model')
    // 이어서 답하면 그 그림이 카드가 된다.
    await useGlobalChatStore.getState().sendMessage('인물')
    expect(useProducerStore.getState().cast[0]?.sourceImageUrl).toBe(komatsu.thumbUrl)
  })
})

describe('그림 역할 관문 — 넘김과 새로고침', () => {
  // 왜: 그림이 요청에 안 실리면 Artist 는 종전대로 글만 보고 새로 그린다.
  it('Writer 로 넘길 때 카드에 붙은 그림 주소가 인물·배경과 함께 실린다', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ runId: 'r1' }), { status: 200 }))
    useProducerStore.setState({
      storyText: '코마츠와 쿄타로의 방과 후.',
      storyReady: true,
      styleAnchorKey: 'style_a',
      projectSettings: readySettings,
      cast: [{ localId: 'c1', name: '코마츠', entityType: 'person', appearance: '여고생', origin: 'producer', sourceImageUrl: komatsu.thumbUrl }],
      backgrounds: [{ localId: 'b1', name: '교실', visualDescription: '햇살 드는 교실', purpose: '일상', origin: 'producer', userEdited: false, sourceImageUrl: classroom.thumbUrl }],
    })
    const ok = await useProducerStore.getState().saveAndHandoff()
    expect(ok).toBe(true)
    const call = fetchSpy.mock.calls.find((c) => c[0] === '/api/writer/start')!
    const body = JSON.parse(String((call[1] as RequestInit).body))
    expect(body.cast.characters[0].source_image_url).toBe(komatsu.thumbUrl)
    expect(body.backgrounds.locations[0].source_image_url).toBe(classroom.thumbUrl)
  })

  // 왜: 보드는 새로고침하면 저장된 초안에서 되살아난다. 그림이 초안에 없으면 카드만 남고 그림은 사라진다.
  it('새로고침해도 카드에 붙은 그림은 남는다', () => {
    const raw = {
      version: 1,
      savedAt: 1,
      storyText: '',
      storyReady: false,
      settings: readySettings,
      cast: [{ localId: 'c1', name: '코마츠', entityType: 'person', appearance: '', sourceImageUrl: komatsu.thumbUrl }],
      backgrounds: [{ localId: 'b1', name: '교실', visualDescription: '', purpose: '', sourceImageUrl: classroom.thumbUrl }],
    }
    const draft = parseProducerDraft(raw)
    const restored = mergeDraftWithDb(draft, { storyText: '', storyReady: false, settings: readySettings, cast: [], backgrounds: [] })
    expect(restored.cast[0].sourceImageUrl).toBe(komatsu.thumbUrl)
    expect(restored.backgrounds[0].sourceImageUrl).toBe(classroom.thumbUrl)
  })
})

describe('그림 역할 관문 — 서버와 화면 연결', () => {
  // 왜: 서버 프롬프트도 같은 결정을 알아야 모델이 줄거리나 다른 카드를 지어내지 않는다. 화면 쪽 좁히기(coerceCardFill)가 최종 방어이고 이건 1차.
  it('채팅 서버는 카드 채우기 턴에 그 카드 하나만 채우라고 알린다', async () => {
    const { imageCardFillDirective } = await import('@/app/api/produce/chat/preserve-context')
    const d = imageCardFillDirective({ kind: 'character', ref: 'cast-1' })
    expect(d).toMatch(/fill ONLY that card/i)
    expect(d).toContain('"cast-1"')
    expect(d).toMatch(/Do not emit storyText/)
    expect(imageCardFillDirective({ kind: 'background', ref: 'bg-1' })).toMatch(/visualDescription/)
    expect(imageCardFillDirective({ kind: 'shot', ref: 'x' })).toBeNull()
    expect(imageCardFillDirective(null)).toBeNull()
    const { readFileSync } = await import('node:fs')
    expect(readFileSync('src/app/api/produce/chat/route.ts', 'utf8')).toMatch(/imageCardFillDirective\(/)
    // 채팅 화면은 Producer 에서 올린 그림을 관문에 먼저 넘긴다.
    expect(readFileSync('src/components/layout/global-chat.tsx', 'utf8')).toMatch(/offerImageRoles\(/)
  })
})
