// project-share-demo-mode — 데모 세션 컨텍스트(클라 + 공유 상수).
//
// 데모 판정(우선순위): demo_share 쿠키 → URL ?share= 티켓 → 세션 스티키(모듈 메모리).
//   URL 티켓(2026-07-15): 쿠키가 전면 차단된 브라우저(시크릿 강화 설정·일부 인앱)에서도
//   공유 링크가 무조건 열리도록, 주소에 실린 토큰 자체를 입장권으로 인정한다(노션 공유 방식).
//   토큰은 이미 공유 링크 URL 에 노출된 값이라 비밀이 아니다 — 읽기전용 데모 열람만 허용.
// 스냅샷은 모듈 싱글턴에 보관(클라 네비게이션 간 유지). 전체 새로고침 시엔 studio 부팅이 토큰으로 재fetch.

import type { ProjectSnapshot } from './types'

export const DEMO_SHARE_COOKIE = 'demo_share'

// 공유 토큰 형태(64-hex) — api/share/route.ts newToken()(uuid 2개 연결) 산출 형태.
const SHARE_TOKEN_RE = /^[0-9a-f]{64}$/i

// 세션 스티키: 한 번 본 토큰을 SPA 세션 동안 기억 — 스테이지 이동 중 URL 쿼리가 잠깐
//   빠지는 틈에도 데모 판정이 안 끊기게. /share·/studio 표면에서만 유효(아래 readDemoToken).
let _stickyToken: string | null = null

/** location.search 에서 share 티켓 추출(형태 검증). 순수 함수 — 테스트 가능. */
export function parseShareParam(search: string): string | null {
  const t = new URLSearchParams(search).get('share')
  return t && SHARE_TOKEN_RE.test(t) ? t : null
}

/** /share 진입점이 호출 — 쿠키가 안 박히는 브라우저에서도 SPA 세션 내 데모 유지. */
export function setDemoToken(token: string): void {
  if (SHARE_TOKEN_RE.test(token)) _stickyToken = token
}

function cookieToken(): string | null {
  const hit = document.cookie
    .split('; ')
    .find((c) => c.startsWith(`${DEMO_SHARE_COOKIE}=`))
  if (!hit) return null
  return decodeURIComponent(hit.slice(DEMO_SHARE_COOKIE.length + 1)) || null
}

/** 데모 토큰(없으면 null): 쿠키 → URL ?share= → 스티키. SSR/노드 컨텍스트에선 null. */
export function readDemoToken(): string | null {
  if (typeof document === 'undefined') return null
  const path = window.location.pathname
  // 데모 표면(/share·/studio) 밖(홈·로그인·랜딩)에선 쿠키만 인정 — 미들웨어의
  //   데모 탈출(홈·로그인 도달 시 쿠키 만료)과 정합. 스티키가 실 진입면을 오염시키지 않게.
  if (!path.startsWith('/share') && !path.startsWith('/studio')) return cookieToken()
  const token =
    cookieToken() ?? parseShareParam(window.location.search) ?? _stickyToken
  if (token) _stickyToken = token
  return token
}

/** 클라: 데모 세션 여부. SSR/노드 컨텍스트에선 false. */
export function isDemoSession(): boolean {
  return readDemoToken() !== null
}

/** 데모면 경로에 share 티켓 쿼리를 이어붙인다 — 쿠키 없이도 스테이지 이동·새로고침 생존. */
export function withDemoShare(path: string): string {
  const token = readDemoToken()
  if (!token) return path
  return `${path}${path.includes('?') ? '&' : '?'}share=${token}`
}

let _snapshot: ProjectSnapshot | null = null

export function setDemoSnapshot(snapshot: ProjectSnapshot | null): void {
  _snapshot = snapshot
}

export function getDemoSnapshot(): ProjectSnapshot | null {
  return _snapshot
}

/** 스냅샷의 특정 테이블 행들(없으면 빈 배열). supabase 데모 shim 이 읽는다. */
export function demoTableRows(table: string): Record<string, unknown>[] {
  // projects 행은 스냅샷 최상위(snapshot.project)에 있고 tables[] 에는 없다.
  //   from('projects').eq('id',…).single() 이 shim 에서 동작하도록 단일 행 배열로 서빙.
  if (table === 'projects') {
    return _snapshot?.project ? [_snapshot.project as Record<string, unknown>] : []
  }
  return _snapshot?.tables[table] ?? []
}
