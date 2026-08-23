'use client'

import { useState, type FormEvent, type KeyboardEvent } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { sanitizeNextPath } from '@/lib/session-restore'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

// user enumeration 방지: 성공/실패/빈입력 모두 동일한 단일 메시지(원본 supabase 에러 비노출).
const GENERIC_LOGIN_ERROR = 'Incorrect email or password'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [capsLockOn, setCapsLockOn] = useState(false)

  const updateCapsLockState = (e: KeyboardEvent<HTMLInputElement>) => {
    setCapsLockOn(e.getModifierState('CapsLock'))
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
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="flex w-full max-w-sm flex-col items-center gap-8">
        <div className="flex flex-col items-center gap-2">
          <h1 className="text-2xl font-bold tracking-tight">Tale Studio</h1>
          <p className="text-sm text-muted-foreground">
            AI Video Generation Pipeline
          </p>
        </div>

        {/* 이메일/비밀번호 로그인만 지원 — Google OAuth UI는 2026-07-06 제거
            (백엔드 /auth/callback 라우트는 보존). */}
        <form onSubmit={handleEmailLogin} className="flex w-full flex-col gap-2">
          <Input
            type="email"
            autoComplete="email"
            placeholder="Email"
            value={email}
            aria-invalid={!!errorMsg}
            onChange={(e) => { setEmail(e.target.value); if (errorMsg) setErrorMsg(null) }}
          />
          <Input
            type="password"
            autoComplete="current-password"
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
              Caps Lock is on — passwords are case-sensitive.
            </p>
          ) : null}
          {errorMsg ? (
            <p className="text-sm text-destructive">{errorMsg}</p>
          ) : null}
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? 'Logging in…' : 'Log in'}
          </Button>
        </form>
      </div>
    </div>
  )
}
