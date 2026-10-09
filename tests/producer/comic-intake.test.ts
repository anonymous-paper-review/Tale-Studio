// 만화 원고 여러 장을 올리면 한 번에 쓰임새를 묻고, "만화 원고로 그대로 영상화"를 고르면 대본 · 그림체까지 이어진다 (2026-10-09 오너)
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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
import { useLocaleStore } from '@/stores/locale-store'
import {
  MAX_COMIC_PAGES,
  imageBatchQuestion,
  matchBatchImageAnswer,
  matchComicAnswer,
  matchComicIntentInText,
  sortComicPages,
} from '@/lib/producer/comic-intake'

const MEDIA = 'https://example.supabase.co/storage/v1/object/public/media/ws-1/proj-1/uploads'
const page = (n: number) => ({ id: `att-${n}`, name: `comic_${n}.webp`, thumbUrl: `${MEDIA}/p${n}/original.webp`, sliceUrls: [`${MEDIA}/p${n}/s000.jpg`] })
const p1 = page(1)
const p2 = page(2)
const p10 = page(10)
const SCRIPT = 'S#1. 원룸 - 낮\n남자가 노트북 앞에서 기지개를 켠다.\n남자: 오늘은 진짜 끝낸다.\n\n소녀가 턱을 괴고 남자를 본다.\n소녀: 정말?'

type Routes = Record<string, (body: Record<string, unknown>) => Response | Promise<Response>>
function mockApi(routes: Routes) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input)
    const body = init?.body ? JSON.parse(String(init.body)) : {}
    const handler = routes[url]
    return handler ? handler(body) : new Response(JSON.stringify({ reply: '알겠어요.' }), { status: 200 })
  })
}
const calls = (spy: { mock: { calls: ReadonlyArray<ReadonlyArray<unknown>> } }, url: string) =>
  spy.mock.calls.filter((c) => c[0] === url).map((c) => JSON.parse(String((c[1] as RequestInit | undefined)?.body ?? '{}')))
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status })
const comicRoutes = (over: Partial<Routes> = {}): Routes => ({
  '/api/produce/comic-script': () => json({ script: SCRIPT, stats: { scenes: 1, dialogue_lines: 2, action_blocks: 2, characters: 2 } }),
  '/api/produce/style-anchor': (b) => json({ key: 'custom_abc', imageUrl: b.imageUrl, label: b.label, medium: null }),
  '/api/produce/style-facets': () => json({ ok: true, facets: true, figure: true }),
  '/api/produce/chat': () => json({ reply: '카드를 채웠어요.' }),
  ...over,
})

beforeEach(() => {
  useGlobalChatStore.getState().reset()
  useProducerStore.getState().reset()
  useProjectStore.getState().resetProject()
  useProjectStore.setState({ projectId: 'proj-1', currentStage: 'producer' })
  // 채팅 문구는 화면 언어를 따른다(잠기지 않은 프로젝트) — 한국어 문장으로 확인한다.
  useLocaleStore.setState({ locale: 'ko' })
})
afterEach(() => vi.restoreAllMocks())

describe('만화 원고 알아보기', () => {
  it('그림과 함께 짧게 만화 원고라고 말하면 묻지 않고 만화로 받는다', () => {
    // 왜: "내가 준 만화를 영상화하고 싶어"라고 했는데 인물 · 배경 · 참고만 되풀이해 물었다(10/9 운영 comic_1).
    expect(matchComicIntentInText('내가 준 만화를 영상화하고 싶어')).toBe(true)
    expect(matchComicIntentInText('웹툰 원고야')).toBe(true)
    expect(matchComicIntentInText('turn this comic into a video')).toBe(true)
    // 인물 · 참고 낱말이 섞이거나 길면 묻는다.
    expect(matchComicIntentInText('만화 캐릭터야')).toBe(false)
    expect(matchComicIntentInText('이 만화는 참고만 해')).toBe(false)
    expect(matchComicIntentInText('이 만화의 분위기를 살려서 전혀 다른 이야기로 만들어 주면 좋겠어 고마워')).toBe(false)
    expect(matchComicIntentInText('이 사진으로 이야기 만들어 줘')).toBe(false)
  })

  it('쓰임새 질문에 스토리 · 만화 · 원작으로 답하면 만화 원고로 받는다', () => {
    // 왜: 질문에 "스토리"라고 답해도 같은 질문만 다시 나왔다(10/9 운영 comic_1).
    expect(matchComicAnswer('스토리')).toBe(true)
    expect(matchComicAnswer('내가 준 만화를 영상화하고 싶어')).toBe(true)
    expect(matchComicAnswer('원작이야')).toBe(true)
    expect(matchComicAnswer('인물')).toBe(false)
    expect(matchComicAnswer('참고 자료')).toBe(false)
    expect(matchComicAnswer('오늘 날씨 좋다')).toBe(false)
  })

  it('쪽 순서는 파일 이름의 숫자 순서로 읽는다', () => {
    // 왜: 이름순으로만 놓으면 comic_10 이 comic_2 앞에 온다.
    expect(sortComicPages([p10, p2, p1]).map((p) => p.name)).toEqual(['comic_1.webp', 'comic_2.webp', 'comic_10.webp'])
    expect(MAX_COMIC_PAGES).toBe(20)
  })
})

