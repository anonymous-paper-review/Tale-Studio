
## ⬆️  2026-09-03T16:10:56Z  Claude → Codex

```
# 작업: 첨부 이미지(refer5.png)의 그림체 분석 → Style Card 작성

당신은 이미지 스타일 분석자(VLM)다. 첨부된 이미지 1장을 보고 아래 [분석 지침]에 따라 그림체를 분석하고, [출력 형식]대로 Style Card를 작성해 **이 작업 폴더에 `analysis.md`로 저장**한 뒤, 최종 메시지에도 그 전문을 그대로 붙여라.

## 고정 규칙 (하네스 제약 — 지침과 무관하게 항상 적용)

- 작가·프랜차이즈·작품·브랜드·회사 고유명사를 절대 쓰지 마라(추측·부정문도 금지). 중립 서술어와 hex 색상값만 사용한다.
- CAPSULE과 FIGURE_RULES는 **영문**으로 쓴다(이미지 생성기 프롬프트에 그대로 삽입됨). 나머지 분석은 한국어.
- 아래 [계산 통계]는 참고 자료다. 사용 여부와 방식은 [분석 지침]을 따른다.
- 이 폴더의 다른 파일은 읽거나 수정하지 마라. 산출물은 `analysis.md` 하나뿐이다. 외부 검색·네트워크 접근 금지.

## 계산 통계 (style_stats.py 실측 — 원본 922×564)

# 계산 통계 (style_stats.py)

## dev/Image_Style/artist_style_test_5/refer5.png  (원본 922x564)
| hex | 점유율 |
|---|---|
| `#8b8b93` | 13.9% |
| `#bebfbe` | 13.4% |
| `#b9baba` | 13.2% |
| `#abacaf` | 12.9% |
| `#b2b3b3` | 12.8% |
| `#97979c` | 12.2% |
| `#a3a4a7` | 12.2% |
| `#585d88` | 9.5% |
- 채도 평균 6% (std 13) · 명도 평균 66% (std 8)
- 강엣지 픽셀 13.0% (선 두께/윤곽 밀도 프록시)
- 플랫 8px 블록 58% (플랫 채움 비율 프록시 — 그라디언트/텍스처 많으면 낮음)

## 분석 지침

## 단계 2 — facet 분석 → Style Card (스캐폴드 v4, 2026-09-04)
> v4는 아래 계약을 따른다. 분석자는 번호 순서대로 답한다. 값 셀의 첫 토큰은 `[실측]` `[추정]` `[보정]` `[외삽]` `[해당 없음]` 중 하나다. `[실측]`=픽셀·형태·반복 표본으로 바로 확인, `[추정]`=의도·원인·전이 규칙 해석, `[보정]`=아티팩트 제거 뒤 추정, `[외삽]`=표본 없음·문법 유도. 산문은 근거이고, 게이트 판정은 FIELDS와 명시 런타임 입력만 참조한다.

### 분석 순서

#1 캡처 계층 → #2 분리 → #1 직후 임시 배경 복원값·보정 팔레트 기록(#13·#11에서 확정) → #3 #4 신뢰도·커버리지 → #5~#10 렌더 문법 → #12 조명 → #11 #13 확정 → #14~#21 도메인 방언 → #22~#24 실행 제어 → Style Vector → 특징 분류 → FIELDS → 일관성 검사 → 게이트 판정 → 출력 조립.

### T0 입력 거버넌스

| # | 축 | 답할 것 |
|---|---|---|
| 1 | **캡처/표현 계층** | ⓐ 원본 디지털 ⓑ 화면 촬영본 ⓒ 인쇄물 촬영·스캔 ⓓ 물리 오브젝트 사진. 단서: 회색 캐스트·모아레·글레어·비네팅·원근 왜곡·피사계 심도·센서 노이즈·접지 그림자. 규칙: ⓑⓒ의 카메라 캐스트·글레어·모아레·비네팅·흐림은 아티팩트로 제거한다. 그림 내부 반복 텍스처·배경색은 #2/#13/#18에 독립 근거가 있을 때만 유지한다. ⓓ는 #14가 실물 재료를 Core로 판정할 때만 촬영 조명·DOF·접지 그림자를 유지한다 |
| 2 | **콘텐츠/스타일/아티팩트 분리** | 각 특징에 "다른 인물·공간·시간대에서도 반복되는가?"를 묻는다. 예=스타일, 아니오=Scene-specific. #1 아티팩트는 Content-bound가 아니라 Artifacts 별도 목록. hex는 실측치와 보정치를 함께 기록한다 |
| 3 | **신뢰도·확인 필요** | 표본이 직접 보이는 축은 n=1이어도 `[실측] Core` 가능. 확인 필요는 표본에 없는 도메인 방언·LOD·다중 반복성에만 표시한다 |
| 4 | **다중 입력 커버리지** | 2장+: 이미지×축 존재 행렬로 반복률을 계산한다 *(미검증)*. n=1: `[해당 없음] n=1; 반복 검증 불가; 부재 영역: …`만 쓰고 Core/Variation/Outlier를 계산하지 않는다 |

