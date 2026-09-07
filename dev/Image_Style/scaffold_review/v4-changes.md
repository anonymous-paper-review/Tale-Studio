# v4 변경 기록

## D1 게이트 태그 검사가 느슨함
반영 위치: `v4-draft.md`의 `### FIELDS 작성 규칙`, `### 조건 게이트 — FIELDS와 런타임 입력만 참조`, `### 일관성 검사`.

반영 문구: `line_ratio`, `line_ratio_tag`, `line_variation`을 FIELDS 필수 키로 추가했고, 선 3단계 위계 조건을 `line_ratio_tag == measured and line_ratio >= 1.5 and line_variation >= 2.5`로 고정했다. 대체 문구도 `line_variation <= 2.0`이면 `"uniform line weight everywhere"`, 그 외 사각지대는 선 굵기 언급 생략으로 바꿨다.

## D2 액센트 상한이 CAPSULE에 실리지 않음
반영 위치: 출력 계약 `## 6. CAPSULE`, strict monochrome 게이트.

반영 문구: CAPSULE ② 필수 토큰에 `"accent ≤ N% of the image"`를 넣었고, 게이트 삽입 문구도 `"strict near-monochrome: only the listed accent hue, accent ≤ N% of the image"`로 바꿨다.

## D3 CAPSULE에 과정 서술이 샘
반영 위치: 출력 계약 `## 6. CAPSULE`, 마지막 파싱·금지 규칙.

반영 문구: `목표 룩만 서술하고 입력·과정·분석자·restored/corrected from 언급 금지`와 `배경 복원은 결과 서술만 허용한다`를 추가했다.

## D4 NEGATIVE에 외삽 유래 금지가 섞임
반영 위치: #24 부정 절, 출력 계약 `## 8. NEGATIVE`.

반영 문구: #24를 ⓐ 입력 아티팩트, ⓑ 충돌하는 생성기 기본값, ⓒ Scene-specific, ⓓ 텍스트·로고로 제한했고, `## 4. 특징 분류의 Content-bound와 Artifacts만 참조하고 [외삽] 유래 금지는 넣지 않는다`를 추가했다. NEGATIVE 계약에도 `#24 ⓐ~ⓓ 해당 범주만, [외삽] 유래 항목 금지`를 넣었다.

## D5 축 간 모순 검사 부재
반영 위치: `### 일관성 검사`.

반영 문구: `line_ratio/line_variation`↔#8, `irregularity/precision_signature`↔#19, `accent_pct_max`↔#11, `strict_monochrome`↔`color_diversity`, `capture/ground_restore`↔#13, `capture/intended_texture`↔#18을 대조하고, 모순 시 `[실측]` 수치·픽셀 관찰을 우선해 낮은 신뢰도 필드를 고치게 했다.

## D6 QA_CHECKS 소비처 부재
반영 위치: 출력 계약 `## 10. QA_CHECKS`.

반영 문구: `단계 4 검수자의 체크리스트`라고 명시하고, 표 형식을 `항목 / 확인할 것 / 판정(검수자 기입)`으로 고정했다.

## S1 기계 판독 필드 블록
반영 위치: `### FIELDS 작성 규칙`, 출력 계약 `## 5. FIELDS`.

반영 문구: 필수 키 `capture`, `fill_topology`, `shadow_type`, `ground_restore`, `accent_pct_max`, `color_diversity`, `line_ratio`, `line_variation`, `irregularity`, `strict_monochrome`, `figure_samples`, `decor_rhythm`을 포함했다. D1과 게이트 검증을 위해 `line_ratio_tag`, `decor_rhythm_tag`, `precision_signature`, `physical_material_core`, `intended_texture`, `gates_inserted`, `gates_skipped`도 추가했다. 이미지 판정은 FIELDS만 참조하고 런타임 입력은 게이트 표에 별도 표시한다.

## S2 CAPSULE 필수 토큰
반영 위치: 출력 계약 `## 6. CAPSULE`.

반영 문구: ① 투영 enum+매체+경계/채움, ② `"pure white ground"`류 배경 절+그림자+팔레트+`"accent ≤ N% of the image"`, ③ 관찰 Core 재질+표본 없는 재질 공통 규칙+`"clean geometric regularity"` 또는 `"hand-drawn wobble"`, ④ 장식 조건문을 필수 조립 규칙으로 명시했다.

