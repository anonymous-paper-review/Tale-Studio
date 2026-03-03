# API & Feature Spec — V1

> 최종 수정: 2026-03-03
> 역할: 외부 API 연동 + LLM 파이프라인 + Knowledge DB 기능 스펙
> 관련: `mvp_scope.md` (범위), `ux_pages.md` (UI), `layers/L1~L3` (파이프라인 상세)

---

## 1. 외부 API 통합

### 1.1 영상 생성

#### Kling AI — 6축 카메라 제어 영상

| 항목 | 내용 |
|------|------|
| 용도 | T2V + 6축 카메라 제어 (P4 Inspector 연동) |
| Endpoint | `POST https://api.klingai.com/v1/videos/text2video` |
| 인증 | JWT (HS256). iss=access_key, exp=now+1800, secret=secret_key |
| 모델 | `kling-v2-master` (품질) / `kling-v1` (precise camera) |
| 폴링 | `GET /v1/videos/text2video/{task_id}`, 5초 간격 |
| 타임아웃 | 300~600초 |

**Request**:
```json
{
  "model_name": "kling-v2-master",
  "prompt": "string (≤500 chars)",
  "negative_prompt": "string",
  "duration": "5" | "10",
  "aspect_ratio": "16:9" | "9:16" | "1:1",
  "mode": "std" | "pro",
  "camera_control": {
    "type": "simple",
    "config": {
      "horizontal": -10 ~ +10,
      "vertical": -10 ~ +10,
      "pan": -10 ~ +10,
      "tilt": -10 ~ +10,
      "roll": -10 ~ +10,
      "zoom": -10 ~ +10
    }
  }
}
```

**Response (폴링 완료 시)**:
```json
{
  "data": {
    "task_status": "succeed",
    "task_result": {
      "videos": [{ "url": "https://..." }]
    }
  }
}
```

**6축 파라미터 의미**:

| 축 | 음수(-) | 양수(+) |
|----|---------|---------|
| horizontal | 좌 슬라이드 | 우 슬라이드 |
| vertical | 하 슬라이드 | 상 슬라이드 |
| pan | 피치 다운 | 피치 업 |
| tilt | 요 좌 | 요 우 |
| roll | 반시계 회전 | 시계 회전 |
| zoom | 줌아웃 (좁게) | 줌인 (넓게) |

**두 가지 모드**:
1. `kling-v1` + `precise_camera=true`: 정밀 6축 제어, 낮은 품질
2. `kling-v2+` + 텍스트 변환: 6축 값 → 자연어로 프롬프트에 주입, 높은 품질

**텍스트 변환 예시** (v2 모드):
- 강도 매핑: ≤3 (slowly), ≤6 (steadily), >6 (dramatically)
- 출력: "Camera tracks slowly to the right. Camera cranes steadily upward."

---

#### Veo — 고품질 T2V/I2V

| 항목 | 내용 |
|------|------|
| 용도 | T2V (텍스트→영상) / I2V (이미지→영상). 품질 우선 |
| Endpoint | `POST https://generativelanguage.googleapis.com/v1beta/models/{model}:predictLongRunning?key={KEY}` |
| 인증 | API Key (쿼리스트링) |
| 모델 | `veo-3.1-generate-preview` (최신) / `veo-3.1-fast-generate-preview` (빠름) |
| 폴링 | `GET /v1beta/{operation_name}?key={KEY}`, 5초 간격 |
| 타임아웃 | ~300초 |

**Request (T2V)**:
```json
{
  "instances": [{
    "prompt": "string (≤150 chars 효과적)"
  }],
  "parameters": {
    "aspectRatio": "16:9",
    "durationSeconds": 5 | 8 | 10
  }
}
```

**Request (I2V — 캐릭터 일관성)**:
```json
{
  "instances": [{
    "prompt": "string",
    "image": {
      "bytesBase64Encoded": "base64...",
      "mimeType": "image/png"
    }
  }],
  "parameters": {
    "aspectRatio": "16:9",
    "durationSeconds": 8
  }
}
```

**Response (완료)**:
```json
{
  "done": true,
  "response": {
    "generateVideoResponse": {
      "generatedSamples": [{
        "video": { "uri": "gs://..." }
      }]
    }
  }
}
```

