// project-share-demo-mode — 데모 세션 window.fetch 가드.
// 데모 부팅 시 1회 설치. 목적: /api/* 백엔드 호출을 실제로 안 나가게 중립화("척").
//   - /api/share/* : 통과(스냅샷 로드).
//   - 그 외 /api/* GET(read): 빈 성공(스토어는 스냅샷 hydrate + supabase shim 으로 읽음).
//   - 그 외 /api/* write/generate: no-op 성공(생성 애니만, 실제 실행/과금 없음).
//   - non-/api, blob: 그대로 통과.
// 서버 403 가드가 백스톱 — 이 클라 패치를 우회해도 서버가 끊는다.

import { isDemoSession } from './context'

export type DemoFetchDecision = 'passthrough' | 'read-noop' | 'write-noop'

/** URL+메서드 → 데모 처리 방식(순수 함수, 테스트 가능). */
export function classifyDemoFetch(url: string, method: string): DemoFetchDecision {
  const isApi = /(^|\/)api\//.test(url)
  const isShare = /(^|\/)api\/share(\/|$)/.test(url)
  if (!isApi || isShare) return 'passthrough'
  return method.toUpperCase() === 'GET' ? 'read-noop' : 'write-noop'
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

let installed = false

/** 데모 세션이면 window.fetch 를 가드로 교체(멱등). */
export function installDemoFetchGuard(): void {
  if (installed) return
  if (typeof window === 'undefined') return
  if (!isDemoSession()) return
  installed = true

  const original = window.fetch.bind(window)
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url
    const method =
      init?.method ??
      (typeof input !== 'string' && !(input instanceof URL)
        ? input.method
        : 'GET')

    const decision = classifyDemoFetch(url, method)
    if (decision === 'passthrough') return original(input, init)
    if (decision === 'read-noop') return jsonResponse({}, 200)
    return jsonResponse({ ok: true, demo: true }, 200)
  }
}
