# Architecture Spec

> 상세 MVP 스펙: [specs/mvp.md](./mvp.md)

## 개요

AI 기반 영상 생성 파이프라인. T2V(Text-to-Video)와 T2I2V(Text-to-Image-to-Video)를 혼용하여 일관성 있는 영상 생성.

## 용어 정의

| 용어 | 정의 |
|------|------|
| **Story** | 전체 스토리 (1개 영상 프로젝트) |
| **Scene** | 시간/장소가 동일한 연속 장면 (여러 Shot으로 구성) |
| **Shot** | 최소 생성 단위 = API 호출 1회 = ~8초 영상 |

**MVP 목표**: 2분 영상 = 15개 Shot = 3-5개 Scene

## 핵심 원칙

1. **모델은 API로** - 로컬 모델 X, 외부 API 활용
2. **3-Level 구조** - 점진적 구체화 (Scene → Shot → Prompt)
3. **일관성 우선** - 캐릭터/스타일 일관성을 위한 Asset 관리
4. **LLM 우선 + 패턴 축적** - 템플릿 없이 시작, 실험하며 패턴화

---

## 3-Level Architecture

```
Level 1: Scene Architect
├── 스토리 → 씬 분할
├── 캐릭터/로케이션 정의
└── Act 구조 배분

Level 2: Shot Template
├── 씬 → 샷 시퀀스 생성
├── 촬영 기법 선택 (wide, cu, ots 등)
└── 생성 방식 결정 (T2V vs I2V)

Level 3: Prompt Builder
├── 샷 → 최종 프롬프트 생성
├── DB 기반 cinematography 주입
└── 캐릭터 fixed_prompt 결합
```

---

## 디렉토리 구조

> Clean Architecture 기반 구조

```
tale/
├── domain/                # 핵심 도메인 (엔티티, 값 객체)
│   ├── entities/
│   │   ├── ava/           # AVA Framework 엔티티
│   │   │   ├── anchor.py      # Anchor (NarrativeCore, EmotionalCore, StructuralCore)
│   │   │   └── expression.py  # Expression (World, Actor, Style)
│   │   ├── music/         # 음악 메타데이터
│   │   ├── scene.py       # Scene 엔티티
│   │   ├── shot.py        # Shot 엔티티
│   │   ├── character.py   # Character 엔티티
│   │   └── prompt.py      # Prompt 엔티티
│   ├── value_objects/
│   │   ├── ava/           # Mood, BridgeMode, EmotionalArc
│   │   ├── shot_type.py
│   │   ├── scene_type.py
│   │   └── duration.py
│   └── exceptions.py
│
├── usecases/              # 비즈니스 로직 (3-Level Pipeline)
│   ├── scene_architect.py     # L1: 스토리 → 씬 분할
│   ├── shot_composer.py       # L2: 씬 → 샷 시퀀스
│   ├── prompt_builder.py      # L3: 샷 → 최종 프롬프트
│   ├── ava/                   # AVA Framework 유스케이스
│   │   ├── bridge_translator.py   # Anchor → Expression
│   │   └── expression_adapter.py  # Expression → SceneArchitectInput
│   ├── music/
│   │   └── music_to_anchor.py     # MusicMetadata → Anchor
│   ├── music_to_video_adapter.py  # Facade (Music → Video 전체 흐름)
│   └── interfaces/            # 포트 (추상 인터페이스)
│       ├── llm_gateway.py
│       ├── video_generator.py
│       ├── image_generator.py
│       ├── knowledge_db.py
│       └── asset_repository.py
│
├── adapters/              # 외부 시스템 어댑터
│   ├── gateways/          # API 클라이언트
│   │   ├── gemini_llm.py      # Google Gemini
│   │   ├── openai_llm.py      # OpenAI GPT
│   │   ├── veo_video.py       # Google Veo (T2V/I2V)
│   │   └── imagen_image.py    # Google Imagen (T2I)
│   ├── knowledge_db/      # Knowledge DB 구현체
│   │   ├── yaml_knowledge_db.py
│   │   └── supabase_knowledge_db.py
│   └── repositories/      # 저장소 구현체
│       └── file_repository.py
│
├── infrastructure/        # 설정, CLI
│   ├── settings.py
│   ├── api_key_pool.py
│   └── cli.py
│
├── scripts/               # 실행 스크립트
│   ├── run_pipeline.py
│   ├── run_ava_pipeline.py
│   └── seed_knowledge_db.py
│
├── databases/             # Knowledge DB 데이터
│   └── knowledge/
│       ├── camera_language.yaml
│       ├── rendering_style.yaml
│       └── shot_grammar.yaml
│
├── assets/                # Global Assets
│   ├── characters/
│   ├── lore/              # 테스트용 입력 데이터 (AVA 기반)
│   └── locations/
│
├── generated_videos/      # 생성된 영상
├── specs/                 # 스펙 문서
├── tests/                 # 테스트
├── BUGS.md
├── PROGRESS.md
└── CLAUDE.md
```

---

## API 선택 (확정)

| 용도 | API | 비고 |
|------|-----|------|
| **T2V/I2V** | Veo (Google) | 메인 영상 생성 |
| **T2I** | DALL-E 3 (OpenAI) | 캐릭터 레퍼런스 이미지 |

### 일관성 전략

- 캐릭터당 **멀티 앵글 3장** (정면/측면/3quarter)
- L1에서 **Fixed Prompt** 정의 → 모든 샷에 주입
- 캐릭터 포함 샷: **I2V**, 배경/분위기 샷: **T2V**

---

## 핵심 흐름

```
[사용자 입력]
    ↓
[Level 1] SceneArchitect
    → scene_manifest.yaml
    → character_sheet.yaml + reference images (T2I)
    ↓
[Level 2] ShotTemplateEngine
    → shot_sequences/*.yaml
    ↓
[Level 3] PromptBuilder
    → prompts/*.txt
    ↓
[VideoGenerator]
    → T2V or I2V API 호출
    → generated_videos/*.mp4
    ↓
[EvaluationManager]
    → 품질 평가 → 재생성 또는 완료
```

---

## MVP 실험 계획

### L2 A/B 테스트

| 경로 | 접근 |
|------|------|
| **A: 최소 템플릿** | dialogue, action, atmosphere 3개 템플릿 |
| **B: LLM 우선** | 템플릿 없이 LLM이 직접 샷 구성 |

→ 동일 입력으로 두 경로 비교 → 데이터 기반 결정

---

## 미결정/후속 사항

- [x] API 선택 확정 → Veo + DALL-E 3
- [x] 일관성 전략 → 멀티앵글 3장 + Fixed Prompt
- [ ] 비용 구조 분석 (실제 생성 후 측정)
- [ ] 피드백 루프 고도화 (기존 시스템 연동)
- [ ] L2 템플릿 vs LLM 우선 최종 결정 (A/B 실험 후)
- [ ] L3 DB 확장 범위 (실험 결과에 따라)