describe('여러 장을 한 번에 묻기', () => {
  it('그림을 여러 장 올리면 쓰임새를 한 번에 묻고 선택지에 만화 원고로 그대로 영상화가 있다', () => {
    // 왜: 만화 8쪽을 올렸더니 그림마다 8번 물었고, 그중에 이야기 원작으로 쓰는 선택지가 없었다.
    const spy = mockApi(comicRoutes())
    const offered = useGlobalChatStore.getState().offerImageRoles([p1, p2], { typed: '', msg: '그림을 올렸어요' })
    expect(offered).toBe(true)
    expect(calls(spy, '/api/produce/chat')).toHaveLength(0)
    const s = useGlobalChatStore.getState().suggestion
    expect(s?.dismissible).toBe(false)
    const labels = s?.action?.kind === 'choices' ? s.action.options.map((o) => o.label) : []
    expect(labels).toEqual(imageBatchQuestion('ko', 2).options.map((o) => o.label))
    expect(labels.map(matchBatchImageAnswer)).toEqual(['comic', 'each', 'reference'])
  })

  it('만화 원고를 고르면 그림을 분석 모델로 보낸다는 안내가 질문에 함께 있다', () => {
    // 왜: 대본 옮기기와 그림체 분석은 그림을 분석 모델에 보내는 일이다 — 고르기 전에 알려야 한다.
    expect(imageBatchQuestion('ko', 8).content).toContain('8')
    expect(imageBatchQuestion('ko', 8).content).toMatch(/분석 모델/)
    expect(imageBatchQuestion('en', 8).content).toMatch(/analysis model/)
  })

  it('그림마다 정하기를 고르면 종전처럼 한 장씩 인물 · 배경 · 참고 자료를 묻는다', async () => {
    mockApi(comicRoutes())
    useGlobalChatStore.getState().offerImageRoles([p2, p1], { typed: '', msg: '그림을 올렸어요' })
    await useGlobalChatStore.getState().sendMessage('그림마다 정할게')
    expect(useGlobalChatStore.getState().suggestion?.content).toContain('comic_2.webp')
  })

  it('모두 참고 자료로 고르면 그림 전부를 종전대로 채팅에 보낸다', async () => {
    const spy = mockApi(comicRoutes())
    useGlobalChatStore.getState().offerImageRoles([p1, p2], { typed: '', msg: '그림을 올렸어요' })
    await useGlobalChatStore.getState().sendMessage('모두 참고 자료로')
    await vi.waitFor(() => expect(calls(spy, '/api/produce/chat')).toHaveLength(1))
    expect(calls(spy, '/api/produce/chat')[0].attachmentImageUrls).toEqual([...p1.sliceUrls, ...p2.sliceUrls])
    expect(calls(spy, '/api/produce/comic-script')).toHaveLength(0)
  })
})

