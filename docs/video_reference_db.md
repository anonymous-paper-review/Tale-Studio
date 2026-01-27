# Video Reference DB

영상 레퍼런스를 저장하고 Knowledge DB와 연결하는 시스템.

## 개요

Video Reference DB는 영상 학습 및 기법 추출을 위한 통합 데이터베이스입니다.

- **목적**: 좋은 영상의 촬영 기법을 분석하여 Knowledge DB의 프롬프트 생성에 활용
- **구조**: Supabase (PostgreSQL) 기반 영상 및 샷 분석 저장소
- **연결**: Knowledge DB(YAML)의 technique과 soft reference로 연결

## 아키텍처

```
┌────────────────────────────────────┐
│   Video Reference DB (Supabase)    │
│                                    │
│  ├─ videos                         │
│  │  └─ YouTube, Vimeo, Local 영상  │
│  │                                 │
│  └─ shot_analysis                  │
│     └─ 샷별 촬영 기법 분석          │
│        (technique_id 연결)          │
│                                    │
└────────────────┬───────────────────┘
                 │
                 │ technique_id
                 ↓
┌────────────────────────────────────┐
│   Knowledge DB (YAML)              │
│                                    │
│  ├─ camera_language.yaml           │
│  ├─ rendering_style.yaml           │
│  └─ shot_grammar.yaml              │
└────────────────────────────────────┘
```

## 설정

### 1. 환경 변수 설정

`.env` 파일에 Supabase 자격증명을 추가합니다:

```bash
# Supabase 프로젝트 URL
SUPABASE_URL=https://your-project.supabase.co

# Supabase Service Role Key (admin 권한)
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5...
```

**참고**: Service Role Key는 환경변수로만 관리하고, 절대 코드에 하드코딩하지 마세요.

### 2. Supabase 마이그레이션

Supabase Dashboard > SQL Editor에서 마이그레이션 실행:

```bash
# 또는 CLI 사용
supabase db push
```

또는 직접 SQL 스크립트 실행:

```bash
psql $DATABASE_URL < databases/migrations/001_video_reference.sql
```

### 3. Python 의존성

```bash
pip install supabase
```

## 사용법

### 기본 사용 - 영상 등록

```python
from adapters.video_reference_db import SupabaseVideoReferenceDB
from domain.entities.video_reference import Video

# 1. DB 연결
video_db = SupabaseVideoReferenceDB.from_env()

# 2. 영상 등록
video = Video(
    title="Blade Runner - Opening Scene",
    source_url="https://youtube.com/watch?v=eRvfxWRi6qQ",
    platform="youtube",
    genre="sci-fi",
    director="Ridley Scott",
    year=1982,
    tags=["noir", "cyberpunk", "cinematography"],
    duration_seconds=150.0,
)
video = video_db.add_video(video)
print(f"영상 등록됨: {video.id}")
```

### 샷 분석 추가

```python
from domain.entities.video_reference import ShotAnalysis
from uuid import UUID

# 1. 샷 분석 생성
analysis = ShotAnalysis(
    video_id=video.id,
    start_time=0.0,
    end_time=15.5,
    technique_category="camera_language",
    technique_id="crane_ascend",
    confidence=0.85,
    llm_reasoning="Opens with dramatic crane shot over cityscape",
)

# 2. DB에 저장
analysis = video_db.add_shot_analysis(analysis)
print(f"샷 분석 저장됨: {analysis.id}")
```

### 배치 저장

여러 샷 분석을 한 번에 저장:

```python
analyses = [
    ShotAnalysis(
        video_id=video.id,
        start_time=15.5,
        end_time=30.2,
        technique_category="rendering_style",
        technique_id="neon_glow",
        confidence=0.92,
    ),
    ShotAnalysis(
        video_id=video.id,
        start_time=30.2,
        end_time=45.0,
        technique_category="shot_grammar",
        technique_id="silhouette_reveal",
        confidence=0.78,
    ),
]

saved_analyses = video_db.add_shot_analyses_batch(analyses)
print(f"{len(saved_analyses)}개 샷 분석 저장됨")
```

### 영상 조회

