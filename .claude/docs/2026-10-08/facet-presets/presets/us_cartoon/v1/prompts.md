## CAPSULE

Digital cartoons use broad flat cel planes and gentle gradients. #070403 outlines are about 0.29% of width, 3 px at 1024 px, with 20% variation; two weights divide contours and 0.20% interiors, with no auxiliary contours or hatching. Shapes combine ellipses, tapering trapezoids, and pointed leaf forms; silhouettes are hole free, with limited soft or hard material shadows. Daylight mean luminance is 57% and near black 1%, never mostly black; night keeps palette roles, only darker. Vivid object colors contrast #fadf81 and #529fc4 environmental planes; #9f1418 shadows; #fdf8e6 highlights; accent #c72125 ≤ 10% of the image, in a few large flexible planes, never on round forms, glass, or metal reflections. Detail budget: minimal — round forms have no interior lines, one value level, no protrusions; frame has no decorative marks.

## NEGATIVE

Avoid photorealism, glossy 3D animation, watercolor illustration, and flat vector iconography; also avoid moire, photographic glare, sensor noise, color fringing, heavy outlines, realistic reflections, elliptical drop shadows, depth of field, copied arrangements, window layouts, and plant silhouettes, readable text, logos, watermarks, crosshatching, fabric weave, wood grain, brushstrokes, bloom, and decorative particles; no speed lines.

## SCENE

A still life on an indoor table by a window contains one sphere, one spread cloth, two vessels, one fruit, and one potted plant. The vessels stand behind the cloth and sphere, the plant rises to one side, and the view is slightly elevated from the front; no people are present.

## PROBE_ANCHORS

Use weak linear perspective, a slightly elevated frontal view, shallow space, fully focused. Use #070403 outlines at 0.29% of width, 3 px at 1024 px; interiors are 0.20%, absent on round forms, about eight on cloth, with no hatching. Use broad flat planes, gentle gradients on broad or curved forms, and material dependent shadows. Daylight mean luminance is 57%, near black 1%, never mostly black; night keeps palette roles, only darker. Vivid object colors contrast environmental #fadf81 and #529fc4; accent #c72125 ≤ 10% of the image as a few large cloth planes, never on round forms, glass, or metal reflections. Detail budget: minimal — round forms have one value level, no protrusions or repeated lines; frame has no decorative marks.

## FIGURE

none

## COVERAGE

