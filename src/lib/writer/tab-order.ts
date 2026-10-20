// Storyboard(id writer) 화면 탭 순서 — 러프 스토리보드 · 대사(V2 프로젝트는 프리뷰 탭이 맨 앞). Alt+←/→ 순환과 슬라이드 방향의 기준.
//   마스터 시트 탭은 2026-10-20 오너 지시로 없앴다 — 마스터 시트는 [내보내기] 메뉴에서 받는다(lib/export/master-sheet).
//   약속: tests/writer/ui-store.test.ts · tests/writer/tabs.test.ts
import type { WriterTab } from '@/stores/writer-ui-store'

export function writerTabOrder(v2Available: boolean): readonly WriterTab[] {
  return v2Available ? ['v2', 'storyboard', 'dialogue'] : ['storyboard', 'dialogue']
}
