'use client'

// 서버 라우트도 locale-store 를 import 하므로 React 훅은 이 클라이언트 파일에 둔다(빌드 실패 2026-11-24).
import { useEffect } from 'react'
import { initialLocaleFor } from '@/lib/locale'
import { useLocaleStore } from '@/stores/locale-store'
/**
 * 처음 온 방문자(저장된 언어 없음)는 브라우저 언어로 시작한다(오너 2026-11-24 ③A).
 * 서버 그림(en)과 첫 그림을 맞추려고 그린 뒤에 바꾼다 — 초기값으로 넣으면 하이드레이션이 어긋난다.
 */
export function useFirstVisitLocale() {
  useEffect(() => {
    try {
      if (window.localStorage.getItem('tale-locale')) return
    } catch {
      return
    }
    const first = initialLocaleFor(navigator.languages)
    if (first !== useLocaleStore.getState().locale) useLocaleStore.setState({ locale: first })
  }, [])
}
