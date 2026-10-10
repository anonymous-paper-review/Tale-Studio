// 새 프로젝트에서 올린 그림과 채팅으로 나중에 올린 그림은 같은 기능으로 처리하고, "스타일로 반영해줘"는 그림체로 읽는다 (2026-10-10 오너)
import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/chat-persistence', () => ({ saveChatMessage: vi.fn(), saveChatTrace: vi.fn(), saveChatTracePatch: vi.fn(), loadLatestChatTrace: vi.fn() }))
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ from: () => ({ update: () => ({ eq: async () => ({ error: null }) }) }) }),
  createCatalogClient: vi.fn(),
}))

import { useGlobalChatStore as chat } from '@/stores/global-chat-store'
import { useProducerStore as producer } from '@/stores/producer-store'
import { useProjectStore as project } from '@/stores/project-store'
import { useChatUiStore } from '@/stores/chat-ui-store'
import { useLocaleStore } from '@/stores/locale-store'
import { translate } from '@/lib/i18n'
import { matchImageUseAnswer, matchImageUseInText } from '@/lib/producer/image-role'
import type { PendingCreation } from '@/stores/pending-creation-store'

const MEDIA = 'https://example.supabase.co/storage/v1/object/public/media/ws-1/proj-1/uploads'
const img = (name: string) => ({ id: name, name, thumbUrl: `${MEDIA}/${name}/original.webp`, sliceUrls: [`${MEDIA}/${name}/s000.jpg`, `${MEDIA}/${name}/s001.jpg`] })
const LOOK = img('look.png'), FACE = img('face.png'), PLACE = img('place.png'), NOTE = img('note.png'), P1 = img('comic_1.webp'), P2 = img('comic_2.webp')
const SCRIPT = 'S#1. 방 - 낮\n남자: 왔어.\n여자: 응.\n남자: 가자.'
const ko = (text: string) => translate('ko', text)
const plan = (over: Partial<PendingCreation>): PendingCreation => ({
  locale: 'ko', original: null, comicPages: [], comicStyle: null, styleImage: null, cards: [], references: [], note: null, startTreatment: false, ...over,
})

let fetchMock: ReturnType<typeof vi.fn>
const calls = (url: string) => fetchMock.mock.calls.filter(([u]) => String(u) === url).map(([, init]) => JSON.parse(String((init as RequestInit | undefined)?.body ?? '{}')))
function stub() {
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : {}
    if (url === '/api/produce/comic-script') return Response.json({ script: SCRIPT, stats: { scenes: 1, dialogue_lines: 3 } })
    if (url === '/api/produce/anchor-medium') return Response.json({ medium: '2d_anime' })
    if (url === '/api/produce/style-anchor') return Response.json({ key: 'custom_new', imageUrl: body.imageUrl, label: body.label, medium: body.medium, ...(body.lock ? { locked: true } : {}) })
    if (url === '/api/produce/style-facets') return Response.json({ ok: true, facets: true, figure: true })
    if (url === '/api/produce/chat') return Response.json({ reply: '카드를 채웠어요.' })
    return Response.json({ ok: true })
  })
  vi.stubGlobal('fetch', fetchMock)
}
function fresh() {
  project.getState().resetProject()
  producer.getState().reset()
  chat.getState().reset()
  useChatUiStore.setState({ stylePickerRequest: null })
  project.setState({ projectId: 'proj-1', currentStage: 'producer', reachedStage: 'producer' })
  stub()
}
const answer = (text: string) => chat.getState().sendMessage(text)

/** 한 번의 흐름이 한 일 — 그림체(매체 · 고정 · 분석) · 대본 옮기기 · 채팅으로 보낸 그림. 함께 도는 일은 순서가 섞일 수 있어 정렬해 견준다. */
function work(): string[] {
  return fetchMock.mock.calls.flatMap(([u, init]) => {
    const url = String(u)
    const b = (init as RequestInit | undefined)?.body ? JSON.parse(String((init as RequestInit).body)) : {}
    if (url === '/api/produce/anchor-medium') return [`매체 고르기 ${b.imageUrl}`]
    if (url === '/api/produce/style-anchor') return [`그림체 ${b.imageUrl} 고정=${b.lock === true}`]
    if (url === '/api/produce/style-facets') return ['그림체 분석']
    if (url === '/api/produce/comic-script') return [`대본 옮기기 ${(b.pages as Array<{ urls: string[] }>).map((p) => p.urls.join('+')).join(' | ')}`]
    if (url === '/api/produce/chat') return [`채팅 ${((b.attachmentImageUrls as string[] | undefined) ?? []).join('+')}`]
    return []
  }).sort()
}
const cards = () => ({
  cast: producer.getState().cast.map((c) => c.sourceImageUrl ?? null),
  backgrounds: producer.getState().backgrounds.map((b) => b.sourceImageUrl ?? null),
  style: producer.getState().customStyleAnchor ? { url: producer.getState().customStyleAnchor?.url, locked: producer.getState().customStyleAnchor?.locked === true } : null,
})

