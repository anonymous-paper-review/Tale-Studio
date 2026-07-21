# 자신만의 그림체를 분석하고 Neutral 이미지를 만드는 상세 워크플로

가능하다. 핵심은 그림의 소재나 캐릭터를 따라 하는 것이 아니라, 여러 작품에서 반복되는 **시각적 규칙만 분리해서 ‘스타일 지문’으로 만드는 것**이다.

전체 과정은 크게 세 덩어리로 나뉜다.

> **원본 수집 → 스타일 요소 분해 → 중립 장면으로 검증**

한 장만 보고 스타일을 정의하면 그 그림의 인물, 배경, 조명까지 스타일로 잘못 판단하기 쉽다. 가능하면 여러 작품을 함께 분석하고, 마지막에는 항상 동일한 중립 테스트 장면으로 검증하는 것이 가장 정확하다.

---

# 전체 작업 흐름

## 1단계. 스타일 분석의 목적부터 정하기

먼저 결과물을 어디에 사용할지 정해야 한다.

### A. 선택용 스타일 샘플
여러 그림체를 사용자가 보고 고르게 하는 용도.

- 같은 사물
- 같은 구도
- 같은 화면비
- 스타일만 다르게
- 차이가 한눈에 보여야 함

현재 만든 정물 이미지가 여기에 해당한다.

### B. I2I용 스타일 프리셋
새로운 인물이나 장면에 반복해서 적용하는 용도.

- 스타일 분석이 더 세밀해야 함
- 인물, 배경, 소재가 바뀌어도 유지되는 특징을 찾아야 함
- 색감뿐 아니라 선, 형태, 재질, 명암 규칙까지 필요함

### C. 스타일 학습용 데이터
전용 스타일 모델이나 어댑터 등을 만드는 용도.

- 이미지 수가 더 많이 필요함
- 작품 간 일관성, 해상도, 크롭 상태를 관리해야 함
- 특정 캐릭터나 구도가 스타일로 학습되지 않도록 해야 함

우선은 **A와 B를 함께 만드는 방식**이 가장 실용적이다.

---

# 2단계. 참고 작품을 수집하는 방법

## 권장 이미지 수

최소 3장, 권장 6~12장 정도가 좋다.

한 장만 있어도 분석할 수 있지만, 다음을 구분하기 어렵다.

- 그림체 자체의 특징
- 해당 작품의 일시적인 조명
- 특정 캐릭터의 디자인
- 특정 장면의 구도
- 우연히 사용된 색상

## 좋은 참고 이미지 구성

가능하면 아래처럼 다양하게 준비한다.

| 종류 | 권장 수 | 목적 |
|---|---:|---|
| 인물이 있는 장면 | 2~4장 | 얼굴, 신체, 옷 주름, 실루엣 확인 |
| 실내 또는 배경 | 2~3장 | 공간, 원근, 빛, 디테일 밀도 확인 |
| 사물 또는 클로즈업 | 1~3장 | 재질, 선, 표면 묘사 확인 |
| 밝은 장면 | 1~2장 | 하이라이트와 색 처리 확인 |
| 어두운 장면 | 1~2장 | 그림자와 대비 처리 확인 |

### 피해야 할 참고 세트

- 동일한 장면을 조금씩 크롭한 이미지들
- 전부 같은 캐릭터만 있는 이미지
- 전부 야간이거나 전부 역광인 이미지
- 해상도가 지나치게 낮은 이미지
- 팬아트, 공식 이미지, 생성 이미지가 섞인 세트
- 보정 필터가 각각 다르게 적용된 이미지

---

# 3단계. 참고 이미지를 세 그룹으로 나누기

이미지를 모은 뒤 바로 프롬프트를 작성하지 말고 세 그룹으로 분류하는 것이 좋다.

## Core — 핵심 작품

그림체를 가장 잘 대표하는 이미지.

- 선이 잘 보임
- 색감이 정상적으로 표현됨
- 작가의 일반적인 작업 방식이 드러남
- 과도한 실험작이 아님

전체 분석의 약 60~70%를 이 그룹에 기반한다.

## Variation — 변주 작품

같은 스타일이지만 다른 조명, 배경, 소재가 적용된 이미지.

이 그룹을 통해 어떤 특징이 고정되고 어떤 특징이 변하는지 확인할 수 있다.

