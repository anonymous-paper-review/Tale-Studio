# VLM(Vision Language Model) 한계 실증 조사 -- 멀티모달 입력 수용 판단 자료

> 작성일: 2026-04-20
> 대상: 5축 사용자 입력 분류에서 "입력 매체(텍스트 / 이미지 / 영상 / 음성)" 축 설계 의사결정용
> 핵심 질문: "사용자가 레퍼런스 이미지/영상을 업로드했을 때, VLM이 그것을 읽어내 파이프라인(L1/L2/L3/Knowledge DB)에 유효한 구조화 신호로 변환할 수 있는가?"

---

## 서론: 왜 지금 이 질문이 중요한가

Tale Studio의 차별화 포인트는 **Knowledge DB 기반 cinematography RAG**이다. 즉 "이 영상을 이렇게 찍고 싶다"를 자연어만으로 표현하기 어려운 사용자 -- 레퍼런스 스틸/영상이 있는 사용자 -- 를 돕는 것이 가치 제안의 중심이다.

그런데 **"레퍼런스 입력을 받는다"**는 결정은 곧 다음 체인을 의미한다:

```
레퍼런스 이미지 → VLM → [촬영 기법 태그] → Knowledge DB lookup → 프롬프트 주입
```

이 체인 전체의 병목은 VLM이다. VLM이 "이 이미지는 로우키 조명, 50mm 렌즈, 중앙 구도"를 안정적으로 추출하지 못하면, 이후 파이프라인이 아무리 정교해도 결과는 신뢰할 수 없다.

본 문서는 **2024~2026년 VLM 벤치마크와 연구를 종합**해, 현행 VLM이 영상 스틸에서 cinematography 정보를 얼마나 추출할 수 있는지를 수치로 정리한다. 제품 의사결정(P1~P5 스코프, 입력 매체 제한, 사용자 경고 문구)에 직접 반영 가능한 형태로.

---

## PART 1: 핵심 결론 요약

### 한 줄 답

**현행 VLM은 영상 스틸에서 cinematography 전문 용어를 안정적으로 뽑아내지 못한다.** 최고 성능 프런티어 모델(GPT-4o, Gemini 2.5 Pro)조차 전문 cinematography 벤치마크에서 **평균 60% 미만**. 특히 카메라 움직임/렌즈/구도에서 **랜덤 추측(25%)에 근접**하는 경우가 잦다.

### 3줄 제품 임플리케이션

1. **전체 레퍼런스 → 완전 자동 프롬프트 파이프라인은 MVP에서 제외.** 품질이 나오지 않음.
2. **Scoped query(특정 필드만 질문)는 보조적으로 쓸 만함.** "이 이미지의 지배 색상은?", "인물이 몇 명?" 등은 80%+ 가능. 자유 캡셔닝은 위험.
3. **입력 매체 축을 "텍스트 전용 vs 텍스트+참조"로 이분할 설계**할 것. 참조 모드는 "스타일 힌트"로만 쓰고 "촬영 지시 추출"은 하지 않는 것이 안전.

### 수치 한눈에 보기

| 벤치마크 | 태스크 | 최고 VLM | 스코어 | 인간 | 갭 |
|--------|-----|-------|-------|-----|-----|
| ShotBench (cinematography 8축) | 전문 촬영 기법 인식 | GPT-4o | 59.3% | ~90%+ | ~30pt |
| CineTechBench (7축) | 촬영 기법 + 생성 | GPT-4o | 70.2% | -- | -- |
| ShotBench - Camera Movement | 6축 움직임 | 다수 모델 | <40% | -- | -- |
| ShotBench - Lens Size | 렌즈 초점거리 | GPT-4o | 48.9% | -- | -- |
| BLINK (14개 저수준 시각 지각) | 퍼셉션 | GPT-4V | 51.26% | 95.70% | 44.4pt |
| MMVP (CLIP-blind pairs) | 기본 시각 패턴 | GPT-4V | ~38% | ~90% | 52pt |
| MME-RealWorld (고해상도 실세계) | 실사용 시나리오 | 모든 모델 | <60% | -- | -- |
| CinePile (롱폼 비디오 QA) | 영화 클립 이해 | GPT-4o | ~60% | ~86% | ~26pt |

---

## PART 2: 안정 추출 vs 추출 실패 필드 매트릭스

### 2.1 안정 추출 가능 (80% 이상, 대부분 VLM에서)

| 필드 | 근거 |
|-----|-----|
| 피사체 수 (인물 1명 vs 2명 vs 군중) | POPE/MMVP에서 높은 정확도. 단, 10명 이상 세밀 카운트는 실패 |
| 지배 색상 (dominant color) | CineTechBench에서 GPT-4o 93.33%, 대부분 모델 80%+ |
| 대략적 장면 유형 (indoor/outdoor, urban/nature) | 일반적 scene classification은 CLIP급에서도 강함 |
| 시간대 분위기 (day/night, golden hour 정도는 애매) | 조명 종류 인식은 70%대 (대낮/어둠 수준) |
| 카메라 앵글 (aerial/low/high/eye-level) | ShotBench GPT-4o 58.2%, CineTechBench GPT-4o 82.5% (태스크별 편차 큼) |
| Shot Size 대분류 (close-up vs medium vs wide) | ShotBench GPT-4o 69.3%. 단, medium vs medium-closeup 구분은 실패 |
| 주요 오브젝트 태깅 (자동차, 나무, 탁자) | 일반 object detection 품질 우수 |

### 2.2 조건부 추출 (50-80%, 프롬프트 설계에 크게 의존)

| 필드 | 근거 | 조건 |
|-----|-----|-----|
| Shot Framing (single/2-shot/OTS/group) | ShotBench 27.9%~90.1% 모델별 편차 | 명시적 옵션 제시 시 |
| 조명 종류 (daylight/artificial/firelight) | ShotBench Lighting Type 48-70% | 4지선다 MCQ일 때 |
| 조명 질감 (hard/soft) | ShotBench Lighting Condition 48% | 사이드/백/키라이트 방향은 혼동 |
| 구도 밸런스 (center/symmetric/left-heavy) | ShotBench Composition 55-57% | rule of thirds 같은 격자 기준은 불안정 |
| 예술 스타일 태그 ("cinematic", "film noir") | Midjourney /describe 수준으로 가능 | 단, 정확성은 입증 안 됨 |
| 의상/소품 카테고리 | Fine-grained recognition 문제. CLIP 한계 | 일반 카테고리(수트, 드레스)만 |
| 분위기/감정 (melancholic, tense) | LLM 언어 지식에 의존 | 구체적 "왜"는 설명 못함 |

### 2.3 추출 실패 (50% 이하, 랜덤에 가까움)

