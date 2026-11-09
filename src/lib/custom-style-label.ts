// 사용자가 올린 그림체의 보이는 이름 — 사용자가 붙인 이름은 그대로, 비었거나 기본 이름이면 지금 화면 언어의 기본 이름.
//   예전 서버는 이름 없이 저장하면 "내 레퍼런스"를 한국어로 박아 두었다. 저장값은 그대로 두고 보일 때 그 기본 이름만 바꾼다
//   (2026-11-10 오너 "영어 언어에서 한국어 나오는거 수정", 리드 B1). 약속: tests/ui-text/english-default-names.test.ts
import { translate } from '@/lib/i18n/translate'
import type { AppLocale } from '@/lib/locale'

const DEFAULT_NAME = 'My reference'
const SAVED_DEFAULT_NAMES = new Set([DEFAULT_NAME, translate('ko', DEFAULT_NAME)])

export function customStyleLabel(label: unknown, locale: AppLocale): string {
  const name = typeof label === 'string' ? label.trim() : ''
  return !name || SAVED_DEFAULT_NAMES.has(name) ? translate(locale, DEFAULT_NAME) : name
}
