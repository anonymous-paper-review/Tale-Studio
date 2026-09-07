# 그림 → Facet 분해 체계 (근거 레퍼런스 포함)

> 목적: 그림(사진이 아닌 일러스트)을 자연어 facet들로 분해한 뒤, 그 facet만으로 이미지 생성기를 돌려 원본과 거의 동일한 결과를 얻는 것.
> 문서 구성: ① facet 정의 → ② 전역 facet → ③ 캐릭터 facet 계층 → ④ 메타 태그와 우선순위 → ⑤ facet별 근거 링크 → ⑥ 어휘·데이터셋·논문 → ⑦ 재검색용 검색어 → ⑧ 주의사항

---

## 1. Facet의 정의

**facet = (대상, 속성, 값) 하나짜리 명제.** 재생성된 이미지를 보고 참/거짓을 독립적으로 판정할 수 있는 최소 단위.

- 예: `(선, 굵기, 얇고 균일)` / `(인물1, 위치, 좌측 1/3)` / `(배경, 처리, 단색 크림색)`
- 이렇게 잡는 이유: 나중에 VQA로 facet별 재현 여부를 자동 검증할 수 있음 → 어떤 facet 유형이 약한지 측정 가능 (§6의 DSG가 직접 선례)
- 값 체계: 가능한 한 닫힌 어휘(enum) + 자유 텍스트 필드 1개. 상위 "번들 facet"(예: `세일러 교복`)이 하위 여러 facet을 압축하고, 필요하면 개별 항목으로 오버라이드.

---

## 2. 전역 Facet (그림 전체)

### 2.1 스타일층 — 어떻게 그려졌나
| facet | 값 예시 |
|---|---|
| 매체/기법 | 연필, 잉크펜, 수채, 과슈, 유화, 벡터, 픽셀아트, 디지털 셀셰이딩, 판화 |
| 양식/장르 | 아니메, 미국 만화, 그림책, 아르누보, 우키요에, 컨셉아트, 미니멀 라인아트 |
| 선 | 유무 / 굵기 / 강약(균일 vs 압력 변화) / 색(검정·갈색·컬러라인) / 질감(거침·매끈·떨림) / 윤곽 닫힘 여부 |
| 채색·명암 방식 | 플랫, 셀셰이딩(2톤/3톤), 소프트 그라데이션, 해칭, 점묘, 스크린톤 |
| 팔레트 | 주조·보조·강조색(hex), 색 개수(제한 팔레트), 채도 범위, 명도 범위, 온도, 조화 유형 |
| 광원 | 방향, 대비 강도, 그림자 유무·형태, 림라이트, 하이라이트 스타일 |
| 텍스처 | 종이결, 붓자국, 그레인, 반톤 |
| 묘사 밀도·완성도 | 스케치 vs 완성, 디테일 수준, 사실성 정도(기호적~사실적), 데포르메 정도 |
| 캔버스 | 종횡비, 여백, 테두리/프레임, 배경 투명/흰색/장면 |

### 2.2 구도층
- 시점(정면/부감/앙각), 원근 종류(1점/2점/등축/무원근)
- 화면 거리(클로즈업/바스트/전신/원경)
- 배치 구조(중앙집중/삼분할/대칭/대각선)
- 층 구조: 전경·중경·배경 각각의 내용, 지평선 높이
- 초점 영역 vs 흐림·생략 영역, 여백 분포

### 2.3 환경층
- 장소, 시간대, 날씨, 계절
- 배경 처리 방식: 단색 / 그라데이션 / 패턴 / 상세 장면 / 흐림

### 2.4 그래픽 요소층
- 텍스트(내용·서체·위치), 말풍선, 패널 분할, 효과선, 스파클·이펙트, 서명·워터마크

### 2.5 부재 facet
- "윤곽선 없음", "그림자 없음", "배경 없음", "텍스트 없음"처럼 **없는 것을 명시**.
- 생성기는 기본값을 채워 넣는 경향이 있어서, 이게 빠지면 원본에 없는 요소가 생김.

---