## S3 게이트 표 4열 재작성
반영 위치: `### 조건 게이트 — FIELDS와 런타임 입력만 참조`.

반영 문구: 표 열을 `입력 필드 / 조건식 / 삽입 문구 / 대체 문구` 4열로 구성했다. 조건식은 모두 FIELDS 키만 참조하고, 게이트 이름은 `입력 필드` 셀의 접두 정보로만 둔다.

## S4 길이 예산 ≤ 130줄
반영 위치: 전체 `v4-draft.md`.

반영 문구: #5~#13과 재질 사전 설명을 압축했고 #1, #2, #13, #24는 상세 규칙을 유지했다. `v4-draft.md`는 130줄 이하로 작성했다.

## refer5 시뮬레이션

v4 규칙 아래에서 기존 카드의 #8은 `[보정] 외곽 3~4px, 내부 2px` 같은 산문 위계 주장을 게이트 근거로 쓰지 못한다. FIELDS는 예를 들어 `line_ratio: 1.1`, `line_ratio_tag: measured`, `line_variation: 2.0` 또는 `line_ratio_tag: corrected`가 되어 선 3단계 위계 게이트가 불통과하고, CAPSULE에는 `"uniform line weight everywhere"`가 들어간다.

#11은 `Accent #2441d4 약 8%` 산문만으로 끝나지 않는다. FIELDS에 `accent_pct_max: 8`을 쓰고 CAPSULE ②에는 `"accent ≤ 8% of the image"`가 필수로 들어간다. 물·창·선택 패널 같은 위치 제한은 유지하되 수치 상한이 함께 전달된다.

CAPSULE ①은 `"Restored from a screen photo"`로 시작할 수 없다. v4에서는 입력·과정 서술이 금지되므로 예시는 `"Clean flat digital isometric line art uses uniform thin indigo outlines, hard closed shapes, and sparse solid blue spot fills in selected panels."`처럼 목표 룩만 말한다.

CAPSULE ②는 `"On a restored intentional ground"`도 쓰지 않는다. 예시는 `"Use a pure white ground — no gray photographic cast, no moiré — with high-key values, flat blue offset shadows when needed, and accent ≤ 8% of the image."`처럼 결과 배경과 수치만 남긴다.

NEGATIVE는 `detailed human faces`를 제거한다. 인물 표본 0에서 온 외삽 금지이기 때문이다. v4 예시는 `"Avoid gray photographic cast, moiré, sensor noise, generic gradients, realistic material reflections, black outlines, copied scene objects, text, and logos."`처럼 #24 ⓐ~ⓓ만 포함한다.

게이트 판정은 기존처럼 `선 3단계 위계 삽입`이 아니라 `선 3단계 위계 불통과, 균일선 대체 문구 삽입`이 된다. `장식 불균일 산포`, `strict near-monochrome`, `배경 순백 복원`은 각각 FIELDS의 `decor_rhythm_tag == measured`, `strict_monochrome == true`, `capture == b and ground_restore == white`로 통과한다.

FIELDS 예시는 다음처럼 달라진다.

```text
capture: b
fill_topology: a
shadow_type: flat_offset
ground_restore: white
accent_pct_max: 8
color_diversity: 1.0
line_ratio: 1.1
line_ratio_tag: measured
line_variation: 2.0
irregularity: 1.5
strict_monochrome: true
figure_samples: 0
decor_rhythm: uneven
decor_rhythm_tag: measured
precision_signature: geometric
physical_material_core: false
intended_texture: polish
gates_inserted: decor_uneven,strict_monochrome_board,white_ground_restore,scene_ref_replacement
gates_skipped: asymmetric_structure,line_hierarchy,strict_monochrome_transfer,physical_photo_texture,figure_rules
```

## 2차 수정 (R1~R8)

### R1 출력 계약 번호와 게이트 판정 위치
반영 위치: 출력 계약, `### FIELDS 작성 규칙`, `### 조건 게이트`.

