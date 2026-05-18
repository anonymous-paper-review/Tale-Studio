# L0: Concept Canvas (Actor Casting / World Building)

> 노드 그래프 기반 컨셉 아트 워크스페이스 — `/studio/artist` 전면 재설계

## 역할

캐릭터(Actor)와 장소(World)를 노드로 정의하고, 관계를 엣지로 연결해 컨셉 아트의 일관성을 그래프로 관리. 일정 누적 이미지 이상이 모이면 Asset Storage에 캐릭터로 등록해 다음 단계(L1/L2/L3)로 전달.

```
빈 캔버스 → [Actor/World 노드] → [5-View / 16-Angle 출력] → [Branch / Status 파생] → [캐릭터 등록 → Asset Storage]
```

**UX 매핑**: P3 The Visual Studio 전면 교체 (`specs/ux_pages.md` P3)
**레퍼런스**: Higgsfield Canvas (노드 그래프 패턴), ComfyUI (핀-엣지 메타포)
**기술**: React Flow (xyflow), Zustand 그래프 스토어

---

## 1. 워크스페이스 레이아웃

```
┌─ Meeting Room ─┬───────── Canvas ─────────┬─ Storage ─┐
│ (좌측 도킹)    │                          │ (탭, MVP  │
│                │     무한 캔버스           │  Disable) │
│ artist agent   │     노드 + 엣지           │           │
│ 가이드 / 채팅  │                          │           │
│                │                          │           │
│                ├──────────────────────────┤           │
│                │   Palette (탭, MVP Disable)          │
└────────────────┴──────────────────────────┴───────────┘
```

| 영역 | MVP | 비고 |
|------|-----|------|
| Canvas | 포함 | React Flow 인스턴스 |
| Meeting Room | 포함 | 기존 `global-chat-store` artist agent 재사용, 좌측 도킹 |
| Palette (하단 탭) | 라벨만 | Costume / Item / Environment Preset은 Future |
| Storage (우측 탭) | 라벨만 | Asset 브라우저는 Future |

---

## 2. 노드 종류 (Tier 1)

| 종류 | 색상 | 정체성 | 부모 가능 | 생성 방법 |
|------|------|--------|-----------|-----------|
| **Actor** | 붉은 계열 | 캐릭터 개체 (DNA + State) | 최상위 | 빈 캔버스 더블클릭 → "Actor" 선택 |
| **World** | 파란 계열 | 장소/환경 개체 | 최상위 | 빈 캔버스 더블클릭 → "World" 선택 |
| **Status** | 마더 톤 변주 | 마더 노드의 연동 변형 | Actor / World | Branch 액션으로만 생성 |

> 원문 스펙의 3D 노드 / Multi-angle 노드는 별도 노드 타입이 아니라 **Actor/World 노드의 출력 모드**로 흡수 (섹션 4번 참조). 노드 폭증 방지 + 캐릭터 1명 = 노드 1개 직관 유지.

---

## 3. 노드 박스 구조

### 공통 요소

- **색상**: 종류별 (Actor 붉은 / World 파란 / Status 마더 색 변주)
- **호버 시**: 테두리 강조 (두께 증가 + glow)
- **선택 시**: 외곽선 highlight + 우측 액션 버튼 펼침
- **박스 내부 표시**:
  - 노드 이름/라벨 (인라인 편집 가능)
  - 출력 모드 표시 + 결과 이미지 그리드
  - 토큰 비용 indicator
  - 액션 버튼 (삭제, Branch, 등록)

### 액션 버튼

