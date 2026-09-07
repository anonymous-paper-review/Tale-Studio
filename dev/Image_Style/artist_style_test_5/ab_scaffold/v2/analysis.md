# Style Card — refer5
## 1. 분석
### 1-0. 콘텐츠/스타일 분리
| 구분 | 판정 |
|---|---|
| 반복 가능한 스타일 | 높은 시점의 평행 투영, 단순한 건물/소품 덩어리, 남청색 선화, 회색 바탕과 흰 면, 제한된 파란 포인트, 그림자도 선명한 납작 면으로 처리하는 방식은 다른 소재에도 반복 가능한 스타일이다. |
| Content-bound | 항구 건물, 큰 배, 등대, 야자수, 작은 돛단배, 하트 모양 낙서는 장면 소재다. 중립화할 때는 같은 조형 문법의 작은 부호나 소품으로 바꾸되 특정 조합을 고정하지 않는다. |
| 입력 아티팩트 | 화면 촬영으로 보이는 전체 회색 캐스트, 미세한 노이즈, 약한 흐림, 밝기 불균일은 스타일에서 제외한다. 실측 hex는 기록하되 생성 팔레트는 더 깨끗한 냉회색/흰색/남청색으로 보정한다. |

### 1-1. 14 facet 체크리스트
| # | facet | 통제 서술 | 등급 |
|---|---|---|---|
| 1 | 매체·기본 렌더링 | 의도된 렌더링은 플랫 디지털 잉크 또는 셀식 spot-color 일러스트처럼 보인다. 붓 결이나 안료 번짐보다 균일한 면 채움, 굵은 남청색 윤곽, 제한된 단색 포인트가 우세하다. 촬영 노이즈와 회색 캐스트는 입력 아티팩트다. | Core |
| 2 | 형태 언어 | 형태는 장난감 같은 축약형 덩어리를 먼저 잡고, 모서리는 약간 둥글리며, 건물과 배도 직선 기반에 완만한 곡선을 섞는다. 곡선:직선 비율은 약 35:65이고, 세부 돌기는 최소화된다. 잎, 창, 난간, 작은 물결도 같은 단순 아이콘 문법으로 반복된다. | Core |
| 3 | 선 | 외곽선은 필수이며 검정이 아니라 어두운 남청색 계열이다. 선 위계는 외곽선 > 사물 내부선 > 배경 내부선 순으로 얇아지고, 완전 균일하지 않은 2~3단계 두께를 가진다. 선은 대부분 연속적이지만 손그림 같은 미세한 떨림과 어긋남이 있다. | Core |
| 4 | 명암 구조 | 전체는 밝은 high-key다. 명암은 배경 회색, 흰 물체 면, 중간 그림자, 진한 선/포인트의 3~4단계로 제한된다. 순검정은 없고, 큰 그림자 덩어리는 물체 아래쪽에 납작한 파란 회색 면으로 붙는다. | Core |
| 5 | 색상 팔레트 | 실측은 회색 캐스트 때문에 `#8b8b93`, `#bebfbe`, `#b9baba`, `#abacaf`, `#b2b3b3`, `#97979c`, `#a3a4a7`, `#585d88`에 몰린다. 보정 팔레트는 Primary 냉회색/바탕 `#c7c8c7` 58%, Secondary 흰 면 `#f1f1ec` 20%, Accent 선명한 파랑 `#2446d8` 7%, Shadows 남청 회색 `#596091` 11%, Highlights `#ffffff` 4%로 본다. 전체 채도는 낮지만 포인트 파랑만 선명하다. | Core |
| 6 | 조명 | 특정 광원보다 균일한 확산광에 가깝다. 그림자는 좌하단 또는 물체 아래로 붙는 단순 cast shadow이며 경계가 선명하다. 림라이트, 블룸, 발광, 강한 역광은 해당 없음. | Supporting |
| 7 | 가장자리 | 의도된 가장자리는 전반적으로 선명하다. 면 경계와 그림자 경계가 모두 hard edge이며, 중심/주변 초점 차이는 없다. 약한 흐림은 촬영 아티팩트로 제거한다. | Core |
| 8 | 재질 렌더링 | 재질은 사실적 질감보다 같은 선화와 플랫 면으로 번역된다. 세부 규칙은 아래 재질 사전 표를 따른다. | Core |
| 9 | 질감·붓 터치 | 의도된 표면 질감은 거의 없다. 전면에 균일하게 보이는 미세 노이즈는 촬영/압축 아티팩트이며, 생성 시에는 매끈한 플랫 면을 우선한다. 질감 역할은 선 떨림과 반복 해칭이 대신한다. | Supporting |
| 10 | 디테일 밀도 | 큰 실루엣은 단순하고 내부 디테일은 창, 점, 난간, 줄무늬처럼 작은 반복 요소에 집중된다. 배경은 넓은 여백과 몇 개의 작은 부호만 둔다. 반복 장식은 정렬된 격자가 아니라 느슨하고 불균등한 리듬이다. | Core |
| 11 | 원근·카메라·투영 | 높은 시점의 평행 투영이 핵심이다. 소실점이 드러나는 선원근보다 아이소메트릭에 가까운 비스듬한 투영을 쓰고, 시점은 약 30~45도 위에서 내려다본다. 피사계 심도와 렌즈 왜곡은 해당 없음. | Core |
| 12 | 구도 | 큰 구조물 2~3개를 비대칭으로 놓고, 그 사이를 얇은 길·부두·물결 같은 대각선 요소가 연결한다. 여백이 넓고, 작은 소품은 가장자리와 빈 공간에 흩어진다. 중립 보드에는 항구 구도 자체가 아니라 비대칭 균형과 넓은 여백 원칙만 적용한다. | Supporting |
| 13 | 분위기·감정 | 밝은 회색 여백, 낮은 전체 채도, 단순한 장난감식 축약, 선명한 파란 포인트 때문에 가볍고 정돈된 인상을 준다. 이 항목은 기록용이며 CAPSULE에는 넣지 않는다. | Supporting |
| 14 | 의도적 불완전성 | 선 간격, 창문 점, 난간, 작은 장식은 완벽히 등간격이 아니며, 투영도 기계적으로 정확하지 않다. 색은 대부분 선 안에 머물지만 가장자리 맞춤은 약간 느슨하다. 불완전성을 모두 제거하면 일반적인 깔끔한 벡터처럼 보이므로 유지해야 한다. | Core |