## 3. 캐릭터 Facet 계층

변동성 순서로 배열: **A 정체성(불변) → B 신체(준불변) → C 외장(교체 가능) → D 상태(순간) → E 국소 렌더링 → F 배치 → G 관계**

### A. 정체성층 — 누구/무엇인가 (불변)
- 존재 유형: 인간 / 수인·동물 / 로봇·기계 / 몬스터·정령 / 의인화 사물 / 마스코트
- 인간형 정도: 완전 인간형 ~ 부분 인간형 ~ 비인간형
- 외견상 성별 표현, 외견상 연령대(유아/아동/청소년/청년/중년/노년)
- 원형·역할(번들 태그): 기사, 마법사, 학생, 회사원, 아이돌 …
- 고유 식별: 기존 캐릭터명 / 오리지널
- 종족 파츠 유무(뿔·꼬리·날개·동물귀·비늘·기계부위) — 상세는 B4

### B. 신체층 (준불변)

**B1. 비율·체형**
- 등신(head-to-body ratio): 2등신 치비 ~ 8등신
- 데포르메 정도: 사실 해부 ~ 극단 단순화
- 체형: 마름/보통/근육/통통, 어깨 너비, 허리·골반 라인
- 상대 키(다른 캐릭터 대비)

**B2. 얼굴 구조**
- 얼굴형: 둥근/계란/각진/역삼각/긴/다이아몬드, 턱선
- 얼굴 비율: 눈 위치(아래로 갈수록 어린 인상), 눈 크기/얼굴 비율, 눈 사이 간격
- 눈: 형태(둥근/삼각/사각·almond/처진/올라간), 홍채 색(+그라데이션·투톤), 동공 형태, 하이라이트(개수·위치·모양), 속눈썹(유무·방향·굵기), 눈썹(모양·굵기·색), 쌍꺼풀 유무, 눈 묘사 수준(점눈/단순/상세)
- 코: 표현 방식(생략/점/선/명확), 크기
- 입: 크기, 표현(선/입술 묘사), 입술 색
- 귀: 형태(인간/뾰족/동물), 노출 여부
- 얼굴 표식: 주근깨, 점, 흉터, 홍조선, 문신·페이스페인트, 수염
- 피부: 색(hex), 톤 표현(단색/그라데이션), 재질(살/금속/비늘/털)

**B3. 머리카락** (앞머리 / 옆머리 / 뒷머리 3구역으로 분리해 기술)
- 길이: 매우 짧음/단발/중간/긴/매우 긴
- 색: 베이스, 그라데이션·하이라이트, 투톤, 안쪽 색(inner color)
- 앞머리: 일자/시스루/옆으로/커튼(가운데 가르마)/M자/없음
- 옆머리: sidelocks 길이·유무
- 뒷머리: 내림/포니테일/트윈테일/땋음/번/올림
- 가르마 위치, 아호게·더듬이
- 질감: 직모/웨이브/곱슬, 볼륨, 층
- 렌더링 방식: 덩어리(chunky)/가닥, 하이라이트 형태(단순 띠/그라데이션 띠/지그재그/링)

**B4. 신체 파츠·표식**
- 비인간 파츠 각각: 종류, 위치, 개수, 크기, 색
- 손: 손가락 수(4/5), 표현 수준(장갑형/상세)
- 신체 문양·문신·흉터, 체모
- 의족·의수 등 결손/대체

### C. 외장층 (교체 가능)

**C1. 의상** — 레이어별(이너 → 상의/하의 또는 원피스 → 아우터 → 신발·양말·장갑)
- 아이템 공통 속성: 종류 / 주색·보조색 / 무늬(무지·줄·체크·프린트) / 재질(면·가죽·금속·투명) / 핏(타이트·루즈) / 기장·소매·노출 범위 / 디테일(단추·리본·지퍼·프릴·주름) / 상태(찢김·구겨짐·젖음)
- 세트 번들: `세일러 교복`, `판금 갑옷`, `메이드복` …

