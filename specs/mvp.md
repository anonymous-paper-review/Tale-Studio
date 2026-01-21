# MVP Spec - Tale Video Generation Pipeline

## 개요

2분 분량의 AI 영상 생성 파이프라인 MVP.
LLM 우선 접근 + 실험 기반 패턴 축적 전략.

---

## 용어 정의

| 용어 | 정의 | 예시 |
|------|------|------|
| **Story** | 전체 스토리 (1개 영상 프로젝트) | "기사가 용을 물리치는 이야기" |
| **Scene** | 시간/장소가 동일한 연속 장면 단위 | "성 안 대화 장면", "전투 장면" |
| **Shot** | 하나의 컷 = API 호출 1회 = ~8초 영상 | wide shot, close-up 등 |

```
Story (1개)
  └── Scene (3-5개)
        └── Shot (3-5개/씬)
              = ~8초 영상
```

**핵심**: Shot이 최소 생성 단위. 여러 Shot을 이어붙여 Scene, Scene들을 이어붙여 최종 영상.

---

## 핵심 결정 사항

### 입출력

| 항목 | 결정 |
|------|------|
| 입력 형태 | 자유 줄글 (사용자가 자연어로 스토리 입력) |
| 출력 규모 | **2분 (120초) = 15개 샷** |
| 샷당 길이 | ~8초 (Veo API 기본) |
| 씬 구성 | 3-5개 씬, 씬당 3-5개 샷 |
| 자동화 레벨 | MVP는 완전 자동, 피드백 루프는 후속 고도화 |

### API 선택

| 용도 | API | 비고 |
|------|-----|------|
| T2V/I2V | **Veo (Google)** | 메인 영상 생성 |
| T2I | **DALL-E 3 (OpenAI)** | 캐릭터 레퍼런스 이미지 |

### 일관성 전략

- 캐릭터당 **멀티 앵글 3장** 생성 (정면/측면/3quarter)
- L1에서 **Fixed Prompt** 정의 → 모든 샷에 주입
- 캐릭터 포함 샷은 **I2V**, 배경/분위기 샷은 **T2V**

### 실패 처리

| 상황 | 대응 |
|------|------|
| API 호출 실패 | 자동 재시도 3회 (exponential backoff) |
| 품질 불량 | 기존 피드백 루프 고도화 후 적용 (후속) |

---

## 3-Level 구조 MVP 접근

### 핵심 전략: A/B 실험

```
[경로 A: 최소 템플릿]     vs     [경로 B: LLM 우선]
L2에서 템플릿 선택              L2 없이 LLM 직접 구성
```

두 경로 모두 구현 → 비교 평가 → 데이터 기반 결정

---

### Level 1: Scene Architect

**역할**: 스토리 → 씬 분할 + 일관성 앵커 정의

| 출력물 | 내용 |
|--------|------|
| scene_manifest.yaml | 씬 목록, 유형, 길이, Act 배분 |
| character_sheet.yaml | 캐릭터 ID, Fixed Prompt, 레퍼런스 이미지 경로 |
| location_sheet.yaml | 로케이션 정의 |

**구현**: LLM 기반 (GPT-4 또는 Claude)

---

### Level 2: Shot Template (A/B 실험)

**경로 A - 최소 템플릿**:
```yaml
templates:
  - dialogue_2person    # 2인 대화 기본형
  - action_chase        # 추격씬
  - atmosphere_space    # 공간/분위기 전달
```

**경로 B - LLM 우선**:
- 템플릿 없이 LLM이 씬 정보 보고 직접 샷 구성
- 결과 로깅 → 패턴 추출 → 후속 템플릿화

**공통 출력물**: shot_sequence.yaml (샷 리스트, T2V/I2V 결정)

---

### Level 3: Prompt Builder

**MVP 범위**: 최소 DB

```yaml
db_structure:
  camera_shots:
    - ECU, CU, MS, Full, Wide, EWS
    - angle: High, Low, Eye-level, Dutch
    - movement: Pan, Tilt, Dolly, Tracking, Handheld

  lighting_presets:
    - natural: Sun, Golden hour, Overcast
    - artificial: Neon, Practical, Studio
    - quality: Hard, Soft, Rim
```

**확장 계획**: 실험 결과에 따라 atmosphere, film_look 등 추가

---

## 실험 설계

### A/B 테스트 구조

```
동일 입력 (3분 스토리)
        ↓
    ┌─────────────────────────────────┐
    │                                 │
    ▼                                 ▼
[경로 A: 최소 템플릿]         [경로 B: LLM 우선]
    │                                 │
    ▼                                 ▼
[영상 생성]                   [영상 생성]
    │                                 │
    └─────────┬───────────────────────┘
              ▼
       [비교 평가]
```

### 평가 기준

| 기준 | 측정 방법 |
|------|----------|
| 품질 | 주관적 평가 (1-5점) |
| 일관성 | 캐릭터 유지율 |
| 비용 | API 호출 비용 |
| 시간 | 총 생성 시간 |
| 재생성율 | 품질 불량으로 재생성한 비율 |

### 테스트 범위

- 스토리: 1개 (2분 분량)
- 씬: 3-5개
- 샷: 15개 (씬당 3-5개)

---

## 디렉토리 구조

```
tale/
├── pipeline/
│   ├── main_pipeline.py
│   ├── level1_scene_architect.py
│   ├── level2_shot_template.py      # 경로 A
│   ├── level2_llm_direct.py         # 경로 B
│   ├── level3_prompt_builder.py
│   ├── video_generator.py
│   ├── asset_manager.py
│   └── reference_generator.py
│
├── assets/
│   └── characters/
│       ├── character_sheet.yaml
│       └── references/
│
├── databases/
│   ├── camera_shots.yaml
│   ├── lighting_presets.yaml
│   └── templates/                   # 경로 A용
│       ├── dialogue_2person.yaml
│       ├── action_chase.yaml
│       └── atmosphere_space.yaml
│
├── scenes/
│   ├── scene_manifest.yaml
│   ├── shot_sequences/
│   └── prompts/
│
├── generated_videos/
│
├── logs/                            # 실험 로깅
│   ├── path_a_results.json
│   └── path_b_results.json
│
└── experiments/
    └── ab_comparison.md
```

---

## 후속 계획

### Phase 2: 패턴 추출
- 실험 로그 분석
- 자주 나오는 샷 패턴 → 템플릿화
- 효과적인 프롬프트 워딩 → DB 추가

### Phase 3: 피드백 루프 고도화
- 기존 피드백 시스템 통합
- 자동 품질 평가 (VBench 등)
- 재생성 로직 자동화

### Phase 4: 도메인 전문가 피드백
- 인터랙티브 확인 지점 추가
- 씬 분할 확인 → 샷 구성 확인 → 최종 확인

---

## 변경 이력

| 날짜 | 내용 |
|------|------|
| 2026-01-17 | 스펙 인터뷰 기반 초안 작성 |
| 2026-01-17 | 용어 정의 추가 (Story/Scene/Shot), 목표 2분(15샷)으로 확정 |
