// Editor 화면 글 — 화면 머리 숫자(v3 ED1 "컷 7 · 33초 · 영상 0/7", 2026-11-03)와 영상 상태 낱말.
//   약속: tests/editor/header-meta.test.ts
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

/** 영상 상태 낱말(사전 키) — 소스 카드가 영어 원문(pending · completed)을 보이던 자리. */
export function clipStatusLabel(status: VideoClip['status']): string {
  if (status === 'completed') return 'Completed'
  if (status === 'generating') return 'Generating'
  if (status === 'failed') return 'Failed'
  return 'Waiting'
}
