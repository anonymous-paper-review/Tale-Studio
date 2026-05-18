# 사용자 입력 시나리오: 창작자 사전 확정 수준 전수 분류

> 작성일: 2026-04-20
> 상태: Draft (고도화 대기) — 향후 파이프라인 입력 확장 설계의 기반 문서
> 관련 구현: `experiment/svc-pipeline`, `experiment/dual-axis`
> 연관 이론: `dual_axis_model.md`, `linear_pipeline.md`, `cliche_framework.md`

---

## 0. 이 문서의 목적

svc-pipeline과 dual-axis는 현재 `input.story: string` 단일 필드만 받는다. 테스트 환경에선 충분하지만, 실제 업계 사용자(감독, 시나리오 작가, IP 보유자, CF 디렉터, 광고대행사 PD 등)는:

1. **텍스트 이상**의 자료를 가져온다 (이미지, 영상, 스케치, 레퍼런스 영상 클립)
2. **확정 수준이 다양**하다 (블랭크 슬레이트 ~ 샷 단위 명세 완료)
3. **확정 패턴이 비대칭**이다 (캐릭터만 정해짐 / 톤만 정해짐 / 엔딩만 정해짐 등)
4. **확정 항목의 유연성이 다르다** (절대 못 바꿈 / 합리적 대안은 검토 / 열려있음)

현재 파이프라인은 이 다양성의 극히 일부만 커버한다. 이 문서는 **전수 분류**와 **향후 고도화 방향**을 기록한다. 즉각 구현 계획이 아니라 설계 청사진.

---

## 1. 5축 좌표 공간

임의의 창작자는 다음 5축의 조합 좌표로 표현된다.

```
(Depth, Shape, Rigidity, Role, Media)
```

### 축 1: 확정 깊이 (Depth)

사용자가 얼마나 구체적으로 머릿속에 확정했는가.

| Lv | 명칭 | 입력 예시 | 확정 범위 |
|----|------|----------|----------|
| L0 | Blank Slate | "재밌는 SF 만들어줘" | 없음 (막연한 방향만) |
| L1 | Logline | "중력이 역전된 세계의 형사" | 테마/한 줄 |
| L2 | + Genre/Tone | L1 + "느와르, 다크" | S0 일부 |
| L3 | + Visual Ref | L2 + "블레이드러너 톤" | S0 + L0/L1 방향 |
| L4 | + Structure | L3 + "5막, 비선형, 45분" | S0 + S1 |
| L5 | + Characters | L4 + "Kai(30대 엔지니어)... 3인" | S0 + S1 + S2 |
| L6 | + Scene List | L5 + 24개 씬 요약 | S0~S3 |
| L7 | + Shot Style | L6 + "핸드헬드, 풀샷 위주" | S + L0~L2 |
| L8 | + Shot List | L7 + 샷 단위 카메라/렌즈 | S + V 대부분 (L3 프롬프트만 AI) |
| L9 | Prompt Only | 샷 + 레퍼런스 이미지 | 전부. AI는 포맷팅만 |

### 축 2: 확정 패턴 (Shape)

Depth만으론 현실을 담지 못한다. **비대칭 확정**이 실무에서 더 흔하다.

| 패턴 | 예시 | 특징 | 실제 사용자 유형 |
|------|------|-----|---------------|
| **A. 균일 Top-Down** | L0→L5까지 순차 | 교과서적 | 드묾. 기획 초기 PD |
| **B. Island (섬) 확정** | "캐릭터만 정해짐 + 스토리 백지" | 하나만 고정 | IP 보유자, 브랜드 캐릭터 |
| **C. Style-First** | "블레이드러너 같은 영상" + 스토리 없음 | 톤/비주얼 먼저 | CF/MV 감독, 광고 |
| **D. End-First** | "엔딩만 확정" + 앞은 자유 | 메시지/결론 우선 | 단편, 브랜디드 콘텐츠 |
| **E. Constraint-Only** | "5분, 15세, 캐주얼" + 나머지 자유 | 브리프만 존재 | 의뢰받은 대행사 |
| **F. Reference-Heavy** | 타 작품 3개 "이 느낌 섞어줘" | 믹스앤매치 | 젊은 크리에이터 |
| **G. Partial Scene** | "중간 추격씬만 머릿속에 있음" | 명장면 중심 | 감독, 액션 디자이너 |
| **H. Anti-Pattern 있음** | "이런 건 피해줘" (네거티브 리스트) | 배제 중심 | 클리셰 기피형, 예술가 |