| 필드 | 근거 | 왜 실패하는가 |
|-----|-----|------------|
| 렌즈 초점거리 (35mm vs 85mm vs 200mm) | ShotBench Lens Size 48.9% (GPT-4o), CineTechBench 33-43% 범위 | 원근 압축/왜곡의 미세 구분 필요. 훈련 데이터에 "35mm로 찍은 이 사진" 라벨 희박 |
| 키-필 비율 (key-to-fill ratio 2:1, 4:1, 8:1) | 전용 벤치마크 없음. 일반 조명 서브태스크에서 50% 미만 | 휘도 측정 vs 지각적 추정 괴리. VLM은 상대적 밝기 추정이 부정확 |
| 3점 조명 분해 (key/fill/back 각각) | 전용 벤치마크 없음 | 한 이미지에서 각 광원 방향/강도 개별 파싱 불가. 다중 광원 추정 = 고전 CV도 어려움 |
| 색온도 절대값 (3200K vs 5600K 등 Kelvin) | 전통 ISP에서도 어려움. VLM은 색온도 훈련 안 됨 | 화이트 밸런스 추정은 기준점(뉴트럴 면) 필요. VLM은 숫자 답변 보정 안 됨 |
| LUT/색보정 세부 (S-Curve, Lift/Gamma/Gain) | 관련 연구 미발견 | Discrete 파라미터로 표현된 색 변환은 VLM이 추론할 입력이 아님 |
| 카메라 움직임 (push-in vs zoom-in, dolly vs pan) | ShotBench Camera Movement <40% 모델 절반 이상. CineTechBench Rotation 19-45% | 단일 이미지에서는 애초에 불가능. 비디오 입력이어도 parallax 판단 실패 |
| 황금비/rule of thirds 정량 판정 | 관련 벤치마크에서 55% 수준 | 격자 위치는 측정 문제. VLM은 정밀 픽셀 좌표 약함 |
| 디지털 vs 필름, 센서 포맷 (S35, FF, IMAX) | 벤치마크 없음. 실무적으로 불가능 | 그레인 구조/해상도 특성은 압축된 썸네일에서 소실 |

---

## PART 3: 주요 벤치마크 수치 상세

### 3.1 ShotBench (2025)

**출처**: *ShotBench: Expert-Level Cinematic Understanding in Vision-Language Models*, arXiv 2506.21356 (June 2025)

영상 cinematography 이해 전용 벤치마크. Oscar 후보작 중심 200+ 영화에서 추출한 3,572개 전문가 주석 4지선다(MCQ).

**평가된 24개 VLM**:
- 프로프라이어터리: GPT-4o, Gemini 2.0 Flash, Gemini 2.5 Flash Preview
- 오픈소스: Qwen2.5-VL (3B/7B/32B/72B), InternVL 2.5/3 시리즈, LLaVA-NeXT-Video, VILA1.5, InstructBLIP, Ovis2, InternLM-XComposer2d5

**8개 차원과 정의**:

| 차원 | 정의 | GPT-4o | Qwen2.5-VL-72B | ShotVL-3B (특화 파인튠) |
|-----|------|---------|----------------|-------------|
| Shot Size | 프레임 대비 피사체 크기 (Close-Up/Medium/Wide 등) | 69.3% | 75.1% | 77.9% |
| Shot Framing | 피사체 배치 (Single/2-shot/Group/OTS 등) | 83.1% | 82.9% | 85.6% |
| Camera Angle | 관점 (Aerial/Low/High/Dutch/Overhead) | 58.2% | 56.7% | 68.8% |
| Lens Size | 초점거리 (Ultra Wide/Wide/Medium/Long) | **48.9%** | **46.8%** | 59.3% |
| Lighting Type | 광원 카테고리 (Daylight/Artificial/Firelight/LED) | 63.2% | 59.0% | 65.7% |
| Lighting Condition | 광질/방향 (Hard/Soft/Side/Back/Silhouette) | **48.0%** | 49.4% | 53.1% |
| Composition | 시각적 균형 (Center/Symmetrical/Left-heavy) | **55.2%** | 54.1% | 57.4% |
| Camera Movement | 움직임 (Push-in/Pan/Tilt/Dolly/Zoom) | **48.3%** | 48.9% | 51.7% |
| **평균** | -- | **59.3%** | **59.1%** | **65.1%** |

굵은 글씨 = 50% 근처 또는 이하 = "사실상 실패" 필드.

**주요 실패 모드 (논문에서 직접 인용)**:

- "Medium Shot이 Medium Close-Up으로 잘못 분류되는 비율 36.2%, Medium Wide Shot으로는 10.1%" -- 즉 인접 카테고리 간 경계를 모델이 못 그음
- "Push-in(카메라 이동)을 Zoom-in(초점거리 변경)과 구분 못함. 이는 parallax 지각을 요구"
- "카메라가 자체 축에서 회전하는지, 물리적으로 이동하는지 판단 실패"
- "Medium lens를 Wide나 Long으로 오인"
- "모델 절반 이상이 Camera Movement에서 40% 미만 = 4지선다에서 랜덤(25%)보다 약간 나은 수준"

**훈련 데이터 문제**:

논문은 "cinematography 라벨링의 주석 granularity/consistency가 훈련 데이터에 부족"하다고 명시. 즉 VLM의 훈련 데이터(CLIP/SigLIP + LLaVA-style instruction)에는 "이 프레임은 50mm 렌즈에 로우키 조명"이라는 구조화된 라벨이 거의 없음. 웹 크롤링된 alt-text는 "a man in dark room" 수준.

### 3.2 CineTechBench (2025)

**출처**: *CineTechBench: A Benchmark for Cinematographic Technique Understanding and Generation*, arXiv 2505.15145 (May 2025, NeurIPS 2025)

93년 영화사(1931~2024), 48개 장르 커버. 이해 + 생성 양방향 벤치마크. 600+ 이미지 + 120 비디오 클립. **15+ MLLM + 5+ 비디오 생성 모델 평가**.

**정적 이미지 이해 (overall accuracy, 7축)**:

