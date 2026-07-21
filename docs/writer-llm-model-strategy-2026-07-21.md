# Writer LLM 모델 전략 — Gemini 3 Flash / Claude 배치 분석

> 작성 2026-07-21. 근거 = 실 run `2beb605c`("에일리언 2", 7씬·84샷) 프롬프트 재실행(first-party 측정) + 외부 벤치마크.
> 계기: shotDesign 병목 → 병렬화 시도가 Gemini 동시성 throttle(콜당 2.25x 팽창)로 무효(speedup 1.06x) → "빠르거나 좋은 모델로 교체"가 실질 대안인지 검증.

---

## 1. Haiku 4.5 vs Gemini 3 Flash (지금 우리가 도배한 모델)

### 1a. 벤치마크별 차이 (외부, 2026)

| 벤치마크 | 성격 | **Gemini 3 Flash** | **Claude Haiku 4.5** | 우위 |
|---|---|---:|---:|:--:|
| AIME 2025 | 수학 추론 | **99.7%** | 80.7% | Gemini (큰 격차) |
| GPQA | 과학 대학원급 추론 | **90.4%** | 74.2% | Gemini (큰 격차) |
| MMMLU | **다국어** 지식(한국어 관련) | **91.8%** | 83.0% | Gemini |
| Global PIQA | 상식 추론 | **92.8%** | — | Gemini |
| SWE-bench Verified | **코딩** | 63.8% | **73.3%** | Haiku |
| Tau2 Retail | 툴 사용 | — | 83.2% | Haiku 계열 |
| 가격 in/out (/M토큰) | — | **$0.50 / $3.00** | $1.00 / $5.00 | Gemini (1.8x 저렴) |
| 출력 속도 | — | ~180–220 tok/s | ~95–350 tok/s (측정 분분) | 대등 |
| context | — | **1,000K** | 200K | Gemini (5배) |

요약: **Gemini 3 Flash가 일반·다국어·수학·과학 추론 전부에서 Haiku를 앞서고, 더 싸고, context가 5배다.** Haiku가 이기는 건 코딩(SWE-bench)·일부 툴 사용뿐 — 우리 워크로드(창작 산문 + 구조화 JSON)와 무관한 축이다.

