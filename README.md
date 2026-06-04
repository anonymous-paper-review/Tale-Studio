# Tale Studio

B2B AI 영상 제작 도구. 텍스트 → 전문 촬영 기법(cinematography) 적용 고품질 AI 비디오 자동 생성. 차별화는 **Knowledge DB 기반 cinematography RAG**.

## 기술 스택

- **Frontend**: Next.js 16 (App Router) + Tailwind v4 + shadcn/ui + Zustand
- **Canvas**: React Flow (xyflow) — Artist(L0 Concept) / Director 노드 그래프
- **3D**: Three.js + React Three Fiber (Director 카메라 프리뷰)
- **Backend**: Next.js API Routes
- **DB**: Supabase (PostgreSQL)
- **AI**: Gemini (LLM) · 이미지/비디오 생성 (fal.ai + self-hosted)
- **배포**: Vercel

## 5-Stage 스튜디오

| Stage | 경로 | 역할 |
|---|---|---|
| Producer | `/studio/producer` | 대화로 스토리 seed 수집 (Meeting Room) |
| Writer | `/studio/writer` | 씬·샷 분해 + 미디어 생성 (Script Room) |
| Artist | `/studio/artist` | L0 Concept Canvas — 캐릭터/월드 노드 그래프 |
| Director | `/studio/director` | Director Canvas — Scene/Shot/Video 노드 |
| Editor | `/studio/editor` | Post-Production |

전 단계 공통 우측 **GlobalChat**(폭 드래그 조절·접기) + 디자인 시스템 토큰 기반 UI.

## 디자인 시스템

- **토큰 SoT**: `src/app/globals.css` — shadcn CSS 변수 + 캔버스 확장 토큰(`--canvas-*`/`--node-*`/`--edge-*`) + stage 색(`--stage-producer~editor`)
- **룰/명세**: `specs/design.md` (정량) + `specs/design-references.md` (정성 reference)
- **primitive**: `src/components/ui/` (shadcn — Button/Input/Select/Badge/Dialog 등)
- **라이브 카탈로그**: `/design` — 전 색 토큰 swatch + primitive variant/state 쇼케이스
- harness 룰: `.claude/rules/design.md`, 스킬 `design-system`

## 프로젝트 구조

```
tale/
├── specs/                      # 제품 스펙 (Source of Truth, 캐넌)
│   ├── _constitution.md        # 프로젝트 원칙
│   ├── _TEMPLATE.md            # change 작성 표준
│   ├── changes/                # 진행 중 변경 (proposal/delta/tasks)
│   ├── archive/                # 완료된 변경 (timeline)
│   ├── design.md               # 디자인 시스템 (정량 명세)
│   ├── design-references.md    # 디자인 reference (정성)
│   ├── mvp_scope.md            # MVP 범위 + 구현 순서
│   ├── ux_pages.md             # 페이지별 UX
│   ├── api_features.md         # API 기능 (6축 카메라, RAG)
│   ├── decisions.md            # 의사결정 로그
│   ├── layers/                 # 파이프라인 레이어 입출력 계약 (L0~L3)
│   └── data/                   # 데이터 모델 (canvas, asset storage)
│
├── src/                        # Next.js 앱
│   ├── app/studio/             # 5-Stage 라우트 + 공통 shell(layout)
│   ├── app/design/             # 디자인 시스템 쇼케이스 페이지
│   ├── components/ui/          # shadcn primitive
│   ├── components/layout/      # 전역 레이아웃 (Sidebar, GlobalChat 등)
│   ├── features/               # stage별 기능 (producer/writer/artist/director/editor)
│   ├── stores/                 # Zustand (project, canvas, director-canvas, chat-ui 등)
│   ├── types/                  # 공유 타입
│   └── lib/                    # 유틸 + Supabase 클라이언트 + svc 파이프라인
│
├── databases/
│   ├── knowledge/              # 촬영 기법 Knowledge DB (YAML)
│   └── migrations/             # Supabase 스키마
│
└── .claude/                    # Claude Code harness (rules / hooks / skills / agents)
```

## 핵심 파이프라인

```
[L0 Concept Canvas] → Asset Storage
                            ↓
[Story] → [Pumpup] → [L1 Scene Architect] → [L2 Shot Composer] → [L3 Prompt Builder] → [Video API]
```

## 스펙 읽는 순서

1. `specs/_constitution.md` — 프로젝트 원칙
2. `specs/mvp_scope.md` — MVP 범위 + 구현 순서
3. `specs/ux_pages.md` — 페이지별 UX
4. `specs/design.md` — 디자인 시스템 (토큰·룰)
5. `specs/layers/` — 레이어별 입출력 계약
6. `specs/decisions.md` — 왜 이렇게 결정했는지

## Setup (새 머신에서 시작하기)

### Step 1: 클론 & 의존성

```bash
git clone git@github.com:anonymous-paper-review/Tale-Studio.git tale
cd tale
corepack enable && pnpm install
cp .env.example .env
```

> API 키 없이도 Mock 모드로 UI 확인 가능. 필요 시 `.env`에 키 채워 넣기.

### Step 2: 개발 서버

```bash
pnpm dev          # 개발 서버
pnpm build        # 프로덕션 빌드
pnpm lint         # ESLint
```

### Step 3: Claude Code 온보딩 (선택)

```bash
claude
```

붙여넣기:

```
이 프로젝트에 새로 투입된 개발자야. 온보딩 시켜줘.
1. CLAUDE.md 읽고 프로젝트 개요·기술 스택·파이프라인 요약
2. specs/_constitution.md + specs/mvp_scope.md 읽고 원칙·범위·구현 순서 정리
3. specs/design.md + /design 페이지로 디자인 시스템 파악
4. pnpm build 로 빌드 상태 확인
5. "현재 상태 + 바로 시작할 수 있는 작업" 브리핑
```
