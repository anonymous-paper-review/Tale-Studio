# Progress

## Phase 0: 코드베이스 클렌징 (2026-02-25)

- [x] 구 코드 전체 삭제 (adapters, domain, usecases, web, scripts, infrastructure, tests)
- [x] specs/ 정비 완료 (overview + layers + ava_framework + decisions)
- [x] API 레퍼런스 코드 보존 (specs/reference/code/)
- [x] 비즈니스 문서 정리 (docs/infrastructure, docs/internal/strategy)
- [x] Knowledge DB + assets 보존

## Phase 1: 보일러플레이트 + 구조 (2026-03-03)

- [x] Next.js 프로젝트 초기화 — 공유 타입, 레이아웃, Mock, Stub 페이지
- [x] URL 라우트 통일 — meeting/script/visual/set/post → producer/writer/artist/director/editor
- [x] README 셋업 가이드 추가

## Phase 2: P3 The Visual Studio (2026-03-03~)

> 브랜치: `feature/producer-writer-artist`
> 스펙: `specs/ux_pages.md` P3 섹션

### P3-1: UI 완성 (Mock 데이터)
- [x] 2컬럼 레이아웃 — Character Consistency (좌) + World Model (우)
- [x] 캐릭터 카드 — 3뷰(Front/Side/Back) 그리드 + Lock 토글
- [x] Generate Sheet 버튼 + 로딩 상태
- [x] World Model — Wide Shot + Establishing Shot 카드
- [x] Cinematic Boost 필터 칩
- [x] 이미지 placeholder (Mock URL/빈 상태)

### P3-2: API 연동
- [x] `POST /api/generate/image` 라우트 (Gemini Imagen)
- [x] artist-store 확장 — 이미지 URL 저장, 생성 상태, generateWorldAsset
- [x] Generate Sheet → API 호출 → 이미지 표시 연동
- [x] Generate Background 버튼 + 월드 이미지 생성
- [x] Cinematic Boost → 프롬프트 반영
- [x] 에러/로딩 상태 처리
- [x] 문서 업데이트 (DALL-E → Gemini Imagen)

## Phase 3: P2 The Script Room (2026-03-05~)

> 브랜치: `feature/producer-writer-artist`
> 스펙: `specs/ux_pages.md` P2 섹션 + `specs/layers/L1_scene_architect.md`

### DoD
- [ ] 스토리 입력 → Auto-Generate Scenes → Gemini LLM (Pumpup + Scene Architect) → 기승전결 4씬 카드 표시
- [ ] 씬 카드 클릭 → Scene Detail Editor 표시 (Location, Time of Day, Key Conflict, Description)
- [ ] Scene Detail Editor 필드 수정 → store 즉시 반영 (Auto-Save)
- [ ] AI Writer 채팅 패널 — Gemini 대화로 씬 구성 논의
- [ ] "Ask Concept Artist →" Handoff → artist 페이지 + sceneManifest 전달
- [ ] 생성 중 로딩 상태, 에러 시 메시지 표시
- [ ] 기존 P3 동작 깨지지 않을 것

### P2-1: API + Store
- [x] `POST /api/write/generate-scenes` (Pumpup + Scene Architect 체인)
- [x] `POST /api/write/chat` (AI Writer 채팅)
- [x] `writer-store.ts` — storyText, sceneManifest, selectedScene, generating/error 상태

### P2-2: UI
- [x] 스토리 입력 영역 + Auto-Generate Scenes 버튼
- [x] 씬 카드 4개 (기승전결) 가로 배열 + 선택 강조
- [x] Scene Detail Editor (Location, Time of Day, Mood, Description)
- [x] AI Writer 채팅 패널
- [x] Auto-Save 표시
- [x] Handoff 버튼 → artist

### P2-3: P3 연결
- [x] artist-store → writer-store의 sceneManifest 수신 (loadData)
- [x] project-store 기본 stage → writer로 조정

## Phase 4: P1 The Meeting Room (2026-03-06~)

> 브랜치: `feature/producer-writer-artist`
> 스펙: `specs/ux_pages.md` P1 섹션

### DoD
- [x] `/studio/producer` 진입 → 2컬럼 레이아웃 (좌: Meeting Chat, 우: Project Dashboard)
- [ ] 채팅 전송 → POST `/api/produce/chat` → Gemini 응답 + Dashboard에 추론된 settings 실시간 반영
- [ ] 텍스트 복붙 또는 .txt 파일 업로드 → storyText로 저장
- [ ] Dashboard 위젯: Playtime, Genre, AspectRatio, ToneStyle — "Pending..." → 값 채워짐
- [ ] "Hand over to Writer →" 클릭 → story_text + settings DB 저장 → `/studio/writer` 이동
- [ ] P2 진입 시 story_text 불러와짐 (기존 loadProject 활용)
- [ ] P2(Writer), P3(Artist) 기존 동작 변경 없음

### P1-1: Store + API
- [x] `producer-store.ts` — chatMessages, storyText, projectSettings, sendChatMessage, uploadFile, saveAndHandoff
- [x] `POST /api/produce/chat` — Gemini Producer Agent (설정 추론 + structured JSON 추출)

### P1-2: UI
- [x] `features/producer/meeting-chat.tsx` — 채팅 UI + 파일 업로드
- [x] `features/producer/project-dashboard.tsx` — 설정 위젯 4개 + Logline
- [x] `producer/page.tsx` — 2컬럼 조립 + Handoff 버튼

### P1-3: 연결
- [x] `project-store.ts` — 기본 stage `'writer'` → `'producer'` (DB 기본값과 일치)
- [x] 빌드 통과
