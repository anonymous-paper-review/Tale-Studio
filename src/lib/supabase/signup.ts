import { z } from 'zod'
import { createClient } from './client'

export type SignupInput = {
  email: string
  password: string
  nickname: string
}

const signupSchema = z.object({
  email: z.string().trim().pipe(z.email()),
  password: z.string().trim().min(8),
  nickname: z.string().trim().min(1).max(40),
})

export async function signUpWithEmail(
  input: SignupInput,
  emailRedirectTo: string,
): Promise<'signed-in' | 'confirmation-required'> {
  try {
    const { email, password, nickname } = signupSchema.parse(input)
    const supabase = createClient()
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo,
        data: { full_name: nickname },
      },
    })

    if (error) throw error
    if (data?.session) return 'signed-in'
    if (data?.user && data.session === null) return 'confirmation-required'
    throw new Error('Missing signup result')
  } catch {
    // 검증 상세와 외부 인증 서비스의 원본 오류를 호출자에게 전달하지 않는다.
    throw new Error('Could not create account')
  }
}
