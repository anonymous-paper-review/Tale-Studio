import { createClient } from './server'
import type { User } from '@supabase/supabase-js'

/**
 * 서버 요청의 로그인 사용자를 돌려준다. 로그인하지 않았으면 null.
 *
 * 왜 getClaims 인가: 예전에는 getUser() 로 요청마다 Supabase 로그인 서버(싱가포르)에
 * 왕복해 1.2~2.4초가 들었고, 폴링 틱마다 그 비용이 붙었다. 이 프로젝트의 JWT 서명키는
 * 비대칭(ES256)이라 getClaims() 가 쿠키의 access token 을 공개키(JWKS, auth-js 가 10분
 * 캐시)로 서버에서 직접 검증한다. 왕복이 없다. 토큰이 만료됐을 때만 refresh 로 왕복한다.
 *
 * 보안 트레이드오프: 토큰 만료(기본 1시간) 전까지는 원격 로그아웃·계정 삭제가 즉시
 * 반영되지 않는다.
 * 서명키가 HS256(대칭) 인 프로젝트에서는 auth-js 가 자동으로 getUser 왕복으로 되돌아간다.
 */
export type AuthUser = Pick<User, 'id' | 'email' | 'user_metadata' | 'app_metadata'>

export async function getUser(): Promise<AuthUser | null> {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.getClaims()
  if (error || !data?.claims) return null
  const claims = data.claims
  return {
    id: claims.sub,
    email: claims.email,
    user_metadata: claims.user_metadata ?? {},
    app_metadata: claims.app_metadata ?? {},
  }
}