예를 들어:

- 낮에도 밤에도 선 두께가 동일함
- 장면에 따라 팔레트는 달라지지만 그림자는 항상 보라색을 띰
- 소재가 달라도 가장자리는 항상 부드럽게 처리됨

이런 것이 실제 스타일 규칙이다.

## Outlier — 예외 작품

평소와 크게 다른 실험작, 콜라보, 특수 효과가 강한 그림.

참고는 하되 핵심 스타일 규칙에는 바로 포함하지 않는다.

---

# 4단계. 콘텐츠와 스타일을 분리하기

이 과정이 가장 중요하다.

예를 들어 어떤 그림에 다음 요소가 있다고 해보자.

- 붉은 머리 소녀
- 푸른 밤하늘
- 오래된 기차역
- 굵은 외곽선
- 그림자에 보라색 사용
- 얼굴은 단순하고 배경은 세밀함
- 거친 종이 질감

이 가운데 스타일인 것은 주로 다음이다.

- 굵은 외곽선
- 보라색 그림자
- 얼굴과 배경 사이의 디테일 대비
- 거친 종이 질감

반면 아래는 해당 작품의 내용일 가능성이 높다.

- 붉은 머리
- 소녀
- 기차역
- 밤하늘

## 분류 기준

각 특징마다 다음 질문을 해보면 된다.

> 이 요소가 다른 인물, 다른 공간, 다른 시간대에서도 반복되는가?

반복된다면 스타일일 가능성이 높고, 한 작품에서만 보이면 콘텐츠나 연출일 가능성이 높다.

---

# 5단계. 스타일을 Facet으로 분해하기

스타일 분석은 아래 항목으로 나누면 안정적이다.

---

## Facet 1. 매체와 기본 렌더링

먼저 무엇으로 만든 것처럼 보이는지 정의한다.

예시:

- 디지털 페인팅
- 셀 애니메이션
- 수채화
- 과슈
- 유화
- 연필과 잉크
- 3D 렌더
- 실사 사진
- 스톱모션
- 종이 콜라주
- 혼합 매체

여기서 중요한 것은 단순히 “수채화”라고 끝내지 않는 것이다.

```text
transparent watercolor washes,
visible cold-pressed paper texture,
soft pigment pooling near edges,
limited use of opaque highlights
```

처럼 재료가 실제로 어떻게 보이는지 적어야 한다.

---

## Facet 2. 형태 언어 Shape Language

사물과 인물을 어떤 형태로 단순화하는지 분석한다.

확인할 요소:

- 둥근 형태가 많은가, 각진 형태가 많은가
- 실루엣이 단순한가 복잡한가
- 인체 비율이 현실적인가 과장되는가
- 큰 덩어리를 먼저 표현하는가
- 작은 돌기와 세부 형태를 많이 넣는가
- 곡선과 직선 중 어느 쪽이 우세한가

예시:

```text
rounded silhouettes,
softly tapered limbs,
large simple shape masses,
few sharp corners,
compact proportions
```

또는:

```text
angular geometric silhouettes,
long narrow proportions,
sharp planar breaks,
hard mechanical contours
```

형태 언어는 인물뿐 아니라 잎, 옷, 건물, 구름에도 반복된다.

---

## Facet 3. 선 Linework

선이 있는 스타일이라면 매우 중요하다.

분석 항목:

- 외곽선 유무
- 선 두께
- 굵기 변화
- 선 색상
- 선의 매끄러움
- 끊어진 선인지 연속선인지
- 내부 묘사선의 양
- 그림자 경계가 선으로 표현되는지

기록 예시:

```text
medium-thick dark brown outlines,
subtle pressure variation,
clean continuous contours,
sparse interior detail lines,
slightly thinner lines on faces
```

검은색 선처럼 보여도 실제로는 검정이 아니라 짙은 남색이나 갈색일 수 있다. 이 차이를 확인해야 결과가 자연스럽다.

---

## Facet 4. 명암 구조 Value Structure

색을 제거하고 흑백으로 봤을 때의 규칙이다.

확인할 항목:

- 전체적으로 밝은가 어두운가
- 명암 단계가 몇 단계 정도인가
- 그림자 덩어리가 큰가 세분화되는가
- 검은 영역이 존재하는가
- 배경과 주인공의 밝기 차이
- 역광을 자주 쓰는가
- 얼굴 그림자를 얼마나 허용하는가

