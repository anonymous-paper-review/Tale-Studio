// 영어 화면의 Artist 가 작품 스타일 기록을 읽거나 버전을 보여 줄 때도 예전 한국어 기본 이름("내 레퍼런스") 그림체를 영어 기본 이름으로 보이는지 검사한다
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/chat-persistence', () => ({ saveChatMessage: vi.fn(), saveChatTrace: vi.fn(), saveChatTracePatch: vi.fn(), loadLatestChatTrace: vi.fn() }))

import { versionStyleLabel } from '@/lib/artist/style-versions'
import { useArtistVersionStore } from '@/stores/artist-version-store'
import { useLocaleStore } from '@/stores/locale-store'
import { useProducerStore } from '@/stores/producer-store'
import { useProjectStore } from '@/stores/project-store'

const STYLE_URL = 'https://img/style.png'
const OLD_DEFAULT = { url: STYLE_URL, label: '내 레퍼런스', medium: '2d_anime' }

beforeEach(() => {
  useLocaleStore.setState({ locale: 'en' })
  useProjectStore.setState({ projectId: 'p-style-en', projectLocale: 'en', projectLocaleLocked: true })
  // 프로젝트 행을 읽은 뒤의 화면 값 — 예전 기본 이름은 이미 화면 언어로 바뀌어 있다(lib/custom-style-label).
  useProducerStore.setState({ styleAnchorKey: 'custom_old', customStyleAnchor: { url: STYLE_URL, label: 'My reference', medium: '2d_anime' }, styleAnchors: [] })
  useArtistVersionStore.setState({ projectId: 'p-style-en', busy: null })
  vi.stubGlobal('fetch', vi.fn(async (input: string) => {
    if (String(input).startsWith('/api/artist/versions?')) {
      return Response.json({
        versions: [{ n: 1, styleId: 'custom_old', styleKey: 'custom_old', customStyle: OLD_DEFAULT, current: true, active: [], createdAt: '', thumbs: [] }],
        currentN: 1, regen: null, completed: false,
        style: { key: 'custom_old', custom: OLD_DEFAULT },
      })
    }
    return Response.json({})
  }))
})
afterEach(() => { vi.unstubAllGlobals() })

describe('영어 화면 Artist 의 그림체 이름', () => {
  // 왜: 검토 C(리드 2026-11-10) — Artist 가 작품 스타일 기록을 읽으면 서버의 그림체 이름("내 레퍼런스")과 화면 값("My reference")을
  //   글자로 비교해 늘 다르다고 보고 서버 값으로 덮어, 영어 화면 Artist 스타일 줄이 다시 "내 레퍼런스"가 됐다(B1 이 Artist 에서 무효).
  it('영어 화면이면 Artist 기록을 읽은 뒤에도 예전 기본 이름 그림체가 영어 기본 이름으로 보인다', async () => {
    await useArtistVersionStore.getState().refresh()
    const producer = useProducerStore.getState()
    expect(producer.customStyleAnchor).toMatchObject({ url: STYLE_URL, label: 'My reference' })
    expect(versionStyleLabel({ styleKey: producer.styleAnchorKey, customStyle: producer.customStyleAnchor }, [], 'en')).toBe('My reference')
  })

  // 왜: 버전 카드 · 카드 기록 · "불러왔어요" 알림은 버전에 적힌 그림체 이름을 그대로 써서, 예전 기본 이름이 처음부터 한국어로 남았다.
  it('영어 화면이면 Artist 버전 카드 · 카드 기록 · 불러왔어요 알림의 그림체 이름도 예전 기본 이름을 영어 기본 이름으로 보인다', () => {
    expect(versionStyleLabel({ styleKey: 'custom_old', customStyle: OLD_DEFAULT }, [], 'en')).toBe('My reference')
    // 사용자가 붙인 이름은 그대로, 한국어 화면은 기본 이름을 한국어로.
    expect(versionStyleLabel({ styleKey: 'custom_x', customStyle: { url: STYLE_URL, label: 'Watercolor', medium: null } }, [], 'en')).toBe('Watercolor')
    expect(versionStyleLabel({ styleKey: 'custom_old', customStyle: { ...OLD_DEFAULT, label: 'My reference' } }, [], 'ko')).toBe('내 레퍼런스')
  })
})
