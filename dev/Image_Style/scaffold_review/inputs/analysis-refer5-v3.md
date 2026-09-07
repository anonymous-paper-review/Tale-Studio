# Style Card — refer5
## 0. META
Capture: [실측] ⓑ 화면 촬영본 / Artifacts: [실측] 회색 캐스트, 약한 모아레·센서 노이즈, 가장자리 흐림, 미세 원근 왜곡 / Coverage: [해당 없음] n=1; 반복 검증 불가; 부재 영역: 인물, 클로즈업, 야간, 실내, 금속, 천, 피부, 헤어, 과일 / Needs confirmation: #15 인물 표본 없음; #16 클로즈업·대형 오브젝트 미검증; #23 부재 도메인 외삽
## 1. 분석
| # | 축 | 값 | 등급 | 신뢰도 |
|---|---|---|---|---|
| 1 | 캡처/표현 계층 | [실측] ⓑ 화면 촬영본으로 보이며 회색 캐스트와 약한 흐림이 있어 촬영 아티팩트는 제거하고 그림 내부의 선·면 문법만 스타일 증거로 둔다. | Input | 높음 |
| 2 | 콘텐츠/스타일/아티팩트 분리 | [보정] 스타일 증거는 평행 부감, 청회색 선, 플랫 채움, 제한 팔레트이고 Scene-specific은 해안 교통 시설·수목·물결·기호 장식의 구체 배치이며 Artifacts는 회색 캐스트·모아레·노이즈다. | Input | 높음 |
| 3 | 신뢰도·확인 필요 | [실측] 투영·선·팔레트·배경 보정은 직접 보이고, 인물·표본 없는 재질·클로즈업은 확인 필요다. | Input | 높음 |
| 4 | 다중 입력 커버리지 | [해당 없음] n=1; 반복률 산정 불가; 부재 영역은 인물 클로즈업, 실내 야간, 금속 천 피부 헤어 과일이다. | 해당 없음 | 높음 |
| 5 | 매체·렌더링 엔진 | [보정] 의도 렌더링은 디지털 잉크 선화와 플랫 셀 채움처럼 보이며 촬영된 화면 질감은 매체 특성에서 제외한다. | Core | 높음 |
| 6 | 투영·카메라·스테이징 | [실측] 얕은 아이소메트릭·평행 부감으로 시점은 높은 3/4이고 깊이는 낮으며 사진 렌즈식 심도나 강한 원근 수렴은 없다. | Core | 높음 |
| 7 | 형태 언어 | [실측] 큰 덩어리 우선의 단순 실루엣에 둥근 모서리와 각진 구조가 섞이고 직선이 우세하되 끝점과 작은 기호는 둥글게 마감된다. | Core | 높음 |
| 8 | 경계 시스템 | [보정] 선은 실측 #585d88에서 보정 #384071의 청회색 단색으로 외곽 3~4px, 내부 2px, 배경 내부 1~2px 위계가 있고 테이퍼는 거의 없다. | Core | 높음 |
| 9 | 채움 토폴로지 | [실측] 폐곡선 선화에 선택적 플랫 채움을 얹는 방식으로 흰 면이 많고 파랑 채움은 물·창·패널·하부 면에 제한되며 그라디언트는 보이지 않는다. | Core | 높음 |
| 10 | 명암·그림자 시스템 | [실측] 순검정 없이 고명도 저대비 값 체계이며 폼 섀도는 면별 명도차 1단계, 캐스트 섀도는 좌하향 플랫 오프셋 #b7c0df 계열이다. | Core | 높음 |
| 11 | 팔레트·색 분배 | [보정] 실측 상위색은 #8b8b93 13.9%, #bebfbe 13.4%, #585d88 9.5%이나 보정 분배는 Primary #FFFFFF 약60%, Secondary #f6f7f5 약16%, Line #384071 약9%, Accent #2441d4 약8%, Shadow #b7c0df 약7%로 strict near-monochrome이다. | Core | 중간 |
| 12 | 조명·발광 효과 | [실측] 발광체와 블룸은 없고 큰 확산광처럼 전체가 고명도이며 방향은 측면 명도차와 접지 그림자로만 약하게 암시된다. | Supporting | 높음 |
| 13 | 배경·지면 정규화 | [보정] 배경은 촬영 캐스트를 제거하면 순백 그래픽 보드로 복원되며 수평선·패턴 바닥 없이 플랫 오프셋 그림자만 지면을 만든다. | Core | 높음 |
| 14 | 재질 번역 사전 11종 | [실측] 재질 표본은 무광 구조면, 창 패널, 식물 부호, 물 부호, 건축 표면뿐이며 나머지는 공통 선·면·팔레트 문법으로만 외삽한다. | Supporting | 중간 |
| 15 | 인물 방언 | [외삽] 인물 표본은 0개이므로 FIGURE_RULES는 무얼굴 단순 미니어처 규칙으로 제한한다. | 해당 없음 | 낮음 |
| 16 | 스케일 의존 LOD | [실측] 관찰된 중원경 구조물은 외곽과 반복 내부선만 남기며, 외삽 대상인 원경 인물·클로즈업·대형 오브젝트는 이 디테일 상한을 넘지 않는다. | Supporting | 중간 |
| 17 | 디테일 밀도 | [실측] 밀도는 큰 구조물 내부선과 반복 창·점열에 몰리고 넓은 여백에는 짧은 기호만 드문드문 놓인다. | Supporting | 높음 |
| 18 | 질감·마감 | [보정] 의도된 마감은 종이결 없이 매끈한 디지털 플랫 면과 균일한 잉크선이며 촬영 노이즈·모아레·흐림은 질감으로 유지하지 않는다. | Core | 높음 |
| 19 | 정밀도·의도적 불완전성 | [실측] 선과 반복 간격은 손맛보다 정연한 기하가 우세하고 구성 배치는 비대칭으로 균형을 만든다. | Core | 높음 |
| 20 | 장식 모티프 시스템 | [실측] 작은 윤곽 기호와 물결·수목 부호는 화면의 낮은 점유율 장식으로 불균일 산포되고 전경을 통과하지 않는다. | Supporting | 높음 |
| 21 | 구도·여백 원칙 | [실측] 분리된 미니어처 덩어리를 넓은 순백 여백 위에 두고 겹침보다 간격과 얕은 연결선으로 비대칭 균형을 만든다. | Core | 높음 |
| 22 | 오버라이드 우선순위 | [추정] 생성기 기본값은 색·재질·렌즈 디테일을 보강하려 하므로 색은 strict near-monochrome을 기본 강제하고 명시 유저 지시만 이를 완화한다. | Control | 중간 |
| 23 | 표본 부재·외삽 규칙 | [외삽] 인물·곡면·야간·실내·원경·클로즈업·미표본 재질은 관찰된 평행 부감, 청회색 선, 플랫 채움, 낮은 대비를 넘지 않게 생성한다. | Control | 중간 |
| 24 | 부정 절(NEGATIVE) | [추정] 부정 절은 촬영 아티팩트, 사실 재질, 검정 외곽선, 제네릭 그라디언트, 장면 고정 소품 복제, 텍스트·로고를 배제한다. | Control | 높음 |
## 2. 재질 사전
| 재질 | 값 |
|---|---|
| 무광 | [실측] 빛을 넓게 흡수하는 흰색 플랫 면으로 표면 결은 없고 음영은 면 단위 1단계이며 하이라이트는 생략된다. |
| 금속 | [외삽] 표본 없음; 적용 시 #8/#9/#11의 공통 문법만 따른다. |
| 유리 | [실측] 창은 투명 굴절 없이 #2441d4 플랫 면이나 짧은 선 격자로 표시되고 뒤쪽 왜곡은 생략된다. |
| 천 | [외삽] 표본 없음; 적용 시 #8/#9/#11의 공통 문법만 따른다. |
| 유기물(과일) | [외삽] 표본 없음; 적용 시 #8/#9/#11의 공통 문법만 따른다. |
| 식물 | [실측] 잎맥 없이 짧은 선 묶음으로 개별 잎을 부호화하고 두께와 역광 투과는 표현하지 않는다. |
| 피부 | [외삽] 표본 없음; 적용 시 #8/#9/#11의 공통 문법만 따른다. |
| 헤어 | [외삽] 표본 없음; 적용 시 #8/#9/#11의 공통 문법만 따른다. |
| 액체/물 | [실측] 물은 #2441d4 플랫 채움이나 2~3개의 짧은 곡선 부호로 표현되고 투명도·반사·하이라이트는 생략된다. |
| 발광체 | [외삽] 표본 없음; 적용 시 #8/#9/#11의 공통 문법만 따른다. |
| 건축 표면 | [실측] 벽·바닥·도로는 플랫 면과 면별 명도차, 반복 창·점 패턴으로만 구분되며 재질 입자는 없다. |
## 3. Style Vector
| 축 | 값 | 접지 |
|---|---:|---|
| 선 두께 | 3.0 | [실측] 강엣지 픽셀 13.0%와 외곽 3~4px 관찰 |
| 채도 | 1.0 | [실측] 채도 평균 6%와 제한된 #2441d4 액센트 |
| 공간감 | 2.0 | [추정] 얕은 아이소메트릭 부감과 낮은 깊이 |
| 선 변화 | 2.0 | [추정] 외곽선이 내부선보다 약간 굵으나 선폭 히스토그램은 미구현 |
| 대비 | 1.5 | [실측] 명도 std 8과 순검정 부재 |
| 빛의 극적 성향 | 0.5 | [추정] 확산 고명도 처리와 발광 효과 부재 |
| 형태 단순화 | 4.0 | [추정] 큰 덩어리와 단순 실루엣 중심 |
| 가장자리 경도 | 3.5 | [실측] 강엣지 13.0%와 플랫 채움 |
| 색상 다양성 | 1.0 | [추정] 회색-청색 near-monochrome이며 hue 클러스터는 미구현 |
| 텍스처 | 1.0 | [실측] 플랫 8px 블록 58%로 의도 질감 낮음 |
| 디테일 | 2.0 | [실측] 플랫 블록 58% / [추정] 반복 내부선은 중간 이하 |
| 불규칙성 | 1.5 | [추정] 장식 산포는 불균일하나 구조 선과 간격은 정연함 |
## 4. 특징 분류
Core
- 화면 촬영 아티팩트를 제거한 순백 그래픽 보드.
- 얕은 아이소메트릭·평행 부감과 낮은 깊이.
- 보정 #384071 청회색 선, 외곽·내부·배경 내부의 3단계 선 위계.
- 폐곡선 선화와 선택적 플랫 채움, strict near-monochrome 팔레트.
- 고명도 저대비 값 체계와 #b7c0df 계열 플랫 오프셋 그림자.
- 매끈한 디지털 마감과 clean geometric regularity.