**프롬프트 최적화 (Decision #17)**:
- **150자 이하** — 8초 영상에서 처음 100~150자만 유효
- **동시 동작**: 카메라 + 피사체 움직임을 한 문장에
- **구체적 동사**: "approaches" ❌ → "walks toward camera" ✅
- **정적 금지**: "standing" ❌ → "standing and looking around" ✅
- **스타일 키워드**: 2~3개 이내
- **예시**: `"Camera glides forward through stone arches. White-robed figures walk toward camera. Warm golden sunlight. Cinematic."` (135자)

---

### 1.2 이미지 생성

#### DALL-E 3

| 항목 | 내용 |
|------|------|
| 용도 | 캐릭터 Consistency Sheet (3뷰), 배경 이미지, 샷 Start Frame |
| Endpoint | `POST https://api.openai.com/v1/images/generations` |
| 인증 | `Authorization: Bearer {API_KEY}` |

**Request**:
```json
{
  "model": "dall-e-3",
  "prompt": "string",
  "n": 1,
  "size": "1024x1024" | "1792x1024" | "1024x1792",
  "quality": "standard" | "hd",
  "style": "natural" | "vivid"
}
```

**Response**:
```json
{
  "data": [{
    "url": "https://...",
    "revised_prompt": "string"
  }]
}
```

#### Imagen (Google Vertex AI)

| 항목 | 내용 |
|------|------|
| 용도 | DALL-E 대안. 동일 용도 |
| Endpoint | `POST https://{location}-aiplatform.googleapis.com/v1/projects/{project}/locations/{location}/publishers/google/models/imagegeneration:predict` |
| 인증 | Google Cloud credentials (JWT / 서비스 계정) |

**Request**:
```json
{
  "instances": [{ "prompt": "string" }],
  "parameters": {
    "sampleCount": 1,
    "aspectRatio": "1:1" | "16:9" | "9:16"
  }
}
```

**Response**:
```json
{
  "predictions": [{
    "bytesBase64Encoded": "base64...",
    "mimeType": "image/png"
  }]
}
```

---

### 1.3 LLM

#### Gemini

| 항목 | 내용 |
|------|------|
| 용도 | Pumpup, L1 Scene Architect, L2 Shot Composer, L3 Prompt Builder, Agent 대화 |
| Endpoint | `POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={KEY}` |
| 인증 | API Key (쿼리스트링) |
| 모델 | `gemini-2.0-flash` (빠름) / `gemini-1.5-pro` (복잡한 태스크) |

**Request**:
```json
{
  "contents": [{
    "role": "user",
    "parts": [{ "text": "string" }]
  }],
  "generationConfig": {
    "temperature": 0.7,
    "maxOutputTokens": 2048
  },
  "systemInstruction": {
    "parts": [{ "text": "system prompt" }]
  }
}
```

**Response**:
```json
{
  "candidates": [{
    "content": {
      "parts": [{ "text": "응답" }]
    },
    "finishReason": "STOP"
  }],
  "usageMetadata": {
    "promptTokens": 123,
    "candidatesTokens": 456
  }
}
```

---

### 1.4 API 키 관리

`.env.local` 형식:
```bash
# Google (alias 포함 — key:alias 또는 key:alias:project_id)
GOOGLE_API_KEYS=AIzaSy...:xcape,AIzaSy...:tale

# OpenAI
OPENAI_API_KEY=sk-...

# Kling
KLING_ACCESS_KEY=...
KLING_SECRET_KEY=...

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

**키 로테이션**: round_robin / least_used / random (Google 키 복수 지원)

---

## 2. LLM 파이프라인 (3-Level)

### 2.0 Pumpup (전처리)

```
입력: story_text (100~500자)
출력: expanded_story (1000~2500자)
```

| 항목 | 내용 |
|------|------|
| 추가하는 것 | 시간대/조명, 로케이션 디테일, 신체 동작, 환경 묘사 |
| 추가하지 않는 것 | 플롯 변경, 캐릭터 추가, 대사 변경, 내면 감정의 시각적 은유 |
| 선택적 입력 | `source_title` (외부 레퍼런스 검색용) |

**시스템 프롬프트 핵심**:
```
역할: 시각 스토리텔링 보조
- 원본 대사/플롯 절대 보존
- 시간, 조명, 위치, 움직임, 환경 정보만 추가
- 새 캐릭터 추가 금지
- 출력: 확장된 스토리 텍스트만 (1000~2500자)
```

---

### 2.1 L1: Scene Architect

```
입력: expanded_story + project_settings + character_inputs
출력: scene_manifest (4씬) + character_sheet + location_sheet
```

**출력 구조**:
```typescript
// Scene Manifest
scenes: [{
  scene_id: "s1",
  act: "intro" | "dev" | "turn" | "conclusion",
  narrative_summary: string,    // 1~2문장
  original_text_quote: string,  // 원본 인용
  location: string,
  mood: string,
  characters_present: string[],
  estimated_duration_seconds: number
}]

// Character Sheet
characters: [{
  character_id: string,
  name: string,
  description: string,
  fixed_prompt: string,         // 모든 샷에 주입 (일관성)
  reference_images: string[]    // front, side, 3quarter
}]

// Location Sheet
locations: [{
  location_id: string,
  name: string,
  visual_description: string,
  time_of_day: string,
  lighting_direction: string
}]
```

**시스템 프롬프트 핵심**:
```
역할: 시나리오 작가 + 스토리 아키텍트
- 기승전결 4씬으로 분할
- 씬당: narrative, location, mood, characters, duration 추출
- 전체 duration ≈ target_duration_seconds
- 원본 대사/플롯 보존
- JSON 출력
```

---

### 2.2 L2: Shot Composer

```
입력: scene + character_sheet + project_settings
출력: shot_sequence (씬당 6~12샷) + dialogue_lines
```

**Shot Type 참조**:

| 약어 | 이름 | 용도 | 무드 친화 |
|------|------|------|----------|
| ECU | Extreme Close-Up | 디테일, 감정 강조 | intimate, tense |
| CU | Close-Up | 표정, 대화 리액션 | emotional, dialogue |
| MCU | Medium Close-Up | 인터뷰, 대화 | conversation |
| MS | Medium Shot | 범용 대화/액션 | versatile |
| FS | Full Shot | 캐릭터 소개 | establishing |
| WS | Wide Shot | 공간, 관계 | epic, vast |
| EWS | Extreme Wide Shot | 스케일, 풍경 | grand |
| OTS | Over-the-Shoulder | 대화 POV | dialogue |
| POV | Point of View | 주관적 몰입 | immersive |
| TRACK | Tracking Shot | 다이나믹 추적 | action |
| 2S | Two Shot | 관계, 대화 | interaction |

**T2V vs I2V 결정 로직**:
```
캐릭터 존재 + 캐릭터 레퍼런스 이미지 있음 → I2V
그 외 (배경, 분위기) → T2V
```

**대사 생성 규칙**:
- 원본에 대사 있으면 → 그대로 사용
- 대화 씬인데 대사 없으면 → 캐릭터 speech_style 기반 생성
- 액션/몽타주 씬 → 대사 없음
- 짧은 감탄사만 (액션 씬)

**출력 구조**:
```typescript
shots: [{
  shot_id: "s1_shot1",
  shot_type: ShotType,
  action_description: string,
  characters: string[],
  duration_seconds: number,       // 5~8초
  generation_method: "T2V" | "I2V",
  dialogue_lines?: [{
    character_id: string,
    text: string,
    emotion: string,              // neutral, angry, excited...
    delivery: string,             // whisper, shout, calm...
    duration_hint: number
  }]
}]
```

---

### 2.3 L3: Prompt Builder

```
입력: shot + character_fixed_prompt + user_camera_config + Knowledge DB
출력: final_prompt (≤150자) + camera_config (6축) + lighting_config
```

**프롬프트 조합 구조**:
```
[scene_context 50~80자] + [character_fixed_prompt 20~40자] + [technique_fragment 30~50자] + [style_keywords 10~20자]
= ≤150자
```

| 구성요소 | 소스 | 예시 |
|---------|------|------|
| scene_context | L2 shot.action_description | "Warrior draws sword" |
| character_fixed_prompt | L1 character_sheet | "blonde warrior in armor" |
| technique_fragment | Knowledge DB 쿼리 | "handheld camera, natural shake" |
| style_keywords | 사용자 입력 | "cinematic, warm golden light" |

**Knowledge DB 쿼리**:
```sql
SELECT prompt_fragment, technique_id
FROM knowledge_techniques
WHERE emotional_tags && ARRAY['{shot.mood}']
  AND shot_type_affinity @> ARRAY['{shot.type}']
ORDER BY confidence DESC
LIMIT 2
```

**카메라 프리셋 → 6축 매핑** (camera_presets.yaml):

| 프리셋 | h | v | pan | tilt | roll | zoom | 용도 |
|--------|---|---|-----|------|------|------|------|
| handheld | 1 | 0 | 1 | 2 | 1 | 0 | 다큐, 긴장감 |
| vertigo_effect | 0 | 0 | 0 | 0 | 0 | -8 | 충격, 혼란 |
| steadicam_float | 0 | 0 | 0 | 0 | 0 | 3 | 부드러운 이동 |
| static_locked | 0 | 0 | 0 | 0 | 0 | 0 | 정적, 관조 |
| crane_ascend | 0 | 7 | -3 | 0 | 0 | 2 | 서사적, 초월 |
| dutch_angle | 0 | 0 | 0 | 0 | 6 | 0 | 불안, 혼돈 |
| whip_pan | 5 | 0 | 0 | 8 | 0 | 0 | 액션, 에너지 |
| low_angle_hero | 0 | -5 | 5 | 0 | 0 | 3 | 파워, 위압 |
| pov_immersive | 0 | 0 | 0 | 0 | 0 | 5 | 몰입, 체험 |
| pull_back_reveal | 0 | 2 | -1 | 0 | 0 | -7 | 고립, 반전 |

---

## 3. Knowledge DB

### 3.1 테이블 스키마

```sql
CREATE TABLE knowledge_techniques (
  id SERIAL PRIMARY KEY,
  technique_id TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL,               -- camera_language / rendering_style / shot_grammar
  prompt_fragment TEXT NOT NULL,         -- 프롬프트에 주입할 텍스트
  description TEXT,
  emotional_tags TEXT[] DEFAULT '{}',    -- GIN 인덱스
  shot_type_affinity TEXT[] DEFAULT '{}'
);
```

### 3.2 기법 목록 (31개)

#### Camera Language (10)

| ID | 이름 | prompt_fragment | 감정 태그 |
|----|------|----------------|----------|
| handheld | Handheld | handheld camera, natural shake, documentary style | tense, intimate, chaotic |
| vertigo_effect | Dolly Zoom | dolly zoom, vertigo effect, perspective warp | shock, disorientation, revelation |
| steadicam_float | Steadicam | steadicam, smooth floating movement, ethereal | ethereal, peaceful, dreamlike |
| static_locked | Static | static camera, locked off, deliberate framing | formal, contemplative, oppressive |
| crane_ascend | Crane | crane shot ascending, rising above, aerial reveal | epic, transcendent, liberating |
| dutch_angle | Dutch Angle | dutch angle, tilted frame, off-kilter | unease, madness, chaos |
| whip_pan | Whip Pan | whip pan, rapid horizontal sweep, motion blur | chaotic, energetic, surprising |
| rack_focus | Rack Focus | rack focus shift, selective focus pull | revelation, isolation, connection |
| low_angle_hero | Low Angle | low angle looking up, imposing perspective | power, intimidation, awe |
| pov_immersive | POV | first-person perspective, subjective camera | immersion, visceral, paranoia |

#### Rendering Style (11)

| ID | 이름 | prompt_fragment | 감정 태그 |
|----|------|----------------|----------|
| chiaroscuro | Chiaroscuro | dramatic chiaroscuro, single light source, deep shadows | dramatic, mysterious, intense |
| film_grain_70s | 70s Film Grain | 70s film grain, warm desaturated tones, vintage | nostalgic, melancholic, authentic |
| oil_painting | Oil Painting | oil painting texture, rich impasto, classical lighting | timeless, romantic, epic |
| neon_noir | Neon Noir | neon-lit darkness, cyberpunk reflections, urban noir | isolated, tense, futuristic |
| golden_hour | Golden Hour | golden hour warmth, long shadows, amber glow | romantic, hopeful, peaceful |
| desaturated_gritty | Desaturated | muted colors, harsh overhead light, gritty realism | bleak, harsh, vulnerable |
| high_key_bright | High Key | bright even lighting, minimal shadows, clean | innocent, ethereal, surreal |
| silhouette_backlit | Silhouette | backlit silhouette, rim lighting, dramatic outline | mysterious, dramatic, epic |
| candlelight_warm | Candlelight | warm candlelight, flickering shadows, intimate glow | intimate, sacred, vulnerable |
| moonlight_blue | Moonlight | blue moonlight, cold night exterior, lunar glow | melancholic, eerie, mysterious |
| ethereal_glow | Ethereal Glow | soft ethereal glow, diffused light, dreamy haze | dreamlike, spiritual, peaceful |

#### Shot Grammar (10)

| ID | 이름 | prompt_fragment | 감정 태그 |
|----|------|----------------|----------|
| silhouette_reveal | Silhouette Reveal | backlit silhouette, gradual face reveal | mystery, anticipation |
| push_in_realization | Push In | slow dolly push in, realization moment | tension, revelation |
| pull_back_isolation | Pull Back | pull back reveal, vast empty space | isolation, vulnerability |
| establishing_descent | Establishing | aerial descent to ground level | epic, grounding |
| match_cut_object | Match Cut | visual rhyme, matching shape transition | connection, irony |
| reaction_insert | Reaction Insert | tight reaction shot, emotional response | empathy, shock |
| over_shoulder_reveal | OTS Reveal | over shoulder looking at reveal | curiosity, discovery |
| time_lapse_passage | Time Lapse | accelerated time passage, changing light | time, transience |
| freeze_frame_emphasis | Freeze Frame | frozen moment, suspended action | dramatic, emphasis |
| parallel_action_cut | Parallel Cut | cross-cutting between locations | urgency, connection |

---

## 4. 비용 & 제한

### 4.1 API별 비용

| API | 단가 | 8샷 기준 (64초) |
|-----|------|-----------------|
| Veo 3.1 Fast | $0.15/초 | $9.60 |
| Veo 3.1 Standard | $0.40/초 | $25.60 |
| Veo 2.0 | $0.35/초 | $22.40 |
| Kling v2 | ~$0.05~0.15/초 (추정) | TBD |
| DALL-E 3 | $0.04~0.12/장 | $0.30~0.90 |
| Gemini LLM | $0.02~0.20/호출 | $0.10~1.00 |

### 4.2 일일 제한

| API | 권장 제한 | 동시 처리 |
|-----|----------|----------|
| Veo | ~10 영상/키/일 | 1~2/키 |
| Kling | ~10 영상/키/일 | JWT 30분 유효 |
| DALL-E 3 | ~50 이미지/분/키 | - |
| Gemini | RPM 제한 (모델별) | - |

### 4.3 비즈니스 모델 시사점

- **플랫폼 부담**: DAU 1,000 → 영상 API만 월 $144K+ → 불가
- **BYOK**: 인프라만 월 $700~1,750. 사용자가 API 키 직접 사용 → 실현 가능
- **Self-hosted**: GPU 고정비 월 $6K~8K (볼륨 독립) → 스케일 시 유리

---

## 5. Next.js API Routes 설계

### 5.1 엔드포인트 목록

```
POST /api/pipeline/pumpup           ← Pumpup (스토리 확장)
POST /api/pipeline/scene-architect   ← L1 (씬 분할)
POST /api/pipeline/shot-composer     ← L2 (샷 시퀀스)
POST /api/pipeline/prompt-builder    ← L3 (최종 프롬프트)

POST /api/generate/image            ← DALL-E / Imagen 이미지 생성
POST /api/generate/video            ← Kling / Veo 영상 생성
GET  /api/generate/video/[jobId]    ← 영상 생성 상태 폴링

GET  /api/knowledge/techniques      ← Knowledge DB 조회
GET  /api/knowledge/presets         ← 카메라 프리셋 조회

POST /api/project                   ← 프로젝트 생성
GET  /api/project/[id]              ← 프로젝트 조회
PUT  /api/project/[id]              ← 프로젝트 업데이트
```

### 5.2 공통 응답 형식

```typescript
// 성공
{ success: true, data: T }

// 에러
{ success: false, error: { code: string, message: string } }

// 비동기 작업
{ success: true, data: { jobId: string, status: "processing", pollingUrl: string } }
```

---

## 6. Stage별 API 사용 매핑

| Stage | API 호출 | 트리거 |
|-------|---------|--------|
| **P1** | Gemini (Producer Agent 대화) | 사용자 메시지 입력 |
| **P2** | Gemini (Pumpup → L1 Scene Architect) | Stage 진입 시 자동 / "Auto-Generate Scenes" 버튼 |
| **P3** | DALL-E/Imagen (캐릭터 시트 + 배경) | Stage 진입 시 자동 (Handoff → 로딩) |
| **P4** | Gemini (L2+L3) + DALL-E (샷 이미지) + Kling/Veo (영상) | Stage 진입 시 L2 자동 → 사용자 트리거로 영상 생성 |
| **P5** | 없음 (클라이언트 사이드 편집) | - |

---

## 변경 이력

| 날짜 | 내용 |
|------|------|
| 2026-03-03 | V1: 초안. 외부 API 통합 + LLM 파이프라인 + Knowledge DB + 비용 |
