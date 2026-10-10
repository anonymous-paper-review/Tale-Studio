## CAPSULE
Photorealistic shading renders rough fiber and corrosion without brush marks or contours. Use spheres and folded surfaces, plus elliptical cylinders tapering into truncated cones; alternate straight and curved soft edges around irregular gaps, without hatching or secondary outlines. Gradients and radial falloff model curves; architecture stays matte, corroded metal reflects diffusely, stained glass distorts transmission, cloth shows fiber, organics and plants stay opaque, and cores bloom without aerial light cones. Low light means 12% luminance and 73% near black, not bright; use one continuous soft shadow mass, no cell shapes, and soft irregular #07090a contact shadows merge outward. Use #343029 at 14.1%, #5f5649 at 10.9%, and #121210, #090a0a, and #0c0d0c at 13.7% each; no hue is backdrop only, no object plane is uniform, and large planes average 24% saturation. Accent #6c4f32 ≤ 0% of the image and accent #3c5769 ≤ 0% of the image as saturated spots; form two broad diffuse lit areas, never dark folds, keep #fbfaf7 in tiny cores, with undistorted lens perspective, shallow focus, and matte supports without tiles or reflections, unless the scene specifies its own backdrop. Detail budget: maximal; texture fills surfaces; cloth carries about six broad fold boundaries and about three large hem protrusions, with no discrete value steps, printed repeats, or decorative marks.

## NEGATIVE
Avoid clean product photography, glossy 3D rendering, flat vector illustration, anime cel animation; screen borders and moire; high key lighting, cel shading, ink outlines, plastic gloss; copied still life arrangements, identical window layouts or wall lamps, repeated wilted plants; bokeh dot fields, tiled patterns, wet floor reflections, geometric linework, speed lines, readable text, and logos.

## SCENE
An indoor still life with a window contains a spherical object, folded cloth, two containers, one fruit, and one potted plant on a table. The objects overlap from front to back, part of the cloth hangs below the front edge, the viewpoint is slightly above the objects, and no people are present.

## PROBE_ANCHORS
Use elevated undistorted perspective, foreground focus, and softened background. No outlines; soft transitions define forms, without hatching or secondary contours. Use continuous gradients with no value steps, one soft shadow mass, no cell shapes, and soft irregular #07090a contact shadows merge outward. Low light means 12% luminance and 73% near black, not bright; large planes average 24% saturation. No hue is backdrop only: muted #343029 and #5f5649 lead; #fbfaf7 marks tiny cores. Accent #6c4f32 ≤ 0% of the image and accent #3c5769 ≤ 0% of the image as saturated spots; form two broad diffuse lit areas, never dark folds. Use matte ground without tiles or reflections, asymmetrical overlap, and no decorative marks, unless the scene specifies its own backdrop. Keep foreground forms near 34.13% and 15.77% of image height. Detail budget: maximal; texture fills surfaces, with about six broad folds and three large hem protrusions, and no printed repeats.

## FIGURE
none