**C2. 액세서리** (위치별)
- 머리: 리본, 핀, 머리띠, 모자, 왕관, 헤일로
- 얼굴: 안경, 고글, 가면, 안대, 피어싱
- 목·귀·손: 초커, 목걸이, 귀걸이, 반지, 팔찌, 시계
- 몸: 망토, 스카프, 가방, 벨트
- 각각: 색, 크기, 재질

**C3. 소지품·장비**
- 종류(무기/도구/음식/책), 어느 손, 잡는 방식(쥠/받침/어깨에 걺), 크기

**C4. 착탈 가능한 신체 표식**
- 화장(립·아이섀도·블러셔), 네일, 붕대·반창고

### D. 상태층 — 이 그림의 순간

**D1. 포즈**
- 기본 자세: 서기/앉기/눕기/무릎 꿇기/점프/걷기/달리기
- 몸통 방향(정면/3/4/측면/후면), 기울기·비틀림
- 머리 방향(몸통 대비), 고개 각도(숙임/젖힘/기울임)
- 시선: 뷰어 응시 / 좌·우·상·하 / 감음
- 팔 각각: 위치(내림/올림/허리/팔짱/뒷짐/머리 뒤), 손 제스처(브이/주먹/펼침/가리킴)
- 다리: 벌림/모음/꼬기/한쪽 들기
- 동세 라인(S/C/직선), 무게 중심, 대칭 여부
- 정밀도 필요 시: 주요 관절을 세미 정량(각도·상대 위치)으로

**D2. 표정** — "3개의 컨트롤": 눈썹 / 눈 / 입
- 감정 카테고리 + 복합(수줍음/득의/피곤/멍함), 강도(미세~과장)
- 눈썹: 올림/찡그림/팔자, 안쪽 끝 높이 vs 바깥 끝 높이
- 눈: 뜬 정도, ^^ 웃는 눈, 반개, 째림, 홍채 축소(충격/진지한 분노)
- 입: 다뭄/미소/벌림/이 드러냄/삐죽/혀
- 볼: 홍조(선/면), 부풀림 · 눈물·땀
- 만화 기호(manpu): 땀방울, 분노 마크(💢형), 하트·별·소용돌이 눈, 이마 핏줄, 얼굴 위 세로 음영선, 말줄임표 — 표정과 **별개의 독립 facet**

**D3. 동작**
- 동사 + 대상(무엇을/누구와)
- 동작 단계: 준비/절정/후속
- 모션 표현: 스피드라인, 잔상, 머리카락·옷 휘날림(바람 방향)

**D4. 물리·생리 상태**
- 젖음, 더러움, 상처, 발광, 투명, 부분 변신
- 헐떡임, 땀, 수면

### E. 캐릭터 국소 렌더링 — 전역 스타일의 오버라이드
- 윤곽선: **외곽(실루엣) 굵기 vs 내부 굵기**, 선 색
- 셰이딩: 피부 톤 단계 수, 옷 주름 표현 정도, 드리운 그림자 여부
- 눈·얼굴 디테일 밀도 vs 의상 디테일 밀도
- 이펙트: 글로우, 오라, 캐릭터 주변 파티클

### F. 배치층 — 캔버스 위 어디에
- 위치(3×3 그리드 또는 %), 앵커(발·머리가 닿는 지점)
- 크기: 캔버스 높이 대비 %
- 프레이밍: 전신/무릎/허리/바스트/얼굴 — 어디서 잘렸나
- 깊이층: 전경/중경/배경, z-order
- 가려짐: 무엇에 의해 어느 부위가

### G. 관계층 — 다른 개체와
- 공간: 옆/앞/뒤/위
- 접촉: 손잡기/안기/어깨동무/기댐
- 주의: 누가 누구를 보는지
- 상대 크기·키 차이, 상호작용 동사

---

## 4. 메타 태그와 우선순위

각 facet에 두 값을 붙여둔다.

1. **변동성**: 불변(A, B 대부분) / 준불변(C) / 가변(D~G)
   - "같은 캐릭터"의 정의 = 불변+준불변 층. 장면 재현 = 가변층.
   - 실무의 캐릭터 시트(턴어라운드)가 정확히 이 분리를 수행함.
