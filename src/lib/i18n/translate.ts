// translate 코어 (#attach-loud-fail 2026-08-24 분리) — 지시자 없는 서버·클라 공용 모듈.
//   i18n/index 는 'use client'(훅 때문)라 라우트 핸들러가 직접 import 하기 위험했다.
//   API 라우트가 사용자 문구를 프로젝트 locale 로 내려줄 때는 여기를 import 한다.
import type { AppLocale } from '@/lib/locale'
import { KO } from './messages-ko'

export function translate(
  locale: AppLocale,
  text: string,
  params?: Record<string, string | number>,
): string {
  let out = locale === 'ko' ? (KO[text] ?? text) : text
  if (params) {
    for (const [k, v] of Object.entries(params)) out = out.replaceAll(`{${k}}`, String(v))
  }
  return out
}
