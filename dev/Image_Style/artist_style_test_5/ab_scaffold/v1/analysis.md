# Style Card — refer5
## 1. 분석
### 14-facet 통제 서술
| facet | 서술 |
|---|---|
| 매체 | 종이에 청색 계열 잉크와 연한 회색 채움을 얹은 듯한 플랫 일러스트 문법이다. 질감은 촬영된 종이 입자처럼 약하게 보이지만, 실제 렌더 규칙은 저채도 배경 위의 단순 선화와 제한 팔레트 채움에 가깝다. |
| 형태 | 항구 건물, 선박, 작은 섬 같은 사물을 단순 기하 덩어리로 압축한다. 직육면체, 둥근 선체, 낮은 원형 섬처럼 큰 형태를 먼저 잡고, 창문과 난간은 작은 반복 기호로 붙인다. |
| 선 | 외곽선은 가장 굵고, 사물 내부 구조선은 중간, 배경 내부선과 물결·장식선은 가장 얇다. 선은 완전한 제도선이 아니라 손으로 그은 듯 살짝 흔들리고, 모서리에서 미세하게 어긋난다. |
| 명암 | 강한 그라디언트 없이 2단계에 가깝다. 기본 면은 밝은 회색 또는 여백으로 두고, 그림자는 한쪽에 넓은 청회색 면으로 깔며, 강조부는 진한 청색 단색으로 채운다. |
| 팔레트hex | 측정 팔레트는 `#8b8b93` 13.9%, `#bebfbe` 13.4%, `#b9baba` 13.2%, `#abacaf` 12.9%, `#b2b3b3` 12.8%, `#97979c` 12.2%, `#a3a4a7` 12.2%, `#585d88` 9.5%이다. 시각적 핵심은 밝은 회색 바탕, 청회색 선, 진한 청색 포인트의 3값 제한 팔레트다. |
| 조명 | 특정 광원보다 도식적 투영 그림자를 우선한다. 그림자는 사물 왼쪽 아래나 아래쪽으로 납작하게 밀리며, 표면 광택이나 반사 하이라이트는 거의 없다. |
| 가장자리 | 실루엣은 둥근 코너와 직선이 섞인 깨끗한 가장자리지만, 선 끝은 손그림처럼 닫힘이 약간 느슨하다. 작은 물결, 구름, 장식 표식은 완전히 대칭으로 맞물리지 않는다. |
| 재질규칙 | 금속은 반짝임보다 얇은 청회색 윤곽과 작은 리벳·창문 반복으로 표시한다. 유리는 하이라이트 없이 진한 청색 또는 밝은 회색 평면으로 처리하고, 천은 주름 대신 단순 외곽과 한두 개의 내부선으로 처리한다. 유기물과 식물은 줄기와 잎을 기호화해, 같은 크기로 반복하지 않고 작은 흔들림을 둔다. |
| 질감 | 면 내부 질감은 거의 없고 플랫 채움 비중이 높다. 단, 전체에 흐릿한 촬영 입자와 종이 회색이 깔려 있어 완전한 디지털 벡터보다 부드럽고 저대비로 보인다. |
| 디테일밀도 | 큰 사물에는 창문, 갑판, 난간, 점열 같은 미세 요소가 중간 밀도로 들어간다. 배경은 비워 두되, 작은 야자수·물결·구름 기호를 띄엄띄엄 배치해 공간을 채운다. |
| 카메라 | 낮은 등각 투시 또는 사선 조감이다. 수평선 없이 위에서 내려다보며, 원근 수렴은 약하고 각 사물은 장난감 모형처럼 독립적으로 읽힌다. |
| 구도 | 좌측 건물과 우측 선박이 큰 덩어리로 균형을 이루고, 우하단의 작은 섬이 보조 초점을 만든다. 화면에는 넓은 여백이 남고, 사물들은 서로 닿지 않거나 가느다란 길·부두로만 연결된다. |
| 모티프 | 항구, 선박, 부두, 둥근 창, 난간, 야자수, 작은 구름 모양, 물결선, 점열 장식이 반복된다. 반복 장식은 균일 간격보다 불규칙한 리듬을 가진다. |
| 불완전성 | 사물과 장식은 완전 대칭이 아니며, 정렬도 완벽한 격자로 맞지 않는다. 선 굵기 위계가 있고, 작은 반복 요소는 크기·간격·각도가 조금씩 달라 손그림의 편차를 유지한다. |

