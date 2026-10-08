## CAPSULE
Realistic digital render appearance uses continuous shading without brush marks: metal mirrors in long bands, glass refracts along narrow ridges; cloth weaves, matte forms grain, organics gleam, plants catch rim light, and emitters bloom white into cyan. No outlines: value and reflection define forms; edges, about 0.15% of width or 3 px at 2048 px width, mark folds, with no hatching or auxiliary contours. Painterly gradient mixed fills cross forms and walls, with no pattern fill. Night scenes average 31% luminance, 26% near black but never most of frame, and 10.8% light planes; curved forms carry one soft shadow; projected #10161d shadows fall lower right, sharp at contact, then soften. Primary #3b424a 13.7%, secondary #565c62 13.5%, shadow #04090e 12.8%, highlight #a7bec5 10.8%; bodies use #40464a, #2c323c, or #0c1a2b; gray is shared with ground, never background only; neon saturated accent #01eafd ≤ 4% of the image, as reflective bands, refractive rims, or organic spots, never broad matte or cloth planes. Rounded forms meet pointed tips and straight architecture; an elevated lens under upper left white and cyan light keeps straight verticals, cropped connected foreground, and quiet upper space. Detail budget: maximal — sampled organics have about 2 boundaries, about 5 protrusions, and no repeated lines; no frame decorations; texture fills surfaces.

## NEGATIVE
Avoid cel animation, vector illustration, low poly art, moire, compression blocks, ink outlines, flat cel shading, uniform gloss, geometric linework, tiled patterns, decorative particles, speed lines, readable text, and logos.

## SCENE
In a room with a window, a table holds one sphere, two containers, one fruit, one cloth, and one potted plant. Viewed gently downward from slightly above the table, the cloth and fruit sit in front, the containers and plant sit behind them, and buildings appear beyond the window; no people are present.

## PROBE_ANCHORS
Use photographic lens perspective from slightly above, with straight verticals and blurred distance. Draw no ink outlines; separate forms by value and reflection, with structural edges about 0.15% of width, 3 px at 2048 px width, and no hatching. Use continuous gradients and connected soft form shadows; projected #10161d shadows extend lower right, sharp at contact, then soften. In night scenes mean luminance is about 31%, near black about 26% and not most of the frame; broad planes stay low saturation. Gray bodies and ground share #3b424a and #565c62, never a background only color; neon saturated accent #01eafd ≤ 4% of the image, as reflective bands, refractive rims, or lit organic spots, never broad matte or cloth fill. Keep an asymmetric foreground beneath quiet upper wall; one object is about 21.78% frame height. Detail budget: maximal — the sampled organic form has about 2 structural boundaries, about 5 protrusions, and no repeated lines; no decorative marks cross the whole frame.

## FIGURE
none

