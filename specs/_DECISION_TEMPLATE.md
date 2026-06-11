# Decision Template

> 제품/아키텍처/DB 필드/레이어 분리처럼 반복될 의사결정에 쓰는 **게이트** (기록 양식 아님).
> 채운 내용은 작업 메모리 — 별도 문서로 보존하지 않는다. 영속은 기존 채널만:
> `specs/changes/<name>/proposal.md`의 한 섹션으로 복사하거나, cross-cutting 결정이면
> `specs/decisions.md`에 append할 때 요약본으로 압축한다.
> 이 템플릿 본문 자체는 엣지케이스/예시 발견 시 다듬는다 (판례 축적이 아니라 법조문 개정).

---

## Decision: <short title>

### Product Maturity

현재 변경이 어느 단계의 복잡도에 대응하는지 하나를 고른다.

| Stage | 판단 기준 |
|---|---|
| Prototype | 화면/로컬 상태로 충분하다. 실패해도 수동 재시도하면 된다. |
| Single-user MVP | DB 영속은 필요하지만, 공정성/쿼터/백그라운드 실행은 아직 핵심이 아니다. |
| Async MVP | 작업이 오래 걸리며, 탭을 닫아도 추적/회수되어야 한다. webhook/polling/상태 추적이 필요하다. |
| Async -> Multi-user Transition | 공유 provider limit, 유저별 과점 방지, 우선순위, 중복 submit 방지가 제품 리스크가 되기 시작했다. |
| Multi-user Product | 전역/유저별 quota, fair scheduling, priority, retry/cancel 정책이 코드로 강제되어야 한다. |
| Business-grade | 비용 귀속, 감사 로그, 관리자 조작, billing/reporting이 필요하다. |
| Scale/Ops | worker pool, backpressure, provider failover, metrics/alerting이 필요하다. |

Selected stage (관측된 근거 필수 — 성숙도는 야심이 아니라 관측으로 정한다):

```txt
<stage> — 근거: <관측 사실. 예: FAL_KEY 공유 풀에 유저 2명 이상 동시 제출 관측>
```

### Business Rule

이 변경이 지키려는 제품 규칙을 한 문장으로 쓴다.

```txt
<예: 한 유저가 공유 fal.ai 동시 실행 슬롯을 과도하게 독점하면 안 된다.>
```

### Invariant

코드/DB가 항상 보장해야 하는 조건을 검증 가능한 형태로 쓴다.

```txt
<예: 유저별 queued/running generation job 수를 정확하게 계산할 수 있어야 한다.>
```

### Current Gap

현재 구조로는 위 invariant를 왜 보장하지 못하는지 쓴다.

```txt
<예: generation_jobs에 user_id가 없어 workspace -> project -> jobs 2-hop 집계가 필요하고, dispatcher가 유저별 active slot을 판단하기 어렵다.>
```

### Decision

무엇을 바꿀지 명확하게 쓴다.

```txt
<예: generation_jobs에 user_id, workspace_id, provider, status 세분화 필드를 추가한다.>
```

### Why Now

이 복잡도를 지금 도입해야 하는 이유를 쓴다. "나중에 유용할 수도 있음"은 이유가 아니다.

```txt
<예: fal.ai 계정 전체 concurrent limit 20을 여러 유저가 공유하기 시작했고, 현재 per-client concurrency만으로는 전역 공정성을 보장할 수 없다.>
```

### Alternatives Considered

| Alternative | Decision | Reason |
|---|---|---|
| Do nothing | rejected | <왜 현재 구조가 부족한지> |
| Smaller change | accepted/rejected | <임시 조치가 충분한지> |
| Larger design | accepted/rejected/deferred | <지금 단계에 과한지> |

### Field / Layer Test

필드나 레이어를 추가할 때는 아래 질문을 통과해야 한다.

| Question | Answer |
|---|---|
| 이 필드/레이어가 없으면 현재 business rule을 지킬 수 없는가? | <yes/no + 근거> |
| 현재 product maturity에 정합한가? | <yes/no + 근거> |
| 기존 source of truth를 둘로 나누지 않는가? | <yes/no + 근거> |
| 완료/실패/재시도/중복 요청 때 상태 전이가 명확한가? | <yes/no + 근거> |
| 운영자가 장애를 진단할 최소 정보가 남는가? | <yes/no + 근거> |

### Data / State Ownership

| State | Source of Truth | Writers | Readers |
|---|---|---|---|
| <state name> | <table/file/store> | <who can mutate> | <who consumes> |

### Non-goals

이번 결정에서 하지 않는 것을 명시한다.

- <예: billing ledger는 만들지 않는다.>
- <예: provider failover는 만들지 않는다.>
- <예: autoscaling worker pool은 만들지 않는다.>

### Rollout / Migration

- DB migration:
- Backfill:
- Code compatibility:
- Verification:
- Rollback:

### Final Recommendation

```txt
<adopt / defer / reject + 한 문장 근거>
```
