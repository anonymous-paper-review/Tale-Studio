# 결과: 전 레이어 출력 언어 무침범 — 확증 (2026-08-19)

가설(HYPOTHESIS.md 사전 등록) **채택**: 같은 한국어 시드(편의점 스토리 + 한국어 캐스트 수민·노인)로
writer 텍스트 파이프라인 13레이어를 outputLocale en/ko 두 번 실제 구동(총 377초, 제품 코드 무수정) —
**양 로케일 전 레이어에서 언어 침범 0.**

- EN 런: 판정 레이어 유저 노출 자유서술 한글 0 (시드 재료 통과 21건과 고유명사 수민·노인 보존은
  침범 아님으로 분류). 한국어 시드가 영어 산출을 끌어당기지 않음 — 강제가 시드보다 세다.
- KO 런: 전 판정 레이어 한국어. 초기 플래그 3종은 전부 원본 대조로 설계 동작 확인:
  ① decoupage `beat_summary` 영어 = **EN base + `_native` 쌍둥이 설계**(native 는 정확히 한국어)
  ② C2(shotCheck) S필드·검수 message/suggestion 한국어 = 로케일 추종이 정답(EN 런에선 영어 ✓) —
  v4 는 중간 산출 EN, C2 가 유저 노출 S필드를 로케일화하는 이중 관례
  ③ 생성기행 안전: `check_notes` 는 EN 강제 `constraint` 필드만 수집(c_application_2.ts 469~486) —
  한국어 검수문은 생성 프롬프트에 닿지 않음.
- v4/v5/constraint 는 양 런 모두 영어(생성기행 설계), v0/v1 은 절 미주입 설계로 관찰만(전부 토큰/영어).

좌표: 하니스 `tests/i18n-layer-bleed-live.manual.test.ts`(RUN_I18N_LAYER_BLEED=1, WRITER_STEPS 배선
미러 — 레인 함수 미export 라 4개 스테이지 호출 인라인 재현, steps.ts 변경 시 수동 동기화 필요),
분석기·원본 JSON·analysis.json 은 세션 scratchpad/bleed/. 분류 규칙(시드 통과/고유명사 제거/EN 쌍둥이/
C2 혼합)은 아티팩트 방법론 절에 기록. 아티팩트:
claude.ai/code/artifact/4e89e2e7-eb9b-4335-9e93-5a8040b14f05

부수 관찰(비판정): few-shot 한국어 편향은 파이프라인 산출에서는 나타나지 않았다 — 챗 응답 실측은
별건으로 남음(오너가 EN 프로젝트 챗 사용 시 확인).
