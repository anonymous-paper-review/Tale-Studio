// Writer · Artist 채팅에서 없어진 스타일을 이름으로 부르면(스타일 낱말과 함께) 모델에 보내지 않고 앱이 바로 가장 가까운 것을 권하는지 검사한다 (D6 오너 2026-11-22)
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/chat-persistence', () => ({ saveChatMessage: vi.fn(), saveChatTrace: vi.fn(), saveChatTracePatch: vi.fn(), loadLatestChatTrace: vi.fn() }))
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ from: () => ({ update: () => ({ eq: async () => ({ error: null }) }) }) }),
  createCatalogClient: vi.fn(),
}))

import { useGlobalChatStore as chat } from '@/stores/global-chat-store'
import { useProducerStore as producer, type StyleAnchor } from '@/stores/producer-store'
import { useProjectStore as project } from '@/stores/project-store'
import { useLocaleStore } from '@/stores/locale-store'
import { retiredStyleMention } from '@/lib/style-offer'

const anchor = (key: string, label: string, medium: string, subtitle: string | null = null): StyleAnchor => ({ key, label, medium, imageUrl: null, previewUrl: null, subtitle })
// 개발 DB 카탈로그와 같은 12종(이름 · 매체 · 부제).
const CATALOG: StyleAnchor[] = [
  anchor('real', '실사', 'live_action'),
  anchor('real_3d', '3D 애니메이션', '3d'),
  anchor('jp_anime', '2D 일본 애니', '2d_anime'),
  anchor('us_cartoon', '미국 카툰', '2d_cartoon'),
  anchor('stop_motion', '스톱모션', 'stop_motion'),
  anchor('watercolor', '수채', 'watercolor'),
  anchor('real_jp_melo', '일본 멜로', 'live_action', 'Japanese Melodrama'),
  anchor('real_psy_horror', '심리 공포', 'live_action', 'Psychological Horror'),
  anchor('real_hitech_sf', '하이테크 SF', 'live_action', 'Hi-Tech Sci-Fi'),
  anchor('real_desert_fantasy', '사막 판타지', 'live_action', 'Desert Fantasy'),
  anchor('real_urban_hero', '도심 히어로', 'live_action', 'Urban Hero'),
  anchor('real_euro_period', '유럽 역사극', 'live_action', 'European Period Drama'),
]

let fetchMock: ReturnType<typeof vi.fn>
const calls = (url: string) => fetchMock.mock.calls.filter(([u]) => String(u) === url)
function stub() {
  fetchMock = vi.fn(async (url: string) => {
    if (url === '/api/writer/scene-gate') return Response.json({ proposalId: 'proposal-1' })
    if (url === '/api/artist/chat') return Response.json({ reply: 'Okay.' })
    if (url === '/api/produce/chat') return Response.json({ reply: 'Okay.' })
    return Response.json({ ok: true })
  })
  vi.stubGlobal('fetch', fetchMock)
}
const send = (text: string) => chat.getState().sendMessage(text)
const lastModel = () => chat.getState().messages.filter((m) => m.role === 'model').at(-1)?.content ?? ''
/** Writer 화면(id producer) — 넘기기 전 산문 초안이 있어 말은 산문 고침 요청(scene-gate)으로 간다. */
function writerScreen(locale: 'ko' | 'en' = 'ko') {
  project.setState({ projectId: 'proj-1', currentStage: 'producer', reachedStage: 'producer', treatmentDraft: true, producerLocked: false, projectLocale: locale, projectLocaleLocked: true })
  useLocaleStore.setState({ locale })
}
/** Artist 화면 — 말은 Artist 채팅 모델(/api/artist/chat)로 간다. */
function artistScreen(locale: 'ko' | 'en' = 'ko') {
  project.setState({ projectId: 'proj-1', currentStage: 'artist', reachedStage: 'artist', producerLocked: true, projectLocale: locale, projectLocaleLocked: true })
  useLocaleStore.setState({ locale })
}

beforeEach(() => {
  project.getState().resetProject()
  producer.getState().reset()
  chat.getState().reset()
  producer.setState({ styleAnchors: CATALOG })
  stub()
})
afterEach(() => {
  vi.unstubAllGlobals()
  useLocaleStore.setState({ locale: 'en' })
})