현실에선 여러 패턴이 **중첩**된다. 예: CF 감독은 (C-StyleFirst) + (E-Constraint) + (H-AntiPattern) 동시.

### 축 3: 유연성 (Rigidity)

같은 Lv5라도 확정 항목의 **수정 허용 여부**가 다르다.

| 등급 | 의미 | 파이프라인 함의 |
|------|------|--------------|
| **Locked** | "이건 절대 못 바꿈" | AI가 제안조차 금지. 필드 잠금 + 검증 오류로 경고 |
| **Preferred** | "가급적 유지, 합리적 대안은 검토" | AI가 대안 제시, 사용자 승인 플로우 |
| **Draft** | "일단 이렇게 생각했지만 열려있음" | AI가 자유롭게 개선 |

Rigidity는 **필드 단위**로 적용된다. 같은 사용자가 "캐릭터 Locked, 장르 Preferred, 씬 리스트 Draft"일 수 있다.

### 축 4: 창작자 역할 (Role)

입력 수준은 **직군 정체성**과 강하게 연동된다.

| 직군 | 전형적 Depth | 전형적 Shape | 전형적 Rigidity | 핵심 자료 |
|------|---------|-------------|--------------|---------|
| 기획 PD | L1-L2 | A 균일 | Draft | 레퍼런스 3-5장 |
| 시나리오 작가 | L4-L5 | A/B | Preferred | 시놉시스 + 캐릭터 |
| 감독/연출 | L6-L7 | A/G | Locked | 스토리보드 + 레퍼런스 |
| 촬영감독 | L2 + L8 일부 | C Style-First | Locked (샷) | 샷 레퍼런스 |
| **IP 보유자** | L5 Island | B | **Locked (캐릭터)** | 캐릭터 시트 + 바이블 |
| CF/MV 디렉터 | L3 + Constraint | C/E | Preferred | 레퍼런스 CF + 브랜드 |
| 광고대행사 | L2 + E | E Constraint | Draft | 브리프 PDF |
| 스토리보드 아티스트 | L6-L7 | A | Preferred | 스케치 |
| 브랜드 마케터 | L2 + E | E | Draft | 브랜드 가이드 |
| VFX 슈퍼바이저 | L8-L9 | 후공정 | Locked | 콘티 + 플레이트 |

### 축 5: 입력 매체 (Media Form)

현실 입력은 텍스트+이미지+영상+파일 혼합이 기본.

| Form | 예시 | 매핑 레이어 | 주 용도 |
|------|------|--------------|--------|
| **캐릭터 사진/일러스트** | 인물 사진, 원화, IP 캐릭터 | S2 + L2 | 얼굴/외형 고정 |
| **무드보드** | Pinterest 모음, 색 팔레트 | L0 + L1 | 톤/스타일 전이 |
| **로케이션 사진** | 답사 사진, 세트 사진 | S3.setting + L2 | 장소 고정 |
| **컨셉 아트** | 세계관 일러스트 | L0 + L1 | 비주얼 월드 |
| **스토리보드/썸네일** | 손그림, 3D 레이아웃 | L3 카메라/구도 | 샷 설계 |
| **레퍼런스 영상 클립** | 타 작품 씬, 기존 CF | L0~L3 전부 | 전체 감각 |
| **의상/소품 사진** | 프로덕션 샷 | L2 | 디자인 디테일 |
| **지도/레이아웃** | 평면도, 동선 | S3.blocking | 공간 설계 |
| **보이스/BGM 레퍼런스** | 음악 샘플 | (파이프라인 외) | 청각 설계 |
| **모션 레퍼런스** | GIF, 기존 영상 | L3 + I2V 모션 | 움직임 지정 |
| **브리프 문서** | PDF, Slides, Notion | 다중 매핑 | 구조화 필요 |