| Model | Overall | Scale | Angle | Composition | Color | Lighting | Focal Length |
|-------|---------|-------|-------|-------------|-------|----------|--------------|
| GPT-4o | 70.16% | 75.00% | 82.50% | 57.50% | **93.33%** | 71.82% | **33.33%** |
| Gemini-2.5-Pro | 69.67% | 71.43% | 83.33% | 67.50% | 88.33% | 62.73% | 36.67% |
| Gemini-2.0-Flash | 59.34% | 46.43% | 74.17% | 40.83% | 91.67% | 70.91% | 43.33% |
| GLM-4V-Plus | 60.00% | 50.71% | 69.14% | 67.50% | 83.33% | 56.36% | 31.67% |
| Qwen-VL-Plus | 61.36% | 40.71% | 73.33% | 67.50% | 81.67% | 66.36% | 43.33% |
| InternVL3 | 55.25% | 45.00% | 66.67% | 53.33% | 76.67% | 57.27% | 35.00% |
| InternVL2.5 | 54.59% | 39.29% | 63.33% | 65.00% | 90.00% | 52.73% | 20.00% |
| Qwen2.5-VL | 50.66% | 30.00% | 61.67% | 43.44% | 83.33% | 62.73% | 36.67% |
| Qwen2.5-Omni | 54.75% | 45.00% | 65.83% | 61.67% | 70.00% | 49.09% | 36.67% |
| Llama-3.2-Vision | 47.21% | 33.57% | 48.33% | 50.83% | 78.33% | 45.45% | 41.67% |
| LLaVA-OneVision | 45.90% | 31.43% | 54.17% | 42.50% | 75.00% | 54.55% | 25.00% |
| MiniCPM-V-2.6 | 45.90% | 32.86% | 57.50% | 35.00% | 80.00% | 50.91% | 31.67% |
| Kimi-VL | 46.39% | 32.14% | 63.33% | 31.67% | 73.33% | 55.54% | 31.67% |
| LLaVA-NeXT | 38.69% | 22.86% | 42.50% | 39.17% | 63.33% | 44.55% | 31.67% |
| Phi3.5 | 40.82% | 20.00% | 49.17% | 41.67% | 61.67% | 56.36% | 21.67% |
| Gemma3-it | 39.18% | 17.86% | 45.00% | 41.67% | 58.33% | 52.73% | 28.33% |

관찰:
- **Color는 평균 80%대** -- 지배 색상/팔레트는 어느 VLM이든 잘 잡음.
- **Focal Length는 평균 30%대** -- 4지선다(랜덤 25%)에 거의 수렴. 전 모델 공통 실패.
- **Composition은 30~67%로 분산 큼** -- 프롬프트 설계/모델 편차가 크다는 뜻.

**카메라 움직임 이해 (비디오 입력, 표 2)**:

| Model | Overall | Static | Translation | Rotation | Zoom | Combined |
|-------|---------|--------|-------------|----------|------|----------|
| Gemini-2.5-Pro | 56.69% | 81.82% | 66.04% | **45.16%** | **14.29%** | 52.00% |
| GPT-4o | 50.00% | 90.91% | 61.11% | 25.81% | 28.57% | 44.00% |
| GLM-4V-Plus | 52.34% | 100.00% | 40.74% | 41.94% | 57.14% | 68.00% |
| Qwen-VL-Plus | 52.40% | 100.00% | 56.60% | 33.33% | 57.14% | 43.48% |
| Qwen2.5-VL | 50.78% | 100.00% | 55.56% | 19.35% | 71.43% | 52.00% |
| InternVL3 | 41.41% | 81.82% | 35.19% | 29.03% | 42.86% | 52.00% |
| LLaVA-OneVision | 36.00% | 90.91% | 35.19% | 16.13% | 42.86% | 36.00% |
| MiniCPM-V-2.6 | 35.94% | 27.27% | 42.59% | 25.81% | **0.00%** | 48.00% |

관찰:
- **"Static" (움직임 없음) 판정은 대부분 100% 가까움** -- 모델은 "움직이는지 안 움직이는지"는 잘 앎
- **Rotation은 모든 모델 50% 이하** -- 롤 vs 팬 구분 실패
- **Zoom은 모델별 편차 극단적** (0% ~ 71%). 훈련 데이터의 zoom 라벨 일관성 부족 추정
- **설명 생성(description generation)의 F1**: 30-50%. 즉 맞게 인식한 후에도 정확한 용어로 표현 못함

논문 원문: "Despite high hit rates (80%+), F1 scores collapse to 30-50%, revealing substantial disparity between visual recognition and accurate textual description capability."

### 3.3 BLINK (ECCV 2024)

**출처**: *BLINK: Multimodal Large Language Models Can See but Not Perceive*, arXiv 2404.12390

**"인간이 눈 깜빡할 사이에 푸는"** 14개 고전 CV 태스크를 MCQ로 변환. 3,807문제.

| Model | 전체 평균 |
|-------|----------|
| Human | 95.70% |
| GPT-4V | 51.26% |
| LLaVA-v1.6-34B | 45.05% |
| Gemini Pro | 45.72% |
| Claude 3 Opus | 44.11% |
| Random | 38.09% (옵션 수 편차 반영) |

14개 서브태스크: relative depth, visual correspondence, forensics detection, multi-view reasoning, spatial reasoning, art style, counting, object localization, jigsaw, IQ test, relative reflectance, semantic correspondence, functional correspondence, visual similarity.

논문의 핵심 발언: **"Jigsaw, semantic correspondence, multi-view reasoning, object localization, relative reflectance에서 일부 MLLM은 랜덤보다도 낮은 성능"**.

이는 cinematography 관점에서 중요한 함의:
- **Relative reflectance** = "이 두 표면 중 어느 쪽이 더 반사율이 높나?" -- 조명 분석의 기본. VLM 실패.
- **Multi-view reasoning** = 같은 장면의 여러 각도 → 공간 구조 추론. VLM 실패.
- **Spatial reasoning** = "A가 B 앞에 있나?" -- 카메라 위치/렌즈 판단의 전제.

### 3.4 MMVP -- CLIP-Blind Pairs (CVPR 2024)

**출처**: *Eyes Wide Shut? Exploring the Visual Shortcomings of Multimodal LLMs*, arXiv 2401.06209

**방법**: DINOv2 임베딩은 다른데 CLIP 임베딩은 비슷한 이미지 쌍(CLIP이 둘 다 같은 걸로 보는 쌍)을 수집 → 150쌍 × 2 = 300개 이미지 MCQ.

관찰된 9개 시각 패턴:
1. Orientation and direction (방향)
2. Presence of specific features (특정 요소 존재 여부)
3. State and condition (상태/조건)
4. Quantity and count (수량)
5. Positional and relational context (위치 관계)
6. Color and appearance (색상)
7. Structural characteristics (구조 특성)
8. Text (문자)
9. Viewpoint and perspective (시점)

**결과**: **대부분 MLLM이 랜덤 이하**. GPT-4V조차 인간 대비 50%+ 낮음.

패턴별 "학습으로 해결되는" 것 = **Color and appearance, State and condition** 단 2개.
나머지 7개 패턴은 **모델/데이터 스케일링으로 해결 안 됨**.

이는 근본 원인이 **CLIP(및 CLIP 유래 비전 인코더)의 표현 한계**임을 시사. VLM이 쓰는 vision encoder가 못 보는 걸 LLM이 "읽어낼" 방법이 없다.

### 3.5 MME-RealWorld (ICLR 2025)

**출처**: arXiv 2408.13257

13,366개 **고해상도(평균 2000x1500)** 이미지, 29,429 QA, 43 서브태스크, 5 시나리오(자율주행/원격감지/감시/뉴스/금융).

**29개 VLM 평가. 전부 60% 미만.** GPT-4o, Gemini 1.5 Pro, Claude 3.5 Sonnet 포함.

핵심 임플리케이션: **"이미지가 크면 클수록 VLM이 약해진다"**. 작은 이미지에 최적화된 학습이 고해상도 실사용 케이스에 전이 안 됨. 영화 프레임(2K~4K)은 이 영역에 해당.