예시:

```text
high-key value structure,
compressed shadows,
soft separation between midtones,
very limited pure black
```

또는:

```text
strong three-value grouping,
deep black shadow masses,
bright isolated highlights,
minimal midtone range
```

색감을 아무리 비슷하게 만들어도 명암 구조가 다르면 같은 스타일처럼 보이지 않는다.

---

## Facet 5. 색상 팔레트

단순히 “파스텔”이나 “따뜻한 색”보다 구체적으로 분해해야 한다.

### 분석할 것

- 전체 채도
- 색상 수
- 따뜻함과 차가움
- 피부색 처리
- 그림자 색상
- 하이라이트 색상
- 포인트 컬러
- 배경과 주체의 색 분리 방식

### 권장 기록 방식

```text
Primary:
cream ivory, dusty rose, muted sage green

Secondary:
pale sky blue, warm beige

Accent:
small areas of saturated vermilion

Shadows:
desaturated lavender-gray

Highlights:
warm creamy white
```

색상 비율까지 적으면 더욱 좋다.

```text
60% warm neutral
20% muted green
15% dusty pink
5% saturated accent color
```

---

## Facet 6. 조명

스타일처럼 보이는 요소 중 상당 부분은 실제로 조명에서 나온다.

확인할 항목:

- 자연광 또는 인공광
- 광원의 방향
- 광원 크기
- 그림자 경계의 부드러움
- 키라이트와 필라이트의 비율
- 림라이트 사용 여부
- 광원 색상
- 역광·측면광·정면광
- 블룸, 할레이션, 발광 표현

예시:

```text
large diffused window light from the left,
soft warm key light,
high fill ratio,
gentle translucent backlighting on foliage,
broad highlights on reflective surfaces
```

---

## Facet 7. 가장자리 Edge Treatment

많이 놓치는 요소다.

같은 색과 선을 사용해도 가장자리 처리에 따라 그림체가 크게 달라진다.

분석 항목:

- 모든 경계가 선명한가
- 중심부는 선명하고 주변부는 흐린가
- 그림자 경계가 단단한가 부드러운가
- 수채화처럼 번지는 부분이 있는가
- 형태 일부가 배경에 녹아드는가
- 재질별로 가장자리 처리 방식이 다른가

예시:

```text
sharp silhouette edges,
soft internal shading edges,
lost edges in shadow areas,
slightly blurred distant background
```

---

## Facet 8. 재질 렌더링

중립 정물 보드를 만드는 핵심이다.

각 스타일에서 동일한 재질이 어떻게 번역되는지 따로 적어야 한다.

### 무광 재질

- 빛을 얼마나 흡수하는가
- 표면 결이 있는가
- 음영이 부드러운가
- 하이라이트가 있는가

### 금속

- 거울처럼 반사하는가
- 반사가 단순화되는가
- 하이라이트 선이 몇 개인가
- 주변 색을 강하게 반사하는가

### 유리

- 투명한가 반투명한가
- 굴절을 묘사하는가
- 가장자리만 표시하는가
- 내부와 뒤쪽 사물이 왜곡되는가

### 천

- 주름이 큰 덩어리인가 작은 주름인가
- 섬유가 보이는가
- 무게감이 있는가
- 그림자 경계가 부드러운가

### 과일과 피부 같은 유기물

- 표면 광택
- 색 변화
- 반점과 결
- 반투명 효과
- 촉촉함

### 식물

- 잎맥 표현
- 잎의 두께
- 역광 투과
- 잎 하나하나를 그리는지 덩어리로 처리하는지

---

## Facet 9. 질감과 붓 터치

확인할 항목:

- 붓 자국이 보이는가
- 표면에 종이결이 있는가
- 노이즈가 균일한가
- 질감이 형태를 따라가는가
- 모든 곳에 동일한 텍스처가 덮이는가
- 인물과 배경의 질감이 다른가

예시:

```text
visible dry-brush texture,
subtle paper grain,
brush direction follows the form,
rougher texture in backgrounds,
smoother treatment on focal objects
```

단순히 `textured`라고 적으면 생성기가 화면 전체에 노이즈 필터를 덮을 수 있다. 질감의 위치와 역할을 설명해야 한다.

---

## Facet 10. 디테일 밀도

