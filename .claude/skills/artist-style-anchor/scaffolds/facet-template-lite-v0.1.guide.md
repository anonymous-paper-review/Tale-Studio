# facet 템플릿 lite v0.1 — 작성·컴파일 가이드 (2026-10-08)

> **판 구분(2026-10-08 오너 결정)**: `facet-template-v1.2.jsonc`(리프 309)가 **고성능 판**, 이 파일과 `facet-template-lite-v0.1.jsonc`(리프 96)가 **경량 판**이다. v0(94 리프)를 사이클 10에서 각진 카툰 1장으로 검증했다 — 핵심 규칙 준수(두 판정자): 고성능 88~92% · 경량 Sonnet 85% · 경량 gpt-6-astra 68% · 작성자 원문 95~97%; 규칙 회수 경량 75~91%(고성능 94~99%); 시간 고성능 32분 · 경량 GPT 5분 · 경량 Sonnet(에이전트) 21분. v0.1은 판정자 둘이 짚은 빈자리(네거티브 스페이스·꺾임 위치) 2개를 더한 것으로 아직 검증하지 않았다. 기록: `dev/Image_Style/facet_cycle_10/`(로컬).

경량 판이다. 고성능 판(`facet-template-v1.2.jsonc`, 리프 309)에서 컴파일이 실제로 프롬프트에 싣는 리프 94개만 남기고(v0.1에서 96개), 수치 리프는 등급으로 바꿨다. 목적은 같다 — 그림 한 장의 **스타일**을 서식에 적고, 그 서식만으로 영문 프롬프트를 만들어 원작을 참조로 새 장면을 그리는 것. 빠르게 채우고 빠르게 컴파일하는 것이 이 판의 존재 이유다.

## 1. 채우기 규칙 (8항)

1. 96개 값을 전부 채운다. 값마다 첫 토큰은 `[실측]`(그림에서 바로 보이는 것) `[추정]`(해석이 필요한 것) `[외삽]`(표본이 없어 문법에서 유도) `[해당 없음]` 중 하나.
2. 주석에 `[n개 중 1개 선택: …]`이 있으면 그 후보 중에서만 고른다. 후보 밖의 말을 만들지 않는다.
3. **수치는 재지 않는다.** 등신·선 굵기·비율·개수는 주석의 등급 가운데 눈으로 고른다. 확대 측정에 시간을 쓰지 않는다 — 그 일은 고성능 판의 몫이다.
4. 개수를 묻는 값(`디테일.묘사 밀도.실측 개수`, `눈.하이라이트.개수`, `장식.개수`)은 센 값이나 등급으로 적고, "많음"·"수십"·"N개 이상" 같은 열린 말은 쓰지 않는다.
5. 보이지 않는 것은 그 장르의 보통 값이 아니라 **없음**이다. 작아서 못 읽는 것은 "판독 불가"라고 적는다(없음과 다르다).
6. 작가·작품·브랜드·캐릭터 이름을 쓰지 않는다. 계열은 장르 이름만("애니", "서구 TV 카툰").
7. 특정 캐릭터의 값(홍채 색·머리 모양·의상·소품·포즈)은 적지 않는다. 이 서식은 "이 스타일이 인물을 그리는 법"만 담는다.
8. `분류.Core`는 없으면 그 그림체로 안 보이는 것 4~6개를 **중요한 순서로** 적는다 — 이 순서가 프롬프트의 우선순위 줄이 된다.

산출물은 두 개: `filled.json`(템플릿과 같은 구조, 값만 바꿈, 주석 없음) · `scene_summary.md`(장면 종류·대상·인물 유무 2~3줄, 고유명사 없음).

## 2. 컴파일 규칙 (12항)

컴파일러는 원본을 보지 않고 `filled.json`과 `scene_summary.md`만 본다. 템플릿에 없는 것을 보태지 않는다.

