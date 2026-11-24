// 가입 화면은 이메일과 비밀번호와 닉네임만 받고 가입 결과를 알리며 안전한 복귀 경로를 유지한다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isValidElement, type ReactElement, type ReactNode } from 'react'

const mocks = vi.hoisted(() => ({
  slots: [] as unknown[],
  cursor: 0,
  effects: [] as Array<() => void>,
  locale: 'en' as 'en' | 'ko',
  translatedKeys: [] as string[],
  signUp: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
}))

// 칸의 순서를 가정하지 않고 실제 입력 이벤트와 재렌더로 화면 상태를 바꾼다.
vi.mock('react', async (original) => ({
  ...await original<typeof import('react')>(),
  useState: (initial: unknown) => {
    const slot = mocks.cursor++
    if (!(slot in mocks.slots)) mocks.slots[slot] = typeof initial === 'function' ? initial() : initial
    return [mocks.slots[slot], (value: unknown) => {
      mocks.slots[slot] = typeof value === 'function' ? value(mocks.slots[slot]) : value
    }]
  },
  useRef: (initial: unknown) => {
    const slot = mocks.cursor++
    if (!(slot in mocks.slots)) mocks.slots[slot] = { current: initial }
    return mocks.slots[slot]
  },
  useEffect: (effect: () => void, dependencies?: unknown[]) => {
    const slot = mocks.cursor++
    const previous = mocks.slots[slot] as unknown[] | undefined
    if (previous && dependencies && previous.length === dependencies.length
      && dependencies.every((value, index) => Object.is(value, previous[index]))) return
    mocks.slots[slot] = dependencies
    mocks.effects.push(effect)
  },
}))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mocks.replace, refresh: mocks.refresh }),
}))
vi.mock('@/lib/i18n', async (original) => {
  const actual = await original<typeof import('@/lib/i18n')>()
  return { ...actual, useT: () => (text: string, params?: Record<string, string | number>) => {
    mocks.translatedKeys.push(text)
    return actual.translate(mocks.locale, text, params)
  } }
})
// 가입 서비스는 실제 함수를 거친다. 화면에서 외부 가입 요청까지 이어지는 경계를 확인한다.
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { signUp: mocks.signUp } }),
}))

import SignupPage from '@/app/signup/page'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

const SIGNUP_ERROR = 'Could not create your account. Check your details or try logging in.'
const CONFIRMATION_MESSAGE = 'Check your email to confirm your account. If you already have an account, log in.'
const SIGNED_IN_RESPONSE = {
  data: { user: { id: 'new-user' }, session: { access_token: 'test-access-token' } },
  error: null,
}
const VALID_FIELDS = {
  email: 'creator@tale.test',
  password: 'password123',
  nickname: '이야기꾼',
}
const SAFE_NEXT = '/studio/writer?projectId=example&view=script#scene-2'

type Element = ReactElement<Record<string, unknown>>
type FieldType = 'email' | 'password' | 'text'

function elements(node: ReactNode): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements)
  if (!isValidElement<Record<string, unknown>>(node)) return []
  return [node, ...elements(node.props.children as ReactNode)]
}
function textContent(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textContent).join('')
  if (!isValidElement<Record<string, unknown>>(node)) return ''
  return textContent(node.props.children as ReactNode)
}
function render(): Element[] {
  mocks.cursor = 0
  const nodes = elements(SignupPage())
  if (mocks.effects.length === 0) return nodes
  for (const effect of mocks.effects.splice(0)) effect()
  mocks.cursor = 0
  return elements(SignupPage())
}
function input(type: FieldType, nodes = render()): Element {
  const field = nodes.find(node => node.type === Input && node.props.type === type)
  expect(field).toBeDefined()
  return field!
}
function fill(type: FieldType, value: string): void {
  const field = input(type)
  ;(field.props.onChange as (event: { target: { value: string } }) => void)({ target: { value } })
}
function fillForm(fields = VALID_FIELDS): void {
  fill('email', fields.email)
  fill('password', fields.password)
  fill('text', fields.nickname)
}
function submitButton(nodes = render()): Element {
  const button = nodes.find(node => node.type === Button && node.props.type === 'submit')
  expect(button).toBeDefined()
  return button!
}
async function submit(nodes = render()): Promise<void> {
  const form = nodes.find(node => node.type === 'form')
  expect(form).toBeDefined()
  const event = { preventDefault: vi.fn() }
  await (form!.props.onSubmit as (event: { preventDefault: () => void }) => Promise<void>)(event)
  expect(event.preventDefault).toHaveBeenCalled()
}
function loginLinks(nodes = render()): Element[] {
  const links = nodes.filter(node => typeof node.props.href === 'string'
    && new URL(node.props.href, window.location.origin).pathname === '/login')
  expect(links.length).toBeGreaterThan(0)
  for (const link of links) {
    expect(textContent(link)).toContain(mocks.locale === 'ko' ? '로그인' : 'Log in')
  }
  return links
}
function expectLoginNext(expected: string | null, nodes = render()): void {
  for (const link of loginLinks(nodes)) {
    const url = new URL(link.props.href as string, window.location.origin)
    expect(url.origin).toBe(window.location.origin)
    expect(url.searchParams.get('next')).toBe(expected)
  }
}
function alertText(nodes = render()): string {
  const alert = nodes.find(node => node.props.role === 'alert')
  expect(alert).toBeDefined()
  return textContent(alert)
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.slots = []
  mocks.cursor = 0
  mocks.effects = []
  mocks.locale = 'en'
  mocks.translatedKeys = []
  mocks.signUp.mockReset().mockResolvedValue(SIGNED_IN_RESPONSE)
  vi.stubGlobal('window', { location: { origin: 'https://tale.test', protocol: 'https:', search: '' } })
  vi.stubGlobal('document', { cookie: '' })
})