### T1 Core 렌더 문법

| # | 축 | 답할 것 |
|---|---|---|
| 5 | **매체·렌더링 엔진** | 디지털 페인팅/셀/수채/과슈/유화/잉크/벡터/3D/실사/스톱모션·공예/콜라주 중 선택 + 재료가 보이는 방식. #1이 ⓑⓒ면 촬영 매체가 아니라 이미지 내부의 의도 렌더링만 답한다 |
| 6 | **투영·카메라·스테이징** | 선원근/아이소메트릭·평행/정면 평면/사진 렌즈/디오라마 부감 중 선택 + 시점 높이·왜곡·깊이·심도. 투영은 스타일 층으로 전이된다 |
| 7 | **형태 언어** | 둥근/각진 비중, 코너, 실루엣 단순도, 큰 덩어리 우선, 돌기량, 곡선:직선 비, 인물·잎·옷·건물 공통 적용 여부 |
| 8 | **경계 시스템** | 선 유무, 선 색(실측/보정 분리), 외곽:내부 굵기비, line_variation 0~5, 위계 태그, 테이퍼, 연속/끊김, 내부선 양, 그림자 경계, edge hard/soft/lost, 재질별 차이 |
| 9 | **채움 토폴로지** | ⓐ 폐곡선 선화+선택 채움 ⓑ 무선 면 명도차 ⓒ 플랫 셀 ⓓ 페인터리/그라디언트 혼합 중 선택 + 채움색 수·그라디언트 허용 |
| 10 | **명암·그림자 시스템** | value 키, 단계 수, 순검정 유무, 배경/주체 밝기 차, 폼 섀도 유무·경도, 캐스트/접지 섀도: 없음/소프트 접지/플랫 오프셋 실루엣/면 그림자 + 색·방향 *(단독 효과 미검증)* |
| 11 | **팔레트·색 분배** | hex(실측+보정), Primary/Secondary/Accent/Shadow/Highlight 면적 %, 액센트 허용 위치와 상한 %, strict monochrome 후보, 온도/조화. 이미지에 실제 표본이 있는 재질 고정색만 쓴다 |
| 12 | **조명·발광 효과** | 자연/인공, 방향, 광원 크기, 키:필, 림라이트, 블룸/할레이션, 발광체가 만드는 라이트 콘·풀만 |
| 13 | **배경·지면 정규화** | 관찰 유형: 순백/오프화이트/틴트/그라디언트/색면 무대막/스튜디오 바닥/제품컷 백색. 보드 복원 목표는 FIELDS의 `ground_restore`로 쓴다. ⓐⓑⓒ 그래픽 작품은 순백. 오프화이트·틴트는 피사체 내부 흰 면과 배경의 색차가 캐스트 보정 뒤에도 남거나 배경이 선/면으로 닫힌 독립 색면일 때만 유지한다. 촬영 캐스트 틴트 금지. ⓓ는 접지면·바닥 유지 가능 |

### T2 도메인 방언

| # | 축 | 답할 것 |
|---|---|---|
| 14 | **재질 번역 사전 11종** | 아래 표를 유지한다. 표본 없는 행은 `[외삽] 표본 없음; 적용 시 #8/#9/#11의 공통 문법만 따른다`로 고정한다 |
| 15 | **인물 방언** | 등신, 두상/얼굴형, 눈코입, 헤어 구축, 손, 의상 구조, 포즈. 표본 0이면 FIGURE_RULES 첫 토큰 `[EXTRAPOLATED]`, 장면 절 대체는 NOTES에 1문장 |
| 16 | **스케일 의존 LOD** | 관찰된 스케일만 `[실측]`. 관찰되지 않은 원경 인물·클로즈업·대형 오브젝트는 `[외삽] 표본 없음; 최대 디테일은 관찰된 선/면 문법을 넘지 않음` *(미검증)* |
| 17 | **디테일 밀도** | 스케일과 무관한 화면 내 밀도 분포: 초점/주변, 실루엣/내부선, 장식/재질, 반복 장식이 격자인가 느슨한 리듬인가 |
| 18 | **질감·마감** | #14 재질 세부 반복 금지. 화면 전체에 반복되는 의도된 마감의 위치·역할과 아티팩트 제외 규칙을 쓰고 FIELDS의 `intended_texture`로 요약한다 |
| 19 | **정밀도·의도적 불완전성** | 기하 정연함(균일 선·규칙적 간격·정확한 축 정렬)과 구성상 비대칭을 분리. 손맛 vs 정연함 중 시그니처를 `precision_signature`로 확정. 촬영·압축 흔적은 불완전성이 아니다 |
| 20 | **장식 모티프 시스템** | 어휘, 크기 편차, 점유율, 산포 리듬 `등간격/불균일/판정불가`, 전경 통과, Content-bound 후보. 실제 금지문은 #24에서 1회만 |
| 21 | **구도·여백 원칙** | 밀도 중심, 여백 방향, 겹침 방식, 균형 유형만. 고유 대상명·개별 위치·개수 금지 |
| — | 분위기·감정 | 시각적 원인과 함께 기록만 한다. CAPSULE 제외, 후행 modifier 후보 |

