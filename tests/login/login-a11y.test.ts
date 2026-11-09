// 로그인 칸은 자리표시와 따로 화면 읽기 이름을 갖고, 이메일 로그인 오류는 화면 읽기에 바로 알린다(검토 B2 #2)
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { isValidElement, type ReactElement, type ReactNode } from 'react'

const mocks = vi.hoisted(() => ({ slots: [] as unknown[], cursor: 0 }))

vi.mock('react', async (original) => ({
  ...await original<typeof import('react')>(),
  useState: (initial: unknown) => {
    const slot = mocks.cursor++
    if (!(slot in mocks.slots)) mocks.slots[slot] = initial
    return [mocks.slots[slot], (value: unknown) => { mocks.slots[slot] = value }]
  },
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }) }))
// 화면 함수를 React 밖에서 부른다 — 번역 훅만 한국어 번역 함수로 바꿔 끼운다.
vi.mock('@/lib/i18n', async (original) => {
  const actual = await original<typeof import('@/lib/i18n')>()
  return { ...actual, useT: () => (text: string, params?: Record<string, string | number>) => actual.translate('ko', text, params) }
})
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ auth: { signInWithPassword: vi.fn(), signInWithOAuth: vi.fn() } }) }))

import LoginPage from '@/app/login/page'
import { Input } from '@/components/ui/input'

type Element = ReactElement<Record<string, unknown>>
function elements(node: ReactNode): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements)
  if (!isValidElement<Record<string, unknown>>(node)) return []
  return [node, ...elements(node.props.children as ReactNode)]
}
function render(): Element[] {
  mocks.cursor = 0
  return elements(LoginPage())
}

beforeEach(() => {
  mocks.slots = []
  mocks.cursor = 0
})

describe('로그인 화면 읽기', () => {
  // 왜: 자리표시는 글을 쓰기 시작하면 사라져서 화면 읽기에 칸 이름이 남지 않는다.
  it('이메일 · 비밀번호 칸은 자리표시와 따로 화면 읽기 이름(이메일 · 비밀번호)을 갖는다', () => {
    const inputs = render().filter((node) => node.type === Input)
    expect(inputs.map((node) => [node.props.type, node.props['aria-label']])).toEqual([
      ['email', '이메일'],
      ['password', '비밀번호'],
    ])
  })

  // 왜: Google 로그인 오류처럼, 눈으로 못 보는 사람도 로그인이 안 됐다는 것을 바로 들어야 한다.
  it('이메일 로그인이 안 되면 오류 줄을 화면 읽기에 바로 알린다', () => {
    const form = render().find((node) => node.type === 'form')
    expect(form).toBeDefined()
    // 빈 칸으로 로그인 — 서버에 묻지 않고 같은 일반 오류를 보인다.
    void (form!.props.onSubmit as (e: { preventDefault: () => void }) => Promise<void>)({ preventDefault: () => {} })
    const alert = render().find((node) => node.props.role === 'alert')
    expect(alert?.props.children).toBe('이메일 또는 비밀번호가 맞지 않아요')
  })
})