### 축 5 세부: 업로드 의도

같은 매체라도 의도가 다르다.

| 의도 | 자료 형태 | 기술적 표현 |
|------|---------|---------|
| "이 **사람**으로" | 캐릭터 사진 1~N장 | Identity Lock (IP-Adapter 류) |
| "이 **톤**으로" | 이미지 다수 | Style Embedding |
| "이 **구도**로" | 스케치/그림 | Layout Reference (ControlNet) |
| "이 **장소**에서" | 로케이션 사진 | Location Seed |
| "이 **영상 느낌**" | 영상 클립 | Holistic Vibe (모호함) |
| "이 **의상**으로" | 의상 사진 | Wardrobe Lock |
| "이 **움직임**으로" | 모션 레퍼런스 | Motion Reference |
| "이것처럼 **하지 마**" | 네거티브 자료 | Anti-Reference |

---

## 2. 좌표 예시 (실제 케이스 가상)

```
Case A: IP 캐릭터 + 신규 스토리
(L5, B-Island, Locked, IP보유자,
 Media: [캐릭터 사진 3장, 세계관 바이블 PDF, 과거 작품 영상])

Case B: CF 컨셉 의뢰
(L2, E-Constraint + C-StyleFirst, Preferred, CF디렉터,
 Media: [제품 사진, 레퍼런스 CF 2개, 브랜드 가이드 PDF])

Case C: 감독의 명장면 확장
(L7, G-PartialScene, Locked, 감독,
 Media: [썸네일 스케치 10장, 레퍼런스 영상 3개])

Case D: 유튜브 단편 크리에이터
(L3, A, Preferred, 개인창작자,
 Media: [무드보드 Pinterest 링크])

Case E: 광고대행사 신규 수주
(L1, E-Constraint, Draft, 대행사 PD,
 Media: [브리프 PDF, 브랜드 로고])

Case F: 아트하우스 감독
(L6, A + H-AntiPattern, Locked, 독립영화감독,
 Media: [스토리보드 풀세트, 레퍼런스 영화 5편, "헐리우드 문법 피하기" 네거티브])
```

---

## 3. 현재 파이프라인 커버리지

| 좌표 | svc-pipeline | dual-axis | 비고 |
|------|-----------|---------|-----|
| (L0-L1, A, Draft, 아무나) | ✅ 완벽 | ✅ | 원클릭 자동 |
| (L2, A, Draft, PD/마케터) | 🟡 우회 | 🟡 | story 문자열에 묻어 소실 위험 |
| (L3-L5, A/B, *, 전문가) | ❌ | 🟡 | 필드 사전 입력 없음 (dual-axis는 Preset으로 L0 일부 지원) |
| (L6+, *, Locked, 감독) | ❌ | ❌ | 씬이 S3에서 자동 생성되어 덮어씀 |
| (*, C/D/E/F/G/H, *, *) | ❌ | ❌ | 비대칭/제약 입력 개념 없음 |
| (*, *, *, *, 이미지 포함) | ❌ | ❌ | 텍스트 외 입력 불가 |
| (*, *, *, *, 영상 포함) | ❌ | ❌ | 불가 |

**결론**: svc-pipeline은 (L0-L2, A, Draft, 텍스트 전용)의 1차원 선형 케이스만 커버. 전체 좌표 공간의 **약 5%**. 나머지 95%는 설계 재편 필요.

---

## 4. 멀티모달 입력의 핵심 난점: VLM 한계

