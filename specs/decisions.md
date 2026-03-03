# Decisions

> 최종 수정: 2026-03-03
> 레거시 아카이브: `specs/archive/decisions_legacy_2026-03-03.md`

## 확정

### 28. MVP 범위 P1~P5 전체 포함
- **결정**: MVP를 P3+P4+P5 Lite → **P1~P5 (P5 Lite)** 로 확장. P1/P2 Mock 대체 전략 폐기
- **변경 요약**:
  - P1 The Meeting Room: **포함** (Producer Agent 대화 수집)
  - P2 The Script Room: **포함** (Writer Agent + L1 Pipeline 씬 분할)
  - P3~P5: 기존 그대로 유지
- **P5**: Lite 유지 (In-Painting/In-Pointing/음악 싱크는 Post-MVP)
- **폐기**: DataProvider Mock 패턴 (P1/P2가 실제 구현되므로 불필요)
- **근거**: 전체 파이프라인 구현이 제품 가치 전달에 필수. P1/P2 없이는 데모 불가
- **일자**: 2026-03-03

### 27. P5 Post-Production MVP Lite 포함
- **결정**: P5를 Lite 범위로 MVP에 포함
- **MVP 포함**: 비디오 프리뷰 + 타임라인 (씬별 탭, 샷 썸네일) + Crop + 순서 편집 + Draft 렌더링
- **MVP 제외**: In-Painting, In-Pointing, 음악 Waveform 싱크, AI 품질 평가
- **근거**: P3 범위 축소(탭3개→2컬럼)로 여유 발생 + V2에서 P5 디자인 확정(image5.png) + 파이프라인 완성 필요
- **일자**: 2026-03-03

### 26. P4 Storyboard 통합 (Shot Node Grid-Mindmap)
- **결정**: 기존 P3 Storyboard 탭을 P4로 이동. P4 = Scene Navigator + Shot Node Grid-Mindmap + Cinematographic Inspector + Director Chat
- **V1 P4**: 탭 기반 (Cinematographic / Shot Frames / Music)
- **V2 P4**: 3패널 통합. Shot Frames 탭 제거 → Grid 내 Frame Mode로 대체
- **추가 요소**: Director Kim Chat (AI 촬영 가이드, Inspector 실시간 연동), Lens Combo 캐러셀, Lighting Sphere UI
- **근거**: V2 디자인 (reference_v2/image4.png). 스토리보드와 촬영 설정을 한 화면에서 작업
- **일자**: 2026-03-03

### 25. P3 에셋 전용 범위 축소
- **결정**: P3를 에셋 전용으로 축소. Storyboard 탭 제거 → P4로 이동
- **V1 P3**: 3탭 (Char / Stage / Storyboard)
- **V2 P3**: 2컬럼 단일 화면 (Character Consistency + World Model)
- **추가 요소**: Asset Locking (캐릭터 일관성 고정), Cinematic Boost 필터
- **근거**: V2 디자인 (reference_v2/image3.png). 에셋과 스토리보드 관심사 분리
- **일자**: 2026-03-03