**재질 번역 사전** (#14)

| 재질 | 답할 것 |
|---|---|
| 무광 | 빛 흡수, 표면 결, 음영 부드러움, 하이라이트 유무 |
| 금속 | 거울 반사/단순화, 하이라이트 선 개수, 주변색 반사 |
| 유리 | 투명/반투명, 굴절, 가장자리만 표시, 뒤쪽 왜곡 |
| 천 | 주름 덩어리 크기, 섬유 가시성, 무게감, 그림자 경계 |
| 유기물(과일) | 광택, 색 변화, 반점/결, 반투명, 촉촉함 |
| 식물 | 잎맥, 두께, 역광 투과, 개별/덩어리 |
| 피부 | 톤 고정색, 광택/매트, 혈색, 셀 그림자 단계, 재료감 |
| 헤어 | 덩어리/가닥/얀/몰드, 하이라이트 형태, 외곽 처리 |
| 액체/물 | 채움색, 투명도, 물결/반사 부호, 표면 하이라이트 |
| 발광체 | 램프·창·화면: 플랫 채움/글로우/라이트 콘/색 |
| 건축 표면 | 벽·바닥·도로: 플랫 면/면별 명도/패턴/질감 |

### T3 실행 제어

| # | 축 | 답할 것 |
|---|---|---|
| 22 | **오버라이드 우선순위** | `axis / default / style / user override` 4열 표. 5축(색·재질·조형/얼굴·투영·배경) 각각 default/style/user override를 채우고, 색 축에서 strict monochrome 강제 여부를 확정한다 |
| 23 | **표본 부재·외삽 규칙** | 부재 영역 목록 + 각각을 스타일 생성 규칙으로 메우는 법. 전부 `[외삽]`; 관찰된 #8/#9/#11/#19 문법보다 강하게 쓰지 않는다 |
| 24 | **부정 절(NEGATIVE)** | 이 스타일이 아닌 것만: ⓐ 입력 아티팩트 ⓑ 스타일과 충돌하는 생성기 기본값 ⓒ Scene-specific 모티프·의상·소품 ⓓ 텍스트·로고. `## 4. 특징 분류`의 Content-bound와 Artifacts만 참조하고 `[외삽]` 유래 금지는 넣지 않는다. 고유명사 금지 |
| — | 파라미터 후보 | 기록만: 팔레트 오버라이드 허용, 방언 강도, 룩 옵션, strict monochrome 토글 |

### Style Vector (0~5, 12축)

| 축 | 접지 | 축 | 접지 | 축 | 접지 |
|---|---|---|---|---|---|
| 선 두께 | 계산 | 채도 | 계산 | 공간감 | 추정 |
| 선 변화 | 미구현(선폭 히스토그램) | 대비 | 계산 | 빛의 극적 성향 | 추정 |
| 형태 단순화 | 추정 | 가장자리 경도 | 계산 | 색상 다양성 | 미구현 |
| 텍스처 | 계산 | 디테일 | 계산+추정 | 불규칙성 | 미구현 |

계산은 현재 통계로 접지, 추정은 vision 판정, 미구현은 접지 후보다. 미구현 축 수치는 게이트 단독 근거가 아니며 FIELDS로 복사할 때 태그를 함께 둔다.

### 일관성 검사
게이트 전 1회 수행한다. `line_ratio/line_variation`↔#8 위계, `irregularity/precision_signature`↔#19, `accent_pct_max`↔#11 분배 합계, `strict_monochrome`↔`color_diversity`, `capture/ground_restore`↔#13, `capture/intended_texture`↔#18을 대조한다. 모순이면 `[실측]` 수치·픽셀 관찰을 우선하고 낮은 신뢰도 필드를 고친다.

### 조건 게이트 — FIELDS와 런타임 입력만 참조
이미지 판정은 FIELDS만 참조한다. `(런타임)`으로 표시한 값은 하네스가 프롬프트별로 제공한다. 통과/불통과 게이트 이름은 FIELDS의 `gates_inserted:` / `gates_skipped:`에 ASCII 이름으로 나열한다.

| 입력 필드 | 조건식 | 삽입 문구 | 대체 문구 |
|---|---|---|---|
| 비대칭 구조물: `precision_signature`, `irregularity` | `precision_signature == hand_drawn and irregularity >= 3` | "furniture, buildings, props and garments are never perfectly symmetric — nothing lines up in a perfect grid" | `precision_signature == geometric`이면 "clean geometric regularity" |
| 선 3단계 위계: `line_ratio_tag`, `line_ratio`, `line_variation` | `line_ratio_tag == measured and line_ratio >= 1.5 and line_variation >= 2.5` | "outer silhouettes > object interior > background interior thinnest" | `line_variation <= 2.0`이면 "uniform line weight everywhere"; 그 외에는 선 굵기 언급 생략 |
| 장식 불균일 산포: `decor_rhythm_tag`, `decor_rhythm` | `decor_rhythm_tag == measured and decor_rhythm == uneven` | "uneven irregular rhythm, never evenly spaced" | 생략 |
| strict monochrome(보드): `strict_monochrome`, `color_diversity`, `accent_pct_max` | `strict_monochrome == true and color_diversity <= 1.5` | `accent_pct_max > 0`이면 "strict near-monochrome: only the listed accent hue, accent ≤ N% of the image"; `accent_pct_max == 0`이면 "strict monochrome, no accent hue" | 생략 |
| strict monochrome(전이): `(런타임) user_purity_toggle` | `user_purity_toggle == true` | strict monochrome 문구 | 콘텐츠 색 지시 유지 |
| 배경 순백 복원: `capture`, `ground_restore` | `capture in [b,c] and ground_restore == white` | "pure white ground — no gray photographic cast, no moiré" | 의도 근거 있을 때만 offwhite/tint |
| 물리 사진 질감 유지: `capture`, `physical_material_core` | `capture == d and physical_material_core == true` | "real photographed craft materials under studio light" | 화면 촬영본엔 금지 |
| 인물 방언 절 주입: `(런타임) figure_request`, `figure_samples`, FIGURE_RULES | `figure_request == true and (figure_samples > 0 or FIGURE_RULES 존재)` | FIGURE_RULES | 무인물 장면엔 생략 |
| 인물 2-ref 절 → 장면 절: `figure_samples` | `figure_samples == 0` | NOTES에 장면 절 대체 기록 | 표준 인물 절 |

### FIELDS 작성 규칙
`## 5. FIELDS`는 `key: value` 한 줄씩만 쓰며 값은 전부 ASCII token이다. 숫자는 단위 없이, 불리언은 `true|false`, 게이트명은 `asymmetric_structure|line_hierarchy|decor_uneven|strict_monochrome_board|strict_monochrome_transfer|white_ground_restore|physical_photo_texture|figure_rules|scene_ref_replacement`만 쓴다.

| 키 | 타입 | 허용값 |
|---|---|---|
| `capture` | enum | `a|b|c|d` |
| `fill_topology` | enum | `a|b|c|d` |
| `shadow_type` | enum | `none|soft_contact|flat_offset|planar` |
| `ground_restore` | enum | `white|offwhite|tint|studio_floor|stage_backdrop` |
| `decor_rhythm` | enum | `even|uneven|unknown` |
| `precision_signature` | enum | `geometric|hand_drawn|mixed` |
| `line_ratio_tag`, `decor_rhythm_tag` | enum | `measured|estimated|corrected|extrapolated|na` |
| `intended_texture` | enum | `none|paper_grain|brush|fiber|noise|polish` |
| `strict_monochrome`, `physical_material_core` | boolean | `true|false` |
| `accent_pct_max`, `color_diversity`, `line_ratio`, `line_variation`, `irregularity` | number | 단위 없는 숫자 |
| `figure_samples` | integer | 0 이상의 정수 |
| `gates_inserted`, `gates_skipped` | list | 위 게이트명 쉼표 목록 또는 `none` |

### CAPSULE 영문 토큰

| 종류 | 토큰 |
|---|---|
| 투영 | `linear perspective` / `isometric parallel projection` / `flat frontal staging` / `photographic lens perspective` / `diorama overhead view` |
| 경계·채움 | `closed line art with selective spot fills` / `no-outline planar value blocks` / `flat cel fills` / `blended painterly gradients` |
| 그림자 | `no cast shadows` / `soft contact shadow` / `flat colored offset shadow` / `hard planar face shadows` |
| 정밀도 | `clean geometric regularity` / `hand-drawn wobble` |

### 출력 계약 — Style Card v4
작성 순서: META → 분석표 → 재질 사전 → Style Vector → 특징 분류 → FIELDS → 일관성 검사 → 게이트 판정 → CAPSULE / FIGURE_RULES / NEGATIVE / OVERRIDE / QA_CHECKS / NOTES. 전체를 코드블록으로 감싸지 않는다.

| 헤더 | 형식 |
|---|---|
| `# Style Card — <run_name>` | 첫 줄 |
| `## 0. META` | `Capture: … / Artifacts: … / Coverage: n=… / Needs confirmation: #번호 사유; #번호 사유` — #1/#3/#4 요약만 |
| `## 1. 분석` | 24행 표, 열 고정 `# / 축 / 값 / 등급 / 신뢰도`; 값 셀 1문장, 줄바꿈·세로줄 금지 |
| `## 2. 재질 사전` | 11행 표 |
| `## 3. Style Vector` | 12축 `축 / 값 / 접지` 표 |
| `## 4. 특징 분류` | `Core` / `Supporting` / `Content-bound`; Content-bound 아래 `Scene-specific`·`Artifacts` 하위 bullet 고정 |
| `## 5. FIELDS` | 허용값 표의 필수 키를 `key: value` 한 줄씩; 마지막 두 키는 `gates_inserted`, `gates_skipped` |
| `## 6. CAPSULE` | 영문 문단 하나, 2~4문장, 문장당 약 35단어. 목표 룩만 서술하고 입력·과정·분석자·restored/corrected from 언급 금지. ① 투영 토큰+매체+경계/채움 토큰 ② 배경 절+그림자 토큰+팔레트+필수 토큰 "accent ≤ N% of the image" ③ 관찰 Core 재질 2~3개+표본 없는 재질 공통 규칙+정밀도 토큰 ④ 장식은 Core면 포함, Supporting이면 "when decorative marks are used, …" 조건문 |
| `## 7. FIGURE_RULES` | 영문 1문단. #15(+클로즈업 #16). 표본 0이면 첫 토큰 `[EXTRAPOLATED]` |
| `## 8. NEGATIVE` | 영문 1문장, 최대 35단어, 세미콜론 금지, `Avoid`로 시작. #24 ⓐ~ⓓ 해당 범주만, `[외삽]` 유래 항목 금지 |
| `## 9. OVERRIDE` | `axis / default / style / user override` 4열 표 1개 + `Parameters:` 한 줄 |
| `## 10. QA_CHECKS` | 단계 4 검수자의 체크리스트. 5행 `항목 / 확인할 것 / 판정(검수자 기입)` 표, 항목은 `board / leakage / capture / dialect / override` |
| `## 11. NOTES` | 한국어 3문장 이하 운영 메모. 인물 표본 0이면 장면 절 대체 1문장. 없으면 "없음" |

CAPSULE·FIGURE_RULES·NEGATIVE·FIELDS는 코드블록 없이 각각 헤더 바로 다음에 문단/블록 하나만 둔다. 고유명사는 부정문에서도 금지한다. 후속 생성기가 해당 명칭을 차단하거나 토큰으로 반영할 수 있기 때문이다.

## 출력 형식 (`analysis.md` — 지침의 "출력 계약" 표를 따른다. 헤더는 아래 제목까지만 글자 그대로)

```
# Style Card — refer5
## 0. META
## 1. 분석
## 2. 재질 사전
## 3. Style Vector
## 4. 특징 분류
## 5. FIELDS
## 6. CAPSULE
## 7. FIGURE_RULES
## 8. NEGATIVE
## 9. OVERRIDE
## 10. QA_CHECKS
## 11. NOTES
```

위 블록은 헤더 이름 예시일 뿐이다 — 실제 Style Card 전체를 코드블록으로 감싸지 않는다. FIELDS(`key: value` 한 줄씩, 허용값 표의 ASCII 토큰만)·CAPSULE(영문 2~4문장, 필수 토큰 포함)·FIGURE_RULES(영문 1문단, 표본 없으면 첫 토큰 `[EXTRAPOLATED]`)·NEGATIVE(영문 1문장, 최대 35단어, "Avoid"로 시작)는 각각 헤더 바로 다음에 코드블록 없이 문단/블록 하나로 적는다 — 파서가 헤더 다음 내용을 그대로 프롬프트에 넣는다. 런타임 입력(figure_request, user_purity_toggle)은 하네스가 제공하므로 FIELDS에 쓰지 않는다.

```

## ⬇️  2026-09-03T16:16:31Z  Codex → Claude  (exit=0)

# Style Card — refer5
## 0. META
Capture: b 화면 촬영본 / Artifacts: 회색 캐스트, 약한 센서 노이즈, 미세 흐림, 가능한 모아레 / Coverage: n=1 / Needs confirmation: #4 반복 검증 불가; #14 표본 없는 재질; #15 인물 표본 없음; #16 미관찰 스케일

## 1. 분석
| # | 축 | 값 | 등급 | 신뢰도 |
|---|---|---|---|---|
| 1 | 캡처/표현 계층 | [실측] 화면 촬영본으로 보이며 회색 캐스트, 약한 센서 노이즈, 미세 흐림이 있고 내부 그림의 평행 투영과 선화는 그래픽 표현층이다. | Artifacts 분리 | 중상 |
| 2 | 콘텐츠/스타일/아티팩트 분리 | [보정] 스타일은 청회색 선, 순백 면, 진청 액센트, 평행 부감, 플랫 채움이고 scene-specific은 운송수단, 해안 구조, 작은 자연 표식이며 아티팩트 실측 #8b8b93, #bebfbe, #b9baba는 보정 뒤 배경 #ffffff, 선 #4e547f, 액센트 #254bd6로 분리한다. | Core와 Content-bound 분리 | 중상 |
| 3 | 신뢰도·확인 필요 | [실측] 직접 보이는 축인 선, 채움, 투영, 그림자, 배경 보정은 n=1이어도 판정 가능하고 인물, 클로즈업, 표본 없는 재질은 확인 필요다. | 혼합 | 중 |
| 4 | 다중 입력 커버리지 | [해당 없음] n=1이라 반복 검증 불가하며 부재 영역은 인물, 클로즈업, 다중 시간대, 대부분의 재질 방언이다. | 해당 없음 | 높음 |
| 5 | 매체·렌더링 엔진 | [보정] 의도 렌더링은 디지털 셀 일러스트와 벡터풍 잉크 선화에 가깝고 촬영 매체의 입자감은 유지하지 않는다. | Core | 중상 |
| 6 | 투영·카메라·스테이징 | [실측] 아이소메트릭 평행 투영에 가까운 낮은 부감이며 렌즈 원근, 심도 흐림, 사실적 카메라 왜곡은 없다. | Core | 중상 |
| 7 | 형태 언어 | [실측] 큰 덩어리는 직선 구조가 우세하지만 코너와 끝단은 둥글게 완화되고 곡선형 외곽과 단순 식물 기호에도 같은 단순화가 적용된다. | Core | 중상 |
| 8 | 경계 시스템 | [실측] 보정 선색은 #4e547f 계열이고 외곽 2~3px, 내부선 1~2px, 외곽:내부 약 1.6, line_variation 2.8이며 테이퍼는 약하고 끊김 없는 폐곡선 위계가 중심이다. | Core | 중상 |
| 9 | 채움 토폴로지 | [실측] 폐곡선 선화와 선택적 스폿 채움 구조이며 대부분은 흰 면, 일부만 진청 플랫 채움으로 처리되고 그라디언트는 허용되지 않는다. | Core | 높음 |
| 10 | 명암·그림자 시스템 | [실측] 순검정 없이 낮은 대비의 밝은 키를 유지하며 폼 섀도는 거의 없고 청회색 플랫 오프셋 실루엣 그림자가 좌하향으로 붙는다. | Core | 중상 |
| 11 | 팔레트·색 분배 | [보정] 팔레트는 #ffffff 55%, #e8e9ea 25%, #4e547f 12%, #9ca5d5 5%, #254bd6 최대 8%로 제한되는 strict near-monochrome 후보다. | Core | 중 |
| 12 | 조명·발광 효과 | [추정] 자연광이나 인공광의 사실 조명보다 균일한 그래픽 조명이며 림라이트, 블룸, 라이트 콘, 발광 풀은 없다. | Supporting | 중 |
| 13 | 배경·지면 정규화 | [보정] 그래픽 작품의 화면 촬영 캐스트를 제거하면 배경은 순백 #ffffff로 복원해야 하며 독립 틴트나 스튜디오 바닥 근거는 없다. | Core | 높음 |
| 14 | 재질 번역 사전 11종 | [실측] 관찰 표본은 무광 도색면, 식물 기호, 액체 기호, 건축 표면에 한정되고 표본 없는 재질은 공통 선, 채움, 팔레트 문법으로 외삽한다. | 혼합 | 중 |
| 15 | 인물 방언 | [해당 없음] 인물 표본은 0개라 표준 인물 절은 외삽으로만 작성하고 무인물 장면에서는 생략한다. | 해당 없음 | 높음 |
| 16 | 스케일 의존 LOD | [실측] 관찰 스케일에서는 큰 실루엣 외곽과 작은 반복 내부선이 공존하며 클로즈업과 대형 오브젝트는 관찰 문법을 넘지 않게 외삽한다. | Core와 외삽 | 중 |
| 17 | 디테일 밀도 | [실측] 중심 피사체 내부에는 창, 점, 패널선의 중간 밀도 반복이 있고 주변 여백은 짧은 상징선과 작은 표식만 드문드문 놓인다. | Core | 중상 |
| 18 | 질감·마감 | [보정] 화면 전체의 거친 입자, 회색 얼룩, 흐림은 입력 아티팩트로 제외하고 의도 마감은 매끈한 플랫 면과 선이다. | Core | 중상 |
| 19 | 정밀도·의도적 불완전성 | [실측] 기본 축과 간격은 정돈되어 있으나 선과 작은 부호에는 손그림식 흔들림이 있어 precision_signature는 mixed, irregularity는 2.4로 본다. | Core | 중 |
| 20 | 장식 모티프 시스템 | [실측] 작은 윤곽 기호, 짧은 물결선, 점열, 식물형 부호가 낮은 점유율로 산포하며 비구조 장식은 불균일 리듬이고 구조 반복선은 격자를 허용한다. | Supporting | 중 |
| 21 | 구도·여백 원칙 | [실측] 밀도는 중앙과 우측 큰 덩어리에 모이고 주변에는 넓은 순백 여백이 남으며 개체는 약한 대각 균형과 최소 겹침으로 배치된다. | Core | 중상 |
| 22 | 오버라이드 우선순위 | [추정] 색은 strict near-monochrome을 스타일 기본으로 두되 사용자 색 지시는 순도 토글이 켜질 때만 제한하고 재질, 조형, 투영, 배경은 관찰 문법을 우선한다. | 실행 제어 | 중 |
| 23 | 표본 부재·외삽 규칙 | [외삽] 인물, 피부, 헤어, 천, 금속, 유리, 과일, 발광체, 클로즈업은 관찰된 선 위계, 플랫 채움, 제한 팔레트, mixed 정밀도보다 강하게 만들지 않는다. | 외삽 | 중 |
| 24 | 부정 절 | [보정] 부정 절은 촬영 아티팩트, 사실적 생성기 기본값, scene-specific 운송수단과 해안 소품 복제, 텍스트와 로고만 대상으로 한다. | 실행 제어 | 중상 |

## 2. 재질 사전
| 재질 | 값 | 등급 | 신뢰도 |
|---|---|---|---|
| 무광 | [실측] 빛 흡수형 플랫 면으로 표면 결은 보이지 않고 음영은 거의 없으며 하이라이트를 따로 두지 않는다. | Core | 중상 |
| 금속 | [외삽] 표본 없음; 적용 시 #8/#9/#11의 공통 문법만 따른다 | 외삽 | 낮음 |
| 유리 | [외삽] 표본 없음; 적용 시 #8/#9/#11의 공통 문법만 따른다 | 외삽 | 낮음 |
| 천 | [외삽] 표본 없음; 적용 시 #8/#9/#11의 공통 문법만 따른다 | 외삽 | 낮음 |
| 유기물(과일) | [외삽] 표본 없음; 적용 시 #8/#9/#11의 공통 문법만 따른다 | 외삽 | 낮음 |
| 식물 | [실측] 잎맥 없이 짧은 선잎과 얇은 줄기 부호로 처리되고 개별 잎보다 작은 덩어리 기호가 우선한다. | Supporting | 중 |
| 피부 | [외삽] 표본 없음; 적용 시 #8/#9/#11의 공통 문법만 따른다 | 외삽 | 낮음 |
| 헤어 | [외삽] 표본 없음; 적용 시 #8/#9/#11의 공통 문법만 따른다 | 외삽 | 낮음 |
| 액체/물 | [실측] 진청 플랫 채움 또는 짧은 청회색 물결 부호로만 표시되고 투명도, 반사, 표면 하이라이트는 없다. | Supporting | 중상 |
| 발광체 | [외삽] 표본 없음; 적용 시 #8/#9/#11의 공통 문법만 따른다 | 외삽 | 낮음 |
| 건축 표면 | [실측] 벽, 바닥, 도로는 플랫 면과 면별 약한 명도차, 규칙적 패널선으로 구분되며 질감 패턴은 없다. | Core | 중상 |

## 3. Style Vector
| 축 | 값 | 접지 |
|---|---|---|
| 선 두께 | 2.5 | 계산 |
| 채도 | 0.8 | 계산 |
| 공간감 | 3.0 | 추정 |
| 선 변화 | 2.8 | 미구현 후보 |
| 대비 | 2.1 | 계산 |
| 빛의 극적 성향 | 0.5 | 추정 |
| 형태 단순화 | 3.7 | 추정 |
| 가장자리 경도 | 3.8 | 계산 |
| 색상 다양성 | 1.2 | 미구현 후보 |
| 텍스처 | 0.8 | 계산 |
| 디테일 | 2.9 | 계산+추정 |
| 불규칙성 | 2.4 | 미구현 후보 |

## 4. 특징 분류
Core
- 화면 촬영 캐스트를 제거한 순백 바탕과 낮은 대비의 밝은 보드.
- 아이소메트릭 평행 투영, 폐곡선 청회색 선화, 선택적 진청 스폿 채움.
- 외곽선이 내부선보다 두껍고 배경 내부선이 가장 얇은 3단계 선 위계.
- 흰색과 옅은 회색 면, 진청 액센트 최대 8%, 청회색 플랫 오프셋 그림자.
- 매끈한 플랫 마감과 정돈된 기하 위에 얹힌 약한 손그림 흔들림.

Supporting
- 작은 윤곽 기호, 짧은 물결선, 점열, 식물형 부호의 낮은 점유율 산포.
- 창, 패널, 점 같은 내부 반복 디테일은 중간 밀도로 쓰되 재질 질감으로 확장하지 않는다.
- 장식 표식은 불균일 리듬을 가지지만 구조 반복선은 정돈된 간격을 허용한다.

Content-bound
- Scene-specific: 큰 운송수단, 해안 구조물, 작은 돛 모양, 탑 모양 구조, 식물 표식, 하트형 표식, 물결 표식.
- Artifacts: 회색 촬영 캐스트, 약한 센서 노이즈, 미세 흐림, 가능한 모아레, 압축성 얼룩.

## 5. FIELDS
capture: b
fill_topology: a
shadow_type: flat_offset
ground_restore: white
decor_rhythm: uneven
precision_signature: mixed
line_ratio_tag: measured
decor_rhythm_tag: measured
intended_texture: none
strict_monochrome: true
physical_material_core: false
accent_pct_max: 8
color_diversity: 1.2
line_ratio: 1.6
line_variation: 2.8
irregularity: 2.4
figure_samples: 0
gates_inserted: line_hierarchy,decor_uneven,strict_monochrome_board,white_ground_restore,scene_ref_replacement
gates_skipped: asymmetric_structure,strict_monochrome_transfer,physical_photo_texture,figure_rules

## 6. CAPSULE
Use isometric parallel projection with a clean digital cel illustration feel and closed line art with selective spot fills, keeping outer silhouettes > object interior > background interior thinnest across simplified objects. Set everything on pure white ground — no gray photographic cast, no moiré, with flat colored offset shadow and a cool blue gray palette: #ffffff, #e8e9ea, #4e547f, #9ca5d5, strict near-monochrome: only the listed accent hue, accent ≤ 8% of the image. Core materials are matte painted surfaces, architecture surfaces, and simple water signs; materials without samples should use the same hard outlines, flat fills, and limited palette, with hand-drawn wobble over controlled geometry. When decorative marks are used, keep tiny outlined symbols and short strokes sparse with uneven irregular rhythm, never evenly spaced, and avoid turning them into texture or repeating wallpaper.

## 7. FIGURE_RULES
[EXTRAPOLATED] No figure sample is visible; if figures are required, build them as small simplified geometric silhouettes in the same isometric parallel projection, with rounded rectangular heads, minimal dot-and-line facial marks, blocky hair masses, mitten-like hands, compact clothing panels, flat fills, blue gray outlines, and no detail beyond the observed object line and fill density.

## 8. NEGATIVE
Avoid gray camera cast, sensor noise, moiré, blur, photographic lighting, realistic texture, logos, readable text, and copying the scene-specific vehicles, shoreline structures, tiny hearts, waves, palms, sails, or tower.

## 9. OVERRIDE
| axis | default | style | user override |
|---|---|---|---|
| 색 | 중립 팔레트 | 청회색 strict near-monochrome과 #254bd6 액센트 최대 8% | 명시 색상은 허용하되 purity toggle이 true면 listed accent만 허용 |
| 재질 | 일반 플랫 재질 | 표본 재질은 무광, 건축 표면, 물 기호 중심 | 새 재질은 공통 선, 채움, 팔레트 문법 안에서만 변환 |
| 조형/얼굴 | 기본 단순화 | 둥근 끝단과 직선 구조의 혼합, 얼굴은 표본 없음 | 인물 요청 시 FIGURE_RULES 외삽 적용 |
| 투영 | 자유 투영 | isometric parallel projection | 사용자가 정면 또는 렌즈 원근을 명시하면 투영만 교체 |
| 배경 | 임의 배경 | pure white ground | 사용자가 닫힌 색면 배경을 명시할 때만 offwhite 또는 tint 허용 |
Parameters: palette_override=allowed; dialect_strength=medium; look_options=flat_clean; strict_monochrome_toggle=available

## 10. QA_CHECKS
| 항목 | 확인할 것 | 판정(검수자 기입) |
|---|---|---|
| board | 순백 바탕, 청회색 선, 진청 액센트 최대 8%가 유지되는가 | 미기입 |
| leakage | scene-specific 운송수단, 해안 소품, 하트형 표식이 불필요하게 복제되지 않았는가 | 미기입 |
| capture | 회색 촬영 캐스트, 노이즈, 흐림, 모아레가 스타일로 남지 않았는가 | 미기입 |
| dialect | 표본 없는 인물과 재질이 관찰된 선, 채움, 팔레트 문법보다 강해지지 않았는가 | 미기입 |
| override | 사용자 색상, 투영, 배경 지시가 strict near-monochrome과 ground_restore 규칙에 맞게 처리됐는가 | 미기입 |

## 11. NOTES
인물 표본 0이므로 무인물 장면에서는 FIGURE_RULES를 생략하고 관찰된 사물·공간 문법을 우선한다.
화면 촬영 아티팩트는 배경·질감 판단에서 제외했다.
색은 보정 기준으로 순백 바탕과 청회색 선, 제한된 진청 액센트만 사용한다.

> 원본 세션(부모) (parent id=01a06809-a25c-7cc0-bd10-d5e0b8f1ca08): `/home/user/.codex/sessions/2026/09/04/rollout-2026-09-04T01-10-56-01a06809-a25c-7cc0-bd10-d5e0b8f1ca08.jsonl`
> 상세보기: `python3 /home/user/.local/bin/render_session.py "/home/user/.codex/sessions/2026/09/04/rollout-2026-09-04T01-10-56-01a06809-a25c-7cc0-bd10-d5e0b8f1ca08.jsonl" --full`

---