beforeEach(() => {
  useLocaleStore.setState({ locale: 'ko' })
  fresh()
})
afterEach(() => {
  vi.unstubAllGlobals()
  useLocaleStore.setState({ locale: 'en' })
})

describe('그림과 함께 쓴 "스타일"', () => {
  it('채팅에 그림 한 장을 붙이고 "스타일로 반영해줘"라고 하면 묻지 않고 그림체로 받아 고정하고 그림체 분석기로 분석한다', async () => {
    // 왜: 10/10 운영 806e2cc2 — "스타일"을 참고 자료로 읽어 채팅 모델이 그림체를 정하는 예전 길로 가는 바람에 고정도 분석도 되지 않았다.
    chat.getState().offerImageRoles([LOOK], { typed: '스타일로 반영해줘', msg: '스타일로 반영해줘' })
    expect(chat.getState().imageRoleGate).toBeNull()
    await vi.waitFor(() => expect(calls('/api/produce/style-facets')).toHaveLength(1))
    expect(calls('/api/produce/style-anchor')[0]).toMatchObject({ imageUrl: LOOK.thumbUrl, lock: true })
    expect(producer.getState().customStyleAnchor?.locked).toBe(true)
    expect(calls('/api/produce/chat')).toHaveLength(0)
  })

  it('"스타일 참고만 해줘"처럼 참고가 함께 있으면 그림체로 정하지 않고 참고 자료로 보낸다', async () => {
    // 정상 경로 고정 — 참고 자료는 사용자의 말과 함께 채팅으로 간다.
    chat.getState().offerImageRoles([LOOK], { typed: '스타일 참고만 해줘', msg: '스타일 참고만 해줘' })
    await vi.waitFor(() => expect(calls('/api/produce/chat')).toHaveLength(1))
    expect(calls('/api/produce/chat')[0].attachmentImageUrls).toEqual(LOOK.sliceUrls)
    expect(calls('/api/produce/style-anchor')).toHaveLength(0)
  })

  it('질문에 "스타일"이라고 답하거나 영어로 "use this style"이라고 써도 그림체로 받는다', () => {
    // 왜: 화면 말은 "그림체"지만 사람들은 "스타일"이라고도 쓴다. 영어 화면도 같은 규칙이다.
    expect(matchImageUseAnswer('스타일')).toBe('style')
    expect(matchImageUseAnswer('스타일로 써 주세요')).toBe('style')
    expect(matchImageUseInText('use this style')).toBe('style')
    expect(matchImageUseInText('style reference only')).toBe('reference')
  })

  it('"이 스타일 어때?"처럼 묻는 말이면 그림체로 정하지 않고 그 말과 함께 채팅으로 보낸다', async () => {
    // 왜: 그림체로 고르면 고정돼 되돌릴 수 없다. 의견을 묻는 말을 고른 것으로 읽으면 안 된다.
    expect(matchImageUseInText('이 스타일 어때?')).not.toBe('style')
    expect(matchImageUseInText('이 그림체 괜찮아?')).not.toBe('style')
    chat.getState().offerImageRoles([LOOK], { typed: '이 스타일 어때?', msg: '이 스타일 어때?' })
    await vi.waitFor(() => expect(calls('/api/produce/chat')).toHaveLength(1))
    expect(calls('/api/produce/style-anchor')).toHaveLength(0)
  })

  it('채팅에서 말로 그림체를 고르면 그림마다 질문의 안내를 본 것이 아니라 말로 고른 것으로 남긴다', async () => {
    // 왜: 분석 모델로 보낸다는 안내는 질문에 실려 있다. 질문 없이 말로 골랐으면 그 사실대로 남겨야 기록이 맞다.
    chat.getState().offerImageRoles([LOOK], { typed: '이 그림체로 해줘', msg: '이 그림체로 해줘' })
    await vi.waitFor(() => expect(calls('/api/produce/style-facets')).toHaveLength(1))
    expect(calls('/api/produce/anchor-medium')[0]).toMatchObject({ consent: 'chat-style-request-v1' })
    expect(calls('/api/produce/style-facets')[0]).toMatchObject({ consent: 'chat-style-request-v1' })
  })
})

