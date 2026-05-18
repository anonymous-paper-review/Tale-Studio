# Closed-World Style/Reference Systems: 업계 전수 조사

> 작성일: 2026-04-20
> 목적: VLM 기반 open-world 자유 설명의 비결정성을 극복하기 위해, 사전 정의된 구성요소 공간(closed-world)에 참조 이미지를 매핑하는 업계 방식 전수 조사
> 대상: Tale Studio의 Knowledge DB + Taxonomy 통합 가능성 평가
> 실험 참조: `experiment/svc-pipeline`, `experiment/dual-axis`

---

## 0. 왜 Closed-World인가 — 문제 재정의

### Open-World VLM 설명의 한계

VLM(Vision Language Model)에 "이 이미지를 설명해라"고 하면 출력이 매번 다르다.

| 문제 | 결과 |
|------|------|
| 비결정성 | 같은 입력 이미지 + 같은 시드 → VLM 출력 텍스트가 미세하게 달라짐 |
| 어휘 폭발 | "moody", "cinematic", "vibrant"처럼 무한 형용사 공간 → 파이프라인 하류 처리 불가 |
| 누락/왜곡 | VLM이 중요한 시각 요소를 놓치거나 존재하지 않는 요소를 hallucinate |
| 재현 불가 | 한 프로젝트 내 여러 샷에서 동일한 스타일 유지 어려움 |
| 구조화 불가 | 자유 텍스트는 관계형 DB에 정규화 불가 |

### Closed-World의 핵심 전제

업계가 암묵적으로 채택한 해답은 **"참조 이미지를 사전 정의된 공간으로 투영"**이다.

| 접근 | 핵심 아이디어 |
|------|--------------|
| **숫자 ID 공간** | Midjourney sref 같은 불투명 코드 — 이미지 대신 재현 가능한 숫자로 스타일 지정 |
| **파라미터 공간** | LoRA/어댑터 가중치 — 스타일을 소수의 trainable 벡터에 압축 |
| **임베딩 공간** | IP-Adapter/CLIP — 고정 차원 임베딩에 시각 의미 투영 |
| **택소노미 공간** | Knowledge DB의 선별된 기법 목록 — 인간이 라벨링한 의미있는 축 (Tale Studio 방향) |

이 문서의 목표는 각 접근이 구체적으로 어떻게 작동하고, Tale Studio가 무엇을 차용/회피해야 하는지 구별하는 것.

---

## 1. Midjourney 계열 — 숫자 ID가 곧 스타일

### 1.1 `--sref` (Style Reference)

**작동 원리**

- 각 `--sref <code>` 숫자(seed)는 Midjourney 내부 잠재 공간(latent space)의 하나의 점을 가리킨다.
- 약 42억 개의 코드가 가능하며, 각 코드는 색감/조명/형태/텍스처 조합을 함축한다.
- 이미지를 직접 업로드하거나(URL) 숫자 코드로 지정 가능. 숫자 쪽이 재현 가능.
- `--sw <0~1000>` 가중치로 스타일 영향력 조절.
- V7부터는 기존 `--sref` 대신 Omni Reference로 통합되는 추세.

**캡처 vs 손실**

| 항목 | 포착 | 손실 |
|------|-----|------|
| 색감/팔레트 | 강 | — |
| 조명 톤 | 중 | — |
| 브러시/질감 | 강 | — |
| 구조/포즈 | — | 약 (--sref는 스타일만, 구조는 무시) |
| 캐릭터 정체성 | — | 강 (그건 cref/omni 담당) |

**사용자 입력 형태**

- `--sref 2213253170` (단일 코드)
- `--sref 123 456 789` (다중 코드 평균)
- `--sref random` (랜덤 샘플링)
- 이미지 URL 직접 (`--sref https://example.com/img.jpg`)

**Closed-set vs Open-set**

- 완전 closed. 코드 공간은 Midjourney의 사전 학습된 잠재 공간이며 외부 노출 없음.
- 사용자는 코드를 발견할 수는 있지만(Style Explorer, Midlibrary, SrefHunt) 생성/역공학 불가.

**재현성**

- 같은 `--sref` + 같은 `--seed` + 같은 프롬프트 → 거의 같은 출력.
- 이것이 sref의 **존재 이유**. 이미지 업로드는 매번 CLIP 임베딩이 조금씩 달라질 수 있지만, 숫자 코드는 LUT처럼 동작.

**제약/실패 케이스**

- 역공학 불가 (출력 이미지 → sref 코드 추출 불가)
- Midjourney 외부 사용 불가 (다른 모델 이식 불가)
- 코드가 어떤 의미 축을 나타내는지 알 수 없음 (블랙박스)
- V7로 갈수록 호환성 깨짐 (옛 sref 코드가 V7에서 다른 결과)

**상업화 상태**

- 프로 Midjourney 사용자의 표준 워크플로우. sref 큐레이션 사이트(Midlibrary, SrefHunt, Promptsref)가 생태계로 존재.
- sref 공유/거래가 소규모 시장 형성.

### 1.2 `--cref` (Character Reference) / Omni Reference

**작동 원리 (cref, V6 기준)**

- 이미지의 인물의 얼굴 구조, 헤어, 의상을 포착하여 다른 씬에 재현.
- `--cw <0~100>` 가중치로 "얼굴만"부터 "얼굴+의상+헤어 전부"까지 조절.

**작동 원리 (Omni Reference, V7+)**

- cref의 확장. 캐릭터뿐 아니라 객체, 배경, 스타일의 모든 시각 요소를 앵커링.
- `--ow <1~1000>` 가중치.
- V7에서는 cref 호환 중단 → 사용자는 Omni Reference로 강제 전환.

**캡처 vs 손실**

| 항목 | 포착 | 손실 |
|------|-----|------|
| 얼굴 구조 | 강 | — |
| 헤어/의상 | 중~강 (cw에 따라) | — |
| 체형 | 약 | — (얼굴 위주) |
| 화풍/스타일 | — | — (그건 sref 담당) |
| 포즈 | — | — |

**사용자 입력 형태**

- 단일 참조 이미지 URL
- 가중치 1개 파라미터

**Closed-set vs Open-set**

- open-ish. 임의의 업로드 이미지 허용이지만, Midjourney 내부의 얼굴 임베딩 공간으로 투영.

**재현성**

- 동일 이미지 입력 → 거의 재현. 업로드 재인코딩에 약간의 변동.

**제약/실패 케이스**

- 실사 인물 잘못 인코딩될 수 있음 (AI 생성 이미지가 가장 안정적)
- 의상 일부만 바꾸려면 별도 프롬프트 필요
- 2배 GPU 시간 소모

### 1.3 Personalization Profiles & Moodboards

**작동 원리**

- Personalization: 사용자가 썸네일 쌍에서 선호 이미지 선택 → 수천 번 반복 → 개인 취향 프로파일 학습.
  - 40 ratings로 시작, 200에서 안정, 2000 이상은 미미한 개선.
