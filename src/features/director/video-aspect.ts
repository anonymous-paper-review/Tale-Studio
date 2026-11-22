// Director 의 영상 모델 · 화면비 판정(오너 2026-11-22 V3 "Veo 는 16:9 · 9:16 프로젝트에서만", 리드 11/23).
//   규칙은 fb-video 의 videoModelFitsAspectRatio · VIDEO_MODEL_ASPECT_TEXT 한 곳 — 서버(video-submit, 409 model_aspect_unsupported)와 같은 판정이다.
//   약속: tests/director/veo-aspect-ui.test.ts
import { videoAspectRatioFromFormat } from '@/lib/project-aspect'
import { normalizeProvider, VIDEO_MODEL_ASPECT_TEXT, videoModelFitsAspectRatio } from '@/lib/video-models'
import type { ProjectFormat } from '@/types/project'

type Translate = (text: string, params?: Record<string, string | number>) => string

/** 프로젝트 화면비 — 가로 · 시네마 16:9, 세로 9:16, 정사각 1:1, 포맷을 모르면 16:9(서버와 같은 공식). */
export function projectVideoAspect(format: ProjectFormat | null): string {
  return videoAspectRatioFromFormat(format) ?? '16:9'
}

/** 이 모델로는 이 프로젝트 화면비의 영상을 만들 수 없는가 — 노드의 [영상 리테이크](혼자 정한 것 5b) · 채팅의 모델 바꿈(q2)이 쓴다. 모델을 모르면 막지 않는다. */
export function modelBlockedByAspect(provider: string | null | undefined, format: ProjectFormat | null): boolean {
  if (!provider) return false
  return !videoModelFitsAspectRatio(normalizeProvider(provider), projectVideoAspect(format))
}

/** 영상 실패 줄 — 서버가 화면비로 거절한 계약 문구(영어 원문)는 화면 말로, 그 밖의 글은 그대로. */
export function shownVideoError(text: string, t: Translate): string {
  return text === VIDEO_MODEL_ASPECT_TEXT ? t(VIDEO_MODEL_ASPECT_TEXT) : text
}
