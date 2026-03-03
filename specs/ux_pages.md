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
| P2 | The Script Room | Writer | L1 | **포함** |
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

## P2: The Script Room (Writer)

> 상태: **MVP 포함** — V2 디자인 확정, 열린 질문 2개
> 참고: `specs/reference_v2/image2.png`

### 목적

스토리 → 씬 분할 (기승전결). AI Writer와 대화 + 씬 카드 직접 편집.
"Zero Friction" — 대화가 즉시 구조화된 씬 카드로 변환.

### 레이아웃

```
┌──── 사이드바 ──┬────────────────────────────────────────────┐
│ [P] Producer  │ The Script Room          [Auto-Generate    │
│ [W] Writer ●  │ Organize your plot        Scenes]          │
│ [C] Concept   │ (Ki-Seung-Jeon-Gyeol)                     │
│ [D] Director  │                                            │
│ [E] Editor    │ ┌──────────┐ ┌──────────┐ ┌────────┐ ┌──┐ │
│               │ │INTRODUCTION│DEVELOPMENT│ │ TURN   │ │CO│ │
│               │ │The Encounter│The Chase │ │Hideout │ │Re│ │
│               │ │📍 Street  │📍 Market  │ │📍Bunker│ │📍│ │
│               │ │🕐 Night   │🕐 Night   │ │🕐 Dawn │ │🕐│ │
│               │ └──────────┘ └──────────┘ └────────┘ └──┘ │
│               ├────────────────────────────────────────────┤
│               │ SCENE DETAIL EDITOR    [Ask Concept Artist→│
│               │                                            │
│               │ The Encounter  [Scene ID: 1] ✏️            │
│               │                                            │
│               │ LOCATION          TIME OF DAY  KEY CONFLICT│
│               │ [Cyberpunk Street] [Night(Rain)] [Proto...]│
│               │                                            │
│               │ SCENE DESCRIPTION & ACTION:                │
│               │ ┌──────────────────────────────────────┐   │
│               │ │ Rain falls heavily on the neon-lit...│   │
│               │ └──────────────────────────────────────┘   │
│               │                        Auto-Save Enabled   │
└───────────────┴────────────────────────────────────────────┘
```

### 요소

| 요소 | 설명 |
|------|------|
| 씬 카드 (상단) | 기승전결 4개 카드 가로 배열. 씬명 + 로케이션 + 시간대. 활성 카드 강조(빨간 테두리) |
| Auto-Generate Scenes | 우상단 버튼. P1 스토리 기반으로 4 씬 자동 분할 (L1 Pipeline) |
| Scene Detail Editor (하단) | 선택된 씬의 상세 편집. Location, Time of Day, Key Conflict 인라인 필드 + Description 텍스트 영역 |
| Auto-Save | 편집 내용 자동 저장 |
| Handoff | "Ask Concept Artist →" 버튼 |

### Pipeline

```
P1 출력 (story_text + settings)
    ↓ Pumpup (시각화 정보 확장)
    ↓ L1 Scene Architect (씬 분할 → 기승전결 4 Scene)
    ↓
Scene Manifest + Character Sheet + Location Sheet
```

### 출력 → P3

| 데이터 | 내용 |
|--------|------|
| scene_manifest | 씬 목록 (id, name, location, timeOfDay, keyConflict, description) |
| character_sheet | 캐릭터 (id, name, role, description) |
| location_sheet | 로케이션 (id, name, timeOfDay, mood, description) |

### 열린 질문

| ID | 질문 |
|----|------|
| Q-P2-1 | AI 작가의 시스템 프롬프트/역할 정의 |
| Q-P2-3 | 출연진 추출 자동/수동 여부 |

---

## P3: The Visual Studio (Concept Artist)

> 상태: **MVP 포함** — V2 기준 결정 완료
> 참고: `specs/reference_v2/image3.png`

### 목적

시각 에셋 제작: 캐릭터 일관성 시트 + 배경(World Model).
생성 → 리뷰 → 재생성 루프. AI가 만든 걸 큐레이션하는 방식.

### V1 → V2 변경점

