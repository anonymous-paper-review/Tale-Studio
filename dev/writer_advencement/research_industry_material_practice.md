# 업계 창작자 자료 번들 실태 조사

> 작성일: 2026-04-20
> 상태: Research Artifact (페르소나 구체화용 원자료)
> 관련 문서: `user_input_scenarios.md` (5축 좌표 공간), `dual_axis_model.md`
> 목적: `input.story: string` 단일 필드가 받지 못하는 "현실의 자료 번들"을 전수 파악

---

## 0. 이 문서의 목적과 방법

### 0.1 질문

Tale Studio는 현재 `input.story: string` 한 필드만 받는다. 하지만 실제 업계 창작자 — 감독, 시나리오 작가, IP 보유자, CF 디렉터, 광고대행사 PD, 게임 시네마틱 디렉터 등 — 는 프로젝트 시작 시 **텍스트가 아닌 자료 묶음**을 가지고 온다.

- 어떤 자료들인가?
- 누가, 언제, 어떤 도구로 만드는가?
- 어떤 순서로 확정되고 교환되는가?
- 어떤 크기로 들어오는가?
- 어떤 유연성(Rigidity)으로 잠겨 있는가?

이 문서는 업계 실무의 전수 파악이다. 이후 Tale Studio 입력 UX 재설계의 원자료로 사용된다.

### 0.2 방법

- 업계 표준 문서/템플릿/블로그 조사
- 대행사 creative brief 양식 수집
- pre-production 플랫폼(Milanote, ShotDeck, Frame.io, PureRef) 실무 사용 방식
- 스토리보드/컨셉아트 전공자 워크플로우
- IP 라이선스 딜리버리 포맷 사례 (Disney, Netflix, 웹툰/웹노벨)
- Reddit, YouTube 인터뷰 등 현업 경험담 교차 검증

### 0.3 연결

`user_input_scenarios.md`의 5축 좌표(Depth, Shape, Rigidity, Role, Media) 중 **Media Form**과 **Role** 축의 실제 모양을 여기서 채운다.

---

## PART 1: 영화/광고 Pre-Production 워크플로우 전수

영상 제작의 pre-production에서 발생하는 모든 자료 생산/교환 루틴.

---

### 1. Mood Board: 첫 번째이자 가장 보편적인 자료

Mood board는 "톤과 분위기"를 이미지 콜라주로 시각화한 단일 페이지 또는 멀티 페이지 구성물. 글보다 훨씬 빠르게 전달 가능하기에 **pre-production에서 거의 항상 첫 번째로 생산**된다.

#### 1.1 누가 만드는가

| 주체 | 시점 | 동기 |
|------|------|------|
| **감독** | 프로젝트 수주/발의 직후 | 자기 비전 명확화 + 팀 공유 |
| **촬영감독(DP)** | 감독 무드보드 받은 후 | 라이팅/컬러 해석 추가 |
| **프로덕션 디자이너** | 감독 무드보드 받은 후 | 공간/세트 방향 추가 |
| **의상 디자이너** | 캐릭터 정해진 후 | 룩 레퍼런스 |
| **광고대행사 아트디렉터** | 브리프 수령 직후 | 제안 단계 초기 |
| **클라이언트 측 마케터** | 브리핑 직전 | 방향 사전 정의 |

핵심: **한 프로젝트에 여러 개의 mood board가 공존**한다. 감독 mood board, DP mood board, production designer mood board가 각자 다른 레이어를 커버한다.

#### 1.2 언제 만드는가

- 광고: 프로젝트 킥오프 ~ 제안서 마감 (1-2주)
- 단편: 스크립트 확정 직후 ~ 스토리보드 전 (2-4주)
- 장편: 프리프로덕션 초기 3-6개월의 첫 한 달
- 뮤직비디오: 아티스트 미팅 전 (treatment 작성과 동시)

#### 1.3 어떤 도구로 만드는가

| 도구 | 사용 비중 | 특징 |
|------|---------|------|
| **Pinterest** | 매우 높음 (특히 인디/프리랜서) | 공개 보드 공유, 협업 기능, 무료 |
| **Milanote** | 중간 (전문가/에이전시) | 보드 + 노트 + 링크 혼합 |
| **PureRef** | 중간 (컨셉 아티스트 특화) | 플로팅 레이어드 무한 캔버스 |
| **InDesign/Photoshop** | 높음 (최종 딜리버러블) | PDF 출력, 레이아웃 제어 |
| **Canva** | 중간 (비전문가) | 템플릿 기반, 드래그 드롭 |
| **Figma** | 증가 추세 | 협업, 실시간 편집 |
| **Notion** | 증가 추세 | 문서+이미지 혼합, 링크 |
| **Apple Keynote/Google Slides** | 매우 높음 (클라이언트 프레젠테이션) | 페이지 단위 |

Pinterest는 **수집 단계**, InDesign/Keynote는 **딜리버리 단계**로 나뉘어 사용된다.

#### 1.4 이미지 수 통계

규모에는 엄격한 업계 표준이 없다. 다음은 관찰된 범위:

| 용도 | 이미지 수 | 페이지 |
|------|----------|--------|
| 개인 인스피레이션(Pinterest 보드) | 50-300장 | - |
| 감독 공유용 내부 mood board | 30-80장 | 3-8 페이지 |
| 클라이언트 프레젠테이션 | 15-40장 | 단일 or 최대 10 페이지 |
| 단편 treatment 내장 | 10-25장 | 5-15 페이지 treatment |
| 광고 director's treatment | 20-60장 | 10-20 페이지 |
| 장편 lookbook (Production Designer) | 100-500장 | 30-60 페이지 부스 bible |

#### 1.5 내용 구성

Mood board는 보통 다음 카테고리로 나뉘어 구성:
- 컬러 팔레트 (2-4 팔레트 제시, 색 사각형 + 샘플 이미지)
- 라이팅 (하이 키 vs 로우 키, 자연광 vs 인공광 샘플)
- 카메라 언어 (익스트림 클로즈업, 와이드샷, 핸드헬드 등 스틸)
- 프로덕션 디자인 (세트/로케이션 무드)
- 캐릭터 레퍼런스 (의상, 메이크업, 페이셜 타입)
- 텍스처/머티리얼 (바닥, 벽, 금속, 직물)
- 톤 워드 (형용사 3-10개: "grimy, intimate, hushed")