```python
# 1. ID로 조회
video = video_db.get_video(video.id)
print(f"영상: {video.title} ({video.platform})")

# 2. 조건부 검색
reviewed_videos = video_db.list_videos(
    status="reviewed",
    genre="sci-fi",
    limit=10,
)
print(f"검수 완료된 Sci-Fi 영상: {len(reviewed_videos)}개")

# 3. 태그 검색
noir_videos = video_db.list_videos(
    tags=["noir"],
    limit=20,
)
```

### 샷 분석 조회

```python
# 특정 영상의 모든 샷 분석 조회
shots = video_db.get_shots_by_video(video.id)

for shot in shots:
    print(f"{shot.start_time}s - {shot.end_time}s: {shot.technique_id} (confidence: {shot.confidence})")
```

### 검수 처리

```python
# 샷 분석을 검수 완료 처리
verified_shot = video_db.verify_shot(
    shot_id=analysis.id,
    verified_by="reviewer@example.com",
    notes="확인됨, 정확한 기법 분석",
)

print(f"검수 완료: {verified_shot.verified_at}")
```

### 기법으로 레퍼런스 검색

Knowledge DB와 연결하여 특정 기법의 레퍼런스 영상 찾기:

```python
# camera_language의 "handheld" 기법을 사용한 영상 샷들 조회
references = video_db.find_references_by_technique(
    category="camera_language",
    technique_id="handheld",
    verified_only=True,  # 검수 완료된 것만
    min_confidence=0.8,  # 신뢰도 80% 이상
    limit=5,
)

for ref in references:
    print(f"영상 {ref.video_id}: {ref.start_time}s - {ref.end_time}s")
    print(f"  신뢰도: {ref.confidence}")
    print(f"  분석: {ref.llm_reasoning}")
```

## 테이블 구조

### videos

영상 메타데이터를 저장합니다.

| 컬럼 | 타입 | 설명 | 제약 |
|------|------|------|------|
| id | UUID | Primary Key | NOT NULL |
| title | TEXT | 영상 제목 | NOT NULL |
| source_url | TEXT | YouTube/Vimeo/Local URL | NOT NULL |
| platform | TEXT | `youtube`, `vimeo`, `local` | NOT NULL |
| duration_seconds | FLOAT | 영상 길이 (초) | nullable |
| genre | TEXT | 장르 (sci-fi, drama, etc.) | nullable |
| director | TEXT | 감독명 | nullable |
| year | INTEGER | 제작 연도 | nullable |
| tags | TEXT[] | 태그 배열 (noir, cyberpunk, etc.) | default `[]` |
| thumbnail_url | TEXT | 썸네일 URL | nullable |
| notes | TEXT | 메모 | nullable |
| status | TEXT | `pending`, `analyzed`, `reviewed`, `archived` | default `pending` |
| created_at | TIMESTAMPTZ | 생성 시간 | NOT NULL |
| updated_at | TIMESTAMPTZ | 수정 시간 | NOT NULL |

**인덱스**:
- `idx_videos_status` - 상태로 빠른 조회
- `idx_videos_genre` - 장르로 빠른 조회
- `idx_videos_tags` - 태그 검색 (GIN 인덱스)

### shot_analysis

샷별 촬영 기법 분석을 저장합니다. Knowledge DB의 technique과 soft reference로 연결됩니다.

| 컬럼 | 타입 | 설명 | 제약 |
|------|------|------|------|
| id | UUID | Primary Key | NOT NULL |
| video_id | UUID | FK → videos | NOT NULL, CASCADE |
| start_time | FLOAT | 샷 시작 시간 (초) | NOT NULL |
| end_time | FLOAT | 샷 종료 시간 (초) | NOT NULL |
| technique_category | TEXT | `camera_language`, `rendering_style`, `shot_grammar` | NOT NULL |
| technique_id | TEXT | Knowledge DB의 technique id | NOT NULL |
| confidence | FLOAT | LLM 신뢰도 점수 | 0-1 범위 |
| llm_reasoning | TEXT | 기법 분석 이유 | nullable |
| human_verified | BOOLEAN | 검수 완료 여부 | default `false` |
| human_notes | TEXT | 검수자 메모 | nullable |
| verified_by | TEXT | 검수자 이메일/이름 | nullable |
| verified_at | TIMESTAMPTZ | 검수 완료 시간 | nullable |
| additional_tags | TEXT[] | 추가 태그 | default `[]` |
| created_at | TIMESTAMPTZ | 생성 시간 | NOT NULL |
| updated_at | TIMESTAMPTZ | 수정 시간 | NOT NULL |

