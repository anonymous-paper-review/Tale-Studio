```yaml
id: t1-dramaturgy-procedural-probe
source: .claude/vault/2026-08-10-dramaturgy-world-derivation.md §3 (유도 깊이 × 전제 유형 — 법정물 실측)
종류: 모델실험
budget: { usd: 3, runs: 4, wall_min: 60 }  # 법정물 3회 + 재난물 브리지 1회
blockers: []
status: 완료  # 2026-08-11 밤 러너 — 가설 기각(법정 3/3/3 중앙값 3≤3). 부수 발견: 3.6-flash에서 s0.5 전면 불능 → draft t0-dramaturgy-36flash-outage. 결과: research/experiments/t1-dramaturgy-procedural-probe/ 지출 ~$0.3
priority: normal
```

- **가설**: 절차 중심 전제(메커니즘이 여러 기관·장소를 관통 — 법정/수사/의료/하이스트)에서 드라마투르그 유도 폭이 재난물(후보 3개 수렴)보다 크다.
- **전제**: 재난물 실측 — 독립 3회 모두 같은 삼각 3개로 수렴(관측 공간/묵살 공간/이후 공간). 유도는 쿼터 금지 설계라 폭은 전제 유형의 함수여야 함. 입력은 "오너의 방산비리 예시를 그대로 쓰는 게 최적 — 통찰의 원형"(vault 원문).
- **예측**: 참이면 법정물 입력에서 후보 수 중앙값 >3 (기관 관통: 법정·기업·군·브로커·조사기관…). 거짓이면 ≤3 수렴.
- **측정**: s0.5 드라마투르그 프리뷰 방식(제품 스테이지 직접 import — dramaturgy-preview 선례) × 법정물 독립 3회. 집계: 후보 수·무대 유형·3회 의미론적 안정성(재난물과 동일 프로토콜). **+ 재난물 fixture 1회 재실행** — 기본 모델이 gemini-3-flash-preview→3.6-flash로 전환(f6d8e58)됐으므로 모델 브리지 앵커(frozen anchor 브리지 — previz-verifier 리서치 ⑥ 선례). 풀런 채택률은 이 티켓 밖(후속 티켓).
- **기각 조건**: 법정물 3회 중앙값 후보 ≤3 → "유도 폭 = 전제 유형" 가설 기각 — 유도 깊이 미결을 "전제 무관 수렴"으로 재프레임해 `_MORNING.md` Q10에 보고.

## 좌표 (동결)

- 입력: 오너 원문 사슬을 브리프화 — "법정 공방이다 → 근데 20분이 넘는다 → 방산기업의 비리 얘기다 → 방산기업이 저지를 수 있는 비리가 뭐가 있지 → 거기서 필요한 무대가 뭐지" (dramaturgy vault §0.5 원문 그대로, 각색 금지). 러닝타임 20분+ 명시.
- 선례 fixture 형식: `research/experiments/dramaturgy-preview/` (클론 064631aa INTEGRATED input, 15.4s 1콜, webSearch on). 재난물 브리지 fixture = 동일 클론 입력.
- 스테이지: `src/lib/writer/pipeline/stages/s0_dramaturgy.ts` 직접 import. 좌표 기록에 실행 모델 버전 명시(재현성 3규칙).

## 산출 계약

- `research/experiments/t1-dramaturgy-procedural-probe/{result.md, results.json}` — 후보 원문 전문 인용(요약 대체 금지) + 재난물 3회 실측과의 대조표 + 브리지 결과(모델 전환 영향 유무).
- status 갱신 + reports 1줄 + Q10(producer 무명 슬롯) 증거 링크.
