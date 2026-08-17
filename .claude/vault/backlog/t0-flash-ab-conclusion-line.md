```yaml
id: t0-flash-ab-conclusion-line
source: .claude/vault/2026-08-10-flash-ab-fanout-review.md §3 잔가지 (HYPOTHESIS.md 결론 1줄 미기입)
kind: audit
budget: { usd: 0, runs: 1, wall_min: 10 }
blockers: []
status: done  # 2026-08-11 밤 러너 — 결론 1줄 기입 done(flash-model-ab/HYPOTHESIS.md 말미)
priority: normal
```

위생 티켓 (실험 아님 — 가설 폼 해당 없음).

- **작업**: `research/experiments/flash-model-ab/HYPOTHESIS.md`에 결론 1줄 추가 — 요지: "판정: 3.6-flash 채택(오너 행동, 커밋 f6d8e58로 닫힘). lite 기각의 진짜 사유는 속도·품질이 아니라 repairJson 무신호 샷 소실(rep1 2/8·rep3 3/8) — 상세는 `.claude/vault/2026-08-10-flash-ab-fanout-review.md`."
- **완료 조건**: 이미 기입돼 있으면 no-op으로 done 처리. 파일 수정만, 커밋 금지(다음 research 커밋에 편승 — vault 원문 그대로).

## 산출 계약

- 해당 파일 수정 + status 갱신 + reports 1줄.
