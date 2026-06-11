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
- 디자인 SoT: `specs/design.md`, `specs/design-references.md`, `src/app/globals.css`

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
│   ├── stores/                 # Zustand (project, canvas, director, chat-ui 등)
│   ├── types/                  # 공유 타입
│   └── lib/                    # 유틸 + Supabase 클라이언트 + writer 파이프라인
│
├── databases/
│   ├── knowledge/              # 촬영 기법 Knowledge DB (YAML)
│   └── migrations/             # Supabase 스키마
│
└── .claude/                    # Claude Code harness (rules / hooks / skills / agents / generated cache)
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

## 로컬 webhook 테스트 (ngrok)

이미지/영상 생성은 **fal.ai 큐에 submit → 완료 시 fal이 우리 서버로 콜백(webhook)** 하는 비동기 구조다
(`/api/fal/webhook`). fal은 `localhost`로 콜백을 못 보내므로, **로컬에서 webhook을 테스트하려면 ngrok
터널로 public URL을 열어** fal이 그 주소로 콜백하게 해야 한다.

> **webhook 없이도 생성은 된다.** ngrok이 꺼져 있으면 `/api/generation-jobs/[id]` polling이 fal 큐를
> 직접 확인(reconcile)해 결과를 채운다. ngrok을 켜면 추가로 ① 완료 즉시 push(폴링 지연 없음)
> ② **사용자가 탭을 닫아도** 서버가 결과를 영속화. → "webhook 경로"를 실제로 검증할 때만 ngrok이 필요.

### 사전 준비 (1회)

1. **ngrok 설치 + 인증**
   ```bash
   # 설치 후
   ngrok config add-authtoken <your-ngrok-authtoken>
   ```
2. **고정(static) 도메인 확보** — ngrok 대시보드 → *Domains* 에서 무료 static 도메인 1개 예약
   (예: `cartwheel-construct-tinker.ngrok-free.dev`). 매번 주소가 바뀌면 아래 env와 안 맞으므로 **고정 도메인 필수**.
3. **`.env.local`에 앱 public URL 지정** — webhook 콜백 주소의 base가 된다.
   ```bash
   # 셋 중 하나 (우선순위: WEBHOOK_BASE_URL > NEXT_PUBLIC_APP_URL > VERCEL_URL)
   NEXT_PUBLIC_APP_URL=https://cartwheel-construct-tinker.ngrok-free.dev
   ```
   서버는 여기에 `/api/fal/webhook`을 붙여 fal에 전달한다.

### 실행 (터미널 2개)

```bash
# 터미널 1 — Next 개발 서버
pnpm dev                                   # http://localhost:3000

# 터미널 2 — ngrok (고정 도메인을 반드시 --url 로 지정)
ngrok http 3000 --url=https://cartwheel-construct-tinker.ngrok-free.dev
```

- `--url` 없이 `ngrok http 3000` 만 하면 **랜덤 주소**(`*.ngrok-free.app`)가 떠서 `.env.local`의
  도메인과 불일치 → 콜백이 안 온다.
- `.env.local`을 방금 수정했다면 **`pnpm dev`를 한 번 재시작**해 env를 다시 읽게 한다.

### 검증

1. **ngrok 인스펙터** 열기 → http://127.0.0.1:4040 (들어오는 요청을 눈으로 확인)
2. 브라우저에서 로그인 후 생성 트리거 — Artist 캐릭터 뷰 / World 샷, Director 스토리보드 / 비디오
3. fal 작업 완료 시(이미지 수~십수 초, 비디오 1~수 분) 인스펙터에 다음이 찍히면 정상:

| 보는 곳 | 성공 신호 |
|---|---|
| ngrok 4040 인스펙터 | `POST /api/fal/webhook` 도착 + **200** 응답 |
| Supabase `generation_jobs` | 해당 row `status = completed`, `result_url` 채워짐 |
| 브라우저 UI | 결과 표시 + **새로고침해도 유지**(서버 영속 확인) |

### 트러블슈팅

| 증상 | 원인 / 조치 |
|---|---|
| 4040에 `/api/fal/webhook`이 안 옴 | ngrok 미실행 / `--url` 누락(랜덤 주소) / `NEXT_PUBLIC_APP_URL` 불일치. 그래도 결과가 뜨면 polling reconcile fallback이 일한 것 |
| webhook이 **401** 반환 | 서명 검증 실패 — JWKS 일시 오류 또는 **서버 시계가 5분 이상 어긋남**(서명 timestamp ±5분 허용) |
| 콜백은 200인데 UI 미반영 | 브라우저 polling 미동작 — 콘솔/네트워크에서 `/api/generation-jobs/[id]` 확인 |
| env 바꿨는데 그대로 | `pnpm dev` 재시작 (Next는 부팅 시 `.env.local` 로드) |

### 프로덕션 (Vercel)

ngrok 불필요. 배포 도메인을 `WEBHOOK_BASE_URL`(또는 `NEXT_PUBLIC_APP_URL`)에 설정하거나, 미설정 시
Vercel이 주입하는 `VERCEL_URL`을 자동 사용한다. webhook 수신은 짧은 요청이라 Hobby 플랜의 함수
실행시간 제한과 무관하다.
