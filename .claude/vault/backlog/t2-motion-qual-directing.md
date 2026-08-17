```yaml
id: t2-motion-qual-directing
source: 오너 지시 2026-08-11 낮 ("연출별로 돌려보기") · Q14 정성평가 1차 후속
kind: generation
budget: { usd: 12, runs: 1, wall_min: 120 }
blockers: []
status: superseded  # 2026-08-11 t2-contract-generalize로 통합 — 변인을 '참조 역할 계약 유무'로 좁혀 3시나리오 6클립으로 재설계(원 설계는 3암×3세트=$32). 원 관심사(스토리별·움직임별·연출별)는 그 티켓의 S1·S2·S3가 승계
priority: normal
```

- **맥락 (사람 언어)**: 블록아웃 영상은 "움직여라"를 잘 끄는 것 같은데, 반대 방향의 연출 — 가만히 있어야 하는 샷, 동작이 두 개 연달아 있는 샷 — 에서도 도움이 되는지, 오히려 해가 되는지(불필요한 움직임 유발, 두 동작 순서 붕괴)를 보고 싶다는 오너 지시의 연출 축.
- **작업 (정성 수집 — 판정 금지)**: Sample1 픽스처 2샷 — sh_02_10(정지 유지, STATIC HOLD 실판독)·sh_01_09(2동작: 촬영 후 정지) — 각각 3암 × 1회 = 6클립. Seedance 720p 통일. 블록아웃: 정지 샷 = 고정 카메라(미세 흔들림 없음), 2동작 샷 = 동작 두 phase를 시간 축에 순서대로.
- **기각 조건**: 해당 없음(정성 수집). 특히 볼 것: 정지 샷 (c)암에서 블록아웃이 정지를 지키게 하는가 vs 움직임을 유발하는가 — LOCKED 준수 논의(Q3)의 인접 증거.

## 좌표 (동결)

- 픽스처: `previz-channel-ablation/run/fixtures.json`·`run/label_scan.json`·`run/manifest.json`(두 샷의 A2 payload — 동결 프롬프트 재사용).
- 블록아웃 선례: `blockout_sh_04_16.py`.

## 산출 계약

- `research/experiments/previz-video-reference-ab/qual-directing/` — 클립 6 + 프리뷰 + 블록아웃 2 + manifest.json + notes.md + inputs/.
- status 갱신 + reports 1줄.
