# t0-dialogue-join-canary — 대사 오배치 지혈이 실사용 런에서 확인됐는가

```yaml
id: t0-dialogue-join-canary
source: sweep:claude:62428d65   # 스위퍼 분해 — 사람 심사 미경유
종류: 조사
budget: { usd: 0, runs: 1, wall_min: 40 }
blockers: []
status: 완료  # 2026-08-12 밤 러너 — 가설 유지(픽스 이후 런 3건 중 분할 2건, 불일치 라인 0 / 저장 대조도 0). 기각 조건 미발동. 모집단은 전부 개발용 프로젝트라 사거리 제한 명시. 결과: research/experiments/t0-dialogue-join-canary/
priority: high
```

- **맥락 (사람 언어)**: 어제 큰 사고가 하나 드러났다. **대사가 엉뚱한 장면에 붙는 문제**가 7월 23일부터 쭉 이어져, 다시 살펴본 22개 작업물 중 18개가 오염돼 있었다. 원인은 찾았고 고쳐서 올렸다("배포하면 그 순간부터 신규 작업물의 오염이 멈춘다"). 그런데 **고친 뒤에 진짜로 멈췄는지는 실제 사용 기록으로 확인한 적이 없다.** 확인한 건 개발자 컴퓨터에서 돌린 두 번뿐이다. 이게 안 멈췄으면 지금 이 순간에도 새 작업물이 같은 병에 걸리고 있는 것이고, 멈췄으면 남은 일은 과거 18건 복구뿐이라 문제의 크기가 완전히 달라진다.
- **가설**: 대사 조인 픽스(`789a71f`) 이후 생성된 실사용 런에서는 대사 오배치가 0건이다.
- **전제**: 픽스는 커밋·푸시 완료(`789a71f`, main↔origin 동기, main 자동배포)라 배포 자체는 닫혔다 — 스위프에서 대조 확인. 남은 건 실사용 결과뿐. vault `2026-08-10-writer-integrity-performance.md`의 "오염 감사 18/22"가 픽스 이전 기준선이다.
- **예측**: 참이면 `789a71f` 이후 런에서 분할 샷(`split`>0)의 대사 라인이 전부 자기 `source_shot_id`와 일치한다. 거짓이면 픽스 이후 런에도 불일치 라인이 남아 있다 — 그 경우 지혈이 안 된 것이므로 즉시 표면화해야 한다.
- **측정**: Supabase에서 `789a71f` 커밋 시각 이후 생성된 writer 런을 뽑아, 분할이 발생한 샷의 대사 라인마다 `source_shot_id`가 실제 소속 샷과 일치하는지 **코드로 집계**한다(LLM 판정 없음 — 문자열 동일성 비교). 산출: 픽스 이후 런 수 / 분할 발생 런 수 / 불일치 라인 수. 기준선(픽스 이전 18/22)과 나란히 놓는다.
- **기각 조건** (사전 등록): 픽스 이후 런에서 **불일치 라인이 1건이라도 나오면 가설 기각** — 지혈 실패로 판정하고 결과에 해당 런 ID와 라인을 원문으로 남긴다. 픽스 이후 런이 **0건**이면 "측정 불가·모집단 부재"로 종료한다(가설 유지도 기각도 아님 — `t0-d3-shortform-camera` 선례).

## 좌표 (동결)

- 조인 로직: `src/lib/writer/pipeline/util/dialogue_join.ts` (`source_shot_id` 정본)
- 영속화: `src/lib/writer/pipeline/util/persist_manifest.ts`
- 픽스 커밋: `789a71f feat(writer): 2-레인 분기·드라마투르그 s0.5·E8 아크 배선·대사 조인 픽스 (#2lane #dramaturgy #dialogue-join)` — 시각은 `git log -1 --format=%ad 789a71f`로 확정
- DB 접근 선례(그대로 재사용): `research/experiments/t0-dynamic-spec-enum-audit/collect.mjs` — `.env.local`에서 `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` 로드
- 대사 위치: `writer_runs.state` 및 `shots` — 정확한 필드는 Phase 0으로 `collect.mjs` 패턴 따라 확인 후 고정

## 산출 계약

- `research/experiments/t0-dialogue-join-canary/{result.md, results.json}`
- 이 티켓 status 갱신 + `research/backlog/reports/2026-08-12.md`에 1줄(발동한 기각 조건 포함)
