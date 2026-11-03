// 로그인한 사람이 바뀌면(로그아웃 · 다른 계정 로그인) 탭 안에 받아 둔 화면 자료를 버린다(2026-11-03 검토 C).
//   로그아웃 · 로그인은 새로고침 없이 화면을 옮겨서, 받아 둔 것(Writer 산문 미리 보기 · Producer 시작 화면)이 다음 계정에게 남을 수 있었다.
//   받아 두는 모듈이 불릴 때 자기 비우기를 여기 적고(onSignedInChange), 로그인 상태 바뀜은 Supabase 가 알려 주는 한 곳에서 듣는다 —
//   로그아웃 단추가 여러 곳(메뉴 · 계정 · 홈 · 자리 비움 · 계정 지우기)이라 그 자리마다 부르지 않는다.
//   페이지를 처음 열 때의 소식은 비우지 않고, 같은 사람의 로그인 정보가 새로 바뀐 것(토큰 갱신)도 비우지 않는다.
//   약속: tests/login/signed-in-reset.test.ts
import { createClient } from '@/lib/supabase/client'

const resets = new Set<() => void>()
/** undefined = 아직 소식을 못 받았다(페이지를 처음 연 때). */
let lastUserId: string | null | undefined
let listening = false

/** 받아 두는 모듈이 자기 비우기를 적는다 — 로그인한 사람이 바뀌면 부른다. */
export function onSignedInChange(reset: () => void): void {
  resets.add(reset)
  listen()
}

/** 로그인한 사람 소식(없으면 null) — 앞 사람과 다르면 받아 둔 것을 모두 버린다. */
export function signedInUserChanged(userId: string | null): void {
  if (lastUserId === undefined) {
    lastUserId = userId
    return
  }
  if (lastUserId === userId) return
  lastUserId = userId
  for (const reset of resets) reset()
}

/** 시험용 — 처음 연 페이지처럼 앞 사람을 잊는다. */
export function forgetSignedInUser(): void {
  lastUserId = undefined
}

function listen(): void {
  if (listening || typeof window === 'undefined') return
  listening = true
  try {
    createClient().auth.onAuthStateChange((_event, session) => signedInUserChanged(session?.user?.id ?? null))
  } catch {
    // 데모(공유 보기) 세션처럼 로그인 소식이 없는 곳 — 받아 둔 것은 새로고침 때 사라진다.
    listening = false
  }
}
