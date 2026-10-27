// 내 그림체 그림을 올리면 채팅의 "그림체"와 같은 규칙으로 고정 · 분석한다 (2026-10-10 오너) — Artist 스타일 창의 올리기 카드는 2026-10-27 내렸다(정비 뒤 다시)
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
  it('Artist 스타일 팝업에는 내 그림체 올리기 카드가 없고, 이미 올린 그림체가 있으면 그 그림체와 지우기(✕)를 보인다', () => {
    // 왜: 2026-10-27 오너 — "스타일 선택지에서 내 그림 업로드 기능을 지워줘. 추후 정비해서 다시 올릴거야."
    //   이미 내 그림체로 만든 프로젝트는 지금처럼 그 그림체를 쓰고 지울 수 있어야 한다(QA 1차 #03 ✕).
    const dialog = readFileSync('src/features/artist-room/style-make-dialog.tsx', 'utf8')
    expect(dialog).not.toMatch(/data-testid="artist-style-upload"/)
    expect(dialog).not.toMatch(/type="file"/)
    expect(dialog).not.toMatch(/<Plus /)
    expect(dialog).not.toMatch(/ingestCreationFile|applyUploadedStyle/)
    expect(dialog).toMatch(/data-testid="artist-style-custom"/)
    expect(dialog).toMatch(/data-testid="artist-style-remove"/)
    expect(translate('ko', 'Remove my art style')).toBeTruthy()
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
