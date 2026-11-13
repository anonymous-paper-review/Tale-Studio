// 생성 전 Take 값("N Take")을 언제 보이고 언제 숨기는지 — 샷 상세 둘 · D8 · 툴바 · Take 노드 · 러프 카드 · 독립 영상 배지가 같은 판단을 쓴다.
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { takeValuesShown } from '@/lib/billing/take-cost'
import { fetchTakeBalance, refetchTakeBalance, useTakeBalance } from '@/lib/billing/use-take-balance'

// 화면이 그려질 때 잔액 훅이 주는 값으로 판단한다 — 일곱 곳 모두 takeValuesShown(useTakeBalance()) 꼴이다.
function shownOnScreen(): boolean | null {
  let shown: boolean | null = null
  const Probe = () => {
    shown = takeValuesShown(useTakeBalance())
    return null
  }
  renderToStaticMarkup(createElement(Probe))
  return shown
}

describe('Take 값을 보이는 때', () => {
  afterEach(() => vi.unstubAllGlobals())

  // 왜: 첫 읽기 전 잔액 훅 값은 과금이 꺼진 계정과 같아서(mode 'off'), 페이지를 연 직후엔 Take 값이 숨었고 그 사이 누르면
  //   값을 못 본 채 Take 를 쓰는 만들기가 시작됐다(리드 2026-11-14, 검토 b). 값은 잔액과 상관없는 계산값이라 읽는 동안에도 보인다 —
  //   정말 꺼진 계정은 첫 읽기 동안만 잠깐 보였다 사라진다.
  it('Take 잔액을 처음 읽는 동안에도 Take 값을 보인다 — 숨기는 것은 과금이 꺼졌다고 읽혔을 때뿐', async () => {
    // 페이지를 연 직후 — 첫 읽기가 아직 끝나지 않았다.
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => {})))
    refetchTakeBalance()
    expect(shownOnScreen()).toBe(true)

    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ balance: null, mode: 'off' })))
    await fetchTakeBalance()
    expect(shownOnScreen()).toBe(false)

    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 500 })))
    await fetchTakeBalance()
    expect(shownOnScreen()).toBe(true)

    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ balance: 40, mode: 'enforce' })))
    await fetchTakeBalance()
    expect(shownOnScreen()).toBe(true)
  })
})
