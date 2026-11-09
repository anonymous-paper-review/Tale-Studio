// 한국어 화면에서 로그인 후 위 막대의 탭 이름이 한국어로 보이는지 검사한다
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/lib/i18n', async () => {
  const { translate } = await import('@/lib/i18n/translate')
  return { translate, useT: () => (text: string, params?: Record<string, string | number>) => translate('ko', text, params) }
})

const navOf = (html: string) => html.match(/<nav\b[^>]*>([\s\S]*?)<\/nav>/)?.[1] ?? ''

describe('로그인 후 위 막대 탭 이름', () => {
  // 왜: 11/5 시안(R2~R6) 위 막대 탭은 한국어다. 사전에 없던 Playground · Queue 는 한국어 화면에서도 영어로 보였다
  //   (탭 이름은 변수로 번역해서 사전 누락 검사가 잡지 못했다).
  it('한국어 화면에서 로그인 후 위 막대의 탭은 프로젝트 · 플레이그라운드 · 대기열 · 계정으로 보인다', async () => {
    const { DashboardHeader } = await import('@/components/dashboard/dashboard-header')
    for (const active of ['projects', 'playground', 'queue', 'account'] as const) {
      const nav = navOf(renderToStaticMarkup(createElement(DashboardHeader, { active })))
      const at = ['프로젝트', '플레이그라운드', '대기열', '계정'].map((label) => nav.indexOf(label))
      expect(at.every((i) => i >= 0), active).toBe(true)
      expect(at, active).toEqual([...at].sort((a, b) => a - b))
      for (const label of ['Projects', 'Playground', 'Queue', 'Account']) expect(nav, active).not.toContain(label)
    }
  })
})
