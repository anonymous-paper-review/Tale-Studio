// Writer 미리 보기 받아 두기 · 같은 때 읽기 합치기(2026-11-03 오너 QA 2번 "이미 완성된 경우 로딩이 길 필요가 없다").
//   - 같은 프로젝트 · 언어 · 다시 읽기 번호로 여러 곳(산문 칸 · 오른쪽 채팅 등)이 같은 때 읽으면 요청은 한 번만 간다.
//   - 받은 미리 보기는 프로젝트 · 언어별로 들고 있다. 실행이 끝났거나 산문을 확정한 것(바뀌지 않는 산문)만 화면이 다시 열릴 때
//     바로 쓴다 — 쓴 뒤에도 화면은 한 번 다시 읽어 바뀐 것을 반영한다. 고칠 수 있는 초안은 늘 새로 읽는다.
//   - 워밍(스튜디오 레이아웃 1.5초 미리 받기): 산문을 확정한 프로젝트면 Writer 미리 보기를 한 번 받아 둔다 — 처음 열 때도 바로 보인다.
//   - 로그인 · 주인 · 프로젝트가 없다는 답(401 · 403 · 404)이면 그 프로젝트의 받아 둔 것을 버린다(시작 화면과 같은 규칙, 검토 C).
//     로그인한 사람이 바뀌면(로그아웃 · 다른 계정 로그인) 모두 버린다(lib/signed-in-reset).
//   약속: tests/writer/preview-reuse.test.ts · preview-warm.test.ts · tests/login/signed-in-reset.test.ts
import { pickContentLocale, type AppLocale } from '@/lib/locale'
import type { WriterPreview } from '@/lib/writer/use-writer-preview'
import { onSignedInChange } from '@/lib/signed-in-reset'
import { useLocaleStore } from '@/stores/locale-store'
import { useProjectStore } from '@/stores/project-store'

const known = new Map<string, WriterPreview>()
const reading = new Map<string, Promise<unknown>>()

const keyOf = (projectId: string, locale: AppLocale) => `${projectId}|${locale}`
/** 로그인 · 주인 · 프로젝트가 없다는 답 — 잠깐 실패한 것(5xx · 끊김)과 달리 받아 둔 것도 쓰면 안 된다. */
const REFUSED = new Set([401, 403, 404])

function forgetProject(projectId: string): void {
  for (const key of [...known.keys()]) if (key.startsWith(`${projectId}|`)) known.delete(key)
}

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

/** 미리 보기를 한 번 읽는다(같은 때 읽기는 합친다) — 받으면 받아 둔다. 거절 답이면 그 프로젝트의 받아 둔 것을 버린다(refused). */
export function refreshPreview(projectId: string, locale: AppLocale, refreshKey: number): Promise<{ ok: true; preview: WriterPreview } | { ok: false; refused: boolean }> {
  return loadPreviewOnce(`${keyOf(projectId, locale)}|${refreshKey}`, async () => {
    const response = await fetch(`/api/writer/preview/${projectId}?locale=${locale}`)
    if (!response.ok) {
      const refused = REFUSED.has(response.status)
      if (refused) forgetProject(projectId)
      return { ok: false as const, refused }
    }
    const preview = (await response.json()) as WriterPreview
    rememberPreview(projectId, locale, preview)
    return { ok: true as const, preview }
  })
}

/**
 * 워밍 — 지금 열린 프로젝트가 산문을 확정했으면(Producer 잠김) Writer 미리 보기를 한 번 받아 둔다. 받았으면 true.
 *   언어는 Writer 화면과 같은 규칙(잠긴 프로젝트 언어, 아니면 화면 언어)이라 Writer 가 열리면 받아 둔 것을 바로 쓴다.
 *   고칠 수 있는 초안은 받아 두지 않는다(화면이 늘 새로 읽는다). 읽기가 끊겨도 오류를 내지 않는다(덤이다).
 */
export async function warmWriterPreview(projectId: string): Promise<boolean> {
  const project = useProjectStore.getState()
  if (project.projectId !== projectId || !project.producerLocked) return false
  const locale = pickContentLocale({ projectLocale: project.projectLocale, locked: project.projectLocaleLocked, uiLocale: useLocaleStore.getState().locale })
  try {
    return (await refreshPreview(projectId, locale, 0)).ok
  } catch {
    return false
  }
}

/** 받아 둔 것 · 읽는 중인 것을 비운다 — 로그인한 사람이 바뀔 때(그리고 시험). */
export function forgetPreviews(): void {
  known.clear()
  reading.clear()
}
onSignedInChange(forgetPreviews)