describe('만화 원고로 그대로 영상화', () => {
  it('만화 원고로 그대로 영상화를 고르면 쪽 순서대로 대본 옮기기를 요청한다', async () => {
    const spy = mockApi(comicRoutes())
    useGlobalChatStore.getState().offerImageRoles([p10, p2, p1], { typed: '', msg: '그림을 올렸어요' })
    await useGlobalChatStore.getState().sendMessage('만화 원고를 그대로 영상화해 줘')
    await vi.waitFor(() => expect(calls(spy, '/api/produce/comic-script')).toHaveLength(1))
    const body = calls(spy, '/api/produce/comic-script')[0]
    expect(body.projectId).toBe('proj-1')
    expect(body.pages.map((p: { name: string }) => p.name)).toEqual(['comic_1.webp', 'comic_2.webp', 'comic_10.webp'])
    expect(body.pages[0].urls).toEqual(p1.sliceUrls)
  })

  it('옮긴 대본은 대본 그대로 쓰기로 이야기에 들어가고, 인물 · 배경 카드는 대본과 만화 그림을 보고 채운다', async () => {
    // 왜: 각색하지 않고 Writer 에 넘기려면 대본 그대로 쓰기(#script-preserve)를 켜야 한다. 외모는 글보다 그림이 정확하다.
    const spy = mockApi(comicRoutes())
    useGlobalChatStore.getState().offerImageRoles([p1, p2], { typed: '내 만화를 영상화해 줘', msg: '내 만화를 영상화해 줘' })
    await vi.waitFor(() => expect(useProducerStore.getState().preserveScript).toBe(true))
    expect(useProducerStore.getState().storyText).toBe(SCRIPT)
    await vi.waitFor(() => expect(calls(spy, '/api/produce/chat')).toHaveLength(1))
    const fill = calls(spy, '/api/produce/chat')[0]
    expect(fill.attachmentImageUrls).toEqual([...p1.sliceUrls, ...p2.sliceUrls])
    expect(String(fill.message)).toMatch(/그대로|exactly as written/)
  })

  it('만화 원고로 그대로 영상화를 고르면 첫 쪽을 이 프로젝트 그림체로 정하고 그림체를 분석한다', async () => {
    // 왜: 그대로 영상화는 그림체까지 원작을 따른다 — 분석기(facet)로 그림체 설명을 만들어 생성에 싣는다(오너 10/9).
    const spy = mockApi(comicRoutes())
    useGlobalChatStore.getState().offerImageRoles([p2, p1], { typed: '내 만화를 영상화해 줘', msg: '내 만화를 영상화해 줘' })
    await vi.waitFor(() => expect(calls(spy, '/api/produce/style-facets')).toHaveLength(1))
    expect(calls(spy, '/api/produce/style-anchor')[0].imageUrl).toBe(p1.thumbUrl)
    expect(calls(spy, '/api/produce/style-facets')[0]).toMatchObject({ projectId: 'proj-1', consent: 'comic-choice-v1' })
    expect(useProducerStore.getState().styleAnchorKey).toBe('custom_abc')
  })

  it('그림마다 묻는 질문에 스토리라고 답해도 만화 원고로 받는다', async () => {
    const spy = mockApi(comicRoutes())
    useGlobalChatStore.getState().offerImageRoles([p1], { typed: '', msg: '그림을 올렸어요' })
    await useGlobalChatStore.getState().sendMessage('스토리')
    await vi.waitFor(() => expect(calls(spy, '/api/produce/comic-script')).toHaveLength(1))
    expect(useGlobalChatStore.getState().imageRoleGate).toBeNull()
  })

  it('대본으로 옮기지 못하면 이야기는 그대로 두고 채팅에 알린다', async () => {
    // 왜: 실패를 조용히 넘기면 빈 이야기로 넘어간다.
    mockApi(comicRoutes({ '/api/produce/comic-script': () => json({ error: 'comic_script_failed' }, 502) }))
    useProducerStore.setState({ storyText: '이전 이야기' })
    useGlobalChatStore.getState().offerImageRoles([p1, p2], { typed: '내 만화를 영상화해 줘', msg: '내 만화를 영상화해 줘' })
    await vi.waitFor(() => expect(useGlobalChatStore.getState().messages.some((m) => /대본으로 옮기지 못했어요/.test(m.content))).toBe(true))
    expect(useProducerStore.getState().storyText).toBe('이전 이야기')
    expect(useProducerStore.getState().preserveScript).not.toBe(true)
  })

  it('그림체 분석이 실패해도 만화 그림은 그림체로 남고 채팅에 알린다', async () => {
    // 왜: 분석은 덤이다 — 실패해도 앵커 그림만으로 생성은 이어진다(인계 lite 계약).
    mockApi(comicRoutes({ '/api/produce/style-facets': () => json({ ok: false, facets: false }, 200) }))
    useGlobalChatStore.getState().offerImageRoles([p1, p2], { typed: '내 만화를 영상화해 줘', msg: '내 만화를 영상화해 줘' })
    await vi.waitFor(() => expect(useGlobalChatStore.getState().messages.some((m) => /그림체 분석/.test(m.content) && /그림만/.test(m.content))).toBe(true))
    expect(useProducerStore.getState().styleAnchorKey).toBe('custom_abc')
  })
})
