---
change: redesign-l0-canvas
status: archived
archived: 2026-06-04
superseded-by: rollback-artist-card
created: 2026-05-17
decisions: [29, 30, 31, 32, 33, 34]
---

# Redesign L0 (P3) to Node Canvas

## Why

기존 P3 The Visual Studio의 character-panel / world-panel / inventory-grid 패널 UI는 캐릭터·월드 간 관계 표현과 다음 단계(Asset Storage)로의 데이터 흐름 명시에 한계가 있다. **노드 그래프 패러다임**으로 전환하여 노드=개체 메탈모델을 구축하고 (decisions #29), 채팅 기반 agentic 조작과 결합한다 (decisions #31).

## What Changes

- React Flow (xyflow) 12.10.2 채택 — MVP 속도 + ComfyUI 호환 핀-엣지 메타포 (decisions #29.1)
- 기존 artist 패널 완전 교체 — 병행 또는 모드 토글 안 함 (decisions #29.2)
- **Actor / World / Status 3종 노드**. 3D / Multi-angle은 별도 노드가 아닌 Actor/World 노드의 *출력 모드*로 흡수 (decisions #29.3)
- Status만 별도 노드 (마더 연동 변형이라는 별개 정체성, decisions #29.4)
- 캐릭터 등록 임계값 = **누적 이미지 ≥ 20장** (Higgsfield Soul ID 차용, decisions #29.5)
- 프롬프트만 전파, 이미지 재생성은 수동 (토큰 비용 폭발 방지, decisions #29.6)
- Meeting Room = 기존 `global-chat-store` artist 분기 재사용, 캔버스 좌측 도킹 → 이후 F-6으로 우측 GlobalChat 통합 (decisions #29.7 / #31)
- **Agentic Canvas**: `CanvasUpdate` union 10액션, agent가 노드 직접 조작 (decisions #31). 파괴 액션은 user-facing 모달 거침.
- 엣지 카테고리 단순화: Actor↔Actor는 `references`만, `parent`는 Status Branch 자동 생성 전용. Actor↔World는 `in-world` (decisions #32)
- 우클릭 컨텍스트 메뉴 완전 제거. 노드 액션은 BaseNode 헤더 4 아이콘 (Edit / Branch / Copy / Delete) + NodePopup에 일원화 (decisions #33)
- 이미지 생성 모델: Imagen paid 까지 Nano Banana (`gemini-2.5-flash-image`) 임시 사용 (decisions #34)
- 색 시스템: Actor=`--chart-1`, World=`--chart-2`, Status=마더 색 채도 50% 감소 (decisions #30)
- 한 프로젝트 = 한 그래프 (MVP, YAGNI, decisions #29.8)

## Impact

- **Affected specs**: `specs/layers/L0_concept_canvas.md` (rewrite — source-of-truth), `specs/data/canvas_data_model.md` (신규), `specs/data/asset_storage.md`
- **Affected code**: `src/features/artist/` (전면 교체 — nodes/, edges/, canvas-popups/), `src/app/studio/artist/page.tsx`, `src/app/api/artist/chat/route.ts`, `src/app/api/generate/image/route.ts`
- **Affected stores**: `src/stores/canvas-store.ts` (신규), `src/stores/asset-storage-store.ts` (신규), `src/stores/artist-store.ts` (점진 deprecate, director/global-chat 의존 정리 필요), `src/stores/global-chat-store.ts` (artist 분기)
- **Affected decisions**: #29, #30, #31, #32, #33, #34
- **연동 작업**: project-store 동기화 (프로젝트 전환 시 reset), Asset Storage → P4 export

## Verification gate (archive 조건)

- `tasks.md`의 모든 `[c]`가 `[x]`로 승격
- 1차 브라우저 검증 16 시나리오 (Artist 단계 테스트 체크리스트) 통과
- `specs/layers/L0_concept_canvas.md`에 final state 반영
- decisions.md에 archive 사실 1줄 append