- Moodboards: 핀터레스트식 이미지 컬렉션. 사용자가 이미지를 보드에 추가 → 해당 보드 스타일을 프롬프트에 적용.
- 결과로 나오는 "프로파일 ID"는 sref처럼 `--p mID` 형태로 재사용 가능.

**캡처 vs 손실**

- 집계된 취향 (어떤 톤을 선호하는가)은 포착.
- 단일 특정 이미지 충실도는 약화 (평균화됨).

**Closed-set vs Open-set**

- 입력은 open (임의 이미지), 출력은 closed (Midjourney 잠재 공간의 한 점).

**재현성**

- 같은 프로파일 ID → 재현.
- 프로파일 자체는 사용자 계정에 묶여 있어 타인이 재현 불가.

### 1.4 Niji Mode

**작동 원리**

- Spellbrush와 협업한 애니메이션 전용 모델 체크포인트.
- Midjourney 본 모델과 완전 별개의 다른 모델 (공유 프롬프트 문법, 다른 가중치).
- Niji 7 (2026-01 출시)에서 코히어런시 크게 향상.

**Closed-set vs Open-set**

- 모델 자체가 closed 택소노미. 스타일 선택지 = "이 모델 or 저 모델".

**시사점**

- "전체 모델을 바꾸는" 것이 가장 강력한 closed-world. 하위 파라미터 조정은 이 위에서 동작.

---

## 2. Stable Diffusion 생태계 — 파라미터 공간의 closed-world

### 2.1 LoRA (Low-Rank Adaptation)

**작동 원리**

- 원 논문(Hu et al. 2021): 사전학습 가중치 `W₀`를 고정하고, 저랭크 업데이트 `ΔW = BA`만 학습 (r ≪ min(d,k)).
- 핵심 가설: "모델 적응 시 가중치 업데이트는 낮은 intrinsic rank를 가진다."
- Diffusion 모델에서는 UNet의 cross-attention 층에 LoRA 주입이 표준.
- 파일 크기: 10~200MB (전체 모델은 2~10GB) → 공유/전환 쉬움.

**캡처 vs 손실**

- 스타일 LoRA: 브러시, 팔레트, 질감, 장르적 컨벤션.
- 캐릭터 LoRA: 얼굴, 체형, 의상, 액세서리.
- 손실: 원 모델의 일반 지식 일부. 너무 강하게 학습하면 overfitting.

**사용자 입력 형태 (사용 측)**

- `<lora:styleName:0.7>` 형태로 프롬프트에 가중치와 함께 삽입.
- 여러 LoRA 동시 로드 가능 (스타일 LoRA + 캐릭터 LoRA).

**사용자 입력 형태 (학습 측)**

- 10~50장 (캐릭터) / 100~500장 (스타일)의 이미지 데이터셋.
- 각 이미지에 caption (trigger word 포함).
- 학습 시간: 소비자 GPU에서 10분~수 시간.

**Closed-set vs Open-set**

- 사용 시점에서는 학습된 특정 LoRA = closed (하나의 스타일).
- 조합(composition) 시에는 semi-open (여러 LoRA 혼합).

**재현성**

- 같은 LoRA + 같은 시드 + 같은 프롬프트 → 재현.
- CivitAI 생태계에서 수만 개의 LoRA가 버전 관리되어 배포.

**제약/실패 케이스**

- 기본 모델 교체 시 (SD1.5 → SDXL → Flux) LoRA 재학습 필요.
- 여러 LoRA 동시 로드 시 간섭(conflict) — 가중치 조절 노하우 필요.
- 소수 이미지 학습 → 캐릭터가 포즈에 과적합 (특정 각도만 잘 나옴).

**상업화 상태**

- CivitAI: 수십만 LoRA 공개 호스팅, 2025년 Flux LoRA 훈련 UI(FluxGym, fal, Replicate) 성숙.
- 기업: Scenario, Playground, Leonardo가 커스텀 LoRA를 상품화.

### 2.2 DreamBooth (Ruiz et al. 2022)

**작동 원리**

- 전체 모델 가중치를 미세조정(full fine-tuning).
- 특정 subject에 rare token("sks", "[V]") 바인딩.
- Prior preservation loss로 class-level 지식 유지.

**캡처 vs 손실**

- 피사체 정체성 포착은 LoRA보다 우수 (더 많은 파라미터 활용).
- 색상 균형, 일반 prompt 준수 저하 위험.

**사용자 입력 형태**

- 3~5장의 subject 이미지, rare token 지정.

**Closed-set vs Open-set**

- 학습 후 하나의 바인딩된 token = closed.

**재현성**

- 재현 가능. 단 체크포인트 파일 크기가 큼(2~10GB).

**제약/실패 케이스**

- 파일 크기 → 공유 부담. → LoRA가 이 문제의 대체재.
- overfitting 경향.

**상업화**

- 초기 API(Astria, Leap)에서 개인 학습 모델 서비스. 이후 대부분 LoRA로 전환.

### 2.3 Textual Inversion (Gal et al. 2022)

**작동 원리**

- 모델 가중치는 완전히 freeze.
- 새 단어(placeholder token) 하나의 embedding 벡터만 학습.
- 파일 크기: 수 KB.

**캡처 vs 손실**

- 한 벡터 → capacity 제한. 단순 개념(색/스타일 지문)엔 충분, 복잡한 정체성엔 부족.

**사용자 입력 형태**

- 3~5장 이미지, placeholder token ("<my-style>") 지정.

**Closed-set vs Open-set**

- 학습된 벡터 = closed.

**재현성**

- 재현 가능. 매우 가볍게 공유.

**제약/실패 케이스**

- 품질은 DreamBooth/LoRA에 뒤처짐.
- 기본 모델의 기존 어휘 공간 내에서만 표현 가능.

**상업화**

- 2025년 기준 단독 사용은 줄고, LoRA의 보조적 역할로 잔존.

### 2.4 정리 — SD 생태계 4축 비교

| 방법 | 학습 파라미터 | 파일 크기 | 학습 시간 | 품질 | 비고 |
|------|-------------|---------|---------|-----|------|
| Full Fine-tune | 전체 | 2~10GB | 수 시간 | 최고 | 드묾 |
| DreamBooth | 전체 (+rare token) | 2~10GB | 1~4시간 | 상 | LoRA에 밀림 |
| LoRA | 저랭크 어댑터 | 10~200MB | 10분~1시간 | 상 | **표준** |
| Textual Inversion | 1 벡터 | 수 KB | 30분~1시간 | 중 | 보조 |

### 2.5 CivitAI 생태계

- 2026년 현재 Flux, SDXL, SD1.5, Pony XL용 LoRA가 각각 수만 개.
- 스타일 LoRA 훈련 가이드: 100장 이상, Network Alpha = Dimension, 3600 steps+ (Pony 스타일 기준).
- Multi-training: 최대 5개 변형 병렬 학습.
- 커뮤니티가 trigger word/사용법/샘플 프롬프트를 메타데이터로 축적 → **사실상 업계의 closed-world 택소노미**가 됨.

---

## 3. IP-Adapter 계열 — 임베딩 기반 참조

### 3.1 기본 IP-Adapter (Ye et al. 2023)

**작동 원리**

