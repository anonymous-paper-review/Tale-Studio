# AVA Framework Spec

> 생성일: 2026-01-27 22:35
> 상태: **개념 스펙** — Post-MVP 확장용. §7~§8의 Python 코드/파일구조는 Phase 0에서 삭제됨.

## 개요

AVA (Anchor-Bridge-Expression) Framework는 다양한 입력(음악/스토리/게임)을 영상으로 변환하는 공통 프레임워크.

---

## 1. 3-Layer 아키텍처

```
Input (Music/Story/Game)
     │
     ▼
┌─────────────────────────────────────────┐
│  ANCHOR (핵심 DNA)                       │
│  - 입력 소스에서 추출되는 불변의 본질     │
│  - NarrativeCore / EmotionalCore / StructuralCore
└─────────────────────────────────────────┘
     │
     ▼
┌─────────────────────────────────────────┐
│  BRIDGE (번역 전략)                      │
│  - Anchor → Expression 변환 방식 결정    │
│  - 3가지 모드: Intuitive / Symbolic / Sensory
└─────────────────────────────────────────┘
     │
     ▼
┌─────────────────────────────────────────┐
│  EXPRESSION (시각 요소)                  │
│  - 최종 영상에 반영되는 시각적 표현       │
│  - WorldExpression / ActorExpression / StyleExpression
└─────────────────────────────────────────┘
```

---

## 2. Anchor (핵심 DNA)

입력 소스에서 추출되는 **보존해야 할 본질적 요소**.

### 2.1 NarrativeCore (서사)

| 필드 | 타입 | 설명 |
|------|------|------|
| theme | str | 핵심 주제 (예: "melancholic", "heroic") |
| arc | str | 서사 구조 (예: "rise-fall-rise") |
| beats | list[str] | 핵심 스토리 비트 (가사/메타데이터에서 추출) |

### 2.2 EmotionalCore (감정)

| 필드 | 타입 | 설명 |
|------|------|------|
| primary_mood | Mood | 주요 감정 (enum) |
| emotional_arc | EmotionalArc | 감정 곡선 (tension_curve, peaks) |
| tension_points | list[float] | 긴장 포인트 (0.0~1.0 타임라인) |

### 2.3 StructuralCore (구조)

| 필드 | 타입 | 설명 |
|------|------|------|
| tempo | str | 템포 ("slow", "medium", "fast") |
| rhythm_pattern | str | 리듬 패턴 (예: "4/4") |
| sections | list[str] | 구간 레이블 (intro, verse, chorus 등) |

---

## 3. Bridge (번역 전략)

Anchor를 Expression으로 변환하는 전략. 3가지 모드 지원.

| 모드 | 설명 | MVP |
|------|------|-----|
| **Intuitive** | 직관적 1:1 매핑 (melancholic → 비 오는 도시) | ✅ 구현됨 |
| Symbolic | 상징적 표현 (슬픔 → 떨어지는 꽃잎) | 미구현 |
| Sensory | 감각적 표현 (BPM → 카메라 움직임 속도) | 미구현 |

### 3.1 Intuitive 모드 매핑

| Mood | Location | Time | Atmosphere |
|------|----------|------|------------|
| MELANCHOLIC | 비 내리는 도시 | 황혼 | 축축하고 우울한 |
| HOPEFUL | 초원, 열린 들판 | 새벽 | 따뜻한 빛 |
| TENSE | 좁은 골목 | 밤 | 긴장감 있는 그림자 |
| NOSTALGIC | 오래된 카페 | 오후 | 부드러운 세피아 톤 |
| EPIC | 광활한 산맥 | 일출 | 드라마틱한 광선 |
| INTIMATE | 작은 방 | 저녁 | 따뜻한 램프 빛 |
| CHAOTIC | 폐허 도시 | 폭풍 | 불안정한 조명 |
| SERENE | 호수가 | 정오 | 고요한 반사 |

---

## 4. Expression (시각 요소)

### 4.1 WorldExpression

| 필드 | 타입 | 설명 |
|------|------|------|
| location | str | 장소 (mood 기반 매핑) |
| time_of_day | str | 시간대 |
| atmosphere | str | 분위기 묘사 |

### 4.2 ActorExpression

| 필드 | 타입 | 설명 |
|------|------|------|
| character_hints | list[str] | 캐릭터 힌트 (arc 기반) |
| movement_quality | str | 움직임 품질 (tempo 기반: deliberate/natural/energetic) |

### 4.3 StyleExpression

| 필드 | 타입 | 설명 |
|------|------|------|
| rendering_style | str | 렌더링 스타일 (Knowledge DB 쿼리) |
| camera_language | str | 카메라 언어 (Knowledge DB 쿼리) |

---

## 5. Music → Video 파이프라인

### 5.1 MusicMetadata (입력)

```python
@dataclass
class MusicMetadata:
    title: str                    # 곡 제목 (필수)
    artist: Optional[str]         # 아티스트
    duration_seconds: Optional[float]  # 곡 길이
    bpm: Optional[int]            # BPM (템포 판단용)
    key: Optional[str]            # 조성 (예: "C major")
    mood_tags: list[str]          # 무드 태그들
    genre_tags: list[str]         # 장르 태그들
    lyrics: Optional[str]         # 가사 (있으면)
    sections: list[MusicSection]  # 구간 정보
```

### 5.2 MusicSection (구간 정보)

```python
@dataclass
class MusicSection:
    label: str           # "intro", "verse", "chorus", "bridge", "outro"
    start_time: float    # 시작 시간 (초)
    end_time: float      # 종료 시간 (초)
    energy_level: float  # 에너지 레벨 (0.0~1.0)
```