afterEach(() => { vi.unstubAllGlobals() })

describe('가입 화면 입력과 안내', () => {
  // 왜: 정상 경로 고정. 이메일을 계정 주소로 쓰고 별도 아이디나 추가 개인정보를 요구하지 않는다.
  it.each([
    { reason: '영어 화면', locale: 'en' as const, labels: ['Email', 'Password', 'Nickname'] },
    { reason: '한국어 화면', locale: 'ko' as const, labels: ['이메일', '비밀번호', '닉네임'] },
  ])('$reason이면 고른 언어의 이름을 가진 가입 입력칸 세 개만 표시한다', ({ locale, labels }) => {
    mocks.locale = locale
    const nodes = render()
    const fields = nodes.filter(node => node.type === Input)
    expect(fields).toHaveLength(3)
    for (const [index, type] of (['email', 'password', 'text'] as const).entries()) {
      const field = input(type, nodes)
      const label = nodes.find(node => node.type === 'label' && field.props.id
        && node.props.htmlFor === field.props.id)
      const name = field.props['aria-label'] ?? textContent(label)
      expect(name).toBe(labels[index])
    }
    expect(mocks.translatedKeys).toEqual(expect.arrayContaining(['Email', 'Password', 'Nickname']))
    expect(submitButton(nodes).props.disabled).toBe(false)
    expectLoginNext(null, nodes)
    expect(mocks.signUp).not.toHaveBeenCalled()
  })

  // 왜: 입력 장치와 비밀번호 관리자가 칸을 알아보고 브라우저도 필수값과 길이를 검사해야 한다.
  it('가입을 입력하는 화면이면 브라우저의 필수값과 자동 완성과 길이 검사를 설정한다', () => {
    const nodes = render()
    const form = nodes.find(node => node.type === 'form')
    expect(form).toBeDefined()
    expect(typeof form!.props.onSubmit).toBe('function')
    expect(form!.props.noValidate).not.toBe(true)
    expect(input('email', nodes).props).toMatchObject({ required: true, autoComplete: 'email' })
    expect(input('password', nodes).props).toMatchObject({ required: true, autoComplete: 'new-password', minLength: 8 })
    expect(input('text', nodes).props).toMatchObject({ required: true, autoComplete: 'nickname', minLength: 1, maxLength: 40 })
  })

  // 왜: 브라우저 검사를 우회하거나 공백만 입력한 경우에도 잘못된 가입 요청이 나가지 않아야 한다.
  it.each([
    { reason: '이메일이 빈 값인 입력', patch: { email: '' } },
    { reason: '이메일이 공백뿐인 입력', patch: { email: '   ' } },
    { reason: '이메일 형식이 틀린 입력', patch: { email: 'not-an-email' } },
    { reason: '이메일 중간에 공백이 있는 입력', patch: { email: 'cre ator@tale.test' } },
    { reason: '비밀번호가 빈 값인 입력', patch: { password: '' } },
    { reason: '비밀번호가 공백뿐인 입력', patch: { password: '        ' } },
    { reason: '공백을 빼면 비밀번호가 7자인 입력', patch: { password: ' 1234567 ' } },
    { reason: '닉네임이 빈 값인 입력', patch: { nickname: '' } },
    { reason: '닉네임이 공백뿐인 입력', patch: { nickname: '   ' } },
    { reason: '닉네임이 41자인 입력', patch: { nickname: '별'.repeat(41) } },
  ])('$reason이면 가입 요청을 보내지 않고 고칠 수 있게 안내한다', async ({ patch }) => {
    fillForm({ ...VALID_FIELDS, ...patch })

    await submit()

    const nodes = render()
    expect(mocks.signUp).not.toHaveBeenCalled()
    expect(alertText(nodes)).toBe(SIGNUP_ERROR)
    expect(mocks.translatedKeys).toContain(SIGNUP_ERROR)
    expect(submitButton(nodes).props.disabled).toBe(false)
    expect(mocks.replace).not.toHaveBeenCalled()
    expect(mocks.refresh).not.toHaveBeenCalled()
    expectLoginNext(null, nodes)
  })

  // 왜: 정상 경로 고정. 실제 입력 이벤트로 받은 닉네임을 계정 이름에 저장하고 현재 사이트에서 이메일 확인을 마친다.
  it('공백을 포함한 올바른 가입 정보이면 값을 정리해 가입하고 프로젝트 목록으로 이동한다', async () => {
    fillForm({
      email: `  ${VALID_FIELDS.email}  `,
      password: `  ${VALID_FIELDS.password}  `,
      nickname: `  ${VALID_FIELDS.nickname}  `,
    })

    await submit()

    expect(mocks.signUp).toHaveBeenCalledTimes(1)
    expect(mocks.signUp).toHaveBeenCalledWith({
      email: VALID_FIELDS.email,
      password: VALID_FIELDS.password,
      options: {
        emailRedirectTo: 'https://tale.test/auth/callback',
        data: { full_name: VALID_FIELDS.nickname },
      },
    })
    expect(mocks.replace).toHaveBeenCalledExactlyOnceWith('/projects')
    expect(mocks.refresh).toHaveBeenCalledTimes(1)
  })

  // 왜: 이메일 확인이 필요한 가입을 로그인 완료로 오해하지 않고 기존 계정의 로그인 경로도 찾을 수 있어야 한다.
  it('사용자 정보만 있고 로그인 상태는 없는 응답이면 이메일 확인과 로그인 안내를 표시한다', async () => {
    window.location.search = `?next=${encodeURIComponent(SAFE_NEXT)}`
    mocks.signUp.mockResolvedValueOnce({ data: { user: { id: 'new-user' }, session: null }, error: null })
    fillForm()

    await submit()

    const nodes = render()
    const status = nodes.find(node => node.props.role === 'status')
    expect(status).toBeDefined()
    expect(textContent(status)).toContain(CONFIRMATION_MESSAGE)
    expect(mocks.translatedKeys).toContain(CONFIRMATION_MESSAGE)
    expect(nodes.some(node => node.props.role === 'alert')).toBe(false)
    expect(mocks.replace).not.toHaveBeenCalled()
    expect(mocks.refresh).not.toHaveBeenCalled()
    expectLoginNext(SAFE_NEXT, nodes)
  })

  // 왜: 확인 메일을 기다리는 동안 재요청하면 첫 확인 링크에 필요한 브라우저 인증값이 바뀔 수 있다.
  it('이메일 확인 안내가 나온 상태이면 입력과 재제출을 막고 첫 확인 링크를 유지한다', async () => {
    mocks.signUp.mockResolvedValueOnce({ data: { user: { id: 'new-user' }, session: null }, error: null })
    fillForm()
    const originalForm = render()

    await submit(originalForm)

    const nodes = render()
    expect(submitButton(nodes).props.disabled).toBe(true)
    for (const type of ['email', 'password', 'text'] as const) {
      expect(input(type, nodes).props.disabled).toBe(true)
    }
    await submit(nodes)
    await submit(originalForm)
    expect(mocks.signUp).toHaveBeenCalledTimes(1)
    expect(textContent(render().find(node => node.props.role === 'status'))).toContain(CONFIRMATION_MESSAGE)
  })

  // 왜: 인증 서비스의 내부 사유나 계정 존재 여부를 화면에 드러내지 않고 실패 뒤 다시 가입할 수 있게 한다.
  it.each([
    { reason: '가입 서비스가 오류를 돌려주는 상황', mode: 'returned' },
    { reason: '가입 서비스가 예외를 던지는 상황', mode: 'thrown' },
    { reason: '가입 서비스가 빈 결과를 돌려주는 상황', mode: 'empty' },
  ])('$reason이면 일반 오류만 표시하고 다시 제출할 수 있게 복구한다', async ({ mode }) => {
    const privateMessage = 'Private provider configuration: account already exists'
    if (mode === 'returned') {
      mocks.signUp.mockResolvedValueOnce({ data: { user: null, session: null }, error: new Error(privateMessage) })
    } else if (mode === 'thrown') {
      mocks.signUp.mockRejectedValueOnce(new Error(privateMessage))
    } else {
      mocks.signUp.mockResolvedValueOnce({ data: { user: null, session: null }, error: null })
    }
    fillForm()

    await submit()

    const failedNodes = render()
    expect(alertText(failedNodes)).toBe(SIGNUP_ERROR)
    expect(mocks.translatedKeys).toContain(SIGNUP_ERROR)
    expect(failedNodes.map(node => textContent(node)).join(' ')).not.toContain(privateMessage)
    expect(submitButton(failedNodes).props.disabled).toBe(false)
    expect(mocks.replace).not.toHaveBeenCalled()
    expect(mocks.refresh).not.toHaveBeenCalled()
    expectLoginNext(null, failedNodes)

    await submit(failedNodes)

    expect(mocks.signUp).toHaveBeenCalledTimes(2)
    expect(render().some(node => node.props.role === 'alert')).toBe(false)
    expect(mocks.replace).toHaveBeenCalledExactlyOnceWith('/projects')
    expect(mocks.refresh).toHaveBeenCalledTimes(1)
  })

  // 왜: 버튼을 빠르게 두 번 누르거나 같은 제출 이벤트가 이어져도 가입 요청이 중복으로 나가지 않아야 한다.
  it('가입 결과를 기다리는 상황이면 제출 버튼을 막고 연속 제출을 한 번만 처리한다', async () => {
    let finish!: (value: typeof SIGNED_IN_RESPONSE) => void
    mocks.signUp.mockReturnValueOnce(new Promise<typeof SIGNED_IN_RESPONSE>((resolve) => { finish = resolve }))
    fillForm()
    const nodes = render()

    const first = submit(nodes)
    const second = submit(nodes)
    try {
      const pendingNodes = render()
      expect(submitButton(pendingNodes).props.disabled).toBe(true)
      expect(mocks.signUp).toHaveBeenCalledTimes(1)
      expect(mocks.replace).not.toHaveBeenCalled()
      expect(mocks.refresh).not.toHaveBeenCalled()
      expectLoginNext(null, pendingNodes)
    } finally {
      finish(SIGNED_IN_RESPONSE)
      await Promise.all([first, second])
    }
    expect(mocks.signUp).toHaveBeenCalledTimes(1)
    expect(mocks.replace).toHaveBeenCalledTimes(1)
    expect(mocks.refresh).toHaveBeenCalledTimes(1)
  })
})

