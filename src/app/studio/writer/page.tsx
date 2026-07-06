'use client'

// /studio/writer — The Writers' Room (2026-06-12 탭 부활).
// writer 파이프라인 완료 후 스토리보드/스크립트 멀티탭 검토 단계.
// 셸(사이드바/GlobalChat)은 layout.tsx 가 처리 — 여기는 feature wrapper만.
import { WriterWorkspace } from '@/features/writer/writer-workspace'

export default function WriterPage() {
  return <WriterWorkspace />
}
