# t0-dynamic-spec-enum-audit — dynamic_spec enum 밖 값 실존 감사

- **날짜**: 2026-08-11 (밤 러너)
- **판정**: **가설 참** — enum 밖 값 ≥1건 조건을 압도적으로 충족 (672스펙 감사, 위반 982건, 7개 enum 필드 전부)
- **출처 티켓**: `.claude/vault/backlog/t0-dynamic-spec-enum-audit.md` ← prompt-contract-audit §3 잔가지

## 실측 — 필드별 값 분포 (원문 값 그대로, ⚠=enum 밖)

enum 정본: `src/lib/writer/types/pipeline.ts:649-687` (ShotDynamicSpec). 소스: 로컬 3런 + DB 3프로젝트
state.shotDesign + w260810 shots.dynamic_spec 교차(약 20스펙 중복 포함 — 위반 실존 판정엔 영향 없음).

| 필드 | enum 정의 | 실측 값 분포 | enum 밖 |
|---|---|---|---|
| camera_motion.type | static·pan·tilt·dolly_in·dolly_out·tracking·crane·handheld_drift·rack_focus | static 416 · handheld_drift 213 · tracking 41 · dolly_in 11 · dolly_out 8 · pan 1 · ⚠panning 1 · ⚠shake 1 | 2건 |
| camera_motion.speed | slow·medium·fast | ⚠**none 410** · slow 203 · medium 43 · fast 29 · ⚠null 5 · ⚠static 1 · ⚠normal 1 | **417건** |
| camera_motion.magnitude | minimal·moderate·large | ⚠**none 365** · minimal 246 · moderate 43 · large 11 · ⚠medium 9 · ⚠small 6 · ⚠high 3 · ⚠heavy 3 · ⚠null 5 · ⚠static 1 | **392건** |
| character_motion[].magnitude | micro·small·medium·large | small 229 · medium 106 · large 67 · ⚠minimal 53 · ⚠moderate 13 · ⚠none 3 | 69건 |
| environmental_change[].magnitude | subtle·moderate·strong | ⚠minimal 2 · ⚠small 3 — **관측값 전원 enum 밖** | 5건 |
| transition_in | cut·fade·dissolve·match_cut·pre_lap·l_cut | cut 678 · ⚠fade_in 11 · fade 1 · ⚠fade_out 1 · ⚠fade_from_black 1 | 13건 |
| transition_out | cut·fade·dissolve·match_cut·j_cut | cut 608 · ⚠fade_to_black 72 · ⚠fade_out 11 · ⚠none 1 | 84건 |

위반 전건의 좌표(어느 런/어느 샷)는 `results.json` violations 배열에 있다.

## 구조 읽기 (아침 카드용)

1. **최대 위반은 오탈자가 아니라 의미론적 공백**: static 샷에서 모델이 speed/magnitude를 `none`으로
   채우는 게 체계적 패턴(410·365건) — enum에 "해당 없음" 값이 없어서 생기는 위반. 검증기를 넣으면
   static 샷 대부분이 걸린다. 처방은 (a) enum에 none 추가 또는 speed/magnitude를 optional로,
   (b) 검증+repair 중 택일의 설계 문제.
2. transition은 t0-c3와 동일 발견(fade 계열 변형이 전부 enum 밖) — fade 계열 어휘 정리 문제.
3. character_motion magnitude는 camera쪽 어휘(minimal/moderate)가 새는 혼선 — 두 magnitude enum이
   비슷하되 달라서 모델이 섞는다.
4. environmental_change magnitude는 표본 5건 전부 밖 — 이 enum은 사실상 사문.

## 좌표

- 수집: `collect.mjs` (코드 대조만, LLM 없음) → `results.json`
- 소스: `logs/{064631aa,5260d92d,e4da245a}/11_v4_shotDesign.json` + live DB writer_runs.state.shotDesign
  (Sample1 `9d6efa6d…`·writer_test_260810 `e1a9fd08…`·Upload_test `04926a0a…`) + w260810 shots.dynamic_spec