이미지/영상 입력을 받으려면 VLM(Vision Language Model)이 해석해야 한다. 하지만 현행 VLM 아키텍처는 "모든 걸 알아서 읽어줘" 방식을 지원하지 못한다.

### 4.1 구조적 원인

| 한계 | 설명 | 결과 |
|------|------|-----|
| **Attention Bottleneck** | Vision Transformer 패치 토큰 수 제한(CLIP-L = 576, SigLIP-SO = 729) | 미세 디테일 spatial pooling에서 소실 |
| **Training Distribution Bias** | 캡셔닝 데이터가 "사람이 빨간 드레스" 수준 | 촬영 용어(조명비, 래티튜드)는 학습 안 됨 |
| **Categorical ≫ Continuous** | "따뜻한 톤" OK, "LUT 커브 -0.2/+0.15" 불가 | 연속값 추출 불가 |
| **Semantic ≫ Formal** | "무엇"에 강함, "어떻게"에 약함 | 렌즈/초점/조명비 추정 불가 |
| **Attribution 실패** | "이 부분은 A, 저 부분은 B" 분리 불가 | 믹스 레퍼런스 해체 불가 |
| **Stochasticity** | 같은 이미지 3회 → 3개 다른 답 | 프로덕션 파이프라인 비결정 |

상세 수치와 벤치마크는 `research_vlm_limitations.md` 참조.

### 4.2 Open-World vs Closed-World

**Open-World (지금)**:
```
Image → VLM → "cyberpunk city at night with neon reflections and mist"
                ↓
            LLM prompt에 문자열 주입
                ↓
            생성 결과 매번 다름, 소스와 어긋남
```

**Closed-World (필요)**:
```
L0/L1/L2 Taxonomy 사전 정의:
  L1.shape_language ∈ {geometric, organic, mechanical, biomorphic}
  L1.line_weight ∈ {hairline, thin, medium, bold, variable}
  L1.silhouette ∈ {simple, complex, layered, minimal}
  L2.palette_scheme ∈ {mono, complementary, triadic, split-comp, analogous}
  L2.color_temperature ∈ {2000K, 3200K, 5600K, 7500K, mixed}
  ...

Image → VLM (scoped query) → 위 taxonomy 값으로 분류
                ↓
            구조화 필드로 파이프라인 주입
                ↓
            재현 가능, 충돌 탐지 가능, 조합 가능
```

### 4.3 구조화가 가능케 하는 것

| 구조화 없음 | 구조화 있음 |
|-----------|----------|
| 이미지 → 모호한 텍스트 | 이미지 → 정확한 필드 값 |
| "이 톤" 모방 불가능 | `palette_scheme=triadic` 재현 가능 |
| 멀티 레퍼런스 충돌 감지 불가 | 필드 단위 충돌 탐지 |
| 사용자 자료와 AI 생성물 비교 불가 | 동일 축에서 diff 계산 |
| 부분 Locked 불가 | `locked: L1.shape_language` 가능 |

### 4.4 부분 우회 전략

L0~L2 Taxonomy 전면 구축 전에도 가능한 스코프 한정 접근:

| 전략 | 방식 | 적용 범위 |
|------|------|-------------|
| **A. Closed-Set 분류** | 사전 정의 스타일 N개(지브리, 픽사, 느와르...) 중 선택 | L0 preset 확장판 |
| **B. 임베딩 유사도** | CLIP/SigLIP 벡터 매칭, 설명 생략 | 스타일 전이, 순위만 |
| **C. Identity Adapter** | IP-Adapter/InstantID로 얼굴/외형 고정 | S2 캐릭터 시드 (상용화 완료) |
| **D. First-Frame Bypass** | 사용자 이미지를 첫 프레임으로 직결 → I2V | L3 단일 샷 고정 |
| **E. Scoped VLM Query** | "주광원 방향만 답해" 같은 제한 질문 | 특정 필드 추출 |
| **F. Reference as Mood Only** | 자료는 "분위기 참고"로만, 재현 시도 안 함 | L0/L1 가이드만 |

