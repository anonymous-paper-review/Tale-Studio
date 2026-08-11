```yaml
id: t2-motion-qual-stories
source: 오너 지시 2026-08-11 낮 ("여러 버전으로 실험해보고싶음 — 다른 스토리도 차용해서 똑같이 돌려주고") · Q14 정성평가 1차 후속
tier: T2
budget: { usd: 8, runs: 1, wall_min: 90 }
blockers: []
status: superseded  # 2026-08-11 t2-contract-generalize로 통합 — 변인을 '참조 역할 계약 유무'로 좁혀 3시나리오 6클립으로 재설계(원 설계는 3암×3세트=$32). 원 관심사(스토리별·움직임별·연출별)는 그 티켓의 S1·S2·S3가 승계 — 지시 원문이 승인 근거
priority: high
```

- **맥락 (사람 언어)**: 움직임 전달 3방식(텍스트만 / +끝그림 / +블록아웃 영상) 비교를 지금까지 질주 샷 하나로만 봤다. 이야기가 달라져도 — 다른 세계, 다른 소재 — 같은 경향("블록아웃이 카메라 방향을 끝까지 끈다")이 나오는지 확인하고 싶다는 오너 지시.
- **작업 (정성 수집 — 판정·점수 금지)**: Sample1 프로젝트(`9d6efa6d`)에서 이동/질주 계열 샷 1개 선정(러프 DIRECTION 실판독 기준 — label_scan) × 3암 × 1회. 모델 Seedance 2.0 720p 통일, 텍스트 프롬프트는 세 암 동일(제품 buildVideoPrompt 산출 동결, 전문 보존). 샷 전용 블록아웃 신작.
- **기각 조건**: 해당 없음(정성 수집) — 실패 암은 실패 그대로 기록.

## 좌표 (동결)

- 픽스처: `research/experiments/previz-channel-ablation/run/fixtures.json`(리얼 스트립 크롭 URL)·`run/label_scan.json`(83샷 실판독 — 이동 계열에서 선정).
- 실행 선례: `research/experiments/previz-video-reference-ab/qualitative-run.mts`(제품 lib 직접 import) · 블록아웃 선례 `blockout_sh_04_16.py`.
- 프롬프트: previz-channel-ablation `run/manifest.json`의 해당 샷 payload 재사용 우선, 없으면 제품 buildVideoPrompt로 생성 후 전문 동결.

## 산출 계약

- `research/experiments/previz-video-reference-ab/qual-stories/` — 클립 3 + 480p 프리뷰 + blockout(+프리뷰) + manifest.json(payload 전문·비용) + notes.md(암별 관찰 3줄) + inputs/.
- status 갱신 + reports 1줄. 갤러리 조립은 낮 세션 몫.
