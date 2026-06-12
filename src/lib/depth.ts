// depthLevelFromRuntime — 러닝타임(초) → DepthLevel 순수 함수.
//
// producer-story-gate 결정: 옛 s0_genre 스테이지가 LLM으로 정하던 depth_level을 코드화한다.
//   소비처(producer 게이트 캐스트 요구치, Compact Mode 판정, l3 생략 판단, writer genre seed
//   조립)가 전부 이 함수를 호출한다 — depth_level은 저장하지 않는 파생값(architecture §0).
//
// 매핑표는 옛 s0_genre.ts의 runtimeSeconds → D 규칙을 그대로 옮긴 것:
//   5~15s → D1 · 15~60s → D2 · 60~300s → D3 · 300~600s → D4 ·
//   600~1200s → D5 · 1200~1800s → D6 · 1800s+ → D7
import type { DepthLevel } from '@/lib/writer/types/pipeline'

export function depthLevelFromRuntime(seconds: number): DepthLevel {
  if (seconds <= 15) return 'D1'
  if (seconds <= 60) return 'D2'
  if (seconds <= 300) return 'D3'
  if (seconds <= 600) return 'D4'
  if (seconds <= 1200) return 'D5'
  if (seconds <= 1800) return 'D6'
  return 'D7'
}
