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
