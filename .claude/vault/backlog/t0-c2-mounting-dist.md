```yaml
id: t0-c2-mounting-dist
source: .claude/vault/2026-08-10-prompt-contract-audit.md §3 재검증② · 계약 카탈로그 C2❌
kind: audit
budget: { usd: 0, runs: 1, wall_min: 40 }
blockers: []
status: done  # 2026-08-11 밤 러너 — 가설 기각(handheld 32%<60%), 결과: research/experiments/t0-c2-mounting-dist/
priority: high  # Q2(캡 완화)의 증거
```

- **가설**: v3 mounting 단일 예시("handheld", v3:149 — enum 5종 미열거, steadicam/mixed 사용 경로 부재)가 실분포를 handheld 계열로 수렴시킨다.
- **전제**: 카탈로그 C2❌. v3 산출은 DB 미영속(V축 수명표) — 소스는 로컬 완료 런 로그. D1(mounting×energy 3조합 게이팅)과 연쇄.
- **예측**: 참이면 씬별 mounting 값 중 handheld 계열 점유 ≥80% `(제안)`. 거짓이면 5종 분산.
- **측정**: 로컬 완료 런 로그의 v3 스테이지 산출(씬별 mounting) 전수 집계 + shots에 camera/mounting 파생 필드가 있으면 교차. 코드 집계만.
- **기각 조건**: handheld 계열 <60% `(제안)` → 예시 편향 가설 기각. D1 연쇄는 해석 메모로만 기록, 판정에 불포함.

## 좌표 (동결)

- 로그: `logs/064631aa-f6b2-4f7c-800b-66b0517a2769`(17씬) · `logs/5260d92d-…`(18씬) · `logs/e4da245a-…`(15씬) — 뒤 2개는 디렉토리 목록에서 전체 id 확정(Phase 0).
- Phase 0: v3 스테이지 파일명 확정(`NN_v3_*.json` 패턴) + shots 쪽 mounting 파생 필드 유무 확인. 측정·기각 불변.
- 대상 계약: `src/lib/writer/pipeline/stages/v3_scene_plan.ts:149`.

## 산출 계약

- `research/experiments/t0-c2-mounting-dist/{result.md, results.json}` — mounting 값 원문 분포표.
- status 갱신 + reports 1줄 + Q2 밤 준비물 반영.
