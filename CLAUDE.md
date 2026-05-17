# Tale — AI Video Generation Pipeline

> 텍스트 → 전문 촬영 기법 적용 고품질 AI 비디오 자동 생성 (B2B). 차별화는 Knowledge DB 기반 cinematography RAG.

## 상태

보일러플레이트 완료, 병렬 개발 진행 (2026-03-03). 구현 순서: P3+P4 (Phase 1) → P5 → P2 → P1. 
P3는 L0 Concept Canvas (노드 그래프)로 전면 재설계 중.

## 기술 스택

- Frontend: Next.js 16 + Tailwind v4 + shadcn/ui + Zustand (`pnpm`)
- Canvas: React Flow (xyflow) — L0 Concept Canvas
- 3D: Three.js + React Three Fiber — P4 (`pnpm add three @types/three @react-three/fiber @react-three/drei`)
- Backend: Next.js API Routes + Supabase (PostgreSQL)
- AI: Gemini (LLM), Gemini Imagen + H100 self-hosted (이미지), Kling + Veo + Pro6000 self-hosted (비디오)

## 라우터

| 무엇 하려면 | 어디 보는가 |
|-------------|-------------|
| MVP 범위 / 우선순위 / 구현 순서 | `specs/mvp_scope.md` |
| 페이지별 레이아웃·요소·인터랙션 | `specs/ux_pages.md` |
| **시각·인터랙션 공통 컨벤션 (디자인 헌법)** | `docs/design.md` |
| 페이지별 디자인 레퍼런스/벤치마크 | `docs/design-references.md` |
| L0 Concept Canvas (노드 그래프, P3 재설계) | `specs/layers/L0_concept_canvas.md` |
| L0 Canvas 데이터 모델 (TS 타입, Zustand 액션) | `specs/data/canvas_data_model.md` |
| Asset Storage 스키마 (등록 캐릭터/월드, P4 인터페이스) | `specs/data/asset_storage.md` |
| L1 Scene 분할 (Pumpup) | `specs/layers/L1_scene_architect.md` |
| L2 Shot Composer | `specs/layers/L2_shot_composer.md` |
| L3 Prompt Builder + Knowledge DB | `specs/layers/L3_prompt_builder.md` |
| API 기능 (6축 카메라, RAG) | `specs/api_features.md` |
| 의사결정 로그 | `specs/decisions.md` |
| 열린/닫힌 질문 | `specs/open_questions.md` |
| 인프라 / 배포 / 비용 | `docs/infrastructure.md` |
| 자주 쓰는 패턴 / 보일러플레이트 인벤토리 | 본 문서 하단 도메인 특수성 |

## 실행

- `pnpm dev` — 개발 서버
- `pnpm build` / `pnpm typecheck` / `pnpm lint`
- API 키는 `.env.local`. 하드코딩 금지.
- Knowledge DB: `databases/knowledge/*.yaml` (로컬) + Supabase (프로덕션)

---

## 작업 진행 규약

### 세션 진입 시 (반드시)

1. `PROGRESS.md` 읽기
2. 파일 상단 **"현재 검증 보드"** 또는 `grep '^- \[c\]' PROGRESS.md` 확인
3. 미검증 항목 수 + 영역을 사용자에게 1줄 보고 (예: "P10-3/4/5/6 검증 대기 N개 있음")
4. 사용자에게 선택받기: (a) 검증 진행 (b) 새 작업 진입 (c) 잡힌 버그 수정

### 작업 항목 상태 마커

```
[ ] 미착수
[c] 코드 작성 완료, 브라우저/사용자 검증 대기 ← AI가 코드만 작성한 상태의 기본 마커
[x] 검증 완료 (코드 + 브라우저 확인 둘 다 ✓)
[~] 보류 (사유 명시)
```

### DoD 작성·체크 규칙

- DoD가 *동작*을 명시하면 (예: "더블클릭 → 모달 열림"), `[x]`로 마킹하려면 **반드시 브라우저에서 실제 동작 확인** 후에만.
- 코드만 작성한 상태에서는 `[c]` + DoD 끝에 "코드 ✓ / 검증 대기" 명시.
- 인프라성 항목 (파일 생성, 타입 정의, TS clean) 은 코드 자체로 검증되므로 `[x]` OK.
- UI 인터랙션·API 호출·persistence는 `[c]` 거쳐 브라우저 확인 후 `[x]`.

### 사고 → 교훈

- **2026-05-17**: L0 Canvas P10-2~6을 "코드 작성 완료" 시점에 `[x]` 처리. 사용자가 더블클릭이 안 된다고 지적해서야 React Flow `zoomOnDoubleClick` 기본값 문제 잡힘. DoD가 "동작"인데 *동작 확인 없이* 체크한 패턴. 이후 모든 동작 DoD는 `[c]` 거쳐 `[x]`로 승격.

---

## 도메인 특수성

### 3-Level Pipeline + L0

```
[L0 Concept Canvas] → Asset Storage
                            ↓
Story → [Pumpup] → [L1 Scene Architect] → [L2 Shot Composer] → [L3 Prompt Builder] → [Video API]
```

L0은 L1 이전에 캐릭터/월드를 사전 정의해 Asset Storage로 다음 단계에 공급한다. 노드=개체 패러다임 (Higgsfield 노드=모델과 다름). 상세는 L0 스펙.

### 병렬 개발 소유권

| Area | Dev A | Dev B |
|------|-------|-------|
| `features/producer/`, `writer/`, `artist/` | Owner | - |
| `features/director/`, `editor/` | - | Owner |
| `stores/artist-store.ts` (L0 재설계 시 `canvas-store.ts`로 교체) | Owner | - |
| `stores/director-store.ts`, `editor-store.ts` | - | Owner |
| `types/`, `components/layout/`, `stores/project-store.ts` | PR to main | PR to main |
| `mocks/` | 추가만 | 추가만 |

- 브랜치: Dev A `feature/producer-writer-artist`, Dev B `feature/director-editor`
- 공유 영역 변경은 main PR, 상대가 rebase

### URL → 디렉토리

```
/studio/producer → features/producer/
/studio/writer   → features/writer/
/studio/artist   → features/artist/   (L0 Canvas로 재설계)
/studio/director → features/director/
/studio/editor   → features/editor/
```

### 보일러플레이트 인벤토리

Stores: `director-store`, `artist-store`, `project-store`, `producer-store`, `writer-store`, `editor-store`, `global-chat-store`
Mocks: `shot-sequences` (24 shots), `scene-manifest` (4 scenes), `character-assets` (3 캐릭터), `world-assets` (4 배경), `video-clips`
주요 Types: `Shot`, `CameraConfig` (6축 -10~+10), `Scene`, `CharacterAsset`, `WorldAsset`, `VideoClip`