### 계산 통계 반영
| 항목 | 값 | 해석 |
|---|---:|---|
| 채도 평균 | 6% | 거의 무채색 회색계 기반이며, 청색 포인트만 강하게 작동한다. |
| 명도 평균 | 66% | 전반적으로 밝은 중간 회색 배경과 낮은 대비의 선화가 중심이다. |
| 강엣지 픽셀 | 13.0% | 외곽선과 내부 디테일이 충분히 보이지만, 과밀한 펜화는 아니다. |
| 플랫 8px 블록 | 58% | 그라디언트·재질 텍스처보다 평면 채움이 우세하다. |

### 생성 통제 포인트
대칭 구조물, 균일 선굵기, 균등 장식 배치로 회귀하지 않도록 사물의 좌우와 반복 장식을 미세하게 불규칙하게 둔다. 선화는 외곽 실루엣 > 사물 내부선 > 배경 내부선 순서로 얇아져야 하며, 창문·점열·식물·물결은 같은 간격으로 줄 세우지 않는다.
## 2. 특징 분류
### Core
- 제한된 회색 팔레트와 청색 포인트: `#bebfbe`, `#b9baba`, `#abacaf`, `#8b8b93`, `#585d88` 중심.
- 3단계 선 위계: 외곽 실루엣이 가장 굵고, 사물 내부선은 중간, 배경 장식선은 가장 얇다.
- 플랫 채움과 낮은 대비의 도식적 그림자.
- 낮은 등각 투시의 사선 조감, 수평선 없는 독립 모형 같은 배치.
- 완벽한 대칭과 균등 간격을 피하는 손그림식 불완전성.

### Supporting
- 창문, 점열, 난간, 작은 내부 패널을 통한 중간 밀도 디테일.
- 둥근 모서리와 직선 기하가 섞인 단순 건축·운송수단 형태.
- 여백 많은 배경 위에 작은 구름형 표식, 물결선, 식물 기호를 흩뿌리는 구성.
- 종이 촬영처럼 보이는 저채도 회색 입자감.
- 그림자는 왼쪽 아래나 아래쪽으로 납작하게 붙는 청회색 면으로 처리.

### Content-bound
- 항구 건물, 선박, 등대형 구조물, 작은 섬, 부두, 야자수, 물 위 장면.
- 선체 창문 배열, 갑판 장치, 부두 연결로 같은 특정 소재의 기능적 장식.
- 해변·항만을 암시하는 물결선과 항해 관련 소품.
## 3. CAPSULE
Use a low-isometric hand-drawn flat illustration style on a light gray paper-like ground, with muted gray fills and a restrained blue accent palette: `#bebfbe`, `#b9baba`, `#abacaf`, `#8b8b93`, `#585d88`, plus sparse deep blue fills. Keep linework in three clear weights: outer silhouettes thickest, object interiors medium, background interior marks thinnest; furniture, buildings, props and garments are never perfectly symmetric, and nothing lines up in a perfect grid. Render light as simple flat cast shadows and two-value shading, with no gradients or glossy highlights: metal becomes matte outlines plus rivets or panel marks, glass becomes flat blue or pale gray panes, cloth becomes simplified silhouettes with one or two crease lines, and plants or organic forms become small uneven icons. Use small windows, dots, rails, waves, cloud-like marks, and plant symbols in uneven irregular rhythm, never evenly spaced.
## 4. FIGURE_RULES
[EXTRAPOLATED] Figures should be compact, simplified, and slightly top-down like small model pieces, with heads and torsos built from rounded geometric shapes, minimal facial features using tiny blue-gray dots or short strokes, and no realistic shading. Hair should read as a single matte shape or a few chunky curved strokes, hands as mitten-like marks or tiny line ends, and clothing as simple blocky silhouettes with a few medium-weight seams or collar lines. Keep body posture readable through silhouette, avoid anatomical detail, use the same three-tier line hierarchy as objects, and make accessories or garment decorations irregularly spaced rather than mirrored or gridded.
## 5. NOTES
생성 시 소재가 달라져도 청색 포인트와 회색 바탕의 제한 팔레트를 유지한다. 장식 요소가 너무 균등하게 반복되면 이 스타일의 손그림 편차가 사라지므로, 창문·점·식물·물결은 의도적으로 크기와 간격을 흔든다.
