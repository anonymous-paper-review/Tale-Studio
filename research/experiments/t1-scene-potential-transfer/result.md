# t1-scene-potential-transfer — scene_potential → scene_actions 전이 blind 매칭

- **날짜**: 2026-08-11 (밤 러너)
- **판정**: **가설 참** — blind 매칭 14/14 = 100% vs 우연율 33.3% (Δ+66.7%p ≥ 사전 등록 문턱 +20%p).
  scene_potential은 장식이 아니라 실제로 씬에 전이되는 재료다. (이항 p ≈ 2×10⁻⁷)
- **출처 티켓**: `research/backlog/t1-scene-potential-transfer.md` ← dramaturgy-world-derivation §3

## 설계 (사전 등록 준수)

유도 무대 위 씬마다: scene_actions 원문 + scene_potential 후보 3벌(정답 무대 1 + 같은 런 타 무대 2,
**무대명 가림**, scene_id 결정론 셔플) → LLM 판정자는 매칭만 지각(강제 선택), 채점은 코드.
distractor를 같은 런으로 한정한 이유: tide_gauge_station이 양 런에 실존해 교차 풀이면 정답이 중복된다.

## 실측 — 14시행 전승

| 런 | 씬@무대 | 판정 |
|---|---|---|
| A(e4da245a) | scene_4@tide_gauge_station · scene_8@briefing_room_alpha · scene_12/13/14/15@hilltop_wasteland | 6/6 ✓ |
| B(5260d92d) | scene_5@tide_gauge_station · scene_8/10@disaster_response_briefing_room · scene_14~18@underground_utility_tunnel | 8/8 ✓ |

유도 무대 씬 수(A 6·B 8)는 vault 채택 실측(hilltop×4·tide·briefing / tunnel×5·briefing×2·tide)과 정확히 일치.
시행별 scene_actions·후보 원문·판정 사유는 `results.json` trials에 전문 보존.

## 주의 (해석 한계 — 판정 밖)

100%는 "제안 내용→씬 내용" 의미 전이와 "무대 고유 명사·설정 어휘의 표면 겹침"을 완전히 분리하진
못한다(무대명은 가렸지만 액션 서술에 설정 어휘가 남는다). 사전 등록 측정 그대로의 판정은 참이며,
더 엄격한 분리(어휘 마스킹 강화)는 후속 설계 후보로만 기록.

## 좌표

- 데이터: `logs/e4da245a…/{01_s0_dramaturgy,05_s3_scenes}.json` + `logs/5260d92d…/` 동일 쌍
- 판정 계기: `previz-channel-ablation/judge.mts` 재사용 — gemini-3-flash-preview 핀, temperature 0, 텍스트 전용
- 러너: `run.mts` (결정론 셔플 — Math.random 배제) / 지출: 텍스트 판정 14콜 ~$0.05

## Q9(극적 진단 소비처)에 주는 증거

"전이가 없으면 (a)조차 장식"의 반대편이 실증됨 — scene_potential은 실사용 재료. (b) 게이트 승격
논의에서 "재료가 실제로 흐른다"는 전제는 성립. mechanism_notes 전달 논의도 같은 방향의 근거를 얻음.
