// 새 프로젝트에서 올린 그림을 "그림체"로 고르면(그림체 추출) 그 그림체로 고정돼 Producer 에서 스타일을 바꿀 수 없다 (2026-10-09 오너)
import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const db = vi.hoisted(() => ({ writes: [] as Array<Record<string, unknown>> }))
vi.mock('@/lib/chat-persistence', () => ({ saveChatMessage: vi.fn(), saveChatTrace: vi.fn(), saveChatTracePatch: vi.fn(), loadLatestChatTrace: vi.fn() }))
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => ({
      update: (patch: Record<string, unknown>) => {
        db.writes.push(patch)
        const done = { error: null, data: null }
        return { eq: () => Object.assign(Promise.resolve(done), { select: () => ({ single: async () => done }) }) }
      },
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
    }),
  }),
  createCatalogClient: vi.fn(),
}))

import { useProducerStore as producer } from '@/stores/producer-store'
import { useProjectStore as project } from '@/stores/project-store'
import { useGlobalChatStore as chat } from '@/stores/global-chat-store'
import { useLocaleStore } from '@/stores/locale-store'
import { translate } from '@/lib/i18n'
import type { PendingCreation } from '@/stores/pending-creation-store'

const LOOK = { id: 'look', name: 'look.png', thumbUrl: 'https://img.test/look.png', sliceUrls: ['https://img.test/look-1.jpg'] }
const PAGE = { id: 'p1', name: 'comic_1.webp', thumbUrl: 'https://img.test/p1.webp', sliceUrls: ['https://img.test/p1-1.jpg'] }
const LOCKED = { url: LOOK.thumbUrl, label: '내 그림체', medium: '2d_anime', locked: true }
const REASON = /바꿀 수 없어요/
const plan = (over: Partial<PendingCreation>): PendingCreation => ({
  locale: 'ko', original: null, comicPages: [], comicStyle: null, styleImage: null, cards: [], references: [], note: null, startTreatment: false, ...over,
})

type Routes = Record<string, (body: Record<string, unknown>) => Response>
let fetchMock: ReturnType<typeof vi.fn>
const calls = (url: string) => fetchMock.mock.calls.filter(([u]) => String(u) === url).map(([, init]) => JSON.parse(String((init as RequestInit | undefined)?.body ?? '{}')))
function stub(over: Routes = {}) {
  const routes: Routes = {
    '/api/produce/anchor-medium': () => Response.json({ medium: '2d_anime' }),
    '/api/produce/style-anchor': (b) => Response.json({ key: 'custom_new', imageUrl: b.imageUrl, label: b.label, medium: b.medium, ...(b.lock === true ? { locked: true } : {}) }),
    '/api/produce/style-facets': () => Response.json({ ok: true, facets: true, figure: true }),
    '/api/produce/comic-script': () => Response.json({ script: 'S#1. 방 - 낮\n남자: 왔어.\n여자: 응.\n남자: 가자.', stats: { scenes: 1, dialogue_lines: 3 } }),
    '/api/produce/chat': () => Response.json({ reply: '카드를 채웠어요.' }),
    ...over,
  }
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const handler = routes[String(url)]
    return handler ? handler(init?.body ? JSON.parse(String(init.body)) : {}) : Response.json({ ok: true })
  })
  vi.stubGlobal('fetch', fetchMock)
}

beforeEach(() => {
  db.writes.length = 0
  project.getState().resetProject()
  producer.getState().reset()
  chat.getState().reset()
  project.setState({ projectId: 'proj-1', currentStage: 'producer', reachedStage: 'producer' })
  useLocaleStore.setState({ locale: 'ko' })
})
afterEach(() => {
  vi.unstubAllGlobals()
  useLocaleStore.setState({ locale: 'en' })
})

describe('그림체 추출로 정한 그림체는 고정된다', () => {
  it('새 프로젝트에서 그림을 그림체로 고르면 그 그림체는 고정으로 저장된다', async () => {
    // 왜: 사용자가 고른 그림의 그림체를 바탕으로 작업을 쌓는다 — 다른 스타일로 바뀌면 그 위에 쌓은 것이 어긋난다(10/9 오너).
    stub()
    await chat.getState().runCreationPlan(plan({ styleImage: LOOK }))
    expect(calls('/api/produce/style-anchor')[0]).toMatchObject({ imageUrl: LOOK.thumbUrl, lock: true })
    expect(producer.getState().customStyleAnchor?.locked).toBe(true)
  })

  it('그림체 분석이 실패해도 그림체 고정은 그대로다', async () => {
    // 왜: 고른 것은 그림이고 분석은 덤이다 — 분석이 실패해도 그림체는 그 그림이다.
    stub({ '/api/produce/style-facets': () => Response.json({ ok: false, facets: false }) })
    await chat.getState().runCreationPlan(plan({ styleImage: LOOK }))
    expect(producer.getState().customStyleAnchor?.locked).toBe(true)
  })

  // 2026-10-09 오너 결정 "그림체로 고정할지 실사와 같은 각색을 할지 물어봐줘" — 앞 문장: "만화 원고의 첫 쪽으로 저절로 정해진 그림체는 고정하지 않는다".
  //   이제 저절로 정해지는 그림체가 없다: 고정을 고르면 고정, 각색을 고르면 만화 그림을 그림체로 쓰지 않는다.
  it('만화 원고에서 그림체 고정을 고르면 첫 쪽 그림체로 고정된다', async () => {
    stub()
    await chat.getState().runCreationPlan(plan({ original: 'comic', comicPages: [PAGE], comicStyle: 'lock' }))
    await vi.waitFor(() => expect(calls('/api/produce/style-facets')).toHaveLength(1))
    expect(calls('/api/produce/style-anchor')[0]).toMatchObject({ imageUrl: PAGE.thumbUrl, lock: true })
    expect(producer.getState().customStyleAnchor?.locked).toBe(true)
  })
})

