# Decisions — Archive (superseded / archive-event records)

> **아카이브된 결정 로그.** `specs/decisions.md`에서 분리(2026-06-05).
> 여기 있는 결정은 **이후 결정에 의해 번복(superseded)되었거나**, 변경 작업 archive 사실만
> 기록하는 entry(상세는 해당 `specs/archive/<change>/` 폴더에 중복 존재)입니다.
>
> ADR 원칙(append-only, 삭제 금지)을 지키기 위해 본문을 그대로 보존합니다.
> 현재 유효한(Active) 결정은 `specs/decisions.md` 본문 참조. 본 파일은 harness가 직접
> 자동참조하지 않으나, "왜 그 방향이 폐기됐나"를 추적할 때 참조하세요.

---

## Archive-event 기록 (상세는 specs/archive/ 폴더)

### 50. unify-director-store-db archived (브라우저 검증 waive)
- **결정**: `unify-director-store-db`(Director 데이터 DB 단일 진실 일원화)를 archive. **Step 0~2 코드 완료 + DB 적용 완료**: Step 0(canvas-store 샷편집 DB write-through), Step 1(`director-store.ts` 삭제, editor/global-chat/project-store 의존 이전), Step 2(005 라이브 적용 + 그래프 hydrate/write-back, `VideoNodeData.videoClipId`). 핵심 로직(hydrate/INSERT/DELETE/final-demote) 코드 리뷰 + tsc/eslint clean. 단 **end-to-end 브라우저 검증(편집→DB 반영, localStorage 비우고 복원)은 미수행** — 사용자 결정으로 waive. 상세 #48.
- **archive 경로**: `specs/archive/2026-06-05-unify-director-store-db/`
- **일자**: 2026-06-05

