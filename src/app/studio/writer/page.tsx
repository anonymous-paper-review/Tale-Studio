'use client'

// /studio/writer — Storyboard 단계(id writer, 리뉴얼 1차 2026-10-19 — 예전 이름 The Writers' Room, 2026-06-12 탭 부활).
// O1(오너 2026-11-26 "콘티를 Artist 앞에"): Artist [완료하기] 뒤 실사 보기 — 처음엔 Writer 콘티 그림, [시작] → 실사(m1126 S2), 탭 [스토리보드 | 대사].
//   씬 · 샷 나누기 · 러프 · 화살표는 Writer 콘티(/studio/conti, 예전 이 화면의 보드). 마스터 시트는 [내보내기] 메뉴(2026-10-20).
// 셸(사이드바/GlobalChat)은 layout.tsx 가 처리 — 여기는 feature wrapper만.
import { StoryboardWorkspace } from '@/features/storyboard/storyboard-workspace'

export default function WriterPage() {
  return <StoryboardWorkspace />
}
