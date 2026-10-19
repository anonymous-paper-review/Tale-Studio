'use client'

// /studio/writer — Storyboard 단계(id writer, 리뉴얼 1차 2026-10-19 — 예전 이름 The Writers' Room, 2026-06-12 탭 부활).
// Artist [완료하기] 뒤 씬 · 샷을 나누고 러프 스토리보드 · 대사 · 마스터 시트를 검토하는 단계.
// 셸(사이드바/GlobalChat)은 layout.tsx 가 처리 — 여기는 feature wrapper만.
import { WriterWorkspace } from '@/features/writer/writer-workspace'

export default function WriterPage() {
  return <WriterWorkspace />
}