- ~~3탭 (Char / Stage / Storyboard)~~ → **2컬럼 단일 화면**
- ~~Storyboard 탭~~ → P4로 이동 (Shot Node Grid)
- Asset Locking 추가
- Cinematic Boost 필터 추가

### 레이아웃

```
┌──── 사이드바 ──┬──────────────────┬──────────────────────┐
│ [P] Producer  │ The Visual Studio│        [Approve &    │
│ [W] Writer    │                  │         Direct →]    │
│ [C] Concept ● │                  │                      │
│ [D] Director  │ CHARACTER        │ WORLD MODEL          │
│ [E] Editor    │ CONSISTENCY      │ Style: [CINEMATIC]✏️ │
│               │                  │                      │
│               │ [🔒 Generate     │ ┌──────────────────┐ │
│               │      Sheet]      │ │ Wide Shot        │ │
│               │                  │ │ (배경 이미지)      │ │
│               │ PROTAGONIST "KAI"│ │                  │ │
│               │ [Front][Side]    │ └──────────────────┘ │
│               │ [Back]           │                      │
│               │                  │ ┌──────────────────┐ │
│               │ ANTAGONIST       │ │ Establishing     │ │
│               │ "VIPER"          │ │ Shot             │ │
│               │ [  ][  ][  ]     │ │ (배경 이미지)      │ │
│               │                  │ └──────────────────┘ │
└───────────────┴──────────────────┴──────────────────────┘
```

### 요소

| 요소 | 설명 |
|------|------|
| **Character Consistency (좌)** | 캐릭터별 3뷰 (Front/Side/Back). "Generate Sheet" 버튼으로 자동 생성. 마우스 오버 시 Lock 아이콘 |
| **Asset Locking** | 확정 캐릭터 Lock → 이후 모든 이미지 생성 시 해당 캐릭터 일관성 유지 |
| **World Model (우)** | 씬별 배경 이미지. Wide Shot + Establishing Shot. "CINEMATIC BOOST" 스타일 프리셋 |
| **Cinematic Boost** | 필터 프리셋 칩 (Cinematic, High-res 등). 배경 이미지 품질/스타일 조정 |
| **Handoff** | "Approve & Direct →" 버튼. 에셋 확정 후 P4로 이동 |

### API

| API | 용도 |
|-----|------|
| DALL-E 3 / Imagen | 캐릭터 시트 생성, 배경 이미지 생성 |

### 입력

| 데이터 | 소스 |
|--------|------|
| character_sheet | P2 출력 |
| location_sheet | P2 출력 |

### 출력 → P4

| 데이터 | 내용 |
|--------|------|
| character_assets | 캐릭터별 3뷰 이미지 (Lock 상태 포함) |
| world_assets | 씬별 배경 이미지 (Wide + Establishing) |

---

## P4: The Set (Director)

> 상태: **MVP 포함** — V2 기준 결정 완료
> 참고: `specs/reference_v2/image4.png`

### 목적

스토리보드(샷 배치) + 촬영 기법 적용 + 영상 생성.
Shot Node Grid-Mindmap이 핵심 UI. Director Chat이 AI 가이드.

### V1 → V2 변경점

- ~~탭 기반 (Cinematographic / Shot Frames / Music)~~ → **3패널 통합**
- P3 Storyboard가 **Shot Node Grid-Mindmap**으로 이동
- ~~프리셋 드롭다운~~ → **Lens Combo + 3D Cube + Lighting Sphere**
- Director Kim Chat 추가 (하단)
- Shot Frames 탭 → Grid 내 직접 관리 (Frame Mode 선택)

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
P2 The Script Room  ─── L1 Pipeline (Pumpup + Scene Architect)
│  scene_manifest, character_sheet, location_sheet
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
| 2026-03-03 | V3: P1~P5 전체 MVP 포함. DataProvider Mock 참조 제거. Scope 내용 mvp_scope.md로 분리 |
| 2026-03-03 | V2: 5 Stage 구조, 사이드바/Handoff/Samantha 패턴, P3 에셋 전용, P4 Storyboard 통합, P5 디자인 확정 |
| 2026-02-25 | V1: 초안 (UX.pdf + overview.md + 스펙 인터뷰 통합) |
