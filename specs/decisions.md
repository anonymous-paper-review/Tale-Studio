# Decisions

> 최종 수정: 2026-02-12 17:20

## 확정

### 19. Camera Explorer PoC 기술 선택
- **결정**: Kling API 단독 + 룰 기반 매핑 + 독립 웹 UI
- **배경**: 영상 생성 API 3종(Kling/VEO/Grok) 기술 검증 리서치 수행
- **선택 근거**:
  | 항목 | 결정 | 이유 |
  |------|------|------|
  | API | Kling 단독 | 유일하게 6축 수치 카메라 파라미터 제공 |
  | 변환 방식 | 룰 기반 매핑 | camera_presets.yaml에서 직접 매핑. 빠르고 결정적 |
  | UI 방식 | 3D 프리뷰 + 슬라이더 | Three.js로 카메라 앵글 실시간 시각화 |
  | 기술 스택 | HTML+Vanilla JS + FastAPI | 빌드 없이 단일 파일, 빠른 시연 |
  | 통합 방식 | 독립 스크립트 | 기존 L1-L3 파이프라인 변경 없음 |
- **기각한 대안**:
  - VEO/Grok 비교: 범위 넓어지고, 카메라 수치 제어는 Kling만 가능
  - LLM 변환: 비결정적, PoC에서는 오버엔지니어링
  - 파이프라인 통합: VideoGenerator 인터페이스 변경 불필요
- **일자**: 2026-02-12

### 20. Kling 6축 카메라 파라미터 매핑
- **결정**: Knowledge DB camera_language 10개를 Kling 6축 값으로 수동 매핑
- **파일**: `databases/knowledge/camera_presets.yaml`
- **Kling 축 정의** (공식 API):
  | 축 | 범위 | 동작 |
  |----|------|------|
  | horizontal | -10~+10 | 카메라 좌(-)/우(+) 슬라이드 |
  | vertical | -10~+10 | 카메라 하(-)/상(+) 슬라이드 |
  | pan | -10~+10 | 피치 하(-)/상(+) 회전 |
  | tilt | -10~+10 | 요 좌(-)/우(+) 회전 |
  | roll | -10~+10 | 롤 반시계(-)/시계(+) |
  | zoom | -10~+10 | 화각 좁(-)/넓(+) |
- **주의**: Kling의 pan/tilt 명명이 일반 시네마토그래피와 반대 (pan=pitch, tilt=yaw)
- **일자**: 2026-02-12

### 17. Veo 프롬프트 최적화 (삽질 기록)
- **결정**: Veo 프롬프트는 **150자 이내**, 8초 영상에 맞게 **핵심 액션만** 기술
- **배경**: 여러 번의 시행착오를 거쳐 도달한 결론
- **삽질 과정**:
  | 시도 | 문제 | 결과 |
  |------|------|------|
  | v1: 400자 상세 프롬프트 | 앞부분만 반영, 뒷부분 무시 | 정적인 장면만 생성 |
  | v2: "POV shot moving forward" 추가 | 카메라 움직임 설명만, 피사체 정적 | 카메라만 움직임 |
  | v3: 짧은 프롬프트 + 동시 액션 | 핵심만 150자 이내 | ✅ 성공 |
- **핵심 교훈**:
  1. **길이 제한**: 8초 영상 = 앞부분 100-150자만 유효
  2. **동시 서술**: 카메라 움직임 + 피사체 움직임을 한 문장에
  3. **정적 표현 금지**: "stand in formation" → "walk toward camera"
  4. **구체적 동사**: "approaches" → "walk toward camera"
- **좋은 예시**:
  ```
  Camera glides forward through stone arches. White-robed hooded
  figures with masks walk toward camera in silent procession.
  Warm golden sunlight. Cinematic.
  ```
- **나쁜 예시**:
  ```
  Slow cinematic dolly forward through a western-style stone cloister.
  Romanesque arches create frame-within-frame composition, each arch
  revealing the next. Warm golden afternoon sunlight streams through
  the colonnade. Large lush green trees visible through the arches.
  In the far distance, small white-robed hooded figures approach in
  silent formation... (이하 무시됨)
  ```
- **추가 발견**:
  - cinematography 필드는 Veo가 잘 못 읽음 (scene_context에 통합 권장)
  - negative_prompts는 효과 불분명 (짧게 유지)
  - style_keywords도 짧게 (2-3개 max)
- **일자**: 2026-01-28

### 18. 영상 연출 기법 선택
- **결정**: 스토리라인 확장보다 **4샷 고급 연출**로 진행
- **배경**: 2분 영상에 복잡한 스토리 넣기보다 연출 밀도 높이기
- **선택한 기법**:
  | 샷 | 기법 | 설명 |
  |---|---|---|
  | 1 | 돌리 인 + 프레임인프레임 | 아치 통과하며 전진, 행렬 다가옴 |
  | 2 | 로우앵글 + 실루엣 | 바닥에서 올려다봄, 역광, 긴 그림자 |
  | 3 | 리플렉션 + 랙포커스 | 물에 비친 가면 → 실제로 초점 이동 |
  | 4 | 오버헤드 + 그림자 | 위에서, 큰 나무 그림자 속으로 사라짐 |
- **비주얼 톤 변경**: 벚꽃 → 큰 나무 + 초록 + 따뜻한 빛 (봄~초여름)
- **일자**: 2026-01-28

### 15. Analyzer vs Adapter 역할 분리
- **결정**: 분석기(Analyzer)와 어댑터(Adapter)는 분리된 레이어로 구현
- **역할 구분**:
  - **Analyzer**: 원본 소스 분석 → raw features 추출 (무거움, 교체 가능)
  - **Adapter**: raw features → 통일된 형식(Anchor)으로 정규화 (가벼움)
- **이유**:
  - Single Responsibility Principle
  - Analyzer는 구현체 교체 빈번 (Spotify API, librosa, Gemini Audio 등)
  - Adapter는 순수 변환 로직, 테스트 용이
- **현재 상태**: `MusicToAnchor`는 Adapter 역할. Analyzer는 미구현.
- **일자**: 2026-01-28

### 16. 음악 Analyzer 우선순위 결정
- **결정**: 음악 Analyzer(AudioAnalyzer) 구현 우선순위 **낮음**
- **배경**:
  - 현재 `MusicMetadata.mood_tags`는 수동 입력 (자동화 아님)
  - 진정한 "음악 → 영상" 자동화에는 AudioAnalyzer 필요
- **유스케이스 분석**:
  | 시나리오 | 설명 | Analyzer 필요 |
  |----------|------|---------------|
  | A: "이 음악 써줘" | 스토리 → 영상 → 음악 배경으로 | ❌ |
  | B: "음악으로 스토리 만들어줘" | 음악 → 스토리 추출 → 영상 | ✅ |
- **결론**: 시나리오 B(뮤비 특화) 외에 Analyzer 필요한 유스케이스 불분명
- **향후 방향**: 필요 시 optional 모듈로 구현
- **일자**: 2026-01-28

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
