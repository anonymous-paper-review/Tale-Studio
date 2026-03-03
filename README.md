# Tale Studio

B2B AI 영상 제작 도구. 텍스트 → 전문 촬영 기법 적용 고품질 AI 비디오 자동 생성.

## 기술 스택

- **Frontend**: Next.js (React) + Three.js (3D 카메라 프리뷰)
- **Backend**: Next.js API Routes
- **DB**: Supabase (PostgreSQL)
- **배포**: Vercel

## 프로젝트 구조

```
tale/
├── specs/                      # 제품 스펙
│   ├── overview.md             # 제품 + UX + 아키텍처
│   ├── mvp_scope.md            # MVP 범위 (P3+P4) + 기술 결정
│   ├── ux_pages.md             # UX 페이지별 정의서
│   ├── open_questions.md       # 열린/닫힌 질문 추적
│   ├── ava_framework.md        # AVA Framework
│   ├── decisions.md            # 의사결정 로그
│   ├── layers/                 # 파이프라인 레이어별 상세 스펙
│   │   ├── L1_scene_architect.md
│   │   ├── L2_shot_composer.md
│   │   └── L3_prompt_builder.md
│   ├── reference/              # UX 와이어프레임, 경쟁사 참고, 레거시 코드
│   └── archive/                # 레거시 스펙
│
├── docs/                       # 비즈니스 문서
│   ├── infrastructure.md       # 인프라/배포/비용 설계
│   └── internal/               # 전략 논의
│
├── databases/                  # 데이터
│   ├── knowledge/              # 촬영 기법 Knowledge DB (YAML)
│   └── migrations/             # Supabase 스키마
│
├── assets/                     # 크리에이티브 자산
│   ├── characters/             # 캐릭터 레퍼런스 이미지
│   └── lore/                   # 로어/시나리오 데이터
│
└── .env                        # API 키 (환경변수)
```

## 핵심 파이프라인

```
[Story] → [Pumpup] → [L1 Scene Architect] → [L2 Shot Composer] → [L3 Prompt Builder] → [Video API]
```

## 스펙 읽는 순서

1. `specs/overview.md` — 전체 그림
2. `specs/mvp_scope.md` — MVP 범위 + 기술 결정
3. `specs/ux_pages.md` — UX 페이지별 상세
4. `specs/layers/L1~L3` — 레이어별 상세
5. `specs/decisions.md` — 왜 이렇게 결정했는지

## 환경 설정

```bash
cp .env.example .env
# .env 파일에 API 키 설정
```
