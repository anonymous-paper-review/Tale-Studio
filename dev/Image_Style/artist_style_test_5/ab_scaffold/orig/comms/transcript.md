
## ⬆️  2026-09-03T07:21:46Z  Claude → Codex

```
# 작업: 첨부 이미지(refer5.png)의 그림체 분석 → Style Card 작성

당신은 이미지 스타일 분석자(VLM)다. 첨부된 이미지 1장을 보고 아래 [분석 지침]에 따라 그림체를 분석하고, [출력 형식]대로 Style Card를 작성해 **이 작업 폴더에 `analysis.md`로 저장**한 뒤, 최종 메시지에도 그 전문을 그대로 붙여라.

## 고정 규칙 (하네스 제약 — 지침과 무관하게 항상 적용)

- 작가·프랜차이즈·작품·브랜드·회사 고유명사를 절대 쓰지 마라(추측·부정문도 금지). 중립 서술어와 hex 색상값만 사용한다.
- CAPSULE과 FIGURE_RULES는 **영문**으로 쓴다(이미지 생성기 프롬프트에 그대로 삽입됨). 나머지 분석은 한국어.
- 아래 [계산 통계]는 참고 자료다. 사용 여부와 방식은 [분석 지침]을 따른다.
- 이 폴더의 다른 파일은 읽거나 수정하지 마라. 산출물은 `analysis.md` 하나뿐이다. 외부 검색·네트워크 접근 금지.

## 계산 통계 (style_stats.py 실측 — 원본 922×564)

# 계산 통계 (style_stats.py)

## dev/Image_Style/artist_style_test_5/refer5.png  (원본 922x564)
| hex | 점유율 |
|---|---|
| `#8b8b93` | 13.9% |
| `#bebfbe` | 13.4% |
| `#b9baba` | 13.2% |
| `#abacaf` | 12.9% |
| `#b2b3b3` | 12.8% |
| `#97979c` | 12.2% |
| `#a3a4a7` | 12.2% |
| `#585d88` | 9.5% |
- 채도 평균 6% (std 13) · 명도 평균 66% (std 8)
- 강엣지 픽셀 13.0% (선 두께/윤곽 밀도 프록시)
- 플랫 8px 블록 58% (플랫 채움 비율 프록시 — 그라디언트/텍스처 많으면 낮음)

## 분석 지침

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



## 출력 형식 (`analysis.md` — 아래 섹션 헤더를 글자 그대로 사용)

```
# Style Card — refer5
## 1. 분석
(위 지침의 항목별 서술 — 지침이 요구하는 표·수치·분류를 전부 포함)
## 2. 특징 분류
(Core / Supporting / Content-bound 목록)
## 3. CAPSULE
(영문 2~4문장. 중립 정물 앵커 보드 프롬프트의 "Rendering rules:" 뒤에 그대로 삽입될 문장이다. 매체·선·명암·팔레트 hex·재질 번역 규칙(무광/금속/유리/천/유기물/식물이 이 스타일에서 어떻게 그려지는가)·장식 모티프·불완전성 여부를 포함하고, 분위기·감정 단어는 넣지 않는다.)
## 4. FIGURE_RULES
(영문 1문단. 인물 프롬프트의 "Figure rules:" 뒤에 붙을 문장 — 비율·이목구비·헤어·손·의상 구조. 이미지에 인물이 없으면 스타일 문법에서 외삽하고 문단 첫머리에 [EXTRAPOLATED] 를 표기한다.)
## 5. NOTES
(생성 시 주의점이 있으면 — 없으면 "없음")
```

CAPSULE과 FIGURE_RULES는 각각 하나의 문단으로, 코드블록 없이 본문에 적어라(파서가 헤더 다음 문단을 그대로 가져간다).

