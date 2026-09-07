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