1. **자연문**으로 쓴다. 하이픈으로 단어를 묶는 압축 문체 금지, 세미콜론 수치 나열 금지, 4개 이상 종류 나열 금지(개수와 역할로 바꾼다). 고유명사 금지.
2. **PROBE_ANCHORS ≤ 110단어** — `분류.Core` 순서대로: 투영·시점 → 선(굵기 등급을 방향어로 + 색 hex + 위계 단수·내부선 양) → 채움·명암(토폴로지, 키, 단계 수, 폼 섀도 경도·면 형태·면 수, 캐스트 섀도) → 팔레트(역할별 hex, 액센트 상한 "≤ N%", 채도) → 형태 어휘·윤곽 리듬 → 마감·패턴 채움 → 배경 구성(끝에 "unless the scene specifies its own backdrop") → 묘사 예산 한 구("Detail budget: level N, about M garment lines").
3. **FIGURE ≤ 150단어**, 인물 표본이 1 이상일 때만 — 순서대로 ① 계열 혼합(얼굴·몸·렌더링을 부위별로) ② 비례 등급을 **방향어**로 ③ 눈 절(처리·눈꼬리·개폐·가로세로비·광점 수·속눈썹·윤곽선 색, 부재는 "no …") ④ 손·신발·헤어 덩어리 ⑤ 포즈 요약("poses tend to …; when the scene specifies an action, the action comes first") ⑥ 표정 기본값과 표정 수단 ⑦ 피부 톤 처리. 표정 우선 문장은 하네스가 붙이므로 쓰지 않는다. 표본이 0이면 첫 토큰 `[EXTRAPOLATED]`.
4. **PRIORITY ≤ 30단어** — "Priority order: " 뒤에 `분류.Core` 순서대로 상위 4~5개를 " → "로 잇는다. 수치·hex 없이 방향어로.
5. **NEGATIVE ≤ 40단어** — "Avoid "로 시작하는 한 문장. `부정 절.인접 계열`을 첫머리에, 이어서 충돌 기본값·정교화·장면 종속·아티팩트·텍스트/로고. `장식.운동 부호`가 없음이면 "no speed lines".
6. **SCENE ≤ 40단어** — `scene_summary.md`를 영문으로. 스타일 어휘·고유명사·문자 자리는 넣지 않는다.
7. **등급 → 방향어 표**: 외곽선 가는 → thin / 중간 → medium-weight / 굵은 → bold / 매우 굵은 → very thick · 몸통 압축 → "a compressed torso" / 긴 → "a long torso" · 다리 긴 → "long legs" / 매우 긴 → "very long legs" / 짧음 → "short legs" · 종아리를 늘림 → "stretched lower legs" · 아래팔을 늘림 → "stretched forearms" · 손 큼 → "oversized hands" / 작음 → "small hands" · 신발 큼 → "large block shoes" / 매우 큼 → "oversized block shoes" · 어깨 좁음 → "narrow shoulders" / 넓음 → "broad shoulders" · 등신 3 이하 → "about three heads tall" / 4~5 → "four to five heads tall" / 6~7 → "six to seven heads tall" / 8 이상 → "eight or more heads tall".
8. 없음 값은 생략이 아니라 "no …"로 싣는다(no cast shadows, no lower lid line, no speed lines).
9. 개수는 "about N"으로, 등급은 "level N"으로. 열린 상한("at least")은 쓰지 않는다.
10. 키 절은 조건문으로: 하이키 → "in daylight scenes mostly bright planes with little near-black" / 로우키 → "… mostly dark planes" / 중간 → 생략. 밤 장면은 "night scenes keep the same palette roles, only darker".
11. 선택값 토큰(`눈.처리`, `매체.엔진`, `인물.계열`)은 그대로 영문으로 옮겨 첫 절에 싣는다("anime-dialect faces", "digital ink with flat cel fills").
12. 출력은 `prompts.md` 하나, 헤더는 글자 그대로 `## PROBE_ANCHORS` `## FIGURE` `## PRIORITY` `## NEGATIVE` `## SCENE`, 각 헤더 아래 문단 하나(코드블록 없이).

## 부록 A — 채우기 스펙 (하네스가 LLM에 그대로 준다)

### 작업: 그림 한 장의 스타일을 facet 템플릿 lite v0에 채우기

