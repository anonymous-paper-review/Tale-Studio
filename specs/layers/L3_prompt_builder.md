# L3: Prompt Builder

> 샷 → 최종 프롬프트 + Knowledge DB + Camera Control

## 역할

L2의 샷 시퀀스를 받아, Knowledge DB의 촬영 테크닉을 주입하여 영상 생성 API용 최종 프롬프트를 생성한다.

```
Shot Sequence → [Prompt Builder] → Final Prompts → [Video API]
                      ↑
               Knowledge DB (촬영 기법)
               Camera Presets (6축 파라미터)
```

**UX 매핑**: P4 The Set — Cinematographic Inspector 패널 (`specs/ux_pages.md` P4)

---

## 입력

| 항목 | 소스 |
|------|------|
| Shot | L2 출력 (type, action, characters, mood) |
| Character Fixed Prompt | L1 출력 |
| Knowledge DB 기법 | mood + shot_type 기반 쿼리 |
| Camera 파라미터 | 사용자 설정 (6축 슬라이더) or 프리셋 |

## 출력

| 출력물 | 내용 |
|--------|------|
| Final Prompt | 영상 API용 텍스트 (150자 이내) |
| Camera Config | Kling 6축 파라미터 (or 프롬프트 텍스트) |
| Lighting Config | 프롬프트 기반 조명 설정 |

---

## Knowledge DB (Supabase)

### 테이블: `knowledge_techniques`

```sql
knowledge_techniques (
  technique_id  TEXT,            -- 'handheld', 'chiaroscuro'
  name          TEXT,            -- 표시 이름
  category      TEXT,            -- camera_language / rendering_style / shot_grammar
  prompt_fragment TEXT,          -- 프롬프트에 삽입할 텍스트
  emotional_tags TEXT[],         -- 감정 기반 검색 ['tense', 'intimate']
  shot_type_affinity TEXT[],    -- 샷 타입 매칭 ['CU', 'MS']
)
```

### 카테고리

| category | 설명 | 예시 |
|----------|------|------|
| `camera_language` | 카메라 워크/움직임 | handheld, vertigo, steadicam, dutch_angle |
| `rendering_style` | 렌더링/시각 스타일 | chiaroscuro, film_grain_70s, neon_noir |
| `shot_grammar` | 샷 문법/연출 패턴 | silhouette_reveal, push_in_realization |

### 쿼리 인터페이스 (개념)

> 구현은 Next.js API Routes + Supabase client로 새로 작성 예정.

- **query(category, moods, shot_type, limit)** → TechniqueEntry 목록
- **get_by_id(category, technique_id)** → 단일 TechniqueEntry
- **프로덕션**: Supabase `knowledge_techniques` (GIN 인덱스)
- **로컬 백업**: `databases/knowledge/*.yaml`

---

## Video Reference DB (Supabase)

촬영 기법의 실제 레퍼런스 영상 저장. Knowledge DB와 soft reference 연결.

### 테이블

| 테이블 | 역할 |
|--------|------|
| `videos` | 영상 메타데이터 (URL, platform, genre, status) |
| `shot_analysis` | 샷 단위 분석 (timestamp, technique_id, confidence) |

### 워크플로우

```
pending → analyzed (LLM 자동) → reviewed (사람 검토, human_verified=true)
```

---

## Camera Control

### Kling 6축 파라미터

| 축 | 범위 | 동작 |
|----|------|------|
| horizontal | -10~+10 | 카메라 좌/우 슬라이드 |
| vertical | -10~+10 | 카메라 하/상 슬라이드 |
| pan | -10~+10 | 피치 하/상 회전 |
| tilt | -10~+10 | 요 좌/우 회전 |
| roll | -10~+10 | 롤 반시계/시계 |
| zoom | -10~+10 | 화각 좁/넓 |

> 주의: Kling의 pan/tilt 명명이 일반 시네마토그래피와 반대 (pan=pitch, tilt=yaw)

### 프리셋 매핑

`databases/knowledge/camera_presets.yaml`에서 Knowledge DB camera_language → Kling 6축 값 매핑.

### 프롬프트 최적화 (실험 결과)

- **150자 이내**: 8초 영상은 앞부분 100~150자만 유효
- **동시 서술**: 카메라 움직임 + 피사체 움직임을 한 문장에
- **정적 표현 금지**: "stand in formation" → "walk toward camera"
- **구체적 동사**: "approaches" → "walk toward camera"
- style_keywords: 2~3개 max
- negative_prompts: 짧게 유지 (효과 불분명)

**좋은 예시**:
```
Camera glides forward through stone arches. White-robed hooded
figures with masks walk toward camera in silent procession.
Warm golden sunlight. Cinematic.
```

---

## 프롬프트 조합 구조

```
[scene_context] + [character_fixed_prompt] + [technique_prompt_fragment] + [style_keywords]
     ↑                    ↑                          ↑                         ↑
  L2 출력            L1 출력              Knowledge DB 쿼리           사용자 설정
```

최종 150자 이내로 압축하여 영상 API에 전달.

---

## 결정 사항

- Knowledge DB는 Supabase 기반 (YAML 로컬 백업 유지)
- Camera Explorer는 Kling 단독 (6축 수치 제어 유일)
- 프롬프트 150자 이내 (Veo 실험 결과)
- L3는 연출 테크닉만 담당 (스토리 요소는 L2)

> 결정 근거 상세: `specs/decisions.md` #2, #13, #17, #19, #20
