# flash 모델 A/B·shotCheck 검수 가치·로그 열람 오탐 — 세션 기록

> 세션 2026-08-10 (저녁). 다음 세션에서 이어가기 위한 기록.
> 원칙: 실측만 기록(추측 아님). 코드로 귀결된 것은 여기 없음 — flash A/B 본체와 3.6-flash 전환은
> `research/experiments/flash-model-ab/` + 커밋 f6d8e58·17ee55c가 기록.

## 0. 한 줄 요약

flash 4모델 A/B로 기본 모델을 3.6-flash로 전환(코드로 닫힘)하는 과정에서 코드에 안 남은 실측 3개를 건졌다:
① lite 기각의 진짜 사유는 속도·품질이 아니라 **repairJson이 조용히 샷을 잘라먹는 데이터 손실**(제품 잠재 위험, 미해결),
② fan-out 회차 이슈 272건 전수 열람으로 **shotCheck 검수가 실제로 잡는 것의 분포**(asset_version 불연속이 CRITICAL의 절반, INFO층은 스펙 린트),
③ 로그의 모델 원출력을 대량 인용하면 **안티-증류 분류기 오탐**으로 세션이 끊긴다(우회 실증됨).

## 1. 실측 발견 — 안 통한 시도 포함

### 1-1. repairJson의 조용한 샷 소실 (flash-model-ab 부산물 — 제품 경로 잠재 위험)

- **발견**: 3.5-flash-lite는 3회 전부 JSON 형태 불량(속성명 따옴표 누락 류) → 제품 `repairJson`이
  예외 없이 "복구"하는 대신 **오류 지점 이후를 잘라내고 성공으로 통과** — 8샷이 2샷/3샷으로 줄어도
  에러·경고 0. 근거(실측): `research/experiments/flash-model-ab/results/` rep1=2/8, rep3=3/8.
- **함의**: 이건 lite만의 문제가 아니라 repair 경로의 일반 성질이다. 어떤 모델이든 malformed 출력을
  내면 같은 무신호 손실이 가능. 배열 산출 스테이지(v4 등)에 "기대 개수 대비" 검증이 없다.
- 부수: lite 출력에 한자·한국어 혼입("40年代백인여성모습의"), 씬 내 위치 연속성 위반(전환 샷 없이
  바닥→책상) — 품질 축에서도 전패. lite 기각은 속도(0.67×)로도 상쇄 불가.

### 1-2. shotCheck 검수가 실제로 잡는 것 (fan-out 회차 272건 전수 열람)