반영 문구: `## 11. FIELDS`를 `## 5. FIELDS`로 옮기고 이후 헤더를 `## 6. CAPSULE`, `## 7. FIGURE_RULES`, `## 8. NEGATIVE`, `## 9. OVERRIDE`, `## 10. QA_CHECKS`, `## 11. NOTES`로 재번호했다. `## 4. 특징 분류`의 `끝에 게이트 판정 1줄`은 제거했고, FIELDS 마지막 두 키 `gates_inserted:` / `gates_skipped:`에 게이트 이름을 기록하게 했다.

### R2 FIELDS 허용값과 ASCII 토큰
반영 위치: `### FIELDS 작성 규칙`, `### 조건 게이트`, `### 일관성 검사`, refer5 시뮬레이션 FIELDS 예시.

반영 문구: 허용값 표를 `키 / 타입 / 허용값`으로 추가했다. `capture a|b|c|d`, `fill_topology a|b|c|d`, `shadow_type none|soft_contact|flat_offset|planar`, `ground_restore white|offwhite|tint|studio_floor|stage_backdrop`, `decor_rhythm even|uneven|unknown`, `precision_signature geometric|hand_drawn|mixed`, `*_tag measured|estimated|corrected|extrapolated|na`, `intended_texture none|paper_grain|brush|fiber|noise|polish`를 명시했다. `ground`는 복원 목표임이 드러나도록 `ground_restore`로 바꿨다.

### R3 런타임 입력과 중복 키 제거
반영 위치: `### FIELDS 작성 규칙`, 게이트 표의 strict monochrome(전이)·인물 방언 절 주입 행.

반영 문구: `figure_request`, `user_purity_toggle`, `figure_rules_ready`를 FIELDS 필수 키에서 제거했다. `figure_request`와 `user_purity_toggle`은 입력 필드 셀에 `(런타임)`으로 표시하고, `figure_rules_ready`는 `FIGURE_RULES 존재` 조건으로 대체했다.

### R4 재질 사전 11행 표 복원
반영 위치: `**재질 번역 사전** (#14)`.

반영 문구: 압축 산문을 제거하고 `재질 / 답할 것` 11행 표를 복원했다. 행은 무광, 금속, 유리, 천, 유기물(과일), 식물, 피부, 헤어, 액체/물, 발광체, 건축 표면이다.

### R5 CAPSULE 영문 토큰 정의
반영 위치: `### CAPSULE 영문 토큰`, 출력 계약 `## 6. CAPSULE`.

반영 문구: 투영 토큰, 경계·채움 토큰, 그림자 토큰, 정밀도 토큰을 표로 정의했다. CAPSULE 계약은 ① 투영 토큰+매체+경계/채움 토큰, ② 그림자 토큰, ③ 정밀도 토큰을 쓰도록 바꿨다.

### R6 선 위계 사각지대와 액센트 0 처리
반영 위치: 게이트 표의 선 3단계 위계 행과 strict monochrome(보드) 행.

반영 문구: 선 위계 대체 문구에 `line_variation <= 2.0`이면 `"uniform line weight everywhere"`, 그 외에는 선 굵기 언급 생략을 명시했다. strict monochrome은 `accent_pct_max == 0`일 때 `"strict monochrome, no accent hue"`를 삽입하도록 분기했다.

### R7 파싱 규칙과 고유명사 금지
반영 위치: 출력 계약 마지막 줄.

반영 문구: `CAPSULE·FIGURE_RULES·NEGATIVE·FIELDS는 코드블록 없이 각각 헤더 바로 다음에 문단/블록 하나만 둔다`를 추가했다. 또한 `고유명사는 부정문에서도 금지한다. 후속 생성기가 해당 명칭을 차단하거나 토큰으로 반영할 수 있기 때문이다`를 추가했다.

### R8 #22 strict monochrome 문구 정정
반영 위치: #22 오버라이드 우선순위.

반영 문구: 기존의 축별 strict monochrome 표현을 `5축(색·재질·조형/얼굴·투영·배경) 각각 default/style/user override를 채우고, 색 축에서 strict monochrome 강제 여부를 확정한다`로 바꿨다.

## 검수 판정 (Claude, 2차) — 통과 (2026-09-04)
R1~R8 전 항목 반영 확인, 비공백 120줄. 검수자 편집: 제목·표 앞뒤 빈 줄만 복원(내용 무변경) 후 `.claude/skills/artist-style-anchor/scaffolds/v4.md`로 확정. 승격 조건은 동일(A/B에서 v3 4.9 이상).
