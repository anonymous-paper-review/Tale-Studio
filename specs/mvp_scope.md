# MVP Scope — V3

> 최종 수정: 2026-03-03
> 상태: P1~P5 전체 포함으로 확장
> 이전: V2 (P3+P4+P5 Lite) → **V3 (P1~P5, P5 Lite)**

---

## 1. MVP 범위

### 포함

| Stage | V2 이름 | 핵심 역할 | Pipeline |
|-------|---------|----------|----------|
| **P1** | The Meeting Room | Producer Agent 대화로 스토리/설정 수집 | - |
| **P2** | The Script Room | Writer Agent + L1 (Pumpup → 씬 분할) | L1 |
| **P3** | The Visual Studio | 캐릭터 Consistency Sheet + World Model | - |
| **P4** | The Set | Shot Node Grid + Cinematographic Inspector + 영상 생성 | L2+L3 |
| **P5 Lite** | Post-Production Suite | 프리뷰 + 타임라인 + Crop + Draft 렌더링 | - |

### 제외 (Post-MVP)

| 항목 | 이유 |
|------|------|
| P5 AI 편집 도구 | In-Painting/In-Pointing/음악 Waveform 싱크 |
| P4/P5 Music | 배경음악 생성/싱크 후순위 |
| 코인/과금 시스템 | PMF 이후 |
| 인증/인가 | MVP 단계 불필요 |
| Inspiration Recipes | P1 커뮤니티 레시피. 사용자 데이터 필요 |

### P5 Lite 범위

| 포함 (MVP) | 제외 (Post-MVP) |
|------------|-----------------|
| 중앙 비디오 프리뷰어 | In-Painting (영역 교체 브러시) |
| 하단 타임라인 (씬별 탭 + 샷 썸네일) | In-Pointing (시간적 가이드 바) |
| 영상 클립 Crop (앞뒤 트리밍) | 음악 Waveform 싱크 |
| 클립 순서 변경 / 삽입 / 삭제 | AI 품질 자동 평가 |
| Draft 렌더링 (전체 병합 → 다운로드) | 음악 생성/배치 |

---

## 2. 데이터 흐름

```
P1 The Meeting Room
│  story_text, project_settings
▼
P2 The Script Room ─── Pumpup + L1 Scene Architect
│  scene_manifest, character_sheet, location_sheet
▼
P3 The Visual Studio ─── 이미지 생성 (DALL-E/Imagen)
│  character_assets (Lock), world_assets
▼
P4 The Set ─── L2 Shot Composer + L3 Prompt Builder + 영상 생성
│  video_clips, shot_metadata
▼
P5 Post-Production Suite ─── 편집 + Draft 렌더링
│  final_video (Draft)
▼
[Download / Export]
```

> UX 페이지별 상세 (레이아웃, 요소, API): `specs/ux_pages.md`

---

## 3. 구현 순서

| Phase | 대상 | 의존성 | 작업 |
|-------|------|--------|------|
| 1 | **P3 + P4** | 없음 (Mock 입력 가능) | 핵심 가치 — 에셋 생성 + 촬영 기법 + 영상 생성 |
| 2 | **P5 Lite** | P4 출력 | 프리뷰 + 타임라인 + 렌더링 |
| 3 | **P2** | P3 입력 인터페이스 확정 | L1 Pipeline (Pumpup + 씬 분할) |
| 4 | **P1** | P2 입력 인터페이스 확정 | Producer Agent 대화 수집 |

> Phase 1에서는 P3/P4 입력을 DataProvider Mock으로 대체.
> Phase 3~4에서 Mock → 실제 P1/P2 출력으로 교체.

---

## 4. 기술 스택

| 레이어 | 기술 | 이유 |
|--------|------|------|
| Frontend | **Next.js** (React) | 프론트+API Routes 통합, Vercel 배포 |
| 3D 프리뷰 | **Three.js** | Angle Control 3D Cube + 카메라 시각화 |
| Backend API | **Next.js API Routes** | 별도 서버 불필요 |
| DB | **Supabase** (PostgreSQL) | Knowledge DB + Video Reference DB + 프로젝트 저장 |
| 이미지 생성 | **DALL-E 3** / Imagen | 캐릭터/배경/샷 이미지 |
| 영상 생성 | **Kling** (카메라 제어) / **Veo** (품질) | 기존 검증됨 |
| LLM | **Gemini** | Agent 대화, 프롬프트 생성, 씬 분석 |
| 배포 | **Vercel** | Next.js 네이티브 |

---

## 5. 디자인 시스템

| 항목 | 스펙 |
|------|------|
| 테마 | Netflix-style Dark Mode (Deep Black #121212) |
| 액센트 컬러 | #E50914 (Red) 또는 #7A285E (Magenta) |
| 사이드바 | 5 Agent 아이콘 수직 배치 (Producer > Writer > Concept > Director > Editor) |
| Samantha | 우측 하단 플로팅 아이콘. 전역 AI 비서 |
| Stage 전환 | Handoff 버튼 패턴. 영상생성 전까지 이전 Stage 복귀 가능 |

> 공통 UI 상세 + Stage 전환 패턴: `specs/ux_pages.md`

---

## 6. 결정 사항 요약

| 항목 | 결정 | 근거 |
|------|------|------|
| MVP 범위 | P1~P5 (P5 Lite) | Decision #28 |
| 구현 순서 | P3+P4 → P5 → P2 → P1 | 핵심 가치 우선 + 점진적 파이프라인 연결 |
| P3 범위 | 에셋 전용 (Storyboard → P4 이동) | Decision #25 |
| P4 범위 | Shot Node Grid + Inspector + Director Chat 통합 | Decision #26 |
| P5 Lite | 프리뷰 + 타임라인 + Draft 렌더링. AI 편집 제외 | Decision #27 |
| FE 스택 | Next.js + Vercel | Decision #22 |

> 전체 결정 이력: `specs/decisions.md`

---

## 변경 이력

| 날짜 | 내용 |
|------|------|
| 2026-03-03 | V3: MVP P1~P5 전체 포함. Mock 전략 → 구현 순서 기반 점진적 교체로 변경 |
| 2026-03-03 | V2: P3+P4+P5 Lite. V2 디자인 반영 |
| 2026-02-25 | V1: P3+P4 Only |
