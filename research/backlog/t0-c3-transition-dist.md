```yaml
id: t0-c3-transition-dist
source: .claude/vault/2026-08-10-prompt-contract-audit.md §3 재검증① · 계약 카탈로그 C3❌
tier: T0
budget: { usd: 0, runs: 1, wall_min: 30 }
blockers: []
status: done  # 2026-08-11 밤 러너 — 유보(합산 93.3%, 80~95% 사전등록 유보구간; in 97.5%/out 89.2%), 결과: research/experiments/t0-c3-transition-dist/
priority: high  # Q2(캡 완화)의 증거
```

- **가설**: v4 transition 예시 고정("cut"/"cut", v4:485 — 6종 미열거)이 실분포를 cut으로 수렴시킨다. C1 카메라 magnitude와 동일 메커니즘의 쌍둥이(카탈로그 원문 — "DB 1쿼리 검증 가능").
- **전제**: 카탈로그 C3❌(사유 없음). v4 산출은 shots로 DB 영속(V축 수명표, llm-quota vault §1-6).
- **예측**: 참이면 완료 프로젝트 shots의 transition 값 중 cut 계열 점유 ≥95%. 거짓이면 6종 분산.
- **측정**: live DB read-only — 완료 3프로젝트(G3와 같은 모집단) shots 전수의 transition 값 분포. 채점은 코드 집계, LLM 판정 없음.
- **기각 조건**: cut 계열 <80% `(제안)` → 예시 편향 가설 기각, C3 재검증 완료 처리. 80~95%는 콘텐츠 수요와 미분리 — 판정 유보로 기록.

## 좌표 (동결)

- DB: shots 테이블, 프로젝트 Sample1 `9d6efa6d-3216-40b0-8a2c-184ab56f02ec` · w260810 · Upload_test (G3 실측 203샷과 같은 모집단).
- Phase 0: transition 필드 위치 확정(shots 컬럼 vs state 원본 JSON — v4:485 산출층 기준). 측정·기각 불변.
- 선례: G3 read-only 감사 방법론(prompt-contract-audit §1) · DB 접근은 `scripts/verify-db.mjs` 계열.

## 산출 계약

- `research/experiments/t0-c3-transition-dist/{result.md, results.json}` — result.md에 실제 transition 값 분포표(원문 값 그대로).
- status 갱신 + reports 1줄 + 결과 링크를 `_MORNING.md` Q2 밤 준비물에 반영.
