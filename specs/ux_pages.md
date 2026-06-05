# UX Pages 정의서 — V3

> 최종 수정: 2026-03-03
> 역할: **UX SoT** — 레이아웃, 요소, 인터랙션, 데이터 입출력
> 원본: `specs/reference_v2/` (docs.md + image1~5)
> MVP 범위/기술 스택: `specs/mvp_scope.md`

---

## 전체 구조

```
┌─────────────────────────────────────────────────────────┐
│  [P] [W] [C] [D] [E]   ← 사이드바 (5 Agent)            │
│                                                         │
│  Stage 1 → Stage 2 → Stage 3 → Stage 4 → Stage 5       │
│  Meeting   Script    Visual    The Set   Post-Prod      │
│  Room      Room      Studio              Suite          │
│                                              [Samantha] │
└─────────────────────────────────────────────────────────┘
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

| 패턴 | 상세 |
|------|------|
| **사이드바** | 좌측 고정. 5 Agent 아이콘 수직 배치 (Producer > Writer > Concept > Director > Editor). 활성 Stage 강조. 하단에 설정/알림 아이콘 |
| **Samantha** | 우측 하단 플로팅 아이콘. 전역 AI 비서 — 진행 상황 요약, 실시간 도움, Stage 간 맥락 전달 |
| **Handoff 버튼** | 각 Stage 하단/우상단. 다음 Stage로 이동하는 CTA. 영상생성 직전까지 이전 Stage 복귀 가능 |
| **디자인 테마** | Netflix Dark Mode (Deep Black #121212, Accent #E50914 또는 #7A285E) |

### Stage 전환 (Handoff 패턴)

```
P1 "Hand over to Writer →"
    → P2 "Ask Concept Artist →"
        → P3 "Approve & Direct →"
            → P4 "Head to Editor →"
                → P5 [Draft Rendering]
