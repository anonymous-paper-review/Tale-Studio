// 로그인 화면에서 Google 인증을 시작하고 보던 화면으로 복귀하며 시작 실패 시 다시 시도할 수 있다.
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { isValidElement, type ReactElement, type ReactNode } from 'react'

const mocks = vi.hoisted(() => ({
  slots: [] as unknown[],
  cursor: 0,
  signInWithOAuth: vi.fn(),
  exchangeCodeForSession: vi.fn(),
  nextCookie: undefined as string | undefined,
}))

vi.mock('react', async (original) => ({
  ...await original<typeof import('react')>(),
  useState: (initial: unknown) => {
    const slot = mocks.cursor++
    if (!(slot in mocks.slots)) mocks.slots[slot] = initial
    return [mocks.slots[slot], (value: unknown) => { mocks.slots[slot] = value }]
  },
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }) }))
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { signInWithOAuth: mocks.signInWithOAuth } }),
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { exchangeCodeForSession: mocks.exchangeCodeForSession } }),
}))
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => mocks.nextCookie ? { value: mocks.nextCookie } : undefined }),
}))

import LoginPage from '@/app/login/page'
import { GET } from '@/app/auth/callback/route'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NEXT_PATH_COOKIE } from '@/lib/session-restore'

type Element = ReactElement<Record<string, unknown>>
function elements(node: ReactNode): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements)
  if (!isValidElement<Record<string, unknown>>(node)) return []
  return [node, ...elements(node.props.children as ReactNode)]
}
function render() {
  mocks.cursor = 0
  return elements(LoginPage())
}
function googleButton(nodes = render()) {
  const button = nodes.find(node => node.type === Button && node.props.type === 'button')
  expect(button).toBeDefined()
  return button!
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.slots = []
  mocks.cursor = 0
  mocks.nextCookie = undefined
  mocks.signInWithOAuth.mockResolvedValue({ data: { provider: 'google', url: 'https://accounts.google.com/' }, error: null })
  mocks.exchangeCodeForSession.mockResolvedValue({ error: null })
  vi.stubGlobal('window', { location: { origin: 'https://tale.test', protocol: 'https:', search: '' } })
  vi.stubGlobal('document', { cookie: '' })
})

afterEach(() => { vi.unstubAllGlobals() })

it('로그인 화면이면 Google 로그인 버튼을 표시한다.', () => {
  const nodes = render()
  expect(googleButton(nodes).props.children).toContain('Continue with Google')
  expect(googleButton(nodes).props.disabled).toBe(false)
  expect(nodes.filter(node => node.type === Input).map(node => node.props.type)).toEqual(['email', 'password'])
  expect(nodes.find(node => node.type === Button && node.props.type === 'submit')?.props.disabled).toBe(false)
})

it('Google 버튼을 누르면 Google 인증을 시작하고, 로그인 후 보던 화면으로 돌아간다.', async () => {
  for (const next of ['/studio/writer?projectId=example', null, 'https://outside.test', '//outside.test']) {
    mocks.slots = []
    window.location.search = next ? `?next=${encodeURIComponent(next)}` : ''
    document.cookie = `${NEXT_PATH_COOKIE}=${encodeURIComponent('/studio/producer?projectId=stale')}`

    await (googleButton().props.onClick as () => Promise<void>)()
    expect(mocks.signInWithOAuth).toHaveBeenLastCalledWith({
      provider: 'google', options: { redirectTo: 'https://tale.test/auth/callback' },
    })
    expect(render().filter(node => node.type === Button).every(node => node.props.disabled)).toBe(true)
    expect(document.cookie).toContain('path=/')
    expect(document.cookie).toContain('samesite=lax')
    const destination = next?.startsWith('/studio/') ? next : null
    if (destination) {
      expect(document.cookie).toContain(`=${encodeURIComponent(destination)};`)
      expect(document.cookie).toContain('max-age=600')
      mocks.nextCookie = encodeURIComponent(destination)
    } else {
      expect(document.cookie).toContain('max-age=0')
      mocks.nextCookie = undefined
    }

    const response = await GET(new Request('https://tale.test/auth/callback?code=valid-code'))
    expect(mocks.exchangeCodeForSession).toHaveBeenLastCalledWith('valid-code')
    expect(response.headers.get('location')).toBe(`https://tale.test${destination ?? '/projects'}`)
    if (destination) expect(response.cookies.get(NEXT_PATH_COOKIE)?.value).toBe('')
  }
})

it('Google 인증을 시작하지 못하면 오류를 알리고 다시 시도할 수 있게 한다.', async () => {
  for (const failure of ['returned', 'thrown']) {
    mocks.slots = []
    const error = new Error('Private provider configuration')
    if (failure === 'returned') mocks.signInWithOAuth.mockResolvedValueOnce({ error })
    else mocks.signInWithOAuth.mockRejectedValueOnce(error)

    await (googleButton().props.onClick as () => Promise<void>)()
    const nodes = render()
    expect(nodes.find(node => node.props.role === 'alert')?.props.children).toBe('Could not sign in with Google. Please try again.')
    expect(nodes.filter(node => node.type === Button).every(node => !node.props.disabled)).toBe(true)
    await (googleButton(nodes).props.onClick as () => Promise<void>)()
    expect(render().some(node => node.props.role === 'alert')).toBe(false)
  }
})
