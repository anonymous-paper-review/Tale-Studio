'use client'

// 로그인 여부 클라 훅 — 공개·앱 양쪽에서 열리는 화면(/pricing)이 머리글을 고를 때 쓴다.
//   null = 확인 전(어느 쪽 머리글도 그리지 않아 깜빡임을 피한다), 실패는 비로그인으로 본다.
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export function useSignedIn(): boolean | null {
  const [signedIn, setSignedIn] = useState<boolean | null>(null)
  useEffect(() => {
    let alive = true
    createClient()
      .auth.getUser()
      .then(({ data: { user } }) => {
        if (alive) setSignedIn(!!user)
      })
      .catch(() => {
        if (alive) setSignedIn(false)
      })
    return () => {
      alive = false
    }
  }, [])
  return signedIn
}
