## CAPSULE
Photorealistic still life uses continuous tones and optics; materials: grainy matte, rough metal, refracting glass, woven cloth, waxy organics, veined leaves, flame glow, and worn walls. No outlines: value separates soft forms, hard glass, lost leaves; reflected planes replace hatching and auxiliary contours. Use curved gradients, one soft shadow region per rounded form; soft #100b05 contact shadows lack separable length, highlights stay reflective. Daylight averages 19% luminance, 58% near black, and 10.9% #998662 without featureless black; night keeps roles darker. Content sets colors; none is backdrop only: #251b0d 13.9%, #614e2e 13.6%, #1d170b 13.8%, #100b05 9.6%, #171309 13.3%; dark saturated accent #431d15 ≤ 2% of the image, on one rounded plane, never walls or leaves; brightest #f8f6ef. Warm upper left light and shallow focus frame an asymmetric group 59.1% high; one vessel, 21.5% high, is 0.36 of main height; keep upper darkness, edge cropping, no white void; ellipses, cylinders, spheres, and leaf lenses mix straight and curved contours. Detail budget: medium, about seven glass boundaries, two bands, no decorative marks or overall pattern fill, unless the scene specifies its own backdrop.

## NEGATIVE
Avoid cartoon illustration, impressionist painting, watercolor illustration, stylized 3D rendering, moire, compression blocks, black outlines, flat cel shading, white studio backdrops, glossy plastic surfaces, copied still life arrangements, copied glass engraving, copied wall molding, copied candle placement, floating bokeh particles, wet floor reflections, and geometric ink hatching; no speed lines, readable text, logos, or watermarks.

## SCENE
An indoor table holds one spherical object, two vessels, and one fruit. A cloth covers the table; behind them stand one leafy potted plant and one candleholder, with a window and wall farther back. The view faces forward from slightly above table height, and no people are present.

## PROBE_ANCHORS
Use photographic perspective from the specified viewpoint, warm upper left light, foreground focus, a soft background, and no wide angle distortion. No outlines: value and reflection define contours; keep edges soft, glass hard, and dark leaves lost; a glass vessel has about seven structural boundaries and two front bands, with no hatching. Use continuous gradients, one soft shadow region per rounded form, and soft #100b05 contact shadows without separable length; highlights stay on reflective materials. In daylight, target mean luminance about 19%, near black about 58% without a featureless black image, and #998662 bright planes about 10.9%; at night keep roles darker. Palette: #251b0d 13.9%, #614e2e 13.6%, #1d170b 13.8%, #100b05 9.6%, #171309 13.3%; dark saturated accent #431d15 ≤ 2% of the image in one rounded plane, never walls or leaves. Keep grounded asymmetry in a dark indoor setting without white voids; the subject group fills about 59.1% of frame height, with edge cropping, unless the scene specifies its own backdrop. Detail budget: medium, about seven structural boundaries, two front bands, no decorative marks, and no overall pattern fill.

## FIGURE
none

