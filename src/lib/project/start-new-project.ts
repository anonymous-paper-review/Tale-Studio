// 새 프로젝트 시작(2026-10-02 오너 — tale-proto-v04 0.1 · 2026-10-09 오너 "자료를 먼저 받고 쓰임새를 고르게"). 아이디어 · 자료와
//   고른 쓰임새로 Producer 를 채우고 트리트먼트(Writer 앞단)를 쓴다. Producer 는 잠그지 않는다 — 넘기기는 Producer 에서 한다.
//   순서: 프로젝트 만들기 → 자료 올리기(실패한 파일은 다시 올리기) → 쓰임새 고르기 → 길이 · 화면 → 이야기 · 포맷 저장 → 첫 인사 →
//   트리트먼트. 그림 카드 · 원작 채우기가 남았으면 트리트먼트는 Producer 가 그 일을 마친 뒤 시작한다(runCreationPlan).
import { useProjectStore } from '@/stores/project-store'
import { useProducerStore } from '@/stores/producer-store'
import { usePendingCreationStore, type PendingCreationImage } from '@/stores/pending-creation-store'
import { originalSettings, purposeSettings, type ProjectPurposeId } from '@/lib/project/purpose'
import {
  DEFAULT_ORIGINAL_FORMAT,
  defaultTextUse,
  materialProblems,
  planCreation,
  type ImageUse,
  type MaterialImage,
  type MaterialText,
  type TextUse,
} from '@/lib/project/creation-materials'
import type { ProjectFormat } from '@/types/project'
import { rejectReason } from '@/lib/upload/limits'
import { useLocaleStore } from '@/stores/locale-store'
import { translate } from '@/lib/i18n'
import { contentLocale } from '@/lib/i18n/content'
import { detectLocaleFromText, parseAppLocale, type AppLocale } from '@/lib/locale'

export type CreationUpload =
  | { kind: 'text'; name: string; text: string; use?: TextUse }
  | ({ kind: 'image'; use?: ImageUse | null } & PendingCreationImage)

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

export async function beginTreatment(input: {
  projectId: string
  idea: string
  /** 올린 자료와 고른 쓰임새. 글은 고르지 않았으면 꼴로 정한 처음 쓰임새를 쓴다. */
  files: CreationUpload[]
  /** 원작을 그대로 쓰지 않을 때 마지막 단계에서 고른 만들 것. */
  purposeId?: ProjectPurposeId | null
  /** 원작을 그대로 쓸 때 마지막 단계에서 고른 화면 비율. */
  format?: ProjectFormat | null
  /** 시작할 때의 아이디어 · 자료로 정한 제목 — 자료를 올리느라 프로젝트를 먼저 만들었으면 그때 제목과 다를 수 있다. */
  title?: string
}): Promise<{ started: boolean }> {
  const { projectId } = input
  if (useProjectStore.getState().projectId !== projectId) return { started: false }
  if (input.title && input.title !== useProjectStore.getState().projectTitle) await useProjectStore.getState().renameProject(input.title)
  const texts: MaterialText[] = input.files.flatMap((file, index) =>
    file.kind === 'text' ? [{ id: `text-${index}`, name: file.name, text: file.text, use: file.use ?? defaultTextUse(file.text) }] : [],
  )
  const images: MaterialImage[] = input.files.flatMap((file) =>
    file.kind === 'image' ? [{ id: file.id, name: file.name, thumbUrl: file.thumbUrl, sliceUrls: file.sliceUrls, use: file.use ?? null }] : [],
  )
  // 쓰임새를 안 고른 그림 · 원작 둘은 화면이 막는다 — 여기까지 왔으면 아무것도 하지 않는다.
  if (materialProblems(texts, images).length) return { started: false }
  const plan = planCreation({ idea: input.idea, texts, images })
  // 언어는 트리트먼트가 쓰일 언어를 따른다(writer/start resolveOutputLocale 와 같은 규칙):
  //   계정 언어로 잠긴 프로젝트는 그 언어, 잠기지 않았으면 Writer 가 이야기 언어로 잠그므로 이야기(없으면 메모) 언어.
  const languageSource = plan.story || plan.note || ''
  const project = useProjectStore.getState()
  const locale: AppLocale = project.projectLocaleLocked && project.projectLocale
    ? project.projectLocale
    : languageSource ? (parseAppLocale(detectLocaleFromText(languageSource)) ?? contentLocale()) : contentLocale()

  // 원작을 그대로 쓰면 만들 것 카드를 거치지 않는다 — 고른 화면 비율만 채우고 길이 · 장르는 비운다.
  const settings = plan.original
    ? originalSettings(input.format ?? DEFAULT_ORIGINAL_FORMAT, locale)
    : purposeSettings(input.purposeId ?? 'short_film', locale)
  const producer = useProducerStore.getState()
  useProducerStore.setState({
    storyText: plan.story,
    storyReady: plan.story.length > 0,
    preserveScript: plan.preserveScript ? true : null,
    projectSettings: { ...producer.projectSettings, ...settings },
  })
  await useProducerStore.getState().saveDraftNow()

  // 그림 카드 · 원작 채우기가 남았으면 트리트먼트는 Producer 가 그 뒤에 시작한다 — 그림 속 인물 · 원작의 장르가 빠지지 않게.
  const waitsForCards = plan.original !== null || plan.cards.length > 0
  // 그 길에서는 트리트먼트보다 채팅 요청(카드 · 장르 채우기)이 먼저 간다. 언어가 정해지지 않은 프로젝트에서 채팅은 화면 언어를 따르므로
  //   Writer 가 첫 실행에서 하는 것처럼 이야기 언어로 먼저 정해 둔다 — 장르 · 카드가 다른 언어로 채워지지 않게(10/9 검토).
  if (waitsForCards && !useProjectStore.getState().projectLocaleLocked) await useProjectStore.getState().setContentLocale(locale)
  const producerWork = waitsForCards || plan.references.length > 0 || plan.styleImage !== null || plan.note !== null
  if (producerWork) {
    usePendingCreationStore.getState().put(projectId, {
      locale,
      original: plan.original,
      comicPages: plan.comicPages,
      styleImage: plan.styleImage,
      cards: plan.cards,
      references: plan.references,
      note: plan.note,
      startTreatment: waitsForCards && (plan.original !== null || plan.story.length > 0),
    })
  }

  // 첫 인사(시안 v04): 포맷을 먼저 채웠고, 트리트먼트를 쓰는 동안에도 고칠 수 있다.
  const greeting = translate(locale, plan.original
    ? 'I set the screen ratio first. The video will run as long as the original. I will read it and fill in the cards, then write the treatment.'
    : plan.story
      ? 'I filled in the format from your idea first. You can change it while I write the treatment.'
      : 'I filled in the format first. I will set up your pictures as you chose. Tell me the story, and I will write the treatment.')
  await fetch(`/api/project/${projectId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ stage: 'producer', role: 'model', content: greeting }),
  }).catch(() => null)

  if (!plan.story || waitsForCards) return { started: false }
  const started = await useProducerStore.getState().startTreatment()
  // Writer 는 처음 실행 때 잠기지 않은 프로젝트의 언어를 이야기 언어로 잠근다(writer/start) — 화면도 같은 언어로 맞춘다.
  if (started && !useProjectStore.getState().projectLocaleLocked) useProjectStore.getState().adoptProjectLocale(locale, true)
  return { started }
}
