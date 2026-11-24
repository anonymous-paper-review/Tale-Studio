// 이메일 가입은 입력을 확인하고 닉네임을 저장하며 로그인 완료와 이메일 확인 대기를 구분한다.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ createClient: vi.fn(), signUp: vi.fn() }))

vi.mock('@/lib/supabase/client', () => ({ createClient: mocks.createClient }))

import { signUpWithEmail, type SignupInput } from '@/lib/supabase/signup'

const INPUT: SignupInput = {
  email: 'creator@tale.test',
  password: 'password123',
  nickname: '이야기꾼',
}
const REDIRECT_TO = 'https://tale.test/auth/callback'
const USER = { id: 'new-user' }
const SESSION = { access_token: 'test-access-token', user: USER }

beforeEach(() => {
  vi.clearAllMocks()
  mocks.createClient.mockReset().mockReturnValue({ auth: { signUp: mocks.signUp } })
  mocks.signUp.mockReset().mockResolvedValue({ data: { user: USER, session: SESSION }, error: null })
})

describe('이메일 가입 요청', () => {
  // 왜: 정상 경로 고정. 가입에 쓴 닉네임이 계정 이름으로 남고 이메일 확인 뒤 원래 사이트로 돌아와야 한다.
  it('세 칸 앞뒤에 공백이 있는 입력이면 공백을 빼고 이메일과 비밀번호와 닉네임으로 가입한다', async () => {
    await expect(signUpWithEmail({
      email: `  ${INPUT.email}  `,
      password: `  ${INPUT.password}  `,
      nickname: `  ${INPUT.nickname}  `,
    }, REDIRECT_TO)).resolves.toBe('signed-in')

    expect(mocks.createClient).toHaveBeenCalledTimes(1)
    expect(mocks.signUp).toHaveBeenCalledTimes(1)
    expect(mocks.signUp).toHaveBeenCalledWith({
      email: INPUT.email,
      password: INPUT.password,
      options: {
        emailRedirectTo: REDIRECT_TO,
        data: { full_name: INPUT.nickname },
      },
    })
  })

  // 왜: 가입 승인 설정을 바꾸지 않고 Supabase가 실제로 돌려준 로그인 상태를 따른다.
  it.each([
    { reason: '사용자 정보와 로그인 상태가 함께 있는 응답', user: USER },
    { reason: '로그인 상태만 있는 응답', user: null },
  ])('$reason이면 로그인 완료를 반환한다', async ({ user }) => {
    mocks.signUp.mockResolvedValueOnce({ data: { user, session: SESSION }, error: null })

    await expect(signUpWithEmail(INPUT, REDIRECT_TO)).resolves.toBe('signed-in')
  })

  // 왜: 이메일 확인을 켠 프로젝트에서는 아직 로그인하지 않은 사람을 작업 화면으로 보내면 안 된다.
  it('사용자 정보만 있고 로그인 상태는 없는 응답이면 이메일 확인 대기를 반환한다', async () => {
    mocks.signUp.mockResolvedValueOnce({ data: { user: USER, session: null }, error: null })

    await expect(signUpWithEmail(INPUT, REDIRECT_TO)).resolves.toBe('confirmation-required')
  })

  // 왜: 정상 경로 고정. 허용한 최소 길이와 최대 길이에 맞춰 쓴 사람의 가입을 막지 않는다.
  it.each([
    { reason: '비밀번호가 8자이고 닉네임이 1자인 입력', nickname: '별' },
    { reason: '비밀번호가 8자이고 닉네임이 40자인 입력', nickname: '별'.repeat(40) },
  ])('$reason이면 가입을 요청한다', async ({ nickname }) => {
    await expect(signUpWithEmail({
      email: INPUT.email,
      password: '  12345678  ',
      nickname: `  ${nickname}  `,
    }, REDIRECT_TO)).resolves.toBe('signed-in')

    expect(mocks.signUp).toHaveBeenCalledWith({
      email: INPUT.email,
      password: '12345678',
      options: { emailRedirectTo: REDIRECT_TO, data: { full_name: nickname } },
    })
  })

  // 왜: 브라우저 검사를 거치지 않는 호출에서도 잘못된 값을 외부 가입 서비스로 보내지 않아야 한다.
  it.each([
    { reason: '이메일이 빈 값인 입력', patch: { email: '' } },
    { reason: '이메일이 공백뿐인 입력', patch: { email: '   ' } },
    { reason: '이메일에 골뱅이가 없는 입력', patch: { email: 'creator.tale.test' } },
    { reason: '이메일에 사용자 이름이 없는 입력', patch: { email: '@tale.test' } },
    { reason: '이메일에 도메인이 없는 입력', patch: { email: 'creator@' } },
    { reason: '이메일 중간에 공백이 있는 입력', patch: { email: 'cre ator@tale.test' } },
    { reason: '비밀번호가 빈 값인 입력', patch: { password: '' } },
    { reason: '비밀번호가 공백뿐인 입력', patch: { password: '        ' } },
    { reason: '비밀번호가 7자인 입력', patch: { password: '1234567' } },
    { reason: '앞뒤 공백을 빼면 비밀번호가 7자인 입력', patch: { password: '  1234567  ' } },
    { reason: '닉네임이 빈 값인 입력', patch: { nickname: '' } },
    { reason: '닉네임이 공백뿐인 입력', patch: { nickname: '   ' } },
    { reason: '닉네임이 41자인 입력', patch: { nickname: '별'.repeat(41) } },
  ])('$reason이면 가입 요청을 보내지 않고 오류를 반환한다', async ({ patch }) => {
    await expect(signUpWithEmail({ ...INPUT, ...patch }, REDIRECT_TO)).rejects.toThrow()

    expect(mocks.signUp).not.toHaveBeenCalled()
  })

  // 왜: 외부 서비스가 실패를 돌려줬는데 사용자 정보가 있다고 가입 성공으로 처리하면 안 된다.
  it.each([
    { reason: '오류만 있는 응답', data: { user: null, session: null } },
    { reason: '로그인 상태와 오류가 함께 있는 응답', data: { user: USER, session: SESSION } },
  ])('$reason이면 가입 실패를 알리는 오류를 반환한다', async ({ data }) => {
    mocks.signUp.mockResolvedValueOnce({ data, error: new Error('Private provider response') })

    await expect(signUpWithEmail(INPUT, REDIRECT_TO)).rejects.toThrow()
  })

  // 왜: 네트워크가 끊기거나 인증 서비스가 예외를 던진 호출도 성공으로 보이면 안 된다.
  it('가입 요청 중 예외가 발생한 상황이면 가입 실패를 알리는 오류를 반환한다', async () => {
    mocks.signUp.mockRejectedValueOnce(new Error('Private provider exception'))

    await expect(signUpWithEmail(INPUT, REDIRECT_TO)).rejects.toThrow()
  })

  // 왜: 사용자도 로그인 상태도 없는 빈 응답을 이메일 확인 대기로 잘못 안내하지 않는다.
  it.each([
    { reason: '사용자와 로그인 상태가 모두 없는 응답', data: { user: null, session: null } },
    { reason: '가입 결과가 비어 있는 응답', data: {} },
  ])('$reason이면 가입 실패를 알리는 오류를 반환한다', async ({ data }) => {
    mocks.signUp.mockResolvedValueOnce({ data, error: null })

    await expect(signUpWithEmail(INPUT, REDIRECT_TO)).rejects.toThrow()
  })
})