describe('새 프로젝트와 채팅은 같은 기능', () => {
  it('새 프로젝트와 채팅에서 그림체로 고른 그림은 같은 일을 한다: 매체를 고르고 고정한 뒤 분석한다', async () => {
    // 왜: 10/10 오너 "프로젝트 생성 시 입력하는 플로우랑 채팅으로 나중에 입력하는 플로우 모두 똑같은 기능으로 관리해줘".
    await chat.getState().runCreationPlan(plan({ styleImage: LOOK }))
    const fromNew = { work: work(), cards: cards() }
    fresh()
    chat.getState().offerImageRoles([LOOK], { typed: '', msg: '그림을 올렸어요' })
    await answer(ko('Use it as the art style'))
    await vi.waitFor(() => expect(calls('/api/produce/style-facets')).toHaveLength(1))
    expect({ work: work(), cards: cards() }).toEqual(fromNew)
    expect(fromNew.cards.style).toEqual({ url: LOOK.thumbUrl, locked: true })
  })

  it('새 프로젝트와 채팅에서 인물 · 배경으로 고른 그림은 같은 카드를 만들고 같은 그림으로 채운다', async () => {
    // 왜: 같은 그림을 같은 쓰임새로 골랐으면 어디서 올렸든 카드가 같아야 한다.
    await chat.getState().runCreationPlan(plan({ cards: [{ image: FACE, role: 'character' }, { image: PLACE, role: 'background' }] }))
    const fromNew = { work: work(), cards: cards() }
    fresh()
    chat.getState().offerImageRoles([FACE, PLACE], { typed: '', msg: '그림을 올렸어요' })
    await answer(ko('I will decide for each picture'))
    await answer(ko('Use it as a character'))
    await answer(ko('Use it as a background'))
    await vi.waitFor(() => expect(calls('/api/produce/chat')).toHaveLength(2))
    expect({ work: work(), cards: cards() }).toEqual(fromNew)
    expect(fromNew.cards).toMatchObject({ cast: [FACE.thumbUrl], backgrounds: [PLACE.thumbUrl] })
  })

  it('새 프로젝트와 채팅에서 참고 자료로 고른 그림은 같은 그림을 채팅으로 보낸다', async () => {
    // 왜: 참고 자료는 그림체도 카드도 아니다 — 어디서 올렸든 채팅에 그림만 함께 간다.
    await chat.getState().runCreationPlan(plan({ references: [NOTE] }))
    const fromNew = work()
    fresh()
    chat.getState().offerImageRoles([NOTE], { typed: '', msg: '그림을 올렸어요' })
    await answer(ko('Use it as reference only'))
    await vi.waitFor(() => expect(calls('/api/produce/chat')).toHaveLength(1))
    expect(work()).toEqual(fromNew)
    expect(fromNew).toEqual([`채팅 ${NOTE.sliceUrls.join('+')}`])
  })

  it('새 프로젝트와 채팅에서 만화 원고로 고르고 그림체 고정을 고르면 같은 일을 한다: 대본으로 옮기고 첫 쪽 그림체로 고정 · 분석한다', async () => {
    // 왜: 만화를 새 프로젝트에서 올리든 채팅으로 올리든 대본과 그림체가 같게 나와야 한다.
    await chat.getState().runCreationPlan(plan({ original: 'comic', comicPages: [P1, P2], comicStyle: 'lock' }))
    await vi.waitFor(() => expect(calls('/api/produce/style-facets')).toHaveLength(1))
    const fromNew = { work: work(), cards: cards() }
    fresh()
    chat.getState().offerImageRoles([P1, P2], { typed: '', msg: '그림을 올렸어요' })
    await answer(ko('Turn my comic pages into video exactly as drawn'))
    await answer(ko('Keep the comic art style and fix it'))
    await vi.waitFor(() => expect(calls('/api/produce/style-facets')).toHaveLength(1))
    await vi.waitFor(() => expect(calls('/api/produce/chat')).toHaveLength(1))
    expect({ work: work(), cards: cards() }).toEqual(fromNew)
    expect(fromNew.cards.style).toEqual({ url: P1.thumbUrl, locked: true })
  })

  it('새 프로젝트 · 채팅 · 스타일 선택 창은 그림 쓰임새를 한 곳에서 처리한다', () => {
    // 왜: 같은 일을 하는 길이 여럿이면 한쪽만 고쳐져 어긋난다(이번 "스타일" 사고). 그림체 · 만화 · 카드를 정하는 일은 한 곳에서만 부른다.
    const source = readFileSync('src/stores/global-chat-store.ts', 'utf8')
    const callers = (callee: string) => {
      const names: string[] = []
      for (const m of source.matchAll(new RegExp(`\\b${callee}\\(`, 'g'))) {
        if (/function\s+$/.test(source.slice(Math.max(0, m.index - 20), m.index))) continue // 정의
        // 감싼 함수 — 맨 앞 함수 선언 또는 스토어 메서드("  이름: async (...) => {"). 인자 줄("  get: () => …,")은 아니다.
        const decls = [...source.slice(0, m.index).matchAll(/\n(?:async )?function (\w+)\(|\n {2}(\w+): (?:async )?\([^\n]*\) => \{[^\S\n]*\n/g)]
        const last = decls[decls.length - 1]
        names.push(last ? (last[1] ?? last[2]) : '?')
      }
      return [...new Set(names)].sort()
    }
    expect(callers('runMaterialPlan')).toEqual(expect.arrayContaining(['runChatImagePlan', 'runCreationPlan']))
    expect(callers('runStyleFromImage')).toEqual(['runComicAdaptation', 'runMaterialPlan'])
    expect(callers('runImageRolePlan')).toEqual(['runMaterialPlan'])
    expect(callers('runComicAdaptation')).toEqual(['retryComicScript', 'runMaterialPlan'])
  })
})
