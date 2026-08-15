```yaml
id: t1-leadback-beat-automation
source: .claude/vault/2026-08-06-previz-verifier.md §3 (리드백 beat 대조 자동화)
종류: 모델실험
budget: { usd: 1, runs: 1, wall_min: 60 }
blockers: []
status: 막힘  # 2026-08-11 밤 러너 — 막힌 지점: (리드백 서술, beat, 수동 판정) 트리플이 로컬 디스크에 부재. collect.mjs는 <outDir> 인자 산출인데 해당 디렉토리가 repo·홈 전역 수색(find /Users/xcape)에서 미발견. vault 원문 "실행 산출은 리포트 아티팩트"(2026-08-06-previz-verifier.md:4) — 데이터가 claude.ai 아티팩트(run1 3431b72e·run2 f7f37f25) HTML에만 존재하고 티켓은 이를 "참조용"으로 규정. HTML에서 트리플 재구성은 티켓 좌표 밖 + 충실도 불확실(판정 3원칙). 해제 조건: 오너가 아티팩트→기계가독 트리플 추출을 승인하거나 원본 outDir 위치를 지정.
priority: normal
```

- **가설**: 리드백 beat 대조는 이미지 없는 대조 전용 에이전트(서술+beat만)로 자동화해도 수동 판정(✓/△/✗)과 일치한다.
- **전제**: 현재는 오케스트레이터 수동 판정. run1(에일리언 46샷)·run2(추격 22샷)의 리드백 서술과 수동 라벨이 실험 산출로 실존. 식단 분리 원칙 — 대조자는 이미지를 못 봐야 한다(판정 3원칙 ①).
- **예측**: 참이면 자동 판정-수동 라벨 일치율 ≥80% `(제안)`. 거짓이면 <80%.
- **측정**: previz-verifier 실험 산출에서 (리드백 서술, beat, 수동 판정) 트리플 로드 → 대조 전용 에이전트가 서술+beat만 보고 ✓/△/✗ 재판정(이미지 미접근) → 코드로 일치율 집계. 불일치 건은 원문 나란히 첨부.
- **기각 조건**: 일치율 <80% → 자동화 보류, 수동 유지 (vault 닫히는 조건 그대로 — "대조 전용 에이전트로 옮기고 수동 판정과 일치 확인").

## 좌표 (동결)

- 데이터: `research/experiments/previz-verifier/` — Phase 0: 리드백 서술·수동 판정 파일 위치 확정(collect.mjs 산출 계열). 리포트 아티팩트(run1 3431b72e· run2 f7f37f25)는 참조용.

## 산출 계약

- `research/experiments/t1-leadback-beat-automation/{result.md, results.json}` — 일치율 + 불일치 원문 대조.
- status 갱신 + reports 1줄. 일치 시 검증기 v0.5의 수동 축 하나가 자동화 승격 후보로 Q12 카드에 기록.
