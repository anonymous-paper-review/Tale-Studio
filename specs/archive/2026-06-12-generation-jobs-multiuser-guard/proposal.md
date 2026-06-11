---
change: generation-jobs-multiuser-guard
status: active
created: 2026-06-11
decisions: [51]
---

# Generation Jobs Multiuser Guard

## Why

Tale Studio는 현재 **Async MVP -> Multi-user transition** 단계다. 이미지/영상 생성은
`generation_jobs` + webhook/polling으로 비동기 회수되지만, fal.ai 계정의 concurrent limit
20개를 여러 유저가 공유한다. 아직 결제/플랜/worker 운영은 없으므로 full dispatcher는 이르지만,
유저 테스트 전에 한 유저나 background prewarm이 공유 풀을 과점하지 않도록 보수적인 안전장치와
관측 필드를 먼저 둔다.

## Decision

- **지금 하지 않음**: full dispatcher/fair queue/worker pool.
- **지금 함**: per-screen/per-stage submit concurrency를 2로 낮추고, 유저별 queued cap을 8로 낮춘다.
- **지금 함**: `generation_jobs`에 runtime metadata를 추가한다.
  - `user_id`, `workspace_id`
  - `provider`, `input_snapshot`
  - `submitted_at`, `completed_at`
  - `attempts`, `last_error`
- **상태 의미 고정**: 현재 `status='queued'`는 앱 내부 대기열이 아니라 **provider에 이미 submit된 in-flight job**이다.
  dispatcher 도입 전까지 `request_id`는 NOT NULL 유지.
- **향후 dispatcher 트리거**: 수동 생성이 background 작업에 밀리거나, 동시 유저 테스트에서 대기시간이 크게 튀거나,
  취소/우선순위/플랜별 제한이 요구되면 `pending_submit` 상태와 dispatcher를 별도 change로 도입한다.

## Field / Layer Test

| Question | Answer |
|---|---|
| 이 필드/레이어가 없으면 현재 business rule을 지킬 수 없는가? | `user_id/workspace_id`가 없으면 유저별 quota가 2-hop 추론에 의존한다. `input_snapshot/submitted_at`이 없으면 실패·지연 진단이 어렵다. |
| 현재 product maturity에 정합한가? | 정합. Async MVP에서 Multi-user로 넘어가는 단계의 최소 관측/보호 필드다. |
| 기존 source of truth를 둘로 나누지 않는가? | `generation_jobs`를 생성 작업의 활동 로그/상태 진실로 강화한다. 별도 이벤트 테이블은 만들지 않는다. |
| 완료/실패/재시도/중복 요청 때 상태 전이가 명확한가? | 현 단계는 `queued -> completed/failed` CAS를 유지한다. submit 전 큐 상태는 이번 non-goal이다. |
| 운영자가 장애를 진단할 최소 정보가 남는가? | provider, input_snapshot, submitted/completed timestamp, attempts, last_error를 남긴다. |

## Impact

- Affected docs: `CLAUDE.md`, `src/app/api/CLAUDE.md`, `src/lib/CLAUDE.md`
- Affected code: `src/lib/generation-jobs.ts`, `src/lib/generation-quota.ts`, generation API routes
- Affected stores: `src/stores/artist-store.ts`, `src/stores/director-store.ts`
- Affected DB: `databases/migrations/016_generation_jobs_runtime_metadata.sql`

## Non-goals

- Billing ledger, plan tiers, cost_usd 정산.
- Provider failover.
- Worker autoscaling.
- Full dispatcher/fair queue.
- `request_id` nullable화 또는 `pending_submit` 상태 도입.

## Verification Gate

- `tsc --noEmit` clean.
- 변경 파일 eslint clean.
- 라이브 검증 전 선행 조건: Supabase에 `015_generation_jobs_actor.sql`과
  `016_generation_jobs_runtime_metadata.sql` 적용.
- 유저 테스트 관찰 항목:
  - fal dashboard active가 20에 자주 붙는지.
  - 수동 생성이 writer/artist background 작업에 밀리는지.
  - 유저별 queued cap 8이 너무 빡빡하거나 너무 느슨한지.
