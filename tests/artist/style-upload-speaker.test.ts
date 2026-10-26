// Artist 스타일 창에서 올린 그림체의 말풍선과 안내는 Writer 가 아니라 Artist 이름으로 채팅에 남는다 (2026-10-27 디자이너 QA 1차)
import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const persist = vi.hoisted(() => ({ save: vi.fn() }))
vi.mock('@/lib/chat-persistence', () => ({ saveChatMessage: persist.save, saveChatTrace: vi.fn(), saveChatTracePatch: vi.fn(), loadLatestChatTrace: vi.fn() }))
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ from: () => ({ update: () => ({ eq: async () => ({ error: null }) }) }) }),
  createCatalogClient: vi.fn(),
}))

import { STAGE_LABEL } from '@/lib/constants'
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
  it('Artist 스타일 창에서 올린 그림체 메시지는 Artist 이름으로 채팅에 남는다', async () => {
    // 왜: Artist에서 그림체를 올렸는데 채팅에는 Writer가 말한 것처럼 보였다(디자이너 QA 1차 관찰 49).
    await chat.getState().applyUploadedStyle(LOOK, { stage: 'artist' })
    const messages = chat.getState().messages
    // 내 말풍선(그림) · 그림체로 정했어요 · 분석이 끝났어요.
    expect(messages.map((m) => m.role)).toEqual(['user', 'model', 'model'])
    expect(messages.every((m) => m.stage === 'artist')).toBe(true)
    expect(messages.map((m) => STAGE_LABEL[m.stage])).not.toContain('Writer')
    expect(persist.save.mock.calls.length).toBe(3)
    expect(persist.save.mock.calls.every(([, stage]) => stage === 'artist')).toBe(true)
    expect(producer.getState().customStyleAnchor?.locked).toBe(true)

    // Artist 스타일 창이 Artist 로 부르고, 다른 곳(예전 경로)은 지금처럼 Writer(producer) 채팅에 남는다.
    expect(readFileSync('src/features/artist-room/style-make-dialog.tsx', 'utf8')).toMatch(/applyUploadedStyle\([^)]*\}, \{ stage: 'artist' \}\)/)
    chat.getState().reset()
    producer.getState().reset()
    await chat.getState().applyUploadedStyle(LOOK)
    expect(chat.getState().messages.every((m) => m.stage === 'producer')).toBe(true)
  })
})