이 폴더의 `facet-template-lite-v0.jsonc`(서식, 주석이 곧 작성법)와 `guide-lite.md` §1(채우기 규칙 8항)을 읽고, 첨부한 그림 한 장을 보고 값을 채워 **`filled.json`**(같은 구조, 값만 바꾼 JSON, 주석 없음)과 **`scene_summary.md`**(장면 종류·대상·인물 유무 2~3줄)를 이 폴더에 쓴다.

- 96개 값을 전부 채운다. 첫 토큰은 `[실측]` `[추정]` `[외삽]` `[해당 없음]` 중 하나. `[n개 중 1개 선택]`은 그 후보 중에서만.
- **수치는 재지 않는다** — 등급을 눈으로 고른다. 확대 측정·픽셀 계산에 시간을 쓰지 않는다. 이 판은 빠르게 채우는 것이 목적이다.
- 보이지 않는 것은 "없음", 작아서 못 읽는 것은 "판독 불가". 장르의 보통 값으로 채우지 않는다.
- 작가·작품·브랜드·캐릭터 이름 금지. 특정 캐릭터의 색·의상·소품·포즈는 적지 않는다(스타일만).
- 이 폴더에 다른 파일을 만들거나 고치지 않는다. 외부 검색 금지. 최종 메시지에 `filled.json` 전문.

## 부록 B — 컴파일 스펙

### 작업: facet 템플릿 lite 채움 → 이미지 생성 프롬프트 컴파일

당신은 프롬프트 컴파일러다. 이 폴더의 `filled.json`(그림 한 장의 스타일을 경량 서식에 적은 것)과 `scene_summary.md`(그 그림의 내용 요약)만 보고 영문 프롬프트를 써서 **`prompts.md`**로 저장한다. **원본 이미지는 없다. 서식에 적힌 것만이 근거다.** 서식에 없는 속성을 지어내지 않는다.

규칙은 `guide-lite.md` §2(컴파일 규칙 12항)를 그대로 따른다 — 특히 단어 상한(PROBE_ANCHORS 110 · FIGURE 150 · PRIORITY 30 · NEGATIVE 40 · SCENE 40), 등급을 방향어로 바꾸는 표(7항), 없음은 "no …"(8항).

- 작가·작품·브랜드·회사 고유명사 금지. hex는 그대로. 한국어 값을 영문으로 옮길 때 의미를 바꾸지 않는다.
- 이 폴더에 다른 파일을 만들거나 고치지 않는다. 외부 검색 금지. 길이를 맞추려고 다시 쓰기를 되풀이하지 않는다 — 한 번에 쓰고 끝낸다.
- 최종 메시지에 `prompts.md` 전문.

### prompts.md 형식 (헤더 글자 그대로, 각 헤더 아래 문단 하나, 코드블록 없이)

#### PROBE_ANCHORS
(≤ 110단어)

#### FIGURE
(≤ 150단어, 인물 표본이 1 이상일 때만. 0이면 첫 토큰 `[EXTRAPOLATED]`)

#### PRIORITY
(≤ 30단어, "Priority order: " 로 시작)

#### NEGATIVE
(≤ 40단어, "Avoid " 로 시작하는 한 문장)

#### SCENE
(≤ 40단어)

## 부록 C — 실행 메모

- 채움은 그림 1장을 첨부해 LLM 한 번 호출(Codex: `codex exec -m <모델> -c model_reasoning_effort=medium -i <그림>`; Claude: 에이전트가 Read로 그림을 봄). 컴파일은 `filled.json` + `scene_summary.md`만 주고 한 번 호출. 우선순위 줄은 컴파일이 함께 만든다.
- 조립은 고성능 판과 같다: 첫 참조 문장 + "Style anchors: " PROBE_ANCHORS + 표준 콘텐츠 + 가드 + "Figure rules: " FIGURE + 표정 우선 문장 + PRIORITY 줄 + NEGATIVE + 꼬리. 생성은 `[원작]` 1장 참조, GPT Image 2 2k.
- 경량 판 검사: 리프 수와 첫 토큰 태그만 본다(`check_fill.py`는 고성능 판 전용).