### 49. redesign-director archived (브라우저 검증 waive)
- **결정**: `redesign-director`(P4 Director 노드 그래프 재설계)를 archive. D-1~D-3·D-7 코드 완료, D-4S(seed, 기구현), D-5(영상생성 wire-up), D-6(Preset 라이브러리 DB), D-8 안전분 정리 완료. D-4(양방향 sync)·Editor 핸드오프는 폐기(#44), director-store 제거는 `unify-director-store-db`로 분리 수행. **브라우저 검증 미수행** — 사용자 결정으로 waive(#36/#39/#40~42 선례). 005는 #48에서 적용됨(#43 번복).
- **archive 경로**: `specs/archive/2026-06-05-redesign-director/`
- **일자**: 2026-06-05

### 42. director-storyboard archived (브라우저 검증 waive)
- **결정**: `director-storyboard`(I2I 샷 스토리보드 생성 + 그리드뷰 + I2V wire-up)를 archive. ST-1~ST-4 코드 완료, `006` 마이그레이션 라이브 적용 확인됨(introspection). 단 **스토리보드 일괄생성/그리드뷰 토글/I2V 실호출 브라우저 검증은 미수행** — 사용자 결정으로 검증 게이트 waive 후 정리 차원 archive(#36/#39 선례와 동일). ST-4 Writer 시간축 연출 투입은 `[~]` 보류(D-4 sync 선행).
- **spec 반영**: `director.md`(그리드뷰 섹션)는 `redesign-director`와 공유하는 active 문서라 그쪽 완료 시 함께 정리. source-of-truth = 코드.
- **archive 경로**: `specs/archive/2026-06-05-director-storyboard/`
- **일자**: 2026-06-05

### 41. writer-background-artist-progress archived (브라우저 검증 waive)
- **결정**: `writer-background-artist-progress`(writer 백그라운드化 + artist 진입 gating + 턴어라운드 시트/crop 파이프라인)를 archive. §1~§6 코드 완료(`generate-sheet` 엔드포인트 + `sharp` crop + `view_main/side_left/side_right` 컬럼 `010` 적용 포함). 단 **핸드오프→artist gating, 시트 실생성→crop→업로드 end-to-end 브라우저/실호출 검증은 미수행**(라이브 `characters.view_main` 전부 null = 한 번도 실런 안 함) — 사용자 결정으로 검증 waive 후 archive.
- **정리**: tasks.md의 중복 Section 5(옛 `[ ] BLOCKED` 블록)는 갱신본(토큰출처=DB, §5-3/5-5 `[c]`)이 진실. 아카이브 기록에 양쪽 보존.
- **archive 경로**: `specs/archive/2026-06-05-writer-background-artist-progress/`
- **일자**: 2026-06-05

### 40. unify-svc-writer-pipeline archived (런타임 검증 waive)
- **결정**: `unify-svc-writer-pipeline`(svc↔writer 일원화 + svc 토큰 DB化 + 용어 정리)를 archive. 코드 사실상 완료 — 핸드오프 `/api/writer/start` 단일 발사(`producer-store.ts:97`, generate-scenes/api-svc/api-write/studio-writer 전부 소멸), `persistDesignTokens` 배선(`pipeline/index.ts:239`), `007/008/009` 라이브 적용 확인. §1-4(통합 형태)·§1-5(용어=writer)는 구현으로 de-facto 확정, **§4-3(L1/L2 스펙 반영)은 moot**(`specs/layers/`에 L1/L2 문서 없음 — 폐기됨). 단 **풀 파이프라인 LLM 런타임 검증(§3-3 회귀, design_tokens 실기록)은 미수행** — 사용자 결정으로 waive. #38의 상세 결정과 연속.
- **archive 경로**: `specs/archive/2026-06-05-unify-svc-writer-pipeline/`
- **일자**: 2026-06-05

### 39. rollback-artist-card archived
- **결정**: 카드형 Artist UI 롤백(`rollback-artist-card`)을 archive. 카드 UI(character/world/inventory 패널)는 현재 shipped 현실이고 방향 정착됨(#36 노드그래프 폐기의 후속). 개별 인터랙션 `[c]` 검증은 잔존하나 방향·구조 확정으로 changes 정리 차원 archive.
- **archive 경로**: `specs/archive/2026-06-05-rollback-artist-card/`
- **일자**: 2026-06-05

### 36. redesign-l0-canvas archived (superseded)
- **결정**: `redesign-l0-canvas` change를 검증 완료 없이 superseded 상태로 archive. 노드 그래프 패러다임 폐기, 카드형 Artist UI (character-panel / world-panel / inventory-grid)로 롤백.
- **사유**: 노드 그래프 접근은 구현 복잡도가 높고 브라우저 검증을 통과하지 못한 채 다수의 [c] 항목이 누적됨. 사용자 결정(2026-06-04)으로 커밋 8507796 기준 카드형 UI로 복원. asset-storage 백엔드(RegisteredCharacter/RegisteredWorld)는 카드→등록 어댑터를 통해 계속 유지.
- **archive 경로**: `specs/archive/2026-06-04-redesign-l0-canvas/`
- **일자**: 2026-06-04

---

## Superseded — Artist L0 노드 그래프 (코드 삭제, 카드형으로 롤백 #36)

### 33. F-D2 — 노드 우클릭 컨텍스트 메뉴 제거 + 헤더 아이콘 일원화
- **결정**:
  - 노드 우클릭 컨텍스트 메뉴(`NodeContextMenu`) 완전 제거 — 파일·store state(`contextMenu`, `openContextMenu`, `closeContextMenu`)·page.tsx의 `onNodeContextMenu` 핸들러 모두 삭제
  - 모든 노드 액션은 **BaseNode 헤더의 4개 아이콘(Edit / Branch / Copy / Delete)** 또는 **NodePopup** 한 곳에 집중
  - **노드 더블클릭 = Edit popup 단축** (ReactFlow `onNodeDoubleClick` → `openPopup`)
  - 복제 액션은 헤더에 `Copy` 아이콘 신규 추가 (Status 포함 모든 노드)
- **이유**:
  - 사용자 의견: "Edit에서 다 되는 거 아님?" — UI 일관성을 위해 우클릭/메뉴 이중 표면 제거
  - Edit / Branch / Delete는 이미 BaseNode 헤더에 노출됨. 우클릭 메뉴는 *복제만* 고유 → 헤더에 복제 아이콘 1개 추가로 흡수
  - 우클릭은 브라우저 기본 메뉴를 가리지 않음 → 사용자가 우연히 우클릭해도 혼동 X
- **영향 범위**:
  - L0 스펙 섹션 3(액션 버튼) + 섹션 12(캔버스 인터랙션) 표 갱신 필요
  - 데이터 모델 스펙(`canvas_data_model.md`) 섹션 4.3 핸들러 표에서 `onNodeContextMenu` 행 제거
- **일자**: 2026-05-17

### 32. F-D1 — L0 Canvas Actor↔Actor 엣지 카테고리 단순화
- **결정**: Actor↔Actor 엣지는 `references`(점선 + 자유 텍스트 메모) 한 종류만 허용. `parent`는 Status Branch 자동 생성 전용으로 한정 — 사용자가 수동으로 Actor↔Actor parent를 그리지 않음. Actor↔World `in-world`는 그대로 유지
- **이유**:
  - Higgsfield 등 노드 캔버스 도구는 동종 노드 연결을 공개 사용 시나리오로 다루지 않음 (`specs/design-references.md` Higgsfield 분석 섹션 참조). 동종 자산 관계는 라이브러리/폴더가 담당
  - parent 의미를 "기술적 상속(prompt/이미지/Status)"으로, references를 "내러티브 관계(쌍둥이/라이벌/스승-제자)"로 분리 → 사용자 메탈모델이 깨끗
- **현재 시점 적용 상태**: 의사결정만 기록, **코드 변경(F-3)은 보류**. 다른 검증 차단 이슈 해결 후 진행
- **참고**: `specs/design-references.md` 섹션 4 (권고 a), PROGRESS.md P10-Followup F-D1/F-3
- **일자**: 2026-05-17

### 31. L0 Meeting Room — Agentic Canvas (tool-use 패턴)
- **결정**: L0 Meeting Room의 artist agent를 read-only 가이드에서 **캔버스를 직접 조작하는 tool-use agent**로 전환. 기존 `global-chat-store` 패턴(`ArtistUpdate[]` → `applyUpdates`)을 그대로 캔버스에 적용
- **CanvasUpdate 액션 union** (10종):
  - 비파괴: `addNode`, `updateNode`, `connect`, `setOutputMode`, `generate`, `branchStatus`, `duplicateNode`
  - 파괴/등록: `requestDelete`, `requestRegister` → agent가 직접 실행하지 않고 기존 확인 UI 트리거 (DeleteConfirmModal, NodePopup 등록 폼)
- **컨텍스트 직렬화**: 매 chat turn마다 캔버스 스냅샷(노드 목록 요약 + 엣지 + 선택 노드 풀 정보 + 누적 이미지 수)을 prompt에 자동 주입
- **레이아웃 변경**: Meeting Room은 좌측 도킹 유지(L0 스펙 1번 그대로). 기존 우측 floating `GlobalChat`은 artist 페이지에서 hide → 좌측 도킹 컴포넌트가 같은 `useGlobalChatStore`를 소비
- **근거**: read-only 가이드는 Higgsfield 등 경쟁 도구에 흔함. tool-use는 우리 차별화 포인트. 그래프=개체 패러다임과 결합해 "캐릭터 만들어줘" → 실제 노드 생성까지 한 흐름. 기존 5-agent 패턴 재사용으로 구현 분량 ↓
- **destructive 안전장치**: 파괴 액션은 agent가 직접 실행 안 함. 모든 삭제·등록은 기존 user-facing 모달 거침 → undo 미구현 상태에서도 안전
- **상세**: `specs/archive/2026-06-04-redesign-l0-canvas/canvas_data_model.md` 섹션 6 (Agent Actions), `specs/layers/L0_concept_canvas.md` 섹션 11
- **일자**: 2026-05-17

### 29. P3 → L0 Concept Canvas 전면 재설계
- **결정**: P3 (The Visual Studio)의 character-panel/world-panel/inventory-grid 패널 UI를 노드 그래프 캔버스로 완전 교체
- **8개 하위 결정**:
  1. React Flow (xyflow) 채택 — MVP 속도 + ComfyUI 호환 패턴
  2. 기존 artist 패널 완전 교체 (병행 또는 모드 토글 안 함)
  3. 3D / Multi-angle은 별도 노드 아님 — Actor/World 노드의 *출력 모드*로 흡수
  4. Status만 별도 노드 유지 (마더 연동 변형이라는 별개 정체성)
  5. 캐릭터 등록 조건 = "누적 이미지 ≥ 20장" (원문 "20엣지"의 의미 명확화. Higgsfield Soul ID의 20장 학습 임계점 차용)
  6. 프롬프트만 전파, 이미지 재생성은 수동 (토큰 비용 폭발 방지)
  7. Meeting Room = 기존 `global-chat-store`의 artist agent 재사용, 캔버스 좌측 도킹
  8. 한 프로젝트 = 한 그래프 (MVP, YAGNI)
- **노드 종류 (Tier 1)**: Actor / World / Status 3종. 3D·Multi-angle은 출력 모드, 캐릭터 시트는 5-View 모드, 회전 시퀀스는 16-Angle 모드
- **레퍼런스**: Higgsfield Canvas (노드 그래프 패턴) + ComfyUI (핀-엣지 메타포). 우리는 노드=개체 패러다임 (Higgsfield는 노드=모델)으로 차별화
- **상세**: 노드 그래프는 2026-06-04 카드형으로 롤백됨(#36). 현행 구현 = `src/features/artist/`
- **근거**: 캐릭터 일관성 + 월드-액터 관계를 그래프 구조로 표현해야 차별화 가능. 기존 패널 UI는 메탈모델 충돌
- **일자**: 2026-05-17

---

## Superseded — 초기 MVP 스코프 (이후 #27/#28/#29/Phase11로 갱신)

### 25. P3 에셋 전용 범위 축소
- **결정**: P3를 에셋 전용으로 축소. Storyboard 탭 제거 → P4로 이동
- **V1 P3**: 3탭 (Char / Stage / Storyboard)
- **V2 P3**: 2컬럼 단일 화면 (Character Consistency + World Model)
- **추가 요소**: Asset Locking (캐릭터 일관성 고정), Cinematic Boost 필터
- **근거**: V2 디자인 (reference_v2/image3.png). 에셋과 스토리보드 관심사 분리
- **superseded**: #29(P3→L0 캔버스) → #36(카드형 롤백). 현행 = `src/features/artist/` 카드 UI
- **일자**: 2026-03-03

### 24. V2 MVP 범위 재정의 및 디자인 시스템
- **결정**: MVP를 P3+P4 → **P3+P4+P5(Lite)**로 확장. V2 글로벌 디자인 시스템 적용
- **디자인 시스템**: Netflix Dark (#121212) + Accent (#E50914/#7A285E) + 5 Agent 사이드바 + Samantha 플로팅 + Handoff 버튼 패턴
- **Stage 이름**: The Meeting Room / The Script Room / The Visual Studio / The Set / Post-Production Suite
- **네비게이션**: 영상생성 전까지 이전 Stage 자유 복귀 가능
- **근거**: reference_v2 전체 (docs.md + image1~5), open_questions.md 닫힌 질문 23개 반영
- **superseded**: 범위는 #28(P1~P5 전체)로 확장됨
- **일자**: 2026-03-03

### 23. 코드베이스 리셋 및 MVP 스코프
- **결정**: 구 코드 전체 삭제, P3+P4만 MVP로 개발 → **V2에서 P3+P4+P5 Lite로 확장 (#24)**
- **이유**: 코드베이스 거의 재작성 필요. P1/P2 미정사항 과다, P3/P4가 핵심 가치
- **MVP 포함**: ~~P3 Pre-viz (Char/Stage/Storyboard) + P4 Director (Cinematographic/Shot Frames)~~ → #24로 대체
- **MVP 제외**: P1 Ground, P2 Story Writer, P4 Music, ~~P5 Editor~~ → P5 Lite 포함 (#27)
- **superseded**: #24 → #28 (P1~P5 전체 포함)
- **일자**: 2026-02-25 (V2 수정: 2026-03-03)