- 2,200만 파라미터 어댑터 (매우 경량).
- 핵심: **decoupled cross-attention** — 텍스트 cross-attention과 별개로 이미지 cross-attention을 추가.
  - UNet의 각 cross-attn 층에 이미지용 K,V 분기 추가.
  - 텍스트 K,V와 별도 분리, 출력은 합산.
- 이미지 인코더: OpenCLIP-ViT-H-14 (표준), ViT-bigG도 가능하지만 메모리 부담.

**캡처 vs 손실**

- 전체적 구성, 색조, 질감: 포착.
- 미세한 identity(얼굴 세부): 약함 → FaceID 필요.

**사용자 입력 형태**

- 이미지 1장 + 선택적 텍스트 프롬프트.
- 가중치 파라미터로 영향력 조절.

**Closed-set vs Open-set**

- 입력 open, 내부 표현은 CLIP 이미지 임베딩 (semi-structured).

**재현성**

- CLIP 임베딩 자체는 deterministic → 재현 가능.
- 단 이미지 파일 재인코딩 시 소수점 차이 발생 가능.

**제약/실패 케이스**

- 스타일과 구조가 섞여 나옴 — 의도가 "스타일만"이면 추가 분리 조치 필요.
- Plus 버전(패치 임베딩)이 디테일 더 잘 잡지만 메모리 ↑.

**상업화**

- ComfyUI/A1111의 사실상 표준 스타일 어댑터.
- Flux용 IP-Adapter는 2024-11 InstantX/XLabs가 공개 (비상업 라이선스).

### 3.2 IP-Adapter FaceID

**작동 원리**

- 얼굴 인식 모델(InsightFace 등)로 얼굴 임베딩 추출 → LoRA + IP-Adapter 결합.
- Plus-Face: 패치 임베딩 + 크롭된 얼굴 이미지.

**캡처 vs 손실**

- 얼굴 정체성은 포착, 표정/조명은 프롬프트 제어.

**성능 (2025 기준)**

- 속도 빠름, VRAM 소모 적음.
- 정체성 충실도: 82~86% (InstantID와 유사, PuLID보다 약간 낮음).

### 3.3 InstantID (2024-01)

**작동 원리**

- 3 모듈 결합:
  1. **ID Embedding**: antelopev2 얼굴 인코더에서 semantic face embedding 추출 (CLIP 대신).
  2. **IP-Adapter decoupled cross-attn**: 이미지 프롬프트로 삽입.
  3. **IdentityNet**: ControlNet류 구조. 5개 랜드마크(눈2, 코, 입2)로 공간 제어.
- 프롬프트는 텍스트 없이 얼굴 임베딩만으로도 동작 가능.

**캡처 vs 손실**

- 얼굴: 매우 강. 포즈: IdentityNet의 랜드마크로 제어 가능.
- 의상: 약 (별도 프롬프트 필요).

**재현성**

- 매우 높음. 단 랜드마크 추출이 이미지에 의존.

**제약**

- 실사 얼굴에 최적화. 애니메이션/회화 얼굴에 약함.
- 단일 참조 이미지. 다중 이미지는 별도 기법 필요.

### 3.4 PhotoMaker V1/V2 (TencentARC, 2023-12)

**작동 원리**

- "Stacked ID Embedding" — 여러 입력 이미지의 임베딩을 length 차원으로 concat.
- OpenCLIP-ViT-H + fuse layers + UNet의 모든 attn 층에 LoRA (rank 64).
- Class embedding("man", "woman")과 각 image embedding을 fuse한 후 stack.

**캡처 vs 손실**

- 여러 참조 이미지 평균화로 정체성 포착. 각도 변화에 강건.

**재현성**

- 재현 가능.

**제약**

- 애니메이션/일러스트 약함 (실사 최적화).

### 3.5 PuLID (ByteDance, 2024-04)

**작동 원리**

- 핵심: **contrastive alignment loss** + **accurate ID loss**.
- Lightning T2I branch와 standard diffusion branch를 동시 운영.
- ID 주입 전후의 모델 동작을 대조(contrastive)하여 "배경/조명/구도/스타일이 변하지 않도록" 학습.
- 결과: ID 삽입이 원 모델의 원래 prompt 충실도를 방해하지 않음.

**캡처 vs 손실**

- 정체성: 최고 수준 (DivID-120에서 Face Similarity 0.733).
- prompt editability: 유지 (CLIP-T 31.31).

**성능 (2025 비교)**

| 항목 | FaceID | InstantID | PuLID |
|------|--------|-----------|-------|
| ID 충실도 | 중 | 상 | **최상** |
| prompt 준수 | 상 | 중 | 상 |
| 속도 | 최고 | 중 | 낮음 |
| VRAM | 최저 | 중 | 최고 |

**상업화**

- 2025년 오픈소스 Face Swap/Character 워크플로우의 최상위. Flux/Kontext와 결합한 파이프라인이 실무 표준.

### 3.6 정리

- IP-Adapter = "텍스트가 아닌 이미지로 프롬프트."
- FaceID → InstantID → PuLID 순으로 정체성 충실도 향상, 동시에 연산 비용도 증가.
- 모두 **사전 학습된 임베딩 공간**을 사용하므로 closed-world의 일종. 단 공간 자체는 CLIP/ArcFace 계열이라 "스타일 매핑"보다 "정체성 매핑"에 최적화됨.

---

## 4. ControlNet 계열 — 구조 정보의 closed-world

### 4.1 ControlNet (원 논문: Zhang et al. 2023)

**작동 원리**

- UNet의 encoder를 복제하여 "trainable copy" 생성.
- 조건 이미지(depth/canny/pose 등)를 이 copy에 입력 → zero-convolution으로 원 UNet에 주입.
- 원 모델 가중치는 freeze → 기존 생성 능력 보존.

### 4.2 공식/준공식 ControlNet 변종 목록

| 변종 | 입력 | 포착 항목 | 활용 |
|------|-----|---------|------|
| **Canny** | 에지맵 | 윤곽 | 구성 유지, 스타일 교체 |
| **Depth** | 깊이맵 | 공간 구조 | 3D 씬 복제 |
| **Normal** | 노멀맵 | 표면 방향 | 3D 구조 |
| **OpenPose** | 스켈레톤 | 인체 포즈 | 캐릭터 액션 |
| **Scribble** | 손그림 | 대략 구조 | 스케치→실사 |
| **Segmentation** | 의미 분할 | 객체 카테고리 공간 배치 | 씬 레이아웃 |
| **LineArt** | 선화 | 라인 | 콘셉 아트 |
| **LineArt Anime** | 애니 선화 | 라인 | 애니 특화 |
| **SoftEdge (HED/PiDi)** | 부드러운 엣지 | 실루엣 | 자연스런 구성 |
| **MLSD** | 직선 검출 | 건축 라인 | 건물/실내 |
| **Tile** | 타일 조각 | 업스케일 | 고해상도 |
| **IP2P (Instruct Pix2Pix)** | 이미지+명령 | 편집 | "X를 Y로 바꿔" |
| **Shuffle** | 색 셔플 | 색/질감 분포 | 팔레트만 이식 |
| **TemporalNet** | 이전 프레임 | 시간 일관성 | 비디오 |

