# Tale Studio

AI Video Generation Pipeline using T2V (Text-to-Video) and I2V (Image-to-Video) APIs.

## Overview

Tale Studio transforms story text into video sequences through a 3-level architecture:

```
Story (text) → Scene Architect → Shot Composer → Prompt Builder → Video API → MP4
```

**Target**: 2-minute video = ~15 shots = 3-5 scenes

## Architecture

### 3-Level Pipeline

| Level | Component | Role |
|-------|-----------|------|
| L1 | Scene Architect | Story → Scenes, Characters, Locations |
| L2 | Shot Composer | Scene → Shot sequences, T2V/I2V decision |
| L3 | Prompt Builder | Shot → Final prompt with cinematography |

### Clean Architecture

```
tale/
├── domain/           # Entities & Value Objects (no dependencies)
├── usecases/         # Application logic & interfaces
├── adapters/         # External API implementations
├── infrastructure/   # Settings, CLI, utilities
├── scripts/          # 실행 스크립트
├── specs/            # 스펙 문서
└── tests/            # Unit & integration tests
```

## API Integration

| Purpose | API | Notes |
|---------|-----|-------|
| Video Generation | Google Veo | T2V and I2V (~8s per shot) |
| Image Generation | Google Imagen | Character references |
| LLM | Gemini / OpenAI | Scene analysis, prompt generation |

## Quick Start

### 1. 설치

```bash
# Clone
git clone git@github.com:jxcape/tale-studio.git
cd tale-studio

# Setup (using uv)
uv venv
source .venv/bin/activate
uv pip install -e ".[dev]"
```

### 2. 환경 설정

```bash
cp .env.example .env
```

`.env` 파일 수정:

```bash
# Google API Keys (alias 포함 형식)
# 형식: key:alias 또는 key:alias:project_id
GOOGLE_API_KEYS=AIzaSy...:key1, AIzaSy...:key2

# Google Cloud 설정
GOOGLE_PROJECT_ID=your-project-id
GOOGLE_LOCATION=us-central1

# OpenAI (optional)
OPENAI_API_KEY=sk-...
```

### 3. 파이프라인 실행

```bash
# L1-L2-L3 전체 파이프라인 실행
python scripts/run_pipeline.py

# 출력 위치: pipeline_output/YYYYMMDD_HHMMSS/
```

### 4. 출력 결과

```
pipeline_output/20260121_192652/
├── l1_scenes.json      # L1 씬 분할 결과
├── l2_shots.json       # L2 샷 시퀀스
├── l3_prompts.json     # L3 최종 프롬프트
└── metadata.json       # 실행 메타데이터
```

## Configuration

### 환경 변수

| 변수 | 설명 | 예시 |
|------|------|------|
| `GOOGLE_API_KEYS` | Gemini API 키 (alias 포함) | `AIzaSy...:xcape, AIzaSy...:tale` |
| `GOOGLE_PROJECT_ID` | GCP 프로젝트 ID | `my-project` |
| `GOOGLE_LOCATION` | GCP 리전 | `us-central1` |
| `OPENAI_API_KEY` | OpenAI API 키 (optional) | `sk-...` |
| `VEO_KEY_ROTATION_STRATEGY` | 키 로테이션 전략 | `round_robin` / `least_used` |

### API Key Pool

여러 Google API 키를 등록하면 429 에러 시 자동 failover:

```python
# 내부 동작
key_pool = APIKeyPool(keys=[...], strategy=RotationStrategy.ROUND_ROBIN)
# 키 1 실패 → 자동으로 키 2로 전환
```

## Key Concepts

### Terminology

| Term | Definition |
|------|------------|
| **Story** | Complete narrative (1 video project) |
| **Scene** | Continuous sequence at same time/place |
| **Shot** | Minimum generation unit = 1 API call = ~8s video |

### Consistency Strategy

- Multi-angle character references (front/side/3-quarter)
- Fixed prompts per character injected into all shots
- I2V for character shots, T2V for atmosphere/background

## Development

```bash
# Run tests with coverage
pytest --cov

# Lint
ruff check .

# Format
ruff format .
```

## Video Reference DB

영상 학습 및 기법 추출을 위한 통합 데이터베이스:

- **저장**: YouTube/Vimeo/Local 영상의 메타데이터 및 샷별 분석
- **연결**: Knowledge DB(YAML)의 technique과 soft reference로 연결
- **활용**: Prompt Builder에서 기법별 시각 레퍼런스 제공

### 설정

```bash
# .env에 Supabase 자격증명 추가
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5...
```

자세한 설정 및 사용법은 [Video Reference DB 가이드](docs/video_reference_db.md)를 참고하세요.

## Specs

### 핵심 설계
- [Architecture](specs/architecture.md) - 시스템 아키텍처
- [MVP](specs/mvp.md) - MVP 스코프 및 결정사항

### 기능 스펙
- [Next Phase](specs/next_phase.md) - 다음 단계 로드맵
- [Pumpup](specs/pumpup.md) - 서사 확장 기능
- [Dialogue](specs/dialogue.md) - 대화 생성 기능
- [Technique DB](specs/technique_db.md) - 연출 테크닉 DB

### 스타일 가이드
- [Style Heuristics](specs/style_heuristics.md) - 비주얼 스타일 가이드

### 데이터베이스
- [Video Reference DB](docs/video_reference_db.md) - 영상 레퍼런스 DB 가이드

## Development

```bash
# 테스트 실행
pytest

# 커버리지 포함
pytest --cov

# 린트
ruff check .

# 포맷
ruff format .
```

## License

MIT