어디를 자세하게 그리고 어디를 생략하는지 분석한다.

예시:

- 얼굴은 단순하고 머리카락은 세밀함
- 중앙은 정교하고 주변은 생략
- 실루엣은 명확하지만 내부 정보는 적음
- 모든 재질을 균등하게 묘사
- 작은 장식이 반복됨

기록 예시:

```text
high detail around the focal object,
medium detail on supporting objects,
simplified background,
minimal microtexture in shadow areas
```

---

## Facet 11. 원근과 카메라

일러스트라도 카메라 성향이 있다.

확인할 항목:

- 평면적인가 입체적인가
- 광각처럼 보이는가 망원처럼 보이는가
- 높은 시점 또는 낮은 시점
- 원근 왜곡
- 공간 깊이
- 배경 압축 정도
- 피사계 심도

예시:

```text
slightly elevated three-quarter view,
35mm-equivalent perspective,
moderate spatial depth,
minimal lens distortion,
soft atmospheric perspective
```

---

## Facet 12. 구도

확인할 항목:

- 중앙 구도
- 좌우 대칭
- 비대칭 균형
- 큰 여백
- 인물을 화면 가장자리에 배치
- 삼각형 구도
- 수평 안정형
- 대각선 움직임
- 겹침의 정도

중립 테스트 이미지에서는 원작의 구도를 그대로 복사하지 않고, 원작이 사용하는 **구도 원칙만 적용**해야 한다.

예:

```text
asymmetrical balance,
large quiet negative space,
low visual center of gravity,
objects grouped in a loose triangular arrangement
```

---

## Facet 13. 분위기와 감정

분위기는 추상적이므로 시각적 원인과 같이 적는 것이 좋다.

나쁜 예:

```text
emotional, beautiful, nostalgic
```

좋은 예:

```text
quiet nostalgic mood created through faded warm colors,
soft backlighting, lifted shadows, and generous negative space
```

---

## Facet 14. 의도적인 불완전성

작가 고유의 느낌은 완벽함보다 작은 불규칙성에서 나오는 경우가 많다.

예:

- 선이 약간 떨림
- 좌우가 완벽히 대칭이 아님
- 색이 외곽선 밖으로 살짝 벗어남
- 투시가 정확하지 않지만 감정적으로 자연스러움
- 붓 터치 크기가 일정하지 않음
- 눈, 손, 장식 일부가 의도적으로 생략됨

이것을 전부 정리해 버리면 스타일이 일반적인 생성 이미지처럼 바뀔 수 있다.

---

# 6단계. 스타일 특징을 세 등급으로 나누기

분석이 끝나면 각 요소를 다음처럼 분류한다.

## 필수 특징 Core Features

없어지면 해당 그림체로 보이지 않는 요소.

예:

- 짙은 갈색의 굵기 변화가 있는 선
- 연보라색 그림자
- 낮은 대비
- 종이 질감
- 단순한 얼굴과 세밀한 배경

프롬프트에서 가장 강하게 유지해야 한다.

## 보조 특징 Supporting Features

스타일을 강화하지만 장면에 따라 없어질 수 있는 요소.

예:

- 역광
- 꽃잎
- 미세한 필름 그레인
- 붉은 포인트 컬러

## 콘텐츠 종속 특징 Content-bound Features

작품에는 자주 나오지만 스타일 자체는 아닌 요소.

예:

- 특정 머리 모양
- 특정 교복
- 특정 꽃
- 특정 배경 건물
- 작가의 대표 캐릭터
- 반복되는 로고나 문양

중립 이미지에서는 제거하는 것이 좋다.

---

# 7단계. 스타일을 수치화한 Style Vector 만들기

정성적인 설명과 함께 0~5점 척도를 만들면 비교하기 쉽다.

| 항목 | 0 | 5 |
|---|---|---|
| 선 두께 | 매우 얇음 | 매우 굵음 |
| 선 변화 | 일정함 | 변화가 큼 |
| 형태 단순화 | 사실적 | 매우 단순화 |
| 채도 | 무채색 | 고채도 |
| 대비 | 매우 낮음 | 매우 높음 |
| 가장자리 | 매우 부드러움 | 매우 날카로움 |
| 텍스처 | 매끈함 | 매우 거침 |
| 디테일 | 최소 | 매우 세밀 |
| 공간감 | 평면적 | 깊은 입체감 |
| 빛의 극적 성향 | 평평함 | 매우 극적 |
| 색상 다양성 | 제한적 | 다양함 |
| 불규칙성 | 정교하고 균일 | 손맛이 강함 |

