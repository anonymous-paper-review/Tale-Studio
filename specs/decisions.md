# Decisions

> 최종 수정: 2026-01-28 15:30

## 확정

### 13. Knowledge DB Supabase 이관
- **결정**: YAML 기반 Knowledge DB를 Supabase `knowledge_techniques` 테이블로 이관
- **구조**:
  - `technique_id`: 고유 ID (handheld, chiaroscuro 등)
  - `category`: camera_language / rendering_style / shot_grammar
  - `prompt_fragment`: 프롬프트에 삽입할 텍스트
  - `emotional_tags`: 감정 기반 검색용 배열 (GIN 인덱스)
  - `shot_type_affinity`: 샷 타입 매칭용 배열 (GIN 인덱스)
- **이유**: Video Reference DB와 동일 인프라 사용, 배열 검색 성능, 향후 확장성
- **어댑터**: `SupabaseKnowledgeDB` (YAML과 동일 인터페이스)
- **일자**: 2026-01-28

### 14. Lore 데이터 구조화
- **결정**: `assets/lore/*.yaml`에 테스트용 입력 데이터 저장
- **구조**: AVA Framework 기반 (anchor, style, characters, scenes)
- **파일**:
  - `mountain_king.yaml`: Dark Romanticism + Horror (클래식 음악)
  - `luterra_trailer.yaml`: Epic Fantasy (게임 lore)
- **이유**: 다양한 입력 소스 테스트, AVA Framework 범용성 검증
- **일자**: 2026-01-28

### 12. Video Reference DB 구현
- **결정**: Supabase 기반 영상 레퍼런스 DB, Knowledge DB(YAML)와 soft reference 연결
- **구조**:
  - `videos` 테이블: 영상 메타데이터 (URL, platform, status)
  - `shot_analysis` 테이블: 샷 단위 분석 (timestamp, technique_id, confidence)
  - `analysis_jobs` 테이블: 분석 작업 추적
- **연결 방식**: shot_analysis.technique_id → Knowledge DB YAML의 id (FK 없음, soft reference)
- **워크플로우**: pending → analyzed (LLM) → reviewed (Human)
- **Supabase**: j-xcape's Project (ap-southeast-1, second-brain org)
- **일자**: 2026-01-27

### 9. AVA Framework 통합
- **결정**: Anchor-Bridge-Expression 3레이어 아키텍처 도입
- **이유**: 음악/게임/스토리 등 다양한 입력 소스를 영상으로 변환하는 공통 프레임워크
- **구조**:
  - Anchor: 핵심 DNA (서사/감정/구조) - 입력 소스에서 추출
  - Bridge: 번역 전략 (Intuitive/Symbolic/Sensory 모드)
  - Expression: 시각 요소 (World/Actor/Style)
- **일자**: 2026-01-27

### 10. Music→Video 어댑터
- **결정**: MusicToVideoAdapter를 Facade로 구현, 기존 L1 파이프라인과 통합
- **이유**: 음악 메타데이터 → AVA → SceneArchitectInput 변환으로 기존 파이프라인 재사용
- **일자**: 2026-01-27

### 11. Knowledge DB 구현
- **결정**: YAML 기반 JSON 호환 구조, 30개 촬영 테크닉 초기 데이터
- **카테고리**: camera_language, rendering_style, shot_grammar
- **이유**: 간단한 MVP 시작, SQLite 마이그레이션 가능 구조 유지
- **일자**: 2026-01-27

### 1. 3-Level Architecture 역할 분리
- **결정**: L2는 스토리 요소(대사, 액션, 감정), L3는 연출 테크닉(카메라, 조명, 효과)만 담당
- **이유**: 관심사 분리 명확화, 각 레벨의 책임 범위 정의
- **일자**: 2026-01-22

### 2. L3 DB 목적
- **결정**: 유튜브 영상 분석 → 시네마틱 테크닉 DB (카메라워크, 조명, 효과 등)
- **이유**: L3 Prompt Builder의 프롬프트 품질 향상을 위한 레퍼런스
- **일자**: 2026-01-22

