# UX Pages 정의서 — V3

> 최종 수정: 2026-06-11
> 역할: **UX SoT** — UX 의도·계약 (WHY). 현행 구현(WHAT IS)은 코드가 진실.
> MVP 범위/기술 스택: `specs/mvp_scope.md`

---

## 전체 구조

4 Stage 선형 파이프라인. 사이드바 구현 = `src/components/layout/sidebar.tsx`.

```
P1 → (writer engine) → P3 → P4 → P5
Meeting   [backend]   Visual   The Set  Post-Prod
Room                  Studio            Suite
```

### 5 Stages

| Stage | V2 이름 | Agent | Pipeline | MVP |
|-------|---------|-------|----------|-----|
| P1 | The Meeting Room | Producer | - | **포함** |
| ~~P2~~ | ~~The Script Room~~ | Writer | L1 | **제거 — 백엔드 전용** (decision #38) |
| P3 | The Visual Studio | Concept Artist | - | **포함** |
| P4 | The Set | Director | L2+L3 | **포함** |
| P5 | Post-Production Suite | Editor | - | **포함 (Lite)** |

### 공통 UI 패턴

| 패턴 | 의도 |
|------|------|
| **사이드바** | 좌측 고정. 4 Stage 아이콘 수직 배치 (Producer > Concept Artist > Director > Editor). 활성 Stage 강조. 구현 = `src/components/layout/` |
| **Samantha** | 우측 하단 플로팅 아이콘. 피드백 전송 팝오버 (`src/components/layout/samantha.tsx`) |
| **Handoff 버튼** | 각 Stage 하단/우상단. 다음 Stage로 이동하는 CTA. |
| **디자인 테마** | Netflix Dark Mode (Deep Black #121212, Accent #E50914 또는 #7A285E) |

### Stage 전환 (Handoff 패턴)

계약: **영상생성 시작 후 복귀 불가** (시작 전은 사이드바 자유 복귀).

```
P1 "Hand over to Concept Artist →"
    → P3 "Approve & Direct →"
        → P4 "Head to Editor →"
            → P5 [Draft Rendering]
```

Stage 식별자 및 handoff 레이블: `src/lib/constants.ts`.

---

## P1: The Meeting Room (Producer)

> 상태: **MVP 포함**
> 구현: `src/app/studio/producer/page.tsx`, `src/features/producer/`

### 목적

프로젝트 시작점. Producer Agent와 대화하며 스토리/컨셉/설정 수집.
"미팅하듯이" 자연스럽게 정보를 채우는 대화 중심 설계.
Producer 입력이 writer 엔진(`/api/writer/start`) 호출의 seed가 된다.

### 입력

| 데이터 | 방식 |
|--------|------|
| story_text | 대화로 입력 또는 파일 업로드 (시나리오 복붙) |
| project_settings | AI가 스토리에서 추론 → 사용자 확인 (장르, 비율, 길이) |

### 출력 (→ writer engine)

| 데이터 | 내용 |
|--------|------|
| story_text | 사용자 입력 스토리 |
| project_settings | playtime, genre, aspectRatio, toneStyle |

---

## P2: The Script Room (Writer) — ⚠️ 제거됨 (백엔드 전용)

> ## ⚠️ 현행 (2026-06-05, decision #38)
> **이 페이지는 제거됐습니다.** writer는 **UI 없는 백엔드 전용 스테이지** — producer 핸드오프(`/api/writer/start`)에서
> writer 엔진이 백그라운드 실행되어 DB(scenes/characters/shots)를 채우고, 사용자는 producer → **artist**로 직행한다.
>
> 구현: `src/lib/writer/` | 결정 근거: decision #38 | 아카이브: `specs/archive/2026-06-05-unify-svc-writer-pipeline/`

---

## P3: The Visual Studio (Concept Canvas)

> 상태: **MVP 포함**
> 구현 (source-of-truth): `src/features/artist/`, `src/app/studio/artist/`
> 시각 컨벤션: `specs/design.md` (특히 §17 Canvas conventions)
> 결정 근거: `specs/decisions.md` #29

### 목적

캐릭터(Actor)와 장소(World)를 사전 정의해 Asset Storage에 등록, P4(Director)로 전달.
카드형 Tabs (Characters / World / Inventory) UI. 노드그래프 폐기 = `specs/archive/2026-06-04-redesign-l0-canvas/`.

### API

| API | 용도 |
|-----|------|
| fal.ai gpt-image-2 | T2I 이미지 생성 |

### 입력

| 데이터 | 소스 |
|--------|------|
| (현재) 비어 있음 | L0는 사용자가 직접 정의 |
| (향후) character_sheet, location_sheet | writer 엔진 출력에서 자동 시드 (Phase 3+) |

### 출력 → P4

| 데이터 | 내용 |
|--------|------|
| character_assets | 등록된 Actor의 이미지 |
| world_assets | 등록된 World 이미지 |

---

## P4: The Set (Director)

> 상태: **MVP 포함**
> 현행 구현: Director Canvas (React Flow 노드 그래프)
> **SoT 스펙**: `specs/layers/director.md`
> 구현: `src/features/director/`

### 목적

스토리보드(샷 배치) + 촬영 기법 적용 + 영상 생성.
Artist가 *이미지 기반 스토리보드*라면 P4는 *영상 기반 스토리보드 + 디렉팅*(조명/앵글/카메라 무브먼트/렌즈 프리셋).

### API

| API | 용도 |
|-----|------|
| 비디오 생성 | fal 경유 멀티모델 (실제 모델 registry = `src/lib/video-models.ts`) |
| Claude LLM | Director Chat, L3 프롬프트 빌드 |
| Knowledge DB | camera_presets.yaml, rendering_style.yaml |

### Pipeline

```
P3 출력 (character_assets + world_assets)
  + writer 엔진 출력 (scene_manifest + shot_sequences)
    ↓ L3 Prompt Builder (Knowledge DB + 카메라 파라미터)
    ↓ Video API (fal 경유 멀티모델 — registry: src/lib/video-models.ts)
    ↓
Video Clips + Shot Metadata → P5
```

### 입력

| 데이터 | 소스 |
|--------|------|
| character_assets | P3 출력 (등록된 캐릭터 이미지) |
| world_assets | P3 출력 (배경 이미지) |
| scene_manifest | writer 엔진 출력 |
| shot_sequences | writer 엔진 출력 (L2) |

### 출력 → P5

| 데이터 | 내용 |
|--------|------|
| video_clips | 샷별 영상 클립 |
| shot_metadata | 씬/샷 순서, 카메라 설정, duration |

---

## P5: Post-Production Suite (Editor)

> 상태: **MVP 포함 (Lite)**
> 구현: `src/app/studio/editor/page.tsx`, `src/features/editor/`

### 목적

생성된 영상 클립 리뷰 + 편집 + 최종 렌더링.
MVP에서는 기본 편집(프리뷰/타임라인/Crop)만, AI 편집 도구는 Post-MVP.

### 입력

| 데이터 | 소스 |
|--------|------|
| video_clips | P4에서 생성된 샷별 영상 |
| shot_metadata | 씬/샷 순서, 카메라 설정, duration |

### 출력

| 데이터 | 내용 |
|--------|------|
| final_video | 전체 샷 병합된 완성 영상 (Draft) |

---

## 페이지 간 데이터 흐름

```
P1 The Meeting Room
│  story_text, project_settings
▼
[writer engine — 백엔드 전용, 페이지 없음]
│  scene_manifest, character_sheet, location_sheet, shot_sequences
▼
P3 The Visual Studio  ─── 이미지 생성
│  character_assets (등록), world_assets
▼
P4 The Set  ─── L2/L3 Pipeline + 영상 생성
│  video_clips, shot_metadata
▼
P5 Post-Production Suite  ─── 편집 + 렌더링
│  final_video (Draft)
▼
[Download / Export]
```

---

## 관련 문서

| 문서 | 내용 |
|------|------|
| `specs/mvp_scope.md` | MVP 범위 + 기술 스택 + 구현 순서 |
| `specs/open_questions.md` | 미해결 질문 목록 |
| `specs/layers/director.md` | P4 Director Canvas 상세 스펙 |
| `specs/layers/README.md` | 파이프라인 레이어별 계약 |

---

## 변경 이력

| 날짜 | 내용 |
|------|------|
| 2026-06-11 | spec diet — 폐기 UI(P2 페이지·P3 노드그래프·P4 구 3패널·P5 씬탭) 서술 삭제, 의도/계약 + 코드 포인터만 유지. |
| 2026-03-06 | V3.1: P2 샷 레벨 편집 추가. L2 Lite Shot Composer 파이프라인. 컴포넌트 분리 (4파일). shot_sequences 출력 |
| 2026-03-03 | V3: P1~P5 전체 MVP 포함. DataProvider Mock 참조 제거. Scope 내용 mvp_scope.md로 분리 |
| 2026-03-03 | V2: 5 Stage 구조, 사이드바/Handoff/Samantha 패턴, P3 에셋 전용, P4 Storyboard 통합, P5 디자인 확정 |
| 2026-02-25 | V1: 초안 (UX.pdf + overview.md + 스펙 인터뷰 통합) |
