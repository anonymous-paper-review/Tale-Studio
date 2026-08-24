'use client'

// UI 크롬 번역 훅 (#i18n-s5) — 사용법: const t = useT(); t('Create scene').
//   키 = 영어 원문(코드가 base), ko 는 messages-ko 사전 매핑, 누락은 영어 폴백.
//   유저 콘텐츠·파이프라인 산출물은 여기를 타지 않는다(프로젝트 locale 이 지배).
import { useLocaleStore } from '@/stores/locale-store'
import type { AppLocale } from '@/lib/locale'
import { translate } from './translate'

// 순수 코어는 ./translate (지시자 없음 — 서버 라우트도 쓴다). 기존 소비처의 import 경로 보존.
export { translate }

export function useT(): (text: string, params?: Record<string, string | number>) => string {
  const locale = useLocaleStore((s) => s.locale)
  return (text, params) => translate(locale, text, params)
}

export function useLocale(): AppLocale {
  return useLocaleStore((s) => s.locale)
}
