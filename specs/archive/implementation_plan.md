# Implementation Plan - TDD + Clean Architecture

## Clean Architecture 레이어 구조

```
tale/
├── domain/                    # 핵심 비즈니스 로직 (의존성 없음)
│   ├── entities/              # 도메인 엔티티
│   │   ├── scene.py
│   │   ├── shot.py
│   │   ├── character.py
│   │   ├── prompt.py
│   │   └── video.py
│   ├── value_objects/         # 값 객체
│   │   ├── duration.py
│   │   ├── shot_type.py
│   │   └── generation_method.py
│   └── exceptions.py          # 도메인 예외
│
├── usecases/                  # 애플리케이션 비즈니스 규칙
│   ├── scene_architect.py     # Level 1: 스토리 → 씬 분할
│   ├── shot_composer.py       # Level 2: 씬 → 샷 구성
│   ├── prompt_builder.py      # Level 3: 샷 → 프롬프트
│   ├── video_generator.py     # 영상 생성 오케스트레이션
│   └── interfaces/            # UseCase가 의존하는 인터페이스 (Port)
│       ├── llm_gateway.py     # LLM 호출 인터페이스
│       ├── image_generator.py # T2I 인터페이스
│       ├── video_generator.py # T2V/I2V 인터페이스
│       └── asset_repository.py # Asset 저장소 인터페이스
│
├── adapters/                  # 인터페이스 어댑터 (Adapter)
│   ├── gateways/              # 외부 서비스 어댑터
│   │   ├── openai_llm.py      # OpenAI GPT 어댑터
│   │   ├── dalle_image.py     # DALL-E 3 어댑터
│   │   └── veo_video.py       # Veo 어댑터
│   ├── repositories/          # 데이터 저장소 어댑터
│   │   ├── yaml_asset_repo.py # YAML 기반 Asset 저장소
│   │   └── file_video_repo.py # 파일 기반 Video 저장소
│   └── presenters/            # 출력 포맷터
│       └── manifest_presenter.py
│
├── infrastructure/            # 프레임워크 & 드라이버
│   ├── config/                # 설정
│   │   ├── settings.py
│   │   └── api_keys.py        # 환경변수 로드
│   ├── cli/                   # CLI 진입점
│   │   └── main.py
│   └── logging/               # 로깅
│       └── experiment_logger.py
│
├── tests/                     # 테스트
│   ├── unit/                  # 단위 테스트
│   │   ├── domain/
│   │   └── usecases/
│   ├── integration/           # 통합 테스트
│   │   └── adapters/
│   └── e2e/                   # E2E 테스트
│       └── pipeline/
│
└── databases/                 # 정적 데이터 (L3 DB)
    ├── camera_shots.yaml
    ├── lighting_presets.yaml
    └── templates/             # L2 템플릿 (경로 A)
```

---

## 의존성 규칙

```
Infrastructure → Adapters → UseCases → Domain
     ↓              ↓           ↓          ↓
  외부 세계      변환 계층    비즈니스    순수 로직
  (API, CLI)    (구현체)     (규칙)     (엔티티)
```

**핵심**: 안쪽 레이어는 바깥 레이어를 절대 모름

---

## TDD 구현 순서 (Inside-Out)

### Phase 1: Domain Layer (Day 1)

순수 Python, 외부 의존성 없음.

```
1.1 Scene 엔티티
    - test: Scene 생성, 유효성 검증
    - impl: Scene(id, type, duration, characters, location)

1.2 Shot 엔티티
    - test: Shot 생성, generation_method 결정 로직
    - impl: Shot(id, type, duration, characters, method)

1.3 Character 엔티티
    - test: Character 생성, fixed_prompt 생성
    - impl: Character(id, name, age, description, references)

1.4 Prompt 엔티티
    - test: Prompt 조합 로직
    - impl: Prompt(shot_info, character_prompt, cinematography)

1.5 Value Objects
    - test: Duration(초→분 변환), ShotType(유효 타입 검증)
    - impl: 불변 값 객체들
```

### Phase 2: UseCase Layer (Day 2-3)

비즈니스 로직, 인터페이스에만 의존.

```
2.1 SceneArchitect UseCase (Level 1)
    - test: 스토리 입력 → Scene 리스트 출력
    - mock: LLMGateway
    - impl: analyze_story(), define_characters(), split_scenes()

2.2 ShotComposer UseCase (Level 2)
    경로 A:
    - test: Scene + Template → Shot 리스트
    - impl: TemplateBasedComposer

    경로 B:
    - test: Scene → Shot 리스트 (LLM 직접)
    - mock: LLMGateway
    - impl: LLMDirectComposer

2.3 PromptBuilder UseCase (Level 3)
    - test: Shot + Character + DB → Prompt
    - impl: build_prompt(), inject_cinematography()

2.4 VideoGenerator UseCase (오케스트레이션)
    - test: 전체 파이프라인 흐름
    - mock: ImageGenerator, VideoGenerator
    - impl: generate_video(), handle_retry()
```

