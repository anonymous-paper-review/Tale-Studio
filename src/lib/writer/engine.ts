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

export function writerEngineLabel(engine: WriterEngine): string {
  return engine === 'v2' ? 'V2 의미 단위 실험' : 'V1 기존 파이프라인'
}