### 3.6 CinePile (2024)

**출처**: *CinePile: A Long Video Question Answering Dataset and Benchmark*, arXiv 2405.08813

영화 클립 (Movieclips YouTube 9,396개 클립) 기반 305,000 MCQ. 영상 전체 이해 벤치마크.

| Model | Accuracy |
|-------|----------|
| Human | ~86% |
| GPT-4o / GPT-4V / Gemini 1.5 Pro (Video) | ~60% |
| 오픈소스 비디오 VLM | 인간 대비 ~70%+ 낮음 |

카테고리: temporal comprehension, human-object interactions, plot, character dynamics, setting, themes.

영화 수준 서사 이해 = 현행 VLM은 60% 수준 = **서사적 해석은 자동 파이프라인에 쓸 수 없음**.

---

## PART 4: 왜 실패하는가 -- 아키텍처 레벨 원인

### 4.1 Vision Encoder 병목

현재 주류 VLM들이 쓰는 비전 인코더와 토큰 수:

| 인코더 | 해상도 | 패치 | 토큰 수 | 쓰는 VLM |
|-------|-------|-----|--------|---------|
| CLIP ViT-L/14 | 224×224 | 14 | 256 | LLaVA 1.x, 초기 MLLM 대부분 |
| CLIP ViT-L/14 | 336×336 | 14 | 576 | LLaVA-1.5, LLaVA-NeXT (base) |
| SigLIP-SO400M | 384×384 | 14 | 729 | LLaVA-OneVision, PaliGemma |
| InternViT-300M | 448×448 | 14 | 1024 (pixel-unshuffle → 256) | InternVL 초기 |
| InternViT-6B | 448×448 | 14 | 1024 (→256) | InternVL2.5/3 대형 |
| Qwen2-VL ViT (native) | dynamic | 14 | 이미지 크기에 비례 | Qwen2-VL, Qwen2.5-VL |

**핵심 통찰**: 비전 인코더는 대부분 **224~448 해상도로 학습된 ViT**. 4K 이미지를 넣어도:
1. 썸네일로 리사이즈하거나
2. 타일로 자르고 각 타일을 224~448로 리사이즈

어느 경우든 **원본 디테일이 인코딩 단계에서 이미 손실**된다. 논문 인용: *"If you destroy visual detail at the encoder level, no amount of LLM reasoning can recover it."*

영화 cinematography 분석에 치명적인 이유:
- **렌즈 식별**: 35mm vs 85mm 차이는 **원근 왜곡의 미세 비율**. 리사이즈로 소실.
- **조명 방향**: 그림자의 미세한 에지 변화로 추론. 다운샘플링에 약함.
- **필름 그레인 / 노이즈 패턴**: 완전 파괴됨.

### 4.2 AnyRes / 타일링의 한계

LLaVA-NeXT가 대중화한 **AnyRes**(이미지를 타일로 분할해 각 타일을 별도 인코딩 후 LLM에 합류).

- LLaVA-NeXT 그리드: {2×2, 1×{2,3,4}, {2,3,4}×1} -- 최대 672×672 또는 336×1344
- InternVL: 448×448 타일
- GPT-4o: 2048 bounding box → 768 shortest side → 512×512 타일, 타일당 170 토큰 + base 85 토큰

**문제점**:
1. **글로벌 컨텍스트 vs 로컬 디테일 트레이드오프**. 타일을 자르면 프레이밍/구도 같은 "전체" 속성 약화
2. **타일 경계에서 정보 손실** -- 피사체가 두 타일에 걸리면 어느 타일도 온전히 못 봄
3. **토큰 예산 증가** -- 1024×1024 이미지 = 765 토큰. 고해상도로 갈수록 컨텍스트 압박
4. **타일 간 관계 학습 부족** -- 모델이 "이 타일의 왼쪽이 저 타일의 오른쪽에 붙는다"를 잘 못 배움

### 4.3 Attention Bottleneck

ViT self-attention은 **토큰 수의 제곱으로 스케일**. 4K 이미지 native resolution을 14×14 패치로 쪼개면 (4096/14)² ≈ 85,000 토큰. 어텐션 = O(85,000²). 사실상 계산 불가능.

그래서 모든 현행 VLM은 다음 중 하나를 함:
- 다운샘플 (디테일 손실)
- 타일링 (전역 맥락 손실)
- Window attention (Qwen2.5-VL 도입) -- 일부 완화
- Token compression / pixel shuffle (InternVL의 방식, 1024→256 토큰)

어느 것도 **완벽히 해결 안 됨**. 이는 VLM 아키텍처 세대 교체(예: 완전 새로운 인코더) 전에는 근본 해결 불가.

### 4.4 훈련 데이터의 라벨링 부재

VLM은 대부분 LAION-5B, COYO-700M, 또는 웹 alt-text로 학습. 영화 스틸은 포함되더라도 **"Still from The Godfather (1972)"** 수준의 라벨. "이 프레임은 Rembrandt 조명에 40mm 렌즈로 촬영"이라는 **구조화 라벨은 거의 없음**.

CineTechBench 논문 명시: 훈련 데이터의 **cinematography 주석 granularity 부족**이 핵심 원인. 해결책은 파인튠(ShotVL처럼) -- 그러나 사전훈련된 VLM의 **표현력 자체가 이미 결정**되어 있어 파인튠도 한계.

---

## PART 5: Scoped Query vs Open Captioning

이 구분은 제품 설계에 가장 실용적으로 중요하다.

### 5.1 두 가지 프롬프팅 방식

**Open captioning (자유 서술)**:
```
Prompt: "Describe this image in detail."
→ 반환: "A cinematic shot of a man in a dark room, with moody lighting and a shallow depth of field suggesting a 50mm lens..."
```

**Scoped query (필드별 질문)**:
```
Prompt: "What is the dominant color palette of this image? Choose one: (a) warm earth tones, (b) cool blues, (c) neutral grays, (d) saturated neon."
→ 반환: "(b)"
```

### 5.2 왜 Scoped가 훨씬 정확한가

1. **할루시네이션 감소**: 자유 서술은 "그럴 법한" 용어를 LLM 상식으로 채워 넣음. VLM이 실제로 본 것이 아닌, LLM이 상상한 것.
2. **옵션 제한 = 오류 공간 제한**: 4지선다는 최악 랜덤 25%지만, 자유 서술은 틀린 용어 무한대.
3. **벤치마크의 MCQ 수치가 모두 scoped 기반**: ShotBench 59% 같은 수치는 전부 "정답 4개 중 하나" 설정. 자유 서술은 훨씬 낮음.

### 5.3 실증 근거

- **ShotBench**: 모든 평가가 4지선다 MCQ. 자유 서술 평가 시 **F1 30-50%대로 붕괴** (CineTechBench Description 생성 참조)
- **NVIDIA VLM 프롬프팅 가이드**: "Scoped prompts return more accurate and consistent outputs than open-ended captioning"
- **In-context learning**: 1-shot 예시 제공만으로도 정확도 상승 (Visual Inspection 태스크)