### 4.3 T2I-Adapter (TencentARC, 2023)

**작동 원리**

- ControlNet과 동일 목적, 다른 설계.
- 77M 파라미터 (ControlNet ~300M~1.3B 대비 훨씬 작음).
- 조건 이미지 → 별도 adapter network → UNet에 주입.

**비교**

| 항목 | ControlNet | T2I-Adapter |
|------|-----------|-------------|
| 파라미터 | 많음 | 적음 (77M) |
| 속도 | 느림 | ~3배 빠름 |
| 조건 유형 수 | 9+ | 적음 |
| 다중 조건 조합 | 가능 | 더 쉬움 |
| 정밀도 | 최고 | 적당 |

### 4.4 ControlNet++ / Union (xinsir, 2024)

**작동 원리**

- 단일 체크포인트에 10개 이상 조건 유형 통합.
- Condition Encoder 공유 + Condition Transformer로 feature 융합.
- 파라미터 수 원본 ControlNet과 거의 동일.

**ProMax 버전**

- 12개 조건 + 5개 편집 모드(다중 조건 fusion, outpainting 등) 지원.

**시사점**

- 각 조건을 별도 모델로 운영하던 기존 방식 → 단일 통합 모델로 정리.
- Tale Studio가 "구조 참조"를 다룰 때 이 통합 모델 하나로 충분.

### 4.5 정리 — ControlNet의 closed-world성

- 입력 조건 유형이 **discrete 카테고리**(canny/depth/pose…)이다.
- 각 카테고리는 입력 형식(1채널 그레이맵 등)이 사전 정의.
- **출력 스타일은 open** (프롬프트/LoRA로 자유)이지만 **구조 공간은 closed** (13종 조건 중 하나 선택).
- 이것이 정확히 "Tale Studio가 원하는 closed-world taxonomy"의 성공 모델.

---

## 5. Adobe Firefly

### 5.1 Style Reference

**작동 원리 (공식 문서 기준)**

- 사용자가 업로드하거나 Firefly 큐레이션 갤러리에서 선택한 이미지를 "스타일 앵커"로 사용.
- 색/라이팅/무드만 전달, 구조는 영향받지 않음.

**closed-world 특징**

- Firefly UI 내 "Styles" 섹션 자체가 선별된 closed set (일러스트, 디지털 아트, 3D 등 카테고리).
- 사용자 업로드 이미지는 이 스타일 공간으로 투영.

### 5.2 Structure Reference

**작동 원리**

- 참조 이미지의 윤곽(outline)과 깊이(depth)를 추출하여 새 이미지에 적용.
- API 파라미터: `structure.strength` (1~100), `structure.imageReference`.

**closed-world 특징**

- 내부적으로는 canny/depth에 해당하는 고정 추출 파이프라인 (ControlNet 스타일).
- 사용자는 "외곽선과 깊이"라는 **사전 정의된 두 축**만 조작.

### 5.3 Custom Models (Firefly Business)

**작동 원리**

- 엔터프라이즈용 커스텀 fine-tuning.
- 1024×1024 이상 이미지, 최대 16:9/9:16, 50MB 이하.

**시사점**

- Adobe의 상업적 포지션: "공개 VLM(open)" 대신 "브랜드 일관성 보장(closed)"을 팔음.
- 기업은 "자유도"보다 "재현성"에 지불 의향 있음 = Tale Studio의 B2B 타깃과 동일.

### 5.4 Adobe Photoshop Generative Fill (2026)

**작동 원리**

- 선택 영역에 대한 인페인팅에 "Reference Image" 기능 추가.
- 참조 이미지의 스타일/색/조명/질감/톤 균형을 분석 → 해당 영역에 적용.

**시사점**

- 전문가 UI 전통에서 온 철학: "모호한 프롬프트 X, 명시적 참조 O."
- 기존 Photoshop 워크플로우에 Reference Image가 매우 빠르게 정착 → B2B 도구에서 "참조 이미지는 기본 기능"이라는 기대가 형성됨.

---

## 6. Google 계열

### 6.1 Style Aligned (Hertz et al., CVPR 2024 Oral)

**작동 원리**

- 단일 batch 내 여러 이미지 간 **self-attention을 공유**(shared self-attention).
- 첫 이미지가 "스타일 anchor" 역할, 나머지 이미지는 해당 anchor의 queries/keys를 참조.
- AdaIN으로 query/key를 정규화 → balanced attention flow.
- **학습 필요 없음**. inference-time 기법.

**캡처 vs 손실**

- batch 내 일관된 스타일(색/질감) 전달 성공.
- 캐릭터 정체성은 별도 메커니즘 필요.

**재현성**

- Inversion 기법을 결합하면 참조 이미지에 맞춤 가능. deterministic.

**상업화**

- 연구 수준. 하지만 Imagen/Gemini 라인의 스타일 기능의 이론적 기반으로 작용하는 것으로 추정.

### 6.2 Imagen 3 Customization (Vertex AI)

**제공 기능**

- **Subject Customization**: 참조 주제 이미지 → 새 씬에 배치.
- **Style Customization**: 참조 스타일 이미지 → 새 내용에 스타일 적용.
- **Controlled Customization**: canny/scribble 유형 제어.
- **Instruct Customization**: 자연어 명령 + 참조.

**구조**

- 최대 4개 참조 이미지. 각각 `referenceId`로 프롬프트 내 위치 지정: `[1]`, `[2]` 등.
- 스타일/구조가 API 레벨에서 분리된 parameter로 제공.

**closed-world 특징**

- Vertex AI의 사전 정의된 프리셋(realistic, cinematic, surreal, watercolor…)도 동시 존재.
- 참조 이미지 + 프리셋 조합 가능.

### 6.3 Gemini 2.5 Flash Image (Nano Banana, 2025-08)

**주요 기능**

- 캐릭터 일관성: 참조 이미지의 얼굴/의상/헤어/체형을 유지한 채 새 씬 생성.
- 멀티 이미지 융합: 여러 입력을 하나의 씬으로 병합 ("이 캐릭터를 저 방에 넣어").
- 지역 편집: 자연어로 특정 영역 변경.

**가격**

- $30 / 1M 출력 토큰 (이미지당 1290 토큰 = $0.039).

**closed-world 특징**

- 겉으로는 open world conversational editing. 내부적으로는 "캐릭터 보존", "씬 보존" 등 사전 정의된 operation space.

### 6.4 정리 — Google의 접근

- 연구(Style Aligned) → 제품(Imagen 3 Customization) → 소비자 제품(Nano Banana)으로 기술 흘러감.
- API 설계가 "style / subject / structure" 3축으로 분리 → **의미 축 구조화된 참조**의 모범 사례.

---

## 7. Flux 생태계

### 7.1 Flux.1 LoRA

**개요**