### Phase 3: Adapter Layer (Day 4-5)

외부 서비스 연동, 실제 API 호출.

```
3.1 OpenAI LLM Gateway
    - test: API 호출 → 응답 파싱 (mock 서버)
    - impl: call_gpt4(), parse_scene_response()

3.2 DALL-E Image Generator
    - test: 프롬프트 → 이미지 URL (mock)
    - impl: generate_reference(), save_image()

3.3 Veo Video Generator
    - test: 프롬프트 + 이미지 → 비디오 (mock)
    - impl: generate_t2v(), generate_i2v(), poll_status()

3.4 YAML Asset Repository
    - test: 저장/로드
    - impl: save_character(), load_manifest()
```

### Phase 4: Integration & E2E (Day 6-7)

```
4.1 통합 테스트
    - Adapter + UseCase 연동
    - 실제 API 호출 (작은 샘플)

4.2 E2E 테스트
    - CLI → 전체 파이프라인 → 비디오 출력
    - A/B 실험 프레임워크
```

---

## 테스트 전략

### 테스트 피라미드

```
        /\
       /  \     E2E (소수, 느림, 비용 높음)
      /----\
     /      \   Integration (API mock)
    /--------\
   /          \ Unit (다수, 빠름, 격리됨)
  /------------\
```

### 테스트 더블 전략

| 레이어 | 테스트 대상 | Mock 대상 |
|--------|------------|-----------|
| Domain | 엔티티, 값 객체 | 없음 (순수) |
| UseCase | 비즈니스 로직 | Gateway, Repository |
| Adapter | API 호출 | 외부 API (httpx mock) |
| E2E | 전체 흐름 | 최소화 (실제 호출 포함) |

### 커버리지 목표

| 레이어 | 목표 커버리지 |
|--------|--------------|
| Domain | 95%+ |
| UseCase | 90%+ |
| Adapter | 80%+ |
| E2E | 핵심 경로 |

---

## 구현 우선순위

### Must Have (MVP)

1. **Domain**: Scene, Shot, Character, Prompt 엔티티
2. **UseCase**: SceneArchitect, ShotComposer (A/B 모두), PromptBuilder
3. **Adapter**: OpenAI LLM, DALL-E, Veo (기본 연동)
4. **Infra**: CLI 진입점, 기본 로깅

### Nice to Have (후속)

- EvaluationManager (품질 평가)
- 재시도 로직 고도화
- 실험 대시보드

---

## 파일 생성 순서

```
Step 1: 프로젝트 스캐폴딩
├── pyproject.toml (의존성)
├── conftest.py (pytest 설정)
└── 디렉토리 구조 생성

Step 2: Domain 레이어
├── tests/unit/domain/test_scene.py
├── domain/entities/scene.py
├── tests/unit/domain/test_shot.py
├── domain/entities/shot.py
└── ...

Step 3: UseCase 레이어
├── usecases/interfaces/ (Port 정의 먼저)
├── tests/unit/usecases/test_scene_architect.py
├── usecases/scene_architect.py
└── ...

Step 4: Adapter 레이어
├── tests/integration/adapters/test_openai_llm.py
├── adapters/gateways/openai_llm.py
└── ...

Step 5: Infrastructure & E2E
├── infrastructure/cli/main.py
├── tests/e2e/test_pipeline.py
└── ...
```

---

## 기술 스택

| 영역 | 선택 | 이유 |
|------|------|------|
| 언어 | Python 3.11+ | 타입 힌트, asyncio |
| 테스트 | pytest + pytest-asyncio | 표준, async 지원 |
| HTTP | httpx | async 지원, 테스트 용이 |
| 설정 | pydantic-settings | 타입 안전한 설정 |
| CLI | typer | 타입 힌트 기반 CLI |
| 로깅 | structlog | 구조화된 로깅 |

---

## 예상 일정

| Phase | 기간 | 산출물 |
|-------|------|--------|
| 1. Domain | 1일 | 엔티티, 값 객체, 단위 테스트 |
| 2. UseCase | 2일 | L1/L2/L3 비즈니스 로직 |
| 3. Adapter | 2일 | API 연동, 통합 테스트 |
| 4. E2E | 2일 | CLI, 파이프라인, A/B 프레임워크 |
| **총합** | **7일** | MVP 완성 |

---

## 변경 이력

| 날짜 | 내용 |
|------|------|
| 2026-01-17 | 초안 작성 |
