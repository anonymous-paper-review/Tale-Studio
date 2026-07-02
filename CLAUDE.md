# Tale — AI Video Generation Pipeline

> 텍스트 → 전문 촬영 기법 적용 고품질 AI 비디오 자동 생성 (B2B). 차별화는 Knowledge DB 기반 cinematography RAG.

## 상태

보일러플레이트 완료, 구현 진행 (2026-03-03). 구현 순서: P3+P4 (Phase 1) → P5 → P2 → P1.
P3 Artist는 **카드형 UI (Tabs: Characters/World/Inventory) 유지** — 노드 그래프 버전은 2026-06-04 사용자 결정으로 폐기(`specs/archive/2026-06-04-redesign-l0-canvas/`). 카드→asset-storage 어댑터 하이브리드. **P4도 Director Canvas (노드 그래프)로 재설계 시작 (2026-05-25)** — `specs/layers/director_canvas.md`.

## 기술 스택

- Frontend: Next.js 16 + Tailwind v4 + shadcn/ui + Zustand (`pnpm`)
- Canvas: React Flow (xyflow) — P4 Director Canvas (L0 Artist는 카드형 패널, React Flow 미사용)
- 3D: Three.js + React Three Fiber — P4 예정, **아직 미설치** (도입 시 `pnpm add three @types/three @react-three/fiber @react-three/drei`)
- Backend: Next.js API Routes + Supabase (PostgreSQL)
- AI (실제 코드 기준, 2026-06-09 정정):
  - **LLM 채팅** (producer/artist/director chat): **Claude `claude-sonnet-4-6`** via `src/lib/llm`→`src/lib/claude.ts` (Anthropic SDK, `ANTHROPIC_API_KEY`). 2026-05-17 Gemini→Claude 전환(F-7).
  - **writer 파이프라인 LLM**: multi-provider dispatch (`src/lib/writer/llm/dispatch.ts`) — Story/Visual축 = **Gemini `gemini-3-flash-preview`**, Cinematography축 = **Claude `claude-sonnet-4-6`**.
  - **이미지**: **fal.ai `openai/gpt-image-2`** (`src/lib/writer/llm/fal.ts`, `FAL_KEY`). *자체 GPU(H100) 없음 — fal API only.* 예외: 러프 스토리보드(previz)는 비용/속도로 **`fal-ai/flux-2/klein/4b/lora`** (`ROUGH_STORYBOARD_IMAGE_MODEL`, 2026-06-12).
  - **비디오**: **fal.ai `alibaba/happy-horse/reference-to-video`** (`fal.ts`). *Kling/Veo/Pro6000 self-hosted 계획은 미구현 — fal API only.*
  - fal 제약: 셀프서브 동시 요청 기본 10개를 `FAL_KEY` 계정 전체가 공유(멀티유저 시 유저별 쿼터 필요). 클라 동시성은 `runPool(concurrency=4)`.

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
| **writer 엔진** (스토리→씬/캐릭터/로케이션/샷, 옛 svc) | `src/lib/writer/` + `src/lib/writer/CLAUDE.md` (실행 모드 2개·스테이지 맵) |
| **공유 라이브러리 맵** (생성 잡/쿼터/알림/핸드오프 등) | `src/lib/CLAUDE.md` |
| **비동기 생성·AI 호출 규칙** (submit/webhook/CAS/retry/쿼터) | `.claude/rules/async-generation.md` |
| Zustand 스토어 | `src/stores/` |
| API 라우트 | `src/app/api/` |
| 스튜디오 페이지/기능 | `src/app/studio/<stage>/`, `src/features/<stage>/` |
| 디자인 토큰 *값* | `src/app/globals.css` |
| **용어·네이밍 충돌** (코드↔DB 식별자, 한↔영 대응) | `.claude/terminology/glossary.md` · `conflicts.md` (충돌 10건 — 데이터 손실 주의 #3 포함) |

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
- `pnpm test` / `pnpm test:watch` — vitest (`tests/`)
- **e2e 2모드** (`e2e/TEST-MODES.md`): **Skip**(무비용, 세션 변경분만 실브라우저로 눌러보고 실DB 저장 확인 — **UI/기능 변경 커밋 전 기본 게이트**) / **Full**(비용, producer→끝 시나리오 — `e2e/README.md` 레지스트리). Skip 셋업 하니스: `pnpm e2e:db newProject|skipArtist|cookies|rmProject|pruneSkip`. 판단·브라우저 드라이브는 에이전트가 수행.
- API 키는 `.env.local`. 하드코딩 금지.
- Knowledge DB: `databases/knowledge/*.yaml` (로컬) + Supabase (프로덕션)
- **프로듀서 시드 / 핸드오프 검증 하니스** (`scripts/producer-seed.mjs`, fixture `scripts/fixtures/producer-seed.json`): producer 산출물(`producer_draft`+story/settings+`messages(stage='producer')`)만 시드로 고정해 producer→writer/artist 핸드오프를 반복 검증. fixture=템플릿(pristine).
  - **"클론" / "클론 떠줘" = `pnpm seed:producer:clone`** — fixture로 새 throwaway 프로젝트 생성(`current_stage='producer'`, 다운스트림 0), 출력 마지막 줄 = 새 projectId. `/studio/producer?projectId=<새id>`에서 "Complete your story"로 핸드오프. (검증 기본 경로)
  - `pnpm seed:producer:snapshot <projectId>` 시드 캡처 / `:prune` clone 일괄 삭제(title에 `[seed-clone]`) / `:reset <projectId>` 한 프로젝트 in-place 복원 / `:status <projectId>` 상태.
- **writer 초기화 / producer 롤백 디버깅 루틴** (`scripts/reset-to-producer.mjs` · skill `reset-producer`): 한 프로젝트를 핸드오프 직전(**producer 완성**)으로 되돌린다 — writer 이후 산출물 전부 WIPE(writer_runs·scenes·shots·locations·generation_jobs·*_image_candidates·editor_states·video_clips·subtext_notes·`characters(origin='writer')`·비-producer messages), **producer 출력 보존**(projects 컬럼·`characters(origin='producer')`·관계·producer messages). FK-safe·멱등. 스냅샷 불요(현재 producer 내용 보존) — `seed:producer:reset`(스냅샷 복원)과 별개. **항상 `--dry` 먼저**: `pnpm reset:producer <projectId> --dry` → `pnpm reset:producer <projectId>`. 재핸드오프('Complete your story')로 writer 재검증.

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
- **2026-06-10**: artist 카드형 롤백(6-04) 후 `.claude/rules/artist-canvas.md`가 6일간 폐기된 노드 그래프 패턴을 계속 주입. archive 의식이 specs만 게이트하고 하네스(rules/CLAUDE.md)는 체크 안 한 구조적 공백. 이후 archive 시 하네스 정합 체크 필수 (spec skill §archive).

### 하네스 유지 규약 (2026-06-10)

- **역할 분담**: `.claude/rules/*.md` = 잘 안 변하는 *제약*만 (금지·패턴·안 건드릴 곳). 디렉토리 `CLAUDE.md` = anatomy·포인터 (자주 변함). 같은 내용 양쪽 중복 금지.
- **변동성 높은 사실(모델 ID·엔드포인트·프로바이더)은 본 문서 §기술 스택 한 곳만** — 다른 문서는 포인터. decisions.md의 모델명은 당시 이력(append-only)이므로 수정 대상 아님.
- **change archive 시 하네스 정합 체크** (spec skill §archive 2단계): Affected code 디렉토리에 걸린 rules(`paths:` frontmatter)·CLAUDE.md가 변경 후 상태와 정합하는지 확인 후 archive.

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
/studio/writer   → features/writer/   (러프 스토리보드 — pre-concept previz)
/studio/artist   → features/artist/   (카드형 Tabs: Characters/World/Inventory)
/studio/director → features/director/
/studio/editor   → features/editor/
```

> **writer 파이프라인은 백엔드 실행, 탭은 러프 스토리보드 검토 단계로 부활** (2026-06-12).
> `src/lib/writer/` 파이프라인이 producer 핸드오프(`/api/writer/start`)에서 백그라운드 실행되어
> DB(characters/scenes/locations/shots)를 채우고, `/studio/writer` 탭은 완료 후 샷별 러프 패널
> (목각 인형 previz, `shots.rough_storyboard`)과 스토리 텍스트를 검토한다. producer → **writer** → artist.
>
> **producer-story-gate (2026-06-12)**: 옛 writer `s0`(장르축)·`s2`(캐릭터 정의)를 **producer로 승격**.
> producer가 장르축+캐스트를 게이트로 확정 → 핸드오프 시 `characters` upsert(`origin='producer'`) +
> genre/cast **seed** → writer는 s0/s2 **생략**하고 s1(구조)부터 수행. 역할 분담 =
> **producer(스토리 정체성) → writer(전개 s1·s3 + 연출 v0~v5) → 러프 보드**.
> characters는 producer가 정의하면 **입력**(재실행해도 보존, additive) — writer는 새 인물만 추가.
> 캐릭터 칸: `appearance` 단일(옛 `fixed_prompt` drop) + `entity_type`(person/object)·`origin`·
> `voice`·`arc`·`motivation` (producer-story-gate, `locked` 제거). 관계 = `character_relationships` 테이블.

### 인벤토리 (목록 복제 금지 — 코드가 진실)

- Stores: `ls src/stores/`가 진실 (역할 설명은 `src/stores/CLAUDE.md`)
- Types: `src/types/` — 핵심 개념: `Shot`, `CameraConfig`(6축 -10~+10), `Scene`, 에셋 타입
- Mock 데이터 없음 — 전부 Supabase 실 DB 경유 (옛 보일러플레이트 mocks는 폐기, 2026-06-10 확인)
