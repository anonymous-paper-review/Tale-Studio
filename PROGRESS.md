# PROGRESS.md

> 최종 수정: 2026-02-12 17:20

## 프로젝트: Tale (AI Video Generation Pipeline)

### 현재 상태: Phase 6 진행 중 (Camera Explorer Web UI)

---

## Now: Camera Explorer PoC (Phase 6)

### 목표
동일 장면을 다양한 카메라 앵글/라이팅으로 돌려보는 인터랙티브 웹 UI

### 태스크
- [x] 영상 생성 API 기술 리서치: Kling/VEO/Grok 카메라·라이팅 제어 비교 (02-12)
- [x] Kling API 어댑터 구현: JWT 인증 + 6축 카메라 파라미터 → `adapters/gateways/kling_video.py` (02-12)
- [x] 카메라 프리셋 매핑: camera_language 10개 → Kling 6축 값 → `camera_presets.yaml` (02-12)
- [x] FastAPI 백엔드: generate/status/presets 3개 API → `web/server.py` (02-12)
- [x] Three.js 3D 프리뷰 UI: 슬라이더 6축 + 프리셋 버튼 + 라이팅 연동 → `web/static/index.html` (02-12)
- [ ] Kling API 실제 호출 테스트: 크레딧 소모 확인 후 영상 1건 생성
- [ ] UI 피드백 반영: 시연 후 조정 사항

### 메모
- Kling이 유일하게 수치 기반 카메라 파라미터 제공 (6축 -10~+10)
- VEO/Grok은 프롬프트 텍스트 기반만 지원
- 라이팅은 3개 API 모두 프롬프트 기반 (dedicated 파라미터 없음)
- 서버 실행: `.venv/bin/python -m uvicorn web.server:app --reload --port 8000`

---

## Phase 6: Camera Explorer Web UI (진행 중)

### 리서치 결과 (2026-02-12)

**서비스별 카메라 제어 비교**
| 서비스 | 카메라 제어 | 라이팅 제어 | API 상태 |
|--------|-----------|-----------|---------|
| Kling | ⭐⭐⭐⭐⭐ 6축 수치 파라미터 | ⭐⭐⭐ 프롬프트만 | 공식 API (크레딧) |
| VEO | ⭐⭐⭐⭐ 프롬프트 (해석 정밀) | ⭐⭐⭐⭐ 프롬프트 (해석 우수) | Gemini/Vertex AI |
| Grok | ⭐⭐⭐⭐ 프리셋+프롬프트 | ⭐⭐⭐⭐ Scene Control | 2026.01 출시 |

**PoC 방향**: Kling 단독 → 수치 카메라 제어 시연에 최적

### 구현 완료 (2026-02-12 17:20)

**코드**
- `adapters/gateways/kling_video.py` — Kling API 클라이언트 (JWT + 6축 카메라)
- `web/server.py` — FastAPI 백엔드 (generate/status/presets)
- `web/static/index.html` — Three.js 3D 프리뷰 + 슬라이더 UI
- `databases/knowledge/camera_presets.yaml` — 10개 카메라 프리셋 6축 매핑

**수정**
- `infrastructure/settings.py` — KLING_ACCESS_KEY/SECRET_KEY 추가
- `pyproject.toml` — fastapi, uvicorn, PyJWT 의존성

**아키텍처**
```
Browser (Three.js 3D + Sliders)
     │ POST /api/generate
     ▼
FastAPI (web/server.py)
     │ JWT Auth
     ▼
Kling API (6-axis camera + prompt lighting)
```

---

## Phase 5: Knowledge DB Supabase 이관 ✅

### 완료 (2026-01-28 15:30)

**Supabase 테이블**
- `knowledge_techniques` - 촬영 테크닉 레퍼런스 (30개 시딩 완료)
  - camera_language: 10개 (handheld, vertigo_effect, steadicam 등)
  - rendering_style: 10개 (chiaroscuro, oil_painting, neon_noir 등)
  - shot_grammar: 10개 (silhouette_reveal, push_in_realization 등)

**코드 구현**
- `adapters/knowledge_db/supabase_knowledge_db.py` - Supabase 구현체
- `scripts/seed_knowledge_db.py` - YAML → Supabase 시딩 스크립트

