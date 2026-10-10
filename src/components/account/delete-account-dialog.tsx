'use client'

// 계정 삭제 확인창 (약관 §9). 계정 페이지의 위험 구역에서 연다.
//   되돌릴 수 없는 삭제라, 누르기 전에 세 가지를 읽게 한다 — 최종성 · 남은 Take 소멸 ·
//   미리 내보내기. 법정 보존 대상인 결제 기록이 남는 것도 같이 알린다(개인정보 §1 보존표).
//   실수 방지: 확인 칸에 계정 이메일을 그대로 적었을 때만 삭제 버튼이 켜진다.
//   판정·삭제는 서버(/api/account/delete)가 한다. 이 화면은 확인만 받는다.
//   약속: tests/account/delete-account-confirm.test.ts (문구·켜짐) + 스크린샷(생김새).

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { AlertTriangle } from 'lucide-react'
import { useT } from '@/lib/i18n'
import { createClient } from '@/lib/supabase/client'
import { clearLastProjectId } from '@/lib/session-restore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

/** 확인 입력이 그 계정의 이메일인지. 앞뒤 공백과 대소문자는 눈에 안 보이므로 무시한다. */
export function matchesAccountEmail(typed: string, email: string): boolean {
  const normalized = typed.trim().toLowerCase()
  return normalized.length > 0 && normalized === email.trim().toLowerCase()
}

export function DeleteAccountDialog({
  email,
  open,
  onOpenChange,
}: {
  email: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useT()
  const router = useRouter()
  const [typed, setTyped] = useState('')
  const [pending, setPending] = useState(false)
  const confirmed = matchesAccountEmail(typed, email)

  async function deleteAccount() {
    if (!confirmed || pending) return
    setPending(true)
    try {
      const res = await fetch('/api/account/delete', { method: 'POST' })
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string }
      if (!res.ok || !body.ok) {
        toast.error(
          t(
            body.error === 'subscription_cancel_failed'
              ? 'We could not cancel your subscription, so nothing was deleted. Please try again in a moment.'
              : 'Could not delete your account. Please try again in a moment.',
          ),
        )
        return
      }
      clearLastProjectId()
      // 로그인 계정이 이미 사라진 상황이라 로그아웃 요중은 실패할 수 있다 — 그게 삭제 실패로 보이면 안 된다.
      await createClient().auth.signOut().catch(() => undefined)
      router.push('/')
    } catch {
      toast.error(t('Could not delete your account. Please try again in a moment.'))
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="size-4 text-destructive" />
            {t('Delete your account?')}
          </DialogTitle>
          <DialogDescription>{t('This cannot be undone.')}</DialogDescription>
        </DialogHeader>

        <ul className="space-y-2 text-sm text-muted-foreground">
          <li>
            {t(
              'Your projects, generated output, and uploaded material are deleted. Export anything you want to keep before you continue.',
            )}
          </li>
          <li>
            {t(
              'Any Take left in your balance, including purchased Take, and the unused remainder of a paid period are forfeited.',
            )}
          </li>
          <li>{t('Any auto-renewing subscription is canceled first. If we cannot cancel it, nothing is deleted.')}</li>
          <li>{t('Payment and transaction records are kept for the periods the law requires.')}</li>
        </ul>

        <label className="space-y-2 text-sm">
          <span className="text-muted-foreground">{t('Type {email} to confirm', { email })}</span>
          <Input
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
        </label>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
            {t('Cancel')}
          </Button>
          <Button variant="destructive" onClick={() => void deleteAccount()} disabled={!confirmed || pending}>
            {pending ? t('Working…') : t('Delete account permanently')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