```

- 영상생성 시작 전: 이전 Stage 자유 복귀 (사이드바 클릭)
- 영상생성 시작 후: 복귀 불가

---

## P1: The Meeting Room (Producer)

> 상태: **MVP 포함** — V2 디자인 확정
> 참고: `specs/reference_v2/image.png`

### 목적

프로젝트 시작점. Producer Agent와 대화하며 스토리/컨셉/설정 수집.
"미팅하듯이" 자연스럽게 정보를 채우는 대화 중심 설계.

### 레이아웃

```
┌──── 사이드바 ────┬──────────────────┬─────────────────────┐
│ [P] Producer ●  │ The Meeting Room │  Project Dashboard   │
│ [W] Writer      │ ● Agent Active   │                     │
│ [C] Concept     │                  │ PLAYTIME: Pending...│
│ [D] Director    │ ┌──────────────┐ │ GENRE: Pending...   │
│ [E] Editor      │ │ Hello! I'm   │ │                     │
│                 │ │ your Producer│ │ Logline:            │
│ ─── ─── ───    │ │ Agent. What  │ │ "Pending concept    │
│ [⚙] [🔔]       │ │ is your...   │ │  discussion..."     │
│ [Samantha]      │ └──────────────┘ │                     │
│                 │                  │ Tone & Style:       │
│                 │ [Type response]▶ │ [Pending...]        │
│                 │                  │                     │
│                 ├──────────────────┴─────────────────────┤
│                 │         [Hand over to Writer →]         │
└─────────────────┴───────────────────────────────────────┘
```

### 요소

| 요소 | 설명 |
|------|------|
| Meeting Chat (좌) | Producer Agent 대화창. AI가 먼저 인사/질문. 파일 업로드 지원 (시나리오 복붙/첨부) |
| Project Dashboard (우) | 대화에서 수집된 정보 실시간 업데이트. Playtime, Genre, Logline, Tone & Style 위젯 |
| Syncing 배지 | Dashboard 우상단. 대화 내용 → Dashboard 실시간 동기화 표시 |
| Handoff | "Hand over to Writer →" 버튼. Dashboard 충분히 채워지면 활성화 |

### 입력

| 데이터 | 방식 |
|--------|------|
| story_text | 대화로 입력 또는 파일 업로드 (시나리오 복붙) |
| project_settings | AI가 스토리에서 추론 → 사용자 확인 (장르, 비율, 길이) |

### 출력 → P2

| 데이터 | 내용 |
|--------|------|
| story_text | 사용자 입력 스토리 |
| project_settings | playtime, genre, aspectRatio, toneStyle |

---

## P2: The Script Room (Writer) — ⚠️ 제거됨 (백엔드 전용)

> ## ⚠️ 현행 (2026-06-05, decision #38)
> **이 페이지는 제거됐습니다.** writer는 **UI 없는 백엔드 전용 스테이지** — producer 핸드오프(`/api/writer/start`)에서
> writer 엔진이 백그라운드 실행되어 DB(scenes/characters/shots)를 채우고, 사용자는 producer → **artist**로 직행한다.
> 아래 본문(Shot Grid / AI Writer Chat / `features/writer/*` / 사이드바 Writer 아이콘 / "Hand over to Writer")은
> 모두 **폐기된 옛 UI** — historical 참고용. 현행 흐름은 `decision #38`, `specs/changes/unify-svc-writer-pipeline/`.

> 상태: ~~MVP 포함~~ → **제거 (백엔드 전용)**
> 참고: `specs/reference_v2/image2.png` (옛 디자인)

### 목적

스토리 → 씬 분할 (기승전결) → 샷 시퀀스 생성. AI Writer와 대화 + 씬/샷 직접 편집.
"Zero Friction" — 1회 호출로 씬+샷 자동 생성. 샷별 내러티브 데이터 직접 수정.

### 레이아웃

```
┌─ Header: "The Script Room" + Auto-Save + Regenerate ──────────┐
├─ Collapsible Story Input (기존) ──────────────────────────────┤
├─ Scene Cards (4개, 가로 배열) ────────────────────────────────┤
├─ Left (flex-1)────────────────────┬─ Right (w-80) ───────────┤
│ Shot Grid (선택된 씬의 샷 카드들)  │ AI Writer Chat           │
│ ┌────┬────┬────┬────┬────┐       │ (씬+샷 컨텍스트 포함)     │
│ │ S1 │ S2 │ S3 │ S4 │ S5 │       │                          │
│ └────┴────┴────┴────┴────┘       │                          │
│ Shot Detail Editor (선택된 샷)     │                          │
│ - 샷 설명 (textarea)              │                          │
│ - 샷 타입 (select)                │                          │
│ - 등장인물 (tag badges)            │                          │
│ - 대사 (리스트, 추가/삭제/편집)      │                          │
│ - 배경 (씬 location 참조, 읽기전용)  │                          │
│ - 시간 (seconds input)            │                          │
├───────────────────────────────────┴──────────────────────────┤
│ Handoff: "Ask Concept Artist →"                               │
└───────────────────────────────────────────────────────────────┘
```

### 요소

| 요소 | 설명 |
|------|------|
| 씬 카드 (상단) | 기승전결 4개 카드 가로 배열. 씬명 + 로케이션 + 시간대. 활성 카드 강조. 씬 선택 시 Shot Grid 갱신 |
| Auto-Generate Scenes | 우상단 Regenerate 버튼. P1 스토리 기반으로 4 씬 + 씬당 4~6 샷 자동 생성 (L1 + L2 Lite Pipeline) |
| Shot Grid | 선택된 씬의 샷 카드 가로 스크롤. 샷 타입 + 설명 + 캐릭터 + 대사 프리뷰. 샷 선택 시 Shot Editor 갱신 |
| Shot Detail Editor | 선택된 샷 상세 편집. Shot Type (select), Duration (number), Location (읽기전용), Description (textarea), Characters (badge), Dialogue Lines (추가/삭제/편집) |
| AI Writer Chat (우측) | 씬 매니페스트 + 선택된 샷 컨텍스트 포함. 씬/샷 레벨 코칭 |
| Auto-Save | 편집 내용 자동 저장 |
| Handoff | "Ask Concept Artist →" 버튼 |

### Pipeline

```
P1 출력 (story_text + settings)
    ↓ Pumpup (시각화 정보 확장)
    ↓ L1 Scene Architect (씬 분할 → 기승전결 4 Scene)
    ↓ L2 Lite Shot Composer (씬당 4~6 샷, 내러티브 데이터만)
    ↓
Scene Manifest + Character Sheet + Location Sheet + Shot Sequences
```

### 컴포넌트 구조

```
writer/page.tsx (리컴포즈)
├── features/writer/scene-cards.tsx    ← 씬 카드 그리드
├── features/writer/shot-grid.tsx      ← 샷 카드 가로 스크롤
├── features/writer/shot-editor.tsx    ← 샷 디테일 에디터 (대사 관리)
└── features/writer/writer-chat.tsx    ← AI Writer 채팅
```

### 출력 → P3

| 데이터 | 내용 |
|--------|------|
| scene_manifest | 씬 목록 (id, name, location, timeOfDay, mood, description) |
| character_sheet | 캐릭터 (id, name, role, description, fixedPrompt) |
| location_sheet | 로케이션 (id, name, timeOfDay, lightingDirection, description) |
| shot_sequences | 샷 목록 (id, sceneId, shotType, description, characters, dialogue, duration) — 내러티브만, 카메라/라이팅은 P4 |

### L2 Lite 범위 (P2 vs P4)

| 데이터 | P2 (L2 Lite) | P4 (Full L2+L3) |
|--------|-------------|-----------------|
| 샷 설명 | O | 수정 가능 |
| 대사 | O | 수정 가능 |
| 등장인물 | O | 수정 가능 |
| 샷 타입 | O | 수정 가능 |
| 카메라 (6축) | default `{0,0,0,0,0,0}` | Director가 설정 |
| 라이팅 | default `{front, 50, 5000}` | Director가 설정 |

### 열린 질문

| ID | 질문 | 상태 |
|----|------|------|
| Q-P2-1 | AI 작가의 시스템 프롬프트/역할 정의 | **닫힘** — 구현 완료 |
| Q-P2-3 | 출연진 추출 자동/수동 여부 | **닫힘** — L1에서 자동 추출 |

---

## P3: The Visual Studio (Concept Canvas)

> 상태: **MVP 포함** — V3.1에서 노드 그래프로 전면 재설계
> 구현 (source-of-truth): `src/features/artist/`, `src/app/studio/artist/`
> 시각 컨벤션: `specs/design.md` (특히 §17 Canvas conventions)
> 결정 근거: `specs/decisions.md` #29

### 목적

캐릭터(Actor)와 장소(World)를 노드로 정의하고 관계를 엣지로 연결해 컨셉 아트의 일관성을 그래프로 관리. 누적 이미지 ≥ 20장 충족 시 Asset Storage에 등록해 P4로 전달.

### V2 → V3.1 변경점

- ~~2컬럼 패널 (Character Consistency + World Model)~~ → **노드 그래프 캔버스 + 좌측 Meeting Room 도킹**
- ~~Front/Side/Back 3뷰 고정~~ → **노드 출력 모드 (Single / 5-View / 16-Angle) 토글**
- ~~Asset Locking 마우스 오버~~ → **캐릭터 등록 폼 (조건 충족 시 활성)**
- 신규: Branch 메커니즘, Status 노드 (마더 연동 변형), Real-time Propagation, 토큰 비용 표시

### 레이아웃

```
┌─ Studio sidebar ─┬─ Meeting Room ─┬───── Canvas (React Flow) ─────┐
│ [P] Producer    │ (좌측 도킹)     │                                │
│ [W] Writer      │                 │   ┌──────────┐   ┌──────────┐  │
│ [C] Concept ●   │ artist agent    │   │ Actor:   │   │ World:   │  │
│ [D] Director    │ 가이드 + 채팅   │   │  Kai (붉)│───│ Plain(파)│  │
│ [E] Editor      │                 │   └────┬─────┘   └──────────┘  │
│                 │                 │        │                       │
│                 │                 │   ┌────▼────┐                  │
│                 │                 │   │ Status: │                  │
│                 │                 │   │  부상   │                  │
│                 │                 │   └─────────┘                  │
│                 │                 ├────────────────────────────────┤
│                 │                 │ Palette (탭, MVP Disable)      │
└─────────────────┴─────────────────┴────────────────────────────────┘
                                      Storage 탭 (우, MVP Disable)
```

### 요소 (요약 — 상세는 L0 스펙)

| 요소 | 설명 |
|------|------|
| **Canvas** | React Flow 무한 캔버스. 좌→우 흐름 + snap-to-grid 16px |
| **Meeting Room (좌)** | 기존 `global-chat-store` artist agent 재사용, 좌측 도킹. Warm starting 가이드 |
| **노드 종류** | Actor (붉은) / World (파란) / Status (마더 톤 변주). 3종만 |
| **출력 모드** | Single 1장 / 5-View 5장 / 16-Angle 16장. 별도 노드 아님, 노드 속성 |
| **Branch** | 박스 내 버튼 또는 핀→빈공간 클릭. Status 또는 독립 자식 생성 |
| **엣지** | parent / in-world / references 3종. 색은 동일, 굵기·스타일로 구분 |
| **캐릭터 등록** | 누적 이미지 ≥ 20장 시 활성. 이름/ID/배경/설명 입력 → Asset Storage |
| **Palette (하단 탭)** | MVP Disable. Costume / Item / Environment Preset은 Future |
| **Storage (우측 탭)** | MVP Disable. Asset 브라우저는 Future |

### API

| API | 용도 |
|-----|------|
| Gemini Imagen | T2I 기본 모델 |
| H100 self-hosted | Multi-view 일관성 (동일 시드 + 카메라 프롬프트 변주) |

### 입력

| 데이터 | 소스 |
|--------|------|
| (현재) 비어 있음 | L0는 사용자가 캔버스에서 직접 정의 |
| (향후) character_sheet, location_sheet | P2 출력에서 자동 노드 시드 (Phase 3+) |

### 출력 → P4

| 데이터 | 내용 |
|--------|------|
| character_assets | 등록된 Actor의 5-View + 16-Angle + Status 변형 |
| world_assets | 등록된 World의 Single + 5-View 이미지 |
| graph_snapshot | 그래프 위상 (P4가 캐릭터-월드 관계 참조 시) |

---

## P4: The Set (Director)

> 상태: **MVP 포함** — V2 기준 → **노드 그래프 재설계 진행 중 (2026-05-25~)**
> 참고: `specs/reference_v2/image4.png` (구 V2 패널 UI)
> **신규 SoT**: `specs/layers/director_canvas.md` — Scene → Shot → Video 노드 그래프 스펙
> 참고 패턴: `src/features/artist/` (Artist 카드/팝업 UI 코드)

### 재설계 개요 (2026-05-25)

P4를 Artist L0 Canvas와 같은 패턴의 노드 그래프 워크스페이스로 재설계.

| 차원 | 구 V2 (현행 코드) | 신규 노드 그래프 |
|------|------------------|------------------|
| UI 메탈모델 | 3패널 (Scene Nav + Shot Grid + Cinematographic Inspector) | 노드 캔버스 + 좌측 Meeting Room + 하단 Palette + 우측 Storage 탭 |
| Shot 표현 | Grid 카드 | Shot 노드 (Scene 노드 자식) |
| 영상 테이크 | 단일 video URL per Shot | Video 자식 노드 N개 (Branch로 변주) |
| Writer 연동 | Handoff 시 1회 로드 | Scene/Shot 양방향 sync |
| 카메라/조명 UI | Inspector 패널 | Shot/Video NodePopup 내부 |
| 재사용 셋업 | 없음 | Camera/Light Preset Library (Palette 등록) |

상세 스펙·결정사항·Open Questions는 모두 `specs/layers/director_canvas.md` 참조.

### 목적 (변경 없음)

스토리보드(샷 배치) + 촬영 기법 적용 + 영상 생성.
Artist가 *이미지 기반 스토리보드*라면 P4는 *영상 기반 스토리보드 + 디렉팅*(조명/앵글/카메라 무브먼트/렌즈 프리셋).

### V1 → V2 → 노드 그래프 변경 이력

- V1: 탭 기반 (Cinematographic / Shot Frames / Music)
- V2: 3패널 통합 (Scene Nav + Shot Grid-Mindmap + Cinematographic Inspector) + Director Kim Chat 하단
- **2026-05-25**: 노드 그래프로 재설계 (Artist L0와 같은 패턴). 아래 V2 레이아웃 설명은 현행 코드 기준이며 점진적으로 노드 그래프로 마이그레이션 예정. 신규 스펙은 `director_canvas.md` 참조

### 레이아웃

```
┌── 사이드바 ──┬────────┬──────────────────────┬──────────────┐
│ [P] Producer│ SCENE  │ Shot Node Grid        │ CINEMATO-    │
│ [W] Writer  │NAVIGATOR│ "The Encounter"      │ GRAPHIC      │
│ [C] Concept │        │                      │ INSPECTOR    │
│ [D] Director│ ACT I  │ 0 frames | 36 chars  │              │
│    ●        │ The    │ | 0 locations        │ LENS COMBO   │
│ [E] Editor  │Encounter│                      │ [24][35][50] │
│             │ ●●●●   │ [Char][Char][Char]   │              │
│             │        │    ↓                  │ ANGLE CONTROL│
│             │ ACT II │ ┌────────┐ ┌────┐    │ ┌──────────┐ │
│             │ The    │ │Shot 1  │→│S2  │→...│ │ 3D Cube  │ │
│             │Chase   │ │"Hey,   │ │"We │    │ └──────────┘ │
│             │ ●●     │ │IHAT.." │ │need│    │ Rot/Tilt/    │
│             │        │ └────────┘ └────┘    │ Scale 슬라이더│
│             │ ACT III│    ↓                  │              │
│             │Hideout │ [BG][BG][BG]         │ KEY LIGHT    │
│             │ ●      │                      │ ○ Sphere     │
│             │        │ ← 흐름 화살표 →       │ [L][T][R][F] │
│             │ ACT IV │                      │ 밝기 + 색온도  │
│             │Revelat.│                      │              │
│             │        │                      │              │
│             ├────────┴──────────────────────┴──────────────┤
│             │ DIRECTOR KIM CHAT                            │
│             │ "안녕하세요, 'The Encounter' 촬영 가이드를      │
│             │  드리겠습니다. 샷 분석을 시작합니다..."           │
│             ├──────────────────────────────────────────────┤
│             │              [Head to Editor →]               │
└─────────────┴──────────────────────────────────────────────┘
```

### 요소

#### Scene Navigator (좌측 패널)

| 요소 | 설명 |
|------|------|
| 4 Act 씬 카드 | 기승전결. 씬명 + 로케이션 + 시간대. 색상 코딩 |
| 샷 진행 도트 | 각 씬의 샷 수만큼 도트 표시. 생성 완료 = 채워진 도트 |
| 씬 선택 | 클릭 시 Shot Node Grid 해당 씬으로 전환 |

#### Shot Node Grid-Mindmap (중앙 캔버스)

| 요소 | 설명 |
|------|------|
| 메인 샷 카드 | 씬당 6샷 수평 배치. 썸네일 + 샷 타입 + 대사 텍스트 |
| 캐릭터 서브노드 | 각 샷 상단. Front/Side/Back 얼굴 썸네일 (P3 Lock된 캐릭터) |
| 배경 서브노드 | 각 샷 하단. P3 World Model 배경 연결 |
| 방향 흐름 화살표 | 샷 간 시퀀스 방향 표시 |
| 상단 카운터 | `0 frames | 36 characters | 0 locations` |
| Frame Mode | Start only / Start-to-End / Next Start 선택 스위치 |

#### Cinematographic Inspector (우측 패널)

| 요소 | 설명 |
|------|------|
| Lens Combo | 렌즈 캐러셀. 24mm / 35mm / 50mm (+ Panavision/Canon/Cooke/Zeiss/Leica 브랜드) |
| Angle Control | 드래그 가능 CSS 3D Cube + Rotation/Tilt/Scale 슬라이더 (Kling 6축 매핑) |
| Key Light | Lighting Sphere UI. 구체 위 L(Left)/T(Top)/R(Right)/F(Front) 위치 클릭 + 밝기 슬라이더 + 색온도 슬라이더. Warm/Cool Light 프리셋 |
| Motion Intensity | 카메라 움직임 강도 원형 다이얼 |

#### Director Kim Chat (하단)

| 요소 | 설명 |
|------|------|
| AI 촬영 가이드 | 자동 재생 스크립트 대화. 샷별 분석/추천 제공 |
| Inspector 연동 | "카메라를 위로" → Tilt +35° 실시간 애니메이션 |
| Syncing 배지 | Chat 추천 → Inspector 값 동기화 시 표시 |

### API

| API | 용도 |
|-----|------|
| DALL-E 3 / Imagen | 샷별 이미지 생성 (Start Frame) |
| Kling (I2V) | 6축 카메라 제어 영상 생성 |
| Veo (T2V) | 품질 우선 영상 생성 |
| Gemini LLM | Director Chat, L3 프롬프트 빌드 |
| Knowledge DB | camera_presets.yaml, rendering_style.yaml |

### Pipeline

```
P3 출력 (character_assets + world_assets)
  + P2 출력 (scene_manifest) + L2 (shot_sequences)
    ↓ 샷 이미지 생성 (DALL-E/Imagen)
    ↓ L3 Prompt Builder (Knowledge DB + 카메라 파라미터)
    ↓ Video API (Kling I2V / Veo T2V)
    ↓
Video Clips + Shot Metadata → P5
```

### 입력

| 데이터 | 소스 |
|--------|------|
| character_assets | P3 출력 (Lock된 캐릭터 이미지) |
| world_assets | P3 출력 (배경 이미지) |
| scene_manifest | P2 출력 |
| shot_sequences | L2 출력 |

### 출력 → P5

| 데이터 | 내용 |
|--------|------|
| video_clips | 샷별 영상 클립 |
| shot_metadata | 씬/샷 순서, 카메라 설정, duration |

---

## P5: Post-Production Suite (Editor)

> 상태: **MVP 포함 (Lite)** — V2 디자인 확정
> 참고: `specs/reference_v2/image5.png`

### 목적

생성된 영상 클립 리뷰 + 편집 + 최종 렌더링.
MVP에서는 기본 편집(프리뷰/타임라인/Crop)만, AI 편집 도구는 Post-MVP.

### V1 → V2 변경점

- ~~와이어프레임 없음~~ → **V2에서 디자인 확정**
- 씬별 탭 + 샷 썸네일 타임라인
- 음악 Waveform 시각화
- AI 도구: In-Painting (영역 교체) + In-Pointing (시간 가이드)

### 레이아웃

```
┌── 사이드바 ──┬──────────────────────────────────────┬────┐
│ [P] Producer│                                      │ 편 │
│ [W] Writer  │                                      │ 집 │
│ [C] Concept │          비디오 프리뷰어                │ 도 │
│ [D] Director│          (선택 클립 재생)               │ 구 │
│ [E] Editor ●│                                      │    │
│             │                                      │ ✏️ │
│             │                                      │ 🖌️ │
│             │                                      │ ✂️ │
│             ├──────────────────────────────────────┤    │
│             │ SC_01 | SC_02 | SC_03 | SC_04        │    │
│             │ ┌─────┐┌─────┐┌─────┐┌─────┐        │    │
│             │ │MSTR ││ P2  ││ P3  ││ ... │ 샷 썸네일│    │
│             │ └─────┘└─────┘└─────┘└─────┘        │    │
│             │ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ 음악 Waveform     │    │
│             │ 00:00  01:11  02:11  01:41           │    │
│             ├──────────────────────────────────────┤    │
│             │         [Draft Rendering]             │    │
└─────────────┴──────────────────────────────────────┴────┘
```

### 요소

| 요소 | 설명 | MVP |
|------|------|-----|
| 비디오 프리뷰어 (중앙) | 선택 클립 재생. 풀사이즈 | **O** |
| 씬별 탭 | SC_01 / SC_02 / SC_03 / SC_04 탭 전환 | **O** |
| 샷 썸네일 타임라인 | 씬 내 샷별 썸네일 가로 배치. 드래그로 순서 변경 | **O** |
| 클립 Crop | 앞뒤 트리밍 핸들 | **O** |
| 순서/삽입/삭제 | 드래그 순서 변경 + 삽입/삭제 | **O** |
| Draft Rendering | 전체 병합 → 다운로드 버튼 | **O** |
| 편집 도구 (우측) | In-Painting 브러시 등 세로 툴바 | Post-MVP |
| In-Pointing | 시간적 가이드 바 (AI 보조) | Post-MVP |
| In-Painting | 영역 교체 브러시 (AI 보조) | Post-MVP |
| 음악 Waveform | 음악 파형 + 영상 싱크 조절 핸들 | Post-MVP |
| AI 품질 평가 | 자동 품질 점수 | Post-MVP |

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
P2 The Script Room  ─── L1 Pipeline (Pumpup + Scene Architect) + L2 Lite (Shot Composer)
│  scene_manifest, character_sheet, location_sheet, shot_sequences
▼
P3 The Visual Studio  ─── 이미지 생성
│  character_assets (Lock), world_assets
▼
P4 The Set  ─── L2/L3 Pipeline + 이미지/영상 생성
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
| `specs/overview.md` | 제품 철학 + 용어 + 파이프라인 개념 |
| `specs/open_questions.md` | 미해결 질문 목록 |
| `specs/layers/L1~L3` | 파이프라인 레이어별 상세 |
| `specs/reference_v2/` | V2 디자인 원본 (docs.md + image1~5) |

---

## 변경 이력

| 날짜 | 내용 |
|------|------|
| 2026-03-06 | V3.1: P2 샷 레벨 편집 추가. L2 Lite Shot Composer 파이프라인. 컴포넌트 분리 (4파일). shot_sequences 출력 |
| 2026-03-03 | V3: P1~P5 전체 MVP 포함. DataProvider Mock 참조 제거. Scope 내용 mvp_scope.md로 분리 |
| 2026-03-03 | V2: 5 Stage 구조, 사이드바/Handoff/Samantha 패턴, P3 에셋 전용, P4 Storyboard 통합, P5 디자인 확정 |
| 2026-02-25 | V1: 초안 (UX.pdf + overview.md + 스펙 인터뷰 통합) |