describe('채팅에서 없어진 스타일 이름', () => {
  it('Writer 채팅에서 없어진 스타일 이름을 그림체 낱말과 함께 말하면 모델에 보내지 않고, 이제 고를 수 없다는 말과 가장 가까운 것 · 고르는 곳을 바로 답한다', async () => {
    // 왜: 오너 "숨긴 스타일은 가장 가까운 4종 중 하나를 제안해줘"(D6). Writer 화면의 말은 산문 고침으로 가서 산문을 "3D 애니메이션처럼" 고치려 든다.
    //   권하기는 말로만 한다 — 정하는 곳은 Artist 스타일 창이다(혼자 정한 것, 되돌리기 쉬움).
    writerScreen('ko')
    await send('3D 애니메이션 그림체로 바꿔줘')
    expect(calls('/api/writer/scene-gate')).toEqual([])
    expect(calls('/api/produce/chat')).toEqual([])
    expect(lastModel()).toContain('3D 애니메이션은 이제 고를 수 없어요')
    expect(lastModel()).toContain('스톱모션')
    expect(lastModel()).toContain('Artist')
    expect(producer.getState().styleAnchorKey).toBeNull()
  })

  it('Artist 채팅에서도 없어진 스타일 이름을 스타일 낱말과 함께 말하면 모델에 보내지 않고 가장 가까운 것을 바로 권한다', async () => {
    // 왜: Artist 채팅 모델은 스타일을 바꾸는 손이 없다 — 모델에 보내면 엉뚱한 다시 그리기를 권할 수 있다(D6).
    artistScreen('ko')
    await send('미국 카툰 스타일로 다시 그려줘')
    expect(calls('/api/artist/chat')).toEqual([])
    expect(lastModel()).toContain('미국 카툰은 이제 고를 수 없어요')
    expect(lastModel()).toContain('2D 일본 애니')
  })

  it('영어 화면에서 영어 이름으로 말해도 같은 답을 영어로 한다', async () => {
    // 왜: 영어 화면의 스타일 이름은 영어다(American Cartoon) — 한국어 이름만 알아들으면 영어 사용자는 모델로 새어 나간다.
    artistScreen('en')
    await send('Make it American Cartoon style')
    expect(calls('/api/artist/chat')).toEqual([])
    expect(lastModel()).toContain('American Cartoon is no longer offered')
    expect(lastModel()).toContain('2D Japanese Anime')
  })

  it('Writer 채팅에서 장르와 겹치는 실사 변형 이름은 "스타일"만으로는 가로채지 않고 산문 고침으로 보내고, 그림체 · 화풍 · 룩 낱말이 있을 때만 바로 답한다', async () => {
    // 왜(혼자 정한 것, 되돌리기 쉬움): "심리 공포 스타일로 다시 써줘"는 글을 그 장르 결로 고쳐 달라는 말일 수 있다 — 산문 고침을 가로채면 안 된다.
    writerScreen('ko')
    await send('심리 공포 스타일로 다시 써줘')
    expect(calls('/api/writer/scene-gate')).toHaveLength(1)
    expect(lastModel()).not.toContain('이제 고를 수 없어요')
    chat.getState().reset()
    await send('심리 공포 그림체로 해줘')
    expect(calls('/api/writer/scene-gate')).toHaveLength(1)
    expect(lastModel()).toContain('심리 공포는 이제 고를 수 없어요')
    expect(lastModel()).toContain('실사')
  })

  it('스타일 낱말 없이 없어진 스타일 이름만 말하면 가로채지 않는다', async () => {
    // 왜: "심리 공포처럼 더 무섭게"는 산문 고침이다 — 이름만 보고 답하면 정상 요청이 막힌다.
    writerScreen('ko')
    await send('심리 공포처럼 더 무섭게 써줘')
    expect(calls('/api/writer/scene-gate')).toHaveLength(1)
    expect(lastModel()).not.toContain('이제 고를 수 없어요')
  })

  it('네 가지 스타일 이름이 함께 있으면 가로채지 않고 지금처럼 보낸다', async () => {
    // 정상 경로 고정 — "3D 애니메이션 말고 수채 그림체로"는 네 가지 중 하나를 고른 말이다.
    artistScreen('ko')
    await send('3D 애니메이션 말고 수채 그림체로 해줘')
    expect(calls('/api/artist/chat')).toHaveLength(1)
    expect(lastModel()).not.toContain('이제 고를 수 없어요')
  })

  it('Artist 채팅에서 없어진 스타일로 돌아가자고 하면 가로채지 않고 지금처럼 이전 스타일로 돌아가는 카드로 답한다', async () => {
    // 왜: 이미 그 스타일로 그린 작품은 지난 버전을 불러올 수 있다(리드 2026-11-22 안 1 바탕 · 정상 경로 고정) — "이제 고를 수 없어요"로 막으면 안 된다.
    artistScreen('ko')
    await send('심리 공포 스타일로 돌아가줘')
    expect(calls('/api/artist/chat')).toEqual([])
    expect(chat.getState().messages.some((m) => m.role === 'model' && m.content.includes('이제 고를 수 없어요'))).toBe(false)
    expect(chat.getState().suggestion?.id ?? '').toMatch(/^artist-versions:/)
  })

  it('없어진 스타일 이름은 한국어 · 영어 이름과 짧은 이름(3D · 카툰)으로 알아보고, 가장 먼저 나온 이름을 고른다', () => {
    // 왜: 사용자는 "3D 그림체" · "카툰 스타일"처럼 줄여 말한다 — 두 이름이 나오면 먼저 말한 것을 권한다(혼자 정한 것, 되돌리기 쉬움).
    expect(retiredStyleMention('3D 그림체로 해줘', CATALOG, { visualOnly: true })).toBe('real_3d')
    expect(retiredStyleMention('카툰 스타일로', CATALOG, { visualOnly: false })).toBe('us_cartoon')
    expect(retiredStyleMention('Urban Hero look please', CATALOG, { visualOnly: true })).toBe('real_urban_hero')
    expect(retiredStyleMention('일본 멜로 화풍이나 미국 카툰 그림체', CATALOG, { visualOnly: true })).toBe('real_jp_melo')
    expect(retiredStyleMention('그림체 바꿔줘', CATALOG, { visualOnly: true })).toBeNull()
  })
})