각 전략의 상업화 사례와 성능은 `research_closed_world_style.md` 참조.

---

## 5. L0~L2 Taxonomy 구조화: 선결 과제

### 5.1 기존 자산

`dev/writer_advencement/`에 L0/L1/L2 **구성 요소 목록과 값 예시**가 존재한다:

| 기존 문서 | 내용 |
|---------|-----|
| `L0_L1_deep_dive.md` | 매체/해상도/fps/비율/렌더 + 스타일/쉐이프/라인/캐릭터/텍스처 |
| `L0_L1_diagram.md` | L0↔L1 연결 관계 시각화 |
| `L1_L2_deep_dive.md` | L1 → L2 전환 요소 |
| `L1_L2_L3_diagram.md` | 3레벨 전환 구조 |
| `L2_L3_deep_dive.md` | L2 → L3 전환 요소 |

### 5.2 미비한 부분

위 문서들은 **설명식 서술**이다. 스키마화된 **enum + range + 조합 규칙**은 아직 없다. 멀티모달 입력을 받으려면 다음 정형화가 추가로 필요:

1. **컴포넌트 타입 정의**
   ```ts
   interface L1Visual {
     shape_language: 'geometric' | 'organic' | 'mechanical' | 'biomorphic' | 'mixed'
     line_weight: 'hairline' | 'thin' | 'medium' | 'bold' | 'variable'
     silhouette_complexity: 1 | 2 | 3 | 4 | 5  // 1=단순, 5=복잡
     // ...
   }
   ```
2. **enum 값공간의 정당화** (왜 4개인가, 5개인가. 문헌/사례 근거)
3. **조합 규칙** (호환/충돌/상호작용 매트릭스)
4. **Knowledge DB 연동** (각 enum 값 → cinematography RAG 엔트리)

`CLAUDE.md`의 "Knowledge DB 기반 cinematography RAG" 차별화 포인트와 정확히 일치하는 방향.

---

## 6. 실무 우선순위 (재편)

기존 가정 "멀티모달 입력 받으면 VLM이 알아서 해줌"은 틀렸다. 수정된 실행 순서:

### Phase 1 — Taxonomy 기반 (선결)
- **① L0/L1/L2 컴포넌트 목록 정형화** (기존 딥다이브 → 스키마)
- **② enum/range 값 공간 정의**
- **③ 조합 규칙** (호환/충돌/가중치)
- **④ Knowledge DB** (YAML + Supabase) 구축

### Phase 2 — 구조화 텍스트 생성
- **⑤** LLM이 자유 텍스트 대신 Taxonomy 필드로 S0~L3 출력
- **⑥** 스키마 검증 + 조합 규칙 위반 탐지

### Phase 3 — 부분 입력 (텍스트 Locked Field)
- **⑦ Locked Field 주입 UI** (특정 필드만 사용자 지정)
- **⑧** AI는 나머지 빈 필드만 채움
- **⑨** 충돌 탐지 + 사용자 알림

### Phase 4 — 멀티모달 입력
- **⑩ Closed-Set VLM 분류기** (이미지 → Taxonomy 필드)
- **⑪** 레퍼런스 번들 의도 태깅 (kind/target/weight)
- **⑫** 여러 자료 충돌 해결 룰

### Phase 5 — 고도화
- **⑬ Negative Reference** (피할 자료 처리, Cliché Framework 연동)
- **⑭ Progressive Disclosure** (단계별 자료 주입 UX)
- **⑮** Reference-as-Seed vs Reference-as-Vibe 구분

---

## 7. 미해결 설계 질문

고도화 착수 전 결정 필요:

1. **텍스트 vs 이미지 충돌 시 우선순위**
   - 예: 텍스트 "빨간 드레스" + 이미지 "파란 정장"
   - 룰 기반 / 사용자 확인 / 신뢰도 가중치?