### 5.3 변환 흐름

```
MusicMetadata
     │
     ▼ MusicToAnchor.execute()
Anchor
  ├─ NarrativeCore ← lyrics/mood_tags
  ├─ EmotionalCore ← mood_tags/sections
  └─ StructuralCore ← bpm/sections
     │
     ▼ BridgeTranslator.translate(mode=INTUITIVE)
Expression
  ├─ WorldExpression ← mood 매핑
  ├─ ActorExpression ← arc/tempo 매핑
  └─ StyleExpression ← Knowledge DB 쿼리
     │
     ▼ ExpressionAdapter.to_scene_input()
SceneArchitectInput → L1 파이프라인
```

### 5.4 BPM → Tempo 매핑

| BPM | Tempo |
|-----|-------|
| < 80 | slow |
| 80-119 | medium |
| >= 120 | fast |

### 5.5 Mood 매핑 테이블

```python
MOOD_MAPPING = {
    "melancholic": Mood.MELANCHOLIC,
    "melancholy": Mood.MELANCHOLIC,
    "sad": Mood.MELANCHOLIC,
    "hopeful": Mood.HOPEFUL,
    "uplifting": Mood.HOPEFUL,
    "happy": Mood.HOPEFUL,
    "tense": Mood.TENSE,
    "anxious": Mood.TENSE,
    "nostalgic": Mood.NOSTALGIC,
    "epic": Mood.EPIC,
    "grand": Mood.EPIC,
    "heroic": Mood.EPIC,
    "intimate": Mood.INTIMATE,
    "chaotic": Mood.CHAOTIC,
    "serene": Mood.SERENE,
    "peaceful": Mood.SERENE,
    "calm": Mood.SERENE,
}
```

### 5.6 최종 출력: SceneArchitectInput

Expression이 최종적으로 L1 파이프라인에 전달되는 형태:

```python
SceneArchitectInput(
    story = "확장된 스토리 텍스트",
    genre = "drama" | "thriller" | "action",  # atmosphere 기반 자동 추론
    target_duration_minutes = 2.0,            # 음악 길이 기반
    character_hints = [{"name": "Character_1", "role": "auto", "description": "..."}]
)
```

### 5.7 Story 생성 로직

> ~~소스: `usecases/ava/expression_adapter.py:68-120`~~ (Phase 0에서 삭제. 개념 참조용)

#### story_seed 있을 때 (가사/사용자 입력)

```
{time_of_day}. {location}. {weather}.

{원본 story_seed}
```

예시:
```
Dusk. A rain-soaked city street, neon lights reflected on wet pavement. Light rain.

[가사나 사용자가 제공한 스토리...]
```

#### story_seed 없을 때 (자동 생성)

```
{time_of_day}.
{location}.
{weather}.
The atmosphere is {atmosphere}.

{character_hint_1}
{character_hint_2}
...
```

예시:
```
Dusk.
A rain-soaked city street, neon lights reflected on wet pavement.
Light rain.
The atmosphere is melancholic.

A figure moving with deliberate, heavy steps
Someone pausing, looking back with longing
```

### 5.8 Genre 자동 매핑

> ~~소스: `usecases/ava/expression_adapter.py:17-26`~~ (Phase 0에서 삭제. 개념 참조용)

| atmosphere | genre |
|------------|-------|
| melancholic | drama |
| hopeful | drama |
| tense | thriller |
| nostalgic | drama |
| epic | action |
| intimate | drama |
| chaotic | action |
| serene | drama |

### 5.9 Pumpup Hints

> ~~소스: `domain/entities/ava/expression.py:46-54`~~ (Phase 0에서 삭제. 개념 참조용)

StoryPumpup 확장 시 사용할 수 있는 힌트 (`Expression.to_pumpup_hints()`):

```python
{
    "time_of_day": "dusk",
    "location": "A rain-soaked city street...",
    "atmosphere": "melancholic",
    "weather": "Light rain",
    "movement_quality": "deliberate"
}
```

---

## 6. Knowledge DB

촬영 테크닉 레퍼런스 (`databases/knowledge/*.yaml`)

### 6.1 카테고리

| 파일 | 내용 | 예시 |
|------|------|------|
| camera_language.yaml | 카메라 워크 | handheld, vertigo, steadicam, dutch_angle |
| rendering_style.yaml | 렌더링 스타일 | chiaroscuro, film_grain_70s, oil_painting, neon_noir |
| shot_grammar.yaml | 샷 문법 | silhouette_reveal, push_in_realization, pull_back_isolation |

### 6.2 TechniqueEntry 구조

```yaml
name: handheld
description: 손으로 든 카메라의 미세한 흔들림
use_cases:
  - 긴박한 추격 장면
  - 다큐멘터리 스타일
emotional_tags:
  - tense
  - intimate
  - chaotic
```

### 6.3 쿼리 인터페이스

```python
class CinematographyKnowledgeDB(ABC):
    @abstractmethod
    def query(
        self,
        category: str,           # "camera_language", "rendering_style", "shot_grammar"
        moods: list[str] = None, # 감정 필터
        shot_type: str = None,   # 샷 타입 필터
        limit: int = 3,
    ) -> list[TechniqueEntry]
```

---

## 7~8. 사용 예시 + 파일 구조

> **Phase 0에서 삭제됨**. 아래 Python 코드와 파일 구조는 구 코드베이스 기준.
> Next.js 기반 재구현 시 이 섹션의 개념(변환 흐름, 데이터 모델)만 참조.
> Knowledge DB 데이터는 `databases/knowledge/*.yaml`에 보존되어 있음.