예시:

```text
Line thickness: 3/5
Line variation: 4/5
Shape simplification: 3/5
Saturation: 2/5
Contrast: 2/5
Edge sharpness: 2/5
Texture intensity: 4/5
Detail density: 3/5
Spatial depth: 2/5
Dramatic lighting: 2/5
Color diversity: 2/5
Handmade irregularity: 4/5
```

이 값은 절대적인 측정치가 아니라 스타일 비교를 위한 내부 기준이다.

---

# 8단계. Neutral 이미지 설계

스타일을 검증할 때는 한 장의 중립 이미지보다 세 종류의 테스트 이미지를 사용하는 것이 더 정확하다.

---

## Probe A. 재질 테스트 보드

현재 만든 정물 장면이다.

포함할 것:

- 무광 구체
- 천
- 금속
- 유리
- 과일
- 식물
- 평범한 테이블
- 창문
- 단순한 벽

이 보드는 재질, 빛, 색, 공간을 확인하기 좋다.

```text
A matte sphere, a draped cloth, a glossy metal cup,
a clear glass, a ripe fruit, and a small leafy potted plant
on a plain tabletop near a window.
```

---

## Probe B. 형태·선 테스트 보드

선화나 형태 언어가 중요한 스타일에 필요하다.

포함하면 좋은 요소:

- 원
- 육면체
- 원기둥
- 곡선형 병
- 각진 상자
- 접힌 종이
- 나뭇잎
- 단순한 의자

이 테스트에서는 색을 제한하면 선과 형태가 더 잘 보인다.

```text
A neutral arrangement of simple geometric objects:
sphere, cube, cylinder, folded paper, curved bottle,
small chair and leafy branch, rendered with a restrained palette.
```

---

## Probe C. 공간 테스트 보드

배경과 구도가 중요한 스타일에 필요하다.

예시:

- 작은 방
- 창문
- 문
- 계단
- 의자
- 화분
- 복도
- 외부 풍경

인물은 넣지 않아도 된다.

```text
A quiet ordinary room corner with a window, doorway,
wooden chair, short staircase and one potted plant.
No people and no decorative narrative objects.
```

이 세 보드에서 스타일이 일관되게 나오면, 해당 스타일은 인물이나 특정 소재에 의존하지 않는다고 볼 수 있다.

---

# 9단계. Neutral 이미지 프롬프트 작성법

프롬프트는 **장면 고정 영역**과 **스타일 적용 영역**을 분리해야 한다.

## 기본 구조

```text
CONTENT LOCK:
[중립 장면과 사물]

STYLE IDENTITY:
[스타일을 한 문장으로 정의]

MEDIUM:
[매체와 렌더링]

SHAPE LANGUAGE:
[형태 단순화 규칙]

LINEWORK:
[선 특성]

VALUE STRUCTURE:
[명암 구조]

COLOR PALETTE:
[주조색, 그림자색, 포인트색]

LIGHTING:
[광원과 방향]

EDGE TREATMENT:
[가장자리 처리]

MATERIAL BEHAVIOR:
[무광, 천, 금속, 유리, 과일, 식물]

TEXTURE:
[종이, 붓, 노이즈]

CAMERA AND COMPOSITION:
[원근, 시점, 배치]

MOOD:
[감정과 그 시각적 원인]

RESTRICTIONS:
[복사하면 안 되는 콘텐츠]
```

---

# 10단계. 복사해서 사용할 수 있는 중립 이미지 프롬프트

아래 템플릿에서 대괄호만 교체하면 된다.

