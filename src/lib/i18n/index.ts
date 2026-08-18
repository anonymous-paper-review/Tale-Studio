'use client'

// UI 크롬 번역 훅 (#i18n-s5) — 사용법: const t = useT(); t('Create scene').
//   키 = 영어 원문(코드가 base), ko 는 messages-ko 사전 매핑, 누락은 영어 폴백.
//   유저 콘텐츠·파이프라인 산출물은 여기를 타지 않는다(프로젝트 locale 이 지배).
import { useLocaleStore } from '@/stores/locale-store'
import type { AppLocale } from '@/lib/locale'
import { KO } from './messages-ko'

export function translate(locale: AppLocale, text: string): string {
  return locale === 'ko' ? (KO[text] ?? text) : text
}

export function useT(): (text: string) => string {
  const locale = useLocaleStore((s) => s.locale)
  return (text: string) => translate(locale, text)
}

export function useLocale(): AppLocale {
  return useLocaleStore((s) => s.locale)
}