Supporting
- 작은 윤곽 기호와 물결·수목 부호의 낮은 점유율 장식.
- 반복 창·점열·패널이 만드는 중간 이하의 내부선 밀도.
- 장식 산포는 불균일 리듬을 따른다.
- 관찰 재질은 무광 구조면, 창 패널, 식물 부호, 물 부호, 건축 표면이다.

Content-bound
- Scene-specific: 해안 교통 시설, 선형 이동수단, 작은 수목, 물결 표시, 섬형 표식, 기호 장식의 구체 배치.
- Artifacts: 회색 캐스트, 약한 모아레, 센서 노이즈, 가장자리 흐림, 미세 원근 왜곡.

Gate 판정: 선 3단계 위계 삽입, 장식 불균일 산포 삽입, strict near-monochrome 삽입, 배경 순백 복원 삽입, 정연함 시그니처 명시, 물리 사진 질감 유지 미삽입, 인물 절은 [EXTRAPOLATED]로 제한.
## 5. CAPSULE
Restored from a screen photo, the intended image is clean digital ink with flat cell fills in a shallow isometric overhead stage, using blue-gray linework where outer silhouettes > object interior > background interior thinnest. On a restored intentional ground, pure white ground — no gray photographic cast, no moiré — high-key values use flat offset blue-gray shadows and strict near-monochrome: only the listed accent hue. The listed accent appears only in water, windows, panels, and undersides; observed materials translate as matte architecture, flat blue water symbols, and simple window panels, while missing materials keep the same closed-line, flat-fill, low-detail rules. The finish is smooth and polished with clean geometric regularity, and when decorative marks are used, keep an uneven irregular rhythm, never evenly spaced.
## 6. FIGURE_RULES
[EXTRAPOLATED] For people, use tiny simplified figures only when requested: compact proportions around 3 to 4 heads tall, rounded-rect torsos, dot-or-blank faces, mitten hands, blocky hair masses, minimal clothing panels, and poses built from clear side or three-quarter silhouettes; close-ups should add only two or three interior facial marks and preserve the same blue-gray outline hierarchy.
## 7. NEGATIVE
Avoid gray photographic cast, moiré, sensor noise, generic gradients, realistic material reflections, black outlines, drop shadows, evenly spaced decorations, copied scene objects, text, logos, and detailed human faces.
## 8. OVERRIDE
| axis | default | style | user override |
|---|---|---|---|
| 색 | [추정] 콘텐츠 고유색을 넓게 따름 | [실측] #FFFFFF/#f6f7f5 바탕, #384071 선, #2441d4 액센트의 strict near-monochrome | 명시 팔레트·대상 고유색 요청은 액센트 상한을 완화한다 |
| 재질 | [추정] 사실적 질감·반사 추가 후보 | [실측] 무광 플랫 면과 선기호 중심 | 특정 재질 요구 시 반사·투명도는 단순 부호로만 허용한다 |
| 조형/얼굴 | [추정] 얼굴·손·의상 디테일 보강 후보 | [외삽] 표본 없음; 무얼굴 단순 미니어처 규칙 | 클로즈업 인물 요구 시 최소 얼굴 부호만 허용한다 |
| 투영 | [추정] 장면별 렌즈 원근 후보 | [실측] 아이소메트릭에 가까운 평행 부감 | 정면·측면 지시가 있을 때만 축을 바꾸되 깊이는 얕게 유지한다 |
| 배경 | [추정] 회색 또는 스튜디오 그라디언트 후보 | [보정] 순백 지면과 플랫 오프셋 그림자 | 배경색 명시 시 낮은 채도 단색만 허용한다 |
Parameters: palette override 허용=조건부, dialect strength=medium, look options=restored white board / soft blue-gray stage, strict monochrome toggle=on by default.
## 9. QA_CHECKS
| 항목 | 확인할 것 |
|---|---|
| board | 순백 지면 위에 얕은 평행 부감과 제한 팔레트가 유지되는지 확인 |
| leakage | 특정 해안 이동수단·시설 배치를 그대로 복제하지 않았는지 확인 |
| capture | 회색 캐스트·모아레·촬영 흐림이 제거되었는지 확인 |
| dialect | 인물이나 미표본 재질이 공통 선·면 문법 안에서만 외삽되는지 확인 |
| override | 사용자가 지정한 색·배경이 strict near-monochrome 규칙과 충돌할 때 의도대로 우선되는지 확인 |
## 10. NOTES
인물 표본이 0개이므로 인물 2-ref 절 대신 무인 장면 절로 대체한다. 보정 팔레트의 면적 비율은 촬영 캐스트 제거 후의 생성용 추정값이다. 최종 생성물의 좋고 나쁨은 QA_CHECKS의 사실 항목을 근거로 별도 판정한다.
