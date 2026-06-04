# src/features/editor — Post-Production Suite

## Status
- Spec: `@../../../specs/ux_pages.md` P5 (Lite 범위)

## Stack
- Zustand — `@../../../stores/editor-store.ts`
- shadcn/ui — 비디오 프리뷰, 타임라인, Crop 도구

## MVP 범위 (decisions #27)
- 포함: 비디오 프리뷰 + 타임라인 (씬별 탭, 샷 썸네일) + Crop + 순서 편집 + Draft 렌더링
- 제외: In-Painting, In-Pointing, 음악 Waveform 싱크, AI 품질 평가

## 자주 하는 작업
| 무엇 | 어디 |
|---|---|
| 클립 import (Director 핸드오프) | editor-store `setClips` |
| 타임라인 편집 | timeline 컴포넌트 + store action |
| 렌더링 큐 | `../../../app/api/...` (TBD) |

## D-8 핸드오프
Director Canvas D-8에서 각 Shot의 ★ Final Video를 editor-store clips에 export 예정. Final 누락 Shot은 마지막 Video fallback + 경고 토스트.
