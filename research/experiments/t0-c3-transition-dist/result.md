# t0-c3-transition-dist — v4 transition 예시 고정 실측

- **날짜**: 2026-08-11 (밤 러너)
- **판정**: **유보** — 사전 등록 유보 구간(80~95%) 적중. cut 합산 점유 93.3% (기각 조건 <80% 미발동, 참 조건 ≥95% 미달)
- **출처 티켓**: `.claude/vault/backlog/t0-c3-transition-dist.md` ← prompt-contract-audit §3 재검증① (카탈로그 C3❌)

## 가설과 결과

가설: v4 transition 예시 고정(`"transition_in": "cut"` / `"transition_out": "cut"`, v4_shots.ts:485-486)이
실분포를 cut으로 수렴시킨다. 사전 등록 기준 — ≥95% 참 / <80% 기각 / 80~95%는 "콘텐츠 수요와 미분리, 판정 유보".

**실측 (완료 3프로젝트 203샷 — G3와 동일 모집단):**

| 축 | cut | fade 계열 | none | cut 점유 |
|---|---|---|---|---|
| transition_in | 198 | fade_in 4 + fade_from_black 1 | 0 | **97.5%** |
| transition_out | 181 | fade_to_black 14 + fade_out 7 | 1 | **89.2%** |
| 합산 (406필드) | 379 | 26 | 1 | **93.3%** |

- Sample1(113샷): in — cut 108·fade_in 4·fade_from_black 1 / out — cut 97·fade_to_black 10·fade_out 5·none 1
- writer_test_260810(20샷): in — cut 20 / out — cut 18·fade_to_black 1·fade_out 1
- Upload_test(70샷): in — cut 70 / out — cut 66·fade_to_black 3·fade_out 1

축별로 보면 in축(97.5%)은 참 문턱 위, out축(89.2%)은 유보 구간 — 합산 93.3%는 유보 구간이다.
비-cut 값이 전부 fade 계열(주로 out축)인 점은 "씬 경계 수요"로 읽히나, 이는 해석이며 판정 밖.

## 부수 관측 — transition 값의 enum 밖 통과 (신규 사실)

타입 enum은 `transition_in: 'cut'|'fade'|'dissolve'|'match_cut'|'pre_lap'|'l_cut'` ·
`transition_out: 'cut'|'fade'|'dissolve'|'match_cut'|'j_cut'` (types/pipeline.ts:682-683)인데,
실측된 비-cut 값 **27건 전부가 enum 밖이다**: `fade_in`(4)·`fade_from_black`(1)·`fade_to_black`(14)·`fade_out`(7)·`none`(1).
enum 안의 `fade`·`dissolve`·`match_cut`·`pre_lap`·`l_cut`·`j_cut`은 사용 0건.
→ dynamic_spec enum 무검증 통과(t0-dynamic-spec-enum-audit와 같은 과)의 transition판 실증.

## 좌표

- Phase 0 확정: transition은 shots 테이블 컬럼에 **없음**. 위치 = `writer_runs.state.shotDesign[].dynamic_spec.transition_{in,out}` (v4 산출층).
  writer_test_260810만 shots.dynamic_spec에도 중복 영속(신 persist 경로) — 교차 확인 일치(cut 20/20 in, 18/20 out; 3샷은 dynamic_spec null).
- 모집단: Sample1 `9d6efa6d-3216-40b0-8a2c-184ab56f02ec` · writer_test_260810 `e1a9fd08…`(티켓 표기 "w260810"의 실제 title) · Upload_test `04926a0a…`
- 수집: `collect.mjs` (live DB read-only, 코드 집계만) → `results.json`
- 대상 계약: `src/lib/writer/pipeline/stages/v4_shots.ts:485-486`

## Q2(캡 완화)에 주는 함의

C2(mounting)는 기각된 반면 C3(transition)는 유보-상방(93.3%, in축 단독 97.5%) — 예시 편향의 실증 강도가 축마다 다르다.
"예시가 분포를 누른다"를 일괄 전제로 동반 수정 범위를 정하기보다 축별 실측을 근거로 삼을 것.