### 5.4 Tale Studio 설계 함의

**절대 금지**: "이 이미지를 묘사해서 Kling API에 넣어라" 식의 파이프라인.
**권장**: 필드별 4-6지선다 VLM 호출 → Knowledge DB의 정형 태그로 변환.

예시 체인:
```python
fields = [
    ("shot_size", ["extreme_close", "close_up", "medium", "wide", "extreme_wide"]),
    ("angle", ["eye_level", "low_angle", "high_angle", "overhead", "dutch"]),
    ("mood", ["bright", "neutral", "dark", "high_contrast"]),
    ("dominant_color", ["warm", "cool", "neutral", "saturated"])
]
# 4-6지선다를 여러 번 호출. 각 호출은 독립.
```

이는 **필드당 1-shot에서 80%+** 나오는 영역에서만 동작. 렌즈/키필비율/LUT 같은 실패 필드는 **애초에 질문하지 말 것**.

---

## PART 6: Stochasticity와 Determinism

### 6.1 temperature=0도 결정론이 아니다

**출처**: GitHub vllm-project/vllm issue #17759, Medium "Uncovering the Hidden Chaos in LLMs"

알려진 사실:
- temperature=0 = greedy decoding. 이론상 argmax → 결정론적
- 실제로는 **GPU 비결정성(CUDA 커널의 atomic operations), 배치 크기, 하드웨어 상이성**으로 토큰이 다르게 나올 수 있음
- 동일 입력 반복 호출 시 **미세한 토큰 드리프트** 관찰됨

### 6.2 VLM 일관성 연구

**출처**: *Test-Time Consistency in Vision Language Models*, arXiv 2506.22395

- **의미 등가 입력 간 불일치**: 같은 의미를 다른 문장으로 물으면 VLM이 다른 답 내놓음
- "Semantically equivalent inputs에서 SOTA VLM조차 divergent prediction"
- 복잡도 높은 프롬프트일수록 drift 증가

**Histopathology 연구 (arXiv 2603.03527)**:
- 기초 형태학 태스크는 안정 (low stochasticity)
- 진단/정량 태스크는 유의미하게 증가하는 불일치
- **온도와 MAE는 단조 증가 관계**

### 6.3 Tale Studio 설계 함의

동일 레퍼런스 이미지에 대해 VLM을 **3-5회 호출**해 결과를 보면:

| 필드 유형 | 예상 일치율 |
|---------|----------|
| 안정 필드 (dominant_color, shot_size 대분류) | 90-95% |
| 조건부 필드 (composition, angle) | 70-85% |
| 실패 필드 (lens, lighting_direction) | 40-60% (사실상 랜덤 근처) |

**권장 아키텍처**:
- Scoped 호출 N회 → majority voting
- 불일치 시 사용자에게 confirmation 요청 ("당신이 의도한 샷 사이즈는?")
- **Confidence threshold 설정**: 3회 중 2회 이상 일치해야 Knowledge DB lookup 진입

---

## PART 7: 2025-2026 최신 동향

### 7.1 고해상도 VLM의 등장

| 모델 | 특징 | 출시 |
|------|-----|------|
| LLaVA-OneVision (7B/72B) | SigLIP + Qwen2, AnyRes-9 (9분할) | 2024-08 |
| LLaVA-OneVision-1.5 | RICE-ViT 도입, native resolution | 2025-09 |
| InternVL2.5 (1B~78B) | InternViT-6B, 448px tile | 2024-12 |
| InternVL3 | 개선된 post-training, test-time scaling | 2025-04 |
| Qwen2.5-VL (3B/7B/32B/72B) | native dynamic resolution, window attention, 2D-RoPE | 2025-03 |
| Claude Opus 4.7 | 2576px long edge (3x 이전 세대) | 2026 |
| GPT-5.2 | 85.4% MMMU | 2025 |
| Gemini 3 | 81% MMMU-Pro, 72.7% ScreenSpot-Pro | 2025 |
| Molmo 2 (4B/7B/8B) | Grounding + Pointing 특화, 비디오 확장 | 2025-12 |

**관찰**: 해상도/토큰 예산은 늘고 있으나 **cinematography 태스크 수치는 획기적 개선 없음**. ShotBench 상위권은 여전히 59-70% 대역.

### 7.2 Cinematography 특화 파인튠

**ShotVL** (ShotBench 논문 저자들):
- Qwen2.5-VL-3B/7B 기반 LoRA 파인튠
- ShotBench 트레이닝셋으로 SFT
- 3B 모델이 **65.1%** 달성 (GPT-4o 59.3% 초과)
- 7B 모델이 **70.1%**

이는 두 가지를 시사:
1. **도메인 특화 파인튠은 효과적** -- Tale Studio도 자체 LoRA 고려 가능
2. **그러나 RefineShot 논문(arXiv 2510.02423)은 이 수치에 경고**:
   - "ShotBench의 옵션 디자인 자체가 애매"
   - "ShotVL의 추론 일관성 부족"
   - ShotVL-3B의 reasoning-answer alignment 요구 시 **68.3% → 59.0% 하락**
   - ShotVL-7B의 instruction adherence는 **11.7%만** 반면 Qwen2.5VL-7B는 93.5%
   - 즉 ShotVL은 "MCQ 맞추기"만 잘하고 실제 분석 능력은 의심

**교훈**: 특화 파인튠은 벤치마크 수치는 올리지만 **실사용 강건성은 의문**.

### 7.3 Molmo / PixMo (AI2, 2024-2025)

**Molmo 2** (8B, Qwen3 기반): video grounding + pointing SOTA
- PointBench: spatial reasoning, affordance, counting
- PixMo 데이터셋: 외부 VLM 없이 수집한 2D pointing 데이터

**핵심 차별점**: 언어로 답하기 어려운 "어디?" 질문에 **좌표 포인트로 답함**. cinematography 관점에서:
- "이 이미지의 시선 유도선은 어디부터 어디까지?" → pointing으로 가능
- "주피사체의 얼굴 중심은?" → pointing
- **단, 여전히 "35mm 렌즈" 같은 추상 개념은 불가능**

### 7.4 PerceptionLM (Meta, 2025)

**PerceptionLM**: 상세 시각 이해 전용 오픈 모델. CVPR 25 발표.
- 샷 프레이밍, 인물 배치 인식 중심 데이터셋 공개
- 여전히 cinematography "기법"은 주 타겟 아님

### 7.5 비디오 특화 VLM

- **Qwen2.5-VL**: dynamic FPS sampling -- 비디오를 가변 FPS로 샘플링해 처리
- **Video-MME** (CVPR 2025): 비디오 VLM 전용 벤치마크
- **MotionBench** (CVPR 2025): fine-grained motion 이해
- **CinePile**: 위에서 다룸

