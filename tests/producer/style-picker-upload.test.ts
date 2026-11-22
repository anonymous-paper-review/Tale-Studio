// 내 그림체 그림을 올려 그림체로 정하는 길은 없다 — Artist 스타일 창의 올리기 카드는 2026-10-27 내렸고, 올린 그림을 그림체로 쓰는 기능은 D6(2026-11-22)로 없앴다
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

  it('스타일 창에서 그림을 올려 그림체로 정하는 길은 채팅 저장소에도 없다', () => {
    // 왜: 오너 "웹툰이나 이미지 입력받았을 때 스타일 추출하는 기능도 없애줘"(D6) — 올리기 카드를 다시 붙여도 부를 곳이 없게 그 길을 지웠다.
    expect('applyUploadedStyle' in chat.getState()).toBe(false)
    expect(calls('/api/produce/style-anchor')).toHaveLength(0)
  })

  it('그림체를 이미 올린 작품의 그림체는 채팅에 그림을 올려 그림체라고 답해도 바뀌지 않는다', async () => {
    // 정상 경로 고정 — 이미 올린 그림체는 그대로 쓰고(리드 2026-11-22 안 1 바탕), 새 그림에서 그림체를 정하는 길은 없다(D6).
    producer.setState({ styleAnchorKey: 'custom_fixed', customStyleAnchor: { url: `${MEDIA}/fixed/original.webp`, label: '내 그림체', medium: '2d_anime', locked: true } })
    chat.getState().offerImageRoles([LOOK], { typed: '', msg: '그림을 올렸어요' })
    await chat.getState().sendMessage('그림체로 써 주세요')
    expect(calls('/api/produce/style-anchor')).toHaveLength(0)
    expect(producer.getState().customStyleAnchor?.url).toBe(`${MEDIA}/fixed/original.webp`)
    expect(producer.getState().styleAnchorKey).toBe('custom_fixed')
  })
})
