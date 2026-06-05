# Tale — AI Video Generation Pipeline

> 텍스트 → 전문 촬영 기법 적용 고품질 AI 비디오 자동 생성 (B2B). 차별화는 Knowledge DB 기반 cinematography RAG.

## 상태

보일러플레이트 완료, 구현 진행 (2026-03-03). 구현 순서: P3+P4 (Phase 1) → P5 → P2 → P1.
P3 Artist는 **카드형 UI (Tabs: Characters/World/Inventory) 유지** — 노드 그래프 버전은 2026-06-04 사용자 결정으로 폐기(`specs/archive/2026-06-04-redesign-l0-canvas/`). 카드→asset-storage 어댑터 하이브리드. **P4도 Director Canvas (노드 그래프)로 재설계 시작 (2026-05-25)** — `specs/layers/director_canvas.md`.

## 기술 스택

- Frontend: Next.js 16 + Tailwind v4 + shadcn/ui + Zustand (`pnpm`)
- Canvas: React Flow (xyflow) — P4 Director Canvas (L0 Artist는 카드형 패널, React Flow 미사용)
- 3D: Three.js + React Three Fiber — P4 (`pnpm add three @types/three @react-three/fiber @react-three/drei`)
- Backend: Next.js API Routes + Supabase (PostgreSQL)
- AI: Gemini (LLM), Gemini Imagen + H100 self-hosted (이미지), Kling + Veo + Pro6000 self-hosted (비디오)

## 디렉토리 구조

| 폴더 | 성격 | harness 참조 |
|------|------|------|
| `specs/` | **명세 (spec) — source-of-truth, 캐넌**. constitution, changes, archive, layers, data, design system | ✓ 직접 참조 |
| `.claude/` | Claude Code harness (rules / hooks / skills / agents / settings.json) | ✓ 자동 로드 |
| `.claude/cache/` | 생성된 오프라인 캐시 (Supabase MCP 미연결 대체). `db/`=라이브 DB 스키마. git 미추적(실데이터), `_refresh.py`만 추적 | ✓ DB 작업 시 참조 |
| `src/` | 코드 (Next.js app, features, stores, lib) | ✓ paths-scoped rules + subdir CLAUDE.md |
| `databases/` | Knowledge DB YAML (로컬) + Supabase migration | ✓ supabase rule |
| `assets/` | Lore 테스트 데이터 (`assets/lore/*.yaml`) | — |
| `docs/` | **리서치 / 계획 / WIP 문서**. 캐넌 아님 — harness 직접 참조 안 함 | — (사용자 reference) |
| `PROGRESS.md` | 검증 보드 + 진행 중(live) 작업만 (완료 Phase → `docs/progress-log/`) | ✓ SessionStart hook |

## 라우터 (주제 → 어디)

> **구현·스키마(WHAT IS) = 코드 + `.claude/cache/db`** / **의도·계약(WHY) = specs**. 둘이 다르면 **코드가 진실**.
> 코드 포인터는 *디렉토리/모듈 단위* (라인 단위 금지 — 코드 이동에 깨짐).

### 구현 (코드/캐시 — 현재 동작·스키마)

| 무엇 | 어디 |
|------|------|
| **라이브 DB 스키마** (테이블·컬럼·타입·PK/FK·enum·JSONB·예시) | `.claude/cache/db/README.md` → 테이블별 `<table>.md` (재생성 `python3 .claude/cache/db/_refresh.py`) |
| 마이그레이션 ↔ 라이브 DB drift | `.claude/cache/db/_migration-sync.md` |
| **writer 엔진** (스토리→씬/캐릭터/로케이션/샷, 옛 svc) | `src/lib/writer/` (스테이지: `pipeline/stages/`, DB 기록: `pipeline/util/persist_manifest.ts`) |
| Zustand 스토어 | `src/stores/` |
| API 라우트 | `src/app/api/` |
| 스튜디오 페이지/기능 | `src/app/studio/<stage>/`, `src/features/<stage>/` |
| 디자인 토큰 *값* | `src/app/globals.css` |

### 의도·계약 (specs — 왜/북극성)

