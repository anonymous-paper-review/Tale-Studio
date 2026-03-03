# Technique DB 스펙 (Supabase)

> 최종 수정: 2026-02-02 (Supabase 버전으로 재작성)

## 개요

촬영 테크닉과 영상 레퍼런스를 저장하는 Supabase 기반 DB.
L3 Prompt Builder가 샷 프롬프트 생성 시 참조.

---

## 아키텍처

```
┌─────────────────────────────────────────────────────────┐
│                     Supabase                            │
│  ┌─────────────────┐      ┌─────────────────────────┐  │
│  │ knowledge_      │      │ videos                  │  │
│  │ techniques      │◄─────│ shot_analysis           │  │
│  │ (촬영 기법)     │ soft │ (영상 레퍼런스)         │  │
│  └─────────────────┘ ref  └─────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
         │                           │
         ▼                           ▼
┌─────────────────┐         ┌─────────────────────────┐
│ YAMLKnowledgeDB │         │ SupabaseVideoReferenceDB│
│ (로컬 백업)     │         │                         │
└─────────────────┘         └─────────────────────────┘
```

---

## 1. Knowledge DB (knowledge_techniques)

촬영 테크닉 레퍼런스. L3 Prompt Builder가 mood/shot_type 기반으로 쿼리.

### 테이블 스키마

```sql
CREATE TABLE knowledge_techniques (
  id            BIGSERIAL PRIMARY KEY,
  technique_id  TEXT NOT NULL,           -- 'handheld', 'chiaroscuro' 등
  name          TEXT NOT NULL,           -- 표시 이름
  category      TEXT NOT NULL,           -- 카테고리 (아래 참조)
  prompt_fragment TEXT NOT NULL,         -- Veo 프롬프트에 삽입할 텍스트
  description   TEXT,                    -- 설명 (optional)
  emotional_tags TEXT[] DEFAULT '{}',    -- 감정 기반 검색용
  shot_type_affinity TEXT[] DEFAULT '{}',-- 샷 타입 매칭용
  created_at    TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(category, technique_id)
);

-- 검색 성능을 위한 GIN 인덱스
CREATE INDEX idx_knowledge_emotional_tags ON knowledge_techniques USING GIN (emotional_tags);
CREATE INDEX idx_knowledge_shot_type ON knowledge_techniques USING GIN (shot_type_affinity);
CREATE INDEX idx_knowledge_category ON knowledge_techniques (category);
```

### 카테고리

| category | 설명 | 예시 |
|----------|------|------|
| `camera_language` | 카메라 워크/움직임 | handheld, vertigo, steadicam, dutch_angle |
| `rendering_style` | 렌더링/시각 스타일 | chiaroscuro, film_grain_70s, neon_noir |
| `shot_grammar` | 샷 문법/연출 패턴 | silhouette_reveal, push_in_realization |

### TechniqueEntry 구조

```python
@dataclass
class TechniqueEntry:
    id: str                         # technique_id
    name: str                       # 표시 이름
    prompt_fragment: str            # 프롬프트 조각
    emotional_tags: list[str]       # ['tense', 'intimate', 'chaotic']
    shot_type_affinity: list[str]   # ['CU', 'MS', 'WS']
    description: str                # 설명
```

### 쿼리 인터페이스

```python
class CinematographyKnowledgeDB(ABC):
    @abstractmethod
    def query(
        self,
        category: str,              # "camera_language" | "rendering_style" | "shot_grammar"
        moods: list[str] = None,    # 감정 필터 (overlaps)
        shot_type: str = None,      # 샷 타입 필터 (contains)
        limit: int = 3,
    ) -> list[TechniqueEntry]

    @abstractmethod
    def get_by_id(
        self, category: str, technique_id: str
    ) -> Optional[TechniqueEntry]
```

### 예시 데이터

```yaml
# camera_language
- technique_id: handheld
  name: Handheld Camera
  prompt_fragment: "handheld camera with subtle organic movement"
  emotional_tags: [tense, intimate, chaotic, documentary]
  shot_type_affinity: [CU, MS]
  description: 손으로 든 카메라의 미세한 흔들림

# rendering_style
- technique_id: chiaroscuro
  name: Chiaroscuro Lighting
  prompt_fragment: "dramatic chiaroscuro lighting with deep shadows"
  emotional_tags: [dramatic, mysterious, noir]
  shot_type_affinity: [CU, MS, WS]
  description: 강한 명암 대비의 드라마틱한 조명

# shot_grammar
- technique_id: silhouette_reveal
  name: Silhouette Reveal
  prompt_fragment: "silhouette against bright background, slowly revealing details"
  emotional_tags: [mysterious, dramatic, epic]
  shot_type_affinity: [WS, EWS]
  description: 실루엣에서 점점 디테일이 드러나는 연출
```

---

## 2. Video Reference DB

영상 레퍼런스와 샷 분석 저장. Knowledge DB와 soft reference로 연결.

### videos 테이블

```sql
CREATE TABLE videos (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT NOT NULL,
  url         TEXT,                      -- 원본 URL
  platform    TEXT DEFAULT 'youtube',    -- youtube, vimeo, local
  genre       TEXT,                      -- drama, action, horror 등
  tags        TEXT[] DEFAULT '{}',       -- 검색용 태그
  status      TEXT DEFAULT 'pending',    -- pending → analyzed → reviewed → archived
  duration_seconds INTEGER,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_videos_status ON videos (status);
CREATE INDEX idx_videos_genre ON videos (genre);
CREATE INDEX idx_videos_tags ON videos USING GIN (tags);
```