헤더에 4개 아이콘 (hover 시 노출). 우클릭 컨텍스트 메뉴는 제거됨 (decisions.md #33).

| 버튼 | 동작 | 노출 조건 |
|------|------|-----------|
| Edit | NodePopup 열기 (프롬프트·모드·생성·등록) | 모든 노드 |
| Branch | BranchOptionModal 열기 (Status 노드 자동 생성) | Actor / World 만 |
| Copy | 노드 복제 (motherId null 독립 자식, parent 엣지 자동) | 모든 노드 |
| Delete | DeleteConfirmModal 열기 → 노드 + incident 엣지 제거 | 모든 노드 |

추가: **노드 더블클릭 = Edit 단축** (`onNodeDoubleClick` → `openPopup`).

캐릭터 등록은 별도 버튼 없이 NodePopup 내부 등록 폼 사용 (조건 충족 시 활성).

---

## 4. 출력 모드 (Actor / World 공통)

같은 노드가 3가지 출력 모드를 토글 가능. 모드 전환은 노드 속성, 별도 노드 아님.

| 모드 | 이미지 수 | 용도 | 토큰 비용 |
|------|-----------|------|-----------|
| **Single** | 1장 | 빠른 초안, 컨셉 탐색 | 1× |
| **5-View** | 5장 (정면 / 좌측 / 우측 / 후면 / 디테일) | 캐릭터 시트 (디자인 표준 산출물) | 5× |
| **16-Angle** | 16장 (22.5도 간격 회전) | 비디오 일관성 검증 (Kling I2V 입력 후보) | 16× |

- 모드 전환 시 기존 이미지는 보존 (모드별 결과를 노드 내부에 누적)
- 생성 방식: 동일 시드 + 카메라 프롬프트 변주 (H100 이미지 서버 사용)
- 노드 박스 내 그리드로 표시 (5-View는 1×5, 16-Angle은 4×4 또는 캐러셀)

---

## 5. 노드 팝업

박스 클릭 또는 호버 일정 시간 후 활성. 가벼운 필수 기능만 (무거운 편집은 Future Palette).

| 요소 | 설명 |
|------|------|
| 프롬프트 입력창 | T2I 프롬프트. 커서 깜빡임. 멀티라인 가능 |
| 참고 이미지 업로드 | 여러 장 가능, 좌→우 스택 |
| 생성 모델 선택 | 드롭다운 (H100 self-hosted / Gemini Imagen) |
| 출력 모드 선택 | Single / 5-View / 16-Angle |
| 생성 버튼 | 우측에 필요 토큰 수 표시 |
| Branch 펼치기 / 닫기 | 자식 노드 영역 토글 |
| 캐릭터 등록 | 조건(누적 이미지 ≥ 20장) 충족 시 활성 |

---

## 6. 핀 + 엣지

### 핀 (Pin)

- 노드 박스 테두리에 마우스 호버 → 해당 변이 두꺼워지면서 핀으로 활성
- 핀 클릭 → 엣지 시작점 활성 (드래그 또는 두 번째 클릭 대기)
- 핀 위치: 4면 모두 핀 가능, 입력/출력 구분 없음 (캐주얼 노드 그래프 패턴)

### 엣지 종료점

| 종료점 | 결과 |
|--------|------|
| 다른 노드의 핀 | 엣지 연결 + 관계 입력 모달 |
| 빈 공간 | Branch (새 노드 자동 생성, 모달로 Status 여부 묻기) |
| 같은 노드의 다른 핀 | 무효 (취소) |

### 관계 입력 모달

사용자가 핀으로 두 노드를 연결할 때 노출. F-D1(decisions.md #32) 적용 후 사용자 선택은 2가지로 단순화.

- 자유 텍스트 (내러티브 관계 기술, 선택)
- 카테고리 옵션:
  - `references` (기본) — 내러티브 관계 메모 (예: 쌍둥이, 라이벌, 스승-제자). 속성 상속 없음
  - `in-world` — Actor가 어느 World 안에 있는지 배치
- `parent` 카테고리는 사용자 수동 선택에서 **제외** — Status Branch 자동 생성 + Copy 액션의 자동 parent 엣지에서만 내부적으로 사용
- 카테고리에 따라 엣지 시각 차이 (parent 2px 굵게 / in-world 1.5px / references 1.5px dashed)
- 사용자 connect 시 `sourceHandle` / `targetHandle` 정보는 RelationModalState에 보관 후 addEdge로 전달 (엣지 끝점 매핑 보장)

---

## 7. Branch 메커니즘

자식 노드 파생 액션. 두 가지 트리거는 **동일한 팝업, 동일한 결과**. 차이는 새 노드의 위치 결정 방식만.

| 트리거 | 새 노드 위치 |
|--------|--------------|
| 박스 내 Branch 버튼 클릭 | 마더 노드 우측에 자동 (gap 16px, snap-to-grid) |
| 핀 클릭 후 빈 공간 클릭 | 사용자가 클릭한 좌표 (snap-to-grid 적용) |

### Branch 팝업 옵션

| 옵션 | 새 노드 종류 | motherId | 자동 엣지 | 마더 변경 영향 |
|------|--------------|----------|-----------|----------------|
| **Status 노드 생성** | `status` | 마더 ID 채움 | `parent` 카테고리 자동 추가 | 강함 (effective prompt 연동) |
| **독립 자식 (Actor/World)** | 마더와 동일 kind | `null` | `parent` 카테고리 자동 추가 | 없음 (자체 prompt 사용) |

### 자동 상속되는 속성 (둘 다 공통)

- `prompt` (자체 prompt 필드에 복사)
- `referenceImages` (배열 그대로 복사)
- `modelId`
- `outputMode` (마더의 현재 모드)
- `generatedImages`는 복사 안 함 (새 노드는 빈 상태에서 시작)
- `registered`는 복사 안 함

### 자동 엣지 카테고리

Branch 생성 시 자동 추가되는 엣지는 항상 `parent` 카테고리. 관계 입력 모달은 *띄우지 않음* (Branch 의도 자체가 부모-자식).

> 원문의 "3D 노드 생성 / Multi-angle 노드 생성" Branch 옵션은 출력 모드 토글로 흡수했으므로 Branch 팝업에 없음.

---

## 8. Status 노드 상세

마더(Actor / World)의 *연동된 변형 상태*. 별도 노드인 이유: 마더 변경 시 자동 stale 표시가 강하게 필요한 정체성.

- 마더의 모든 속성 상속 (DNA, 프롬프트, 참고 이미지)
- 추가 디테일(예: "왼쪽 눈에 흉터")만 별도 입력
- 마더 프롬프트 변경 시 stale 배지 표시
- 노드 박스 동작은 Actor/World와 동일 (팝업, 핀, 출력 모드)
- 업로드 이미지 영역에 마더의 이미지가 기본 포함

---

## 9. Real-time Propagation

### 9.1 핵심 원칙

- **전파 대상**: 프롬프트 텍스트 변경 신호만 (실제 텍스트 자체는 자식의 자체 `prompt` 필드를 자동 변경하지 않음)
- **전파 범위**: 직계 자식 + 모든 후손 (parent 엣지 따라 BFS)
- **자동 재생성 없음**: stale 배지만 표시. 사용자가 명시적 재생성 클릭

### 9.2 자식 노드 prompt 결합 규칙

| 노드 종류 | effective prompt 계산 |
|-----------|----------------------|
| 독립 자식 (Actor/World) | 자체 `prompt` 그대로. 마더 prompt는 무시 |
| Status 노드 | `<마더의 effective prompt>\n\n[변형] <자체 prompt>` 형태로 결합 |

- Status 노드의 effective prompt는 마더 prompt가 바뀌면 자동으로 결과가 바뀜 (자식 텍스트는 그대로지만 결합된 결과가 변함)
- 마더가 또 다른 Status면 재귀적으로 결합 (마더 체인 root까지)
- 셀렉터 `getEffectivePrompt(nodeId)`로 노출 (canvas_data_model 섹션 2.3)

### 9.3 stale 시각 강도

| 노드 종류 | 마더 prompt 변경 시 |
|-----------|---------------------|
| 독립 자식 (Actor/World) | 약한 stale: 좌상단 점멸 점 (사용자가 끊은 의도 존중) |
| Status 노드 | 강한 stale: 좌상단 점멸 점 + 박스 border `--destructive` 100% |

### 9.4 전파 안 되는 변경

- 자식의 자체 prompt 편집은 마더에 역전파 안 됨
- referenceImages 추가/삭제는 전파 안 됨 (자체 자산)
- outputMode 변경은 전파 안 됨

---

## 10. 캐릭터 등록 (Tier 1 단순 버전)

| 조건 | 한 Actor/World 노드 서브트리의 누적 이미지 ≥ 20장 |
|------|---------------------------------------------------|
| 누적 산출 예시 | Single 1장 + 5-View 5장 + 16-Angle 16장 = 22장 ✓ |
| 입력 필드 | 이름, ID, 배경, 설명 |
| 저장 위치 | Asset Storage (`specs/data/asset_storage.md` — 별도 문서) |
| MVP 구현 | Zustand + localStorage persist, 이미지는 base64 또는 임시 URL |

> 조건 미충족 시 Meeting Room이 부족한 모드 추천 ("5-View로 캐릭터 시트를 만들면 일관성이 좋아져요").

---

## 11. Meeting Room (좌측 도킹) — Agentic Canvas

`global-chat-store`의 artist agent를 **tool-use 패턴**으로 캔버스에 통합. 캔버스 좌측 패널로 도킹. 우측 floating `GlobalChat`은 artist 페이지에서 hide.

### 11.1 패턴

기존 `ArtistUpdate[] → applyUpdates` 패턴과 동일하지만 캔버스 액션 셋으로 확장:

```
사용자 발화 → /api/artist/chat (LLM)
            → 응답에 { reply, updates: CanvasUpdate[] } 포함
            → 클라이언트가 updates를 canvas-store.applyUpdates()로 디스패치
```

`CanvasUpdate` union 상세: `specs/data/canvas_data_model.md` 섹션 6.

### 11.2 컨텍스트 자동 주입

매 chat turn마다 캔버스 스냅샷이 prompt에 포함:
- 노드 목록 요약 (id, kind, label, prompt 첫 80자, outputMode, 이미지 수)
- 엣지 목록 (source-target, category, relationText)
- 선택된 노드 풀 정보 (전체 prompt + effective prompt)
- 누적 이미지 수 / 등록 임계까지 남은 수
- 그래프 통계 (Actor N개, World N개, Status N개, 엣지 N개)

직렬화 헬퍼: `serializeCanvasContext(state) → string`.

### 11.3 사용자 시나리오

| 사용자 발화 | 결과 액션 |
|------------|-----------|
| "Kai라는 캐릭터 만들어줘. 갈색머리, 검은 코트." | `addNode(actor)` + `updateNode(label=Kai, prompt=...)` |
| "Kai 5-View로 생성해" | `setOutputMode(Kai, five-view)` + `generate(Kai)` |
| "Kai한테 부상 상태 Status 추가" | `branchStatus(Kai)` + `updateNode(new, prompt=왼쪽 눈 흉터)` |
| "Kai를 사막 월드에 배치" | `addNode(world, 사막)` + `connect(Kai, 사막, in-world)` |
| "Kai 삭제해줘" | `requestDelete(Kai)` → DeleteConfirmModal 열림 (즉시 삭제 안 됨) |
| "지금 등록 가능해?" | text-only 응답 (액션 없음): "12장 누적, 8장 더 필요해요" |

### 11.4 Destructive 안전장치

`deleteNode` / `registerCharacter` 같은 파괴·되돌리기 어려운 액션은 agent가 직접 실행하지 않고 **request 형태**로만 발화:
- `requestDelete(id)` → 기존 `DeleteConfirmModal` 열림
- `requestRegister(id, ...)` → 기존 `NodePopup` 등록 폼 펼침 (제안된 이름·설명 prefilled)

사용자가 명시적 확인 클릭해야 실제 변경. Undo 미구현 상태에서의 안전 보장.

### 11.5 Warm Starting (룰 기반, LLM 호출 없음)

캔버스 상태 변화를 useEffect로 관찰해 채팅에 시스템 메시지 inject:

| 상태 | 메시지 |
|------|--------|
| 노드 0개 (초기 진입) | "어떤 캐릭터부터 만들까요? 더블클릭으로 직접 만들거나 여기에 말씀해주세요." |
| 엣지 0개 + 노드 ≥ 2 | "두 노드 사이에 관계를 그리면 그래프가 살아납니다." |
| Actor 있고 5-View 미생성 | "5-View로 캐릭터 시트를 만들면 일관성이 좋아져요." |
| 누적 이미지 ≥ 18 | "캐릭터 등록까지 N장 남았어요." |

LLM 호출 0 (토큰 비용 없음). agent의 tool-use는 사용자가 메시지 보냈을 때만.

---

## 12. 캔버스 인터랙션

| 제스처 | 동작 |
|--------|------|
| 빈 공간 더블클릭 | 노드 생성 팝업 (Actor / World 선택 필수) |
| **노드 더블클릭** | NodePopup 열기 (Edit 단축) |
| 노드 박스 클릭 | 선택 + 헤더 액션 아이콘 노출 |
| 노드 박스 호버 | 테두리 강조 + 핀 활성 + 헤더 아이콘 노출 |
| 노드 우클릭 | 브라우저 기본 메뉴 (별도 UI 없음, decisions.md #33) |
| 핀 클릭 | 엣지 시작점 활성. ReactFlow `connectionMode='loose'` 적용 — source/target 양방향 |
| 핀 → 빈 공간 release | Branch (Status 자식 자동 생성, drop 좌표에 배치) |
| 마우스 휠 | 줌 인/아웃 (단, `zoomOnDoubleClick=false`) |
| 스페이스 + 드래그 | 팬 |
| 휠 클릭 + 드래그 | 팬 (대안) |
| Delete 키 | 선택 노드 삭제 |
| Ctrl/Cmd + Z | Undo (P10-7 후속 작업) |

---

## 13. 노드 삭제 cascade 정책

자식 노드가 있는 노드를 삭제할 때 동작.

| 삭제 대상 | 자식 처리 |
|-----------|-----------|
| Actor / World (마더로서) | **Orphan**: 자식 노드는 남고, 들어오는 parent 엣지만 제거됨. 자식이 독립 entity로 살아남음 |
| Status 노드 (자체) | 본인만 삭제. 자식이 또 있으면 자식은 orphan |
| Status를 가진 마더 | Status 자식은 **cascade 삭제**. 일반 자식(독립 Actor/World)은 orphan |
| 등록된 노드 | Asset Storage의 `RegisteredCharacter` / `RegisteredWorld`는 **보존**. 그래프에서만 사라짐. `sourceCanvasNodeId`는 dangling reference로 남음 |
| 엣지 | 노드 영향 없음, 엣지만 제거 |

### 13.1 사용자 확인

- Status 자식을 가진 마더 삭제: "Status 자식 N개가 함께 삭제됩니다" 확인 모달
- 등록된 노드 삭제: "Asset Storage의 등록은 유지됩니다" 안내 토스트 (확인 모달 아님, 정보만)
- 그 외 cascade 없는 경우: 즉시 삭제, 확인 없음

### 13.2 Undo

- Cmd/Ctrl+Z로 삭제 직후 undo 가능
- Status cascade도 undo 시 함께 복원
- 등록된 캐릭터의 dangling reference 복원은 노드 ID 일치 시 자동

---

## 14. Persistence (MVP)

- Zustand 스토어: `canvas-store` (기존 `artist-store` 폐기). 데이터 모델 상세: `specs/data/canvas_data_model.md`
- 그래프 JSON 단위 localStorage persist (`tale-canvas-v1-<projectId>`)
- 한 프로젝트 = 한 그래프 (MVP)
- 이미지: base64 또는 임시 URL — 이미지 전용 스토리지 도입은 별도 결정 후 마이그레이션
- Asset Storage는 별도 스토어 (`tale-asset-storage-v1-<projectId>`). 상세: `specs/data/asset_storage.md`

---

## 15. 결정 사항

| # | 결정 | 근거 |
|---|------|------|
| 1 | React Flow (xyflow) 채택 | MVP 속도, ComfyUI 패턴 호환, 핀-엣지 표준 지원 |
| 2 | 기존 artist 패널 완전 교체 | 노드 그래프와 패널은 메탈모델 충돌 |
| 3 | 3D / Multi-angle은 출력 모드로 흡수 | 노드 폭증 방지, "1 노드 = 1 개체" 직관 |
| 4 | Status만 별도 노드 유지 | 마더 연동 변형이라는 별개 정체성 |
| 5 | 캐릭터 등록 = "누적 이미지 ≥ 20장" | Higgsfield Soul ID의 20장 학습 임계점 차용, 의미가 명확함 |
| 6 | 프롬프트만 전파, 이미지 재생성은 수동 | 토큰 비용 폭발 방지, 의도치 않은 결과 방지 |
| 7 | Meeting Room = 기존 artist agent 재사용 | 5-agent 시스템 일관성 |
| 8 | 한 프로젝트 = 한 그래프 (MVP) | YAGNI |

> 결정 근거 상세: `specs/decisions.md`에 별도 기록 예정
