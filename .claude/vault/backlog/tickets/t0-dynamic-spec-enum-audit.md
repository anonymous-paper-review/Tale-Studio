```yaml
id: t0-dynamic-spec-enum-audit
source: .claude/vault/2026-08-10-prompt-contract-audit.md §3 잔가지 (dynamic_spec enum 무검증 통과)
kind: audit
budget: { usd: 0, runs: 1, wall_min: 30 }
blockers: []
status: done  # 2026-08-11 밤 러너 — 가설 참(672스펙 위반 982건·7필드 전부), Q16 카드 추가. 결과: research/experiments/t0-dynamic-spec-enum-audit/
priority: normal
```

- **가설**: v4 산출층 dynamic_spec이 enum(medium/small/shake/none) 밖 값을 무검증 통과시키고 있고, 실데이터에 밖 값이 실존한다.
- **전제**: 검증기 부재는 코드 확인됨(잔가지 원문 "무검증 통과 — 검증기 추가 여부"). 실존 여부만 미측정.
- **예측**: 참이면 완료 런에서 enum 밖 값 ≥1건. 거짓이면 0건(검증기 없어도 모델이 준수 — 검증기 불요).
- **측정**: 완료 3프로젝트 shots + 로컬 로그 3런의 v4 산출에서 dynamic_spec 값 전수 추출 → enum 대조. 코드 집계만.
- **기각 조건**: 밖 값 0건 → 검증기 추가 안건 기각(현행 유지, 잔가지 닫힘). ≥1건이면 위반 원문을 첨부해 검증기 추가 안건으로 `_MORNING.md`에 카드 추가.

## 좌표 (동결)

- DB shots + `logs/064631aa-…`·`logs/5260d92d-…`·`logs/e4da245a-…` (t0-c2와 동일 좌표, Phase 0 공유).
- enum 정의 위치: v4 산출층(`src/lib/writer/pipeline/stages/v4_shots.ts`) — Phase 0에서 enum 원문 인용해 결과에 동봉.

## 산출 계약

- `research/experiments/t0-dynamic-spec-enum-audit/{result.md, results.json}` — 값 분포 + 위반 원문(있으면).
- status 갱신 + reports 1줄.