출처: [llm-stats 비교](https://llm-stats.com/models/compare/gemini-3-flash-preview-vs-claude-haiku-4-5-20251001) · [aizolo 비교](https://aizolo.com/blog/claude-haiku-4-5-vs-gemini-3-flash/) · [Artificial Analysis](https://artificialanalysis.ai/models/gemini-3-flash). (주의: 소스마다 "Gemini 3 Flash"와 신형 "3.5 Flash"를 섞고 reasoning/non-reasoning 모드 차가 있어 절대값은 편차 존재.)

### 1b. 우리 워크플로우 실측 (first-party — 동일 shotDesign 프롬프트, 4샷)

| 모델 | latency | 출력자수 | first_frame_prompt 언어 | JSON 준수 | 비고 |
|---|---:|---:|---|:--:|---|
| **Gemini 3 Flash** (현행) | **21.6s** | 12,421 | 영어 ✅ | ✅ native JSON | 기준 |
| Claude Haiku 4.5 | 33.5s | 17,576 | 영어 ✅ | ⚠️ ` ```json ` 펜스로 감쌈(지시 위반) | ~1.6x 느림 |
| Claude Sonnet 4.6 | 91.8s | 14,293 | 영어 ✅ (가장 조밀) | ✅ | ~4.2x 느림 |

### 1c. 우리 워크플로우에서의 함의

- **속도**: "빠른 Claude"인 Haiku조차 gemini-3-flash보다 **1.6x 느리다**(33.5s vs 21.6s). writer의 S·V 축 전 스테이지가 latency 예산에 묶여 있어, 1.6x는 그대로 파이프라인 지연으로 곱해진다.
- **품질**: Haiku의 산문 품질은 Gemini와 **대등**(영어 이미지 프롬프트, 적절한 디테일). 즉 바꿔서 얻는 품질 이득이 **없다**.
- **신뢰성**: Haiku는 "코드펜스 금지" 지시를 어기고 ` ```json `으로 감쌌다 — 파서가 스트립하면 복구되지만, Gemini의 native JSON 모드가 구조화 출력엔 더 안정적.
- **비용·context**: Haiku는 2배 비싸고 context 1/5.

**결론: Haiku는 우리 워크플로우에서 gemini-3-flash에 전 축 열등하다** — 더 느리고, 더 비싸고, context 작고, 다국어 추론 낮고, 품질 이득 없음. 유일한 강점(코딩)은 우리와 무관. → **Haiku 채택 근거 없음.**

---

## 2. 스테이지 지도 — 두 축으로 분류

1차 작성에서 "급" 한 칸에 서로 다른 두 축을 섞어 "설계 최상위 vs 설계"처럼 갈랐는데, 그건 잘못된 사다리였다. 실제 축은 둘이다:

- **유형(일의 종류)** — 모델 선택을 실제로 가르는 축. 🔷**저작**(판단으로 새 결정 생성) / ⚙️**수행**(정해진 틀 채우기) / 🔍**검수**(남이 만든 걸 점검).
- **파급(blast radius)** — "어느 저작에 좋은 모델을 투자할지" 우선순위 축(저작 안에서만 의미). 🌳**뿌리**(하류 전체가 상속) / 🌿**가지**(자기 하위만) / 🍂**잎·사장**(파급≈0, 하류 미소비 포함).

축 기본값(`DEFAULT_MODELS`): S·V = gemini-3-flash-preview, C = claude-sonnet-4-6. LLM시간은 2beb605c(84샷) 실측.

| # | 스테이지 | 축·모델 | 역할(한 줄) | 유형 | 파급 | LLM시간* |
|---|---|---|---|:--:|:--:|---:|
| 1 | narrativeStructure | S·gemini | 3막 구조·비트 골격 정의 | 🔷저작 | 🌳뿌리 | 9.8s |
| 2 | scenes | S·gemini | 구조→씬 분해(장소·인물·액션·감정) | 🔷저작 | 🌿가지 | 20.1s |
| 3 | storyCheck | C·sonnet | 스토리 일관성 검증 | 🔍검수 | — | ~0(skip)* |
| 4 | midPreview | V·gemini | 브리지: V축 seed 추천 | 🔷저작 | 🌿가지 | ~0(skip) |
| 5 | visualFormat(v0) | V·gemini | 전역 아트스타일·포맷 루트 | 🔷저작 | 🌳뿌리 | 4.1s |
| 6 | actVisualArc(v1) | V·gemini | 막별 비주얼 진행 | 🔷저작 | 🍂잎(사장) | 6.8s |
| 7 | v2Design | V·gemini | 월드+인물 비주얼(팔레트·로케이션·의상) | 🔷저작 | 🌿가지 | 29.7s |
| 8 | sceneCinematography(v3) | V·gemini | 씬별 연출 디시플린(렌즈·조명·180축·샷수타겟) | 🔷저작 | 🌿가지 | 30.2s |
| 9 | **decoupage** | V·gemini | 비트→샷 분해: 샷수·경계·operation 결정 | 🔷저작 | 🌳뿌리(물량) | 107.8s |
| 10 | **shotDesign** | V·gemini | 확정된 샷에 3분할 spec 부착 | ⚙️수행 | 🍂잎 | 313.1s |
| 11 | shotCheck | V+C | 샷 검증 + 시퀀싱 | 🔍검수 | — | 55.4s |
| 12 | renderPrompts(v5) | V·gemini | spec→이미지/영상 프롬프트 추출 | ⚙️수행 | 🍂잎 | 3ms |
| 13 | persistShots→facet-render | V·gemini(플래그) | DB 영속 + 선택적 facet 렌더 | ⚙️수행 | 🍂잎 | 69.7s |

\* storyCheck/midPreview는 이 run에서 depth로 skip → ~0. 정상 실행 시 각각 수~수십초.

**두 축이 갈라놓는 것:**
- **모델 선택 = 유형만 본다.** shotDesign이 저작이 아니라 ⚙️수행이라 gemini로 충분한 게 핵심. `narrativeStructure→scenes`·`visualFormat→actVisualArc`는 둘 다 🔷저작이고 차이는 zoom(뿌리→가지)뿐 — **"설계→디테일설계"지 "설계→수행"이 아니다.** 진짜 저작→수행 경계는 `decoupage→shotDesign` 하나뿐(프롬프트가 "샷 수·경계 바꾸지 마라 — 감독 결정"으로 못박음).
- **품질 투자 우선순위 = 파급으로.** 같은 저작이라도 🌳뿌리(decoupage/narrativeStructure/visualFormat)가 🌿가지(scenes)보다 레버리지 크다. decoupage 1순위는 "뿌리 + 하류 물량까지 결정"이라 파급 최대.
- **역설**: 파급(레버리지)과 비용(LLM시간)이 반비례 — 뿌리 저작들은 다 싸고(<30s), 제일 비싼 shotDesign(313s)은 잎·수행이다.

---

## 3. 고품질 모델 후보 스테이지가 하는 일 (개발용어 없이)

아래는 "판단이 무겁지만 작업량은 적은" 설계급 단계들 — 여기가 똑똑한(느린) 모델을 써도 부담이 적은 곳이다. 영화 제작 비유로 풀면:

- **narrativeStructure = 이야기 뼈대 짜기.** 전체 이야기를 기승전결(1막·2막·3막)과 핵심 순간들로 나눈다. 소설의 목차와 큰 줄거리를 정하는 단계. 여기가 어긋나면 뒤가 전부 흔들린다. (작업량 적음, 영향력 최대)

- **scenes = 장면 나누기.** 뼈대를 실제 "장면"들로 쪼갠다 — 각 장면의 장소, 누가 나오고, 무슨 일이 벌어지고, 감정이 어떻게 변하는지. 시나리오의 씬 리스트.

- **visualFormat(비주얼 아이덴티티) = 작품의 룩 정하기.** 이 작품 전체가 어떤 그림체·색감·화면비를 가질지 하나로 못박는다. 이후 모든 그림이 이 기준을 따른다. 브랜드의 색·로고 규정 같은 최상위 잣대.

- **v2Design = 세계와 인물의 겉모습 디자인.** 배경 장소들과 등장인물이 실제로 어떻게 생겼는지(색 팔레트, 소품, 의상)를 확정. 미술팀이 세트와 의상을 정하는 단계.

- **sceneCinematography = 장면별 촬영 방향.** 각 장면을 "어떻게 찍을지" — 렌즈, 조명의 흐름, 카메라 시선 축, 몇 컷으로 나눌지 목표 — 를 정하는 감독의 촬영 계획. 이 계획이 다음 두 단계를 강하게 구속한다.

- **decoupage = 장면을 컷으로 쪼개기(콘티의 뼈대).** 한 장면을 실제로 몇 개의 "컷"으로 나눌지, 각 컷이 무슨 역할(설정샷/반응샷/클로즈업…)이고 몇 초인지 결정한다. **여기서 정한 컷 수가 이후 작업량 전체를 좌우한다** — 84개 컷으로 쪼개면 다음 단계가 84번 돈다. 감독이 콘티의 뼈대를 그리는, 가장 파급력 큰 결정 지점.

- **shotDesign = 각 컷을 실제 연출로 채우기.** decoupage가 정해둔 각 컷에 "첫 화면이 어떻게 보이는지, 카메라와 인물이 어떻게 움직이는지"를 구체적으로 써넣는다. **컷 수·순서는 못 바꾸고(감독이 이미 정함) 정해진 틀만 채우는 실행 작업** — 그래서 양이 제일 많고 병목이다. (판단은 가볍고, 작업량 최대)

- **storyCheck / shotCheck = 검수.** 앞 결과가 앞뒤 안 맞거나 빠진 게 없는지 점검하는 편집자·감수 역할. (지금 Claude가 맡는 판단 작업)

---

## 4. 스테이지별 제안 (최종)

| 스테이지 | 현재 | 유형·파급 | 제안 | 근거 |
|---|---|:--:|---|---|
| **decoupage** | gemini-flash | 🔷저작·🌳뿌리 | **Sonnet 4.6 실험 1순위** | 하류 84샷의 수·품질을 통째로 결정. 저빈도(108s)라 4x 느려도 ~250s로 감당, 개선 레버리지 최대 |
| sceneCinematography | gemini-flash | 🔷저작·🌿가지 | Sonnet 실험 2순위 | shotDesign을 구속하는 플랜. 저빈도(30s)라 품질 투자 감당 가능 |
| narrativeStructure | gemini-flash | 🔷저작·🌳뿌리 | 유지(선택적 Sonnet) | 저비용(10s)·초고레버리지. 현 품질 충분하나 실험 가치 있음 |
| visualFormat / v2Design | gemini-flash | 🔷저작·🌳/🌿 | 유지 | 저비용·안정. 급하지 않음 |
| scenes / midPreview | gemini-flash | 🔷저작·🌿가지 | 유지 | 현 품질 충분 |
| **shotDesign** | gemini-flash | ⚙️수행·🍂잎 | **gemini 유지 확정** | 순수 실행 + 대량. Sonnet 4.2x·Haiku 1.6x 느림 무의미. 진짜 레버는 **출력 슬림화**(first_frame_prompt 이연/상한, static_spec 다이어트) |
| renderPrompts | gemini-flash | ⚙️수행·🍂잎 | 유지 | LLM 개입 3ms. 모델 무관 |
| shotCheck / storyCheck | gemini+sonnet / sonnet | 🔍검수 | 유지 | 판단 작업에 Claude — 현 배치 적정 |
| actVisualArc | gemini-flash | 🔷저작·🍂잎(사장) | **제거/배선복원 검토** | 하류가 결과를 안 씀 = 죽은 콜(6.8s 낭비) |
| — Haiku 4.5 전반 | — | — | **채택 안 함** | 우리 워크서 gemini-flash에 전 축 열등(1.6x 느림·2배 비쌈·context 1/5·다국어 추론↓·JSON펜스 위반) |

### 한 줄 결론
- **shotDesign(병목)은 수행급이라 모델을 바꿔도 이득 없다 → gemini-flash 유지, 출력 슬림화가 진짜 해법.**
- **품질 투자를 한다면 decoupage(🔷저작·🌳뿌리·저빈도) 한 곳** — 여기 좋아지면 84샷 전체가 개선되고 latency 타격은 작다.
- **Haiku는 전 축 열등이라 후보 아님.** Sonnet은 "저비용 저작(🌳뿌리)"에만 국소 투입 가치.