관찰: **긴 비디오**(>1분)는 **프레임 샘플링 한계**로 어느 모델도 잘 못함. 현실적으로 VLM 레퍼런스 입력은 **단일 이미지 또는 짧은 클립(5-10초)** 만 안정.

---

## PART 8: 실무 -- Midjourney, Runway, Pika 등은 어떻게 하나

### 8.1 Midjourney: /describe 커맨드

- 이미지 업로드 → 4개 프롬프트 제안
- **동일 이미지를 반복 호출하면 다른 프롬프트 나옴** (stochasticity 문제 그대로)
- 실사용: 사용자가 4개 중 하나 고르거나 일부 단어만 채택
- **핵심**: MJ는 이걸 "프롬프트 추천"이라 부르고 "정확한 분석"이라 주장 안 함

### 8.2 Runway Gen-4: References

- 최대 3개 레퍼런스 이미지 업로드
- 720×720 또는 1280×720 해상도 제한
- `image_1`, `image_2`, `image_3` 라벨로 프롬프트 내 참조
- **기능**: 캐릭터 / 스타일 / 객체 일관성
- **추출하는 정보가 아니라 직접 conditioning**: 이미지 피처를 모델 latent에 주입. "이 사람과 똑같이"지 "이 사람의 옷은 빨강색"이 아님

### 8.3 Sora 2: input_reference

- API의 `input_reference` 파라미터 -- 첫 프레임 앵커
- "Reference conditioning isn't pixel-perfect reproduction; think of it as a strong visual suggestion"
- **Feature conditioning**: VLM으로 이미지 분석하는 게 아니라, 이미지 임베딩을 비디오 생성 모델에 직접 공급

### 8.4 Kling: 6축 Motion Control + Reference

- 6축 카메라 제어 (horizontal, vertical, zoom, tilt, roll, pan)
- 레퍼런스 이미지 + 모션 경로 drawing
- **분석이 아니라 제어**: 레퍼런스에서 "이 샷은 틸트업"을 뽑는 게 아니라, 사용자가 직접 틸트업을 지시

### 8.5 공통 패턴

**모든 상용 도구는 "VLM으로 레퍼런스 분석 → 프롬프트 자동 생성"을 하지 않는다.**

대신:
- **Visual conditioning** (이미지 피처를 생성 모델에 직접 주입, VLM 우회)
- **사용자 명시 제어** (카메라 무브먼트는 텍스트/UI로 입력)
- **기능 한정** (캐릭터 일관성, 스타일 전이 같은 "고수준 목표"만 담당)

**ControlNet / 이와 유사한 visual conditioning**:
- Depth map / Canny edge / OpenPose / 스케치 → 생성 모델 제어
- 이것도 VLM 경유가 아니라 **전문 CV 모델(Canny, Depth Anything, OpenPose)** 경유
- VLM이 이 중간 단계에 아예 안 들어감

### 8.6 Tale Studio 함의

경쟁사들의 실무에서 배울 것:
1. **레퍼런스 입력 = "VLM으로 파싱" 아님**. 이미지 feature를 별도로 처리하거나 사용자에게 구체 지시 받기.
2. **분석은 scoped, 좁게**. 전체 분해 시도 금지.
3. **레퍼런스의 1차 용도는 스타일/톤 전이**. 촬영 기법 추출은 보조로만.
4. **ControlNet류 전문 CV 모델**로 depth/pose/edge 추출 후 주입 -- VLM보다 정확하고 저렴.

---

## PART 9: Stochasticity/Robustness 실증

### 9.1 동일 입력 반복 호출 일치율 (추정)

**직접 실험 결과가 아님 -- Tale Studio에서 MVP 단계 실험 필요**. 아래는 관련 연구를 조합한 추정치.

temperature=0, 동일 이미지 5회 호출 시 예상 일치율:

| 태스크 | 일치율 (추정) | 근거 |
|-----|------------|------|
| "인물 몇 명?" (1-3명) | 95%+ | POPE에서 높은 정확도 + 결정론적 카운팅 |
| "지배 색상?" (4지선다) | 90%+ | CineTechBench Color 80-93% |
| "실내/실외?" | 98%+ | 단순 분류 |
| Shot Size 대분류 (CU/MS/WS) | 80-90% | ShotBench 69-75% 정확도의 일관성 부분 |
| Shot Size 세분류 (6-8단계) | 55-70% | 인접 카테고리 혼동 36.2% |
| 조명 방향 (front/side/back) | 60-70% | Lighting Condition 48-53% |
| 카메라 앵글 (5단계) | 75-85% | ShotBench 56-58% |
| 렌즈 유형 (wide/std/tele) | 50-60% | 사실상 랜덤 근처 |
| 자유 서술 일치 | <30% | 동일 의미 다른 단어 사용, 순서 상이 |

### 9.2 Drift 관찰 패턴

연구에서 관찰된 패턴:
- **프롬프트 복잡도 ↑ → drift ↑**
- **이미지 애매성 ↑ → drift ↑** (조명 모호, 구도 중간값 등)
- **동일 의미 다른 표현 프롬프트** → 심한 불일치
- **세션 간(API 재호출)** → 세션 내보다 drift 큼

### 9.3 대응 전략

1. **Majority voting**: N=5, threshold=3
2. **Consistency check**: 두 가지 프롬프트 표현(e.g., "What's the shot size?" vs "Is this a close-up or wide shot?")으로 교차 검증
3. **Confidence scoring**: LLM의 logprob 활용 (지원되는 모델에서)
4. **Cascaded fallback**: 실패 필드는 사용자 입력으로 전환

---

## PART 10: Cinematography 필드별 실패 원인 심층

### 10.1 조명비 (Key-to-Fill Ratio)

**필요한 능력**: 이미지의 "밝은 면"과 "어두운 면"의 상대 휘도 측정.

**VLM 한계**:
- **절대 휘도 측정 불가**: VLM 출력은 텍스트. "2:1" 같은 수치 값을 "생성"하는 것이지 "측정"하지 않음
- **지각적 상대 밝기는 가능**: "오른쪽 뺨이 왼쪽 뺨보다 밝다" 정도
- **단, 숫자로 변환 불가**: 2:1 vs 4:1 vs 8:1 구분은 훈련 데이터 편향에 의존

**BLINK Relative Reflectance**: VLM이 "두 표면 중 어느 쪽이 더 반사적?"도 랜덤 수준.

**결론**: **키-필 비율 자동 추출 = 불가**. 사용자가 "하이키/로우키/노멀" 같은 대분류 선택만 가능.

### 10.2 초점거리 / 렌즈 특성

**필요한 능력**: 이미지의 원근 왜곡, 피사계 심도, 배경 압축 정도로부터 렌즈 유형 역산.

**VLM 한계**:
- ShotBench Lens Size 48.9% (GPT-4o), CineTechBench Focal Length 33% (GPT-4o)
- 모든 모델 공통 실패 영역
- **이유**:
  - 훈련 이미지에 EXIF 메타데이터 라벨 없음
  - 원근 압축은 **장면 내 오브젝트 크기 비율**에 강하게 의존 -- VLM은 이 기하 비율 판정이 약함 (BLINK multi-view/spatial)
  - 피사계 심도는 해상도에 민감 -- 리사이즈로 소실