**제약**:
- `valid_time_range`: `end_time > start_time`
- `valid_confidence`: confidence가 NULL이거나 0-1 범위

**인덱스**:
- `idx_shot_analysis_video_id` - 영상별 샷 검색
- `idx_shot_analysis_technique` - 기법으로 빠른 검색
- `idx_shot_analysis_verified` - 검수 상태로 필터링

### analysis_jobs

영상 분석 작업의 진행 상황을 추적합니다.

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | UUID | Primary Key |
| video_id | UUID | FK → videos |
| status | TEXT | `queued`, `processing`, `completed`, `failed` |
| error_message | TEXT | 에러 메시지 (실패 시) |
| llm_model | TEXT | 사용한 LLM 모델명 (e.g., "gemini-2.0-flash") |
| prompt_version | TEXT | 분석 프롬프트 버전 |
| shots_found | INTEGER | 발견된 샷 수 |
| techniques_found | INTEGER | 발견된 기법 수 |
| started_at | TIMESTAMPTZ | 시작 시간 |
| completed_at | TIMESTAMPTZ | 완료 시간 |
| created_at | TIMESTAMPTZ | 생성 시간 |

## 워크플로우

영상 분석의 일반적인 워크플로우입니다:

```
1. 영상 등록
   └─ Video(status="pending") 추가

2. LLM 분석
   └─ 영상의 샷들을 분석하여 ShotAnalysis 추가
   └─ Video(status="analyzed") 업데이트

3. 인간 검수
   └─ verify_shot() 호출로 각 샷 검수 완료
   └─ Video(status="reviewed") 업데이트

4. 활용
   └─ find_references_by_technique()로 기법별 레퍼런스 조회
   └─ Prompt Builder에서 참고
```

상태 전이도:

```
pending ──→ analyzed ──→ reviewed ──→ archived
  │           │           │
  └─ 초기     └─ LLM      └─ 최종
     등록        분석        검수
```

## Knowledge DB 연결

`shot_analysis.technique_id`가 Knowledge DB YAML의 `id`와 매칭됩니다.

### 예시

Knowledge DB의 technique 정의:

```yaml
# databases/knowledge/camera_language.yaml
- id: handheld
  name: Handheld Camera
  prompt_fragment: "handheld camera with natural shake and imperfect framing"
  emotional_tags: [intimate, spontaneous, urgent]
  mood_intensity: 0.7
```

Supabase shot_analysis 레코드:

```python
{
  "video_id": "550e8400-e29b-41d4-a716-446655440000",
  "start_time": 10.5,
  "end_time": 25.3,
  "technique_category": "camera_language",
  "technique_id": "handheld",  # ← Knowledge DB의 id와 매칭
  "confidence": 0.92,
  "human_verified": True,
}
```

### 쿼리

기법으로 검증된 레퍼런스 찾기:

```python
# camera_language의 "handheld" 기법 찾기
refs = video_db.find_references_by_technique(
    category="camera_language",
    technique_id="handheld",
    verified_only=True,
    min_confidence=0.85,
)

# 결과를 통해 prompt_fragment를 참고
for ref in refs:
    video = video_db.get_video(ref.video_id)
    print(f"예시: {video.title} ({ref.start_time}s - {ref.end_time}s)")
    # prompt_fragment는 Knowledge DB에서 별도 조회
```

## 모범 사례

### 1. 신뢰도 필터링

LLM 분석은 완벽하지 않으므로, 최종 프롬프트에는 검수된 고신뢰 샷만 사용:

