# 가설 — 최종 코드 풀 파이프라인 특성화 (2026-08-10)

- **가설**: 최종 코드(v1 씬 체크포인트 + v2 병렬 decoupage + 전송 픽스)에서 17씬급 프로젝트의 풀 파이프라인은 전 단계가 완주하고, C축(Claude) 단계들도 정상 동작한다(콜 실패 0).
- **전제**: 단계별 기존 실측 — scenes 54s · v2Design 70s · sceneCinematography 47s · decoupage(병렬 4) 77s. shotCheck 는 과거 278s 실측 기록(steps.ts 주석)이 있는 대형 단계. shotDesign·dialogue 는 씬 루프 **순차**(체크포인트만 있음 — 병렬 미적용 P1 대상). C축은 `CLAUDE_API_KEY` 사용(.env.local 존재 확인).
- **예측**: 참이면 — 전 단계 완주 + Claude(C축) 콜 성공 ≥1 + 총 시간 10~25분. 거짓이면 — C축 콜 실패, 또는 파이프라인 중단.
- **측정**: 격리 클론 프로젝트(projects+characters+locations 복제)에 로컬 `runPipeline` 1회(동시 4, undici 튠 — 프로덕션과 동일 조건). `_progress.jsonl` 단계 타임스탬프 + raw LLM 콜 파일(프로바이더·모델·지연·입출력 크기)로 단계별 프로파일 산출.
- **기각 조건**: C축 콜 실패 ≥1 → "Claude 축 정상" 기각. 파이프라인 미완주 → "완주" 기각. (단계별 240s 초과 원자는 기각이 아니라 **P1 병렬 확장 대상 지정** — 이 실험은 특성화가 목적)

좌표: 입력 = run `5c5d0c96`(17씬 프로젝트)의 `state.input` 그대로 · 모델 축 = `resolveModels(input)` (실행 로그 기록) · WRITER_SCENE_CONCURRENCY=4 · 클론 프로젝트 id는 results.json 에 기록.

---

## 재실험 등록 (2026-08-10, 2-레인+v4병렬)

- **가설**: decoupage 뒤에 순차로 붙어 있던 Lane V(shotDesign→shotCheck→renderPrompts)와 Lane D(voiceProfiles→dialogue)는 데이터 의존이 없으므로, 두 레인을 동시에 돌리면 post-decoupage 구간의 wall-clock 이 두 레인 중 **긴 쪽**으로 수렴한다(합이 아니라 max).
- **전제**: 1차 실측(results.json, clone `064631aa`) — 총 543.5s · post-decoupage 순차 348.4s(shotDesign 178.5 + shotCheck 0.5 + renderPrompts 0.0 + dialogue 169.4). **1차 등록문의 "shotDesign 은 씬 순차" 전제는 오측이었다**: 같은 results.json 에서 shotDesign LLM 콜 29개 합 636.8s가 wall 178.5s 안에 들어가 실효 병렬도 3.57 — v4_shots 는 이미 워커풀(기본 4)로 돌고 있었다. 따라서 이번 회차의 시간 이득은 전적으로 2-레인 분기에서 나오고, v4 쪽 변경은 예측형 예산 게이트·씬 실패 허용(서버리스 견고성)이라 wall 에 영향이 없다. dialogue 는 실효 병렬도 1.00(설계상 씬 순차 — 품질 메커니즘이라 불변).
- **예측**: 참이면 — post-decoupage 구간 ≤190s(≈ max(178.5, 169.4)), 총 ≤420s, 완주. 샷 수·대사 라인 수는 베이스라인 동급(149샷 ±LLM 변동).
- **측정**: 같은 러너(`run.mts --out results-2lane.json`), 같은 입력·같은 좌표로 격리 클론 1회. `_progress.jsonl` 의 markStage 타임스탬프로 단계 wall 시간과 **레인 겹침**(shotDesign started~completed 구간과 dialogue started~completed 구간의 교집합 > 0)을 직접 확인. 샷 수는 shotSequence, 대사 라인 수는 `14b_dialogue.json` 의 shots[].dialogue 길이 합.
- **기각 조건**: 총 ≥500s → "2-레인이 순차 구간을 겹친다" 기각. 미완주 → 기각. 대사 씬 커버리지 결손(대사 씬 수 < 베이스라인) → 레인 분리가 dialogue 를 손상시킨 것으로 보고 기각.