describe('고정된 그림체는 Producer 에서 바꿀 수 없다', () => {
  beforeEach(() => {
    producer.setState({
      styleAnchorKey: 'custom_look',
      customStyleAnchor: LOCKED,
      styleAnchors: [{ key: 'real', label: '실사', medium: 'live_action', imageUrl: '', previewUrl: null, subtitle: null }],
    } as never)
  })

  it('스타일 목록에서 다른 스타일을 골라도 바뀌지 않는다', async () => {
    // 정상 경로 고정 — 막는 것은 화면 단추만이 아니다. 저장하는 곳에서도 거절한다.
    stub()
    expect(await producer.getState().setStyleAnchor('real')).toBe(false)
    expect(producer.getState().styleAnchorKey).toBe('custom_look')
    expect(db.writes).toHaveLength(0)
  })

  it('채팅 입력창의 스타일 단추는 누를 수 없고 바꿀 수 없는 이유를 보인다', () => {
    // 왜: 단추가 눌리면 고른 스타일이 조용히 무시된 것처럼 보인다 — 처음부터 막고 이유를 보인다.
    const ui = readFileSync('src/components/layout/global-chat.tsx', 'utf8')
    expect(ui).toMatch(/styleLocked \?/)
    expect(ui).toMatch(/data-testid="style-locked"/)
    expect(translate('ko', "The art style comes from the picture you chose, so it can't be changed.")).toMatch(REASON)
  })

  it('채팅으로 스타일을 바꿔 달라고 하면 바꾸지 않고 이유를 말한다', async () => {
    // 왜: 모델이 바꿨다고 답해도 실제로는 바뀌지 않으면 거짓말이 된다 — 답을 바꾸지 않았다는 말로 둔다.
    stub({ '/api/produce/chat': () => Response.json({ reply: '실사로 바꿨어요.', extractedSettings: { styleAnchorKey: 'real' } }) })
    await chat.getState().sendMessage('실사로 바꿔 줘')
    expect(calls('/api/produce/chat')[0]).toMatchObject({ styleLocked: true })
    expect(producer.getState().styleAnchorKey).toBe('custom_look')
    const replies = chat.getState().messages.filter((m) => m.role === 'model').map((m) => m.content)
    expect(replies.some((content) => REASON.test(content))).toBe(true)
    expect(replies.some((content) => content.includes('실사로 바꿨어요'))).toBe(false)
  })

  it('채팅에 그림을 붙여 "이 그림체로"라고 해도 바뀌지 않는다', async () => {
    // 왜: 다른 그림을 그림체로 정하는 것도 스타일을 바꾸는 일이다.
    stub({ '/api/produce/chat': () => Response.json({ reply: '이 그림체로 잡았어요.', extractedSettings: { styleAnchorFromAttachment: { imageIndex: 0, label: '수채', medium: 'watercolor' } } }) })
    await chat.getState().sendMessage('이 그림체로 해줘', { imageUrls: ['https://img.test/new.png'] })
    expect(calls('/api/produce/style-anchor')).toHaveLength(0)
    expect(producer.getState().styleAnchorKey).toBe('custom_look')
    expect(chat.getState().messages.some((m) => m.role === 'model' && REASON.test(m.content))).toBe(true)
  })

  it('만화를 새로 올려 그대로 영상화해도 그림체는 바꾸지 않고 분석 모델도 부르지 않는다', async () => {
    // 왜: 만화 흐름은 첫 쪽을 그림체로 정한다 — 고정된 그림체를 덮으면 안 된다.
    stub()
    await chat.getState().runCreationPlan(plan({ original: 'comic', comicPages: [PAGE], comicStyle: 'lock' }))
    expect(calls('/api/produce/anchor-medium')).toHaveLength(0)
    expect(calls('/api/produce/style-anchor')).toHaveLength(0)
    expect(producer.getState().customStyleAnchor).toEqual(LOCKED)
  })
})