```

## ⬇️  2026-09-03T07:24:56Z  Codex → Claude  (exit=0)

analysis.md에 저장했습니다.

# Style Card — refer5
## 1. 분석
### 관찰 요약
첨부 이미지는 높은 시점의 아이소메트릭 공간을 단순한 기하 덩어리로 구성하고, 회색 바탕 위에 짙은 청보라 선과 선명한 파란 포인트 채색을 얹은 라인 중심 일러스트다. 콘텐츠로는 항구, 배, 등대, 작은 식물, 물결 기호가 보이지만, 스타일의 핵심은 특정 소재가 아니라 제한된 팔레트, 낮은 대비, 균일한 종이 같은 표면, 단순화된 입체 구조, 장식적인 반복 선과 점이다.

### 계산 통계 반영
제공 통계상 주요 색은 회색 계열 `#8b8b93`, `#bebfbe`, `#b9baba`, `#abacaf`, `#b2b3b3`, `#97979c`, `#a3a4a7`와 청보라 계열 `#585d88`로 압축되어 있다. 평균 채도 6%, 평균 명도 66%는 저채도 고명도 구조를 뒷받침한다. 강엣지 픽셀 13.0%는 선과 윤곽이 중요한 스타일임을, 플랫 8px 블록 58%는 그라디언트보다 평면 채움이 우세함을 보여준다.

### Facet 1. 매체와 기본 렌더링
디지털 기반의 잉크 라인 드로잉과 플랫 채색이 결합된 렌더링처럼 보인다. 실제 붓 번짐보다는 스캔된 종이나 촬영된 종이 위에 그린 듯한 균일한 회색 표면감이 있으며, 색면은 대부분 단단하고 납작하다. 명암은 페인팅식 혼합보다 도형처럼 분리된 그림자와 얇은 선 묘사로 처리된다.

### Facet 2. 형태 언어 Shape Language
큰 형태는 직육면체, 사다리꼴, 타원형 모서리 같은 단순한 기하 구조로 먼저 잡힌다. 건물과 배는 각진 면이 많지만 모서리는 지나치게 날카롭지 않고 살짝 둥글게 정리된다. 작은 사물은 상징처럼 축약되며, 식물과 구름형 장식은 몇 개의 짧은 곡선과 반복 덩어리로 표시된다. 전체적으로 직선 기반 구조와 부드러운 곡선 포인트가 섞인다.

### Facet 3. 선 Linework
외곽선은 짙은 청보라색 계열로, 검정보다 부드럽고 회색 바탕과 잘 섞인다. 선 두께는 중간 정도이며 외곽선은 비교적 굵고 내부 창문, 난간, 점열, 해칭은 더 얇다. 선은 대체로 연속적이지만 손으로 그린 듯한 미세한 떨림과 압력 변화가 있다. 그림자 경계도 색면만으로 끝내기보다 일부는 선으로 닫아 준다.

### Facet 4. 명암 구조 Value Structure
전체 명도는 밝은 편이고, 어두운 영역도 완전한 검정으로 내려가지 않는다. 주된 명암 단계는 밝은 회색 바탕, 중간 회색 면, 청보라 선/그림자, 파란 포인트의 3~4단계에 가깝다. 그림자는 큰 덩어리로 단순화되어 왼쪽 아래 방향으로 놓이며, 세밀한 계조보다 형태 분리에 쓰인다. 배경과 주체의 밝기 차이는 크지 않고 선과 포인트 색으로 분리한다.

### Facet 5. 색상 팔레트
Primary: 밝은 회색 `#bebfbe`, 중간 회색 `#b2b3b3`, 차가운 회색 `#a3a4a7`, 어두운 회색 `#8b8b93`.

Secondary: 흐린 청보라 `#585d88`, 어두운 남청색에 가까운 윤곽선 `#2f315d`.

Accent: 제한된 면적의 선명한 파란색 `#1d45d6`.

Shadows: 낮은 채도의 청회색 `#585d88`와 회색 바탕보다 어두운 `#8b8b93`.

Highlights: 별도 흰 하이라이트보다 바탕색에 가까운 밝은 회색 `#bebfbe`를 남기는 방식.

색상 비율은 대략 회색 중립색 80~88%, 청보라 선과 그림자 8~15%, 선명한 파란 포인트 3~7%로 보인다. 색상 다양성은 낮고, 파란색이 면 분리와 시선 유도를 거의 전담한다.

### Facet 6. 조명
광원은 강하게 드러나지 않지만, 일관된 상단 좌측 또는 정면 상단의 확산광처럼 읽힌다. 그림자는 부드러운 블러가 아니라 단순한 청회색 실루엣으로 바닥에 놓이며, 광원 대비는 낮다. 반짝임, 발광, 림라이트, 극적인 역광은 거의 없다.