- Black Forest Labs의 Flux.1-dev가 2024 중반 등장 이후 Stable Diffusion의 자리를 일정 부분 대체.
- LoRA 훈련 생태계 급성장 (fal, Replicate, FluxGym, Pinokio, WaveSpeedAI).
- 15~20장의 캐릭터 이미지로 훈련 가능. 10~30장 스타일.

**특이점**

- Flux 아키텍처는 DiT(Diffusion Transformer) 기반 → 기존 SD의 UNet LoRA와 약간 다름.
- 2025년 LoRA+ (서로 다른 학습률), fused backward pass 등 훈련 최적화 기법 정착.

### 7.2 Flux Kontext (Black Forest Labs, 2025-05)

**작동 원리**

- flow matching 기반 **in-context image generation and editing**.
- "sequence concatenation" 접근: 참조 이미지와 텍스트 지시를 단일 시퀀스로 concat하여 처리.
- 단일 아키텍처에서 생성 + 편집 + 스타일 참조 + 캐릭터 보존 지원.

**핵심 능력**

- 캐릭터 일관성: 여러 씬에 동일 캐릭터 유지.
- 지역 편집: 나머지 이미지 보존하며 특정 요소만 변경.
- 스타일 참조: 내용은 새로, 스타일은 참조에서.
- 반복 편집 (iterative): 이전 편집 위에 추가 편집 — 이 분야 최초.

**Flux Kontext [pro]**

- 이전 SOTA 대비 최대 10배 빠른 속도.
- Replicate/BFL Playground에서 API 제공.

### 7.3 시사점

- 기존 "텍스트 → 이미지" 패러다임에서 "이미지+텍스트 → 이미지" 멀티모달 편집으로 이동.
- closed-world 참조가 API 1급 시민(first-class)으로 올라감.

---

## 8. Qwen Image

### 8.1 Qwen Image Edit 2509/2511

**작동 원리**

- Qwen2.5-VL (semantic encoder) + VAE (reconstructive encoder) + MMDiT (generation).
- 멀티 태스크 학습: T2I, TI2I, I2I reconstruction을 통합.
- 2511 버전: consistency 강화, 문자 드리프트 감소, LoRA 내장 통합.

**참조 기능**

- 2~3개 소스 이미지를 조합하여 하나의 결과 이미지로 출력 (멀티 이미지 편집).
- 인물 동일성 보존: 여러 인물을 하나의 그룹샷으로 고품질 병합.
- 입력 portrait의 정체성 유지한 채 상상적 편집.

**closed-world 특징**

- 2511의 "LoRA 통합"은 사용자가 커스텀 LoRA를 내장해 closed 개인화 공간 구성 가능.

### 8.2 Qwen-VL / Qwen3-VL

**역할**

- 이미지 이해 전용 모델. Tale Studio의 Open-world VLM에 해당.
- 256K 토큰 컨텍스트, 인터리브된 이미지/비디오 입력.
- DeepStack 기법으로 multi-level ViT features 융합.

**시사점**

- Qwen3-VL 같은 open-world VLM을 **ingress** (참조 이미지 자동 라벨링)으로 쓰고, 생성은 closed-world(Qwen Image Edit + LoRA)에 맡기는 하이브리드가 현재 실무 패턴.

---

## 9. 영상 모델 — 참조 이미지의 한계와 진화

### 9.1 Runway Gen-4 References (2025)

**작동 원리**

- 최대 3개 참조 이미지 입력.
- 각 이미지는 entity-level encoding → 캐릭터/환경/스타일을 독립적으로 추출.
- 해상도: 1:1 → 720×720, 16:9 → 1280×720.

**기능 분해**

- 캐릭터 추출 + 새 씬 배치.
- 환경 요소만 이식.
- 여러 이미지에서 요소 블렌딩.

**Gen-3 차이**

- Gen-3는 Act-One(연기 참조), 스타일 참조는 빈약.
- Gen-4가 "references"를 1급 기능으로 승격.

### 9.2 Pika 2.0/2.2 Scene Ingredients

**작동 원리**

- 참조 이미지를 "ingredient"(재료)로 모듈화: 캐릭터/객체/의상/배경을 독립 슬롯으로.
- 프롬프트 + ingredient 리스트 → 결합 영상 생성.
- Pika 2.2 (2025-02): 10초 생성, 1080p, Pikaframes (키프레임 전환).

**closed-world 특징**

- "ingredient" = 슬롯 기반 구조화된 참조.
- Lighting/texture effects는 사전 정의된 효과 라이브러리 + intensity 슬라이더.

### 9.3 Kling AI (Kuaishou, 2025)

**Multi-Image Reference (1.6+)**

- 여러 장의 동일 subject 이미지 업로드 → 일관 스타일 영상 생성.
- 복수 subject 간 상호작용: 이미지 1(소년) + 이미지 2(코기) + 프롬프트("소년이 코기를 쓰다듬는다").

**Kling O1 (2025-12)**

- 최대 7 이미지 + 최대 3 element tags (@이름 태깅).
- @Element 시스템: 각 subject에 이름 부여 → 프롬프트에서 `@kai jumps`처럼 참조.
- 다중 캐릭터/객체 정체성 stable across 카메라 앵글/조명/씬 전환.

**시사점**

- @태그 시스템은 **이름 바인딩 closed-world**의 전형. Tale Studio의 캐릭터 에셋 관리와 정확히 일치하는 패턴.

### 9.4 Sora 2 Cameos / Characters

**작동 원리**

- 사용자가 "1~10 숫자를 세며 머리를 360도 돌리는" 비디오 녹화 → 얼굴 랜드마크 + 음성 특성 추출.
- 영구적 "digital identity" 빌드 → `@mention`으로 영상 프롬프트에 호출.

**성능**

- 95%+ 캐릭터 일관성 (20초 이하 영상).
- 20초 초과, 고동작 씬, 치아/눈 반사 등은 열화.

**Sora vs Veo**

| | Sora 2 | Veo 3.1 |
|---|--------|---------|
| 참조 모드 | 참조 이미지 (스타일/디자인) | 첫-마지막 프레임 lock |
| 캐릭터 | Cameo (녹화) + @mention | 이미지 2~3장 + 프롬프트 |
| 일관성 | 95%+ (cameo) | 캐릭터/의상/배경 안정 |

### 9.5 Veo 3 / Veo 3.1 (Google)

**참조 방식**

- 최대 3개 캐릭터/객체/씬 참조 per shot ("ingredients-to-video").
- 첫-마지막 프레임 lock은 전환 애니메이션 자동 생성.

**베스트 프랙티스**

- 2~3장의 중립 조명 참조 (정면/3/4각도/프로필).
- 의상 간결 유지 ("red scarf, leather jacket") 및 모든 샷에서 재사용.

### 9.6 Hunyuan Video (Tencent)

**HunyuanVideo-I2V (2025-03)**

- 첫 프레임 일관성 강화.
- 세밀한 얼굴 특징, 텍스처 보존.

**파생 모델**

- **HunyuanVideo-Avatar (2025-05)**: 오디오 구동 립싱크 + 감정 표현, 정체성 보존 모듈.
- **HunyuanCustom**: 이미지/오디오/비디오/텍스트 멀티모달 커스터마이즈 프레임워크.
- **LoRA**: Hunyuan Video LoRA로 캐릭터 고정 가능. 50~200장 학습 이미지, 1~3시간 훈련.

