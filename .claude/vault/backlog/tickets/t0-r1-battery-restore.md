```yaml
id: t0-r1-battery-restore
source: .claude/vault/2026-08-10-prompt-contract-audit.md §3 (SHOT_PHYSICS R1 배터리 복구) · 카탈로그 B2🕳
kind: audit
budget: { usd: 0, runs: 1, wall_min: 60 }
blockers: []
status: done  # 2026-08-11 밤 러너 — 가설 참·복원 done(git 622e44e^ + tar 양쪽 실존, 실행은 안 함). 결과: research/experiments/r1-battery-restored/
priority: normal
```

- **가설**: SHOT_PHYSICS R1 회귀 배터리(소실)는 git 622e44e 이전 트리 또는 `~/tale-studio-backup-2026-08-05.tar.gz`에 실존하고 복원 가능하다.
- **전제**: B2 계약("값 변경 시 배터리 재실행")의 배터리가 8/5 대청소로 소실 — physics.ts 상수(2~8s·동사≤2·50~80자)가 사실상 동결 상태. previz-motion-channel §0.5의 "억제 3지층" 중 ① 물리층의 재실측 전제가 이 배터리.
- **예측**: 참이면 배터리 코드·데이터 발견 → `research/experiments/r1-battery-restored/`로 복원. 거짓이면 두 곳 모두 부재.
- **측정**: git 히스토리 수색(`622e44e^` 이전의 research/·lab/ 트리 — lab/previz-quality 계열 포함) + 백업 tar 목록 수색. **복원만, 실행 금지**(배터리에 LLM 콜이 있을 수 있음 — 실행은 별도 티켓으로 아침 심사).
- **기각 조건**: 두 곳 모두 부재 → "복원 불가" 확정 — 계약 문구 개정 안건으로 `_MORNING.md`에 카드 추가 (미결의 닫히는 조건 그대로: "복원 또는 계약 문구 개정").

## 좌표 (동결)

- git: 커밋 `622e44e`(8/5 대청소) 직전 트리. 백업: `~/tale-studio-backup-2026-08-05.tar.gz` (진실원 대청소 vault가 좌표 보증).
- 대상 계약: `src/lib/writer/pipeline/physics.ts:6-20` (SHOT_PHYSICS 전역).

## 산출 계약

- 발견 시: `research/experiments/r1-battery-restored/` + 복원 출처(커밋/tar 경로)와 실행 가능성 평가를 result.md에.
- status 갱신 + reports 1줄.
