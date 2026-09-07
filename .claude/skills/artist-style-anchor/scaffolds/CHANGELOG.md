# 분석 스캐폴드 버전 이력 (SKILL.md 단계 2)

스캐폴드 = 단계 2에서 분석자(Claude 또는 VLM)에게 주는 facet 체크리스트·출력 계약. 본문(SKILL.md 단계 2)에는 **확정판만** 싣고, 개발판은 이 디렉토리에서 A/B로 검증한 뒤 승격한다.

| 버전 | 상태 | 내용 | 근거 |
|---|---|---|---|
| **v1** `v1-weak.md` | 폐기 | facet 이름 14개 + 출력 계약 4항 (2026-08 대청소 후 압축판) | 하위 축이 분석자 암묵 판단에 의존 — VLM 자동화 불가 |
| **v2** `v2.md` | 보관 (2026-09-03~07 확정판이었음; SKILL.md 본문 스냅샷 `v2-skill-body-2026-09-03.md`) | 원문 4~7단계 구조 복원(14 facet 하위 체크리스트·재질 사전 6종·3등급·Style Vector 12축) + 신설 축 ⑮ 오버라이드 우선순위 ⑯ 색 분배 규칙 ⑰ 표본 부재 외삽 + 2-0 입력 아티팩트 분리 | refer5 Codex A/B: 원문 2.9 → v2 4.5/5 (`dev/Image_Style/artist_style_test_5/ab_scaffold/comparison.md`) |
| **v3** `v3.md` | **확정 (2026-09-07 오너 승격) = SKILL.md 본문** | 아래 v3 변경 요지 | Codex 리뷰 2회 (`dev/Image_Style/scaffold_review/review.md`, `review-2.md`). A/B(refer5, 분석자 Codex 고정): 보드 QA 통과, 충실도 **4.9 ≥ v2 4.5** (원문 2.9 · v1 3.5 · Claude 참조 4.75). 실행자 채점 n=1 — 승격 시 SKILL.md 단계 2 본문을 `v3.md`로 교체. `ab_scaffold/comparison.md` §5-A |
| **v4** `v4.md` | **A/B 완료 — 승격 조건 미충족 (4.6 < v3 4.9), 원인 특정 → v5 후보** (2026-09-04, 역할 교대: 저자 = Codex, 검수 = Claude, 반려 1회 후 통과) | v3 + 결함 D1~D6 수정 + 구조 S1~S4: `## 5. FIELDS` 기계 판독 블록(ASCII 허용값 표 · `gates_inserted/skipped`) · 게이트 조건식(FIELDS·런타임 입력만 참조) · 일관성 검사 · 캡슐 필수 토큰(투영/경계·채움/그림자/정밀도 영문 어휘 · "accent ≤ N%") · 과정 서술 금지 · NEGATIVE 외삽 배제 · QA_CHECKS = 단계 4 체크리스트 | Claude 리뷰 `dev/Image_Style/scaffold_review/inputs/review-3-claude.md`(지시) → Codex 초안 → Claude 반려 `review-4-claude.md`(R1~R8) → Codex 2차 → 통과. 승격 조건: A/B에서 v3(4.9) 이상. 하네스: `spec.tail-v4.md` + `build_prompts.py` v4 검증 경고 A/B(refer5): 하네스 검증 경고 0건·보드 QA 통과(가장 깨끗)·충실도 4.6 — 캡슐 ②에 액센트 hex(#254bd6) 누락으로 액센트 채도 회귀(v5 후보: "accent #hex ≤ N%" 필수 토큰 + 검증). `ab_scaffold/comparison.md` §5-A |

## v3 변경 요지 (v2 대비)

1. **티어 구조 T0→T3 + 분석 순서 고정** — T0 입력 거버넌스(#1~#4) → T1 Core 렌더 문법(#5~#13) → T2 도메인 방언(#14~#21) → T3 실행 제어(#22~#24). 팔레트 보정·배경 복원값은 #1 직후 임시 기록 후 #11/#13에서 확정(2차 리뷰: 앞 축이 캐스트를 스타일로 삼는 것 방지).
2. **신규 축 8**: 캡처/표현 계층(#1: 원본/화면 촬영/인쇄 스캔/물리 오브젝트 사진 — refer3 vs refer5·6 분리) · 배경·지면 정규화(#13, "의도 근거" 정의 포함 — v2 잔여 격차) · 그림자 시스템(#10) · 채움 토폴로지(#9 — refer5 선택 채움 vs refer6 무선 면분할) · 장식 모티프 시스템(#20) · 스케일 의존 LOD(#16) · 확장 재질 5종(피부·헤어·액체·발광체·건축 표면) · 부정 절(#24 → 출력 슬롯 NEGATIVE).
3. **병합·분리**: 선+가장자리 → 경계 시스템(#8) · 팔레트+색 분배(#11) · 명암+캐스트 섀도(#10) / 조명+발광체 라이트 풀(#12) 범위 분리 · 재질 사전(#14) vs 화면 전체 마감(#18) · 디테일 밀도(#17, 스케일 무관) vs LOD(#16).
4. **E′ 기본 절 → 조건 게이트 9종** (4열 표: 조건 / 삽입 문구 / 미충족 시). 본문 `[실측]` 선언이 Style Vector 추정값보다 우선, 미구현 접지 축 수치는 게이트 단독 근거 금지. strict monochrome은 보드용(자동)과 콘텐츠 전이용(유저 토글) 분리.
5. **신뢰도 태그 5종** `[실측|추정|보정|외삽|해당 없음]` 값 셀 첫 토큰 고정. 표본이 보이는 축은 n=1이어도 `[실측] Core`, "확인 필요"는 표본 없는 방언·LOD·반복성에만(2차 리뷰: n=1 전체 약화 방지). n=1 커버리지·LOD·재질 표본 없는 행은 고정 문구로(장문 외삽 금지).
6. **출력 계약 11섹션** (META 고정 형식 · 24행 분석표 5열 고정 · 재질 11행 · Style Vector 접지 열 · 특징 분류에 Scene-specific/Artifacts 하위 · CAPSULE 조립 순서 ①~④와 문장당 ~35단어 · FIGURE_RULES `[EXTRAPOLATED]` · NEGATIVE 35단어 1문장 · OVERRIDE 4열 표 + Parameters · **QA_CHECKS**(분석자가 제안하는 검수 항목 5행 — pass/fail은 검수자) · NOTES 3문장) + 작성 순서 + 파싱 규칙(코드블록 금지, 헤더 제목만).
7. **미채택**: 룩 옵션(프로덕션 파라미터로 이관, Parameters 줄에 기록만). **미검증 표시**: 다중 입력 커버리지(#4), 스케일 LOD(#16), 그림자 단독 효과(#10).

## v4 변경 요지 (v3 대비 — 역할 교대 라운드)

1. **검증 가능성**: `## 5. FIELDS` — 게이트 입력값 20종을 `key: value` ASCII 토큰으로(허용값 표 고정), 게이트 판정은 FIELDS와 하네스 런타임 입력(`figure_request`, `user_purity_toggle`)만 참조. 판정 결과는 `gates_inserted/gates_skipped`에 기록.
2. **v3 A/B 결함 수정**: 선 위계 게이트를 `line_ratio_tag == measured and line_ratio >= 1.5 and line_variation >= 2.5`로(태그·수치 기계 검사, 사각지대는 "선 굵기 언급 생략") · 캡슐 ② 필수 토큰 "accent ≤ N% of the image" · 캡슐 과정 서술("restored/corrected from") 금지 · NEGATIVE에서 `[외삽]` 유래 배제 · 일관성 검사 단계(위계↔선 변화, 불규칙성↔#19, 액센트↔#11, monochrome↔색상 다양성, 캡처↔배경/질감) · QA_CHECKS를 단계 4 검수자 체크리스트로 연결.
3. **캡슐 영문 토큰 표** — 투영·경계/채움·그림자·정밀도 어휘 고정(하네스 문자열 검증 가능).
4. 출력 계약 12섹션(0~11, FIELDS가 §5), 재질 사전 11행 표 유지, 비공백 120줄.
5. 미검증 표시 유지: #4 다중 입력, #16 LOD, #10 그림자 단독.

## 하네스 대응 (v3·v4 카드 실행)

`dev/Image_Style/artist_style_test_5/ab_scaffold/`: `spec.head.md` + `v3.md`/`v4.md` + `spec.tail-v3.md`/`spec.tail-v4.md` 조립 → `codex_relay.sh <cond_dir> <spec> -s workspace-write -i <image>` → `build_prompts.py <cond>`(섹션 이름 기반 파싱, NEGATIVE가 있으면 보드·프로브 말미에 "Avoid: …" 삽입) → `gen.sh board <cond>` → QA → `gen.sh probes <cond>`. 조건당 35크레딧. 보드 QA 실패 시 재시도 금지(스캐폴드를 측정하는 실험이므로).

## facet 템플릿 (스캐폴드와 별도 산출물, 2026-09-04~)

스캐폴드 v4의 축·재질 사전·게이트를 그림 1:1 계층 서식(jsonc)으로 재편한 것. LLM에게 서식을 주고 그림을 보고 채우게 한 산출물만으로 재생성해 **원본 스타일을 재현하는 것이 1차 목표**(상황·행동·포즈는 그 뒤). 파일: `facet-template-v0.guide.md`(목적 · 작성 규칙 7항 · lint) · `facet-input-v0.jsonc`(입력 서식) · `facet-template-v0.jsonc`(조립도 본문) · `.json` 파생물 · `facets-v4.json`(평면 key/description 목록, v0 이전 단계). 도구: `bin/facet_template.py lint|strip`.

| 버전 | 날짜 | 내용 |
|---|---|---|
| v0.1 | 2026-09-04 | 계층화 초안: 가지 11개 · 리프 199 전부 주석 · 선택형 22(분석 근거 첨부) · 작성 가이드 7항 |
| v0.2 | 2026-09-04 | 메타·입력을 본문에서 분리(가이드 md + 입력 jsonc) · lint 도구화(+선택형 근거 검사) · 목적 절 신설 · 다음 단계 = 계층화 심화 + 재생성 잔차 기반 새 facet 발견 |
| **v1** | 2026-09-04 | **사이클 1 반영** (refer5·refer1·refer6 — 채우기 Codex → 컴파일 Codex 무참조 → gpt_image_2 무참조 6장 42크레딧 → 잔차 판정 Codex 3 + Claude 3). 본문 리프 184 → 239, 입력 5 → 7, 편집 67건(`dev/Image_Style/facet_cycle_1/v1/make_v1.py`). 새 가지 11: 색.역할 배분 · 액센트 금지 위치·입도·면 형태 · 캐스트 섀도.형상·길이 · 채움.면별 명도 4리프 · 채움.그라디언트 3리프 · 선.적용 범위 5리프 · 형태.돌기 3리프 · 구도 5리프 · 배경.그래픽 구성 · 인물.비례·체형 · 장식.어휘 · 디테일.반복 요소 · 재질.기계·차량. 가이드에 작성 규칙 8·9항 + 컴파일 규칙 §6 17항 + 하네스 메모. `style_stats.py`에 Rec.709 휘도·근흑 면적 추가. 결과 아티팩트 "facet 사이클 1". **오너 육안 확인 + 외부 조사 → v1.1 논의 대기** |

## 캐릭터 facet 템플릿 (스타일 템플릿과 별도 파일, 2026-09-07~)

특정 캐릭터 한 명의 값을 변동성 순서(정체성 → 신체 → 외장 → 상태 → 국소 렌더링 → 배치 → 관계)로 기록하는 조립도. 스타일 템플릿 `인물` 가지("스타일이 인물을 그리는 법")와 짝이며, 겹치는 값은 "스타일 기본값 따름"으로 참조한다. 파일: `facet-character-v0.guide.md` · `facet-character-v0.jsonc` · `.json`. 조사 폴더 `dev/Image_Style/facet_character/`(BRIEF · OWNER_NOTES · fragments/*.jsonc + *.research.md · assemble.py · synthesis.md).

| 버전 | 날짜 | 내용 |
|---|---|---|
| v0 | 2026-09-07 | 오너 골격(A~G + 메타 태그 변동성·기여도)을 Fable 5.1 서브에이전트 6명이 외부 어휘(태그 그룹·OpenPose/COCO·FACS·DeepFashion·LIP·샷 사이즈)로 검증·확장. 리프 285(정체성 14 · 신체 130 · 외장 52 · 상태 54 · 국소 렌더링 12 · 배치 11 · 관계 12), 선택형 163, lint 0, 전 리프 `[변동성][기여도]` 태그. 스타일 템플릿 v1 `인물` 가지에 경계 주석(E31). 사이클 검증 전 초안 — 오너 검토 대기 |