### 9.7 정리 — 영상 모델의 참조 진화

| 세대 | 방식 | 예시 |
|-----|------|-----|
| 1세대 | T2V only | Gen-1, 초기 Pika |
| 2세대 | I2V (첫 프레임 lock) | Hunyuan I2V, 초기 Kling |
| 3세대 | 캐릭터 참조 (cameo/cref) | Sora 2 Cameo, Runway Gen-4 |
| 4세대 | 구조화된 ingredient | Pika Scene Ingredients, Kling O1 @Element, Veo 3.1 Ingredients |

**시사점**

- 영상 모델 업계는 "단일 이미지 참조"에서 "다중 이름있는 슬롯 + 관계 프롬프트" 방향으로 수렴.
- Tale Studio가 캐릭터/로케이션을 에셋으로 관리하는 전략은 이 흐름과 일치.

---

## 10. 커뮤니티/워크플로우

### 10.1 ComfyUI 스타일 전이 노드 체인

**표준 워크플로우 (2025)**

```
LoadImage (reference)
  ├─> IPAdapterModelLoader → IPAdapterAdvanced
  ├─> ControlNetLoader (OpenPose) → Apply ControlNet
  ├─> ControlNetLoader (Depth) → Apply ControlNet
  └─> ControlNetLoader (Canny) → Apply ControlNet
        │
        └─> KSampler → VAEDecode → Save
```

**요구 사양**

- 8GB VRAM 이상 (다중 IP-Adapter + ControlNet).
- 노드 체인은 시각적으로 closed-world(고정된 노드 종류 + 연결 규칙).

### 10.2 Automatic1111 / Forge

- A1111 webui에 IP-Adapter는 ControlNet extension 내부로 통합.
- 스타일 LoRA `<lora:name:weight>` + IP-Adapter + ControlNet 조합이 비주얼 아티스트 표준.
- ComfyUI가 pro 사용자 점유율 증가하며 A1111은 캐주얼 시장 유지.

### 10.3 Figma AI / Canva Magic Design

**Figma Make**

- 프롬프트 → 디자인 시스템 + 코드.
- "reference style"이라기보다 "design system token" 공간 → 색/타이포/컴포넌트의 closed taxonomy.

**Canva Magic Design**

- 템플릿 선택 → AI 자동 생성. 프롬프트 기반.
- 참조는 "템플릿 ID + 브랜드 키트" 형태로 closed-world.

**시사점**

- 디자인 SaaS는 "디자인 시스템 토큰"이라는 전통적인 closed-world를 AI와 결합.
- Tale Studio도 Knowledge DB = "영상 제작 시스템 토큰"으로 보면 동일 구조.

### 10.4 StyleDrop (Google Research, 2023)

**작동 원리**

- 단일 스타일 참조 이미지 → Muse 3B 모델에 작은 adapter tuning.
- <1%만 학습, <1M 파라미터, 1000 training steps.
- 1라운드 생성 → synthetic 이미지로 2라운드 재학습 → content와 style 분리.

**시사점**

- "단일 이미지에서 스타일만 추출"이 기술적으로 가능함을 학술적으로 증명.
- 이 아이디어가 IP-Adapter/Flux Kontext 같은 상용 기술의 방향성을 제시.

---

## 11. 학술 연구 핵심 정리

| 논문 | 년도 | 핵심 | Tale Studio 시사 |
|------|-----|-----|-----------------|
| Textual Inversion (Gal et al.) | 2022 | 단어 1개 embedding으로 개념 인코딩 | 매우 가벼운 스타일 지문 가능성 |
| DreamBooth (Ruiz et al.) | 2022 | rare token + 전체 fine-tune | 고품질 캐릭터 모델 |
| LoRA (Hu et al.) | 2021 | 저랭크 adapter | 파라미터 효율 표준 |
| ControlNet (Zhang et al.) | 2023 | 조건 이미지로 구조 제어 | 택소노미화된 구조 축 |
| IP-Adapter (Ye et al.) | 2023 | decoupled cross-attn | 이미지 프롬프트 표준 |
| BLIP-Diffusion (Li et al.) | 2023 | 사전 학습된 subject representation | zero-shot 캐릭터 재현 |
| StyleDrop (Google) | 2023 | single image → adapter tuning | 1-shot 스타일 |
| Style Aligned (Hertz et al.) | 2024 | inference-time attention 공유 | **학습 없는 스타일 일관성** |
| InstantID (2024) | 2024 | face embedding + landmark | 단일 이미지 정체성 |
| PhotoMaker (TencentARC) | 2023 | stacked ID embedding | 다중 참조 평균 |
| PuLID (ByteDance) | 2024 | contrastive alignment | SOTA 정체성 보존 |
| Flux Kontext (BFL) | 2025 | sequence concat in-context | iterative 편집 표준 |

### BLIP-Diffusion의 특이 위치

- Subject representation을 **사전 학습**. 새 개념마다 학습 불필요.
- 이는 "closed-world 임베딩 공간을 먼저 학습하고 → 이후 맵핑"이라는 구조의 성공 사례.
- Tale Studio의 Knowledge DB 학습과 발상이 유사.

---

## 12. 패턴 요약 — 업계가 수렴하는 방향

### 12.1 세 가지 축 분리

거의 모든 성공 시스템은 참조를 **세 축으로 분리**한다.

| 축 | 담당 | 예시 |
|---|-----|------|
| **Style** | 색/조명/질감/브러시/톤 | Midjourney sref, IP-Adapter (style mode), Firefly Style |
| **Subject/Identity** | 얼굴/체형/의상/객체 | Midjourney cref, InstantID, PuLID, FaceID |
| **Structure** | 포즈/구조/깊이/구성 | ControlNet, Firefly Structure, Depth map |

이 분리는 사용자 UI와 API 양쪽에 공통. "한 이미지가 모든 걸 결정"하지 않고 **용도별로 다른 참조 이미지**를 받는 것이 표준.

### 12.2 ID 공간의 형태

| 형태 | 특징 | 예 |
|-----|------|---|
| **불투명 숫자 ID** | 역공학 불가, 재현성 최고 | Midjourney sref |
| **이름 바인딩** | 사용자가 명명, @태그로 호출 | Kling @Element, Sora 2 @mention |
| **LoRA 파일** | 포터블, 조합 가능 | CivitAI 생태계 |
| **임베딩 벡터** | 고정 차원, CLIP 공간 | IP-Adapter, InstantID |
| **택소노미 토큰** | 인간 라벨 + 모델 매핑 | Firefly preset, Tale Studio Knowledge DB |

### 12.3 재현성 스펙트럼

```
완전 deterministic ────────────────── 완전 random
     │                                       │
  [LoRA 파일]                            [자유 텍스트]
  [Midjourney sref 코드]                 [VLM open description]
  [이름 바인딩 (Kling @Element)]
  [학습된 LoRA (동일 시드)]
       ┃
       ├─ [IP-Adapter (동일 입력 이미지)]
       │  [InstantID (동일 얼굴)]
       │
       └─ [Moodboard 평균]
          [Personalization Profile]
```

