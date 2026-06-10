---
paths:
  - "src/lib/generation-*.ts"
  - "src/lib/writer/**/*.ts"
  - "src/app/api/**/generate*/**/*.ts"
  - "src/app/api/writer/**/*.ts"
---

# AI 생성 · 비동기 잡 규칙

> 이 프로젝트의 무게중심: 서버리스(Next.js API Routes) 환경에서 fal.ai/LLM 장시간 생성을
> **submit → webhook/fetch** 비동기로 처리. 아래 패턴은 모두 코드에 확립된 컨벤션 — 새 생성 기능은 이 패턴을 따른다.

## fal 호출 (src/lib/writer/llm/fal.ts)

- **submit/fetch 분리가 기본**: `falImageSubmit()` → request_id 반환 후 즉시 응답, 결과는 webhook 또는 `falImageFetch()`. 이유: **Next.js maxDuration 타임아웃 회피**. `fal.subscribe()` 기반 `falImageGenerate()`는 레거시 — 신규 사용 금지.
- reference 이미지가 있으면 edit 모델로 자동 라우팅 (T2I→I2I). 비표준 aspect ratio는 preset 자동 정규화.
- 에러는 `falErrorDetail()`로 HTTP status + body.detail 평탄화해 전파. 모든 호출은 `recordRawCall` 로깅.

## generation_jobs 라이프사이클 (src/lib/generation-jobs.ts)

- 상태 머신: `queued → completed | failed`.
- **터미널 전이는 반드시 CAS**: `eq('status', 'queued')` 조건부 업데이트 — 늦게 도착한 webhook이 이미 끝난 잡을 덮어쓰지 못하게. 새 완료/실패 경로를 추가할 때 이 조건 누락 금지.
- `target` JSONB가 완료 시 갱신 대상(character/location/shot ID + column)을 운반 — 핸드오프 계약.
- 소유권 확인은 project→workspace.owner_id 2-hop.

## API 라우트 generate-* 표준 순서

1. `export const runtime = 'nodejs'` + `maxDuration` — **submit만 하면 60, 동기 대기 필요 시 300** (Vercel 한도)
2. zod 검증 (api-routes rule)
3. **쿼터 체크** (`src/lib/generation-quota.ts`) → 초과 시 `429 { code: 'quota_exceeded' }`. 쿼터 집계 실패 시 **fail-open** (차단하지 않음) — 이 설계 철학 유지
4. 프롬프트 빌드 → fal **submit** (+ `resolveWebhookUrl()`)
5. `generation_jobs` 행 생성 (target JSONB 포함)
6. 즉시 응답 — 완료는 webhook이 DB에 기록

## writer 백그라운드 체이닝 (src/app/api/writer/start, src/lib/writer/pipeline/steps.ts)

- `after(async () => triggerWriterStep(...))` — 응답 후 다음 step을 새 서버리스 인스턴스로 자가 체이닝.
- **인스턴스 간 메모리/파일 공유 없음** — `WriterRunState`(JSONB)가 유일한 상태 운반자. step 산출물은 state 또는 DB에만.
- webhook이 채우는 산출물(예: 캐릭터 이미지)은 state에 데이터가 아니라 **submitted 플래그만** 기록.
- `_attempt` 가드: 중도 kill 감지용.

## LLM 호출 규약

- **재시도는 `withLlmRetry`** (src/lib/writer/llm/retry.ts): transient(429/5xx/overloaded 등 regex 판별)만 지수 백오프 최대 4회. 400/401/403은 즉시 throw. 재시도 로직 자체 구현 금지.
- 프로바이더 선택은 `dispatch.ts` 축별 라우팅 (S/V/C) — 호출부에서 프로바이더 직접 분기 금지. `local` 프로바이더는 `baseUrl` 필수.
- 채팅/JSON은 `src/lib/claude.ts` (`claudeChat`/`claudeJSON` — fence 자동 제거) 재사용.

## 동시성 · 비용

- 워커 풀 동시성 기본 **4** (`concurrency` 옵션) — fal 계정 전체 풀 10을 멀티유저가 공유하므로 올리기 전 쿼터 영향 확인.
- 유저당 동시 큐 상한 `MAX_QUEUED_JOBS_PER_USER = 30` (generation-quota.ts).
- 생성 호출은 과금 — **에이전트가 자율 재생성 루프 작성 금지** (chat-proactive-copilot proposal 참조).

## 환경변수 (server-only)

- `FAL_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`는 **서버 코드에서만** 읽기. 클라이언트 노출은 `NEXT_PUBLIC_` prefix만.
- 모델 ID 문자열은 코드/문서에 복제하지 않는다 — fal.ts·dispatch.ts·video-models.ts가 진실, 문서는 루트 `CLAUDE.md` §AI만.
