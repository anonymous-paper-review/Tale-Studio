```yaml
id: t0-d3-shortform-camera
source: .claude/vault/2026-08-10-prompt-contract-audit.md §3 재검증③ · 계약 카탈로그 D3❌
종류: 조사
budget: { usd: 0, runs: 1, wall_min: 40 }
blockers: []
status: 완료  # 2026-08-11 밤 러너 — 측정 불가·모집단 부재(전 26런 compact=false, D3는 미실행 잠재 계약), 결과: research/experiments/t0-d3-shortform-camera/
priority: high  # Q2(캡 완화)의 증거
```

- **가설**: D3 Compact 숏폼 게이팅("static or drift 위주", v4:304-312)이 숏폼의 카메라 분포를 장편보다 더 정적으로 누른다.
- **전제**: 카탈로그 D3❌. 장편 기준선은 G3 실측 보유 — 뷰 경계 횡단 무빙(pan/track/dolly/crane × moderate+) Sample1 3~4%, w260810 5%, Upload_test 1.4%.
- **예측**: 참이면 숏폼 프로젝트의 무빙 비율이 장편 기준선 대비 유의하게 낮다. 거짓이면 동급.
- **측정**: DB에서 숏폼(Compact) 매체 프로젝트 식별 → G3 방법론 그대로 카메라 분포 재적용, 장편 3프로젝트와 대조. handheld_drift는 정지로 집계(통계 착시 규칙 — motion-contract가 `isStatic: true` 컴파일하는 실측).
- **기각 조건**: 숏폼-장편 무빙 비율 차 ±5%p 이내 `(제안)` → D3 영향 미미로 기각, 재검증 우선순위 하락 기록.

## 좌표 (동결)

- Phase 0: 숏폼 프로젝트 목록 확정(projects의 매체/포맷 필드 — Compact 프리셋 사용 프로젝트). 완료 상태 + 샷 수 ≥10 만 포함. 측정·기각 불변.
- G3 방법론·기준선: prompt-contract-audit §1 (203샷 실측). 대상 계약: `src/lib/writer/pipeline/stages/v4_shots.ts:304-312`.

## 산출 계약

- `research/experiments/t0-d3-shortform-camera/{result.md, results.json}` — 프로젝트별 분포 대조표.
- status 갱신 + reports 1줄 + Q2 밤 준비물 반영. 숏폼 완료 프로젝트가 0개면 "측정 불가 — 모집단 부재"로 done 처리(그것도 답).
