'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { TaleLockup } from '@/components/tale-lockup'
import { useT } from '@/lib/i18n'
import { sanitizeNextPath } from '@/lib/session-restore'
import { signUpWithEmail } from '@/lib/supabase/signup'

const SIGNUP_ERROR = 'Could not create your account. Check your details or try logging in.'
const CONFIRMATION_MESSAGE = 'Check your email to confirm your account. If you already have an account, log in.'

export default function SignupPage() {
  const router = useRouter()
  const t = useT()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [nickname, setNickname] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [confirmationRequired, setConfirmationRequired] = useState(false)
  const [nextPath, setNextPath] = useState<string | null>(null)
  const submittingRef = useRef(false)
  const formDisabled = submitting || confirmationRequired

  // 서버와 브라우저의 첫 화면을 같게 유지한 뒤 복귀 경로를 링크에 반영한다.
  useEffect(() => {
    setNextPath(sanitizeNextPath(new URLSearchParams(window.location.search).get('next')))
  }, [])

  const handleSignup = async (event: FormEvent) => {
    event.preventDefault()
    // 상태 갱신이 화면에 반영되기 전 연속으로 제출해도 요청은 하나만 보낸다.
    if (submittingRef.current) return
    submittingRef.current = true
    setSubmitting(true)
    setErrorMsg(null)
    setConfirmationRequired(false)

    try {
      const result = await signUpWithEmail(
        { email, password, nickname },
        `${window.location.origin}/auth/callback`,
      )
      if (result === 'signed-in') {
        const next = sanitizeNextPath(new URLSearchParams(window.location.search).get('next'))
        router.replace(next ?? '/projects')
        router.refresh()
      } else {
        setConfirmationRequired(true)
      }
    } catch {
      setErrorMsg(SIGNUP_ERROR)
      submittingRef.current = false
    } finally {
      // 가입된 뒤 재요청하면 확인 메일의 인증값이 바뀔 수 있다. 실패한 요청만 다시 허용한다.
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center bg-lobby px-4">
      <main className="flex w-full flex-1 items-center justify-center py-12">
        <div className="flex w-full max-w-[400px] flex-col gap-[15px] rounded-[22px] bg-side px-[30px] py-[50px]">
          <h1 className="mb-[21px] flex justify-center">
            <TaleLockup size={32} />
          </h1>
          <h2 className="text-center text-xl font-semibold">{t('Sign up')}</h2>

          <form onSubmit={handleSignup} className="flex w-full flex-col gap-[15px]" aria-busy={submitting}>
            <div className="flex flex-col gap-2">
              <label htmlFor="signup-email" className="text-label font-medium">{t('Email')}</label>
              <Input
                id="signup-email"
                name="email"
                type="email"
                autoComplete="email"
                required
                className="h-12 rounded-lg bg-side-raised px-4"
                value={email}
                disabled={formDisabled}
                aria-invalid={!!errorMsg}
                aria-describedby={errorMsg ? 'signup-error' : undefined}
                onChange={(event) => {
                  setEmail(event.target.value)
                  setErrorMsg(null)
                  setConfirmationRequired(false)
                }}
              />
            </div>
            <div className="flex flex-col gap-2">
              <label htmlFor="signup-password" className="text-label font-medium">{t('Password')}</label>
              <Input
                id="signup-password"
                name="password"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                className="h-12 rounded-lg bg-side-raised px-4"
                value={password}
                disabled={formDisabled}
                aria-invalid={!!errorMsg}
                aria-describedby={errorMsg ? 'signup-error' : undefined}
                onChange={(event) => {
                  setPassword(event.target.value)
                  setErrorMsg(null)
                  setConfirmationRequired(false)
                }}
              />
            </div>
            <div className="flex flex-col gap-2">
              <label htmlFor="signup-nickname" className="text-label font-medium">{t('Nickname')}</label>
              <Input
                id="signup-nickname"
                name="nickname"
                type="text"
                autoComplete="nickname"
                required
                minLength={1}
                maxLength={40}
                className="h-12 rounded-lg bg-side-raised px-4"
                value={nickname}
                disabled={formDisabled}
                aria-invalid={!!errorMsg}
                aria-describedby={errorMsg ? 'signup-error' : undefined}
                onChange={(event) => {
                  setNickname(event.target.value)
                  setErrorMsg(null)
                  setConfirmationRequired(false)
                }}
              />
            </div>
            {errorMsg ? (
              <p id="signup-error" role="alert" className="text-sm text-destructive">{t(errorMsg)}</p>
            ) : null}
            {confirmationRequired ? (
              <p role="status" className="text-sm text-muted-foreground">{t(CONFIRMATION_MESSAGE)}</p>
            ) : null}
            <Button type="submit" className="mt-1.5 h-12 w-full rounded-lg" disabled={formDisabled}>
              {submitting ? t('Signing up…') : t('Sign up')}
            </Button>
          </form>

          <p className="mt-2 text-center text-sm text-muted-foreground">
            <a
              href={nextPath ? `/login?next=${encodeURIComponent(nextPath)}` : '/login'}
              className="rounded-sm font-semibold text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {t('Log in')}
            </a>
          </p>
          <div className="flex flex-wrap justify-center gap-x-4 gap-y-2 text-meta text-subtle-foreground">
            <a href="/terms" className="rounded-sm underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              {t('Terms of service')}
            </a>
            <a href="/privacy" className="rounded-sm underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              {t('Privacy policy')}
            </a>
          </div>
        </div>
      </main>
      <p className="pb-8 text-center text-meta text-subtle-foreground">
        AI Video Generation Pipeline · Your Tale Deserves a Take
      </p>
    </div>
  )
}