### shot_analysis 테이블

```sql
CREATE TABLE shot_analysis (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id          UUID NOT NULL REFERENCES videos(id) ON DELETE CASCADE,

  -- 타임스탬프
  start_time        FLOAT NOT NULL,      -- 시작 시간 (초)
  end_time          FLOAT NOT NULL,      -- 종료 시간 (초)

  -- Knowledge DB 연결 (soft reference)
  technique_category TEXT,               -- camera_language, rendering_style, shot_grammar
  technique_id      TEXT,                -- knowledge_techniques.technique_id

  -- 분석 결과
  shot_type         TEXT,                -- WS, MS, CU, ECU 등
  description       TEXT,                -- 샷 설명
  confidence        FLOAT DEFAULT 0.0,   -- 0.0~1.0

  -- 검증
  human_verified    BOOLEAN DEFAULT FALSE,
  verified_by       TEXT,
  verified_at       TIMESTAMPTZ,
  human_notes       TEXT,

  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_shot_video ON shot_analysis (video_id);
CREATE INDEX idx_shot_technique ON shot_analysis (technique_category, technique_id);
CREATE INDEX idx_shot_verified ON shot_analysis (human_verified);
```

### 워크플로우

```
[영상 등록]
    ↓
status: pending
    ↓
[LLM 자동 분석]
    - 프레임 추출
    - 샷 분할
    - 테크닉 매칭
    ↓
status: analyzed
    ↓
[사람 검토]
    - 잘못된 분석 수정
    - human_verified = true
    ↓
status: reviewed
```

### 어댑터 인터페이스

```python
class VideoReferenceDB(ABC):
    # Video CRUD
    def add_video(self, video: Video) -> Video
    def get_video(self, video_id: UUID) -> Optional[Video]
    def update_video_status(self, video_id: UUID, status: str) -> None
    def list_videos(self, status, genre, tags, limit, offset) -> list[Video]

    # ShotAnalysis CRUD
    def add_shot_analysis(self, analysis: ShotAnalysis) -> ShotAnalysis
    def add_shot_analyses_batch(self, analyses: list[ShotAnalysis]) -> list[ShotAnalysis]
    def get_shots_by_video(self, video_id: UUID) -> list[ShotAnalysis]
    def verify_shot(self, shot_id, verified_by, notes) -> ShotAnalysis

    # Knowledge DB 연결
    def find_references_by_technique(
        self,
        category: str,
        technique_id: str,
        verified_only: bool = False,
        min_confidence: float = None,
        limit: int = 10,
    ) -> list[ShotAnalysis]
```

---

## 3. 어댑터 구현

### SupabaseKnowledgeDB

```python
from adapters.knowledge_db import SupabaseKnowledgeDB

# 환경변수에서 생성
db = SupabaseKnowledgeDB.from_env()

# 쿼리
techniques = db.query(
    category="camera_language",
    moods=["tense", "intimate"],
    shot_type="CU",
    limit=3
)

# 특정 ID 조회
technique = db.get_by_id("rendering_style", "chiaroscuro")
```

### YAMLKnowledgeDB (로컬 백업)

```python
from adapters.knowledge_db import YAMLKnowledgeDB

# 로컬 YAML 파일에서 로드
db = YAMLKnowledgeDB("databases/knowledge")

# 동일한 인터페이스
techniques = db.query(category="camera_language", moods=["tense"])
```

### SupabaseVideoReferenceDB

```python
from adapters.video_reference_db import SupabaseVideoReferenceDB

db = SupabaseVideoReferenceDB.from_env()

# 영상 등록
video = db.add_video(Video(title="Reference Film", url="..."))

# 샷 분석 추가
analysis = db.add_shot_analysis(ShotAnalysis(
    video_id=video.id,
    start_time=0.0,
    end_time=5.0,
    technique_category="camera_language",
    technique_id="handheld",
    shot_type="MS",
    confidence=0.85
))

# 테크닉으로 레퍼런스 검색
refs = db.find_references_by_technique(
    category="camera_language",
    technique_id="handheld",
    verified_only=True
)
```

---

## 4. 환경 설정

### 필수 환경변수

```bash
# .env
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_KEY=eyJhbGc...  # Service Role Key (백엔드용)
SUPABASE_ANON_KEY=eyJhbGc...     # Anon Key (클라이언트용, optional)
```

### Supabase 프로젝트

- **Project**: j-xcape's Project
- **Region**: ap-southeast-1
- **Organization**: second-brain

---

## 5. 로컬 YAML 구조 (백업/시딩용)

```
databases/knowledge/
├── camera_language.yaml
├── rendering_style.yaml
└── shot_grammar.yaml
```

각 파일 형식:
```yaml
techniques:
  - id: handheld
    name: Handheld Camera
    prompt_fragment: "handheld camera with subtle organic movement"
    emotional_tags: [tense, intimate, chaotic]
    shot_type_affinity: [CU, MS]
    description: 손으로 든 카메라의 미세한 흔들림
```

---

## 6. 마이그레이션 히스토리

| 날짜 | 내용 |
|------|------|
| 2026-01-22 | 초기 스펙 작성 (JSON 기반) |
| 2026-01-27 | YAML 기반 Knowledge DB 구현 |
| 2026-01-27 | Video Reference DB (Supabase) 추가 |
| 2026-01-28 | Knowledge DB Supabase 이관 결정 |
| 2026-02-02 | 스펙 문서 Supabase 버전으로 재작성 |
