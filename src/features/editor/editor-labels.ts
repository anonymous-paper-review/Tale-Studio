// Editor 화면 글 — 화면 머리 숫자(v3 ED1 "컷 7 · 33초 · 영상 0/7", 2026-11-03)와 영상 상태 낱말,
//   그리고 영상을 못 불러온 클립의 표시 규칙(QA 2026-11-03 밤 "Editor에서 무한 로딩").
//   약속: tests/editor/header-meta.test.ts · tests/editor/load-ends.test.ts
import { isTitleCardShotId } from '@/stores/editor-store'
import type { VideoClip } from '@/types'

type Translate = (text: string, params?: Record<string, string | number>) => string

/** 화면 머리 숫자 — 타임라인 컷 수 · 전체 길이(초, 반올림) · 영상이 생긴 컷 / 영상이 필요한 컷(타이틀 카드 제외). 컷이 없으면 null. */
export function editorHeaderMeta(
  layout: ReadonlyArray<{ shotId: string; durationSec: number }>,
  videoClips: readonly VideoClip[],
  t: Translate,
): string | null {
  if (layout.length === 0) return null
  const seconds = Math.round(layout.reduce((sum, item) => sum + item.durationSec, 0))
  const needVideo = layout.filter((item) => !isTitleCardShotId(item.shotId))
  const ready = needVideo.filter((item) => !!videoClips.find((c) => c.shotId === item.shotId)?.url).length
  return t('{cuts} cuts · {seconds}s · video {ready}/{total}', { cuts: layout.length, seconds, ready, total: needVideo.length })
}

/** 화면에 보이는 영상 상태 — 영상 주소가 있어도 불러오지 못했으면(404 · 막힘 · 끊김) 'unplayable'. */
export type ClipDisplayStatus = VideoClip['status'] | 'unplayable'

/** 영상 상태 낱말(사전 키) — 소스 카드가 영어 원문(pending · completed)을 보이던 자리. */
export function clipStatusLabel(status: ClipDisplayStatus): string {
  if (status === 'unplayable') return 'Could not load'
  if (status === 'completed') return 'Completed'
  if (status === 'generating') return 'Generating'
  if (status === 'failed') return 'Failed'
  return 'Waiting'
}

/** 그 클립의 화면 상태 — 불러오지 못한 영상 주소면 그 클립만 'unplayable', 나머지는 받은 상태 그대로. */
export function clipDisplayStatus(clip: Pick<VideoClip, 'url' | 'status'>, unplayable: readonly string[]): ClipDisplayStatus {
  return clip.url && unplayable.includes(clip.url) ? 'unplayable' : clip.status
}

/**
 * 샷이 없을 때 Editor 가 보일 화면 — 읽는 중(큰 Lumi) · 읽기 실패([다시 시도]) · 샷 없음("이전 단계를 먼저 끝내세요").
 *   프로젝트를 여는 중(아직 정해지지 않음, 프로젝트를 바꾸는 동안 포함)에는 샷 없음이 아니라 읽는 중이다(#pps-empty-states).
 */
export function editorEmptyScreen(input: {
  loadStatus: 'idle' | 'loading' | 'error' | 'ready'
  projectId: string | null
  initLoading: boolean
}): 'loading' | 'error' | 'empty' {
  if (input.loadStatus === 'error') return 'error'
  if (!input.projectId && input.initLoading) return 'loading'
  return input.loadStatus === 'ready' ? 'empty' : 'loading'
}

/** Editor 를 여는 동안 기다리는 카드의 제목 — 처음 열 때 소리 나누기 진행(파형을 채운 소리 수)이 있으면 %를 붙인다(2026-11-10). */
export function editorPrepTitle(prep: { done: number; total: number }, t: Translate): string {
  if (prep.total <= 0) return t('Preparing clips…')
  return t('Preparing clips… {percent}%', { percent: Math.round((Math.min(prep.done, prep.total) / prep.total) * 100) })
}

export type PreviewPane = 'title' | 'video' | 'unplayable' | 'no-video' | 'empty'

/** 미리 보기 판에 무엇을 그릴지 — 타이틀 카드 · 영상 · 그 컷만 "불러오지 못함" 안내 · 아직 영상 없음 · 빈 구간. */
export function previewPane(input: {
  isTitleCard: boolean
  hasShot: boolean
  clip: Pick<VideoClip, 'url'> | undefined
  unplayable: readonly string[]
}): PreviewPane {
  if (input.isTitleCard) return 'title'
  if (input.clip?.url) return input.unplayable.includes(input.clip.url) ? 'unplayable' : 'video'
  return input.hasShot ? 'no-video' : 'empty'
}

/**
 * 클립 꼬리표 · 오른쪽 클릭 메뉴 머리 — 샷은 "MS · 4.0s", 타이틀 카드는 "타이틀 카드 · 5.0s"(예전에는 메뉴 머리에 만들 때 붙인 샷 종류
 *   "WS"가, 꼬리표에는 "타이틀"이 보였다 — N 353:351 · 검토 c, 2026-11-14). 약속: tests/editor/title-card.test.ts
 */
export function clipMenuTitle(input: { isTitleCard: boolean; shotType: string; durationSec: number }, t: Translate): string {
  return `${input.isTitleCard ? t('Title card') : input.shotType} · ${input.durationSec.toFixed(1)}s`
}