### 24. V2 MVP 범위 재정의 및 디자인 시스템
- **결정**: MVP를 P3+P4 → **P3+P4+P5(Lite)**로 확장. V2 글로벌 디자인 시스템 적용
- **디자인 시스템**: Netflix Dark (#121212) + Accent (#E50914/#7A285E) + 5 Agent 사이드바 + Samantha 플로팅 + Handoff 버튼 패턴
- **Stage 이름**: The Meeting Room / The Script Room / The Visual Studio / The Set / Post-Production Suite
- **네비게이션**: 영상생성 전까지 이전 Stage 자유 복귀 가능
- **근거**: reference_v2 전체 (docs.md + image1~5), open_questions.md 닫힌 질문 23개 반영
- **일자**: 2026-03-03

### 23. 코드베이스 리셋 및 MVP 스코프
- **결정**: 구 코드 전체 삭제, P3+P4만 MVP로 개발 → **V2에서 P3+P4+P5 Lite로 확장 (#24)**
- **이유**: 코드베이스 거의 재작성 필요. P1/P2 미정사항 과다, P3/P4가 핵심 가치
- **MVP 포함**: ~~P3 Pre-viz (Char/Stage/Storyboard) + P4 Director (Cinematographic/Shot Frames)~~ → #24로 대체
- **MVP 제외**: P1 Ground, P2 Story Writer, P4 Music, ~~P5 Editor~~ → P5 Lite 포함 (#27)
- **일자**: 2026-02-25 (V2 수정: 2026-03-03)

### 22. 프론트엔드 스택
- **결정**: Next.js + Vercel
- **대안**: React + Vite + Vercel
- **선택 근거**: API Routes 내장으로 프론트+백엔드 통합 가능. Vercel 배포 간편. P3/P4의 복잡한 상태 관리(샷 목록, 6축 카메라, Three.js) 대응
- **일자**: 2026-02-25

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
- **삽질 과정**:
  | 시도 | 문제 | 결과 |
  |------|------|------|
  | v1: 400자 상세 프롬프트 | 앞부분만 반영, 뒷부분 무시 | 정적인 장면만 생성 |
  | v2: "POV shot moving forward" 추가 | 카메라 움직임 설명만, 피사체 정적 | 카메라만 움직임 |
  | v3: 짧은 프롬프트 + 동시 액션 | 핵심만 150자 이내 | 성공 |
- **핵심 교훈**:
  1. **길이 제한**: 8초 영상 = 앞부분 100-150자만 유효
  2. **동시 서술**: 카메라 움직임 + 피사체 움직임을 한 문장에
  3. **정적 표현 금지**: "stand in formation" → "walk toward camera"
  4. **구체적 동사**: "approaches" → "walk toward camera"
- **추가 발견**:
  - cinematography 필드는 Veo가 잘 못 읽음 (scene_context에 통합 권장)
  - negative_prompts는 효과 불분명 (짧게 유지)
  - style_keywords도 짧게 (2-3개 max)
- **일자**: 2026-01-28

### 14. Lore 데이터 구조화
- **결정**: `assets/lore/*.yaml`에 테스트용 입력 데이터 저장
- **구조**: AVA Framework 기반 (anchor, style, characters, scenes)
- **파일**:
  - `mountain_king.yaml`: Dark Romanticism + Horror (클래식 음악)
  - `luterra_trailer.yaml`: Epic Fantasy (게임 lore)
- **이유**: 다양한 입력 소스 테스트, Mock DataProvider에서 사용
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

### 12. Video Reference DB 구현
- **결정**: Supabase 기반 영상 레퍼런스 DB, Knowledge DB와 soft reference 연결
- **구조**:
  - `videos` 테이블: 영상 메타데이터 (URL, platform, status)
  - `shot_analysis` 테이블: 샷 단위 분석 (timestamp, technique_id, confidence)
  - `analysis_jobs` 테이블: 분석 작업 추적
- **연결 방식**: shot_analysis.technique_id → Knowledge DB의 id (FK 없음, soft reference)
- **워크플로우**: pending → analyzed (LLM) → reviewed (Human)
- **일자**: 2026-01-27

---

## 파이프라인 설계 (Post-MVP 구현 예정)

### 3. L1 펌프업 기능
- **결정**: L1 입력 최적화 + Veo 시각화 정보 추가 (서사 보존 + 시각 정보 확장)
- **이유**: L1이 씬 분할하기 좋고, Veo가 그릴 수 있는 정보 필요
- **일자**: 2026-01-23

### 3-1. 펌프업 범위 제한
- **결정**: 캐릭터성/감정선 기반 표현 선택은 펌프업에서 제외
- **펌프업이 하는 것**: 시간/조명, 장소 구체화, 물리적 동작, 환경 디테일
- **펌프업이 안 하는 것**: 감정→시각 표현 선택, 캐릭터성 반영
- **일자**: 2026-01-23

### 8. 펌프업 구현 세부사항
- **결정**: 목표 1500자 (1500~2000), source_title로 웹검색, 감정 단어 배제
- **일자**: 2026-01-23

### 6. 펌프업 참조 소스
- **결정**: LLM 상상력 + 원작 로어/설정 + 외부 자료 (있으면)
- **일자**: 2026-01-22

### 4. L2 대화 생성 기능
- **결정**: 대화 씬에서 대사 스크립트 자동 생성
- **일자**: 2026-01-22

### 1. 3-Level Architecture 역할 분리
- **결정**: L2는 스토리 요소(대사, 액션, 감정), L3는 연출 테크닉(카메라, 조명, 효과)만 담당
- **이유**: 관심사 분리 명확화, 각 레벨의 책임 범위 정의
- **일자**: 2026-01-22

### 2. L3 DB 목적
- **결정**: 영상 분석 → 시네마틱 테크닉 DB (카메라워크, 조명, 효과 등)
- **이유**: L3 Prompt Builder의 프롬프트 품질 향상을 위한 레퍼런스
- **일자**: 2026-01-22

---

## 번복됨

(없음)