2. **식별 기여도**: 애니·만화풍 기준 대략 **머리(형태+색) > 눈(색+형태) > 실루엣(등신·체형·의상 실루엣) > 시그니처 액세서리 > 피부색 > 나머지**.
   - 프롬프트 길이 예산이 빠듯하면 기여도 낮은 facet부터 버림.

**전체 그림의 유사도 기여 순서** (사람이 "거의 동일"이라 느끼는 데): 구도/배치 > 주요 개체 정체+자세 > 매체/선/채색 방식 > 팔레트 > 세부 속성 > 분위기.

**한계와 보완**
- 자연어만으로는 위치·형태 정밀도에 상한이 있음 → 숫자 앵커("x 20–45%, y 10–70%")를 쓰고, "거의 동일"이 목표면 facet 텍스트 + 구조 조건(layout-to-image 박스, ControlNet 에지/포즈/뎁스) 하이브리드가 사실상 필요.
- 개선 루프: 그림 → facet JSON → 프롬프트 → 생성 → facet별 VQA 검증 → 실패 facet 유형 강화.

---

## 5. Facet별 근거 레퍼런스 (링크)

각 항목: 어떤 facet의 근거인지 → 링크 → 한 줄 메모(내 요약).
※ 튜토리얼 사이트가 대부분이라 품질은 제각각. 특정 작품 캐릭터 대신 일반 작화 가이드 위주로 골랐음.