2. **자료 품질 가중치**
   - 흐릿한 썸네일과 고화질 컨셉아트의 차등
3. **자료 라이선스**
   - 레퍼런스 영상 저작권 처리 (파이프라인 책임 영역?)
4. **Progressive Disclosure 타이밍**
   - 처음부터 받을까, Mid Preview 후 받을까
5. **AI 제안 → 사용자 자료로 대체**
   - Mid Preview에서 "이 톤 대신 내 자료" 플로우
6. **다중 Locked Field의 일관성 검증**
   - 사용자가 모순된 Locked 지정 시 (예: 장르=코미디 + 톤=비극)
7. **Rigidity의 UI 표현**
   - 필드마다 Lock/Prefer/Draft 스위치? 과부하?

---

## 8. 심화 연구 (병렬 조사)

별도 문서로 분리. 본 문서와 교차 참조. 2026-04-20 3건 모두 완료.

### 8.1 `research_vlm_limitations.md` (805줄)
현행 VLM 한계 실증. 핵심 수치:
- 최고 VLM(GPT-4o, Gemini 2.5 Pro)도 cinematography 벤치마크 평균 **60% 미만**
- **렌즈 초점거리 33-49%, 카메라 움직임 <40%, 조명 방향 48%** — 사실상 랜덤(25%) 근처
- 원인: vision encoder 병목(CLIP/SigLIP 224-448 해상도) + 구조화 라벨 부재. MMVP 9개 중 7개는 스케일링으로도 해결 불가
- **Scoped 4-6지선다 질문**은 80%+ 신뢰 가능, **자유 캡셔닝은 F1 30-50%로 붕괴**
- Runway/Pika/Sora 등 상용 도구는 VLM 자동 분석 **없이** 우회
- **권고**: 렌즈/조명비/색온도/카메라 움직임 세부는 VLM 자동 추출 금지, UI 입력으로

### 8.2 `research_closed_world_style.md` (1155줄)
Midjourney sref/cref, SD LoRA, IP-Adapter/FaceID/InstantID/PhotoMaker/PuLID, ControlNet, Firefly, Style Aligned, Flux Kontext, Qwen Edit, Runway/Pika/Kling/Sora/Veo, ComfyUI 등 12개 시스템군 전수 조사. 핵심 인사이트:
- **업계 수렴 패턴**: style/subject/structure 3축 분리 + 재현 가능한 ID 체계 + closed 토큰 공간 + 독립 가중치 모듈 조합
- **Tale Studio 호환**: ControlNet 카테고리 분리가 Knowledge DB taxonomy와 동형, Kling @Element/Sora @mention이 캐릭터 에셋 관리와 일치
- **피해야 할 것**: Midjourney sref(블랙박스), DreamBooth full-tune(재현성 낮음)
- **원칙 1줄**: "VLM은 ingress로만, 저장은 항상 Knowledge DB 폐쇄 토큰으로, 생성은 IP-Adapter/LoRA/Structure 3축 분리로"

### 8.3 `research_industry_material_practice.md` (1523줄)
업계 pre-production 자료 번들 실태. 핵심 결과:
- Mood board/lookbook/director's treatment/storyboard/shot list/production bible 전수 통계
- 10개 페르소나(웹소설 작가, IP 보유자, CF 감독, 대행사 PD, 아트하우스 감독, 유튜버, 브랜드 마케터, 게임 시네마틱, 교육 PD, MV 감독) 각각 자료 번들 + 5축 좌표 + 도입 장벽 구체화
- **참조 플랫폼** 4레이어 분류: 수집(Pinterest, ShotDeck) / 조직(Milanote, PureRef) / 협업(Frame.io, Notion) / 전송(Dropbox, 이메일)
- **Progressive Disclosure Tier 1-4** 설계안 + 페르소나별 매핑 포함

---

## 9. 다음 액션 후보