좌표(재실험): 코드 = 2-레인 합성 step(`steps.ts#shotsAndDialogue`) + 로컬 러너 `Promise.all` 2레인 + v4_shots 예측형 예산 게이트/씬 실패 허용 · 입력·모델 축·WRITER_SCENE_CONCURRENCY=4 는 1차와 동일 · 출력 `results-2lane.json`(1차 `results.json` 보존).

---

## 공정 A/B 등록 (2026-08-10, 레인 병렬 vs 순차 — 같은 코드·같은 회차)

2차 실험(results-2lane.json)이 형식상 기각된 이유는 대조군이 **다른 날 다른 C축 상태**의 1차 런이었기 때문이다
(shotCheck 0.5s 죽음 ↔ 153.6s 생존 = +153.1s, scenes +46.2s → 확률 변동이 레인 이득 198.1s를 상쇄).
이번엔 같은 코드·같은 시간대에 레인 배치만 바꿔 대조한다 — 교란을 코드 게이트 하나로 좁힌다.

- **가설**: Lane V(shotDesign→shotCheck→renderPrompts)와 Lane D(voiceProfiles→dialogue)는 데이터 의존이 없으므로, 병렬 배치(A)의 총시간이 순차 배치(B)보다 **짧은 레인 하나의 벽시계만큼** 짧다. 동시에, source 기준 대사 조인 픽스로 분할이 있어도 오배치가 0이 된다.
- **전제**: 2차 실측 — 레인 겹침 168.6s 확인(같은 ms 착수), post-decoupage=max(322.2, 198.1). 이번 회차는 여기에 ① 대사 조인 픽스(source_shot_id) ② shotCheck 씬 fan-out(단일 153.6s 콜 → 씬 단위 병렬 4) 가 추가됐다. B는 `WRITER_LANES=0` 으로 레인만 순차화하고 그 외 코드 경로는 A와 동일.
- **예측**: 참이면 — ① A 총시간이 B보다 **150~200s 짧다** ② 양 런 모두 **대사 오배치 0** (최종 시퀀스의 각 샷이 문 대사의 소스 씬 == 그 샷의 scene_id). 단 `split_count > 0` 이어야 픽스가 실제로 검증된 것 — 분할 0이면 이 축은 "미검증"이지 "통과"가 아니다 ③ shotCheck 벽시계 **≤60s** ④ 양 런 완주.
- **측정**: 같은 러너·같은 입력·WRITER_SCENE_CONCURRENCY=4, 격리 클론 각 1회. A=`--out results-ab-lanes.json`(기본), B=`WRITER_LANES=0 --out results-ab-seq.json`. 수확 = 단계별 wall(`_progress.jsonl`), shotCheck 씬별 콜 시간 분포(`shotCheck_validate_*` raw), 오배치 검산(`13_c2_shotSequence.json` × `14b_dialogue.json` 재조인), split_count(`12_c2_shotCheck.json`), 샷/라인 수, 클론 id.
- **기각 조건**: A−B 차이 < 100s → "레인 분리가 순차 구간을 겹친다" 기각. 어느 런이든 오배치 > 0 → 조인 픽스 기각. shotCheck > 100s → fan-out 기각(≤60s 예측은 빗나가도 100s 초과라야 기각). 미완주 → 기각.

좌표(A/B): 코드 = 이 회차 로컬 변경 전체(조인 픽스 + shotCheck fan-out + WRITER_LANES 게이트) · A와 B는 `WRITER_LANES` 외 완전 동일 · 기존 `results.json`·`results-2lane.json` 보존.
