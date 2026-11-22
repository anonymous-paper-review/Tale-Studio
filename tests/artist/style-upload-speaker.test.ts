// Artist 스타일 창에서 그림을 올려 그림체로 정하는 길은 없다 — 그래서 그 말풍선 · 안내도 남지 않는다 (2026-10-27 디자이너 QA 1차 → 그림체 올리기는 D6 2026-11-22 로 없앰)
import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const persist = vi.hoisted(() => ({ save: vi.fn() }))
vi.mock('@/lib/chat-persistence', () => ({ saveChatMessage: persist.save, saveChatTrace: vi.fn(), saveChatTracePatch: vi.fn(), loadLatestChatTrace: vi.fn() }))
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ from: () => ({ update: () => ({ eq: async () => ({ error: null }) }) }) }),
  createCatalogClient: vi.fn(),
}))

import { useGlobalChatStore as chat } from '@/stores/global-chat-store'
import { useProducerStore as producer } from '@/stores/producer-store'
import { useProjectStore as project } from '@/stores/project-store'
import { useLocaleStore } from '@/stores/locale-store'

const MEDIA = 'https://example.supabase.co/storage/v1/object/public/media/ws-1/proj-1/uploads'
const LOOK = { id: 'look', name: 'look.png', thumbUrl: `${MEDIA}/look/original.webp`, sliceUrls: [`${MEDIA}/look/s000.jpg`] }

beforeEach(() => {
  vi.clearAllMocks()
  project.getState().resetProject()
  producer.getState().reset()
  chat.getState().reset()
  project.setState({ projectId: 'proj-1', currentStage: 'artist', reachedStage: 'artist' })
  useLocaleStore.setState({ locale: 'ko' })
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : {}
    if (url === '/api/produce/anchor-medium') return Response.json({ medium: '2d_anime' })
    if (url === '/api/produce/style-anchor') return Response.json({ key: 'custom_up', imageUrl: body.imageUrl, label: body.label, medium: body.medium, locked: true })
    if (url === '/api/produce/style-facets') return Response.json({ ok: true, facets: true })
    return Response.json({ ok: true })
  }))
})
afterEach(() => {
  vi.unstubAllGlobals()
  useLocaleStore.setState({ locale: 'en' })
})

describe('Artist 스타일 창의 내 그림체 올리기(디자이너 QA 1차 관찰 49)', () => {
  it('Artist 스타일 창에서는 그림을 올려 그림체로 정할 수 없어, Artist 이름으로든 Writer 이름으로든 그림체를 정했다는 말이 남지 않는다', async () => {
    // 왜: 오너 "웹툰이나 이미지 입력받았을 때 스타일 추출하는 기능도 없애줘"(D6) — 스타일 창에 올리기 칸이 없고 그 길도 지웠다.
    for (const file of ['src/features/artist-room/style-make-dialog.tsx', 'src/features/artist-room/regenerate-style-dialog.tsx']) {
      expect(readFileSync(file, 'utf8'), file).not.toMatch(/type="file"|applyUploadedStyle/)
    }
    expect('applyUploadedStyle' in chat.getState()).toBe(false)
    expect(chat.getState().messages).toHaveLength(0)
    expect(persist.save).not.toHaveBeenCalled()
    expect(producer.getState().customStyleAnchor).toBeNull()
  })
})
