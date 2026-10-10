// 스타일 선택 창의 점선 "+" 카드로 내 그림체 그림을 올리면 채팅의 "그림체"와 같은 규칙으로 고정 · 분석한다 (2026-10-10 오너)
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
import { useLocaleStore } from '@/stores/locale-store'
import { translate } from '@/lib/i18n'

const MEDIA = 'https://example.supabase.co/storage/v1/object/public/media/ws-1/proj-1/uploads'
const LOOK = { id: 'look', name: 'look.png', thumbUrl: `${MEDIA}/look/original.webp`, sliceUrls: [`${MEDIA}/look/s000.jpg`] }

let fetchMock: ReturnType<typeof vi.fn>
const calls = (url: string) => fetchMock.mock.calls.filter(([u]) => String(u) === url).map(([, init]) => JSON.parse(String((init as RequestInit | undefined)?.body ?? '{}')))

beforeEach(() => {
  project.getState().resetProject()
  producer.getState().reset()
  chat.getState().reset()
  project.setState({ projectId: 'proj-1', currentStage: 'producer', reachedStage: 'producer' })
  useLocaleStore.setState({ locale: 'ko' })
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : {}
    if (url === '/api/produce/anchor-medium') return Response.json({ medium: '2d_anime' })
    if (url === '/api/produce/style-anchor') return Response.json({ key: 'custom_up', imageUrl: body.imageUrl, label: body.label, medium: body.medium, ...(body.lock ? { locked: true } : {}) })
    if (url === '/api/produce/style-facets') return Response.json({ ok: true, facets: true, figure: true })
    return Response.json({ ok: true })
  })
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  vi.unstubAllGlobals()
  useLocaleStore.setState({ locale: 'en' })
})

describe('스타일 선택 창의 내 그림체 올리기', () => {
  it('스타일 선택 창에는 그리드와 슬라이드 모두 첫 자리에 점선 테두리의 + 카드가 있고, 분석 모델로 보낸다는 안내가 있다', () => {
    // 왜: 10/10 오너 — Producer 로 넘어오면 스타일 선택이 바로 뜨는데, 내 그림을 그림체로 올릴 길이 그 창에 없었다.
    const picker = readFileSync('src/features/producer/style-anchor-picker.tsx', 'utf8')
    expect(picker).toMatch(/data-testid="style-upload-card"/)
    expect(picker).toMatch(/border-dashed/)
    expect(picker).toMatch(/<Plus /)
    expect(readFileSync('src/components/layout/global-chat.tsx', 'utf8')).toMatch(/upload=\{/)
    expect(translate('ko', 'The picture goes to an analysis model to describe its art style, and the style is then fixed.')).toMatch(/분석 모델/)
  })

  it('올린 그림은 매체를 고르고 그림체로 고정한 뒤 그림체 분석기로 분석하고, 내 말풍선에 그 그림을 남긴다', async () => {
    // 왜: 채팅에서 그림을 그림체로 고른 것과 같은 일이다(10/9 오너 결정 A · 고정). 어떤 그림을 골랐는지 채팅 기록에 남아야 한다.
    await chat.getState().applyUploadedStyle(LOOK)
    expect(calls('/api/produce/anchor-medium')[0]).toMatchObject({ imageUrl: LOOK.thumbUrl, consent: 'style-picker-v1' })
    expect(calls('/api/produce/style-anchor')[0]).toMatchObject({ imageUrl: LOOK.thumbUrl, lock: true })
    expect(calls('/api/produce/style-facets')[0]).toMatchObject({ consent: 'style-picker-v1' })
    expect(producer.getState().customStyleAnchor?.locked).toBe(true)
    expect(chat.getState().messages.some((m) => m.role === 'user' && m.content.includes(LOOK.thumbUrl))).toBe(true)
  })

  it('그림체가 고정된 프로젝트에서는 올려도 그림체를 바꾸지 않고 알린다', async () => {
    // 정상 경로 고정 — 고정된 그림체는 어디서도 바꿀 수 없다(10/9 오너).
    producer.setState({ styleAnchorKey: 'custom_fixed', customStyleAnchor: { url: `${MEDIA}/fixed/original.webp`, label: '내 그림체', medium: '2d_anime', locked: true } })
    await chat.getState().applyUploadedStyle(LOOK)
    expect(calls('/api/produce/style-anchor')).toHaveLength(0)
    expect(chat.getState().messages.some((m) => m.role === 'model' && /그대로 둘게요/.test(m.content))).toBe(true)
  })
})
