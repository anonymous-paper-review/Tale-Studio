```yaml
id: t1-scene-potential-transfer
source: .claude/vault/2026-08-10-dramaturgy-world-derivation.md §3 (scene_potential → 씬 상황 전이 미측정)
kind: llm-test
budget: { usd: 2, runs: 1, wall_min: 60 }
blockers: []
status: done  # 2026-08-11 밤 러너 — 가설 참(14/14=100%, Δ+66.7%p ≥ +20%p). 결과: research/experiments/t1-scene-potential-transfer/ 지출 ~$0.05
priority: normal
```

- **가설**: 채택된 무대 후보의 scene_potential(씬 상황 제안)이 s3 scene_actions에 실제로 전이된다 — 장식이 아니라 재료다.
- **전제**: 채택률 3/3·유도 무대 씬 점유 40~44%는 실측 완료. 전이(제안 내용→씬 내용)는 미측정 — vault가 측정법까지 지정("채택 무대 위 씬의 scene_actions vs 해당 후보의 scene_potential 의미 유subagent").
- **예측**: 참이면 blind 매칭 정답률이 우연율 대비 유의하게 높다. 거짓이면 우연율 수준(무대 이름만 쓰고 상황 제안은 버린 것).
- **측정**: A/B 런 로그의 후보(scene_potential)와 채택 무대 씬(scene_actions)으로 blind 매칭 — LLM 판정자에게 scene_actions 1개 + scene_potential 목록(정답 + 타 무대 distractor, **무대명 가림**)을 주고 매칭만 지각시킴. 채점은 코드(정답률 vs 우연율). 판정 3원칙 준수 — previz-verifier B 전달률(블라인드 판독→코드 대조)과 동형.
- **기각 조건**: 매칭 정답률 − 우연율 < +20%p `(제안)` → "scene_potential은 장식" — mechanism_notes 전달 논의(Q9 관련)와 (b) 게이트 승격 논의의 반대 증거로 `_MORNING.md`에 첨부.

## 좌표 (동결)

- 데이터: `logs/e4da245a-…/01_s0_dramaturgy.json`(후보)·`05_s3_scenes.json`(씬) + `logs/5260d92d-…` 동일 쌍 (A/B 2런 — dramaturgy vault §좌표가 보증). Phase 0: 디렉토리 전체 id 확정.
- 채택 무대 목록(vault 실측): A런 hilltop_wasteland×4·tide_gauge_station·briefing_room_alpha / B런 underground_utility_tunnel×5·disaster_response_briefing_room×2·tide_gauge_station.

## 산출 계약

- `research/experiments/t1-scene-potential-transfer/{result.md, results.json}` — 매칭 시행 원문 샘플 인용 + 정답률/우연율.
- status 갱신 + reports 1줄 + Q9 카드에 증거 링크.
