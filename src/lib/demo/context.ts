// project-share-demo-mode — 데모 세션 컨텍스트(클라 + 공유 상수).
//
// 데모 판정 = `demo_share` 쿠키 존재(비-httpOnly: 클라가 읽어 데모 여부 판정, 서버는 요청 쿠키로 가드).
//   토큰은 이미 공유 링크 URL 에 노출된 값이라 비밀이 아니다 — 읽기전용 데모 열람만 허용.
// 스냅샷은 모듈 싱글턴에 보관(클라 네비게이션 간 유지). 전체 새로고침 시엔 studio 부팅이 쿠키 토큰으로 재fetch.

import type { ProjectSnapshot } from './types'

export const DEMO_SHARE_COOKIE = 'demo_share'

/** 클라: demo_share 쿠키가 있으면 데모 세션. SSR/노드 컨텍스트에선 false. */
export function isDemoSession(): boolean {
  if (typeof document === 'undefined') return false
  return document.cookie
    .split('; ')
    .some((c) => c.startsWith(`${DEMO_SHARE_COOKIE}=`))
}

/** 쿠키에서 공유 토큰 추출(없으면 null). */
export function readDemoToken(): string | null {
  if (typeof document === 'undefined') return null
  const hit = document.cookie
    .split('; ')
    .find((c) => c.startsWith(`${DEMO_SHARE_COOKIE}=`))
  if (!hit) return null
  return decodeURIComponent(hit.slice(DEMO_SHARE_COOKIE.length + 1))
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
  return _snapshot?.tables[table] ?? []
}