## COVERAGE
| 항목 | 출처 key | 실린 섹션 | 실린 절(영문 원문 발췌) |
|---|---|---|---|
| Core: 외곽선 없는 사실적 연속톤 | `분류.Core` | CAPSULE, PROBE_ANCHORS | “Realistic digital render appearance uses continuous shading”; “Draw no ink outlines; separate forms by value and reflection” |
| Core: 청회 로우키와 청록 국소 반사 | `분류.Core` | CAPSULE, PROBE_ANCHORS | “Night scenes average 31% luminance, 26% near black”; “neon saturated accent #01eafd ≤ 4% of the image” |
| Core: 재질별 광택과 미세 결 | `분류.Core` | CAPSULE | “metal mirrors in long bands, glass refracts along narrow ridges; cloth weaves, matte forms grain” |
| Core: 밝은 반사와 깊은 암부의 국소 대비 | `분류.Core` | CAPSULE, PROBE_ANCHORS | “10.8% light planes”; “near black about 26% and not most of the frame” |
| Supporting: 원경 초점 흐림 | `분류.Supporting` | CAPSULE, PROBE_ANCHORS | “blurred distance” |
| Supporting: 상판의 투영 그림자와 굴절 무늬 | `분류.Supporting` | CAPSULE, PROBE_ANCHORS | “projected #10161d shadows fall lower right, sharp at contact”; 굴절은 “glass refracts”로 재질 규칙에 실음 |
| Supporting: 비대칭 정물 구성 | `분류.Supporting` | PROBE_ANCHORS | “Keep an asymmetric foreground beneath quiet upper wall” |
| §6.1 선 굵기 상대값과 px 기준 | `그림체.선.내부선.굵기` | CAPSULE, PROBE_ANCHORS | “about 0.15% of width, 3 px at 2048 px width” |
| §6.2 역할 배분 | `그림체.색.역할 배분` | CAPSULE | “bodies use #40464a, #2c323c, or #0c1a2b”; “gray is shared with ground, never background only” |
| §6.3 액센트 색·상한·허용·금지·입도 | `그림체.색.액센트 규칙` | CAPSULE, PROBE_ANCHORS | “neon saturated accent #01eafd ≤ 4% of the image, as reflective bands, refractive rims, or lit organic spots, never broad matte or cloth fill” |
| §6.4 구도 | `공간.구도` | PROBE_ANCHORS | “Keep an asymmetric foreground beneath quiet upper wall; one object is about 21.78% frame height” |
| §6.5 장식 | `장식` | CAPSULE, PROBE_ANCHORS | “no decorative marks cross the whole frame” |
| §6.6 모노크롬 | `그림체.색.모노크롬 엄격도`; `생성 규칙.게이트 판정` | — | 엄격 단색이 아니고 `strict_monochrome_*`가 생략 판정이므로 미삽입 |
| §6.7 재질 사전 | `재질`; `그림체.매체.재료 외관` | CAPSULE | “metal mirrors in long bands, glass refracts along narrow ridges; cloth weaves, matte forms grain, organics gleam, plants catch rim light, and emitters bloom white into cyan” |
| §6.8 곡면·면분할 | `그림체.채움.토폴로지`; `그림체.형태.곡면 처리` | CAPSULE, PROBE_ANCHORS | “Painterly gradient mixed fills cross forms and walls”; “Use continuous gradients and connected soft form shadows” |
| §6.9 캐스트 섭도 | `그림체.명암.캐스트 섭도` | CAPSULE, PROBE_ANCHORS | “projected #10161d shadows fall lower right, sharp at contact, then soften”; “projected #10161d shadows extend lower right, sharp at contact, then soften” |
| §6.10 인물 | `입력.판독 한계.주체 크기`; `scene_summary.md` | FIGURE | “none” |
| §6.11 부정 절의 장면 종속 제외 | `생성 규칙.부정 절.장면 종속` | — | 같은 정물 장면을 그리는 SCENE과 충돌하므로 §6.11에 따라 `copied still life arrangement, copied skyline`을 제외 |
| §6.12 과정 서술·고유명사·해당 없음 제외 | 전체 템플릿 | 전 섹션 | 과정 서술과 고유명사를 쓰지 않고 `[해당 없음]` 값을 출력하지 않음 |
| §6.13 폼 섭도 경도 | `그림체.명암.폼 섭도` | CAPSULE, PROBE_ANCHORS | “curved forms carry one soft shadow”; “connected soft form shadows” |
| §6.14 하이라이트·액센트 hex | `그림체.색.팔레트`; `그림체.색.하이라이트색` | CAPSULE | “highlight #a7bec5 10.8%”; “neon saturated accent #01eafd ≤ 4% of the image” |
| §6.15 Core 장식·배경 기하 | `분류.Core`; `공간.배경·지면.그래픽 구성` | — | Core 장식이 없고 그래픽 패널·밴드·주체 통합은 `[해당 없음]` |
| §6.16 선의 층별 문장 | `그림체.선.적용 범위` | CAPSULE, PROBE_ANCHORS | “No outlines: value and reflection define forms”; “Draw no ink outlines” |
| §6.17 내부선 양·역할 | `그림체.선.내부선` | CAPSULE, PROBE_ANCHORS | “structural edges about 0.15% of width, 3 px at 2048 px width, and no hatching”; “mark folds”; “about 2 structural boundaries” |
| §6.18 묘사 예산 | `디테일.묘사 밀도` | CAPSULE, PROBE_ANCHORS | “Detail budget: maximal — sampled organics have about 2 boundaries, about 5 protrusions, and no repeated lines; no frame decorations; texture fills surfaces” |
| §6.19 수치 신뢰도 | `디테일.묘사 밀도.실측 개수` | CAPSULE, PROBE_ANCHORS | “about 2 structural boundaries, about 5 protrusions, and no repeated lines” |
| §6.20 종류 열거 금지 | 전 섹션 | 전 섹션 | 재질과 액센트는 단순 종류 목록 대신 각각의 표현 역할을 문장으로 기술 |
| §6.21 결속형 부호 | `장식.어휘.결속 유형` | — | `[해당 없음]` 이고 장식 부호 자체가 없음 |
| §6.22 액센트 입도와 장식 개수 분리 | `그림체.색.액센트 규칙.입도`; `장식.개수` | CAPSULE, PROBE_ANCHORS | 액센트는 “reflective bands, refractive rims, or lit organic spots”로, 장식은 “no decorative marks cross the whole frame”로 별도 기술 |
| §6.23 자연문·단어 예산 | `디테일.묘사 밀도.등급` | CAPSULE, PROBE_ANCHORS | 하이픈 압축어 없는 자연문으로 작성; 단어 수는 기계 검증 |
| §6.24 키 | `그림체.명암.키`; `그림체.색.팔레트.Highlight` | CAPSULE, PROBE_ANCHORS | “Night scenes average 31% luminance, 26% near black but never most of frame, and 10.8% light planes” |
| §6.25 장면 요약 정제 | `scene_summary.md` | SCENE | “In a room with a window, a table holds one sphere, two containers, one fruit, one cloth, and one potted plant” |
| §6.26 없음의 전달 | `그림체.선.내부선`; `질감·마감.패턴 채움`; `장식`; `장식.운동 부호` | CAPSULE, NEGATIVE | “no hatching or auxiliary contours”; “no pattern fill”; “no decorative marks”; “speed lines” |
| §6.27 매체·눈 처리 선택값 | `그림체.매체.엔진`; `인물.눈.처리` | CAPSULE | “Realistic digital render appearance”; 눈 처리는 인물 표본 부재로 `[해당 없음]` |
| §6.28 눈 절 | `인물.눈` | — | 인물 표본과 장면 인물이 모두 0명이므로 FIGURE는 `none` |
| §6.29 비례 절 | `인물.비례`; `인물.체형` | — | 전 값이 인물 표본 부재로 `[해당 없음]` |
| §6.30 계열 혼합 | `인물.계열 혼합` | — | 전 값이 인물 표본 부재로 `[해당 없음]` |
| §6.31 형태 어휘·선 위계 | `그림체.형태`; `그림체.선.위계 단수`; `그림체.선.보조 윤곽` | CAPSULE | “Rounded forms meet pointed tips and straight architecture”; 선 위계는 무선으로 `[해당 없음]`, 보조 윤곽은 “no hatching or auxiliary contours” |
| §6.32 포즈 절 | `인물.포즈 문법` | — | 전 값이 인물 표본 부재로 `[해당 없음]` |
| §6.33 명암 면·그래픽 구성 | `그림체.명암.폼 섭도`; `그림체.명암.하이라이트`; `질감·마감.패턴 채움`; `공간.배경·지면.그래픽 구성` | CAPSULE | “curved forms carry one soft shadow”; “metal mirrors in long bands, glass refracts along narrow ridges”; “no pattern fill”; 그래픽 구성은 `[해당 없음]` |
| §6.34 인접 계열 부정·속도선 | `생성 규칙.부정 절.인접 계열`; `장식.운동 부호` | NEGATIVE | “Avoid cel animation, vector illustration, low poly art”; “speed lines” |
| §6.35 FIGURE 순서·상한 | `인물`; `scene_summary.md` | FIGURE | “none” |
