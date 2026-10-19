// Producer 시작(리뉴얼 1차 2026-10-19) — 정한 값으로 이야기 · 설정 · Producer 카드 초안 · Writer 시작 요청을 만든다. 순수 함수.
//   시작 라우트가 검사 · 저장에 쓰고, 클라이언트는 돌려받은 Writer 시작 요청을 그대로 /api/writer/start 에 보낸다
//   (예전 Producer 의 트리트먼트 초안 시작과 같은 모양 — producer-store startTreatment).
//   약속: tests/producer/entry-start-plan.test.ts
import { depthLevelFromRuntime } from '@/lib/depth'
import type { DepthLevel } from '@/lib/writer/types/pipeline'
import { translate } from '@/lib/i18n/translate'
import type { AppLocale } from '@/lib/locale'
import { writerRuntimeSeconds } from '@/lib/producer/runtime'
import type { ProducerDraft } from '@/stores/producer-store'
import type { ProjectFormat, ProjectSettings } from '@/types/project'
import {
  MIN_IDEA_CHARS,
  fileHasText,
  formatFromRatio,
  hasOriginalText,
  ideaLength,
  moodOf,
  runtimeSeconds,
  type LevelKey,
} from '@/features/entry/options'
import { picksComplete, type EntryDraft } from './draft'

/** 예전 Producer 카드 초안(projects.producer_draft) 버전 — producer-store PRODUCER_DRAFT_VERSION 과 같다. */
const PRODUCER_DRAFT_VERSION = 1

/** /api/writer/start 에 그대로 보내는 본문(트리트먼트 초안 · V1). changeLevel 은 바꿈 정도 — 파이프라인 배선은 통합 단계. */
export interface EntryWriterStartBody {
  projectId: string
  story: string
  treatmentDraft: true
  writerEngine: 'v1'
  preserveScript?: true
  runtimeSeconds?: number
  genre: {
    genre: string
    subGenre: undefined
    tone: string[]
    targetEmotion: string[]
    runtime_seconds: number
    depth_level: DepthLevel
    format: ProjectFormat
  }
  cast: { characters: [] }
  backgrounds: { locations: [] }
  changeLevel: LevelKey
}

export type EntryStartRefusal = 'too_short' | 'missing_picks' | 'keep_needs_original'

export type EntryStartPlan =
  | {
      ok: true
      story: string
      settings: ProjectSettings
      producerDraft: ProducerDraft
      writerStart: EntryWriterStartBody
      changeLevel: LevelKey
      /** 프로젝트 제목이 제목 없음일 때만 AI가 붙인 제목, 아니면 null(그대로 둔다). */
      title: string | null
    }
  | { ok: false; code: EntryStartRefusal }

export interface EntryStartInput {
  projectId: string
  draft: EntryDraft
  /** 프로젝트 언어 — 새 흐름은 만들 때 사이트 언어로 잠근다. 장르 이름 · 대사 언어가 이 언어다. */
  locale: AppLocale
  currentTitle: string
}

/** 이야기 = 아이디어 · 빈 줄 · 파일 글(있는 것만). */
export function entryStory(draft: EntryDraft): string {
  const idea = draft.idea.trim()
  const fileText = fileHasText(draft.file) ? (draft.file!.text ?? '').trim() : ''
  return [idea, fileText].filter(Boolean).join('\n\n')
}

const UNTITLED = 'Untitled'

export function planEntryStart({ projectId, draft, locale, currentTitle }: EntryStartInput): EntryStartPlan {
  if (ideaLength(draft.idea) < MIN_IDEA_CHARS && !fileHasText(draft.file)) return { ok: false, code: 'too_short' }
  if (!picksComplete(draft.picks)) return { ok: false, code: 'missing_picks' }
  const { mood, runtime, level, ratio } = draft.picks
  if (!mood || !runtime || !level || !ratio) return { ok: false, code: 'missing_picks' }
  if (level === 'keep' && !hasOriginalText(draft.idea, draft.file)) return { ok: false, code: 'keep_needs_original' }

  const keep = level === 'keep'
  const story = entryStory(draft)
  // 그대로 영상화는 원작 길이가 영상 길이다 — 길이를 정하지 않는다(2026-10-09 오너 "영상 길이 제한을 없애줘").
  const playtime = keep ? 0 : runtimeSeconds(runtime)
  const format = formatFromRatio(ratio)
  const genre = translate(locale, moodOf(mood).label)
  const settings: ProjectSettings = { playtime, genre, format, tone: [], dialogueLanguage: locale }
  const producerDraft: ProducerDraft = {
    version: PRODUCER_DRAFT_VERSION,
    savedAt: Date.now(),
    storyText: story,
    storyReady: true,
    settings,
    cast: [],
    backgrounds: [],
    preserveScript: keep ? true : null,
    treatmentSyncedVersion: null,
  }
  const writerStart: EntryWriterStartBody = {
    projectId,
    story,
    treatmentDraft: true,
    writerEngine: 'v1',
    ...(keep ? { preserveScript: true as const } : {}),
    runtimeSeconds: writerRuntimeSeconds(playtime, keep),
    genre: {
      genre,
      subGenre: undefined,
      tone: [],
      targetEmotion: [],
      runtime_seconds: playtime,
      depth_level: depthLevelFromRuntime(playtime || 0),
      format,
    },
    cast: { characters: [] },
    backgrounds: { locations: [] },
    changeLevel: level,
  }
  const untitled = !currentTitle.trim() || currentTitle.trim() === UNTITLED
  const recTitle = draft.rec?.title?.trim() || null
  return { ok: true, story, settings, producerDraft, writerStart, changeLevel: level, title: untitled ? recTitle : null }
}
