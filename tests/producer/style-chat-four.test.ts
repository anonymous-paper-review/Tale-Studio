// 채팅 모델은 네 가지 스타일만 고를 수 있고, 없어진 스타일을 말하면 정하지 않고 네 가지 중 가장 가까운 것을 권한다 (D6 오너 2026-11-22)
import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildProducerSystem } from '@/app/api/produce/chat/system-prompt'
import { offeredStyles, retiredStylesContext } from '@/lib/style-offer'
import { styleCatalogLine } from '@/lib/style-anchor-name'
import { useGlobalChatStore } from '@/stores/global-chat-store'
import { useProducerStore, type StyleAnchor } from '@/stores/producer-store'
import { useProjectStore } from '@/stores/project-store'
import { useLocaleStore } from '@/stores/locale-store'

const anchor = (key: string, label: string, medium: string, subtitle: string | null = null): StyleAnchor => ({ key, label, medium, imageUrl: null, previewUrl: null, subtitle })
// 개발 DB 카탈로그와 같은 12종.
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

/** [이름] 블록의 줄들. */
function block(text: string, name: string): string[] {
  const start = text.indexOf(`[${name}]\n`)
  if (start < 0) return []
  const body = text.slice(start + name.length + 3)
  const end = body.indexOf('\n\n')
  return (end < 0 ? body : body.slice(0, end)).split('\n').filter(Boolean)
}

beforeEach(() => {
  useGlobalChatStore.getState().reset()
  useProducerStore.getState().reset()
  useProjectStore.getState().resetProject()
  useLocaleStore.setState({ locale: 'ko' })
})
afterEach(() => vi.unstubAllGlobals())

describe('채팅과 네 가지 스타일', () => {
  it('채팅 모델이 받는 스타일 목록에는 네 가지만 있고, 없어진 스타일은 가장 가까운 짝 표로만 받는다', () => {
    // 왜: 오너 "4종만 놔두고 다른 선택지를 아예 없애줘"(D6) — 모델이 목록에서 없어진 스타일을 골라 주면 그 스타일로 정해졌다.
    // 채팅 라우트와 같은 방법으로 만든 목록 — 라우트가 정말 이렇게 만드는지는 아래에서 본다.
    const context = [`[Style Anchor Catalog]\n${offeredStyles(CATALOG).map((a) => styleCatalogLine(a)).join('\n')}`, retiredStylesContext(CATALOG)].join('\n\n')
    expect(block(context, 'Style Anchor Catalog').map((line) => line.split(' | ')[0])).toEqual(['real', 'jp_anime', 'stop_motion', 'watercolor'])
    const retired = block(context, 'Retired Styles')
    expect(retired).toHaveLength(8)
    expect(retired).toContain('3D 애니메이션 | 3D Animation -> closest: stop_motion')
    expect(retired).toContain('미국 카툰 | American Cartoon -> closest: jp_anime')
    expect(retired).toContain('심리 공포 | Psychological Horror -> closest: real')
    // 채팅 라우트가 이 목록을 쓴다(그림체가 고정된 작품에는 주지 않는다).
    const route = readFileSync('src/app/api/produce/chat/route.ts', 'utf8')
    expect(route).toMatch(/styleLocked !== true[\s\S]{0,200}listStyleAnchorCatalog/)
    expect(route).toContain('offeredStyles(anchorCatalog).map((a) => styleCatalogLine(a))')
    expect(route).toContain('retiredStylesContext(anchorCatalog)')
    expect(retiredStylesContext(offeredStyles(CATALOG))).toBeNull()
  })

  it('채팅 모델에게 없어진 스타일은 정하지 말고 네 가지 중 가장 가까운 것을 권하라고 이른다', () => {
    // 왜: 오너 "숨긴 스타일은 가장 가까운 4종 중 하나를 제안해줘"(D6) — 이름 · 느낌으로 말해도 없어진 스타일이면 권하기만 한다.
    for (const locale of ['ko', 'en'] as const) {
      const system = buildProducerSystem(locale)
      expect(system).toContain('[Retired Styles]')
      expect(system).toMatch(/never emit a retired style/i)
      expect(system).toMatch(/closest/i)
    }
  })

  it('채팅이 네 가지 밖의 스타일 키를 내면 그 스타일로 정하지 않고 가장 가까운 것을 권한다', async () => {
    // 왜: 모델이 지시를 어기고 없어진 스타일 키를 내도 앱은 정하지 않는다 — 대신 네 가지 중 가장 가까운 것과 고르는 곳을 말한다(D6).
    const saved: Array<string | null> = []
    useProducerStore.setState({ styleAnchors: CATALOG, setStyleAnchor: async (key) => { saved.push(key); return true } })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ reply: '그림체를 확인했어요.', extractedSettings: { styleAnchorKey: 'real_3d' } })))
    await useGlobalChatStore.getState().sendMessage('3D 애니메이션 그림체로 해줘')
    expect(saved).toEqual([])
    const reply = useGlobalChatStore.getState().messages.at(-1)?.content ?? ''
    expect(reply).toContain('3D 애니메이션은 이제 고를 수 없어요')
    expect(reply).toContain('스톱모션')
    expect(reply).toContain('Artist')
  })

  it('채팅이 네 가지 안의 스타일 키를 내면 지금처럼 바로 정한다', async () => {
    // 왜: 정상 경로 고정 — 이름 · 느낌으로 고른 네 가지 스타일은 채팅이 바로 정한다(2026-08-31 오너 D12).
    const saved: Array<string | null> = []
    useProducerStore.setState({ styleAnchors: CATALOG, setStyleAnchor: async (key) => { saved.push(key); return true } })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ reply: '수채로 정했어요.', extractedSettings: { styleAnchorKey: 'watercolor' } })))
    await useGlobalChatStore.getState().sendMessage('수채화 느낌으로 해줘')
    expect(saved).toEqual(['watercolor'])
  })
})