**문서**
- `specs/shot_types.md` - 샷 타입 약어 정의 (ECU, CU, MS, WS 등)

**Lore 데이터**
- `assets/lore/mountain_king.yaml` - Dark Romanticism + Horror (Grieg)
- `assets/lore/luterra_trailer.yaml` - Epic Fantasy (Lost Ark)

---

## Phase 4: Video Reference DB ✅

### 배포 완료 (2026-01-27 23:35)

**Supabase 테이블** (j-xcape's Project, ap-southeast-1)
- `videos` - 영상 메타데이터
- `shot_analysis` - 샷 분석 결과 (Knowledge DB 연결)
- `analysis_jobs` - 분석 작업 추적

**코드 구현**
- `domain/entities/video_reference/` - Video, ShotAnalysis 엔티티
- `usecases/interfaces/video_reference_db.py` - 인터페이스
- `adapters/video_reference_db/` - Supabase 구현
- `usecases/unified_knowledge_service.py` - Knowledge DB + Video DB 통합

**테스트 결과** ✅
1. Supabase 연결 - 성공
2. Video CRUD - 성공
3. ShotAnalysis CRUD - 성공
4. Human 검수 - 성공
5. 기법별 검색 - 성공

**문서**
- `docs/video_reference_db.md` - 사용 가이드

---

## Phase 3: AVA Framework 통합 ✅

### 신규 추가 컴포넌트

**AVA Framework (Anchor-Bridge-Expression)**
- `domain/entities/ava/` - Anchor, Expression 엔티티
- `domain/value_objects/ava/` - Mood, BridgeMode, EmotionalArc
- `usecases/ava/` - BridgeTranslator, ExpressionAdapter

**Music Domain**
- `domain/entities/music/music_metadata.py` - 음악 메타데이터 모델
- `usecases/music/music_to_anchor.py` - 음악 → Anchor 변환
- `usecases/music_to_video_adapter.py` - 전체 파이프라인 Facade

**Knowledge DB**
- `adapters/knowledge_db/yaml_knowledge_db.py` - YAML 기반 구현
- `databases/knowledge/*.yaml` - 30개 촬영 테크닉 데이터
  - camera_language.yaml (handheld, vertigo, steadicam 등)
  - rendering_style.yaml (chiaroscuro, film_grain_70s, oil_painting 등)
  - shot_grammar.yaml (silhouette_reveal, push_in_realization 등)

### 아키텍처

```
MusicMetadata
     │
     ▼
┌─────────────────────────────────────────────────────────────┐
│                     AVA FRAMEWORK LAYER                      │
│  Anchor ──▶ Bridge (Intuitive) ──▶ Expression               │
└─────────────────────────────────────────────────────────────┘
     │
     ▼
┌─────────────────────────────────────────────────────────────┐
│               EXISTING TALE PIPELINE                         │
│  StoryPumpup ──▶ L1 ──▶ L2 ──▶ L3 + KnowledgeDB ──▶ Veo    │
└─────────────────────────────────────────────────────────────┘
```

---

## Phase 0~2: 완료 ✅

- 프로젝트 초기화, 아키텍처 설계
- Clean Architecture 구현 (154 tests, 93% coverage)
- L1-L2-L3 파이프라인 통합

## Phase 2.5~2.6: 버그 수정 및 검증 ✅

- 버그 4건 수정 (BUG-001~004)
- APIKeyPool 통합

---

## 변경 이력

| 날짜 | 변경 내용 |
|------|-----------|
| 2026-01-17 | 프로젝트 초기화, MVP 스펙 확정 |
| 2026-01-17 | Clean Architecture 구현 완료 |
| 2026-01-20 | 파이프라인 통합, 버그 4건 수정 |
| 2026-01-21 | 버그 수정 검증 성공 |
| 2026-01-22 | 다음 단계 스펙 인터뷰, 문서 정리 |
| 2026-01-27 | AVA Framework 통합, Music→Video 파이프라인 |
| 2026-01-27 | Video Reference DB 구현, Supabase 배포, 통합 테스트 통과 |
| 2026-01-28 | Knowledge DB Supabase 이관, SupabaseKnowledgeDB 어댑터, Lore 데이터 구조화 |
| 2026-02-12 | 영상 생성 API 기술 리서치 (Kling/VEO/Grok), Camera Explorer Web UI 구현 |