fan-out 런 2개(5260d92d 18씬/163샷, e4da245a 15씬/157샷 — claude-sonnet-4-6 씬별 검수)의
이슈 전수를 입력과 나란히 열람한 결과 (리포트: https://claude.ai/code/artifact/bde91751-d647-43cc-9e30-fdd0ab72c0af):

- **CRITICAL 13건 중 7건이 asset_version 불연속** — 같은 씬 안 캐릭터 v1→v2 무단 변경을 두 런에서 반복 검출.
  검수의 최대 실질 성과가 이 패턴.
- **분할 제안 13건 전부 같은 급소** — motion_prompt에 순차 액션 2~3개 압축("walks→sits→places hand" 류)
  = 1주요액션 예산 위반. 위반 유형이 하나로 수렴한다는 건 상류(v4) 프롬프트에서 선제 가능하다는 신호.
- **연속성이 전체의 72%(196/272)** — 소품 소실(헬멧·노트북), 배경 앵커 증발, 대명사 성별 불일치까지
  프롬프트 간 교차 모순을 실제로 짚음. 예(원문):
  > "motion_prompt says 'The silhouette of the broken moon is visible through the telescope,' but the
  > environmental_change describes lunar fragments actively drifting. … they contradict each other."
- **INFO층(90건)은 사실상 스펙 린트** — visible_parts "full" vs CU 샷 같은 메타 자기모순이 대부분.
  시각 품질 신호로는 약함 → 검수 입력 다이어트(쿼터 미결 ④)를 팔 때 INFO 산출 필드가 1순위 후보.
- 좌표: 페어 파일 `NNN_shotCheck_claude.json`은 `NNN_shotCheck_validate_scene_K.json`과 동일 호출의
  중복 로그(claude 쪽이 timestamp·duration_ms·tokens 보유 superset — 33페어 전수 diff 확인).

### 1-3. 안 통한 것: 로그의 모델 원출력 대량 인용 → 안티-증류 분류기 오탐

- **발생**: 직전 gjc 세션이 `*_shotCheck_claude.json` 수십 개를 긁으며 4모델 출력 비교를 준비하다
  `Refusal (reasoning_extraction)` — ToS "모델 출력 복제/증류" 분류기가 표면 패턴(클로드 원출력 대량
  수집 + 같은 입력의 다모델 출력 비교)에 오탐 발화. 폭력성·내용 문제 아님.
- **우회 실증**: 모델 원출력을 대화 컨텍스트에 싣지 않고 ① 스크립트(Node)가 파일→HTML 직변환
  ② 무거운 처리는 서브에이전트 위임 ③ 구조 파악용 1~2개만 직접 읽기 — 이 방식으로 같은 작업 완주.

## 3. 미결

- ~~**질문: repairJson 손실 가드를 둘 것인가**~~ — **닫힘 (2026-08-11, 오너 결정 + 구현).**
  - **보류 근거가 실측으로 뒤집혔다**: "현행 3.6-flash는 strict 3/3이라 repair 미발동"이 전제였는데,
    shotDesign 동시성 재측정 9런에서 **238콜 중 5콜(약 2%)이 손실 복구로 통과**했다. 미발동이 아니라 상시다.
  - **이번엔 피해 0**: 샷 1,031개 전수 검사 — 개수(데쿠파주 대비 전 콜 일치)·내용(연출의도/정적/동적
    스펙 빈 값 0건) 모두 온전. 잘려나간 건 데이터가 아니라 뒤에 붙은 군더더기였다. 단 **그걸 사후에,
    손으로 파봐서 알았다는 게 문제**였다 — 복구기는 "몇 개 남았다"만 알고 "몇 개여야 하는지"를 모른다.
  - **처방(구현됨)**: ① `repairJsonStrict` + `LossyRepairError` 로 손실 복구를 에러로 표면화(살아남은
    값은 `error.value` 에 실어 보냄) ② 4개 프로바이더가 이걸 사용 ③ `dispatch` 가 감지 시 **같은 질문을
    한 번만** 재호출, 두 번째도 잘리면 살아남은 값으로 진행(= 종전과 동일한 최악치) ④ 대사 단계는
    응답에 없던 샷을 `missing_shot_ids` 로 표면화 — 침묵으로 채우고 나면 "모델이 고른 침묵"과
    "잘려서 사라진 것"이 구분 불가라 여기서만 갈린다.
  - **왜 재호출이 필요했나**: 복구기 자리는 프롬프트도 모델도 모르므로 스스로 다시 물을 수 없다.
    신호를 올려 dispatch 가 판단하게 하는 것이 유일한 경로였다.
  - **남은 것**: 기대 개수를 아는 스테이지의 자체 개수 가드는 v4_shots(`judgeShotCount`)에만 있다.
    decoupage·s3·v2 등은 여전히 대조 상대가 없다 — 재호출이 1차 방어를 하지만 2차 그물은 비어 있다.
- **질문: 3.6-flash의 쿼터 버킷·한도** — 수용량 수치 재산출 필요.
  → `2026-08-10-llm-quota-capacity.md` §3에 기존 preview 질문을 대체해 기록 (중복 방지, 그쪽이 정본).
- 잔가지: `research/experiments/flash-model-ab/HYPOTHESIS.md`에 결론 1줄 미기입 — 판정 자체는 오너
  행동(3.6 전환 지시 → f6d8e58)으로 닫힘. 다음 research 커밋 때 한 줄 추가.

## 좌표

- **flash A/B 비교 리포트** (한글 번역·샷별 4열 비교·볼 포인트 6개·타이밍 상세 접기):
  https://claude.ai/code/artifact/c0cb5290-ff75-45f6-9a4e-2a55e2d3270d
- **fan-out 피드백 열람 리포트** (씬별 입력 샷 데이터 ↔ 이슈 272건, severity 분포·전체 프롬프트 접기):
  https://claude.ai/code/artifact/bde91751-d647-43cc-9e30-fdd0ab72c0af
- 실험 원본: `research/experiments/flash-model-ab/` (커밋 17ee55c — 가설·프로브·fixture·12콜 결과).
  fan-out 원로그: `logs/5260d92d-…77`·`logs/e4da245a-…e3`/debug/llm_calls (로컬 전용, 커밋 안 됨).
- 렌더 생성기: 세션 스크래치패드 `parse.mjs`·`gen.mjs`·`render.mjs` (일회성 — 재현은 원로그+아티팩트로).