**결론**: **렌즈 추출 불가**. "와이드/표준/망원" 3분할도 위험. UI에서 사용자 선택으로 가.

### 10.3 색보정 / LUT / 색온도

**필요한 능력**: RGB 히스토그램 분석, 화이트 포인트 추정, 톤 커브 역산.

**VLM 한계**:
- **수치 색온도(Kelvin) 추정 = 전통 CV도 어려움**. VLM은 더 나쁨
- **"warm/cool/neutral" 대분류는 Color 차원에서 80%+** -- 이건 쓸 만
- **LUT 종류(Kodak Vision3, Arri LogC, S-Log3) = 완전 불가**. 이런 라벨로 학습된 데이터 희박

**결론**: **색온도 정량 불가**. "따뜻한/차가운/중립" 3분할만 신뢰 가능. LUT는 묻지 말 것.

### 10.4 샷 구도 (Rule of Thirds, Golden Ratio, Leading Lines)

**필요한 능력**: 피사체의 픽셀 좌표 + 격자 매핑.

**VLM 한계**:
- ShotBench Composition 55% (GPT-4o)
- CineTechBench Composition 57-67% (상위 모델)
- **이유**:
  - 격자 위치 판정 = 정밀 grounding 필요 -- VLM의 약점
  - "Rule of thirds 교차점에 피사체가 있나?" 같은 질문은 VLM의 spatial resolution보다 세밀
  - **Molmo류 pointing 모델로 보완 가능성**: 주피사체 pointing → 좌표 → 격자 판정을 코드에서

**결론**: **대분류(center/off-center/symmetrical)는 50-60% 가능**. 정밀 구성 분석은 Molmo-style pointing + 후처리 필요.

### 10.5 프로덕션 디자인 (의상, 소품)

**필요한 능력**: fine-grained object classification + 패션/소품 도메인 지식.

**VLM 한계**:
- **Fine-Grained Visual Recognition (FGVR)은 VLM의 약점**
- CLIP의 알려진 한계: "fine-grained classification and counting"
- FashionMNIST급 대분류는 강함. "1920년대 런던 수트 vs 1940년대 시카고 수트" 같은 전문 구분 불가
- **이유**: 훈련 데이터에 시대/지역 별 의상 구조화 라벨 부재

**결론**: **대카테고리만**. "수트, 드레스, 군복, 작업복" 수준. 시대/지역 세부는 사용자 입력 필수.

---

## PART 11: 종합 -- Tale Studio 의사결정 매트릭스

### 11.1 입력 매체 축 (5축 중 하나) 권고 설계

| 모드 | 허용 입력 | VLM 사용 | 추출 필드 | 위험도 |
|-----|---------|---------|---------|-------|
| **T (Text only)** | 자연어 | X | 사용자 직접 | 낮음 |
| **T+S (Text + Style hint)** | 자연어 + 레퍼런스 이미지 1개 | Scoped 5-7필드 | 대분류만 | 중간 |
| **T+R (Text + Full Reference)** | 자연어 + 레퍼런스 1-3개 | Scoped + pointing | 확장 (여전히 대분류) | 높음 |
| **V (Video reference)** | 짧은 클립 5-10초 | 프레임 샘플링 + scoped | 움직임 대분류 | 매우 높음 |

### 11.2 필드별 추출 전략

| Knowledge DB 필드 | VLM 추출 여부 | 방법 |
|------------------|-------------|------|
| dominant_color (warm/cool/neutral) | Yes | Scoped 4지선다 |
| time_of_day (day/night/golden hour) | Yes | Scoped 4-6지선다 |
| setting (indoor/outdoor + urban/nature) | Yes | Scoped |
| mood_tone (bright/moody/dark/surreal) | Conditional | Scoped + 사용자 확인 |
| shot_size (close/medium/wide) | Conditional | 3분할 scoped. 6분할은 위험 |
| camera_angle (low/high/eye-level) | Conditional | Scoped |
| composition (center/off-center/symmetric) | Conditional | Scoped + 사용자 확인 |
| character_count | Yes | Scoped (1/2/3/group) |
| lighting_type (natural/artificial/mixed) | Conditional | Scoped |
| lighting_style (high-key/low-key/normal) | Conditional | 이분법이면 OK |
| **lens_focal_length** | **No** | **사용자 입력** |
| **key_to_fill_ratio** | **No** | **사용자 입력 (slider)** |
| **color_temperature (Kelvin)** | **No** | **사용자 입력 or LUT preset** |
| **LUT / color grading** | **No** | **프리셋 선택만** |
| **camera_movement (static vs moving)** | **Limited** | static/moving만 이분. 세부는 불가 |
| **lighting_direction (front/side/back)** | **No** | **사용자 입력** |

### 11.3 MVP 권고

**P1~P5 스코프에서**:

1. **P1~P3 (Producer/Writer/Artist)**: 텍스트 중심. 레퍼런스 이미지는 선택적 스타일 힌트. VLM은 scoped 5필드만.
2. **P4 (Director)**: 레퍼런스 허용. 단 **촬영 기법 추출 자동화 금지**. 사용자가 shot_size, camera_angle, lens 등을 6축 카메라 UI로 직접 입력.
3. **P5 (Editor)**: 레퍼런스 영상은 "스타일 톤" 참고용만. 편집 지시는 전부 수동 or 규칙 기반.

### 11.4 경고 문구 (UX 디자인 반영)

사용자가 레퍼런스를 업로드하면:

> "레퍼런스 이미지는 '분위기' 참고로 활용됩니다. 정확한 촬영 기법(렌즈, 조명비, 카메라 움직임)은 AI가 자동 인식하기 어려우므로, 아래 필드에서 직접 선택해주세요."

이 메시지는 **VLM 한계의 솔직한 공개** + **사용자 참여 유도** + **결과물 품질 보장**을 동시에 달성.

---

## PART 12: 실험 설계 권고 -- 우리가 실제로 검증해야 할 것

본 문서는 **공개 벤치마크 수치 기반**이다. Tale Studio 특정 시나리오에서의 실제 성능은 내부 실험으로 검증해야 한다.

### 12.1 권고 실험 A: Scoped 호출 일치율

**방법**:
1. 영화 스틸 20장 선별 (Oscar 수상 영화 + 넷플릭스 오리지널 + 일반 광고)
2. 각 이미지에 대해 10개 필드 × 5회 호출 (GPT-4o, Claude Sonnet, Gemini 2.5 Pro)
3. 5회 호출 간 일치율 측정 + 전문 cinematographer 1인이 각 필드의 "정답" 제공

**핵심 질문**:
- 실제 일치율이 PART 9.1의 추정치와 부합하는가?
- 어느 필드가 "그라운드 트루스 대비 정확도 70% + 일치율 80%"를 넘는가? (이 필드만 파이프라인 진입)