### 5.1 B1 등신·데포르메 — 값 범위의 근거
- [Sparvierosart – 치비 body ratio (CLIP STUDIO TIPS)](https://tips.clip-studio.com/en-us/articles/4806) — 성인 1:6~1:9, 치비 1:2~1:4로 범위를 제시. 등신을 바꿔도 팔 길이·손 크기 같은 하위 비율을 유지해야 "인간"으로 읽힌다는 점이 하위 facet 분리의 근거.
- [aha0624 – 치비 캐릭터 그리기 Tip #1 (CLIP STUDIO TIPS)](https://tips.clip-studio.com/en-us/articles/10582) — 6.5등신 캐릭터를 2~3등신으로 변환하는 과정. 같은 정체성(A층)에 B1만 바꾼 사례.
- [CHYEE – 치비 신체 비율 스터디 (CLIP STUDIO TIPS)](https://tips.clip-studio.com/en-us/articles/4829) — 치비 몸통을 계란형/직사각형 두 유형으로 분류. 체형 facet의 enum 예.
- [Art Rocket – 치비 캐릭터 만들기](https://www.clipstudio.net/how-to-draw/archives/155423) — 같은 등신에서도 몸통 길이·다리 길이가 인상을 바꿈 → 등신 하나로 끝내지 말라는 근거.
- [Mary Li Art – 치비 일반 특징](https://maryliart.com/how-to-draw-anime-chibis-general-features) — 1:1, 1:2, 1:3 비교 예시.
- [Kamapon – 치비 튜토리얼 (Patreon, 공개 글)](https://www.patreon.com/kamapon/posts/tutorial-how-to-52521537) — 일반 만화 7~8등신 vs 치비 2~3등신 대비.

### 5.2 B3 머리카락 — 앞머리/옆/뒤 3구역 분해와 앞머리 어휘
- [lavaritte – 아니메 헤어 완전 가이드](https://lavaritte.com/blogs/anime-hair-tutorial/) — 머리카락을 앞머리/옆/뒤 3존으로 나누고 "앞머리가 캐릭터 인상을 가장 좌우한다"고 설명. B3의 구역 분리와 식별 기여도 순서의 근거.
- [Draw Cartoon Style – 앞머리 종류별 그리기](https://drawcartoonstyle.com/how-to-draw-bangs/) — 일자·커튼·사이드 등 앞머리 유형을 개별 단계로 다룸 → 앞머리 enum.
- [Winged Canvas – 여성 아니메 헤어(앞머리·트윈테일·포니테일)](https://www.wingedcanvas.com/single-post/how-to-draw-female-anime-hair-in-pencil-bangs-pigtails-and-ponytails) — 옆머리(sidelocks)와 가르마 표시가 별도 요소로 등장.
- [Crysa – Drawing Anime Hair: Bangs (DeviantArt)](https://www.deviantart.com/crysa/art/Drawing-Anime-Hair-Bangs-34535785) — 앞머리 형태 비교 시트.
- [Art Rocket – 아니메 헤어 쉬운 가이드 (Hyanna Natsu)](https://www.clipstudio.net/how-to-draw/archives/161517) — 하이라이트를 blob/삼각/선 등 "형태"로 다룸 → 하이라이트 형태 facet.

### 5.3 B3 머리카락 하이라이트 렌더링 방식
- [AnimeOutline – 아니메 헤어 하이라이트 그리는 여러 방법](https://www.animeoutline.com/different-ways-to-draw-anime-hair-highlights/) — 단순 띠 / 그라데이션 띠 / 상세형 3종 비교. 하이라이트 형태 enum의 직접 근거.
- [AnimeOutline – 아니메 헤어 셰이딩 단계별](https://www.animeoutline.com/how-to-shade-anime-hair-step-by-step/) — 지그재그 하이라이트와 덩어리(clump) 단위 그림자.
- [KiwiChameleon – 머리카락 하이라이트](https://www.kiwichameleon.com/tutorial-highlights-in-hair) — 하이라이트가 머리 위 "링" 위에 놓인다는 설명 → 링 하이라이트 값.

### 5.4 B2 눈 — 형태 어휘와 하이라이트
- [JeyRam – 아니메 눈 디자인](https://www.jeyram.org/eye-design) — 눈 형태를 둥근/삼각/사각 3범주로 분류. 하이라이트 모양(긴 사각+원 등)을 초반에 별도로 잡음 → 형태·하이라이트 facet 분리 근거.
- [yitsuin – 눈 스타일라이즈 (CLIP STUDIO TIPS)](https://tips.clip-studio.com/en-us/articles/6515) — 실제 눈의 구성요소를 아니메 눈으로 매핑. 눈 묘사 수준 facet.
- [Christine Britton – 21 Anime Eye Shape Ideas](https://www.christinebritton.com/eye-shapes-drawing-anime/) — almond/round/sharp, 눈꼬리 상향/하향, 쌍꺼풀 유무, 눈 사이 간격("한 눈 너비") 규칙.
- [Art in Context – 아니메 눈 3가지 표현](https://artincontext.org/how-to-draw-anime-eyes/) — 원/다각형/마름모 3형태와 감정 연결.
- [Mary Li Art – 정면 아니메 눈, 성별·연령별](https://maryliart.com/how-to-draw-anime-eyes-front-view-different-styles-ages-male-and-female-eyes) — 연령·성별에 따른 눈 크기·둥글기 차이.
- [DrawingForAll – 아니메 눈 그리기](https://www.drawingforall.net/how-to-draw-anime-eyes/) — 세로로 긴 눈 vs 가로로 긴 사실적 눈.

### 5.5 B2 얼굴형 — 어휘
(뷰티 가이드지만 분류 어휘는 작화와 동일)
- [face-shapes-detector – 7 Face Shapes](https://face-shapes-detector.com/face-shapes/) — oval/round/square/oblong/heart/diamond/triangle 7분류.
- [Totapari – 얼굴 기하와 형태 판정](https://totapari.com/blogs/news/facial-geometry-and-face-shape-assessment) — "길이 vs 너비", "가장 넓은 부위"라는 2가지 질문으로 판정 → 정량 facet으로 바꿀 때 참고.
- [The Glow Memo – 8 Face Shapes](https://theglowmemo.com/what-is-my-face-shape) — 8분류 버전.

### 5.6 D2 표정 — 눈썹/눈/입 부위별 분해의 근거
- [AnimeOutline – 12가지 아니메 표정 차트](https://www.animeoutline.com/12-anime-facial-expressions-chart-drawing-tutorial/) — 12감정을 각각 눈꺼풀·눈썹 안쪽 끝·입 곡선 조합으로 설명. 부위별 facet의 직접 근거.
- [Character Art School – 표정: 눈썹·눈·입](https://www.characterartschool.com/how-to-draw-facial-expressions/) — "표정은 3개의 컨트롤"이라는 관점. 한 부위만 반대로 밀어 복합 감정을 만드는 방법 → 복합 감정 facet.
- [Envato Tuts+ – 표정 마스터하기](https://design.tutsplus.com/tutorials/human-anatomy-fundamentals-mastering-facial-expressions--cms-21140) — 눈썹을 "머리"와 "곡선" 두 부분으로 쪼개 조합표를 만듦.
- [Winged Canvas – 흥미로운 표정 그리기](https://www.wingedcanvas.com/single-post/how-to-draw-interesting-facial-expressions) — 감정별 눈썹·눈·코·입 체크리스트.
- [Skillshare – 표정 그리기 가이드](https://www.skillshare.com/en/blog/how-to-draw-facial-expressions-a-guide/) — 분노/공포 등의 긴장 포인트.

### 5.7 D2 만화 기호(manpu) — 표정과 별개 facet인 근거
- [Visual Language Lab – Manga Morphology](https://www.visuallanguagelab.com/jvl) — 기호 / 의미 / 붙는 위치(affix) 표. **닫힌 어휘로 바로 쓸 수 있는 가장 체계적인 자료.**
- [Manga Wiki – Manga iconography](https://manga.fandom.com/wiki/Manga_iconography) — 땀방울·핏줄·홍조 등 표준 설명.
- [whatNerd – 16가지 만화 기호](https://whatnerd.com/manga-iconography-explained-common-symbols/) — 축소된 동공, 번개 등 추가 기호.
- [Japan Powered – 아니메 시각 언어](https://www.japanpowered.com/japan-culture/animes-visual-language) — 홍조 색(빨강/파랑)에 따른 의미 차이, 세로선 색상별 의미.
- [UMich Anime – Emotional Iconography](https://public.websites.umich.edu/%7Eanime/info_emotions.html) — 땀방울 크기·개수 = 강도.

### 5.8 D1 포즈 — 세분화의 근거
- [Pose Library – 아티스트용 레퍼런스 포즈](https://poselibrary.com/reference-poses-for-artists) — 동세 라인, 몸통 기울기, 골반 무게 이동을 먼저 읽으라는 접근 → D1의 동세 라인·무게 중심 facet.
- [Don Corgi – 앉은 포즈 21종](https://doncorgi.com/blog/sitting-drawing-reference-poses/) — "앉기" 안에서도 다리 벌림·시선·정면 여부로 갈라지는 예.
- [Artsydee – 앉은 포즈 18종](https://www.artsydee.com/sitting-drawing-reference/) — 척추선+관절 연결로 포즈를 기술하는 방식.

### 5.9 A~C 정체성 고정 — 턴어라운드 시트
- [Spines – Character Turnaround Guide](https://spines.com/character-turnaround/) — 정면/측면/후면/3/4 뷰로 비율·디테일을 고정하는 목적 설명. "불변층 = 시트"의 근거.
- [DreamPixelForge – Turnaround 만드는 법](https://www.dreampixelforge.com/blog/character-turnaround) — 실루엣·비율·의상·특징을 먼저 잠그고 회전. 조명·포즈는 모든 뷰에서 동일하게 유지 → 변동성 분리 원칙 그대로.
- [Simple Art Tips – Turnaround Sheet 튜토리얼](http://www.simplearttips.com/tutorials-blog/turnaround-sheet) — 실습형 설명.
- [Scenario – AI로 턴어라운드 생성](https://help.scenario.com/articles/1419523552-generate-character-turnarounds) — 생성기용 캐릭터 시트 프롬프트 예시. 이 프로젝트의 프롬프트 형식 참고용.

### 5.10 E / 2.1 채색 방식 — 팔레트와 독립인 근거
- [Shilo's Art – Cel vs Soft Shading](https://www.shilosart.com/cel-shading-vs-soft-shading/) — 동일 선화·동일 베이스 색에 셰이딩만 다르게 한 A/B. **채색 방식 facet이 팔레트와 독립**이라는 가장 직접적인 예.
- [Kyorin – 초보용 4가지 셰이딩 스타일 (CLIP STUDIO TIPS)](https://tips.clip-studio.com/en-us/articles/3010) — 셀 / 검정 단색 셀 / 소프트 등 4종 비교.
- [Adobe – Cel Shading 가이드](https://www.adobe.com/uk/creativecloud/animation/discover/cel-shading.html) — 셀(블록 색) vs 소프트(블렌딩) 정의.
- [Winged Canvas – 피부 렌더링: Soft vs Cel (YouTube)](https://www.youtube.com/watch?v=UJE6buM-DzY) — 피부에 두 방식 적용 비교.
- [RebusFarm – Cel Shading 기법](https://rebusfarm.net/blog/how-to-do-cel-shading-techniques-tools) — 3D/툰셰이딩 관점 정의.

### 5.11 E / 2.1 선 — 외곽 vs 내부 굵기 분리의 근거
- [MediBang – 굵은 선과 얇은 선으로 선화 그리기](https://medibangpaint.com/en/use/2022/07/how-to-draw-a-line-drawing-for-people-who-are-not-good-at-the-strength-of-line-drawing/) — 파츠별 "외곽선"을 굵게, "내부선"을 얇게. E의 외곽/내부 facet 그대로.
- [Aaron Hertzmann – 선 굵기의 이론](https://aaronhertzmann.com/2021/05/19/how-to-draw-line-thickness.html) — 실루엣 선이 내부 선보다 굵고, 거리·곡률에 따라 얇아지는 규칙을 계산적으로 설명. 정량화 가능한 facet의 근거.
- [RapidFireArt – Line Quality 입문](https://rapidfireart.com/2017/08/15/lesson-7-introduction-to-line-quality/) — 선 굵기로 깊이·무게·시선 유도.
- [The Virtual Instructor – 잉크 드로잉의 선 위계](https://thevirtualinstructor.com/blog/line-hierarchy-in-ink-drawing) — 선 굵기 2~3단계 위계, 선 "성격"(유려/거침/매끈) 비교 → 선 질감 facet.
- [YamPuff – 잉킹 튜토리얼](https://www.yampuff.com/inking-tutorial-yampuff/) — 교차점 굵게, 원근 얇게.

### 5.12 2.1 사실성·데포르메 스펙트럼
- [Better Posters – McCloud의 Big Triangle](https://betterposters.blogspot.com/2016/08/scott-mcclouds-big-triangle-and-poster_18.html) — 사진(사실) → 아이콘(추상) 축의 개념 정리.
- [Goodreads 블로그 – Why Simple Is So Complicated](https://www.goodreads.com/author_blog_posts/9762249-why-simple-is-so-complicated-analyzing-comics-101-abstraction?tab=book) — 추상화를 **밀도(선 개수)** 와 **윤곽 품질(선 형태의 과장)** 두 축으로 분리. "묘사 밀도"와 "데포르메 정도"를 별개 facet으로 둔 근거.
- [Patrick Burns – Understanding Comics 요약](https://pattyjburns.medium.com/understanding-comics-by-scott-mccloud-quick-synopsis-bcc2fa260075) — 삼각형의 세 축 개요.

---

## 6. 어휘(enum)·데이터셋·논문

### 6.1 Danbooru 태그 그룹 — 캐릭터 facet 닫힌 어휘의 실무 표준
> ⚠️ Danbooru 사이트 자체에는 성인 콘텐츠가 포함됨. 아래는 텍스트 위키 페이지만 링크.
- [Tag Groups 인덱스](https://danbooru.donmai.us/wiki_pages/tag_groups)
- [Hair styles](https://danbooru.donmai.us/wiki_pages/tag_group:hair_styles) / [Hair color](https://danbooru.donmai.us/wiki_pages/tag_group:hair_color)
- [Eyes](https://danbooru.donmai.us/wiki_pages/tag_group:eyes_tags)
- [Attire](https://danbooru.donmai.us/wiki_pages/tag_group:attire) / [Headwear](https://danbooru.donmai.us/wiki_pages/tag_group:headwear)
- [Body parts](https://danbooru.donmai.us/wiki_pages/tag_group:body_parts)
- [Moescape – Danbooru 태그 사용법](https://moescape.ai/posts/what-are-danbooru-tags-and-how-to-use-them) — 태그를 인원수 → 외형 → 표정 → 포즈 → 의상 → 환경 → 조명 순으로 배열하는 관례. 아니메 계열 생성기 프롬프트의 facet 순서 참고.

### 6.2 검증 루프 — DSG / TIFA
- [Davidsonian Scene Graph (arXiv 2310.18235)](https://arxiv.org/abs/2310.18235) — 프롬프트를 원자 명제로 분해하고 의존성 DAG로 묶어 VQA로 검증. "facet = 독립 판정 가능한 최소 명제"의 직접 선례.
- [DSG GitHub (j-min/DSG)](https://github.com/j-min/DSG) — 코드와 DSG-1k 벤치마크.
- [DSG 프로젝트 페이지](https://google.github.io/dsg/)

### 6.3 기타 참고 (검색 없이 기억에서 — 링크 미검증)
- Visual Genome 씬 그래프: (객체, 속성, 관계) 트리플 구조
- OpenPose / COCO 키포인트: 포즈의 세미 정량 표현
- FACS(Facial Action Coding System): 표정 액션 유닛
- DeepFashion 어트리뷰트: 의상 속성 어휘
- LIP 등 human parsing 라벨셋: 신체 부위 분할 어휘
- DOCCI / DCI / PixelProse: 사람이 쓴 초상세 캡션 데이터셋

---

## 7. 이미지 재검색용 검색어 (이미지 검색 도구는 URL을 안 줘서, 직접 찾을 때 사용)

| facet | 검색어 |
|---|---|
| B1 등신 | `head to body ratio chart chibi to realistic drawing` |
| B3 앞머리 | `anime hairstyle bangs reference chart drawing` |
| B2 눈 | `anime eye shapes reference chart drawing tutorial` |
| B2 얼굴형 | `face shapes drawing reference chart` |
| D2 표정 | `facial expression sheet drawing reference chart` |
| D2 만화 기호 | `manga emotion symbols sweat drop anger mark reference` |
| D1 포즈 | `character pose reference sheet standing sitting drawing` |
| A~C 턴어라운드 | `character model sheet turnaround front side back original character` |
| E 셰이딩 | `cel shading vs soft shading comparison drawing tutorial` |
| E 선 굵기 | `line weight comparison lineart thick thin drawing tutorial` |
| B3 하이라이트 | `anime hair highlight rendering styles comparison` |
| 2.1 스타일 스펙트럼 | `art style spectrum realistic to cartoon stylization scale` |

---

## 8. 주의사항

- "전부"는 불가능해서, **시각 비교 없이는 어휘 설계가 어려운 facet** 위주로 골랐음. 팔레트·위치·크기처럼 정량으로 정의되는 facet은 제외.
- 링크는 웹 검색 결과에서 가져온 실제 URL이며, 내용 메모는 검색 결과 요약 기준의 내 표현. 자료로 쓰기 전에 직접 확인 권장.
- Pinterest / TikTok 등 집계 페이지는 원출처가 아니어서 제외.
- 특정 작품 캐릭터를 레퍼런스로 쓰면 생성기가 잘 반응하긴 하지만, 저작권·정책 이슈가 있으므로 "번들 태그"로는 원형(archetype)과 일반 어휘를 우선.

다음 단계 후보: 이 문서를 JSON 스키마로 변환 / 캐릭터 1개를 골라 실제 facet 채워보기 / facet별 VQA 질문 템플릿 작성.
