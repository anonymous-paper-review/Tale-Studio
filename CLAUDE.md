# Tale - AI Video Generation Pipeline

## 프로젝트 개요

B2B AI 영상 제작 도구. 텍스트 → 전문 촬영 기법 적용 고품질 AI 비디오 자동 생성.
차별화: Knowledge DB 기반 cinematography RAG.

## 스펙 구조

```
specs/
├── mvp_scope.md             ← Scope SoT: MVP 범위 + 기술 스택 + 구현 순서
├── ux_pages.md              ← UX SoT: 페이지별 레이아웃, 요소, 인터랙션
├── api_features.md          ← API 기능 스펙 (6축 카메라, Knowledge DB 등)
├── decisions.md             ← 의사결정 로그
├── open_questions.md         ← 열린/닫힌 질문 추적
└── layers/
    ├── L1_scene_architect.md ← Pumpup + 씬 분할
    ├── L2_shot_composer.md   ← 샷 시퀀스 + 대화
    └── L3_prompt_builder.md  ← Knowledge DB + Camera + 프롬프트
```

> 레거시 (archive/, reference/, reference_v2/, overview.md, ava_framework.md)는 로컬에만 보관, git 미추적

## 3-Level Pipeline

```
Story → [Pumpup] → [L1 Scene Architect] → [L2 Shot Composer] → [L3 Prompt Builder] → [Video API]
```

- **L1**: 스토리 → 씬 분할 + 캐릭터/로케이션
- **L2**: 씬 → 샷 시퀀스 + 대화 + 이미지 생성
- **L3**: 샷 → 최종 프롬프트 + Knowledge DB 기법 주입

## 주요 문서

| 문서 | 용도 |
|------|------|
| `specs/mvp_scope.md` | **Scope SoT** — MVP 범위 (P1~P5) + 기술 스택 + 구현 순서 |
| `specs/ux_pages.md` | **UX SoT** — 레이아웃, 요소, 인터랙션, 데이터 입출력 |
| `specs/api_features.md` | API 기능 스펙 (6축 카메라, Knowledge DB 등) |
| `specs/decisions.md` | 의사결정 로그 |
| `specs/open_questions.md` | 열린/닫힌 질문 추적 |
| `specs/layers/L1~L3` | 파이프라인 레이어별 입출력 계약 |
| `docs/infrastructure.md` | 인프라/배포/비용 설계 |

## 기술 스택

- **Frontend**: Next.js 16 (App Router) + Tailwind v4 + shadcn/ui + Zustand
- **3D**: Three.js + React Three Fiber (P4 전용, Dev B가 설치)
- **Backend**: Next.js API Routes
- **DB**: Supabase (PostgreSQL) — Knowledge DB + Video Reference DB
- **패키지 매니저**: pnpm
- **배포**: Vercel
- **영상 생성**: Kling (I2V, 6축 카메라) / Veo (T2V, 품질)
- **이미지 생성**: Gemini Imagen (gemini-2.0-flash-preview-image-generation)
- **LLM**: Gemini

## 작업 시 주의사항

- API 키는 환경변수로 관리 (하드코딩 금지)
- Knowledge DB: `databases/knowledge/*.yaml` (로컬) + Supabase (프로덕션)

## 현재 상태

**보일러플레이트 완료 → 병렬 개발 시작** (2026-03-03)

Next.js 프로젝트 초기화됨. 공유 타입, 레이아웃, Mock 데이터, Stub 페이지 완비.
구현 순서: P3+P4 (Phase 1) → P5 → P2 → P1

## 병렬 개발 규칙

### 디렉토리 네이밍
Agent 이름 기준: producer(P1) / writer(P2) / artist(P3) / director(P4) / editor(P5)

### 소유권

| Area | Dev A | Dev B |
|------|-------|-------|
| features/producer/, writer/, artist/ | Owner | - |
| features/director/, editor/ | - | Owner |
| stores/artist-store.ts | Owner | - |
| stores/director-store.ts, editor-store.ts (신규) | - | Owner |
| types/, components/layout/, stores/project-store.ts | **PR to main** | **PR to main** |
| mocks/ | 추가만 | 추가만 |

### 브랜치
- `feature/producer-writer-artist` — Dev A
- `feature/director-editor` — Dev B
- 공유 영역 변경 → main PR → 상대가 rebase

### URL 라우트 → 디렉토리 매핑
```
/studio/producer → features/producer/
/studio/writer   → features/writer/
/studio/artist   → features/artist/
/studio/director → features/director/
/studio/editor   → features/editor/
```

## 보일러플레이트 인벤토리

### Stores (Zustand)
- `director-store.ts` — loadMockData, selectScene/Shot, updateCamera/Lighting
- `artist-store.ts` — loadMockData, selectCharacter, updateAsset
- `project-store.ts` — 공유 프로젝트 상태

### Mocks (Phase 1 데이터)
- `shot-sequences.ts` — 24 shots (4씬 × 6샷), CameraConfig + LightingConfig 포함
- `scene-manifest.ts` — 4 scenes (기승전결)
- `character-assets.ts` — 3 캐릭터 (Kai, Viper, Oracle)
- `world-assets.ts` — 4 배경
- `video-clips.ts` — P5 프리뷰용 클립 목록

### Types
- `Shot` — shotType, camera (6축), lighting, dialogueLines
- `CameraConfig` — { horizontal, vertical, pan, tilt, roll, zoom } (-10~+10)
- `Scene`, `CharacterAsset`, `WorldAsset`, `VideoClip`

### P4/P5 시작점
- Stub page: `src/app/studio/set/page.tsx`, `src/app/studio/post/page.tsx`
- Three.js 설치: `pnpm add three @types/three @react-three/fiber @react-three/drei`
- P4 스펙: `specs/ux_pages.md` P4 섹션 (4패널: Scene Nav + Shot Grid + Inspector + Chat)
- P5 스펙: `specs/ux_pages.md` P5 섹션 (프리뷰어 + 타임라인 + 크롭 + Draft Render)
