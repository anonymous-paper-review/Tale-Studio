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

  // 공개 경로: 로그인 전에도 볼 수 있는 랜딩(홈)·로그인 페이지.
  // 그 외(스튜디오/디자인 등)는 로그인 필요 — 접근 시 /login 으로 보냄.
  const { pathname } = request.nextUrl
  // 정적 에셋(public/ 의 확장자 파일)은 로그인 불필요 — public/ 은 본래 공개 자산.
  //   fal.ai 가 익명으로 fetch 하는 character-template.png 가 /login 으로 리다이렉트되면 edit 모델이
  //   참조 이미지 대신 로그인 HTML 을 받아 캐릭터 턴어라운드가 정면샷으로 깨졌다 (2026-07-11 수정).
  const isPublicAsset = /\.(?:png|jpe?g|gif|svg|webp|avif|ico)$/i.test(pathname)
  // 공유 데모(project-share-demo-mode): /share 링크는 공개, demo_share 쿠키 소지 시 /studio 도
  //   로그인 없이 읽기전용 열람. 실제 백엔드 쓰기·생성은 서버 403 가드 + 클라 seam 이 차단.
  const isSharePath = pathname.startsWith('/share')
  const hasDemoShare = request.cookies.has('demo_share')
  const isPublicPath =
    pathname === '/' ||
    pathname.startsWith('/login') ||
    isPublicAsset ||
    isSharePath ||
    (hasDemoShare && pathname.startsWith('/studio'))
  // 서버측 쿠키 세팅(project-share-demo-mode 강건화, 2026-07-15): 기존엔 /share 페이지가
  //   document.cookie 로만 demo_share 를 심었는데, JS 쿠키 쓰기가 막힌 브라우저(시크릿 "모든
  //   쿠키 차단"·일부 인앱 브라우저)에선 쿠키가 안 박혀 /studio 진입이 /login 으로 튕겼다.
  //   미들웨어가 Set-Cookie 로 직접 심으면 HTTP 쿠키만 허용돼도 데모 진입이 성립한다.
  //   토큰 형태(64-hex)만 세팅 — 아무 /share/* 경로로 쿠키가 오염되지 않게. 유효성은
  //   /api/share/<token> 이 게이트하므로 여기선 DB 왕복 없이 형태만 본다.
  const shareToken = isSharePath ? pathname.split('/')[2] : undefined
  if (shareToken && /^[0-9a-f]{64}$/i.test(shareToken)) {
    supabaseResponse.cookies.set('demo_share', shareToken, {
      path: '/',
      sameSite: 'lax',
    })
  }

  // 데모 탈출(project-share-demo-mode): demo_share 쿠키는 path=/ 무만료라 share 링크를 한 번 열면
  //   홈/로그인/실 스튜디오까지 사이트 전체가 데모모드(createClient→shim)로 오염된다. 데모는 /share·/studio
  //   에서만 유효하므로, 실제 진입면(홈·로그인)에 도달하면 쿠키를 만료시켜 실 세션/인증을 복구한다.
  //   (share 링크 재진입 시 /share 페이지가 쿠키를 다시 세팅한다.)
  if (hasDemoShare && (pathname === '/' || pathname.startsWith('/login'))) {
    supabaseResponse.cookies.set('demo_share', '', { path: '/', maxAge: 0 })
    request.cookies.delete('demo_share')
  }

  // 리다이렉트 응답에도 getUser()가 방금 갱신한 세션 쿠키를 실어 보낸다.
  // (누락 시 토큰 갱신 타이밍에 걸린 유저가 로그인 ↔ 목적지 무한루프에 빠짐 — Supabase SSR 필수 패턴)
  const redirectWithSession = (url: URL) => {
    const res = NextResponse.redirect(url)
    supabaseResponse.cookies.getAll().forEach((c) => res.cookies.set(c))
    return res
  }

  // Not logged in & 보호 경로 → /login (?next= 로 원래 위치 보존 — 세션 만료 후
  // 재로그인 시 보던 스테이지/프로젝트(?projectId 쿼리 포함)로 복귀)
  if (!user && !isPublicPath) {
    const url = request.nextUrl.clone()
    const next = sanitizeNextPath(
      request.nextUrl.pathname + request.nextUrl.search,
    )
    url.pathname = '/login'
    url.search = ''
    if (next && next !== '/') url.searchParams.set('next', next)
    return redirectWithSession(url)
  }

  // Logged in but on /login → next 가 있으면 그곳으로(검증 통과분만), 없으면 home
  if (user && request.nextUrl.pathname.startsWith('/login')) {
    const next = sanitizeNextPath(request.nextUrl.searchParams.get('next'))
    return redirectWithSession(new URL(next ?? '/', request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    // 정적 이미지 에셋은 미들웨어 자체를 건너뛴다 (public/ 은 공개 + getUser 왕복 절약).
    '/((?!_next/static|_next/image|favicon.ico|auth/callback|api/|.*\\.(?:png|jpg|jpeg|gif|svg|webp|avif|ico)$).*)',
  ],
}
