'use client'

import { useState, type FormEvent, type KeyboardEvent } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { sanitizeNextPath, NEXT_PATH_COOKIE } from '@/lib/session-restore'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { TaleLockup } from '@/components/tale-lockup'

// user enumeration 방지: 성공/실패/빈입력 모두 동일한 단일 메시지(원본 supabase 에러 비노출).
const GENERIC_LOGIN_ERROR = 'Incorrect email or password'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [capsLockOn, setCapsLockOn] = useState(false)
  const [googleSubmitting, setGoogleSubmitting] = useState(false)
  const [googleError, setGoogleError] = useState<string | null>(null)

  const updateCapsLockState = (e: KeyboardEvent<HTMLInputElement>) => {
    setCapsLockOn(e.getModifierState('CapsLock'))
  }

  const handleGoogleLogin = async () => {
    setGoogleError(null)
    setErrorMsg(null)
    setGoogleSubmitting(true)

    try {
      // OAuth 왕복 뒤 복귀할 경로를 기존 콜백에 전달한다. 새 시도에 경로가 없으면 이전 값을 지운다.
      const next = sanitizeNextPath(new URLSearchParams(window.location.search).get('next'))
      const secure = window.location.protocol === 'https:' ? '; secure' : ''
      document.cookie = `${NEXT_PATH_COOKIE}=${next ? encodeURIComponent(next) : ''}; path=/; max-age=${next ? 600 : 0}; samesite=lax${secure}`

      const supabase = createClient()
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${window.location.origin}/auth/callback` },
      })
      if (error) throw error
    } catch {
      setGoogleError('Could not sign in with Google. Please try again.')
      setGoogleSubmitting(false)
    }
  }

  const handleEmailLogin = async (e: FormEvent) => {
    e.preventDefault()
    setErrorMsg(null)

    // 빈 입력 가드: trim 후 빈값이면 signInWithPassword 미호출 + 일반 에러 (과검증 금지 — 형식/길이검사 없음)
    const trimmedEmail = email.trim()
    const trimmedPassword = password.trim()
    if (!trimmedEmail || !trimmedPassword) {
      setErrorMsg(GENERIC_LOGIN_ERROR)
      return
    }

    setSubmitting(true)
    try {
      const supabase = createClient()
      const { error } = await supabase.auth.signInWithPassword({
        email: trimmedEmail,
        password: trimmedPassword,
      })

      if (error) {
        setErrorMsg(GENERIC_LOGIN_ERROR)
        setSubmitting(false)
        return
      }

      // 성공: 비번 로그인은 OAuth 왕복이 없어 URL ?next 를 직접 읽는다(NEXT_PATH_COOKIE 불필요).
      // 기본 목적지 '/#projects' — 로그인 후 홈 하단 프로젝트 리스트로 스크롤(OAuth 콜백과 통일).
      // sanitizeNextPath 가 open redirect/로그인 루프 차단.
      const next = sanitizeNextPath(
        new URLSearchParams(window.location.search).get('next'),
      )
      router.replace(next ?? '/projects') // #landing-v2: 프로젝트 목록은 /projects 독립 페이지
      router.refresh()
    } catch {
      // 네트워크/예외도 원본 비노출 동일 일반 메시지 + submitting 해제(버튼 고착 방지).
      setErrorMsg(GENERIC_LOGIN_ERROR)
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center bg-lobby px-4">
      {/* 11/5 시안 R1 — 스튜디오 밖 바탕(lobby) 가운데 카드(400 · 안쪽 50/30 · 사이 15 · 모서리 22), 칸 · Google 단추는 카드 위 한 단 밝은 칸(side-raised)
          · 높이 48 · 모서리 12, 꼬리글은 화면 아래.
          글은 아직 영어 그대로다(화면 언어 · 부제 · 가입하기 · 바탕 흐린 빛은 오너 결정 대기). */}
      <main className="flex w-full flex-1 items-center justify-center py-12">
        <div className="flex w-full max-w-[400px] flex-col gap-[15px] rounded-[22px] bg-side px-[30px] py-[50px]">
          {/* 11/5 시안 R1 — 이름 대신 로고 묶음(틀 32). 글자 "Tale Studio" 는 로고 안의 글이라 머리글로 그대로 읽힌다. */}
          <h1 className="mb-[21px] flex justify-center">
            <TaleLockup size={32} />
          </h1>

          <div className="flex w-full flex-col gap-2">
            <Button
              type="button"
              variant="secondary"
              className="h-12 w-full rounded-lg bg-side-raised font-semibold hover:bg-card"
              onClick={handleGoogleLogin}
              disabled={submitting || googleSubmitting}
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              {googleSubmitting ? 'Connecting to Google…' : 'Continue with Google'}
            </Button>
            {googleError ? (
              <p role="alert" className="text-sm text-destructive">{googleError}</p>
            ) : null}
          </div>

          {/* 또는 — 구분선 사이 글(화면에는 소문자로). */}
          <div className="flex items-center gap-3" aria-hidden>
            <span className="h-px flex-1 bg-foreground/8" />
            <span className="text-meta lowercase text-subtle-foreground">Or</span>
            <span className="h-px flex-1 bg-foreground/8" />
          </div>

          <form onSubmit={handleEmailLogin} className="flex w-full flex-col gap-[15px]">
            <Input
              type="email"
              autoComplete="email"
              className="h-12 rounded-lg bg-side-raised px-4"
              placeholder="Email"
              value={email}
              aria-invalid={!!errorMsg}
              onChange={(e) => { setEmail(e.target.value); if (errorMsg) setErrorMsg(null) }}
            />
            <Input
              type="password"
              autoComplete="current-password"
              className="h-12 rounded-lg bg-side-raised px-4"
              placeholder="Password"
              value={password}
              aria-invalid={!!errorMsg}
              aria-describedby={capsLockOn ? 'caps-lock-hint' : undefined}
              onBlur={() => setCapsLockOn(false)}
              onKeyDown={updateCapsLockState}
              onKeyUp={updateCapsLockState}
              onChange={(e) => { setPassword(e.target.value); if (errorMsg) setErrorMsg(null) }}
            />
            {capsLockOn ? (
              <p id="caps-lock-hint" role="status" className="text-sm text-muted-foreground">
                Caps Lock is on. Passwords are case-sensitive.
              </p>
            ) : null}
            {errorMsg ? (
              <p className="text-sm text-destructive">{errorMsg}</p>
            ) : null}
            <Button type="submit" className="mt-1.5 h-12 w-full rounded-lg" disabled={submitting || googleSubmitting}>
              {submitting ? 'Logging in…' : 'Log in'}
            </Button>
          </form>
        </div>
      </main>
      <p className="pb-8 text-center text-meta text-subtle-foreground">
        AI Video Generation Pipeline · Your Tale Deserves a Take
      </p>
    </div>
  )
}