```text
Create a neutral visual style reference image.

CONTENT LOCK:
A simple material study on a plain tabletop in an ordinary room corner.
Include exactly one matte sphere, one draped cloth, one glossy metal cup,
one clear glass, one ripe piece of fruit, and one small leafy potted plant.
A simple window is visible in the background.
No people, no figures, no characters, no faces, and no narrative event.

STYLE IDENTITY:
Apply the following observable visual characteristics derived from the
reference artworks, without copying their subjects, characters, composition,
symbols, signature motifs, or specific scene designs:

[ONE-SENTENCE STYLE SUMMARY]

MEDIUM:
[MEDIUM AND RENDERING CHARACTERISTICS]

SHAPE LANGUAGE:
[ROUNDED OR ANGULAR FORMS, LEVEL OF SIMPLIFICATION]

LINEWORK:
[LINE COLOR, THICKNESS, VARIATION, CLEANNESS, INTERIOR LINES]

VALUE STRUCTURE:
[LOW OR HIGH CONTRAST, SHADOW GROUPING, BLACK LEVEL]

COLOR PALETTE:
[PRIMARY COLORS]
[SECONDARY COLORS]
[ACCENT COLORS]
Shadow color: [SHADOW COLOR]
Highlight color: [HIGHLIGHT COLOR]

LIGHTING:
[LIGHT SOURCE, DIRECTION, SOFTNESS, COLOR AND FILL RATIO]

EDGE TREATMENT:
[SHARP, SOFT, LOST AND FOUND EDGES]

MATERIAL BEHAVIOR:
Matte sphere: [HOW MATTE MATERIAL IS RENDERED]
Fabric: [HOW FOLDS AND FIBERS ARE RENDERED]
Metal: [HOW REFLECTION AND HIGHLIGHTS ARE RENDERED]
Glass: [HOW TRANSPARENCY AND REFRACTION ARE RENDERED]
Fruit: [HOW ORGANIC SURFACE AND COLOR VARIATION ARE RENDERED]
Foliage: [HOW LEAVES, VEINS AND TRANSLUCENCY ARE RENDERED]

TEXTURE AND DETAIL:
[BRUSHWORK, PAPER GRAIN, DETAIL DENSITY AND IMPERFECTIONS]

CAMERA AND COMPOSITION:
Plain uncluttered composition, balanced spacing, clear separation of all objects.
[CAMERA ANGLE, PERSPECTIVE, DEPTH OF FIELD AND COMPOSITIONAL RULES]

MOOD:
[MOOD CREATED THROUGH SPECIFIC VISUAL FEATURES]

IMPORTANT:
Preserve only the visual rules and rendering characteristics of the references.
Create a completely new neutral scene.
Do not reproduce the original characters, objects, poses, background layout,
story, signature, symbols, text, or recognizable composition.
No text, no letters, no logo, no watermark. 16:9.
```

---

# 11단계. I2I 생성 설정 방법

도구마다 이름은 다르지만 핵심 개념은 비슷하다.

## 구조 이미지

먼저 스타일이 없는 중립 정물 이미지를 준비한다.

좋은 구조 이미지는:

- 모든 물체가 분명하게 구분됨
- 조명이 너무 극적이지 않음
- 색이 중립적임
- 배경이 단순함
- 금속, 유리, 천이 겹치지 않음
- 16:9 고정

이 이미지를 모든 스타일에서 동일하게 사용하면 공정한 비교가 가능하다.

## 참조 스타일 이미지

권장 방식:

- 핵심 작품 2~4장 사용
- 서로 다른 소재의 작품 선택
- 동일한 캐릭터가 반복되지 않도록 함
- 스타일이 가장 선명한 작품의 비중을 높임
- 예외 작품은 낮은 비중으로 사용

---

## 변화 강도 또는 Denoise

도구마다 수치 해석이 조금 다르지만 일반적으로 다음처럼 접근할 수 있다.

### 낮은 강도: 약 0.20~0.35

- 원래 정물 구도 유지가 강함
- 스타일은 색감 중심으로 약하게 적용
- 첫 구조 검증에 적합

### 중간 강도: 약 0.35~0.55

- 구도와 사물을 대체로 유지
- 선, 재질, 붓 터치가 적용되기 시작
- 중립 스타일 보드에 가장 실용적인 구간

### 높은 강도: 약 0.55~0.75

- 스타일은 강해짐
- 사물 형태와 개수가 바뀔 수 있음
- 원작의 구도나 상징이 섞일 위험이 커짐

처음에는 약 0.4 전후에서 시작하고 결과에 따라 조절하는 것이 좋다.

---

## 구조 제어

가능하다면 깊이, 엣지 또는 레이아웃 제어를 함께 사용한다.

우선순위는 다음이 좋다.

1. 사물 개수와 위치
2. 실루엣
3. 원근
4. 스타일
5. 미세 질감

