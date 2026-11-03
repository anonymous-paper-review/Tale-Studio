// Writer 미리 보기 받아 두기 · 같은 때 읽기 합치기(2026-11-03 오너 QA 2번 "이미 완성된 경우 로딩이 길 필요가 없다").
//   - 같은 프로젝트 · 언어 · 다시 읽기 번호로 여러 곳(산문 칸 · 오른쪽 채팅 등)이 같은 때 읽으면 요청은 한 번만 간다.
//   - 받은 미리 보기는 프로젝트 · 언어별로 들고 있다. 실행이 끝났거나 산문을 확정한 것(바뀌지 않는 산문)만 화면이 다시 열릴 때
//     바로 쓴다 — 쓴 뒤에도 화면은 한 번 다시 읽어 바뀐 것을 반영한다. 고칠 수 있는 초안은 늘 새로 읽는다.
//   약속: tests/writer/preview-reuse.test.ts
import type { AppLocale } from '@/lib/locale'
import type { WriterPreview } from '@/lib/writer/use-writer-preview'

const known = new Map<string, WriterPreview>()
const reading = new Map<string, Promise<unknown>>()

const keyOf = (projectId: string, locale: AppLocale) => `${projectId}|${locale}`

/** 바뀌지 않는 산문인가 — 실행이 끝났거나(완성) 산문을 확정해 잠갔다. 실패 · 초안 · 쓰는 중은 아니다. */
export function previewSettled(preview: Pick<WriterPreview, 'completed' | 'proseLocked'>): boolean {
  return preview.completed === true || preview.proseLocked === true
}

export function rememberPreview(projectId: string, locale: AppLocale, preview: WriterPreview): void {
  known.set(keyOf(projectId, locale), preview)
}

/** 화면이 열리자마자 쓸 수 있는 받아 둔 미리 보기 — 바뀌지 않는 산문만. 없으면 null. */
export function readyPreview(projectId: string | null | undefined, locale: AppLocale): WriterPreview | null {
  if (!projectId) return null
  const preview = known.get(keyOf(projectId, locale))
  return preview && previewSettled(preview) ? preview : null
}

/** 같은 열쇠로 같은 때 읽으면 앞 요청을 같이 기다린다. 끝나면 다음 읽기는 새로 간다. */
export function loadPreviewOnce<T>(key: string, load: () => Promise<T>): Promise<T> {
  const pending = reading.get(key) as Promise<T> | undefined
  if (pending) return pending
  const started = load().finally(() => {
    if (reading.get(key) === started) reading.delete(key)
  })
  reading.set(key, started)
  return started
}

/** 미리 보기를 한 번 읽는다(같은 때 읽기는 합친다) — 받으면 받아 둔다. */
export function refreshPreview(projectId: string, locale: AppLocale, refreshKey: number): Promise<{ ok: true; preview: WriterPreview } | { ok: false }> {
  return loadPreviewOnce(`${keyOf(projectId, locale)}|${refreshKey}`, async () => {
    const response = await fetch(`/api/writer/preview/${projectId}?locale=${locale}`)
    if (!response.ok) return { ok: false as const }
    const preview = (await response.json()) as WriterPreview
    rememberPreview(projectId, locale, preview)
    return { ok: true as const, preview }
  })
}

/** 시험용 — 받아 둔 것 · 읽는 중인 것을 비운다. */
export function forgetPreviews(): void {
  known.clear()
  reading.clear()
}
