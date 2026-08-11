```yaml
id: t0-d2-cut-rhythm-band
source: .claude/vault/2026-08-10-prompt-contract-audit.md §3 재검증④ · 계약 카탈로그 D2🕳
tier: T0
budget: { usd: 0, runs: 1, wall_min: 40 }
blockers: []
status: done  # 2026-08-11 밤 러너 — 가설 기각(경계 과점유 0.68×/0.55× <1.5×, 중앙 자연 분포), 결과: research/experiments/t0-d2-cut-rhythm-band/
priority: normal
```

- **가설**: D2 매체→avg_shot_seconds 허용 구간(v3:102-111 "구간 밖 금지" — 근거 #style-pacing 문서 소실)이 실분포를 구간 경계로 압박한다.
- **전제**: 카탈로그 D2🕳. 주의 — 같은 파이프라인이 만든 estimated_seconds와의 비교는 순환 참조(previz-verifier 기실측 "근거 하나도 없잖아"). 이 티켓은 옳은 리듬 판정을 하지 않는다 — 구간이 분포를 절단하는지만 본다.
- **예측**: 참이면 씬별 avg_shot_seconds가 허용 구간 경계에 몰림(경계 ±10% 구간의 점유가 균등 대비 과다). 거짓이면 구간 중앙 자연 분포.
- **측정**: 완료 런의 씬별 평균 샷 길이 히스토그램 vs v3 허용 구간 오버레이 — 코드 집계만.
- **기각 조건**: 경계 몰림 없음(균등 대비 과점유 <1.5×) `(제안)` → 구간 압박 가설 기각, D2 재검증 닫힘.

## 좌표 (동결)

- 소스: shots의 duration 필드(있으면 DB) 또는 로컬 로그 v4 산출. Phase 0: 길이 필드 위치 확정. 측정·기각 불변.
- 대상 계약: `src/lib/writer/pipeline/stages/v3_scene_plan.ts:102-111` (매체별 허용 구간 값을 result.md에 원문 인용).
- 모집단: 완료 3프로젝트 + 로컬 3런 (t0-c2와 동일 좌표).

## 산출 계약

- `research/experiments/t0-d2-cut-rhythm-band/{result.md, results.json}` — 히스토그램 수치 + 구간 경계 대입.
- status 갱신 + reports 1줄 + Q2 밤 준비물 반영.
