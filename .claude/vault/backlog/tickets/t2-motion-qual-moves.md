```yaml
id: t2-motion-qual-moves
source: 오너 지시 2026-08-11 낮 ("움직임별로 돌려보기") · Q14 정성평가 1차 후속
kind: generation
budget: { usd: 12, runs: 1, wall_min: 120 }
blockers: []
status: superseded  # 2026-08-11 t2-contract-generalize로 통합 — 변인을 '참조 역할 계약 유무'로 좁혀 3시나리오 6클립으로 재설계(원 설계는 3암×3세트=$32). 원 관심사(스토리별·움직임별·연출별)는 그 티켓의 S1·S2·S3가 승계
priority: high
```

- **맥락 (사람 언어)**: 1차 정성평가의 샷은 측면 트래킹(따라가기) 하나였다. 카메라 움직임의 종류가 달라져도 — 밀고 들어가기(돌리 인), 고개 돌리기(팬) — 블록아웃 영상이 그 움직임을 끌고 가는지 보고 싶다는 오너 지시.
- **작업 (정성 수집 — 판정 금지)**: ti2v-camera-cap-recheck 픽스처 2샷 — sh_01_02(발견 인서트, dolly_in 5s)·sh_02_05(설정 와이드, pan 5s) — 각각 3암 × 1회 = 6클립. Seedance 720p 통일, 동결 프롬프트는 그 실험 T1 티어 재사용. 샷별 블록아웃 신작(돌리 인 = 카메라 전진, 팬 = 카메라 회전 — 선례 py의 카메라부만 교체).
- **기각 조건**: 해당 없음(정성 수집).

## 좌표 (동결)

- 픽스처·동결 프롬프트: `research/experiments/ti2v-camera-cap-recheck/`(provenance.json·manifest — T1 티어) · START/END는 로컬 assets/ 재업로드 선례(qualitative-run.mts).
- 블록아웃 선례: `previz-video-reference-ab/blockout_sh_04_16.py`.

## 산출 계약

- `research/experiments/previz-video-reference-ab/qual-moves/` — 클립 6 + 프리뷰 + 블록아웃 2 + manifest.json + notes.md + inputs/.
- status 갱신 + reports 1줄.