## COVERAGE
| 항목 | 출처 key | 실린 섹션 | 실린 절(영문 원문 발췌) |
|---|---|---|---|
| Core: 연속 체적 음영과 무선 경계 | `분류.Core` | CAPSULE, PROBE_ANCHORS | “Photorealistic still life uses continuous tones and optics” / “No outlines” |
| Core: 어두운 갈색 바탕의 측면광 | `분류.Core` | CAPSULE, PROBE_ANCHORS | “warm upper left light” |
| Core: 표면별 풍화와 섬유 결 | `분류.Core` | CAPSULE | “grainy matte, rough metal, refracting glass, woven cloth” |
| Core: 투명 유리와 거친 금속의 서로 다른 반사 | `분류.Core` | CAPSULE | “rough metal, refracting glass” |
| Supporting: 전경 초점과 흐린 배경 | `분류.Supporting` | CAPSULE, PROBE_ANCHORS | “shallow focus” / “foreground focus, a soft background” |
| Supporting: 제한된 적갈색 포인트 | `분류.Supporting` | CAPSULE, PROBE_ANCHORS | “accent #431d15 ≤ 2% of the image” |
| Supporting: 비대칭 정물 균형 | `분류.Supporting` | CAPSULE, PROBE_ANCHORS | “an asymmetric group” / “grounded asymmetry” |
| Supporting: 약한 국소 발광 | `분류.Supporting` | CAPSULE | “flame glow” |
| 1. 선 굵기 상대값 | `그림체.선.외곽선` | — | 독립 외곽 스트로크가 없어 굵기 값이 [해당 없음]. |
| 2. 색 역할 배분 | `그림체.색.역할 배분` | CAPSULE, PROBE_ANCHORS | “Content sets colors; none is backdrop only” / “Palette: #251b0d 13.9%” |
| 3. 액센트 전체 | `그림체.색.액센트 규칙` | CAPSULE, PROBE_ANCHORS | “dark saturated accent #431d15 ≤ 2% of the image” / “one rounded plane, never walls or leaves” |
| 4. 구도 | `공간.구도` | CAPSULE, PROBE_ANCHORS | “an asymmetric group 59.1% high” / “the subject group fills about 59.1% of frame height, with edge cropping” |
| 5. 장식 | `장식.개수` | CAPSULE, PROBE_ANCHORS | “no decorative marks” |
| 6. 모노크롬 | `생성 규칙.게이트 판정` | — | `strict_monochrome_*` 게이트가 생략되었고 엄격한 단색이 아님. |
| 7. 재질 사전 | `재질` | CAPSULE | “grainy matte, rough metal, refracting glass, woven cloth, waxy organics, veined leaves, flame glow, and worn walls” |
| 8. 곡면·면분할 | `그림체.형태.곡면 처리` | CAPSULE, PROBE_ANCHORS | “Use curved gradients” / “Use continuous gradients” |
| 9. 캐스트 섬도 | `그림체.명암.캐스트 섬도` | CAPSULE, PROBE_ANCHORS | “soft #100b05 contact shadows without separable length” |
| 10. 인물 | `인물` | FIGURE | “none” |
| 11. 부정 절 | `생성 규칙.부정 절` | NEGATIVE | “Avoid cartoon illustration, impressionist painting, watercolor illustration, stylized 3D rendering” |
| 12. 기존 규칙 | `입력`, `생성 규칙` | 전 섹션 | 과정 서술·고유명사·[해당 없음] 값을 실지 않음. |
| 13. 폼 섬도 | `그림체.명암.폼 섬도` | CAPSULE, PROBE_ANCHORS | “one soft shadow region per rounded form” |
| 14. 하이라이트·액센트 hex | `그림체.색.팔레트`, `재질.발광체` | CAPSULE, PROBE_ANCHORS | “10.9% #998662” / “brightest #f8f6ef” |
| 15. Core 장식·배경 기하 | `분류.Core`, `장식`, `공간.배경·지면` | CAPSULE, PROBE_ANCHORS | “no decorative marks” / “a dark indoor setting without white voids” |
| 16. 선의 층별 문장 | `그림체.선.적용 범위` | CAPSULE, PROBE_ANCHORS | “value separates soft forms, hard glass, lost leaves” |
| 17. 내부선 양·역할 | `그림체.선.내부선`, `디테일.묘사 밀도` | CAPSULE, PROBE_ANCHORS | “about seven structural boundaries and two front bands” / “no decorative marks” |
| 18. 묘사 예산 | `디테일.묘사 밀도` | CAPSULE, PROBE_ANCHORS | “Detail budget: medium” |
| 19. 수치 신뢰도 | `디테일.묘사 밀도.실측 개수`, `그림체.색.액센트 규칙.상한` | CAPSULE, PROBE_ANCHORS | “about seven structural boundaries and two front bands” / “accent #431d15 ≤ 2%” |
| 20. 열거 금지 | 컴파일 규칙 | CAPSULE, PROBE_ANCHORS | 내부 선은 구조 경계와 반복 띠의 개수·역할로 요약함. |
| 21. 결속형 부호 | `장식.어휘.결속 유형` | — | [해당 없음], 부호 표본 0. |
| 22. 액센트 입도·장식 개수 분리 | `그림체.색.액센트 규칙.입도`, `장식.개수` | CAPSULE, PROBE_ANCHORS | “one rounded plane” / “no decorative marks” |
| 23. 자연문·단어 예산 | `디테일.묘사 밀도.등급` | CAPSULE, PROBE_ANCHORS | 자연문 문장으로 작성하고 등급 3 상한과 절대 상한을 검사함. |
| 24. 키 | `그림체.명암.키` | CAPSULE, PROBE_ANCHORS | “In daylight, target mean luminance about 19%, near black about 58% without a featureless black image” |
| 25. 장면 요약 정제 | `scene_summary.md` | SCENE | “An indoor table holds one spherical object, two vessels, and one fruit.” |
| 26. 없음의 전달 | `장식.어휘`, `장식.운동 부호`, `그림체.질감·마감.패턴 채움` | CAPSULE, NEGATIVE, PROBE_ANCHORS | “no decorative marks” / “no speed lines” / “no overall pattern fill” |
| 27. 눈 처리·매체 선택값 | `그림체.매체.엔진`, `인물.눈.처리` | CAPSULE, FIGURE | “Photorealistic still life uses continuous tones and optics” / 인물 표본과 장면 인물이 0이어서 “none”. |
| 28. 눈 절 | `인물.눈` | — | 전부 [해당 없음], 장면 인물 0. |
| 29. 비례 절 | `인물.비례`, `인물.체형` | — | 전부 [해당 없음], 장면 인물 0. |
| 30. 계열 혼합 절 | `인물.계열 혼합` | — | 전부 [해당 없음], 장면 인물 0. |
| 31. 형태 어휘·선 위계 | `그림체.형태`, `그림체.선.위계 단수` | CAPSULE | “ellipses, cylinders, spheres, and leaf lenses mix straight and curved contours”; 선 위계는 [해당 없음]이고 형태 어휘는 Core가 아니므로 PROBE_ANCHORS에서 생략. |
| 32. 포즈 절 | `인물.포즈 문법` | — | 전부 [해당 없음], 장면 인물 0. |
| 33. 명암 면·그래픽 구성 | `그림체.명암.폼 섬도`, `그림체.명암.하이라이트`, `질감·마감.패턴 채움` | CAPSULE, PROBE_ANCHORS | “one soft shadow region per rounded form” / “highlights stay reflective” / “no overall pattern fill” |
| 34. 인접 계열 부정·속도선 | `생성 규칙.부정 절.인접 계열`, `장식.운동 부호` | NEGATIVE | “Avoid cartoon illustration, impressionist painting, watercolor illustration, stylized 3D rendering” / “no speed lines” |
| 35. FIGURE 순서·상한 | `인물`, `scene_summary.md` | FIGURE | 장면 인물 0이므로 “none”. |
| 36. 방향어·우선순위 줄 | `인물.비례`, `분류.Core` | — | 인물 비례가 [해당 없음]이고 별도 우선순위 단계의 범위임. |
