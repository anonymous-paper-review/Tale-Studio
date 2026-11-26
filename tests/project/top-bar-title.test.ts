// 위 막대의 프로젝트 이름 · 연필이 좁은 폭에서도 0 폭으로 사라지지 않는지 검사한다 — Writer [씬 스토리 | 콘티]가 자리를 차지할 때 (dev 리드 2026-11-23 QA ① 을 O1 콘티 단계로 옮김)
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), usePathname: () => '/studio/conti' }))
vi.mock('@/lib/i18n', async () => {
  const { translate } = await import('@/lib/i18n/translate')
  return { translate, useT: () => (text: string, params?: Record<string, string | number>) => translate('ko', text, params) }
})
vi.mock('@/stores/project-store', () => ({
  useProjectStore: Object.assign(
    (select: (s: unknown) => unknown) => select({ projectTitle: '지하철 창문 속 또 다른 나', canNavigateTo: () => true }),
    { getState: () => ({ renameProject: async () => true }) },
  ),
}))
vi.mock('@/stores/ai-busy-store', async (original) => ({
  ...(await original<typeof import('@/stores/ai-busy-store')>()),
  useAiBusyStore: (select: (s: unknown) => unknown) => select({ tokens: [] }),
  aiBusyNow: () => false,
}))

import { StudioTopBar } from '@/components/layout/studio-top-bar'

const bar = () => renderToStaticMarkup(createElement(StudioTopBar, { stage: 'conti' }))
const headerTag = (html: string) => html.match(/<header[^>]*data-testid="studio-top-bar"[^>]*>/)?.[0] ?? ''
const titleSlot = (html: string) => html.match(/<div[^>]*data-testid="top-bar-title"[^>]*>/)?.[0] ?? ''

describe('위 막대의 프로젝트 이름', () => {
  it('좁은 폭에서도 위 막대의 프로젝트 이름과 연필은 0 폭으로 사라지지 않는다 — 한 줄에 다 못 들면 이름 칸이 다음 줄로 내려가고, 그 줄보다 길면 말줄임으로 줄어든다', () => {
    // 왜(리드 2026-11-23 QA ① · D1 영향): 창 768(채팅 열림) · 400 에서 [씬 스토리 | 콘티]가 자리를 차지해 이름이 0 폭이 됐고, 400 에서는 연필도 막대 밖으로 밀렸다.
    //   이름 칸은 최소 폭(4.5rem — 연필과 두어 글자)을 갖고, 그 폭도 한 줄에 남지 않으면 막대가 줄을 바꿔 이름 칸을 다음 줄로 내린다.
    const html = bar()
    expect(headerTag(html)).toContain('flex-wrap')
    const slot = titleSlot(html)
    expect(slot).toContain('basis-[4.5rem]')
    expect(slot).toContain('min-w-0')
    // 그 줄보다 긴 이름은 말줄임으로 줄고, 연필은 줄지 않는다.
    expect(html).toMatch(/<span class="truncate">지하철 창문 속 또 다른 나<\/span>/)
    expect(html).toMatch(/<svg[^>]*class="size-5 shrink-0/)
  })

  it('넓은 폭에서는 위 막대가 지금처럼 한 줄이고 이름 칸은 이름 길이까지만 늘어난다', () => {
    // 왜: 정상 경로 고정 — 1440 에서는 칩 · 두 칸 · 이름 · 연필이 지금처럼 한 줄이고, 이름 칸이 오른쪽 단추 자리까지 늘어나 단추를 밀지 않는다.
    const slot = titleSlot(bar())
    expect(slot).toContain('grow')
    expect(slot).toContain('max-w-max')
  })
})