### 1-2. 재질 사전
| 재질 | 답할 것 |
|---|---|
| 무광 | 빛을 많이 흡수하는 사실 묘사보다 밝은 단색 면으로 처리한다. 표면 결은 생략하고, 음영은 큰 면 단위로 부드러운 그라데이션 없이 끊는다. 하이라이트는 거의 없거나 흰 면 자체로 대체한다. |
| 금속 | 거울 반사는 묘사하지 않고 흰 면, 남청색 윤곽, 1개의 짧은 하이라이트 선 정도로 단순화한다. 주변색 반사는 생략한다. |
| 유리 | 투명 굴절보다 파란 채움 또는 남청색 테두리로 표시한다. 창은 균일한 사각형/점 패턴이고 뒤쪽 사물 왜곡은 해당 없음. |
| 천 | 표본 부재. 외삽 시 큰 주름 덩어리 1~3개를 선으로만 넣고 섬유 결은 생략한다. 무게감은 실루엣의 둥근 처짐과 단색 그림자로 표현한다. |
| 유기물(과일·피부) | 표본 부재. 외삽 시 광택, 반점, 촉촉함은 최소화하고 1~2톤의 플랫 면과 남청색 선으로 처리한다. 피부도 사실적 혈색보다 낮은 채도와 단순 경계가 우선이다. |
| 식물 | 잎은 개별 사실 묘사가 아니라 작은 선 묶음과 아이콘형 잎 덩어리로 처리한다. 잎맥, 두께, 역광 투과는 생략하고, 줄기와 잎은 같은 남청색 선 위계 안에 둔다. |

### 1-3. 실측 신설 축
| # | 축 | 통제 서술 |
|---|---|---|
| 15 | 오버라이드 우선순위 | 투영 방식, 선 위계, 단순 조형, 플랫 재질 번역은 콘텐츠 지시를 덮어쓴다. 색은 기본적으로 콘텐츠 지시가 이길 수 있으나, 이 스타일에서는 회색/흰색 기반에 한두 개의 선명한 포인트만 허용하는 방식으로 압축한다. strict monochrome은 필수는 아니지만, 단일 파랑 포인트를 유지하면 재현성이 높다. |
| 16 | 색 분배 규칙 | 바탕과 큰 면은 `#c7c8c7`, `#f1f1ec` 계열이 75~80%를 차지한다. 남청 선과 그림자는 `#3f456f`~`#596091` 범위로 10~15%, 선명한 포인트는 `#2446d8` 중심으로 5~10%만 둔다. 포인트는 물, 창, 선택된 윗면, 작은 표식에 제한하고 모든 물체에 균등 배치하지 않는다. |
| 17 | 표본 부재 영역과 외삽 규칙 | 외삽: 인물, 실내, 야간, 근접 얼굴, 복잡한 곡면, 풍부한 재질 표본은 없다. 새 대상은 높은 평행 투영의 단순 덩어리로 바꾸고, 곡면은 몇 개의 각진 면과 굵은 외곽선으로 분절한다. 야간은 팔레트를 어둡게 하기보다 바탕 명도를 조금 낮추고 남청색 그림자 면을 늘리는 식으로 처리한다. |

