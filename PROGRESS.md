# PROGRESS.md

> 최종 수정: 2026-01-28 15:30

## 프로젝트: Tale (AI Video Generation Pipeline)

### 현재 상태: Phase 5 진행 중 (Knowledge DB Supabase 이관)

---

## Now

- [x] Knowledge DB Supabase 이관 완료 (2026-01-28)
- [x] Lore 데이터 구조화 (2026-01-28)
- [ ] 음악 → 영상 파이프라인 실제 테스트
- [ ] 영상 레퍼런스 수집 시작

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
