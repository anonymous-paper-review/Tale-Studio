// 로그인 화면은 고른 언어로 표시하고, 새 계정이 필요한 사람에게 회원가입 링크를 제공한다.
import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { isValidElement, type ReactElement, type ReactNode } from 'react'

const mocks = vi.hoisted(() => ({ slots: [] as unknown[], cursor: 0, locale: 'ko' as 'ko' | 'en' }))

vi.mock('react', async (original) => ({
  ...await original<typeof import('react')>(),
  useState: (initial: unknown) => {
    const slot = mocks.cursor++
    if (!(slot in mocks.slots)) mocks.slots[slot] = initial
    return [mocks.slots[slot], (value: unknown) => { mocks.slots[slot] = value }]
  },
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }) }))
// 화면 함수를 React 밖에서 부른다 — 번역 훅만 고른 언어의 번역 함수로 바꿔 끼운다.
vi.mock('@/lib/i18n', async (original) => {
  const actual = await original<typeof import('@/lib/i18n')>()
  return { ...actual, useT: () => (text: string, params?: Record<string, string | number>) => actual.translate(mocks.locale, text, params) }
})
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ auth: { signInWithOAuth: vi.fn() } }) }))

import LoginPage from '@/app/login/page'

type Element = ReactElement<Record<string, unknown>>
function elements(node: ReactNode): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements)
  if (!isValidElement<Record<string, unknown>>(node)) return []
  return [node, ...elements(node.props.children as ReactNode)]
}
/** 화면에 보이는 글 — 글 조각과 입력칸 자리표시. */
function texts(): string[] {
  mocks.cursor = 0
  const nodes = elements(LoginPage())
  const out: string[] = []
  for (const node of nodes) {
    const children = node.props.children
    for (const child of Array.isArray(children) ? children : [children]) if (typeof child === 'string') out.push(child)
    if (typeof node.props.placeholder === 'string') out.push(node.props.placeholder)
  }
  return out
}
const source = () => readFileSync('src/app/login/page.tsx', 'utf8')

beforeEach(() => {
  mocks.slots = []
  mocks.cursor = 0
})

describe('로그인 화면', () => {
  // 왜: 한국어로 쓰던 사람이 로그인 화면에서만 영어를 보게 되지 않게 — 다른 화면과 같은 화면 언어를 따른다.
  it('한국어 화면이면 Google로 계속하기 · 또는 · 이메일 · 비밀번호 · 로그인이 한국어로 보인다', () => {
    mocks.locale = 'ko'
    const shown = texts()
    for (const text of ['Google로 계속하기', '또는', '이메일', '비밀번호', '로그인']) expect(shown, text).toContain(text)
  })

  // 왜: 정상 경로 고정 — 영어 화면은 지금까지와 같은 영어 글이다.
  it('영어 화면이면 Continue with Google · Email · Password · Log in 이 영어로 보인다', () => {
    mocks.locale = 'en'
    const shown = texts()
    for (const text of ['Continue with Google', 'Email', 'Password', 'Log in']) expect(shown, text).toContain(text)
  })

  // 왜: 시안 R1 바탕 — 랜딩 히어로와 같은 방식(단계 색 흐린 빛)으로 빨강(Writer) · 파랑(Storyboard) 두 빛을 깐다.
  it('로그인 바탕에는 랜딩과 같은 방식으로 빨강 · 파랑 흐린 빛을 깐다', () => {
    const page = source()
    expect(page).toContain('bg-stage-writer/10')
    expect(page).toContain('bg-stage-storyboard/10')
    expect(page).toContain('blur-[80px]')
  })

  // 왜: 이메일·비밀번호·닉네임 가입 요청에 따라 Google 계정 없이도 가입 화면을 찾을 수 있어야 한다.
  it('새 계정이 필요한 방문자이면 로그인 화면에서 가입하기 링크를 볼 수 있다', () => {
    mocks.locale = 'ko'
    expect(texts()).toContain('가입하기')
    mocks.cursor = 0
    expect(elements(LoginPage()).some(node => node.props.href === '/signup')).toBe(true)
    mocks.locale = 'en'
    expect(texts()).toContain('Sign up')
  })
})