스타일 강도를 너무 높여 유리가 사라지거나 금속 컵이 꽃병으로 변하면 비교 보드의 의미가 줄어든다.

---

## Seed 고정

스타일 비교를 할 때는 같은 시드 또는 최대한 비슷한 초기 조건을 유지한다.

그래야 결과 차이가 스타일 때문인지 우연한 생성 차이인지 판단하기 쉽다.

추천 방식:

- 각 스타일당 같은 시드 4개 사용
- 스타일마다 4장씩 생성
- 가장 좋은 한 장만 고르지 말고 평균적인 품질 확인
- 특정 시드에서만 잘 나오면 스타일 프롬프트가 안정적이지 않은 것

---

# 12단계. 첫 결과 평가 기준

각 이미지를 1~5점으로 평가한다.

| 항목 | 질문 |
|---|---|
| 스타일 충실도 | 참고 작품의 시각 규칙이 느껴지는가 |
| 콘텐츠 중립성 | 원본 캐릭터나 구도를 복사하지 않았는가 |
| 재질 분리 | 무광·금속·유리·천·과일·식물이 구분되는가 |
| 구조 안정성 | 모든 사물이 유지되었는가 |
| 스타일 일관성 | 화면 일부가 아니라 전체에 적용됐는가 |
| 독립성 | 참고 작품을 직접 복제한 것처럼 보이지 않는가 |
| 반복 가능성 | 다른 시드에서도 비슷하게 나오는가 |
| 활용 가능성 | 인물이나 다른 장면에도 확장할 수 있는가 |

## 합격 기준 예시

- 스타일 충실도 4 이상
- 콘텐츠 중립성 4 이상
- 재질 분리 4 이상
- 구조 안정성 4 이상
- 독립성 4 이상

스타일 충실도만 높고 독립성이 낮으면 원본을 지나치게 복사한 결과일 수 있다.

---

# 13단계. 문제별 수정 방법

## 색감만 비슷하고 그림체가 안 나올 때

원인:

- 프롬프트가 팔레트에만 집중됨
- 선, 형태, 가장자리, 질감 설명 부족

수정:

```text
Do not apply the style only as a color filter.
Transfer the shape simplification, line behavior, edge hierarchy,
material rendering, detail density and brush texture.
```

그리고 색상 비중을 줄이고 선과 재질 설명을 강화한다.

---

## 원작의 캐릭터나 구도를 따라 할 때

원인:

- 참조 이미지 강도가 너무 높음
- 참고 세트가 특정 캐릭터에 편중됨
- 원작 고유의 장면을 그대로 설명함

수정:

- 참조 강도 낮추기
- 다양한 작품 추가
- 캐릭터가 작게 나온 배경 작품 추가
- 중립 장면 설명 강화
- 아래 문장 추가

```text
Do not reuse any subject identity, character design, pose,
costume, prop, scene layout or iconic motif from the references.
```

---

## 생성 결과가 너무 일반적으로 보일 때

원인:

- `beautiful`, `soft`, `cinematic` 같은 일반 표현만 사용
- 스타일의 독특한 조합이 빠짐

수정:

독특한 특징을 최소 4개 이상 조합한다.

예:

```text
dark brown variable-width outlines,
lavender-gray shadow shapes,
soft dry-brush texture,
simplified faces with highly detailed backgrounds,
warm cream highlights
```

개별 특징은 흔해도 조합이 구체적이면 고유한 결과가 나온다.

---

## 금속과 유리가 제대로 안 나올 때

원인:

- 스타일이 재질 표현을 평면화함
- 사물 간 간격이 좁음
- 재질 설명이 추상적임

수정:

```text
Keep the metal opaque and reflective with broad distorted highlights.
Keep the glass transparent, with visible rim highlights,
subtle refraction, and the background visible through it.
Do not merge the glass and metal materials.
```

필요하면 금속과 유리를 따로 부분 수정한다.

---

## 화면 전체가 텍스처로 덮일 때

원인:

- `rough texture`, `paper texture`가 위치 설명 없이 사용됨

수정:

```text
Paper grain should remain subtle and visible mainly in flat color areas.
Brush texture should follow object form.
Keep glass surfaces clean and mostly free of paper-like noise.
```

---

## 원작과 너무 닮아 보일 때

