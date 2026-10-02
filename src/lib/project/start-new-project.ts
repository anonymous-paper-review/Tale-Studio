// 새 프로젝트 시작(2026-10-02 오너 — tale-proto-v04 0.1). 무엇을 만들지 · 아이디어 · 자료로 Producer 를 채우고,
//   트리트먼트(Writer 앞단)를 바로 쓰기 시작한다. Producer 는 잠그지 않는다 — 넘기기는 Producer 에서 한다.
//   순서: 프로젝트 만들기 → 자료 올리기(실패한 파일은 다시 올리기) → 이야기 · 포맷 저장 → 첫 인사 → 트리트먼트 시작.
import { useProjectStore } from '@/stores/project-store'
import { useProducerStore } from '@/stores/producer-store'
import { usePendingCreationStore, type PendingCreationImage } from '@/stores/pending-creation-store'
import { purposeSettings, type ProjectPurposeId } from '@/lib/project/purpose'
import { detectScript, parseScript } from '@/lib/writer/script/parse'
import { rejectReason } from '@/lib/upload/limits'
import { useLocaleStore } from '@/stores/locale-store'
import { translate } from '@/lib/i18n'
import { contentLocale } from '@/lib/i18n/content'
import { detectLocaleFromText, parseAppLocale, type AppLocale } from '@/lib/locale'

export type CreationUpload =
  | { kind: 'text'; name: string; text: string }
  | ({ kind: 'image' } & PendingCreationImage)

export async function createProjectForNewFlow(input: {
  title: string
  referenceProjectId?: string
  includeLastShotFrame?: boolean
}): Promise<{ ok: true; projectId: string; warnings: Array<{ code?: string; detail?: string }> } | { ok: false; error: string }> {
  const result = await useProjectStore.getState().createNewProject(
    input.title,
    input.referenceProjectId ? { referenceProjectId: input.referenceProjectId, includeLastShotFrame: input.includeLastShotFrame === true } : undefined,
  )
  if (!result.ok || !result.projectId) return { ok: false, error: result.error ?? 'Failed to create project' }
  return { ok: true, projectId: result.projectId, warnings: result.warnings }
}

/** 받을 수 없는 형식 · 크기면 그 이유(없으면 null). 파일을 고르는 즉시 쓴다 — 프로젝트를 만들기 전에 거른다. */
export function checkCreationFile(file: File): string | null {
  return rejectReason(file.name, file.size, useLocaleStore.getState().locale)
}

/** 파일 하나 올리기 — 받을 수 없는 형식 · 크기는 올리기 전에 거른다(이유는 화면이 그대로 보인다). */
export async function ingestCreationFile(projectId: string, file: File): Promise<CreationUpload | { error: string }> {
  const denied = checkCreationFile(file)
  if (denied) return { error: denied }
  try {
    const form = new FormData()
    form.append('projectId', projectId)
    form.append('file', file)
    const response = await fetch('/api/produce/ingest', { method: 'POST', body: form })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) return { error: typeof data?.error === 'string' ? data.error : `HTTP ${response.status}` }
    if (data.kind === 'image') {
      return {
        kind: 'image',
        id: crypto.randomUUID(),
        name: file.name,
        thumbUrl: String(data.originalUrl ?? ''),
        sliceUrls: Array.isArray(data.slices) ? data.slices.map((slice: { url: string }) => slice.url) : [],
      }
    }
    return { kind: 'text', name: file.name, text: String(data.text ?? '') }
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Upload failed' }
  }
}

/** 이야기 = 아이디어 + 올린 글. 대본이면 문장 그대로 보존한다(시안 약속 "올린 자료는 다시 만들지 않고 그대로 씁니다"). */
function storyOf(idea: string, texts: Array<{ name: string; text: string }>): { story: string; preserveScript: true | null } {
  const story = [idea.trim(), ...texts.map((t) => (texts.length > 1 ? `# ${t.name}\n\n${t.text}` : t.text).trim())]
    .filter(Boolean)
    .join('\n\n')
  const script = story && detectScript(story).kind !== 'none' && parseScript(story)
  return { story, preserveScript: script ? true : null }
}

export async function beginTreatment(input: {
  projectId: string
  purposeId: ProjectPurposeId
  idea: string
  files: CreationUpload[]
}): Promise<{ started: boolean }> {
  const { projectId } = input
  if (useProjectStore.getState().projectId !== projectId) return { started: false }
  const texts = input.files.flatMap((file) => (file.kind === 'text' ? [file] : []))
  const images = input.files.flatMap((file) => (file.kind === 'image' ? [{ id: file.id, name: file.name, thumbUrl: file.thumbUrl, sliceUrls: file.sliceUrls }] : []))
  const { story, preserveScript } = storyOf(input.idea, texts)
  // 언어는 트리트먼트가 쓰일 언어를 따른다(writer/start resolveOutputLocale 와 같은 규칙):
  //   계정 언어로 잠긴 프로젝트는 그 언어, 잠기지 않았으면 Writer 가 이야기 언어로 잠그므로 이야기 언어.
  const project = useProjectStore.getState()
  const locale: AppLocale = project.projectLocaleLocked && project.projectLocale
    ? project.projectLocale
    : story ? (parseAppLocale(detectLocaleFromText(story)) ?? contentLocale()) : contentLocale()

  const producer = useProducerStore.getState()
  useProducerStore.setState({
    storyText: story,
    storyReady: story.length > 0,
    preserveScript,
    projectSettings: { ...producer.projectSettings, ...purposeSettings(input.purposeId, locale) },
  })
  await useProducerStore.getState().saveDraftNow()

  // 그림은 Producer 채팅이 쓰임새를 묻는다(인물 · 배경 · 참고) — 이야기가 없으면 그것부터.
  if (images.length) usePendingCreationStore.getState().put(projectId, images)

  // 첫 인사(시안 v04): 포맷을 먼저 채웠고, 트리트먼트를 쓰는 동안에도 고칠 수 있다.
  const greeting = translate(locale, story
    ? 'I filled in the format from your idea first. You can change it while I write the treatment.'
    : 'I filled in the format first. Tell me how to use the images you uploaded, and we will build the story from there.')
  await fetch(`/api/project/${projectId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ stage: 'producer', role: 'model', content: greeting }),
  }).catch(() => null)

  if (!story) return { started: false }
  const started = await useProducerStore.getState().startTreatment()
  // Writer 는 처음 실행 때 잠기지 않은 프로젝트의 언어를 이야기 언어로 잠근다(writer/start) — 화면도 같은 언어로 맞춘다.
  if (started && !useProjectStore.getState().projectLocaleLocked) useProjectStore.getState().adoptProjectLocale(locale, true)
  return { started }
}
