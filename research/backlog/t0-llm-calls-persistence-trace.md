# t0-llm-calls-persistence-trace — 작업이 죽으면 그 순간의 기록도 같이 사라지는가

```yaml
id: t0-llm-calls-persistence-trace
source: sweep:claude:62428d65
tier: T0
budget: { usd: 0, runs: 1, wall_min: 40 }
blockers: []
status: done   # 2026-08-12 밤 러너 — 가설 기각(기각 조건 발동: 예외 경로 저장 4곳 — index.ts:140 + steps.ts:652/684/746). 단 실패 런 3/3에서 스냅샷 호출수 0(사망 다수가 "예산 초과"라 담을 호출이 없음), 예산 초과 경로 저장은 0곳. 덤: llm_calls 에 run 식별자 칸 부재 → 런 귀속 불가(NA). 결과: research/experiments/t0-llm-calls-persistence-trace/
priority: normal
```

- **맥락 (사람 언어)**: 어제 사고를 파면서 오너가 정확한 질문을 했다 — "**이런 게 또 터졌을 때 뭘 기록해뒀어야 원인을 찾을 수 있나?**" 그래서 "반드시 남겨야 할 기록" 문서를 하나 만들었다. 그런데 **문서만 만들고 실제로 남기게 배선하지는 않았다.** 문제는 지금 구조에 있다 — 기록이 "한 단계가 끝날 때" 몰아서 저장되는 것으로 보이는데, 그렇다면 **단계 중간에 죽은 경우 그 단계의 기록이 통째로 안 남는다.** 하필 우리가 제일 알고 싶은 게 죽은 순간이다. 어제 사고가 정확히 그런 종류였다(중간에 시간 초과로 사망). 이게 사실인지부터 확인해야 문서를 배선할지 말지 정할 수 있다.
- **가설**: AI 호출 기록은 스테이지 완료 시점에만 저장되므로, 스테이지 도중 죽은 인보케이션의 호출 기록은 남지 않는다.
- **전제**: 문서 3/3("AI 호출 기록 표준")은 발행됐고 배선은 안 됐다는 것이 어제 세션·vault 미결 목록에 기재됨. 저장 함수(`flushRawLlm` 계열)의 존재는 코드로 확인됨. **호출 시점만 미추적.**
- **예측**: 참이면 저장 호출이 스테이지 종료 경로에만 있고, 예외·타임아웃 경로에는 저장이 없다. 거짓이면 중단 시에도 저장하는 경로가 이미 있다 — 그러면 배선은 이미 절반 돼 있고 문서화만 남는다.
- **측정**: 저장 함수의 정의와 **모든 호출 지점**을 코드로 열거하고, 각 호출 지점이 (a) 정상 완료 경로 (b) 예외 처리 경로 (c) 시간 예산 초과·중단 경로 중 어디에 있는지 분류한다. 함께: 죽은 런의 기록이 실제로 비어 있는지 DB에서 표본 확인(어제 사고 런 포함). 코드 추적 + DB 읽기, LLM 판정 없음.
- **기각 조건** (사전 등록): 중단 경로에서 저장이 호출되는 지점이 **1곳이라도** 있으면 가설 기각(부분 배선 존재) — 그 지점을 원문으로 인용한다. 저장 함수 호출 지점이 0곳이면 "기록 자체가 미배선"으로 결론(가설보다 강한 결과).

## 좌표 (동결)

- 저장 구현: `src/lib/writer/llm/archive-calls.ts`
- 호출 지점 후보: `src/lib/writer/pipeline/index.ts`, `src/lib/writer/pipeline/steps.ts`
- 로거: `src/lib/writer/logger/index.ts`
- 타입: `src/lib/writer/types/pipeline.ts`
- 시간 예산·중단 로직: `steps.ts` 의 `STEP_BUDGET` 계열 + `#shotcheck-gate` 주석(`steps.ts:201-209`)
- 사고 런(표본): 어제 세션이 부검한 시간 초과 런 — 런 ID는 vault `2026-08-10-writer-integrity-performance.md`와 `research/experiments/writer-full-run/`에서 회수

## 산출 계약

- `research/experiments/t0-llm-calls-persistence-trace/{result.md, results.json}`
- 이 티켓 status 갱신 + `research/backlog/reports/2026-08-12.md`에 1줄
