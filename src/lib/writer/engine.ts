import { translate } from '@/lib/i18n'
import type { AppLocale } from '@/lib/locale'

// locale 을 안 넘기는 호출부가 조용히 안 깨지도록 기존 동작(항상 한국어)을 기본값으로 보존한다
//   — producer-gate.ts/card-mention.ts 와 동일 취급.
const UNSPECIFIED_LOCALE_FALLBACK: AppLocale = 'ko'

export type WriterEngine = 'v1' | 'v2'

export const DEFAULT_WRITER_ENGINE: WriterEngine = 'v1'

const WRITER_ENGINE_STORAGE_PREFIX = 'tale-studio:writer-engine:'

export function isWriterEngine(value: unknown): value is WriterEngine {
  return value === 'v1' || value === 'v2'
}

export function writerEngineStorageKey(projectId: string): string {
  return `${WRITER_ENGINE_STORAGE_PREFIX}${projectId}`
}

export function getWriterEnginePreference(projectId: string): WriterEngine {
  if (typeof window === 'undefined') return DEFAULT_WRITER_ENGINE

  try {
    const stored = window.localStorage.getItem(writerEngineStorageKey(projectId))
    return isWriterEngine(stored) ? stored : DEFAULT_WRITER_ENGINE
  } catch {
    return DEFAULT_WRITER_ENGINE
  }
}

export function setWriterEnginePreference(
  projectId: string,
  engine: WriterEngine,
): void {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.setItem(writerEngineStorageKey(projectId), engine)
  } catch {
    // 브라우저 저장소가 막혀도 다음 실행은 서버의 기본값(v1)으로 안전하게 진행한다.
  }
}

export function writerEngineLabel(
  engine: WriterEngine,
  locale: AppLocale = UNSPECIFIED_LOCALE_FALLBACK,
): string {
  return engine === 'v2'
    ? translate(locale, 'V2 semantic-unit experiment')
    : translate(locale, 'V1 existing pipeline')
}