> 출처: [No Film School — Film Mood Board Guide](https://nofilmschool.com/film-mood-board), [Milanote Film Moodboard Template](https://milanote.com/templates/filmmaking/filmmaking-moodboard)

---

### 2. Lookbook: Mood Board의 고도화 버전

Lookbook은 mood board를 구조화하여 **카테고리별로 의도를 명시**한 문서. 필름 쪽에서는 director lookbook, DP lookbook, production designer lookbook이 독립적으로 제작된다.

#### 2.1 구성

```
[Title Page — 프로젝트명 + 감독명]
[Concept Statement — 1-2 페이지 prose]
[Visual Direction — 컬러/라이팅/렌즈/무드 섹션]
[Character Look — 인물별 의상/분위기]
[Location Look — 장소별 무드]
[Palette — 컬러 팔레트 명세]
[Tone Reference — 유사 작품 스틸]
[Shot Language — 대표적 카메라 접근]
```

10-30 페이지. PDF 출력. 주로 InDesign으로 레이아웃.

#### 2.2 역할

- **감독 → DP** 비전 공유 (촬영감독이 이걸 받아 라이팅 설계 시작)
- **감독 → 프로덕션 디자이너** (세트/로케이션 감각 공유)
- **광고대행사 → 클라이언트** 제안 (투표 받는 근거 자료)
- **클라이언트 → 대행사** 역방향 (원하는 톤 이미 제시)

Commercial Cinematography Series(Wandering DP)는 "새 감독과 일할 때 lookbook 없이는 시작하지 않는다"고 쓴다. 톤을 글로 설명하는 데 1시간 걸리는 것을 lookbook은 1분에 해결한다.

> 출처: [Wandering DP — Building a Visual Lookbook](https://wanderingdp.com/videos-2/visual-lookbook/), [StudioBinder — Film Lookbook Examples](https://www.studiobinder.com/blog/film-lookbook-examples/)

---

### 3. Director's Treatment: 광고/뮤직비디오 수주의 핵심 문서

광고 및 뮤직비디오 업계에서는 "treatment"라는 특유의 딜리버러블이 존재. 감독이 제안을 따기 위해 쓰는 10-20 페이지 PDF로, mood board + narrative + shot idea + tone statement를 통합.

#### 3.1 구조

```
Page 1:    Title + Director name + Agency logo
Page 2:    Concept Statement (한 문단 - 이게 왜 흥미로운가)
Page 3-4:  Story Approach (narrative 전개 prose)
Page 5-10: Visual Approach — 섹션별 이미지 30-50장
           - Tone & Palette
           - Cinematography Style
           - Production Design / Locations
           - Wardrobe
Page 11-15: Shot Ideas (핵심 장면 몇 개 image/text 짝)
Page 16-18: Cast/Talent approach (type references)
Page 19-20: Reference Films (끝에 출처 명시)
```

길이: 5-20 페이지, 통상 10-12 페이지. 이미지가 글의 70-80%를 차지.

#### 3.2 전달 포맷

- **기본**: PDF (Adobe InDesign으로 작성)
- **가변**: 가끔 영상 임베드된 인터랙티브 PDF
- **트렌드**: 링크 기반 프레젠테이션(Notion, Pitch.com)도 등장

많은 directors가 **시네마스코프 2.39:1 레이아웃**으로 treatment를 만든다 — 최종 영상의 비율을 미리 시각화.

#### 3.3 참조 자료 수준

- 타 광고/MV 스틸: 15-40장 (본인이 좋아하는 다른 감독 작품 주로)
- 영화 스틸: 10-20장 (Shotdeck에서 쉽게 구함)
- 일러스트/페인팅: 0-5장 (예술적 감독)
- 자체 과거작 스틸: 5-10장 (크레디빌리티)

#### 3.4 Rigidity 특성

Treatment는 **수주 시점 Preferred Rigidity**. 최종 딜에서 클라이언트 요청으로 방향 수정되곤 한다. Locked은 아니지만 Draft보다는 단단함.

> 출처: [The Collective Pitch — Commercial Director Treatment](https://thecollectivepitch.com/portfolio/commercial-director-treatment-guide-to-winning/), [Robin Piree — Music Video Treatment Guide](https://robinpiree.com/blog/how-to-write-music-video-treatment), [Assemble — How to Write a Winning Director's Treatment](https://www.onassemble.com/blog/how-to-write-a-winning-directors-treatment)

---

### 4. Storyboard: 프레임 단위 사전 시각화

Storyboard는 샷 단위로 프레임을 그린 시퀀스. 만화와 유사한 형식의 패널 시리즈.

#### 4.1 제작 프로세스

```
[스크립트 수령]
      ↓
[Beat 분해 — 주요 스토리 비트 식별]
      ↓
[Thumbnail Sketches — 1-2분 러프 스케치 / 패널]
      ↓
[Rough Storyboard — 구도/카메라 명시된 확장 패널]
      ↓
[Cleaned Storyboard — 인물/배경 명확한 파이널]
      ↓
[Animatic — 패널을 타이밍대로 편집한 비디오]
```

#### 4.2 도구

| 도구 | 사용자 유형 |
|------|-----------|
| **Storyboard Pro (Toon Boom)** | 프로 애니메이션 스튜디오 표준 |
| **Procreate** (iPad) | 프리랜서, 빠른 스케치 |
| **Photoshop** | 전통 스토리보드 아티스트 |
| **TVPaint** | 애니메이터가 직접 보드 그릴 때 |
| **Storyboarder** (무료) | 인디 |
| **Frame Forge** | 3D 기반 스토리보드 |
| **종이+펜** | 감독 본인 스케치 (제출 자료는 디지털화) |

#### 4.3 자료 형태

- **Pencil Sketches**: 검은 선, 러프, 속도 우선 (감독 본인)
- **Cleaned Pencils**: 라인워크 정리, 약간의 톤 (스토리보드 아티스트)
- **Value/Tone 보드**: 라이팅 방향 포함된 그레이스케일
- **Color Boards**: 컬러 스크립트 수준 (프로덕션 후기 단계)
- **Photomatic**: 배우/로케이션 사진을 포토몽타주한 보드

#### 4.4 규모

- 광고 30초: 20-40 패널
- 단편 10분: 60-150 패널
- 장편 2시간: 1500-3000 패널 (전편), 선별 시퀀스만 250-500
- 애니메이션: 장편의 경우 **3000-8000 패널** (모든 샷이 필수)

#### 4.5 교환 방식

- PDF 출력 (페이지당 4-6 패널)
- PNG 시퀀스
- Animatic (MP4, 패널 + 타이밍 + 스크래치 오디오)
- Frame.io 리뷰 링크 (주석 달기)

#### 4.6 Animatic

Storyboard 패널을 타이밍대로 편집한 비디오. 임시 음악, 임시 보이스오버 포함. 파일 크기가 크고(수백 MB) 딜리버리에 Frame.io/Vimeo/WeTransfer 사용.

> 출처: [Adobe — How to Storyboard for Animation](https://www.adobe.com/uk/creativecloud/animation/discover/animation-storyboarding.html), [CG-Wire — Storyboarding in Animation](https://blog.cg-wire.com/storyboard-animation/), [Blooper — Storyboard vs. Animatic](https://blooper.ai/blog/storyboard-vs-animatic-difference)

---

### 5. Shot List / Shooting Script: 촬영 설계

Shot list는 각 샷의 기술 명세. Shooting script는 이를 스크립트 형태로 통합한 것.

#### 5.1 Shot List 컬럼 구조

```
| Shot # | Scene # | Slate | Shot Size | Angle | Movement | Lens | Framing | Action | Audio | Notes |
```

예:
```
| 12  | 3 | 12A | MS     | Eye  | Dolly In | 50mm | 2-shot | Kai turns | "Oracle enters" | RED, natural |
| 13  | 3 | 12B | CU     | High | Static   | 85mm | Oracle | POV | silence     | soft key |
```

#### 5.2 도구

- **StudioBinder**: 웹 기반, 브레이크다운 + 스케줄 + 콜시트 통합
- **Shot Lister**: iPad 앱
- **Google Sheets**: 매우 흔함 (임시 또는 인디)
- **Celtx**: 시나리오 + 스케줄 + 브레이크다운 통합
- **Final Draft + Scripto**: 시나리오 중심

#### 5.3 평균 규모

- 광고 1일 촬영: 30-80 샷
- 단편 3일 촬영: 100-250 샷
- 장편 40일 촬영: 1500-3000 샷
- 뮤직비디오 1-2일: 40-100 샷

#### 5.4 Shooting Script

Shooting script는 최종 촬영용 스크립트. 씬 번호, 샷 번호, 카메라 지시, 편집 노트가 스크립트에 직접 통합되어 있다.

---

### 6. Director-DP Visual Intent 공유: 교환 패킷 전수

감독과 촬영감독 간 비전 정렬은 pre-production의 핵심. 다음 자료가 교환된다.

| 자료 | 방향 | 목적 |
|------|-----|------|
| **감독 Lookbook** | 감독 → DP | 전체 톤 |
| **DP 자체 Lookbook** | DP → 감독 | 해석 검증 |
| **Mood Reel** (영상) | 양방향 | 실제 영상 자료로 톤 입증 |
| **Color 레퍼런스** | 양방향 | 그레이딩 방향 |
| **렌즈 테스트 이미지** | DP → 감독 | 선택할 렌즈 룩 비교 |
| **Lighting Diagram** | DP → 감독 | 키 라이트 위치 명세 |
| **Location Scout Photos** | 양방향 | 실제 공간 대입 |
| **Previs (3D)** | 양방향 | 복잡한 샷 사전 시뮬레이션 |

#### 6.1 Mood Reel

특히 주목할 자료: **Mood Reel** — 감독/DP가 참고 영화들의 특정 시퀀스를 편집해 음악과 함께 붙인 3-5분 영상. "이 느낌"을 영상으로 직접 입증하는 방식. 저작권 문제 있으나 내부용으로는 만연.

#### 6.2 Previs

복잡한 VFX/액션 씬은 Maya/Unreal로 3D 프리비주얼 제작. 카메라 동선, 블로킹, 타이밍 사전 확정. 수억~수십억 달러 영화에서 필수.

---

### 7. Production Designer 딜리버러블

Production Designer가 감독과 DP에게 건네는 자료:

- **Set Drawings**: 평면도 + 엘리베이션 (AutoCAD/Vectorworks)
- **Art Department Bible**: 전체 세트 + 소품 + 드레싱 문서 (30-100 페이지)
- **Material Samples**: 물리적 또는 디지털 텍스처 라이브러리
- **Color Script**: 씬별 컬러 방향 시퀀스 (애니메이션에서 특히 중요)
- **Prop References**: 아이템별 레퍼런스 + 제작/구매 결정
- **Location Binder**: 후보 장소별 사진 + 측정 + 연락처

큰 장편의 경우 production designer bible은 **100-500 페이지** 자료가 된다.

> 출처: [Art Departmental — Film Art Department Production Design](https://artdepartmental.com/blog/film-art-department-production-design/), [Pushing Pixels — The Art and Craft of Production Design](https://www.pushing-pixels.org/2018/11/13/the-art-and-craft-of-production-design-interview-with-richard-hoover.html)

---

## PART 2: 광고대행사 Creative Brief 구조

광고는 클라이언트 브리핑에서 출발한다. Creative brief는 이 업계 가장 표준화된 자료.

---

### 8. Creative Brief 템플릿

#### 8.1 필수 요소

업계 공통 합의 요소:

```
1. Project Overview
   - 프로젝트 명
   - 브랜드
   - 마감일
   - 예산 범위

2. Background / Situation
   - 브랜드 현황
   - 시장 위치
   - 지난 캠페인 결과

3. The Problem / Challenge
   - 비즈니스 문제 한 문장
   - "왜 이 광고가 필요한가"

4. Audience
   - Demographics (나이, 성별, 소득)
   - Psychographics (라이프스타일, 가치관)
   - Pain points
   - Media habits

5. Consumer Insight
   - 타겟의 숨겨진 진실 한 문장
   - "What they DO vs What they SAY" 간극

6. Single-Minded Proposition
   - 광고가 전달할 단 하나의 메시지

7. Reasons to Believe (RTB)
   - 제품 기능/증거 3-5개

8. Tone & Voice
   - 형용사 3-7개
   - 경쟁사 톤과의 차별

9. Mandatories
   - 로고 사용 규칙
   - 법적 고지 문구
   - 금지 표현
   - 클라이언트 내부 정치적 금기

10. Deliverables
    - 포맷 (30s TVC, 6s YouTube bumper, 15s social cut 등)
    - 해상도, 언어, 자막

11. Timeline
    - 킥오프, 컨셉 제시, 프로덕션, 딜리버리

12. Budget
    - 총 미디어 + 프로덕션
```

#### 8.2 분량

**1-2 페이지가 업계 표준**. 2-3 페이지는 이미 "길다". 핵심은 **간결성**. 5 페이지 넘어가면 creative team의 해석 부담 급증.

> 출처: [Bynder — Creative Briefs Definition](https://www.bynder.com/en/blog/find-creative-direction-write-great-creative-brief/), [Asana — Creative Brief Template](https://asana.com/resources/how-write-creative-brief-examples-template), [Adobe Business — Creative Briefs](https://business.adobe.com/blog/basics/creative-brief)

#### 8.3 전달 포맷

- **PDF (가장 많음)**: 디자인된 템플릿 기반. 로고, 브랜드 컬러 적용
- **Google Doc**: 협업 편집 용도
- **Notion 페이지**: 모던 에이전시에서 증가
- **Keynote/PowerPoint**: 프레젠테이션 후 나눠주는 포맷
- **이메일 본문**: 긴급한 경우 (빈번)

#### 8.4 브랜드 가이드 별도 동봉

Creative brief와 **별도로** 브랜드 가이드가 붙어온다:

- Brand Book PDF (20-80 페이지)
- 로고 에셋(AI, PNG, SVG)
- 컬러 스펙(HEX, Pantone)
- 타이포그래피 명세
- 이미지 스타일 가이드
- 톤/보이스 가이드
- 금기 표현 리스트

Disney 같은 대형 브랜드는 200+ 페이지 brand book. 중소 브랜드도 최소 30 페이지.

> 출처: [Design Force — Entering the World of Brand Licensing](https://designforceinc.com/thinking/entering-brand-licensing-build-style-guide-first/), [Disney Advertising Inventory Guidelines PDF](https://files.disneyadvertising.com/MediaKit/TWDC-Digital-Ad-Guidelines/disney_advertising_inventory_guidlines.pdf)

---

### 9. Cannes Lions/D&AD 수상작의 Creative Brief 공개 사례

Cannes Lions는 **Creative Strategy Lions** 카테고리에서 Original Brief를 심사 대상으로 포함:
- 30% Business/brand challenge 해석
- 30% Insight / breakthrough thinking
- 20% Creative idea
- 20% Outcome/results

이 사실은 업계 관행을 말해준다: **브리프 자체가 창작 산출물**로 간주된다. D&AD 전시에서는 수상작의 original brief를 프린트해 작품 옆에 전시하는 경우가 많다.

> 출처: [Cannes Lions — Creative Strategy](https://www.canneslions.com/awards/lions/creative-strategy), [Ad Age — Behind marketers' agency briefs meant to secure Cannes Lions wins](https://adage.com/events-awards/cannes-lions/aa-how-marketers-seek-out-ideas-aimed-at-winning-cannes-lions/)

---

## PART 3: 참조 자료 플랫폼 생태계

현업이 사용하는 실제 도구들의 역할 분화.

---

### 10. 플랫폼 분류

#### 10.1 수집/디스커버리

| 플랫폼 | 역할 | 강점 | 약점 |
|-------|------|------|------|
| **Pinterest** | 일반 수집 | 접근성, 공짜, 방대함 | 필름 전문화 X, 광고 기반 |
| **ShotDeck** | 영화 스틸 검색 | 필름 태깅(렌즈/조명/무드) | 유료($13/월 or $100/년) |
| **Film Grab / Frame Set** | 영화 스틸 무료 | 공짜 | 검색력 제한 |
| **ArtStation** | 컨셉 아트/일러스트 | 작가 포트폴리오 | 영상 레퍼런스 X |
| **Behance** | 광고/그래픽 레퍼런스 | 캠페인 케이스 | 영상 씬 구조화 X |
| **Vimeo Staff Picks** | 영상 레퍼런스 | 큐레이션 | 탐색 깊이 얕음 |

#### 10.2 조직/큐레이션

| 플랫폼 | 역할 | 특성 |
|-------|------|------|
| **Milanote** | pre-production 캔버스 | 보드 + 노트 + 링크, 필름 친화 |
| **PureRef** | 레퍼런스 캔버스 (오프라인) | 무한 캔버스, 항상 위 뜨기, 무료 |
| **Notion** | 문서+DB 혼합 | 구조화, 에이전시 선호 |
| **Figma/FigJam** | 협업 화이트보드 | 실시간 멀티유저 |
| **Miro** | 화이트보드 | 엔터프라이즈 협업 |
| **Eagle / Billfish** | 레퍼런스 DB (오프라인) | 대량 이미지 태그/검색 |

#### 10.3 협업/리뷰

| 플랫폼 | 역할 | 특성 |
|-------|------|------|
| **Frame.io** | 영상 리뷰 (Adobe 인수 2021) | 프레임 단위 주석, 버전 관리 |
| **Wipster** | 영상 리뷰 | Frame.io 경쟁 |
| **Vimeo Review** | 영상 리뷰 | 무료 티어 |
| **Dropbox Replay** | 영상 리뷰 (신규) | Dropbox 내장 |

#### 10.4 파일 전송/저장

| 플랫폼 | 역할 | 특성 |
|-------|------|------|
| **Dropbox** | 자산 저장 + 공유 | 영화 업계 전통적 표준 |
| **Google Drive** | 문서 + 자산 | 에이전시 기본 |
| **WeTransfer** | 대용량 일회 전송 | 무료 2GB, Pro 200GB |
| **MASV** | 영상 업계 특화 전송 | 속도 중시, 수십 GB 일상 |
| **Aspera/Signiant** | 고속 전송 (엔터프라이즈) | 할리우드 대형 프로덕션 |

#### 10.5 개인 데스크톱

- **Notes/Keep**: 갑자기 떠오른 아이디어
- **iMessage/WhatsApp/KakaoTalk**: 동료/클라이언트에게 즉석 공유 (링크, 이미지)
- **Slack**: 팀 내 비공식 공유

### 10.6 현실의 혼재 사용

한 프로젝트 내에서 **모든 플랫폼이 섞여 사용**된다:

```
영감 수집      → Pinterest + ShotDeck
조직          → Milanote 또는 Figma 보드
레퍼런스 문서   → Notion 또는 InDesign PDF
영상 레퍼런스   → Vimeo + YouTube 링크
자산 저장      → Dropbox 또는 Google Drive
클라이언트 리뷰 → Frame.io + 이메일
긴급 공유      → WhatsApp / Slack
최종 딜리버리   → WeTransfer + Dropbox 링크 + 이메일 첨부
```

결과: **자료 찾는 데 하루 쓰는 감독**이 흔하다. 특정 이미지가 Pinterest인지 Dropbox인지 이메일 첨부인지 기억 못 함.

> 출처: [No Film School — ShotDeck](https://nofilmschool.com/shotdeck-perfect-resource-searchable-movie-images), [Milanote — Film Pre Production Template](https://milanote.com/templates/filmmaking/pre-production-plan), [Kosmik — Milanote Alternatives](https://www.kosmik.app/blog/milanote-alternatives)

---

## PART 4: 스토리보드 아티스트 워크플로우 심층

스토리보드 아티스트가 감독으로부터 받는 것 / 내보내는 것.

---

### 11. 받는 것 (Input)

1. **Script** — Final Draft(.fdx) 또는 PDF
2. **Director's Notes** — 감독의 톤/아이디어 텍스트
3. **References** — 감독이 보내준 이미지/영상 몇 개
4. **Previous Boards** (있다면) — 기존에 그린 이웃 씬
5. **Character Designs** (애니메이션) — 모델 시트
6. **Voice Over Recordings** (가능한 경우) — 타이밍 기준
7. **Pipeline Deadline** — 언제까지 패널 몇 개

### 12. 내보내는 것 (Output)

1. **Thumbnail Round** — 러프, 빠른 컨셉 검증용
2. **Cleaned Boards** — 감독 리뷰 대상
3. **Revised Boards** — 노트 반영
4. **Animatic** — 편집된 비디오
5. **Shot List** — 각 패널 번호 매핑

### 13. 커뮤니케이션 패턴

- **대면 미팅**: 주 1-2회 감독/작가와 피칭 세션
- **이메일/Slack**: 일상적 업데이트
- **Frame.io**: 패널/애니매틱 리뷰 주석
- **Zoom 세션**: 원격 리뷰 (팬데믹 이후 표준)

### 14. 도구 심층

- **Storyboard Pro**: 라이브액션/애니메이션 공통 프로 표준. 카메라/렌즈 정보 내장, Harmony와 연동
- **Photoshop**: 프리랜서 흔함. 레이어 구조 자유
- **Procreate on iPad Pro**: 모바일 작업 흔함
- **TVPaint**: 애니메이터가 직접 보드 후 애니메이션까지
- **Storyboarder**: 무료, Wonder Unit, 인디 친화

### 15. 숫자 감각

- 주당 패널: 프로 아티스트 50-150 (TV 애니메이션) / 30-80 (피처 라이브액션)
- 대시: 매 패널당 15-30분 (러프), 1-2시간 (클린)
- 광고 1편(30s): 총 20-40 패널, 2-5일 작업
- 장편 1편: 3-6개월 풀타임 (한 아티스트가 1시퀀스 전담)

---

## PART 5: IP 라이선싱과 자료 전달

IP 보유자가 프로덕션에 넘기는 자료 패킷.

---

### 16. IP Style Guide의 표준 구성

Disney/Warner/Netflix 같은 대형 IP 홀더의 style guide는 다음을 포함:

```
[Section 1: 브랜드 개요]
- IP 역사, 핵심 가치, 톤
- 성공/실패한 과거 사용 사례

[Section 2: 캐릭터]
- 캐릭터별 Turnaround Sheets (정면, 측면, 뒤, 3/4)
- 표정 시트 (basic expressions + extreme)
- 포즈 시트 (signature poses + 금지 포즈)
- 의상 사양 (컬러, 실루엣, 액세서리)
- Size comparison chart (캐릭터 간 신장 비교)
- Action poses 라이브러리

[Section 3: 월드/환경]
- 주요 로케이션 turnaround
- 프로덕션 환경 샘플
- 소품 카탈로그
- 텍스처/머티리얼

[Section 4: 컬러/타이포]
- 공식 컬러 팔레트 (HEX, Pantone, CMYK, RGB)
- 타입페이스 라이선스
- 로고 변형 규칙

[Section 5: Do's and Don'ts]
- 허용되는 사용 사례
- 금기 사용 사례 (폭력, 성적 암시, 정치적 문구 등)
- 캐릭터 간 짝짓기 금지 (예: 빌런을 히어로처럼 묘사 금지)

[Section 6: 승인 프로세스]
- 컨셉 → 스크립트 → 디자인 → 애니메틱 → 파이널 6단계
- 각 단계별 IP 홀더 승인 필요
- 수정 반려 타임라인

[Section 7: 법적 고지]
- 저작권 문구
- 법무 연락처
- 위반 시 조치
```

Disney's Licensing Division은 **모든 creative design, packaging, marketing material의 사전 승인**을 강제한다. Brand alignment를 위한 내부 review가 일상.

> 출처: [Design Force — Entering the World of Brand Licensing](https://designforceinc.com/thinking/entering-brand-licensing-build-style-guide-first/), [Disney Studio Licensing](https://www.disneystudiolicensing.com/), [Byron Lee Design — Disney Branding Guides](https://www.byronleedesign.com/brandguides)

---

### 17. 웹툰/웹노벨 IP 적응 사례 (한국 시장)

한국 웹툰 → 드라마/영화 adaptation은 2020년대 급증. Naver Webtoon, Kakao Entertainment가 plaform owner로 IP 라이선스 조절.

#### 17.1 IP 홀더가 넘기는 자료

```
[원작 웹툰 전회차 디지털 파일]
- 한글 파일 + 영어 번역본 (국제화 대비)
- 고해상도 이미지 아카이브

[캐릭터 바이블]
- 주요 캐릭터 biography
- 관계도 그래프
- 성격/동기

[세계관 설정집]
- 배경 시대/장소
- 기술 수준
- 사회 구조
- 마법/SF 시스템 룰

[작가 제공 참고자료]
- 작가가 직접 보낸 원안/스케치
- 특정 씬에 대한 코멘터리

[팬덤 반응 리포트]
- 인기 회차, 인기 캐릭터
- 원작 팬이 "건드리면 안 되는" 포인트
```

현실 사례: *킹덤*, *스위트홈*, *지금 우리 학교는*, *지옥*, *종이의 집: 공동경제구역* 등은 모두 원작 웹툰/웹노벨 있음.

#### 17.2 IP 승인 프로세스의 병목

한국 드라마 시장에서 원작 IP 홀더의 승인 타임라인:
- 컨셉 스크립트 제시 → 1-4주 피드백
- 캐스팅 제안 → 1-2주 피드백
- 시각화 방향 → 2-4주 피드백
- 파이널 에피소드 러프컷 → 에피소드당 1주 확인

이 승인 사이클은 **생성 AI 도입의 핵심 장벽**. 원작 팬이 "캐릭터 얼굴이 다르다"고 반응하는 순간 프로젝트 크레디빌리티 소실.

> 출처: [Korea Times — Hits and Misses: Webtoon Adaptations](https://www.koreatimes.co.kr/entertainment/shows-dramas/20260101/hits-and-misses-webtoon-adaptations-dominate-but-execution-decides-success), [Deadline — How Webtoons Are Becoming Korean Export](https://deadline.com/2023/07/korea-webtoon-naver-wattpad-kakao-entertainment-netflix-disney-1235430199/)

---

## PART 6: 자료 전달 포맷의 현실

"PDF, Slack, WhatsApp, Dropbox"가 뒤엉킨 현실.

---

### 18. 포맷 매트릭스

| 포맷 | 주 용도 | 사용 빈도 | 문제 |
|------|--------|---------|------|
| **PDF (brand/treatment)** | 공식 문서 | 매우 높음 | 수정 불가, 텍스트 추출 손실 |
| **Google Slides/Keynote** | 프레젠테이션 | 높음 | 버전 분산 |
| **Notion 페이지** | 모던 에이전시 | 증가 | 외부 접근 제한 |
| **InDesign 파일** | 원본 편집용 | 낮음 | 전달 시 PDF 변환 |
| **이메일 첨부** | 긴급 | 매우 높음 | 버전 혼란 |
| **Dropbox 링크** | 에셋 저장 | 매우 높음 | 권한 이슈 |
| **Google Drive 링크** | 문서+에셋 | 매우 높음 | 폴더 구조 분산 |
| **Slack 채널 업로드** | 팀 내 | 높음 | 30일 후 검색 어려움 (무료) |
| **WhatsApp/KakaoTalk 이미지** | 즉석 | 높음 | 원본 해상도 소실 |
| **Frame.io 링크** | 영상 리뷰 | 높음 | 유료 티어 |

### 19. 현장 증언 유형

- 프리랜스 DP: "매 프로젝트마다 감독이 다른 도구를 쓴다. 어떤 감독은 Dropbox, 어떤 감독은 Google Drive, 어떤 감독은 WhatsApp으로만 이미지를 보낸다. 정리는 내 몫."
- 에이전시 PD: "클라이언트는 브랜드 북을 PDF로 보내고, 제품 사진은 Dropbox, 과거 CF 레퍼런스는 YouTube 링크, 급한 수정은 WhatsApp. 우리는 이걸 Notion에 모은다."
- 인디 감독: "Pinterest 보드 3개 + Google Doc 트리트먼트 + WhatsApp 그룹챗. 그 이상 투자할 시간 없음."

---

## PART 7: 자료 번들 규모 통계

업종별 **평균 입력 자료 크기**.

---

### 20. 프로젝트 유형별

#### 20.1 광고 (30s TVC)

```
Creative Brief: 2 페이지 PDF
Brand Guide: 20-50 페이지 PDF
Reference CFs: 5-15개 영상 링크 (총 2-5분)
Mood Images: 30-60장
Director's Treatment: 10-15 페이지 PDF
Storyboard: 30 패널
Shot List: 60-80 샷
Product Photos: 10-30장
Location Scout Photos: 50-200장
총 자료 크기: 500MB - 5GB
```

#### 20.2 뮤직비디오 (3-4분)

```
Artist Brief (때로 구두만): 1 페이지
Song File (waveform 포함): 1 MP3
Lyrics + 타임코드: 1 문서
Director's Treatment: 8-15 페이지 PDF
Mood Images: 40-80장
Reference MVs: 10-20개
Wardrobe References: 20-40장
Storyboard (선택적): 40 패널
Location Photos: 30-80장
총 자료: 1-10GB
```

#### 20.3 독립 단편 (10분)

```
Script: 10-15 페이지
Lookbook: 20 페이지 PDF
Mood Images: 60-100장
Storyboard: 80-150 패널
Shot List: 120-180 샷
Location Photos: 100-300장
Character References: 30-60장
총 자료: 2-20GB (로우 스토리지 포함)
```

#### 20.4 장편 영화

```
Script: 100-120 페이지
Production Bible: 100-500 페이지 PDF
Storyboard: 1500-3000 패널 (선별 시퀀스)
Previs: 10-40 개 시퀀스 영상
Location Binder: 수백 장 × 수십 장소
Concept Art: 50-500장
Costume Sketches: 40-200장
Props Catalog: 수백 아이템
총 자료: 50GB - 1TB+
```

#### 20.5 게임 시네마틱 트레일러 (2분)

```
Game Design Bible 발췌: 30-80 페이지
Character Concept Art: 30-100장
Environment Concept: 20-50장
Existing Game Footage: 5-30분
Reference Trailers: 10-20개
VO Script: 1-2 페이지
Previs (언리얼): 선택적 MP4
총 자료: 10-100GB
```

#### 20.6 YouTube 크리에이터 10분

```
Script / Bullet Points: 1-3 페이지
B-roll References: 10-30장 (YouTube 썸네일 캡처)
Thumbnail References: 5-10장
Editing Style References: 3-5 영상 링크
Recorded Footage: 30GB-200GB
총 자료: 50GB-500GB (로우 포함)
```

#### 20.7 교육 영상 (10분 설명 영상)

```
Lesson Plan: 2 페이지
Content Script: 3-5 페이지
Slide Deck: 20-40 슬라이드
Diagrams/Infographics: 10-30장 (직접 제작 또는 기존 교재)
Stock Footage Candidates: 10-30 클립
Voice Record: 1개 MP3
총 자료: 500MB - 5GB
```

### 21. 스케일 통찰

- **최소** (YouTube 솔로): 문서 1개 + 이미지 5장 미만
- **중간** (광고, 인디 단편): 문서 3-5개 + 이미지 수백 장 + 영상 10개
- **최대** (장편, 게임): 문서 100+개 + 이미지 수천 장 + 영상 수십 개 + 3D 자산

Tale Studio가 "입력 슬롯"을 설계할 때 **스케일 가변성 x100배** 처리가 필요하다.

---

## PART 8: 페르소나 10종 상세 시나리오

각 페르소나는 가상이나 현업 관찰 기반. 이름/스튜디오는 가공.

---

### 페르소나 1. 시나리오 작가 A — 웹소설 영상화, 원작 보유, 비주얼 미정

**프로필**: 37세, 여성. 국내 플랫폼에서 웹소설 3작품 연재. 누적 조회 1.2억. 2025년 대표 IP가 드라마 제작사 제안을 받음. 작가는 크리에이티브 파트너 역할 유지.

**자료 번들**:
- 원작 웹소설 전권 한글 파일(HWP 5개, 총 1.2MB, 약 180화)
- 영어 번역본 초안 PDF (플랫폼 제공, 90화까지)
- 직접 그린 캐릭터 드로잉 12장 (제대로 그리지 못함을 인지)
- 팬아트 모음 폴더 (팬이 그린 캐릭터 이미지 100+장, 개별 허락 안 받음)
- 작가 노트 메모(노션 페이지 30개, 세계관 설정 + 연대표)
- 영감 받은 작품 목록 (텍스트 리스트, 소설 10권 + 영화 5편 + 게임 3개)
- 캐스팅 희망 배우 사진 (비공식 5명 × 3장)

**좌표**: (L4 Depth — 스토리/캐릭터 확정 / S1-S2 수준)
- Shape: B-Island (스토리 완전 고정, 비주얼 백지)
- Rigidity: 스토리 Locked, 캐릭터 Preferred, 비주얼 Draft
- Role: 시나리오 작가/원작자
- Media: HWP, PDF, 드로잉, 팬아트(권리 문제), 텍스트 리스트

**파이프라인에 거는 기대**:
- "원작의 핵심 씬을 AI로 비주얼화해서 제작사에 보여주고 싶다"
- "캐릭터 얼굴이 내 상상과 얼마나 맞는지 검증"
- "10분짜리 파일럿 프레젠테이션 만들기"

**불안**:
- "AI가 원작 팬들이 기대하는 톤을 망칠까봐"
- "내가 전문가가 아니라 뭐가 맞는지 모름"
- "제작사가 내 비전을 안 따라줄까봐 미리 못 박고 싶음"

**도입 장벽**:
- 웹소설은 **문단 단위 텍스트가 방대**. Tale Studio는 단일 story 필드. → 전체 소설 업로드 후 챕터 단위 처리 필요
- 팬아트를 참조로 쓰고 싶지만 **저작권** 모호. → Rights 필드 필요
- 캐릭터 얼굴 고정 욕구 강함. → IP-Adapter/Identity Lock 필수
- "이 캐릭터가 이 대사를 이렇게" 수준의 세밀 제어 원함. → 자연어로만은 부족

---

### 페르소나 2. IP 보유자 B — 캐릭터 IP 보유, 신규 단편 의뢰

**프로필**: 31세, 남성. 인디 캐릭터 브랜드 운영 5년차. 주력 캐릭터 "뽀뽀스"(가상)는 MZ세대 대상 SNS에서 인기. 인스타 팔로워 42만. 최근 3분짜리 프로모션 단편 제작 프로젝트 발의.

**자료 번들**:
- 캐릭터 스타일 가이드 PDF (자체 제작, 24페이지)
  - 턴어라운드 4앵글, 표정 시트 12개, 포즈 시트 8개
  - 색상 명세 HEX/RGB
  - "이렇게 하지 마세요" 10개 예시 (잘못 그려진 시안)
- 기존 굿즈 제품 사진 모음 (300장, 상품 컷)
- 과거 협업 영상 3편 (각 30초-1분, Vimeo 링크)
- 브랜드 톤 매뉴얼 한 페이지 (형용사 15개: "귀엽지만 감정적, 부드럽지만 날카로운...")
- 팬 리액션 인기 포스트 스크린샷 20장
- 단편 스토리 아이디어 메모 (한 페이지, bullet point)

**좌표**: (L5 Depth, B-Island — 캐릭터 완전 고정, 스토리 30% 수준)
- Shape: B-Island
- Rigidity: 캐릭터 Locked(절대 불가변), 세계관 Preferred, 스토리 Draft
- Role: IP 보유자
- Media: PDF 스타일 가이드, 제품 사진, 영상, 톤 워드 리스트

**기대**:
- "내 캐릭터로 3분 스토리 만들어줘, 톤 지켜서"
- "팬들이 좋아했던 포즈/표정을 유지"
- "크리스마스 시즌 한정판 연계"

**불안**:
- "캐릭터 얼굴이 조금이라도 달라지면 팬이 알아챔"
- "AI가 'generic cute character' 만들어버릴 것 같음"
- "3D화되면 브랜드 자산 훼손"

**도입 장벽**:
- **Identity Locking** 없이는 시작조차 불가능
- 기존 I2V/T2V 모델이 "일관된 캐릭터 얼굴"을 여러 샷에 걸쳐 유지 못 함
- 스타일 가이드 PDF → 시스템이 자동 파싱 어려움 (VLM 한계)
- "이건 안 됨" 네거티브 예시를 시스템이 내재화 못 함

---

### 페르소나 3. CF 감독 C — 30초 TV 광고, 레퍼런스 풍부

**프로필**: 42세, 남성. 15년차 CF 감독. 국내 3대 프로덕션 소속. 지난해 칸 라이언즈 쇼트리스트 2편. 현재 통신사 글로벌 캠페인 수주 중.

**자료 번들**:
- 광고대행사 creative brief PDF (1.5페이지, 핵심만)
- 클라이언트 브랜드 가이드 PDF (45페이지, 로고/컬러/타이포/톤)
- 경쟁사 광고 레퍼런스 영상 8편 (Vimeo 링크)
- 본인이 참고할 "같은 감독이 좋아하는" 영화 스틸 50장 (ShotDeck에서 다운로드)
- 과거 본인 작업 리일 (2분 30초, 대표작 하이라이트)
- PPM 발표용 deck 초안 (Keynote 30페이지)
- 로케이션 답사 사진 3개 후보 × 각 80장
- 캐스팅 디렉터가 보낸 탈렌트 스틸 (20명 × 각 5장)
- 지난 번 촬영 기록 메모(Apple Notes 20개)

**좌표**: (L3-L5 Depth, C-StyleFirst + E-Constraint + H-AntiPattern 혼합)
- Shape: 매우 복합 (톤 확정 + 브랜드 제약 + 감독 안티패턴)
- Rigidity: 브랜드 제약 Locked, 톤 Preferred, 스토리 Draft
- Role: CF 감독
- Media: 브리프, 브랜드가이드, 영상, 스틸, 답사사진, 캐스팅사진, deck

**기대**:
- "PPM(Pre-Production Meeting) 자료를 AI로 시각화해 클라이언트 설득"
- "본 촬영 전 샷 시뮬레이션 30개로 감각 확정"
- "Alt take 5개 씩 생성해 편집 가능성 확보"

**불안**:
- "AI 영상은 광고 퀄리티 미달"
- "클라이언트가 '이거 AI 아님?'이라 반응할까봐"
- "15년 쌓은 감 vs AI 제안, 조정 어려울 것"

**도입 장벽**:
- **현실 촬영 대체재**로 쓰기엔 품질/디테일 부족
- 보조 도구로 쓰려면 **PPM 이후 본촬영까지 자연 연결** 필요
- 클라이언트 컴플라이언스 (로고 정확도, 제품 색상 정확도) 매우 높음
- 실제 캐스팅된 배우 얼굴 fidelity 필수. Identity Lock 품질 의존.

---

### 페르소나 4. 광고대행사 PD D — 브랜드 브리프 수주, 제안 단계

**프로필**: 34세, 여성. 대행사 Account Producer. 4년차. 맥주 브랜드 신제품 런칭 캠페인 제안 중. 마감 4일.

**자료 번들**:
- 클라이언트 RFP(Request for Proposal) 8페이지 PDF
- 클라이언트 브랜드 가이드 PDF (65페이지)
- 클라이언트 과거 캠페인 영상 12편 (YouTube 링크)
- 경쟁사(국내 맥주 5개 브랜드) 최신 광고 20편 (YouTube 링크)
- 시장 리서치 보고서 (Nielsen 데이터, PDF 30페이지)
- 젊은 소비자 인터뷰 녹취록 (6명 × 각 30분)
- 제안용 mood board 초안 (Figma 파일, 이미지 45장)
- 후보 감독 3명의 기존 reel
- 제안 deck 초안 (Keynote 40페이지)

**좌표**: (L2 Depth, E-Constraint + A-균일 혼합, 마감 압박)
- Shape: E-Constraint 주도 (브리프+예산+마감만 정해짐)
- Rigidity: 브랜드 Locked, 나머지 Draft
- Role: 대행사 PD (제안 단계)
- Media: RFP, 브랜드가이드, 레퍼런스 영상, 인터뷰 녹취, deck

**기대**:
- "4일 안에 제안용 visual concept 3개 빠르게 만들어 클라에 보여주기"
- "시안 단계에서 실제 영상 감각 미리 보여 차별화"
- "승인되면 실 프로덕션에 자연 연결"

**불안**:
- "AI 제안은 비딩에서 감점될 수 있음 (보수 클라이언트)"
- "비주얼 방향 제시하고 나서 본촬영 때 못 맞추면 신뢰 손상"

**도입 장벽**:
- **속도**가 핵심. 업로드+생성이 느리면 의미 없음
- 제안서 통합 워크플로우 (Keynote/Figma export) 필요
- 클라이언트 IP 보안 우려 (AI 학습 가능성)
- 제안이 날아간 경우 **비용만 소모**되는 리스크

---

### 페르소나 5. 독립 장편 감독 E — 아트하우스 장편, 비주얼 확정, 제작비 부족

**프로필**: 45세, 남성. 3번째 장편 준비 중. 전작은 부산국제영화제 경쟁 부문. 유럽 공동제작 파트너 찾는 중. 총 제작비 목표 15억 원, 현재 5억 확보.

**자료 번들**:
- 시나리오 최종고 105페이지 (Final Draft 파일)
- 디렉터스 노트 20페이지 (본인 작성)
- 레퍼런스 영화 12편 목록 + 각 2-3개 주요 씬 타임코드 메모
- 영감 받은 페인팅 모음 PDF (17세기-20세기 유화 30장)
- 본인이 직접 그린 스토리보드 썸네일 120장 (종이 스캔, 휘갈겨씀)
- 로케이션 답사 사진 500+장 (3개 후보 지역, 2주 답사)
- DP 후보가 보낸 lookbook 초안 15페이지
- 캐스팅 비전 (주연 3명 타입만, 배우 미정)
- 제작사 피칭 트리트먼트 30페이지 PDF
- 펀딩 프로포절 40페이지 (영화진흥위원회/KOCCA 제출용)

**좌표**: (L6-L7 Depth, A-균일 + H-AntiPattern 강함)
- Shape: 완전 확정 + 강한 안티패턴 ("헐리우드 문법 피하기")
- Rigidity: 시나리오 Locked, 비주얼 Locked, 톤 Locked
- Role: 아트하우스 감독
- Media: FDX, PDF, 페인팅, 스토리보드 스캔, 답사사진, lookbook

**기대**:
- "제작비가 모자라 실사 촬영 어려운 씬들을 AI로 만들어 대체"
- "피칭용 10분짜리 비주얼 샘플로 공동제작자 설득"
- "본편 일부 씬(드림 시퀀스, 플래시백)을 AI로 직접 만들어 삽입"

**불안**:
- "관객이 AI 영상을 알아챌 것"
- "아트하우스 관객은 특히 예민"
- "내 시각적 통제력을 AI가 빼앗아 갈 것"
- "레퍼런스가 명확한데 AI는 늘 평균값으로 수렴"

**도입 장벽**:
- **통제권 이슈**: 감독은 "매 프레임"의 결정을 원함. AI의 확률적 출력과 근본 충돌
- **스타일 고정**: 3-4편의 레퍼런스 영화 룩을 정확히 재현 필요. 일반 모델은 못 함
- **안티패턴**: "쇼트 리버스 쇼트 금지, 오버더숄더 금지, 와이드샷만" 같은 네거티브 제약이 강함
- 아트하우스 미학 자체가 **훈련 데이터 분포와 거리 있음**

---

### 페르소나 6. 유튜브 크리에이터 F — 10분 단편, 솔로 작업

**프로필**: 24세, 남성. 구독자 18만. 드라마 단편 채널 운영. 주 1회 5-15분 영상 업로드. 혼자 대본/촬영/편집 모두 담당. 광고 제휴 월 3-4건.

**자료 번들**:
- 대본 Google Doc (10페이지, 대사 위주)
- 영감 받은 유튜브 영상 링크 15개 (북마크)
- Pinterest 보드 2개 (한 주제당 이미지 60-100장)
- 직접 촬영한 B-roll 컨텐츠 (외장 드라이브 2TB)
- 편집 스타일 레퍼런스 (타 유튜버 영상 5편)
- 썸네일 디자인 초안 3개 (Photoshop)
- 과거 베스트 영상 자체 분석 메모 (어떤 샷이 조회수 높았나)

**좌표**: (L3 Depth, A-균일 + F-ReferenceHeavy)
- Shape: 레퍼런스 의존적
- Rigidity: 대부분 Draft (혼자 결정하므로 유연)
- Role: 솔로 크리에이터
- Media: Google Doc, Pinterest, 외장드라이브, YouTube 링크

**기대**:
- "촬영 못 가는 씬을 AI로 빨리 만들어 편집에 넣기"
- "연출 컨셉 빠르게 3-4개 테스트해 최적 선택"
- "주 1회 업로드 템포 유지 위해 속도 극대화"

**불안**:
- "AI 티가 나면 구독자가 이탈"
- "월 구독료 감당 어려움 ($20-50이 한계)"
- "AI 풀 활용하면 내 '아이덴티티' 상실"

**도입 장벽**:
- **가격**: 프리랜서 구독료 구간 tight ($10-30/월)
- **템포**: 생성 속도 매우 중요. 대기 30분은 허용 불가
- **학습 곡선**: 공부할 시간 없음. 직관적 UI 필수
- **통합**: 기존 편집 툴(Premiere/DaVinci)과 자연 연동 원함

---

### 페르소나 7. 브랜드 인하우스 마케터 G — 월 4편 숏폼 컨텐츠

**프로필**: 30세, 여성. 국내 중견 식품 브랜드 인하우스 마케팅 팀. 소셜 컨텐츠 담당. 월 4-6편 15-60초 릴스/쇼츠 제작 필요. 팀원 3명, 외주 없음.

**자료 번들**:
- 브랜드 가이드라인 PDF (40페이지, 본사 글로벌 버전)
- 제품 공식 사진 에셋 (3D 렌더 + 실사 스튜디오 샷, 수백 장)
- 소셜 컨텐츠 캘린더 스프레드시트 (Notion)
- 지난 분기 베스트 포스트 엔게이지먼트 리포트
- 경쟁사 SNS 모니터링 스크린샷 모음
- 제품 스펙 시트 (영양정보, 성분)
- 소비자 댓글/DM 대표 사례 모음
- 캡션/카피라이팅 아이디어 브레인스토밍 (Google Doc)

**좌표**: (L2 Depth, E-Constraint + B-Island 혼합)
- Shape: 제약 강하고 제품(브랜드) 고정
- Rigidity: 브랜드/제품 Locked, 나머지 Draft
- Role: 브랜드 인하우스
- Media: PDF, 제품 사진, 스프레드시트, 메모

**기대**:
- "매주 2-3편 숏폼을 빠르게 뽑아내기"
- "제품을 정확히 보여주면서 트렌드 접목"
- "외주 프로덕션 대비 80% 비용 절감"

**불안**:
- "법무팀 승인 리스크 (제품 효능 오도 금지)"
- "AI 영상의 브랜드 이미지 훼손 우려"
- "본사 컴플라이언스 통과 불확실"

**도입 장벽**:
- **제품 정확성**: 브랜드 패키지가 픽셀 단위로 정확해야. 포장/라벨 왜곡 절대 불가
- **승인 체인**: 기획 → 법무 → 브랜드팀 → 본사 → 외부 공개. AI는 이 체인에 신뢰 부족
- **대량 배포**: 플랫폼별(인스타/틱톡/유튜브 쇼츠) 해상도/비율 자동 변환 필요
- 브랜드팀은 보통 보수적. AI 실험적 성격 거부감

---

### 페르소나 8. 게임 시네마틱 디렉터 H — 게임 런칭 트레일러

**프로필**: 39세, 남성. 국내 대형 게임사 시네마틱 부서 소속. AAA MMORPG 신작 런칭 트레일러 총괄. 총 2분 분량, 프로덕션 기간 4개월, 팀 규모 12명.

**자료 번들**:
- 게임 디자인 문서 GDD (내부 위키, 600+ 페이지)
- 캐릭터 컨셉 아트 (공식 아트팀, 120장 + turnaround)
- 환경 컨셉 아트 (80장)
- 기존 게임 인-엔진 풋티지 (60분 이상)
- 과거 트레일러 분석 리포트 (자사 + 경쟁사 20편 쇼트별 분해)
- 음악 레퍼런스 (할리우드 작곡가 대표작 10곡)
- 사운드 디자인 레퍼런스
- 언리얼 엔진 자체 자산 (캐릭터 모델, 환경 모델 수백 개)
- 퍼블리셔 마케팅 KPI 브리프 (글로벌 런칭 포지셔닝)
- 프리비주얼 초기 버전 (Maya/Unreal, 70초 분량)

**좌표**: (L7-L8 Depth, A-균일 + B-Island 복수, 매우 구체)
- Shape: 모든 것 확정 (IP, 스토리, 캐릭터, 세계관)
- Rigidity: 캐릭터 절대 Locked, 스토리 Preferred, 샷 디자인 Draft
- Role: 게임 시네마틱 디렉터
- Media: 방대. GDD, 컨셉아트, 인-엔진 풋티지, 언리얼 자산, 음악, 리포트

**기대**:
- "언리얼 자산을 AI로 조명/카메라 실험"
- "프리비주얼 → 최종 사이 반복 빠르게"
- "대체 버전 다수 생성해 퍼블리셔 제시"

**불안**:
- "AI가 게임 IP의 정체성을 흐림"
- "실제 언리얼 렌더와 픽셀 단위 대응 어려움"
- "저작권/소유권 이슈 (게임 자산의 AI 학습)"

**도입 장벽**:
- **3D 자산 통합**: 기존 언리얼 자산과 AI 출력이 **같은 룩**으로 합쳐져야. 완전 실패
- **해상도/FPS**: 게임 트레일러는 4K/60fps. AI는 1080p/24fps 수준
- **파이프라인 통합**: 기존 Maya/Unreal → 편집 → 딜리버리 체인에 AI 삽입 난이도 극상
- **보안**: 런칭 전 캐릭터/환경 유출 극도로 민감

---

### 페르소나 9. 교육 콘텐츠 PD I — 교육 영상, 개념 시각화

**프로필**: 36세, 여성. 에듀테크 스타트업 소속. 초중등 수학/과학 영상 콘텐츠 기획 PD. 월 20편 내외 5-15분 교육 영상 제작 (외주 애니메이션 스튜디오 협업).

**자료 번들**:
- 교과 커리큘럼 매핑 스프레드시트 (학년/단원별)
- 개별 강의 스크립트 (5-10페이지 × 월 20편)
- 주요 개념 다이어그램 스케치 (PowerPoint, 편당 15-30장)
- 과거 베스트 영상 시청 완료율 데이터
- 교사 인터뷰 인사이트 (어떤 설명이 어린이에게 잘 통하나)
- 학부모/학생 피드백 (정기 설문)
- 경쟁 플랫폼 (Khan Academy, 에버랜드북스) 영상 분석
- 자사 캐릭터 IP (교육용 마스코트, 캐릭터 시트 + 포즈)

**좌표**: (L3-L4 Depth, A-균일 + B-Island 캐릭터 마스코트)
- Shape: 과목별 균일 + 브랜드 캐릭터만 고정
- Rigidity: 커리큘럼 Locked, 마스코트 Locked, 비주얼 Draft
- Role: 교육 콘텐츠 PD
- Media: 스프레드시트, 스크립트, PPT, 데이터, 인터뷰, 캐릭터 시트

**기대**:
- "추상 개념(원자, 미적분 한계)을 AI로 직관적 시각화"
- "월 제작 편수 2배 증가"
- "개별 학생 레벨 맞춤 영상 생성 (미래)"

**불안**:
- "교육 내용 정확성 (수식 오류, 개념 왜곡)"
- "저작권 있는 교과서 이미지 재현 방지"
- "학부모가 'AI 티'에 민감"

**도입 장벽**:
- **개념적 정확성**: 수학 식/과학 다이어그램의 정밀 렌더링 현재 불가능
- **지속적 스타일 일관성**: 시리즈성 영상의 톤 균일성 필수
- **제작 단가 압박**: 외주 스튜디오 대비 AI가 편당 얼마? 계산 명확해야
- **교육부 인증**: 교과서 연계 인증 프로세스 거쳐야 판매 가능

---

### 페르소나 10. 뮤직비디오 감독 J — 3분 MV, 아티스트 이미지 존중 필수

**프로필**: 33세, 여성. MV 감독 6년차. K-Pop 4세대 걸그룹 MV 2편 연출 경험. 신규 러브송 MV 3분 24초 연출 의뢰 받음. 제작 기간 6주, 촬영 2일.

**자료 번들**:
- 노래 파일 MP3 (최종 마스터, 3:24)
- 가사 + 타임코드 문서 (소속사 제공)
- 아티스트 프로필 / 이미지 가이드 (소속사 PDF, 40페이지, 컨셉 중심)
- 아티스트 과거 MV 영상 12편 (자사 + 경쟁사)
- 안무 영상 (15초 티저, 연습실 원테이크)
- 아티스트 본인이 제시한 영감 이미지 20장 (소속사 통해 전달)
- 의상 디자이너 후보 스타일 레퍼런스
- 해외 MV 감독 작품 영감 리일 (본인 레퍼런스, 20편 편집)
- 제안 deck (본인 작성, 30페이지 InDesign PDF)
- 예산서 (프로덕션 견적)

**좌표**: (L4-L5 Depth, C-StyleFirst + E-Constraint)
- Shape: 톤/스타일 강함 + 아티스트 이미지 제약
- Rigidity: 아티스트 이미지 Locked (소속사 강력 통제), 음악 Locked, 비주얼 Preferred
- Role: MV 감독
- Media: MP3, 가사, PDF 이미지 가이드, 영상(자사+타사), 안무 영상, deck

**기대**:
- "PPM에서 시각적 컨셉 검증용 AI 시안 3-4개"
- "촬영 못 한 판타지 씬(우주, 꿈) AI로 제작"
- "안무 영상에 VFX 배경 합성 방향 제시"

**불안**:
- "아티스트/소속사는 어떤 변형도 거부할 가능성"
- "팬들이 아티스트 얼굴 AI 생성 반발 (딥페이크 연상)"
- "업계 신뢰도 저하 (AI 쓰는 감독 낙인)"

**도입 장벽**:
- **아티스트 초상권**: 실제 아티스트 얼굴을 AI로 재현 → 법적/윤리 리스크 최고 수준
- **음악 싱크**: 음악과 영상의 정확한 비트 싱크, AI는 현재 제어 불가
- **안무 재현**: 실제 안무를 AI 캐릭터가 재현 어려움
- **소속사 승인**: 매 단계 승인, 속도 저하
- **공개 반응**: K-Pop 팬덤은 변화에 매우 민감

---

### 페르소나 좌표 요약표

| # | 페르소나 | Depth | Shape | Rigidity(핵심) | 자료 규모 |
|---|---------|-------|-------|---------------|---------|
| 1 | 웹소설 작가 | L4 | B-Island | Story Locked | 중 (500MB) |
| 2 | IP 보유자 | L5 | B-Island | Character Locked | 중 (2GB) |
| 3 | CF 감독 | L3-L5 | C+E+H | Brand Locked | 대 (5GB) |
| 4 | 대행사 PD | L2 | E | Brand Locked | 중 (3GB) |
| 5 | 아트하우스 감독 | L6-L7 | A+H | Everything Locked | 대 (50GB) |
| 6 | YouTube 크리에이터 | L3 | A+F | Nothing Locked | 소 (200MB) |
| 7 | 브랜드 마케터 | L2 | E+B | Brand/Product Locked | 소 (500MB) |
| 8 | 게임 시네마틱 | L7-L8 | A+B | IP Locked (강함) | 초대 (100GB+) |
| 9 | 교육 PD | L3-L4 | A+B | Curriculum Locked | 중 (1GB) |
| 10 | MV 감독 | L4-L5 | C+E | Artist/Music Locked | 중 (2GB) |

---

## PART 9: Tale Studio 입력 UX의 최소 요건

10개 페르소나를 수용하려면 입력 슬롯 설계가 어떻게 되어야 하는가.

---

### 22. 필수 입력 슬롯 (Must-have)

모든 페르소나가 공유하는 최소 입력:

#### 22.1 Text Story/Concept (기존 필드 유지)
- 현재 `input.story: string` 그대로
- 1-2문단 ~ 전체 소설까지 가변 길이
- 페르소나 1 (180화 소설), 6 (Google Doc), 10 (가사) 모두 수용

#### 22.2 Reference Images (NEW 필수)
- 페르소나 1 (캐릭터 드로잉), 2 (스타일 가이드), 3 (영화 스틸), 5 (페인팅), 7 (제품), 8 (컨셉아트), 9 (마스코트), 10 (아티스트)이 전부 이미지 기반
- 업로드 수 **단일이 아니라 수십-수백 장** 대응 필요
- 각 이미지에 **의도 태그** 필수: "캐릭터", "톤", "구도", "로케이션", "안티레퍼런스"

#### 22.3 Constraint / Rigidity 표시 (NEW 필수)
- 각 입력 항목에 **Locked / Preferred / Draft** 마킹
- 페르소나 2, 3, 5, 7, 8, 10의 Locked 자산 보호 필수
- AI가 제안할 때 이 마킹을 읽어 Locked는 건드리지 않음

#### 22.4 Target Duration (NEW 필수)
- 페르소나 3 (30s), 7 (15-60s), 8 (2min), 10 (3:24), 9 (5-15min), 5 (90min) 전부 다름
- 초 단위 입력 필수. 템플릿으로 프리셋 제공 권장

### 23. 권장 입력 슬롯 (Nice-to-have)

대부분 페르소나가 유용하게 사용할 슬롯:

#### 23.1 Reference Videos
- 페르소나 3, 5, 6, 10이 reference 영상 다수 가져옴
- URL 링크(YouTube/Vimeo) + 타임코드 범위 지정
- Mood reel 역할

#### 23.2 Brand/IP Guide PDF
- 페르소나 2, 3, 4, 7, 8의 brand guide PDF
- 자동 파싱으로 color/font/logo 추출 시도
- VLM 한계로 완전 자동화 어려움 → **구조화된 필드 분리 입력 옵션** 제공

#### 23.3 Character Sheet (Turnaround)
- 페르소나 1, 2, 8, 9, 10의 캐릭터 고정 필요
- 다중 앵글 이미지 업로드 → Identity Lock 생성

#### 23.4 Target Platform
- 16:9 영화 / 9:16 모바일 / 1:1 소셜 자동 변형
- 페르소나 7의 멀티 플랫폼 요구

#### 23.5 Tone Keywords
- 형용사 3-10개 자유 입력
- 페르소나 2 (15 형용사), 3 (감독 선호), 10 (소속사 이미지) 모두 제공

#### 23.6 Anti-Reference / Don't Do
- 페르소나 2, 5, 7 (마케터는 법무 리스크)이 강하게 필요
- "이런 것은 피해주세요" 네거티브 예시 업로드

#### 23.7 Script / Screenplay
- 페르소나 5 (Final Draft), 6 (Google Doc), 9 (스크립트)이 가져옴
- 신(scene) 단위 파싱 → L2 Shot Composer 입력

### 24. 숨겨도 되는 입력 슬롯 (Advanced)

전문가만 쓰는 슬롯. 초기 UX에서 접힘 상태:

#### 24.1 Shot List (Pre-defined)
- 페르소나 5, 8만 사용
- CSV/Google Sheets 업로드
- 있으면 L2를 우회하고 직접 L3로

#### 24.2 Camera Config (6축)
- 페르소나 3, 5, 8이 수동 지정 원함
- horizontal/vertical/pan/tilt/roll/zoom 직접 조절
- Tale Studio `CameraConfig` 타입 활용

#### 24.3 Lighting Config
- 페르소나 3, 5, 8
- 키/필/백 라이트 위치 + 컬러 + 인텐시티

#### 24.4 Previs/Storyboard Upload
- 페르소나 5 (120장 스캔), 8 (Maya previs), 10 (안무 영상)
- 프레임 기반 구도/타이밍 reference

#### 24.5 Audio/Music Track
- 페르소나 10 (노래), 8 (사운드 레퍼런스), 5 (BGM 방향)
- 비트 싱크 생성 (현재 기술 한계, 후속 계획)

#### 24.6 Rights / License Information
- 페르소나 1 (팬아트 권리), 10 (아티스트 초상권), 8 (게임 IP)
- AI 학습 금지 표시 + 상업적 사용 범위

### 25. Progressive Disclosure 전략

모든 슬롯을 처음에 보여주면 페르소나 6 (유튜브 단독)은 포기. 페르소나 8은 부족함 호소. 다음 **단계별 노출 전략**:

#### Tier 1: 최소 입력 (페르소나 6, 7 만족)
```
[Prompt box: 어떤 영상을 만들고 싶나요?]
[Reference: 이미지 0-3장 옵션]
[Duration: 15s / 30s / 60s 프리셋]

→ 즉시 생성 가능 (현행 svc-pipeline 수준)
```

#### Tier 2: 구조 확장 (페르소나 1, 4, 9 만족)
```
Tier 1 +
[Reference Images: 다수 + 태그]
[Tone Keywords: 3-7개]
[Anti-Reference: 있으면]
[Target Platform: 비율 선택]
[Rigidity 마킹: Locked 항목 지정]
```

#### Tier 3: 전문가 모드 (페르소나 2, 3, 10 만족)
```
Tier 2 +
[Character Sheets + Identity Lock]
[Brand Guide PDF 업로드]
[Reference Videos: URL + 타임코드]
[Script upload]
[Scene-by-Scene 편집 가능]
```

#### Tier 4: 마스터 모드 (페르소나 5, 8 만족)
```
Tier 3 +
[Shot List CSV 업로드]
[Camera Config 6축 수동]
[Lighting Config 수동]
[Previs/Storyboard 프레임 업로드]
[Audio Track 삽입]
[Rights/License 메타데이터]
```

### 26. 페르소나 × Tier 매핑

| 페르소나 | 시작 Tier | 최대 Tier 요구 |
|---------|---------|--------------|
| 1. 웹소설 작가 | Tier 2 | Tier 3 |
| 2. IP 보유자 | Tier 2 | Tier 3 |
| 3. CF 감독 | Tier 2 | Tier 4 |
| 4. 대행사 PD | Tier 2 | Tier 3 |
| 5. 아트하우스 감독 | Tier 3 | Tier 4 |
| 6. YouTube 크리에이터 | Tier 1 | Tier 2 |
| 7. 브랜드 마케터 | Tier 1 | Tier 2 |
| 8. 게임 시네마틱 | Tier 3 | Tier 4 |
| 9. 교육 PD | Tier 2 | Tier 3 |
| 10. MV 감독 | Tier 2 | Tier 4 |

### 27. 디자인 원칙 도출

이 페르소나들을 관통하는 입력 UX의 원칙:

1. **Text-first, Reference-equal**: 텍스트 한 필드 + 레퍼런스 업로드 동등한 권한
2. **Rigidity Aware**: 모든 입력 항목에 Locked/Preferred/Draft 표시 가능
3. **Intent Tagging**: 이미지/영상 업로드 시 "캐릭터/톤/구도/네거티브" 등 의도 태그
4. **Progressive Tiers**: 1-4 단계 점진 공개, 기본은 Tier 1
5. **Scale Variable**: 0장~수백 장, 100KB~100GB 가변 대응
6. **External Link Friendly**: YouTube, Vimeo, Pinterest URL 직접 허용
7. **Multi-session**: 한 번에 다 못 채움 → 저장+이어쓰기 지원
8. **Rights Metadata**: 업로드 자료의 권리 표시
9. **Non-destructive**: Tier 업그레이드 시 이전 입력 보존
10. **Pipeline Hand-off**: 각 입력 슬롯이 L0/L1/L2/L3 어디에 매핑되는지 명시

---

## PART 10: 요약 및 다음 단계

### 28. 핵심 발견

1. **현실 자료는 혼재 포맷**: PDF + 이미지 + 영상 링크 + Slack 업로드가 같은 프로젝트에 병존
2. **수량 가변 1000배**: 유튜브 크리에이터 5장 ~ 장편 감독 수천 장
3. **Rigidity가 핵심**: 같은 입력도 Locked vs Draft가 AI 행동을 결정
4. **전달 도구 분산**: Pinterest + ShotDeck + Milanote + Dropbox + Frame.io 혼용
5. **스타일 가이드/브랜드 북은 구조화된 자산**: 파싱 필수, 하지만 VLM 한계
6. **IP 보유자의 승인 체인**: AI 도입 최대 장벽 (Disney, 소속사, 퍼블리셔)
7. **Pre-production 평균 3-6개월** → AI 적용 가능 구간 = 시각화/프리비주얼
8. **Creative brief 1-2 페이지 표준**: 짧다. 하지만 부가 자료(브랜드 북)는 방대
9. **Director's treatment 10-20 페이지 + 이미지 50장** = 광고/MV 세계의 deliverable 표준
10. **Mood board는 항상 여러 개**: 감독/DP/PD가 각자의 레이어 제작

### 29. Tale Studio 설계에 주는 시사점

- **`input.story: string` 단일 필드는 페르소나 6-7 (유튜브/마케터)만 커버**
- **페르소나 1-2, 4, 9**를 잡으려면 **Tier 2 (이미지+Rigidity+Tone+Constraint)** 필수
- **페르소나 3, 10**을 잡으려면 **Tier 3 (브랜드/IP 가이드 파싱 + Character Lock)** 필수
- **페르소나 5, 8**은 **Tier 4 (Shot List/Camera/Previs 통합)** 없으면 불가
- **Progressive disclosure**는 UX 선택이 아니라 **생존 조건**: 모든 걸 한 번에 보여주면 전원 이탈

### 30. 다음 연구 과제

- `research_multimodal_parsing.md`: 업로드된 PDF/이미지를 Tale Studio 내부 스키마로 자동 파싱하는 방법론 (VLM 한계 극복 전략)
- `research_rigidity_ui.md`: Locked/Preferred/Draft UI 패턴 표준 조사
- `research_asset_versioning.md`: 페르소나 5, 8 수준의 대용량 자산 관리 설계
- `research_progressive_tiers.md`: Tier 1→4 전환 UX 프로토타입 (Figma)

---

## Sources

### Pre-Production Workflow
- [No Film School — The Definitive Guide to Creating a Film and TV Mood Board](https://nofilmschool.com/film-mood-board)
- [No Film School — ShotDeck Is the Perfect Resource of Searchable Movie Images](https://nofilmschool.com/shotdeck-perfect-resource-searchable-movie-images)
- [Milanote — Free Filmmaking Moodboard Template & Example](https://milanote.com/templates/filmmaking/filmmaking-moodboard)
- [Milanote — Film Pre Production Template](https://milanote.com/templates/filmmaking/pre-production-plan)
- [Wandering DP — Commercial Cinematography Series: Building a Visual Lookbook](https://wanderingdp.com/videos-2/visual-lookbook/)
- [StudioBinder — Film Lookbook Examples & How to Make a Lookbook](https://www.studiobinder.com/blog/film-lookbook-examples/)
- [StudioBinder — How to Make a Film Mood Board](https://www.studiobinder.com/blog/how-to-make-a-film-mood-board/)
- [Premium Beat — The Mood Board: Set the Tone for Your Next Short Film](https://www.premiumbeat.com/blog/how-to-create-mood-board-for-film/)
- [Dan Mears DoP — A Guide to Pre-Production](https://danmears.tv/dop-preproduction/)

### Creative Brief & Advertising
- [Asana — Creative Briefs: What To Include](https://asana.com/resources/how-write-creative-brief-examples-template)
- [HubSpot — How to Write a Creative Brief in 11 Simple Steps](https://blog.hubspot.com/marketing/creative-brief)
- [Bynder — Creative Briefs: Definition, Examples & More](https://www.bynder.com/en/blog/find-creative-direction-write-great-creative-brief/)
- [Adobe Business — Creative Briefs: How to Write, Examples](https://business.adobe.com/blog/basics/creative-brief)
- [Workamajig — How to Write A Compelling Creative Brief](https://www.workamajig.com/blog/creative-brief)
- [Cannes Lions — Creative Strategy Awards](https://www.canneslions.com/awards/lions/creative-strategy)
- [Ad Age — Behind marketers' agency briefs meant to secure Cannes Lions wins](https://adage.com/events-awards/cannes-lions/aa-how-marketers-seek-out-ideas-aimed-at-winning-cannes-lions/)

### Director Treatment
- [Assemble — How to Write a Winning Director's Treatment](https://www.onassemble.com/blog/how-to-write-a-winning-directors-treatment)
- [Assemble — The Commercial Pre Production Book Template](https://www.onassemble.com/blog/the-commercial-pre-production-book-template)
- [The Collective Pitch — Directors Treatment Templates](https://thecollectivepitch.com/portfolio/directors-treatment-template/)
- [The Collective Pitch — Commercial Director Treatment Guide](https://thecollectivepitch.com/portfolio/commercial-director-treatment-guide-to-winning/)
- [Robin Piree — How To Write A Music Video Treatment](https://robinpiree.com/blog/how-to-write-music-video-treatment)
- [Wrapbook — Guide to the Music Video Treatment](https://www.wrapbook.com/blog/music-video-treatment)
- [Fstoppers — How to Write Treatment For a Music Video Pitch](https://fstoppers.com/business/how-write-treatment-music-video-pitch-180202)

### Storyboard & Animation
- [Adobe — How to Storyboard for Animation](https://www.adobe.com/uk/creativecloud/animation/discover/animation-storyboarding.html)
- [CG-Wire — Storyboarding in Animation: Definition, Process & Challenges (2026)](https://blog.cg-wire.com/storyboard-animation/)
- [Dreamfarm Studios — Animation Storyboard](https://dreamfarmstudios.com/blog/3d-animation-storyboard/)
- [Educational Voice — How to Storyboard Animation](https://educationalvoice.co.uk/how-to-storyboard-animation/)
- [Blooper — Storyboard vs. Animatic](https://blooper.ai/blog/storyboard-vs-animatic-difference)
- [StudioBinder — Animation Storyboard](https://www.studiobinder.com/blog/animation-storyboard-template/)

### IP & Style Guides
- [Design Force — Entering the World of Brand Licensing: Build a Style Guide First](https://designforceinc.com/thinking/entering-brand-licensing-build-style-guide-first/)
- [Disney Studio Licensing](https://www.disneystudiolicensing.com/)
- [Byron Lee Design — Disney Branding Guides](https://www.byronleedesign.com/brandguides)
- [Schall Creative — How Disney Does Brand Guidelines Everyday](https://schallcreative.com/how-disney-does-brand-guidelines-everyday/)
- [Screen Australia — How to Write a Transmedia Production Bible](https://www.screenaustralia.gov.au/getmedia/33694e05-95c2-4a05-8465-410fb8a224aa/Transmediaproduction-bible-template.pdf)
- [CharacterHub — How To Make An Amazing Character Design Sheet](https://characterhub.com/blog/character-resources/character-design-sheet)
- [Spines — Character Turnaround Guide](https://spines.com/character-turnaround/)
- [CG-Wire — Character Sheets (2026)](https://blog.cg-wire.com/character-sheet-animation/)
- [Creative Bloq — How to make your own character bible](https://www.creativebloq.com/how-to/make-your-own-character-bible)

### Reference Platforms
- [ShotDeck — #1 Source of HD Movie and Commercial Screenshots](https://shotdeck.com/)
- [ShotDeck — Pricing](https://shotdeck.com/welcome/pricing)
- [Daniel Grindrod — ShotDeck Overview: The BEST Cinematography Reference Tool](https://www.danielgrindrod.com/blog/shotdeck)
- [Kosmik — Milanote Alternatives](https://www.kosmik.app/blog/milanote-alternatives)
- [Medium (Theo James) — Looking for Milanote Alternatives](https://medium.com/@theo-james/looking-for-milanote-alternatives-here-are-the-best-options-3516bfbba38e)
- [Find PM Software — Notion vs Milanote](https://findpmsoftware.com/resources/notion-vs-milanote)
- [Dropbox — How Filmmakers Can Streamline the Creative Process](https://www.dropbox.com/resources/streamline-film-production)
- [Dropbox Blog — 8 more ways you can use Dropbox for your next film](https://blog.dropbox.com/topics/work-culture/more-ways-use-dropbox-film)
- [Beverly Boy — Visual Storytelling 101: Using Pinterest & ShotDeck](https://beverlyboy.com/film-technology/visual-storytelling-101-using-pinterest-shotdeck-for-mood-boards/)

### Production Design
- [Art Departmental — Film Art Department Production Design](https://artdepartmental.com/blog/film-art-department-production-design/)
- [Filmmaker Tools — Production Designer vs Art Director](https://www.filmmaker.tools/production-designer-vs-art-director)
- [Pushing Pixels — The Art and Craft of Production Design (Richard Hoover)](https://www.pushing-pixels.org/2018/11/13/the-art-and-craft-of-production-design-interview-with-richard-hoover.html)
- [Clip Studio — Becoming a Concept Artist for a Hollywood Film](https://www.clipstudio.net/how-to-draw/archives/155681)
- [80 Level — Working as a Concept Artist in the Fast-Paced Film Industry](https://80.lv/articles/working-as-a-concept-artist-in-the-fast-paced-film-industry)

### Game Cinematic
- [Room 8 Studio — Video Game Trailer Production](https://room8studio.com/news/video-game-trailer-production-a-glance-behind-the-scenes/)
- [Ixie Gaming — Game Art Production Pipeline](https://www.ixiegaming.com/blog/navigating-the-game-art-production-pipeline/)
- [Pixune — Game Art Pipeline from Idea to Polish](https://pixune.com/blog/game-art-pipeline/)

### Webtoon/Webnovel Adaptation
- [Korea Times — Hits and Misses: Webtoon Adaptations](https://www.koreatimes.co.kr/entertainment/shows-dramas/20260101/hits-and-misses-webtoon-adaptations-dominate-but-execution-decides-success)
- [Deadline — How Webtoons Are Becoming The Latest Korean Export](https://deadline.com/2023/07/korea-webtoon-naver-wattpad-kakao-entertainment-netflix-disney-1235430199/)
- [WEBTOON Entertainment — Warner Bros. Animation Partnership](https://ir.webtoon.com/news-releases/news-release-details/warner-bros-animation-and-webtoon-entertainment-announce)
- [League of Filmmakers — From Webtoons to Blockbusters](https://www.leagueoffilmmakers.com/from-sweet-home-to-true-beauty-how-korean-webtoons-are-reshaping-global-streaming/)

### Indie / Solo Creator
- [Studiovity — Best Film Pre-Production Software 2026](https://blog.studiovity.com/best-film-pre-production-software-2026-free-vs-paid/)
- [Indie Shorts Mag — Essential Filmmaking Equipment and Tools](https://www.indieshortsmag.com/articles/2025/10/essential-filmmaking-equipment-and-tools-for-independent-creators/)
- [Sumera — YouTube Video Production Workflow](https://sumera.io/blog/complete-youtube-video-production-workflow)
- [Primal Video — Our YouTube Content Creation Process](https://primalvideo.com/video-creation/shooting/video-content-creation-our-process-from-youtube-video-idea-to-release/)

### AI Video Limitations
- [LTX Studio — AI Video Prompt Guide](https://ltx.studio/blog/ai-video-prompt-guide)
- [Digital Brew — AI-Generated Video Limitations](https://www.digitalbrew.com/blog/the-hidden-downsides-of-ai-generated-videos/)
- [arXiv — Prompt-A-Video](https://arxiv.org/html/2412.15156v1)

### Educational Video
- [Teachers Institute — How to Write a Script and Storyboard for Educational Videos](https://teachers.institute/design-development-and-delivery-of-courseware/write-script-storyboard-educational-videos/)
- [Educational Voice — Explainer Video Production 101](https://educationalvoice.co.uk/from-storyboard-to-final-cut-the-explainer-video-production-process/)

### Music Video
- [Berklee — Music Video Director](https://www.berklee.edu/careers/roles/music-video-director)
- [Wikipedia — Artistic control](https://en.wikipedia.org/wiki/Artistic_control)
- [AWAL — Building Your Dream Team: The Creative Director](https://www.awal.com/blog/creative-director-music/)
- [CineD — Art Direction in Music Videos (Cole Walliser interview)](https://www.cined.com/art-direction-in-music-videos-part-one-interview-with-director-cole-walliser/)

### Brand Marketing / Short-form
- [Vidico — 7 Best Short Form Video Examples](https://vidico.com/news/short-form-video-examples/)
- [Shootsta — Video Marketing Strategy: A Practical Framework](https://shootsta.com/blog/video-marketing-strategy-practical-framework)
- [Levitate Media — Short-Form Video Production Best Practices](https://levitatemedia.com/learn/mastering-short-form-video-production-best-practices-and-marketing-tips)