### Facet 7. 가장자리 Edge Treatment
실루엣 가장자리는 선으로 선명하게 닫혀 있다. 내부 음영 경계는 대부분 단단한 색면이나 짧은 해칭으로 처리되고, 부드러운 그라디언트 전환은 거의 없다. 다만 종이 같은 전체 표면과 촬영감 때문에 가장자리 전체가 아주 미세하게 흐려져 보이며, 완전한 벡터처럼 날카롭지는 않다.

### Facet 8. 재질 렌더링
무광 재질은 평면 채움, 한쪽 면의 단순한 어두운 값, 얇은 내부선으로 처리한다. 금속은 거울 반사 없이 단순한 회색 면과 1~2개의 밝은 가장자리 선 또는 좁은 면 변화로만 표현한다. 유리는 투명한 굴절보다 창문을 파란색 또는 회색 직사각형으로 채우고 외곽선을 두르는 방식이다. 천은 작은 주름보다 큰 접힘 방향과 면 분할로 단순화한다. 과일과 피부 같은 유기물은 과도한 광택 없이 둥근 외곽, 작은 점, 약한 색 변화로 처리하는 것이 맞다. 식물은 잎맥보다 잎 덩어리와 줄기 기호를 반복해 표시한다.

### Facet 9. 질감과 붓 터치
개별 붓 자국은 거의 보이지 않으며, 질감은 화면 전체에 깔린 미세한 회색 입자와 촬영된 종이 같은 표면감으로 나타난다. 색면 내부는 대체로 매끈하지만 완전히 균질하지 않고, 선 가장자리와 채색 경계에 약한 흔들림이 있다. 질감은 형태를 따라가기보다 전체 화면에 얇게 깔리는 쪽에 가깝다.

### Facet 10. 디테일 밀도
디테일은 중간 정도다. 큰 실루엣은 단순하지만 창문, 난간, 원형 창, 점열, 짧은 해칭 같은 작은 반복 요소가 밀도를 만든다. 중심 사물과 주변 장식의 디테일 차이는 크지 않으나, 주요 구조물에는 내부 선이 더 많고 주변 물결이나 구름형 기호는 매우 축약되어 있다. 미세 재질 묘사보다 장식적 반복선이 디테일 역할을 한다.

### Facet 11. 원근과 카메라
카메라는 높은 3/4 시점의 아이소메트릭에 가깝다. 깊이감은 있지만 렌즈 왜곡은 거의 없고, 물체 크기 변화도 현실 원근보다 도식적이다. 수평·수직 구조는 기울어진 평행선 체계로 정리되며, 공간은 실제 깊이보다 지도나 장난감 모형처럼 읽힌다. 피사계 심도나 초점 흐림은 없다.

### Facet 12. 구도
비대칭 균형이 강하다. 큰 물체 두 개가 좌우로 나뉘고, 작은 장식 요소가 빈 공간을 리듬감 있게 채운다. 넓은 회색 여백이 중요하며, 사물들은 화면 안에 고립된 섬처럼 배치된다. 대각선 방향의 선착장과 배의 방향이 움직임을 만들고, 하단의 작은 요소들이 무게 중심을 낮춘다.

### Facet 13. 분위기와 감정
시각적으로는 낮은 채도, 넓은 여백, 둥글게 단순화된 구조, 검정 없는 선, 작은 장식 기호 때문에 가볍고 정돈된 인상이 난다. 강한 드라마보다 정보가 정리된 미니어처 도감 같은 성격이 강하다. 감정 표현은 인물 표정이 아니라 색 제한과 손그림 불규칙성에서 나온다.

### Facet 14. 의도적인 불완전성
선은 완전히 기계적이지 않고 약간 흔들린다. 평행선과 원근은 엄밀한 제도보다는 눈대중으로 맞춘 느낌이 있으며, 작은 창문과 점의 간격도 조금씩 다르다. 채색은 선 안에 대체로 들어오지만 아주 미세한 어긋남과 촬영/스캔 기반의 부드러움이 남아 있다. 이런 불완전성을 제거하면 지나치게 깨끗한 아이콘 세트처럼 보일 위험이 있다.