Tale Studio는 오른쪽에서 왼쪽으로 이동해야 한다.

### 12.4 상업화 성숙도

| 시스템 | 성숙도 | 사용자 규모 |
|--------|-------|-----------|
| Midjourney sref/cref/omni | 최고 | 수백만 프로 |
| CivitAI LoRA 생태계 | 최고 | 수십만 크리에이터 |
| IP-Adapter (ComfyUI) | 상 | 수만 개 워크플로우 |
| Adobe Firefly reference | 상 | 엔터프라이즈 |
| Google Imagen 3 customization | 상 | Vertex AI 유저 |
| Pika/Kling/Runway 영상 참조 | 상 | 유료 크리에이터 |
| Flux Kontext | 중 (빠른 성장) | 고급 크리에이터 |
| PuLID/InstantID | 상 (오픈소스 세계) | 커뮤니티 |
| StyleDrop/Style Aligned | 연구 | 학술 |

---

## 13. Tale Studio가 배워야 할 교훈 (필수 섹션)

### 13.1 Knowledge DB + Taxonomy 방향과 호환되는 접근

**호환 강도 순**

1. **ControlNet 카테고리 분리** (호환: 최상)
   - 13개 이상의 사전 정의 카테고리 = Tale Studio Knowledge DB의 cinematography 카테고리와 동형.
   - 각 카테고리는 명확한 의미 축 (pose ≠ depth ≠ style).
   - 조합 가능성(multi-condition)까지 닮음.
   - **차용**: Tale Studio도 cinematography knowledge를 "구조화된 축"으로 유지해야 함.

2. **Firefly 3축 API** (호환: 상)
   - style / structure / subject가 API 1급 parameter로 분리.
   - Tale Studio의 L3 Prompt Builder가 동일하게 3축으로 프롬프트를 조립해야 함.

3. **Kling O1 @Element / Sora 2 @mention** (호환: 상)
   - 캐릭터/객체에 이름을 주고 프롬프트에서 호출.
   - Tale Studio의 캐릭터 에셋 관리(Kai/Viper/Oracle)와 정확히 일치.
   - **차용**: 샷 프롬프트에 `@kai`, `@oracle` 같은 태그 문법 도입 검토.

4. **CivitAI LoRA 메타데이터** (호환: 중)
   - 각 LoRA에 trigger word, 추천 가중치, 샘플 프롬프트가 커뮤니티 메타데이터로.
   - Tale Studio의 Knowledge DB 항목마다 동일한 메타필드(trigger 설명, 권장 강도, 조합 규칙) 갖춰야 함.

### 13.2 직접 차용 가능한 접근

**즉시 도입 가능**

1. **IP-Adapter (캐릭터 에셋 통합)** — 우선순위 1
   - `experiment/svc-pipeline`이 Qwen3 Image로 이미지 생성 → 여기서 캐릭터 에셋 이미지를 IP-Adapter 입력으로 직접 연결.
   - 첫 프레임 생성 시 "캐릭터 에셋" 이미지가 자동으로 IP-Adapter 가중치로 들어가도록 파이프라인 수정.
   - 장점: Qwen Image Edit 2511은 이미 이와 유사한 멀티 이미지 입력 지원.

2. **LoRA 기반 스타일 고정** — 우선순위 2
   - 프로젝트별로 "스타일 LoRA" 슬롯을 두어, 한 프로젝트 내 모든 샷이 동일 스타일 LoRA를 로드.
   - 초기 MVP에서는 기성 LoRA(CivitAI 큐레이션) 사용, 장기적으로 고객별 커스텀 LoRA.

3. **Style Aligned 기법** — 우선순위 3
   - 학습 없이 inference-time attention 공유로 한 batch 내 샷 간 스타일 일관성.
   - 5초 클립 간 "연속된 씬" 스타일 드리프트 방지에 효과적.
   - 구현 난이도 높으나 학습/LoRA 없이 가능한 트릭.

4. **Kling O1 @Element / Sora 2 Character 직접 활용** — 우선순위 4
   - Tale Studio가 자체 모델을 두지 않는 부분은 직접 API 호출.
   - Kling 타깃일 때 프롬프트 생성 로직이 자동으로 `@` 태그를 섞어 보내도록.

### 13.3 Tale Studio와 상충하는 접근 (피해야 할)

1. **Midjourney sref 같은 블랙박스 숫자 코드**
   - 재현성은 최고지만 **의미 축으로 분해 불가**.
   - Tale Studio의 Knowledge DB는 "왜 이 스타일이 좋은지"를 설명 가능해야 함 (B2B에 영업적으로 중요).
   - sref는 도입 불가. 단 내부 참고: "재현성을 포기하지 않는다"라는 철학만 차용.

2. **Midjourney Personalization Profile 같은 ratings-based 학습**
   - 사용자가 수백 번 클릭해야 프로파일 형성 → Tale Studio B2B 사용자에겐 비현실.
   - 대안: 프로젝트 선언 시 reference 이미지 1~3장 업로드로 cold start.

3. **DreamBooth (full fine-tuning)**
   - 2~10GB 체크포인트를 프로젝트마다 저장할 수 없음.
   - LoRA로 대체 (이미 업계 표준).

4. **VLM open-world 설명 파이프라인**
   - 이미 문제 제기한 원인. 재현 불가.
   - 단 VLM은 **ingress** (초기 참조 이미지 분석 → Knowledge DB 토큰으로 매핑)로만 사용, 매핑 결과는 구조화된 closed 토큰으로 저장.

5. **Niji처럼 전체 모델 교체**
   - 매체/스타일마다 다른 모델은 비용 과다.
   - 대신 LoRA 스택 + 프롬프트 + 택소노미 조합으로 충분한 스타일 다양성 확보.

### 13.4 우선순위 추천 — 최소 침습 통합 순서

**Phase A: 즉시 (P1~P3 MVP 내)**

1. **참조 이미지 업로드 → VLM 분석 → Knowledge DB 토큰 매핑**
   - VLM은 open-world 설명이지만 **출력은 Knowledge DB의 폐쇄된 토큰 목록으로 classification**.
   - 예: VLM이 "warm golden hour with shallow DOF"라고 말해도 → Knowledge DB의 `lighting:golden_hour`, `dof:shallow` 토큰으로 변환하여 저장.
   - 이 매핑 자체를 재현 가능하도록 JSON으로 고정.

2. **캐릭터 에셋 + IP-Adapter 호환 레이어**
   - `artist-store.ts`의 CharacterAsset이 IP-Adapter에 바로 들어갈 수 있는 형태로 이미지 필드 보장.
   - 생성 파이프라인에서 자동으로 attach.

**Phase B: 중기 (P4~P5)**

3. **프로젝트별 스타일 LoRA 슬롯**
   - 프로젝트 레벨에서 1개 스타일 LoRA를 lock.
   - 모든 샷이 이 LoRA로 렌더링 → 자동 일관성.

