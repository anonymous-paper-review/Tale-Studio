// 다음 화 산문 화면 맨 위 띠: 앞 화 제목과 [앞 화 줄거리 보기], 앞 화를 지웠으면 안내만 (2026-10-26 · 프로토타입 W1s · WS)
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/studio/producer',
}))

import { ProseSeriesBanner } from '@/features/series/prose-series-banner'
import type { SeriesView } from '@/lib/series/view'
import { useLocaleStore } from '@/stores/locale-store'

function view(over: Partial<SeriesView> = {}): SeriesView {
  return {
    prevTitle: '자판기의 반란',
    prevProjectId: 'project-1',
    prevDeleted: false,
    characters: [],
    locations: [],
    styleId: 'anime',
    currentStyleId: 'anime',
    hasVoices: false,
    continuesLastScene: false,
    copyFailures: [],
    ...over,
  }
}

const html = (v: SeriesView) => renderToStaticMarkup(createElement(ProseSeriesBanner, { projectId: 'project-2', view: v }))

beforeEach(() => {
  useLocaleStore.setState({ locale: 'ko' })
  Object.assign(useLocaleStore.getInitialState(), useLocaleStore.getState())
})

describe('다음 화 산문 화면의 띠', () => {
  it('다음 화의 산문 화면이면 앞 화 제목과 [앞 화 줄거리 보기]가 보인다', () => {
    // 왜: Writer 는 앞 화 확정 산문을 읽고 이어 쓴다. 무엇을 읽었는지 사용자가 같은 화면에서 열어 볼 수 있어야 한다(프로토타입 W1s · WS).
    const out = html(view())
    expect(out).toContain('「자판기의 반란」의 다음 화예요')
    expect(out).toContain('>앞 화 줄거리 보기<')
  })

  it('앞 화를 지웠으면 줄거리 보기 대신 앞 화 줄거리 없이 쓴다는 안내를 보인다', () => {
    // 왜: 지운 앞 화의 산문은 읽을 수 없다. 열리지 않는 버튼을 두지 않고, 이어받은 그림은 남아 있다고 알린다(Q6).
    const out = html(view({ prevDeleted: true, prevProjectId: null }))
    expect(out).toContain('앞 화가 지워졌어요. 이제 [AI 다시 쓰기]는 앞 화 줄거리 없이 써요.')
    expect(out).not.toContain('앞 화 줄거리 보기')
  })
})