### 3. L1 펌프업 기능 (수정됨)
- **결정**: L1 입력 최적화 + Veo 시각화 정보 추가 (서사 보존 + 시각 정보 확장)
- **이유**:
  - "소설처럼 확장"은 잘못된 목표 (출력이 L1 입력으로 쓰임, 독자용 아님)
  - 실제 필요한 것: L1이 씬 분할하기 좋고, Veo가 그릴 수 있는 정보
- **일자**: 2026-01-23 (수정)

### 3-1. 펌프업 범위 제한
- **결정**: 캐릭터성/감정선 기반 표현 선택은 펌프업에서 제외
- **이유**:
  - 감정 표현은 맥락에 따라 수만 가지 방식 존재
  - 룰 기반 변환 불가능, LLM 판단에 맡겨야 함
  - 캐릭터 일관성 등은 상위 레벨(L2) 또는 별도 시스템에서 처리
- **펌프업이 하는 것**: 시간/조명, 장소 구체화, 물리적 동작, 환경 디테일
- **펌프업이 안 하는 것**: 감정→시각 표현 선택, 캐릭터성 반영
- **일자**: 2026-01-23

### 4. L2 대화 생성 기능
- **결정**: 대화 씬에서 대사 스크립트 자동 생성
- **이유**: 대화 씬의 완성도 향상
- **일자**: 2026-01-22

### 5. 영상 분석 방식
- **결정**: 반자동 (LLM 초안 + 사람 검토)
- **이유**: 완전 자동은 품질 불안정, 완전 수동은 비효율
- **일자**: 2026-01-22

### 6. 펌프업 참조 소스
- **결정**: LLM 상상력 + 원작 로어/설정 + 외부 자료 (있으면)
- **이유**: 다양한 소스 활용으로 품질 향상
- **일자**: 2026-01-22

### 7. 작업 우선순위
- **결정**: 문서화 → L1 펌프업 → L2 대화 → L3 DB
- **이유**: 현재 파이프라인 안정화 후 기능 확장
- **일자**: 2026-01-22

### 8. 펌프업 구현 세부사항
- **결정**:
  - 목표 분량: **1500자** (범위 1500~2000)
  - 로어 컨텍스트: **source_title로 웹검색** (외부 레퍼런스 있는 경우만)
  - 감정 단어: **배제** (변환 안 함, LLM 판단 로그만 기록)
- **이유**:
  - 분량: 너무 길면 L1 입력 복잡, 너무 짧으면 정보 부족
  - 로어: 애니/게임 등 기존 IP는 설정 정보 활용 가치 높음
  - 감정: 룰 기반 변환 불가, 패턴 파악 후 별도 시스템 검토
- **일자**: 2026-01-23

---

## 열린 논의

### [미결정] L2 대사 용도
> 상태: 미결정 | 추가일: 2026-01-22

**배경**: L2에서 생성된 대사가 최종 영상에 어떻게 반영되어야 하는가

**선택지**:
| 옵션 | 장점 | 단점 |
|------|------|------|
| A. 프롬프트 포함 | 별도 처리 불필요 | Veo 립싱크 품질 불확실 |
| B. TTS 생성 | 정확한 음성, 타이밍 제어 | 추가 파이프라인, 비용 |
| C. 자막 출력 | 구현 단순 | 몰입감 저하 |
| D. 하이브리드 | 유연성 | 복잡도 증가 |

**결정 조건**: Veo 립싱크 품질 테스트 후 결정

---

### [해결됨] L3 DB 영상 소스
> 상태: 해결 | 추가일: 2026-01-22 | 해결일: 2026-01-27

**결정**: 다양하게 혼합 (YouTube, 영화, 뮤비 등)
- Video Reference DB (Supabase) 구축 완료
- Knowledge DB (YAML)와 soft reference로 연결
- `platform` 필드로 소스 구분 (youtube, vimeo, local)

---

## 번복됨

(없음)