4. **Knowledge DB 토큰을 프롬프트 조각으로 컴파일**
   - L3 Prompt Builder가 style/structure/subject 3축으로 분리된 프롬프트 출력.
   - 모델별 adapter (Kling용, Hunyuan용, Veo용)가 각자 이 3축을 해당 API의 parameter로 매핑.

**Phase C: 장기**

5. **Style Aligned inference trick 도입**
   - 5초 샷 간 스타일 드리프트 자동 억제.

6. **고객별 커스텀 LoRA 훈련 서비스**
   - Adobe Firefly Custom Models와 동일 포지셔닝.
   - Tale Studio의 B2B 프리미엄 티어.

7. **이름 바인딩 문법 (`@kai`, `@viper`)**
   - 프롬프트 생성 로직이 Kling/Sora 문법에 맞춰 자동 치환.

### 13.5 핵심 설계 원칙 (한 줄 요약)

> **"VLM은 ingress로만, 저장은 항상 Knowledge DB 폐쇄 토큰으로, 생성은 IP-Adapter/LoRA/Structure 3축 분리로."**

이 원칙을 Tale Studio의 specs에 못박아 두는 것이 장기적 일관성 확보의 열쇠.

---

## 14. 주요 출처

### Midjourney
- [Midjourney Style Reference Docs](https://docs.midjourney.com/hc/en-us/articles/32180011136653-Style-Reference)
- [Midjourney Character Reference](https://docs.midjourney.com/hc/en-us/articles/32162917505293-Character-Reference)
- [Midjourney Omni Reference](https://docs.midjourney.com/hc/en-us/articles/36285124473997-Omni-Reference)
- [Midjourney Personalization](https://docs.midjourney.com/hc/en-us/articles/32433330574221-Personalization)
- [Midjourney Moodboards](https://docs.midjourney.com/hc/en-us/articles/39193335040013-Moodboards)
- [Midjourney Stylize Parameter](https://docs.midjourney.com/hc/en-us/articles/32196176868109-Stylize)

### Stable Diffusion 생태계
- [LoRA Paper (Hu et al. 2021)](https://arxiv.org/abs/2106.09685)
- [DreamBooth Paper (Ruiz et al. 2022)](https://arxiv.org/abs/2208.12242)
- [Textual Inversion (Gal et al. 2022)](https://arxiv.org/abs/2208.01618)
- [CivitAI LoRA Training Guide](https://civitai.com/articles/1716/opinionated-guide-to-all-lora-training-2025-update)

### IP-Adapter 계열
- [IP-Adapter Paper](https://arxiv.org/abs/2308.06721)
- [InstantID Paper](https://arxiv.org/abs/2401.07519)
- [PhotoMaker Paper](https://arxiv.org/abs/2312.04461)
- [PuLID Paper](https://arxiv.org/abs/2404.16022)
- [ComfyUI IPAdapter Plus (GitHub)](https://github.com/cubiq/ComfyUI_IPAdapter_plus)

### ControlNet 계열
- [ControlNet Union SDXL](https://huggingface.co/xinsir/controlnet-union-sdxl-1.0)
- [T2I-Adapter (GitHub)](https://github.com/TencentARC/T2I-Adapter)
- [ControlNet Complete Guide (CivitAI)](https://education.civitai.com/civitai-guide-to-controlnet/)

### Adobe
- [Firefly Style Reference](https://helpx.adobe.com/firefly/web/generate-images-with-text-to-image/customize-generated-images/reference-images-for-styling.html)
- [Firefly Structure Reference](https://helpx.adobe.com/firefly/web/generate-images-with-text-to-image/customize-generated-images/match-image-composition-to-reference-image.html)
- [Firefly Custom Models](https://business.adobe.com/products/firefly-business/custom-models.html)
- [Photoshop Generative Fill Reference](https://helpx.adobe.com/photoshop/web/edit-images/retouch/customize-generative-ai-results-with-reference-images.html)

### Google 계열
- [Style Aligned Paper (CVPR 2024)](https://arxiv.org/abs/2312.02133)
- [Imagen 3 Style Customization](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/image/style-customization)
- [Gemini 2.5 Flash Image](https://developers.googleblog.com/en/introducing-gemini-2-5-flash-image/)
- [StyleDrop](https://styledrop.github.io/)

### Flux 생태계
- [FLUX.1-Kontext-dev (Hugging Face)](https://huggingface.co/black-forest-labs/FLUX.1-Kontext-dev)
- [Flux Kontext Paper](https://arxiv.org/abs/2506.15742)
- [InstantX Flux IP-Adapter](https://huggingface.co/InstantX/FLUX.1-dev-IP-Adapter)

### Qwen
- [Qwen-Image-Edit-2511](https://huggingface.co/Qwen/Qwen-Image-Edit-2511)
- [Qwen Image Technical Report](https://arxiv.org/abs/2508.02324)
- [Qwen3-VL (GitHub)](https://github.com/QwenLM/Qwen3-VL)

### 영상 모델
- [Runway Gen-4 References](https://help.runwayml.com/hc/en-us/articles/40042718905875-Creating-with-Gen-4-Image-References)
- [Pika Scene Ingredients](https://pika-art.net/scene-ingredients/)
- [Kling AI Multi-Image Reference](https://ir.kuaishou.com/news-releases/news-release-details/kuaishou-kling-ai-unveils-multi-image-reference-feature-further/)
- [Sora 2 Character Creation Guide](https://blog.laozhang.ai/en/posts/sora-2-character-creation-guide)
- [HunyuanVideo-I2V (GitHub)](https://github.com/Tencent-Hunyuan/HunyuanVideo-I2V)
- [HunyuanCustom](https://hunyuancustom.github.io/)

### 학술/기타
- [BLIP-Diffusion](https://arxiv.org/abs/2305.14720)
- [OmniGen2](https://vectorspacelab.github.io/OmniGen2/)

---

## 15. 결론

VLM으로 참조 이미지를 자유 설명하는 것은 B2B 프로덕션 파이프라인에서 지속 불가능하다.
업계의 성공적인 시스템들은 예외 없이 다음 전략을 채택했다.

1. **스타일/주제/구조 3축 분리** — 참조를 하나로 뭉치지 않고 용도별 슬롯
2. **재현 가능한 ID 체계** — 숫자 코드, 이름 바인딩, LoRA 파일 등 deterministic hash
3. **closed-world 토큰 공간** — VLM을 ingress로만, 저장은 구조화된 토큰
4. **모듈 조합** — LoRA + IP-Adapter + ControlNet의 독립 가중치 스택

Tale Studio의 Knowledge DB + Taxonomy 방향은 이 업계 수렴점과 완전히 일치한다.
문제는 "VLM을 어디까지 쓸 것인가"가 아니라 "VLM 출력을 **어떻게 Knowledge DB 토큰으로 클램프할 것인가**"다.

다음 단계: L3 Prompt Builder의 **3축 분리 계약(style/subject/structure)**을 specs에 명시하고, 참조 이미지 ingress 파이프라인이 VLM → Knowledge DB 토큰 매핑 JSON을 출력하도록 아키텍처를 확정하는 것.
