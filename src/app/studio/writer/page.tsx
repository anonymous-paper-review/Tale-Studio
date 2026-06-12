'use client'

// /studio/writer — The Writers' Room (2026-06-12 탭 부활).
// writer 파이프라인 완료 후 러프 스토리보드(pre-concept previz) 검토 단계.
// 셸(사이드바/GlobalChat)은 layout.tsx 가 처리 — 여기는 feature wrapper만.
import { RoughStoryboardView } from '@/features/writer/rough-storyboard-view'

export default function WriterPage() {
  return <RoughStoryboardView />
}