다른 사람의 작품을 사용하는 경우에는 특히 중요하다.

- 작가 이름을 프롬프트의 핵심으로 사용하지 않기
- 대표 캐릭터, 상징, 서명, 고유 의상 제거
- 일반적인 시각적 특성으로 변환
- 여러 참고 작품에서 반복되는 요소만 남기기
- 원작의 대표 구도와 장면을 피하기
- 허락받지 않은 작품이라면 상업적 사용에 특히 주의하기

목표는 “그 작가의 작품처럼 복제”가 아니라 다음에 가까워야 한다.

> 손으로 그린 듯한 불규칙한 갈색 선, 낮은 채도의 식물성 팔레트, 부드러운 수채화 번짐, 단순한 형태와 넓은 여백을 가진 스타일

---

# 14단계. 최종 Style Card 만들기

스타일 하나당 아래 자료를 세트로 보관하면 재사용하기 편하다.

## Style Card 구성

### 1. 스타일 이름

특정 작가 이름보다는 시각적 특징 기반 이름이 좋다.

예:

- Soft Botanical Ink
- Muted Storybook Watercolor
- Angular Neon Graphic
- Warm Handmade Gouache
- Pastel Memory Film

### 2. 한 줄 정의

```text
부드러운 갈색 선과 낮은 채도의 식물성 색상,
수채화 번짐과 넓은 여백이 특징인 따뜻한 그림책 스타일
```

### 3. 핵심 Facet

- 매체
- 형태
- 선
- 명암
- 팔레트
- 조명
- 가장자리
- 질감
- 디테일
- 카메라
- 구도
- 감정

### 4. 재질 처리 규칙

- 무광
- 천
- 금속
- 유리
- 유기물
- 식물

### 5. Positive prompt

스타일 적용용 프롬프트.

### 6. Negative prompt

복사 금지 요소와 흔한 실패.

### 7. Neutral Probe 이미지

- 재질 보드
- 형태 보드
- 공간 보드

### 8. 추천 설정

- 참조 이미지 수
- 스타일 강도 범위
- 변화 강도 범위
- 구조 제어 여부
- 잘 나온 시드

### 9. Do / Don’t

```text
DO:
soft brown lines, lavender shadows, simplified shapes

DON'T:
pure black outlines, high saturation, hard digital gradients
```

---

# 나에게 작품 분석을 요청할 때 사용할 템플릿

그림을 여러 장 올린 뒤 아래처럼 요청하면 된다.

```text
이 이미지들은 동일한 사람이 만든 작품이야.

작품의 캐릭터, 소재, 배경, 고유 문양과 구도를 스타일에서 분리하고,
여러 이미지에서 반복되는 시각적 규칙만 분석해줘.

다음 Facet으로 정리해줘:

1. 매체와 렌더링
2. 형태 언어
3. 선의 색상, 두께, 굵기 변화
4. 명암 단계와 대비
5. 주조색, 보조색, 포인트색
6. 그림자색과 하이라이트색
7. 조명 방향과 부드러움
8. 가장자리 처리
9. 붓 터치와 표면 질감
10. 디테일 밀도
11. 원근과 카메라
12. 구도와 여백
13. 재질별 표현 방식
14. 의도적인 불규칙성
15. 분위기와 감정
16. 스타일 고정 요소
17. 장면에 따라 변하는 요소
18. 스타일이 아닌 콘텐츠 종속 요소
19. 피해야 할 잘못된 해석

그다음 다음 결과물을 만들어줘:

- 한 줄 스타일 정의
- 자세한 Style Card
- 0~5점 Style Vector
- Neutral still-life 이미지 프롬프트
- 형태·선 테스트 프롬프트
- 공간 테스트 프롬프트
- Positive prompt
- Negative prompt
- I2I 추천 강도와 반복 테스트 방법

원본의 특정 캐릭터, 구도, 서명, 상징, 배경은 복제하지 말고
관찰 가능한 일반 시각 특성으로만 설명해줘.
```

---

# 마무리

이 방식으로 진행하면 작품이 수채화, 카툰, 반실사, 3D, 애니메이션, 실사풍 중 무엇이든 같은 기준으로 분해하고, **원작 내용에 의존하지 않는 중립 스타일 이미지와 재사용 가능한 스타일 프리셋**을 만들 수 있다.