| 항목 | 출처 key | 실린 섹션 | 실린 절(영문 원문 발췌) |
|---|---|---|---|
| Core: 단순한 큰 색면과 깨끗한 윤곽 | `분류.Core` | CAPSULE, PROBE_ANCHORS | “Digital cartoons use broad flat cel planes” / “Use broad flat planes” |
| Core: 구 내부선 0 및 기본면 1단 | `분류.Core` | CAPSULE, PROBE_ANCHORS | “round forms have no interior lines, one value level” / “round forms have one value level” |
| Core: 가는 근흑선 | `분류.Core` | CAPSULE, PROBE_ANCHORS | “#070403 outlines are about 0.29% of width” |
| Core: 선명한 다색 대비 | `분류.Core` | CAPSULE, PROBE_ANCHORS | “Vivid object colors contrast #fadf81 and #529fc4 environmental planes” |
| Core: 재질별 제한된 셀 음영과 완만한 그라디언트 | `분류.Core` | CAPSULE, PROBE_ANCHORS | “gentle gradients” / “limited soft or hard material shadows” |
| Supporting: 용기 반사 띠 | `분류.Supporting` | — | CAPSULE 130단어 절대 상한에서 비 Core 재질 예시라 생략. |
| Supporting: 천의 긴 주름 | `분류.Supporting` | PROBE_ANCHORS | “about eight on cloth” |
| Supporting: 큰 잎의 윤곽 | `분류.Supporting` | CAPSULE | “pointed leaf forms” |
| Supporting: 환경까지 이어지는 같은 선 문법 | `분류.Supporting` | — | CAPSULE 130단어 절대 상한에서 비 Core 적용 범위라 생략. |
| 1. 상대 선 굵기와 기준 폭 px | `그림체.선.외곽선.굵기` | CAPSULE, PROBE_ANCHORS | “about 0.29% of width, 3 px at 1024 px” |
| 2. 색 역할 배분 | `그림체.색.역할 배분` | CAPSULE, PROBE_ANCHORS | “Vivid object colors contrast #fadf81 and #529fc4 environmental planes” |
| 3. 액센트 hex·상한·위치·입도 | `그림체.색.액센트 규칙` | CAPSULE, PROBE_ANCHORS | “accent #c72125 ≤ 10% of the image, in a few large flexible planes, never on round forms, glass, or metal reflections” |
| 4. 구도 | `공간.구도` | — | CAPSULE과 PROBE_ANCHORS 단어 예산에서 Core 렌더링 절을 우선해 생략. |
| 5. 장식 어휘·산포·레이어 | `장식` | CAPSULE, PROBE_ANCHORS | “frame has no decorative marks” |
| 7. 등장 재질 사전 | `재질` | — | CAPSULE 130단어 절대 상한에서 비 Core 재질 사전을 생략. |
| 8. 곡면 처리 | `그림체.형태.곡면 처리` | CAPSULE, PROBE_ANCHORS | “gentle gradients” / “gentle gradients on broad or curved forms” |
| 9. 캐스트 섀도 | `그림체.명암.캐스트 섀도` | — | 창턱 아래에만 있는 장면 의존 표본이며 스타일 Core가 아니어 단어 예산에서 생략. |
| 10. 인물 규칙 | `인물` | FIGURE | “none” |
| 11. 부정 절 | `생성 규칙.부정 절` | NEGATIVE | “Avoid photorealism, glossy 3D animation, watercolor illustration, and flat vector iconography” |
| 12. 과정 서술·고유명사·해당 없음 처리 | 전역 컴파일 규칙 | 전 섹션 | 과정 서술과 고유명사를 쓰지 않았고 `[해당 없음]` 값은 생략함. |
| 14. 하이라이트 hex | `그림체.색.팔레트.Highlight` | CAPSULE | “#fdf8e6 highlights” |
| 16. 선의 층별 문장 | `그림체.선.위계 단수` | CAPSULE, PROBE_ANCHORS | “two weights divide contours and 0.20% interiors” |
| 17. 내부선 양과 역할 | `그림체.선.내부선` | CAPSULE, PROBE_ANCHORS | “0.20% interiors” / “absent on round forms, about eight on cloth” |
| 18. 묘사 예산 | `디테일.묘사 밀도` | CAPSULE, PROBE_ANCHORS | “Detail budget: minimal” |
| 19. 수치 신뢰도 | `디테일.묘사 밀도.실측 개수` | CAPSULE, PROBE_ANCHORS | “about eight on cloth”; 실측 개수만 수치로 실음. |
| 20. 종류 열거 금지 | 전역 컴파일 규칙 | CAPSULE, PROBE_ANCHORS | 양의 절은 역할과 개수 중심으로 작성함. |
| 21. 결속형 부호 제외 | `장식.어휘.결속 유형` | — | 부호가 0이고 결속 유형은 `[해당 없음]`이므로 생략. |
| 22. 액센트 입도와 장식 개수 분리 | `그림체.색.액센트 규칙`, `장식.개수` | CAPSULE, PROBE_ANCHORS | “in a few large flexible planes” / “no decorative marks” |
| 23. 자연문·단어 예산 | `디테일.묘사 밀도.등급` | CAPSULE, PROBE_ANCHORS | CAPSULE 130단어, PROBE_ANCHORS 120단어의 자연문으로 작성함. |
| 24. 명암 키 | `그림체.명암.키` | CAPSULE, PROBE_ANCHORS | “Daylight mean luminance is 57% and near black 1%, never mostly black; night keeps palette roles, only darker” |
| 25. 장면 요약 정제 | `scene_summary.md` | SCENE | “A still life on an indoor table by a window contains one sphere, one spread cloth, two vessels, one fruit, and one potted plant” |
| 26. 없음의 전달 | `그림체.선`, `장식`, `디테일.반복 요소` | CAPSULE, NEGATIVE, PROBE_ANCHORS | “no auxiliary contours or hatching” / “no decorative marks” / “brushstrokes, bloom” / “no speed lines” |
| 27. 매체 선택값 유지 | `그림체.매체.엔진` | CAPSULE | “Digital cartoons use broad flat cel planes and gentle gradients” |
| 31. 형태 어휘·선 위계 | `그림체.형태`, `그림체.선.위계 단수` | CAPSULE | “Shapes combine ellipses, tapering trapezoids, and pointed leaf forms; silhouettes are hole free” / “two weights divide contours and 0.20% interiors” |
| 33. 명암 면·패턴 채움·그래픽 구성 | `그림체.명암.폼 섀도`, `그림체.질감·마감.패턴 채움` | CAPSULE, PROBE_ANCHORS | “limited soft or hard material shadows”; 패턴 채움은 비 Core이고 단어 예산을 위해 생략. |
| 34. 인접 계열 부정·속도선 없음 | `생성 규칙.부정 절.인접 계열`, `장식.운동 부호` | NEGATIVE | “Avoid photorealism, glossy 3D animation, watercolor illustration, and flat vector iconography” / “no speed lines” |
| 35. FIGURE 순서와 상한 | `인물.표본 수`, `scene_summary.md` | FIGURE | 인물 표본과 장면 인물이 모두 0이므로 “none”. |