| 무엇 | 어디 |
|------|------|
| **프로젝트 원칙 (Constitution)** | `specs/_constitution.md` |
| **진행 중 / 완료 변경** | `specs/changes/` · `specs/archive/` |
| **새 change 작성 표준** | `specs/_TEMPLATE.md` |
| MVP 범위 / 우선순위 | `specs/mvp_scope.md` |
| 의사결정 로그 (Active만) | `specs/decisions.md` (superseded/archived 결정 → `specs/decisions-archive.md`) |
| 열린/닫힌 질문 | `specs/open_questions.md` |
| **디자인 시스템** (컨벤션 `design.md` / 레퍼런스 `design-references.md`) | `specs/design.md` |
| 페이지 UX (의도) | `specs/ux_pages.md` |
| API 기능 *의미* (6축 카메라, RAG) | `specs/api_features.md` |
| **파이프라인 레이어 계약** (L0~L3 / Director Canvas — *구현은 코드*) | `specs/layers/README.md` |
| Asset Storage 인터페이스 계약 | `specs/data/asset_storage.md` |
| harness 설계 (왜) | `docs/research/claude-code-harness-design-for-tale-studio.md` |
| 자주 쓰는 패턴 / 보일러플레이트 | 본 문서 하단 도메인 특수성 |

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
Story → [writer 엔진] → DB(scenes/characters/locations/shots) → [L3 Prompt Builder] → [Video API]
        (옛 L1 Scene Architect + L2 Shot Composer를 통합 수행)
```

L0은 캐릭터/월드를 카드 UI로 사전 정의해 Asset Storage로 공급. **L1(씬/캐릭터 분할)·L2(샷)는 이제 writer 엔진**(`src/lib/writer/`, 옛 svc)이 백그라운드로 수행해 DB를 채운다(decision #38). 상세는 layer 스펙 + 코드.

> ### ⚠️ 용어 글로서리 (혼동 주의)
> **두 개의 "레이어" 어휘가 따로 있음**:
> - **앱 파이프라인 라벨** `L0~L3` (= 제품 단계, *specs/layers/ 의 개념*): L0 Artist / L1 씬·캐릭터 / L2 샷 / L3 프롬프트. **코드엔 식별자로 없음** — 코드의 단계는 `StageId`(producer/artist/director/editor) + writer 엔진.
> - **writer 엔진 내부 스테이지** (*src/lib/writer 코드의 실구조*, 옛 svc 파이프라인): film-craft 도메인 이름 — `genre`/`narrativeStructure`/`characters`/`scenes`(Story), `renderFormat`/`artDirection`/`productionDesign`/`sceneCinematography`(Visual), `decoupage`/`shotDesign`/`shotSequence`/`renderPrompts`/`shotImages`/`shotVideos`. 로그 파일만 순번 prefix(`02_genre.json`…). 앱 라벨 `L0~L3`과 **다른 축** (옛 `S/L+숫자` prefix는 2026-06-05 리네임으로 폐기).
>
> **source-of-truth 원칙**: *현재 구현/스키마*(WHAT IS) = **코드 + `.claude/cache/db`**. *의도/이유*(WHY) = **specs**. layer 스펙의 메커니즘 서술이 코드와 다르면 코드가 진실.

### URL → 디렉토리

```
/studio/producer → features/producer/
/studio/artist   → features/artist/   (카드형 Tabs: Characters/World/Inventory)
/studio/director → features/director/
/studio/editor   → features/editor/
```

> **writer는 UI 없는 백엔드 전용 스테이지** (decision #38, 2026-06-05). `src/lib/writer/` 파이프라인이
> producer 핸드오프(`/api/writer/start`)에서 백그라운드 실행되어 DB(characters/scenes/locations/shots)를
> 채운다. producer → **artist** 직행. 옛 `generate-scenes` writer·`/studio/writer` UI는 폐기.
> 캐릭터 프롬프트는 `characters.appearance` 단일 (옛 `fixed_prompt` drop).

### 보일러플레이트 인벤토리

Stores: `director-store`, `artist-store`, `project-store`, `producer-store`, `writer-store`, `editor-store`, `global-chat-store`
Mocks: `shot-sequences` (24 shots), `scene-manifest` (4 scenes), `character-assets` (3 캐릭터), `world-assets` (4 배경), `video-clips`
주요 Types: `Shot`, `CameraConfig` (6축 -10~+10), `Scene`, `CharacterAsset`, `WorldAsset`, `VideoClip`