```python
high_confidence_refs = video_db.find_references_by_technique(
    category="camera_language",
    technique_id="crane_ascend",
    verified_only=True,
    min_confidence=0.9,  # 90% 이상만
    limit=3,
)
```

### 2. 배치 작업

많은 영상을 분석할 때는 배치 API 사용:

```python
analyses = [...]  # 100개의 ShotAnalysis
saved = video_db.add_shot_analyses_batch(analyses)
print(f"저장됨: {len(saved)}개")
```

### 3. 상태 관리

영상 분석의 진행 상황을 추적:

```python
# 분석 시작
video = video_db.get_video(video_id)
assert video.status == "pending"

# 분석 후
video_db.update_video_status(video_id, "analyzed")

# 검수 완료 후
video_db.update_video_status(video_id, "reviewed")
```

### 4. 에러 처리

```python
from supabase.lib.client_options import ClientOptions

try:
    video_db = SupabaseVideoReferenceDB.from_env()
except KeyError as e:
    print(f"환경변수 누락: {e}")
    raise

try:
    video = video_db.add_video(invalid_video)
except Exception as e:
    print(f"영상 등록 실패: {e}")
```

## 문제 해결

### "SUPABASE_URL not found" 에러

`.env` 파일에 Supabase 자격증명이 없습니다.

```bash
# 확인
echo $SUPABASE_URL
echo $SUPABASE_SERVICE_KEY

# .env 파일 설정
cat .env
```

### "Invalid time range" 에러

`end_time`이 `start_time`보다 작거나 같습니다.

```python
# 잘못된 예
analysis = ShotAnalysis(
    start_time=15.0,
    end_time=15.0,  # ❌ 같은 시간
)

# 올바른 예
analysis = ShotAnalysis(
    start_time=15.0,
    end_time=25.5,  # ✓ end_time이 더 큼
)
```

### "Confidence out of range" 에러

confidence가 0-1 범위를 벗어납니다.

```python
# 잘못된 예
analysis = ShotAnalysis(
    confidence=1.5,  # ❌ 1을 초과
)

# 올바른 예
analysis = ShotAnalysis(
    confidence=0.85,  # ✓ 0-1 범위
)
```

## API 메서드 레퍼런스

### Video CRUD

```python
# 영상 추가
video = video_db.add_video(video: Video) -> Video

# 영상 조회
video = video_db.get_video(video_id: UUID) -> Optional[Video]

# 영상 상태 업데이트
video_db.update_video_status(video_id: UUID, status: str) -> None

# 영상 목록 조회
videos = video_db.list_videos(
    status: Optional[str] = None,
    genre: Optional[str] = None,
    tags: Optional[list[str]] = None,
    limit: int = 50,
    offset: int = 0,
) -> list[Video]

# 영상 삭제
deleted = video_db.delete_video(video_id: UUID) -> bool
```

### ShotAnalysis CRUD

```python
# 샷 분석 추가
analysis = video_db.add_shot_analysis(analysis: ShotAnalysis) -> ShotAnalysis

# 샷 분석 배치 추가
analyses = video_db.add_shot_analyses_batch(analyses: list[ShotAnalysis]) -> list[ShotAnalysis]

# 영상의 샷 분석 조회
shots = video_db.get_shots_by_video(video_id: UUID) -> list[ShotAnalysis]

# 샷 검수 완료 처리
shot = video_db.verify_shot(
    shot_id: UUID,
    verified_by: str,
    notes: Optional[str] = None,
) -> ShotAnalysis
```

### 검색

```python
# 기법으로 레퍼런스 검색
refs = video_db.find_references_by_technique(
    category: str,  # "camera_language", "rendering_style", "shot_grammar"
    technique_id: str,  # e.g., "handheld", "crane_ascend"
    verified_only: bool = False,
    min_confidence: Optional[float] = None,
    limit: int = 10,
) -> list[ShotAnalysis]
```

## 다음 단계

- **LLM 분석 자동화**: 영상 URL을 받으면 자동으로 샷 분석
- **임베딩 기반 검색**: 유사한 촬영 스타일 찾기
- **분석 작업 추적**: analysis_jobs 테이블로 진행 상황 모니터링