## COVERAGE
| 항목 | 출처 key | 실린 섹션 | 실린 절(영문 원문 발췌) |
|---|---|---|---|
| Core: 근흑 73%의 로우키 연속 명암 | `분류.Core`, `그림체.명암.키` | CAPSULE, PROBE_ANCHORS | “Low light means 12% luminance and 73% near black, not bright” |
| Core: 재료마다 다른 거친 표면 결 | `분류.Core`, `그림체.질감·마감` | CAPSULE, PROBE_ANCHORS | “rough fiber and corrosion” / “texture fills surfaces” |
| Core: 낮은 채도의 냉온 조명 대조 | `분류.Core`, `그림체.색.온도` | CAPSULE, PROBE_ANCHORS | “form two broad diffuse lit areas, never dark folds” |
| Core: 윤곽선 없이 암부로 합쳐지는 실루엣 | `분류.Core`, `그림체.선.외곽선` | CAPSULE, PROBE_ANCHORS | “without hatching or secondary outlines” |
| Supporting: 국소 발광 번짐 | `분류.Supporting`, `그림체.조명.블룸·할레이션` | CAPSULE | “cores bloom” |
| Supporting: 제한된 림 반사 | `분류.Supporting`, `그림체.명암.하이라이트` | CAPSULE | “corroded metal reflects diffusely” |
| Supporting: 소프트 접지 | `분류.Supporting`, `그림체.명암.캐스트 섀도` | CAPSULE, PROBE_ANCHORS | “soft irregular #07090a contact shadows merge outward” |
| Supporting: 전경과 배경의 초점차 | `분류.Supporting`, `사진성.피사계 심도` | CAPSULE, PROBE_ANCHORS | “shallow focus” / “foreground focus, and softened background” |
| 1. 선 굵기 상대값 | `그림체.선.외곽선.굵기` | — | `[해당 없음]` 독립 윤곽 스트로크가 없어 굵기를 만들지 않음 |
| 2. 역할 배분 | `그림체.색.역할 배분` | CAPSULE, PROBE_ANCHORS | “no hue is backdrop only, no object plane is uniform” |
| 3. 액센트 전부 | `그림체.색.액센트 규칙` | CAPSULE, PROBE_ANCHORS | “Accent #6c4f32 ≤ 0% of the image and accent #3c5769 ≤ 0% of the image as saturated spots” |
| 4. 구도 | `공간.구도` | PROBE_ANCHORS, SCENE | “Keep foreground forms near 34.13% and 15.77% of image height” |
| 5. 장식 | `장식` | CAPSULE, PROBE_ANCHORS | “no decorative marks” |
| 6. 모노크롬 | `그림체.색.모노크롬 엄격도`, `생성 규칙.게이트 판정` | — | 엄격한 단색이 아니며 관련 게이트도 생략됨 |
| 7. 재질 사전 | `재질` | CAPSULE | “architecture stays matte, corroded metal reflects diffusely, stained glass distorts transmission, cloth shows fiber, organics and plants stay opaque” |
| 8. 곡면·면분할 | `그림체.채움.토폴로지`, `그림체.형태.곡면 처리` | CAPSULE, PROBE_ANCHORS | “Gradients and radial falloff model curves” / “no discrete value steps” |
| 9. 캐스트 섀도 | `그림체.명암.캐스트 섀도` | CAPSULE, PROBE_ANCHORS | “soft irregular #07090a contact shadows merge outward” |
| 10. 인물 | `인물` | FIGURE | “none” |
| 11. 부정 절 | `생성 규칙.부정 절` | NEGATIVE | “Avoid clean product photography, glossy 3D rendering, flat vector illustration, anime cel animation” |
| 12. 과정 서술·해당 없음·외삽 | 전체 신뢰도 태그 | 전 섹션 | — 과정 서술을 쓰지 않고 `[해당 없음]`을 생략했으며 장면에 불필요한 `[외삽]`을 싣지 않음 |
| 13. 폼 섀도 경도 | `그림체.명암.폼 섀도` | CAPSULE, PROBE_ANCHORS | “one continuous soft shadow mass, no cell shapes” |
| 14. 하이라이트·소면적 액센트 hex | `그림체.색.팔레트.Highlight`, `그림체.색.팔레트.Accent` | CAPSULE, PROBE_ANCHORS | “keep #fbfaf7 in tiny cores” |
| 15. Core 장식·배경 기하 | `분류.Core`, `공간.배경·지면` | — | Core에 장식이 없고 패널·무대막·그래픽 배경이 `[해당 없음]` |
| 16. 선의 층별 문장 | `그림체.선.적용 범위` | CAPSULE, PROBE_ANCHORS | “without hatching or secondary outlines” |
| 17. 내부선의 양·역할 | `그림체.선.내부선` | CAPSULE, PROBE_ANCHORS | “alternate straight and curved soft edges” / “about six broad fold boundaries” |
| 18. 묘사 예산 | `디테일.묘사 밀도` | CAPSULE, PROBE_ANCHORS | “Detail budget: maximal; texture fills surfaces” |
| 19. 수치의 신뢰도 | `디테일.묘사 밀도.실측 개수` | CAPSULE, PROBE_ANCHORS | “about six broad fold boundaries and about three large hem protrusions” |
| 20. 종류 열거 금지 | 전체 컴파일 규칙 | 전 섹션 | — 재료는 종류만 나열하지 않고 각 광학·표면 역할로 서술함 |
| 21. 결속형 부호 제외 | `장식.어휘.결속 유형` | — | `[해당 없음]` 결속형 부호가 없음 |
| 22. 액센트 입도≠장식 개수 | `그림체.색.액센트 규칙.입도`, `장식.개수` | CAPSULE, PROBE_ANCHORS | “form two broad diffuse lit areas” / “no decorative marks” |
| 23. 자연문·단어 예산 | CAPSULE, PROBE_ANCHORS 형식 규칙 | CAPSULE, PROBE_ANCHORS | “Photorealistic shading” |
| 24. 키 절 | `그림체.명암.키` | CAPSULE, PROBE_ANCHORS | “Low light means 12% luminance and 73% near black, not bright” |
| 25. 장면 요약 정제 | `scene_summary.md` | SCENE | “An indoor still life with a window contains a spherical object, folded cloth, two containers, one fruit, and one potted plant on a table.” |
| 26. 없음의 전달 | `그림체.선`, `그림체.질감·마감.패턴 채움`, `장식` | CAPSULE, PROBE_ANCHORS, NEGATIVE | “without hatching or secondary outlines” / “no printed repeats” / “no decorative marks” |
| 27. 눈 처리·매체 선택값 | `인물.눈.처리`, `그림체.매체.엔진` | CAPSULE, FIGURE | “Photorealistic shading”; 눈 처리는 인물 표본이 없어 `none` |
| 28. 눈 절 | `인물.눈` | — | 전 하위 값이 `[해당 없음]`이고 장면 인물이 0명이므로 FIGURE는 `none` |
| 29. 비례 절 | `인물.비례`, `인물.체형` | — | 전 하위 값이 `[해당 없음]`이고 장면 인물이 0명 |
| 30. 계열 혼합 절 | `인물.계열 혼합` | — | 전 하위 값이 `[해당 없음]`이고 장면 인물이 0명 |
| 31. 형태 어휘·선 위계 | `그림체.형태.도형 어휘`, `윤곽 리듬`, `네거티브 스페이스`, `그림체.선.위계 단수` | CAPSULE | “Use spheres and folded surfaces, plus elliptical cylinders tapering into truncated cones” / “alternate straight and curved soft edges around irregular gaps”; 선 위계는 `[해당 없음]` |
| 32. 포즈 절 | `인물.포즈 문법` | — | 전 하위 값이 `[해당 없음]`이고 장면 인물이 0명 |
| 33. 명암 면·그래픽 구성 | `그림체.명암.폼 섀도`, `그림체.명암.하이라이트`, `그림체.질감·마감.패턴 채움` | CAPSULE, PROBE_ANCHORS | “one continuous soft shadow mass” / “no discrete value steps” / “matte supports without tiles or reflections” |
| 34. 인접 계열 부정·속도선 | `생성 규칙.부정 절.인접 계열`, `장식.운동 부호` | NEGATIVE | “Avoid clean product photography, glossy 3D rendering, flat vector illustration, anime cel animation” / “speed lines” |
| 35. FIGURE 순서와 상한 | `인물`, `scene_summary.md` | FIGURE | “none” |
