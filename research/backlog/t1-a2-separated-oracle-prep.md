```yaml
id: t1-a2-separated-oracle-prep
source: .claude/vault/2026-08-10-previz-motion-channel.md §3 대기 결정 (A2′ 재등록 — (ii) 대비 준비)
종류: 모델실험
budget: { usd: 0.5, runs: 1, wall_min: 60 }
blockers: []  # 준비 티켓 — 본실행은 owner-decision:Q1에 종속, 준비 범위는 아래에 명시
status: 완료  # 2026-08-11 밤 러너 — 준비 성공: 스모크가 육안 실측 재현(상태 SE1/SO0·상태2AFC=SE·양팔 드리프트). judge2.mts + run/results2-smoke.json. 지출 ~$0.02
priority: high  # 재개 지점(Q1) 직결
```

**준비 티켓** — 실행 범위는 오라클 작성 + 스모크 2클립까지. **30클립 풀 재판정 금지**
(계기 교정의 실행은 오너 결정 대기임이 vault에 문서화됨 — 이 티켓이 결정을 선점하면 안 된다).

- **가설**: 상태 도달(도착)과 구도 유지(프레이밍)를 분리한 오라클은 기존 judge.mts의 계기 결함(혼합 지표로 바닥 깔림 — 비정지 1/12 vs 2/12)을 해소한다.
- **전제**: A2 계기 결함 진단 완료 — "이 생성기는 상태는 따라가고 구도는 흘린다"(육안: END 팔 서랍 활짝 열림 vs 무END 팔 7초 내내 닫힘). 2AFC 11–4는 변별력 실증. 혼합 지표가 변별력을 잃는 건 previz-verifier와 같은 과(科)의 교훈.
- **예측**: 참이면 스모크에서 분리 축이 서랍 샷 육안 실측을 재현(상태 축: END 팔 > 무END 팔, 구도 축: 양팔 드리프트 검출). 거짓이면 분리해도 육안과 불일치.
- **측정**: judge2.mts 신설(상태 축·구도 축 분리 + 2AFC 주지표) → 기존 판정 입력 프레임에서 서랍 샷(sh_01_02) 양팔 2클립만 스모크. 판정 3원칙 준수(지각 LLM·채점 코드), 모델·정규화는 기존 judge.mts 좌표 승계(gemini 계열 고정, temperature 0, 768px/JPEG q82).
- **기각 조건**: 스모크가 육안 실측을 재현 못 하면 오라클 재설계(축 정의 결함) — Q1 카드에 "준비 실패" 보고.

## 좌표 (동결)

- 실험 홈: `research/experiments/previz-channel-ablation/` — 기존 judge.mts(계기 1판) · run/vframes/(판정 입력 프레임) · run/results.json(1판 원자료) · run/manifest.json.
- 스모크 대상: sh_01_02("PULLS DRAWER") START-only 팔 vs START+END 팔 각 1클립.

## 산출 계약

- `research/experiments/previz-channel-ablation/judge2.mts` + 스모크 결과를 run/에 별도 파일(1판 원자료 오염 금지 — results2-smoke.json).
- status 갱신 + reports 1줄 + `_MORNING.md` Q1에 "(ii) 선택 시 즉시 본실행 가능 / 예상 비용 ~$40" 갱신.