### 1-4. Style Vector
| 축 | 값(0~5) | 근거 |
|---|---:|---|
| 선 두께 | 3.2 | 강엣지 13.0%와 굵은 외곽선이 뚜렷하다. |
| 선 변화 | 2.6 | 외곽/내부/배경 선의 3단계 위계가 있으나 극적인 필압 변화는 아니다. |
| 형태 단순화 | 4.2 | 건물, 배, 식물, 장식 모두 큰 덩어리와 아이콘으로 축약된다. |
| 채도 | 1.4 | 평균 채도 6%로 전체는 낮고 포인트 파랑만 높다. |
| 대비 | 2.1 | 순검정 없이 회색, 흰 면, 남청색 선의 제한 대비다. |
| 가장자리 경도 | 4.5 | 플랫 채움 58%, hard edge 위주다. |
| 텍스처 | 0.8 | 의도된 붓결은 거의 없고 입력 노이즈가 대부분이다. |
| 디테일 | 2.6 | 창, 점, 난간 같은 반복 내부선은 있으나 큰 면은 비어 있다. |
| 공간감 | 3.4 | 평행 투영으로 깊이는 있으나 렌즈 원근과 대기 원근은 없다. |
| 빛의 극적 성향 | 0.7 | 확산광과 단순 그림자 중심이다. |
| 색상 다양성 | 1.1 | 회색/흰색/남청/파랑으로 제한된다. |
| 불규칙성 | 2.7 | 손그림식 어긋남과 불균등 장식 리듬이 중간 정도 있다. |

## 2. 특징 분류
### Core
- 높은 시점의 평행 투영과 비스듬한 아이소메트릭식 공간 구성.
- 어두운 남청색 외곽선과 외곽선 > 내부선 > 배경선의 3단계 선 위계.
- 회색/흰색 기반의 밝은 high-key 면과 제한된 선명 파랑 포인트.
- 재질을 사실적으로 칠하지 않고 플랫 면, 단순 테두리, 짧은 해칭으로 번역하는 방식.
- 완벽한 격자나 대칭을 피하는 미세한 선 떨림, 불균등 간격, 느슨한 투영.

### Supporting
- 넓은 여백 안에 큰 덩어리와 작은 장식 부호를 흩어 놓는 구성.
- 낮은 채도와 밝은 배경에서 생기는 가볍고 정돈된 인상.
- 물결, 점, 짧은 해칭, 작은 아이콘형 장식으로 빈 공간을 조절하는 방식.
- 피사체 아래에 붙는 단순한 남청 회색 cast shadow.

### Content-bound
- 항구 건물, 큰 배, 등대, 야자수, 돛단배, 하트 모양 낙서의 특정 조합.
- 선박의 창문 수, 건물 배치, 부두 각도 같은 개별 장면 정보.
- 화면 촬영의 회색 캐스트, 미세 노이즈, 약한 흐림, 밝기 불균일.

## 3. CAPSULE
Use a flat digital ink and spot-color rendering with clean off-white planes, cool gray ground, dark navy-blue linework, and one saturated blue accent: primary `#c7c8c7`, secondary `#f1f1ec`, accent `#2446d8`, shadows `#596091`, line color around `#3f456f`, highlights `#ffffff`. Draw every subject as simplified isometric-like block forms with hard edges, no gradients, no black, and a three-level line hierarchy where outer silhouettes are thickest, object interiors are medium, and background interiors are thinnest. Translate materials into flat symbols: matte surfaces are blank light planes, metal gets only one or two short highlight strokes, glass becomes blue panels or outlined windows without refraction, cloth gets broad fold lines without fiber, organic surfaces use one or two flat tones, and plants become small icon-like leaf clusters without veins. Furniture, buildings, props and garments are never perfectly symmetric; nothing lines up in a perfect grid, small decorative marks follow an uneven irregular rhythm, never evenly spaced, and slight hand-drawn wobble and imperfect projection must remain.

## 4. FIGURE_RULES
[EXTRAPOLATED] Figures should be small, simplified, and built from rounded block shapes that follow the same isometric-like projection and navy line hierarchy as the objects. Use compact proportions with slightly oversized heads only when a close figure is required; facial features are minimal dots or short strokes, never detailed rendering, hair is a simple cap-like mass or a few grouped strokes, hands are mitten-like or indicated by tiny line hooks, and clothing is reduced to flat off-white or gray garment blocks with sparse navy fold lines and optional `#2446d8` accents limited to small panels or accessories.

## 5. NOTES
생성 시 항구, 배, 등대, 야자수, 하트 조합을 고정하지 말고 조형 문법만 옮긴다. 입력 이미지의 회색 촬영 캐스트를 그대로 복제하지 말고 보정 팔레트를 사용한다. 파랑 포인트를 과도하게 넓히거나 장식을 완벽한 등간격으로 정렬하면 스타일 재현성이 떨어진다.