| 옵션 | 작업 | 우선순위 판단 기준 |
|------|------|----------------|
| A | L1(시각 스타일) 컴포넌트 Taxonomy 먼저 정형화 | 가장 시각적, 샘플 풍부 |
| B | 특정 장르(예: 느와르) pilot Taxonomy + 검증 | 좁은 스코프로 검증 |
| C | svc-pipeline 입력 타입 확장 (텍스트 Locked Field만) | 텍스트만으로 부분 입력 |
| D | 사용자 페르소나 가상 인터뷰 4명 + 자료 번들 샘플 작성 | 실제 입력 요건 도출 |
| E | Closed-Set VLM 분류기 PoC (1개 필드, 예: palette_scheme) | 기술 검증 |
| F | Knowledge DB 스키마 초안 (Supabase 테이블 설계) | 인프라 선행 |

⏸ **실착수 전 사용자 의사결정 필요**.

---

## 부록 A: 좌표 용어 요약

- **Depth (L0-L9)**: 사용자가 얼마나 구체적으로 머릿속에 확정했는가
- **Shape (A-H)**: 확정 항목이 어떤 패턴으로 분포하는가
- **Rigidity**: 확정 항목의 수정 허용 여부 (Locked/Preferred/Draft)
- **Role**: 사용자 직군
- **Media**: 입력 자료의 형태와 의도

## 부록 B: 관련 문서

### 본 프로젝트 내
- `dev/writer_advencement/dual_axis_model.md` — S/V/C 이론 모델
- `dev/writer_advencement/linear_pipeline.md` — 선형 구조 실무 설계
- `dev/writer_advencement/cliche_framework.md` — 7차원 클리셰 분류
- `dev/writer_advencement/L0_L1_deep_dive.md` — L0/L1 구성 요소
- `dev/writer_advencement/L0_L1_diagram.md` — L0-L1 연결
- `dev/writer_advencement/L1_L2_deep_dive.md` — L1-L2 전환
- `dev/writer_advencement/L2_L3_deep_dive.md` — L2-L3 전환
- `dev/writer_advencement/sound_ideation.md` — 청각 레이어 (본 문서의 Media 축 일부)
- `specs/mvp_scope.md` — MVP 범위
- `specs/api_features.md` — Knowledge DB / 6축 카메라 스펙
- `CLAUDE.md` — 프로젝트 개요

### 구현 레퍼런스
- `experiment/svc-pipeline/` — 선형 자동 파이프라인
- `experiment/dual-axis/` — Mid Preview + Back Adjust 대화형

---

## 부록 C: 현재 입력 타입 (참고)

### svc-pipeline (`src/lib/types/pipeline.ts`)
```ts
interface PipelineInput {
  story: string
  runtime_hint?: string
  // 그 외 없음
}
```

### dual-axis (`src/lib/types/state.ts`)
```ts
interface SessionInit {
  story_input: string
  preset?: GenrePreset  // 이게 Closed-World 접근의 초기 형태
}
```

Preset은 Closed-World 방향의 맹아이지만 L0 전반에 한정. L1/L2/캐릭터/씬 단위 Lock은 없음.

### 확장 필요 예시 (향후)
```ts
interface ExtendedPipelineInput {
  story?: string  // 선택적
  references: Array<{
    media: File | URL
    kind: 'character' | 'mood' | 'location' | 'storyboard' | 'motion' | 'wardrobe' | 'anti'
    target_field?: string  // 예: 'S2.Kai', 'L1.palette'
    weight?: number  // 0~1
    rigidity: 'locked' | 'preferred' | 'draft'
    note?: string
  }>
  locked_fields?: Partial<S0 & S1 & S2 & S3 & L0 & L1 & L2>
  anti_references?: Array<{ media: File | URL; reason?: string }>
  constraints?: {
    runtime_seconds?: number
    age_rating?: string
    budget_tier?: 'indie' | 'mid' | 'high'
  }
}
```

---

*본 문서는 실행 계획이 아닌 설계 청사진. 다음 세션에서 우선순위 결정 후 Phase별 착수.*
