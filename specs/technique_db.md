# Technique DB 스펙

> 최종 수정: 2026-01-22 15:15
> 상태: 스펙 정의 완료, 필드 설계 대기

## 개요

유튜브/영상을 분석하여 시네마틱 연출 테크닉을 DB로 축적.
L3 Prompt Builder가 샷 프롬프트 생성 시 참조.

---

## 목적

1. **연출 패턴 축적**: 다양한 영상에서 검증된 연출 기법 수집
2. **프롬프트 품질 향상**: DB 기반으로 구체적이고 일관된 프롬프트 생성
3. **스타일 재현**: 특정 영상/감독 스타일을 재현할 수 있는 레퍼런스

---

## 범위 (Scope)

### 포함 (In Scope)
- 카메라 워크 (pan, tilt, dolly, crane, handheld 등)
- 샷 타입별 세부 설정 (wide, medium, close-up 등)
- 조명/분위기 (high-key, low-key, golden hour, neon 등)
- 시각 효과 (렌즈 플레어, 먼지 입자, 피사계 심도 등)
- 배우/피사체 디테일 (피부 질감, 의상 질감, 헤어 등)
- 환경 디테일 (공기 먼지, 안개, 빛줄기 등)

### 제외 (Out of Scope) - L2 담당
- 샷 순서/구성
- 대사 유무
- 액션 유형
- 감정 태그
- 전후 샷 관계
- 장르 분류

---

## 데이터 모델

### 핵심 엔티티: `Technique`

```yaml
Technique:
  id: string              # unique identifier
  category: enum          # camera | lighting | atmosphere | detail
  name: string            # 기법 이름 (예: "dolly_zoom", "rim_lighting")

  # 적용 컨텍스트
  applicable_shot_types:  # 이 기법이 적용되는 샷 타입들
    - wide
    - medium
    - close_up
  applicable_moods:       # 이 기법이 어울리는 분위기
    - tense
    - romantic
    - action

  # 프롬프트 요소
  prompt_fragment: string # Veo 프롬프트에 들어갈 텍스트 조각
  keywords: list[string]  # 검색용 키워드

  # 메타데이터
  source_video: string    # 출처 영상 (optional)
  timestamp: string       # 영상 내 타임스탬프 (optional)
  confidence: float       # 0.0-1.0, 수동 검증 시 1.0

  # 예시
  example_description: string  # 이 기법이 사용된 장면 설명
```

### 카테고리별 필드

#### 1. Camera (카메라)
```yaml
camera_technique:
  movement: enum          # static | pan | tilt | dolly | crane | handheld | steadicam
  speed: enum             # slow | medium | fast
  direction: string       # left_to_right, push_in, pull_out 등
  lens: string            # wide_angle, telephoto, macro 등
  focus: string           # deep_focus, shallow_dof, rack_focus 등
```

#### 2. Lighting (조명)
```yaml
lighting_technique:
  key_type: enum          # high_key | low_key | natural | mixed
  direction: string       # front | side | back | top | bottom
  color_temp: string      # warm | cool | neutral | mixed
  special: list[string]   # rim_light, hair_light, practical_lights 등
```

#### 3. Atmosphere (분위기/환경)
```yaml
atmosphere_technique:
  particles: list[string] # dust, fog, smoke, rain, snow 등
  light_effects: list[string]  # lens_flare, god_rays, bokeh 등
  color_grade: string     # teal_orange, desaturated, high_contrast 등
```

#### 4. Detail (피사체 디테일)
```yaml
detail_technique:
  skin: string            # sweaty, pale, weathered, glowing 등
  texture: string         # fabric_detail, metal_reflection 등
  micro_details: list[string]  # pores, stubble, freckles 등
```

---

## 분석 파이프라인

### 워크플로우 (반자동)

```
[영상 입력]
    ↓
[1. 프레임 추출]
    - 씬 전환점 감지
    - 대표 프레임 선택
    ↓
[2. LLM 초안 분석]
    - Gemini Vision으로 프레임 분석
    - 카메라/조명/분위기/디테일 추출
    - JSON 형식 출력
    ↓
[3. 사람 검토/수정]
    - 잘못된 분석 수정
    - 누락된 기법 추가
    - confidence 점수 부여
    ↓
[4. DB 저장]
    - 검증된 데이터만 저장
    - 중복 체크
```

### 분석 프롬프트 (초안)

```
이 영상 프레임을 분석하여 다음 정보를 JSON으로 추출하세요:

1. 카메라:
   - 움직임 (static/pan/tilt/dolly/crane/handheld)
   - 렌즈 특성 (wide/normal/telephoto)
   - 포커스 (deep/shallow/rack)

2. 조명:
   - 키 조명 유형 (high-key/low-key/natural)
   - 조명 방향
   - 색온도
   - 특수 조명 (림라이트, 실용조명 등)

3. 분위기:
   - 공기 중 입자 (먼지, 안개, 연기 등)
   - 빛 효과 (렌즈플레어, 갓레이 등)
   - 컬러 그레이딩 스타일

4. 디테일:
   - 피부/질감 묘사
   - 주목할 만한 시각적 디테일
```

---

## 사용 시나리오

### L3 Prompt Builder에서 사용

```python
# 샷 정보가 주어졌을 때
shot = Shot(type="close_up", mood="tense", action="dialogue")

# DB에서 적합한 테크닉 조회
techniques = db.query(
    applicable_shot_types=["close_up"],
    applicable_moods=["tense"]
)

# 프롬프트 조합
prompt_fragments = [t.prompt_fragment for t in techniques]
final_prompt = base_prompt + " ".join(prompt_fragments)
```

### 예시 데이터

```json
{
  "id": "cam_dolly_zoom_001",
  "category": "camera",
  "name": "dolly_zoom",
  "applicable_shot_types": ["medium", "close_up"],
  "applicable_moods": ["tense", "revelation", "horror"],
  "prompt_fragment": "dolly zoom effect, background expanding while subject stays same size",
  "keywords": ["vertigo", "zolly", "contra-zoom"],
  "source_video": "https://youtube.com/...",
  "timestamp": "01:23:45",
  "confidence": 1.0,
  "example_description": "주인공이 충격적인 사실을 깨닫는 순간, 배경이 멀어지며 고립감 강조"
}
```

---

## 저장소 구조

```
databases/
├── technique_db.json       # 메인 DB
├── categories/
│   ├── camera.json         # 카메라 기법
│   ├── lighting.json       # 조명 기법
│   ├── atmosphere.json     # 분위기/환경
│   └── detail.json         # 디테일
└── sources/
    └── analysis_logs/      # 분석 로그 (검토용)
```

---

## 미해결 사항

- [ ] 영상 소스 선정 (장르/스타일)
- [ ] 프레임 추출 도구 선정
- [ ] LLM 분석 비용 추정
- [ ] 검토 UI/워크플로우 설계
- [ ] 중복 제거 로직

---

## 변경 이력

| 날짜 | 내용 |
|------|------|
| 2026-01-22 | 스펙 인터뷰 기반 초안 작성 |
