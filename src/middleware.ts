import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { sanitizeNextPath } from '@/lib/session-restore'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Not logged in → redirect to /login (?next= 로 원래 위치 보존 — 세션 만료 후
  // 재로그인 시 보던 스테이지/프로젝트(?projectId 쿼리 포함)로 복귀)
  if (!user && !request.nextUrl.pathname.startsWith('/login')) {
    const url = request.nextUrl.clone()
    const next = sanitizeNextPath(
      request.nextUrl.pathname + request.nextUrl.search,
    )
    url.pathname = '/login'
    url.search = ''
    if (next && next !== '/') url.searchParams.set('next', next)
    return NextResponse.redirect(url)
  }

  // Logged in but on /login → next 가 있으면 그곳으로(검증 통과분만), 없으면 home
  if (user && request.nextUrl.pathname.startsWith('/login')) {
    const next = sanitizeNextPath(request.nextUrl.searchParams.get('next'))
    return NextResponse.redirect(new URL(next ?? '/', request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|auth/callback|api/).*)',
  ],
}