describe('가입 뒤 복귀 경로', () => {
  const paths = [
    { reason: '보던 작업 화면이 있는 주소', next: SAFE_NEXT, expected: SAFE_NEXT },
    { reason: '보던 프로젝트 목록이 있는 주소', next: '/projects?view=grid', expected: '/projects?view=grid' },
    { reason: '복귀 경로가 없는 주소', next: null, expected: null },
    { reason: '외부 사이트를 가리키는 복귀 주소', next: 'https://outside.test/steal', expected: null },
    { reason: '사이트 이름부터 시작하는 복귀 주소', next: '//outside.test/steal', expected: null },
    { reason: '역슬래시로 외부 사이트를 가리키는 복귀 주소', next: '/\\outside.test/steal', expected: null },
    { reason: '상대 폴더로 시작하는 복귀 주소', next: 'studio/writer', expected: null },
    { reason: '로그인 화면으로 되돌아가는 복귀 주소', next: '/login?next=%2Fprojects', expected: null },
    { reason: '가입 화면으로 되돌아가는 복귀 주소', next: '/signup?next=%2Fprojects', expected: null },
    { reason: '너무 긴 복귀 주소', next: `/${'a'.repeat(2000)}`, expected: null },
  ]

  // 왜: 정상 경로 고정과 외부 주소 차단. 가입 뒤 실제로 로그인된 사람만 안전한 작업 화면으로 돌아간다.
  it.each(paths)('$reason이면 로그인 완료 뒤 안전한 경로로 이동하고 화면을 갱신한다', async ({ next, expected }) => {
    window.location.search = next === null ? '' : `?next=${encodeURIComponent(next)}`
    fillForm()

    await submit()

    expect(mocks.replace).toHaveBeenCalledExactlyOnceWith(expected ?? '/projects')
    expect(mocks.refresh).toHaveBeenCalledTimes(1)
  })

  // 왜: 가입 대신 로그인하기로 바꿔도 보던 화면을 잃지 않고 위험한 주소를 다음 화면으로 전달하지 않는다.
  it.each(paths)('$reason이면 로그인으로 돌아가는 링크에 안전한 복귀 경로만 유지한다', ({ next, expected }) => {
    window.location.search = next === null ? '' : `?next=${encodeURIComponent(next)}`

    expectLoginNext(expected)
  })
})
