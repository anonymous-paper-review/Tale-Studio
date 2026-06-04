# SVC Pipeline Experiment

실험용 선형 파이프라인. 스토리 입력 → 샷 시퀀스 JSON 출력.

## 구조

```
experiment/svc-pipeline/
├── src/
│   ├── app/
│   │   ├── page.tsx                # 테스트 UI
│   │   ├── layout.tsx
│   │   ├── globals.css
│   │   └── api/
│   │       ├── pipeline/route.ts   # POST: 파이프라인 실행
│   │       ├── projects/route.ts   # GET: 프로젝트 목록
│   │       └── logs/[projectId]/route.ts  # GET: 로그 파일 조회
│   ├── lib/
│   │   ├── llm/
│   │   │   ├── gemini.ts           # 생성용 (gemini-3-flash-preview)
│   │   │   └── claude.ts           # 검증용 (claude-sonnet-4-6)
│   │   ├── pipeline/
│   │   │   ├── index.ts            # 오케스트레이터
│   │   │   ├── stages/
│   │   │   │   ├── s0_genre.ts
│   │   │   │   ├── s1_structure.ts
│   │   │   │   ├── s2_characters.ts
│   │   │   │   ├── s3_scenes.ts
│   │   │   │   ├── c_validation_1.ts   # Claude
│   │   │   │   ├── mid_preview.ts
│   │   │   │   ├── l0_l1_visual.ts
│   │   │   │   ├── l2_design.ts
│   │   │   │   ├── l3_shots.ts
│   │   │   │   └── c_application_2.ts  # Gemini + Claude
│   │   │   └── validators/
│   │   │       ├── causality.ts        # 룰 기반
│   │   │       └── action_budget.ts    # 룰 기반 + 자동 분할
│   │   ├── logger/index.ts
│   │   └── types/pipeline.ts
└── logs/                                # 실행 시 자동 생성
    └── {project_id}/
        ├── 00_input_story.md
        ├── 02_S0.json
        ├── 03_S1.json
        ├── 04_S2.json
        ├── 05_S3.json
        ├── 06_C_validation_1.json
        ├── 07_mid_preview.json
        ├── 08_L0_L1.json
        ├── 09_L2.json
        ├── 10_L3.json
        ├── 11_C_application_2.json
        ├── 12_shot_sequence.json
        ├── INTEGRATED.json              # 마스터 통합 JSON
        ├── _progress.jsonl              # 단계별 진행 마커
        └── debug/
            └── llm_calls/               # 모든 LLM 호출 raw 입출력
                ├── 001_S0_genre.json
                ├── 002_S1_structure.json
                └── ...
```

## 설정

### API 키
`.env.local` 파일에 이미 세팅됨:
```
CLAUDE_API_KEY=...
GEMINI_API_KEY=...        # tale 키
GEMINI_API_KEY_BACKUP=... # xcape 키 (현재 미사용)
```

### 모델
- **생성 (Gemini)**: `gemini-3-flash-preview` -- S0~S3, Mid Preview, L0~L3, 샷 시퀀스 초안
- **검증 (Claude)**: `claude-sonnet-4-6` -- C 적용①, C 적용② 의미 검증

## 실행

```bash
cd experiment/svc-pipeline
npm install
npm run dev
# → http://localhost:3100
```

## 사용

1. UI에서 스토리 입력 (디폴트: 용사가 마왕을 무찌르는 이야기)
2. 러닝타임 입력 (선택, 비우면 AI가 결정)
3. "파이프라인 실행" 클릭
4. 단계별 LLM 호출 후 최종 샷 시퀀스 표시
5. 좌측 "저장된 프로젝트" 목록에서 과거 실행 클릭 → 단계별 로그 파일 확인

## 파이프라인 흐름

```
Story
  ↓
[S0] Gemini: 장르/톤/감정/러닝타임/깊이 결정
  ↓
[S1] Gemini: 구조/POV/주제/CDQ 결정
  ↓
[S2] Gemini: 캐릭터/관계/서브텍스트 결정
  ↓
[S3] Gemini: 씬 브레이크다운 + 액션 분해
  ↓
[C 적용①] 룰(인과체인) + Claude(CDQ/핍진성/클리셰) 검증
  ↓
[Mid Preview] Gemini: V축 전체 추천
  ↓
[L0+L1] Gemini: 매체/포맷/스타일 확정
  ↓
[L2] Gemini: 팔레트/로케이션/의상/VFX
  ↓
[L3] Gemini: 샷별 카메라/조명/구도 (액션 예산 사전 분석 포함)
  ↓
[C 적용②] Gemini(샷시퀀스+프롬프트 생성) + Claude(액션 스코프 검증 + 자동 분할)
  ↓
Shot Sequence JSON
```

## 출력

`logs/{project_id}/INTEGRATED.json`:
```json
{
  "project_id": "...",
  "input": { "story": "...", "runtimeSeconds": 60 },
  "S0": {...},
  "S1": {...},
  "S2": {...},
  "S3": {...},
  "c_validation_1": { "passed": true, "issues": [...], ... },
  "mid_preview": {...},
  "L0": {...},
  "L1": {...},
  "L2": {...},
  "L3": [...],
  "c_validation_2": { "passed": true, "issues": [...], ... },
  "shot_sequence": {
    "project_id": "...",
    "total_shots": 12,
    "total_duration_seconds": 60,
    "depth_level": "D3",
    "shots": [
      {
        "shot_id": "shot_1",
        "duration_seconds": 5,
        "S": {...},
        "C": {...},
        "V": {...},
        "assets": {...},
        "first_frame_generation": { "composition_prompt": "..." },
        "video_generation": { "motion_prompt": "..." },
        "action_budget": {...},
        "continuity": {...}
      },
      ...
    ]
  },
  "metadata": {
    "started_at": "...",
    "completed_at": "...",
    "total_duration_ms": 12345,
    "llm_calls": { "gemini": 9, "claude": 2 }
  }
}
```

## 미구현 (의도적 생략)

- 재생성 루프 UI (사용자가 나중에 UI로 구현)
- 사용자 미세 조정 UI (사용자가 나중에 UI로 구현)
- 에러 복구 / 재시도 (실제 프레임워크 구축 시 디버깅)
- 사운드 (별도 sound_ideation.md 참조)
- 실제 Qwen3 Image / Hunyuan Video 호출 (이번 범위는 프롬프트 출력까지)

## 깊이 레벨

- **D3** (1~5분, 6~12 샷): 짧은 미드폼
- **D4** (5~30분, 12~60 샷): 단편/에피소드
- **D5** (30분+): 장편

`runtimeSeconds`를 명시하지 않으면 AI가 스토리 복잡도에 따라 자동 결정.

## 디폴트 테스트 입력

```
용사가 마왕을 무찌르는 이야기. 중세 판타지.
늙은 백발 노파인 용사와 용의 형태를 가진 마왕.
```
