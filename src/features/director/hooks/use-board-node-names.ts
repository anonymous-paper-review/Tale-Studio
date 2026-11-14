'use client'

// Director 화면의 보드 이름표 — Writer 보드(씬 목록 · 샷 순서)에서 센다(오너 2026-11-02 "전체 번호로 통일").
//   카드 · 노드 · 영상 카드 제목 · 상세 머리 · 지우기 창 · 내려받기 파일 이름 · 격자 순서가 이 하나를 쓴다. 이름은 화면 언어(오너 2026-11-14 답 7).
//   약속: tests/director/board-shot-numbers.test.ts · tests/ui-text/scene-shot-names.test.ts
import { useMemo } from 'react'
import { boardNodeNames, type BoardNodeNames } from '@/features/director/node-label'
import { useWriterStore } from '@/stores/writer-store'
import { useLocaleStore } from '@/stores/locale-store'

export function useBoardNodeNames(): BoardNodeNames {
  const manifest = useWriterStore((s) => s.sceneManifest)
  const shots = useWriterStore((s) => s.shots)
  const locale = useLocaleStore((s) => s.locale)
  return useMemo(() => boardNodeNames(manifest, shots ?? [], locale), [manifest, shots, locale])
}
