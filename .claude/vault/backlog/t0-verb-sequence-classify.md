```yaml
id: t0-verb-sequence-classify
source: 2026-08-11 낮 세션 실측 (v4 산출 16런 전수 — 동사 문자열 917개 중 복합 표현 67개=7%) · 오너 질문 "writer에 순서를 넣을 수 있나"
kind: audit
budget: { usd: 0, runs: 1, wall_min: 40 }
blockers: []
status: done  # 2026-08-12 밤 러너 — 유보(순차 67.8% = 사전 등록 50~70% 구간). 기각도 승격도 아님. 코퍼스 확대됨(26파일/동사1956/복합90). 단서: 분류기가 unknown을 0건 써서 순차 쪽 과대 가능 — 처방은 "표본 확대"가 아니라 "분류 방식 개선". 지출 모델 1콜(~$0.02). 결과: research/experiments/t0-verb-sequence-classify/
priority: normal
```

- **맥락 (사람 언어)**: 샷 설계가 인물의 동작을 적을 때 "스위치를 누르고 나간다"처럼 **동작 두 개를 한 문자열에 압축**하는 경우가 전체 동사의 7%(67건) 있다. 그런데 영상 발주 문장을 만드는 컴파일러에는 순서라는 개념이 없어서, 이 두 동작을 "7초 전체에 고르게 퍼뜨려 마지막 프레임까지 완료하라"로 넘긴다. 문제는 이 67건이 **정말 순차인지**(먼저 A 다음 B) **동시인지**(끌어안고 흐느낀다 = 한 몸짓) 구분이 안 된다는 것. 순차가 많으면 상류에 순서 개념을 넣을 근거가 되고, 동시가 많으면 지금 그대로 두는 게 맞다. 이 분류 하나가 그 결정을 가른다.
- **가설**: 복합 동사 67건의 과반은 순차(sequential)다 — 그렇다면 계약문에 순서 표현이 없는 것이 실질 손실이다.
- **전제**: ① 카메라는 샷당 1개라 순서 문제 없음(스키마 확인) ② 컴파일러는 동작들을 `;`로 나열하고 "전 구간 고르게"를 덧붙임(motion-contract.ts) ③ 검수 실측(2026-08-10)에서 분할 제안 13건이 전부 "순차 액션 2~3개 압축"이었음 — 정본 처방은 샷 분할이고 이 67건은 분할 안 된 잔여 ④ 샷 물리 규칙이 동사 2개까지 허용.
- **예측**: 참이면 순차 ≥50%. 거짓이면 동시가 지배적이라 현행 유지가 정당.
- **측정**: 로컬 완료 런 16개의 v4 산출에서 복합 동사 67건을 전수 추출 → 각각을 **순차 / 동시 / 판단 불가**로 분류. 분류자는 사람 언어 판단이라 LLM 1콜 가능하나 **채점은 코드**(분류 결과를 세는 것만), 판단 불가는 NA로 남긴다. 샷 컨텍스트(같은 샷의 액션 서술·씬 상황)를 함께 제시해 오분류를 줄인다.
- **기각 조건**: 순차 <50% → "순서 공백은 실질 손실이 아님" — 현행 유지 확정, 상류 필드 추가 안건 폐기. 50~70%는 유보(샘플 확대). ≥70%면 상류 필드(`sequence` 플래그 또는 steps 배열) 안건을 `_MORNING.md` 카드로 승격.

## 좌표 (동결)

- 데이터: `logs/*/11_v4_shotDesign.json` (16파일, 샷 735개·동사 문자열 917개). 복합 판별 정규식: `\b(then|after|before)\b`, ` and `, `,`.
- 컴파일러: `src/lib/director/motion-contract.ts` `subjectClauses`(나열은 `; `)·`compileMotionContract`(pace 문장).
- 스키마: `src/lib/writer/types/*.ts` `ShotDynamicSpec.character_motion` = `{character_id, verb, magnitude}[]` (인물별 슬롯이지 동작 단계 슬롯이 아님).
- 실측 표본 예: `flips switch and exits` · `bows then grasps` · `enters and lunges` · `clutches and sobs`(동시로 보이는 예) · `stirs and lifts head`.

## 산출 계약

- `research/experiments/t0-verb-sequence-classify/{result.md, results.json}` — 67건 전건 목록 + 분류 + 비율, 판단 불가는 사유와 함께.
- status 갱신 + reports 1줄. 기각 조건 대입 결과 명시.
