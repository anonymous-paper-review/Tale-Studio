# Tale Studio

B2B AI 영상 제작 도구. 텍스트 → 전문 촬영 기법 적용 고품질 AI 비디오 자동 생성.

## 기술 스택

- **Frontend**: Next.js 16 (App Router) + Tailwind v4 + shadcn/ui + Zustand
- **3D**: Three.js + React Three Fiber (P4 카메라 프리뷰)
- **Backend**: Next.js API Routes
- **DB**: Supabase (PostgreSQL)
- **배포**: Vercel

## 프로젝트 구조

```
tale/
├── specs/                      # 제품 스펙 (SoT)
│   ├── mvp_scope.md            # Scope SoT: MVP 범위 + 기술 스택 + 구현 순서
│   ├── ux_pages.md             # UX SoT: 페이지별 레이아웃, 요소, 인터랙션
│   ├── api_features.md         # API 기능 스펙 (6축 카메라, Knowledge DB 등)
│   ├── decisions.md            # 의사결정 로그
│   ├── open_questions.md       # 열린/닫힌 질문 추적
│   └── layers/                 # 파이프라인 레이어별 입출력 계약
│       ├── L1_scene_architect.md
│       ├── L2_shot_composer.md
│       └── L3_prompt_builder.md
│
├── src/                        # Next.js 앱
│   ├── app/studio/             # 5-Stage: Producer / Writer / Artist / Director / Editor
│   ├── components/             # UI 컴포넌트 (layout + shadcn/ui)
│   ├── stores/                 # Zustand (project, artist, director)
│   ├── mocks/                  # Mock 데이터 (4씬, 24샷, 3캐릭터)
│   ├── types/                  # 공유 타입 (L1~L3 기반)
│   └── lib/                    # 유틸 + Supabase 클라이언트
│
├── databases/
│   ├── knowledge/              # 촬영 기법 Knowledge DB (YAML)
│   └── migrations/             # Supabase 스키마
│
└── assets/lore/                # 로어/시나리오 데이터
```

## 핵심 파이프라인

```
[Story] → [Pumpup] → [L1 Scene Architect] → [L2 Shot Composer] → [L3 Prompt Builder] → [Video API]
```

## 스펙 읽는 순서

1. `specs/mvp_scope.md` — MVP 범위 + 기술 결정
2. `specs/ux_pages.md` — UX 페이지별 상세
3. `specs/api_features.md` — API 기능 스펙
4. `specs/layers/L1~L3` — 레이어별 입출력 계약
5. `specs/decisions.md` — 왜 이렇게 결정했는지

## Setup (새 머신에서 시작하기)

아래 프롬프트를 터미널에서 그대로 실행하면 됩니다.

### Step 1: 프로젝트 클론 & 의존성 설치

```bash
git clone git@github.com:anonymous-paper-review/Tale-Studio.git tale
cd tale
corepack enable && pnpm install
cp .env.example .env
```

> API 키 없이도 Mock 모드로 UI 확인 가능. 필요 시 `.env`에 키 채워 넣기.

### Step 2: Claude Code 시작

```bash
claude
```

아래 프롬프트를 복사해서 Claude Code에 붙여넣기:

```
이 프로젝트에 새로 투입된 개발자야. 온보딩 시켜줘.

1. CLAUDE.md 읽고 프로젝트 개요, 기술 스택, 파이프라인 구조 요약
2. specs/mvp_scope.md 읽고 현재 MVP 범위와 구현 순서(P1~P5) 정리
3. PROGRESS.md 읽고 지금까지 완료된 것 / 다음 할 일 파악
4. pnpm build 돌려서 현재 빌드 상태 확인
5. 위 내용 종합해서 "현재 상태 + 바로 시작할 수 있는 작업" 브리핑해줘

병렬 개발 중이면 내가 어느 브랜치에서 작업해야 하는지도 알려줘.
```
