// 서버에 저장한 편집(editor_states) 읽기 · 이 브라우저가 마지막으로 본 서버 저장 시각 (E2b, 결정 페이지 "나머지는 추천대로" 2026-11-14).
//
//   예전에는 Editor 가 이 브라우저 저장본만 읽고 서버에는 쓰기만 해서, 다른 브라우저(또는 저장 공간을 비운 브라우저)가 연
//   처음 상태가 서버 편집을 덮었다(QA 2026-11-10 E2b, 운영 3945d1e6). 이제 열 때 서버 편집을 함께 읽고, 이 브라우저가
//   마지막으로 본 서버 저장 시각보다 서버가 나중이면(다른 곳에서 고침) 서버 편집을 연다. 시각은 늘 서버 시계끼리만 견준다.
//   약속: tests/editor/other-browser.test.ts
import type { PersistedEditor } from '@/lib/editor-persistence'

export interface ServerCopy {
  state: PersistedEditor | null
  /** 서버가 그 저장본을 적은 시각(서버 시계). 저장본이 없으면 null. */
  updatedAt: string | null
}

/** 서버 편집 읽기를 기다리는 한도 — 넘으면 읽지 못한 것으로 본다. */
export const SERVER_COPY_TIMEOUT_MS = 10_000

const SEEN_PREFIX = 'tale:editor:v1:server-seen:'

/** 서버에 저장한 편집. 읽지 못하면(오류 응답 · 한도 초과 · 연결 끊김) null — 저장본이 없는 것과 구분한다. */
export async function readServerCopy(projectId: string): Promise<ServerCopy | null> {
  const ctrl = typeof AbortController === 'undefined' ? null : new AbortController()
  const timer = setTimeout(() => ctrl?.abort(), SERVER_COPY_TIMEOUT_MS)
  try {
    const res = await fetch(`/api/editor/state?projectId=${encodeURIComponent(projectId)}`, {
      cache: 'no-store',
      signal: ctrl?.signal,
    })
    if (!res.ok) return null
    const body = (await res.json().catch(() => null)) as { state?: unknown; updatedAt?: unknown } | null
    if (!body || typeof body !== 'object') return null
    return {
      state: body.state && typeof body.state === 'object' ? (body.state as PersistedEditor) : null,
      updatedAt: typeof body.updatedAt === 'string' ? body.updatedAt : null,
    }
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/** 이 브라우저가 마지막으로 본 서버 저장 시각. 없으면 undefined — 이번 고침 전 저장본이거나 서버와 맞춰 본 적이 없다. */
export function serverSeenAt(projectId: string): string | undefined {
  try {
    return localStorage.getItem(SEEN_PREFIX + projectId) ?? undefined
  } catch {
    return undefined
  }
}

export function rememberServerSeenAt(projectId: string, updatedAt: string): void {
  try {
    localStorage.setItem(SEEN_PREFIX + projectId, updatedAt)
  } catch {
    // 저장 공간이 꽉 차도 편집은 연다 — 다음에 열 때 이 브라우저 것을 먼저 본다(이번 고침 전과 같음).
  }
}

/** a 가 b 보다 나중에 저장한 것인가. 둘 중 하나라도 읽을 수 없는 시각이면 false. */
export function savedLater(a: string | null | undefined, b: string | null | undefined): boolean {
  const ta = a ? Date.parse(a) : Number.NaN
  const tb = b ? Date.parse(b) : Number.NaN
  return Number.isFinite(ta) && Number.isFinite(tb) && ta > tb
}

/** 샷이 있는 저장본인가 — 샷이 하나도 없는 저장본은 되살릴 편집이 아니다(11/3 늦은 비우기가 남긴 빈 저장본, 검토 A E1). */
export function hasShots(state: PersistedEditor | null | undefined): state is PersistedEditor {
  return !!state && Array.isArray(state.shots) && state.shots.length > 0
}
