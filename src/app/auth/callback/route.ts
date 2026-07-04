import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { sanitizeNextPath, NEXT_PATH_COOKIE } from '@/lib/session-restore'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')

  if (code) {
    const supabase = await createClient()
    await supabase.auth.exchangeCodeForSession(code)
  }

  // 세션 만료 복귀: 로그인 페이지가 심어둔 단명 쿠키(next 경로)로 보던 곳 복원.
  // sanitizeNextPath 가 같은 오리진 상대경로만 통과시킨다 (open redirect 차단).
  const cookieStore = await cookies()
  const rawNext = cookieStore.get(NEXT_PATH_COOKIE)?.value
  const next = sanitizeNextPath(rawNext ? decodeURIComponent(rawNext) : null)

  const res = NextResponse.redirect(`${origin}${next ?? '/#projects'}`)
  if (rawNext) res.cookies.set(NEXT_PATH_COOKIE, '', { path: '/', maxAge: 0 })
  return res
}