### 12.2 권고 실험 B: Scoped vs Open

**방법**:
- 같은 이미지에 "Describe this image" (open) vs 10개 scoped query 실행
- 출력에서 촬영 기법 언급을 수작업 태깅
- open 서술의 촬영 기법 언급 정확도 vs scoped 정확도 비교

**예상 결과**: open 서술은 "cinematic"류 일반 단어만 나오고 구체 정보는 scoped보다 훨씬 낮음.

### 12.3 권고 실험 C: Reference-to-Generation 품질

**방법**:
- 레퍼런스 A → VLM 분석 → 프롬프트 생성 → Kling/Veo로 재생성
- 생성 결과 B와 레퍼런스 A의 시각적 유사도 평가
- 비교: (1) VLM 전체 파이프라인 (2) VLM 없이 사용자가 직접 프롬프트 작성 (3) Runway References 식 직접 conditioning

**예상 결과**: (3) 직접 conditioning이 (1) VLM 파이프라인보다 훨씬 좋음.

### 12.4 권고 실험 D: Failure Case 수집

**방법**:
- 사용자 테스트에서 VLM이 오인식한 케이스 로깅
- 오인식 패턴 분류 → 재발 방지 (해당 필드 비활성화 or 사용자 강제 입력)

---

## PART 13: 참고 문헌 및 근거

### 13.1 핵심 벤치마크 논문

1. **ShotBench** -- Zhang et al., "ShotBench: Expert-Level Cinematic Understanding in Vision-Language Models", arXiv:2506.21356, 2025. <https://arxiv.org/html/2506.21356>
2. **CineTechBench** -- PRIS-CV Group, "CineTechBench: A Benchmark for Cinematographic Technique Understanding and Generation", arXiv:2505.15145, NeurIPS 2025. <https://arxiv.org/html/2505.15145>
3. **RefineShot** -- "RefineShot: Rethinking Cinematography Understanding with Foundational Skill Evaluation", arXiv:2510.02423, 2025.
4. **BLINK** -- Fu et al., "BLINK: Multimodal Large Language Models Can See but Not Perceive", arXiv:2404.12390, ECCV 2024. <https://zeyofu.github.io/blink/>
5. **MMVP (Eyes Wide Shut)** -- Tong et al., "Eyes Wide Shut? Exploring the Visual Shortcomings of Multimodal LLMs", arXiv:2401.06209, CVPR 2024. <https://tsb0601.github.io/mmvp_blog/>
6. **MME-RealWorld** -- Zhang et al., arXiv:2408.13257, ICLR 2025. <https://github.com/MME-Benchmarks/MME-RealWorld>
7. **CinePile** -- Rawal et al., "CinePile: A Long Video Question Answering Dataset and Benchmark", arXiv:2405.08813, 2024. <https://ruchitrawal.github.io/cinepile/>
8. **POPE** -- Li et al., "Evaluating Object Hallucination in Large Vision-Language Models", arXiv:2305.10355, EMNLP 2023.

### 13.2 VLM 아키텍처 논문

9. **Qwen2.5-VL Technical Report** -- Alibaba, arXiv:2502.13923, March 2025.
10. **InternVL2.5/3** -- OpenGVLab, arXiv:2412.05271 (InternVL2.5), arXiv:2504.10479 (InternVL3).
11. **LLaVA-OneVision** -- arXiv:2408.03326, 2024.
12. **Molmo and PixMo** -- Deitke et al., arXiv:2409.17146, CVPR 2025.
13. **FastVLM** -- Apple, arXiv:2412.13303, 2024.

### 13.3 CLIP 및 한계 분석

14. **CLIP ViT-L/14** -- OpenAI, HuggingFace model card. <https://huggingface.co/openai/clip-vit-large-patch14>
15. **SigLIP** -- Zhai et al., "Sigmoid Loss for Language Image Pre-Training", Google DeepMind.
16. **Tri-Bench (Spatial)** -- arXiv:2512.08860, 2025.
17. **Spatial-DISE** -- arXiv:2510.13394, 2025.

### 13.4 Stochasticity 연구

18. **Test-Time Consistency in VLMs** -- arXiv:2506.22395, 2025.
19. vLLM GitHub issue #17759 on temperature=0 inconsistency.
20. *Histopathology VLM Uncertainty* -- arXiv:2603.03527.

### 13.5 실무 문서

21. **Midjourney /describe** -- <https://docs.midjourney.com/docs/describe>
22. **Runway Gen-4 References** -- Runway 공식 도움말
23. **OpenAI Sora input_reference** -- OpenAI Cookbook Sora 2 Prompting Guide.
24. **Kling 6-axis Motion Control** -- kling.ai 및 fal.ai 문서
25. **OpenAI GPT-4o image tokenization** -- 2048 bbox → 768 short → 512 tile, 85+170n tokens.
26. **Claude Opus 4.7 Vision** -- Anthropic 공식, 2576px long edge, 98.5% visual acuity (from 54.5%).

---

## 맺음: 한 페이지 요약

### 쓸 수 있는 것 (VLM으로)
- 대분류 scene type (실내/실외, 낮/밤)
- 주요 색상 톤 (warm/cool/neutral)
- 인물 수 (1-3명)
- Shot Size 3분할 (CU/MS/WS)
- Camera Angle 대분류
- Mood 형용사 (bright/dark/moody)

### 못 쓰는 것 (VLM이 불안정)
- 렌즈 초점거리
- 조명비 수치 (key-to-fill)
- 조명 방향 정밀 (3-point breakdown)
- 색온도 Kelvin
- LUT / color grade 세부
- 카메라 움직임 세부 (push-in vs zoom-in)
- Rule of thirds 정량 판정
- 의상 시대/지역 구분

### 설계 원칙
1. **Scoped 4-6지선다만 사용**. 자유 캡셔닝 금지.
2. **Majority voting (N=3-5)**. Drift 방어.
3. **실패 필드는 사용자 입력으로 전환**. UI 슬라이더/셀렉트 박스로.
4. **레퍼런스 = 스타일 힌트**, 촬영 지시서 아님.
5. **ControlNet류 visual conditioning 우선 고려** -- VLM 경유보다 정확.

### 5축 모델 입력 매체 축 권고
- **T (텍스트만)**: 기본 모드. MVP 중심.
- **T+S (텍스트 + 스타일 힌트 1장)**: Scoped 5필드만 VLM 호출. 대분류만 반영.
- **T+R (텍스트 + 다중 레퍼런스)**: P4+ 단계에서 고려. 여전히 scoped.
- **V (비디오)**: MVP에서 제외 권고. Scoped 추출이 static보다 훨씬 약함.

> 요점: **VLM은 "스타일 참고용 보조 도구"로만 취급하고, "촬영 기법 자동 분해기"로 기대하지 말 것.** 이 경계선을 넘으면 제품 품질이 VLM 한계에 갇힌다.