### Style Vector
| 항목 | 점수 |
|---|---:|
| 선 두께 | 3/5 |
| 선 변화 | 2/5 |
| 형태 단순화 | 4/5 |
| 채도 | 1/5 |
| 대비 | 2/5 |
| 가장자리 선명도 | 4/5 |
| 텍스처 강도 | 2/5 |
| 디테일 밀도 | 3/5 |
| 공간감 | 3/5 |
| 빛의 극적 성향 | 1/5 |
| 색상 다양성 | 1/5 |
| 손그림 불규칙성 | 3/5 |

## 2. 특징 분류
### Core Features
- 밝은 회색 바탕과 낮은 채도 중심의 제한 팔레트
- 짙은 청보라 윤곽선과 얇은 내부 묘사선
- 선명한 파란색을 작은 면적의 포인트 채색으로 사용하는 방식
- 높은 3/4 시점의 아이소메트릭 구조
- 단순한 기하 덩어리와 장식적 반복 디테일의 결합
- 검정 없는 낮은 대비와 압축된 그림자
- 넓은 여백, 분리된 오브젝트 배치, 도감식 구성
- 미세한 손그림 떨림과 불완전한 간격

### Supporting Features
- 왼쪽 아래로 떨어지는 단순한 청회색 캐스트 섀도
- 창문, 점열, 난간, 짧은 해칭처럼 반복되는 작은 선 장식
- 구름형 루프, 짧은 물결선, 작은 식물 기호 같은 주변 장식
- 종이나 촬영물처럼 보이는 균일한 미세 입자감
- 모서리를 살짝 둥글린 직선 기반 실루엣

### Content-bound Features
- 항구 시설, 큰 선박, 등대, 작은 돛단배
- 특정한 해안선 배치와 선착장 위치
- 야자수처럼 보이는 식물 종류
- 배의 객실, 굴뚝, 창문 배열 같은 개별 구조물 설계
- 화면에 흩어진 구름형 또는 하트형 기호의 정확한 위치

## 3. CAPSULE
Use an elevated isometric object-board rendering with flat digital ink-and-wash treatment on a warm gray paper field, built from clean geometric masses, continuous dark blue-violet outlines (#2f315d), and sparse interior hatching. Keep a low-saturation high-key palette of layered grays (#bebfbe, #b2b3b3, #a3a4a7, #8b8b93) with a single saturated blue accent (#1d45d6); shadows are compressed blue-gray (#585d88), cast as simple offset shapes, with almost no pure black or gradients. Translate materials as graphic symbols: matte surfaces use flat fills and one side-shadow, metal uses 1-2 narrow pale edge highlights without mirror reflections, glass is shown by outline and minimal blue tint, cloth forms broad simple folds, organic surfaces use rounded contour changes with tiny spots, and plants are reduced to small repeated leaf clusters with line-only stems. Add small repeated decorative marks such as dot rows, short ripples, simple loop clouds, and tiny hatch groups, allowing mild hand-drawn wobble, imperfect symmetry, and slight fill-to-line misregistration.

## 4. FIGURE_RULES
[EXTRAPOLATED] Figures should be compact, simplified, and slightly isometric, with small heads, blocky tapered torsos, short limbs, and minimal facial detail reduced to dots or omitted at tiny scale; avoid realistic anatomy and heavy expression rendering. Hair should be drawn as one or two rounded or angular cap-like masses with a few interior dark blue-violet lines, hands as mitten-like shapes or short line hooks, and clothing as simple geometric panels with blue accent blocks, sparse seam lines, and broad flat folds matching the object line weight.

## 5. NOTES
생성 시 특정 항구, 배, 등대 구성을 그대로 반복하지 말고 아이소메트릭 구조와 제한 팔레트만 유지한다. 과도한 그라디언트, 실사 재질, 고채도 다색 팔레트, 순검정 윤곽선, 완벽한 벡터 선은 피한다.

> 원본 세션(부모) (parent id=01a06625-3829-7791-a722-23f21ff21fac): `/home/user/.codex/sessions/2026/09/03/rollout-2026-09-03T16-21-50-01a06625-3829-7791-a722-23f21ff21fac.jsonl`
> 상세보기: `python3 /home/user/.local/bin/render_session.py "/home/user/.codex/sessions/2026/09/03/rollout-2026-09-03T16-21-50-01a06625-3829-7791-a722-23f21ff21fac.jsonl" --full`

---
