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

### P2-4: 샷 레벨 편집 (2026-03-06)
- [x] writer-store 확장 — shots[], selectedShotId, shot CRUD 액션 (selectShot, updateShot, dialogue 관리)
- [x] generate-scenes API — L2 Lite Shot Composer 추가 (씬당 4~6 샷 자동 생성, DB persist)
- [x] chat API — shotContext 추가 (선택된 샷 컨텍스트 포함)
- [x] 컴포넌트 분리 — scene-cards.tsx, writer-chat.tsx, shot-grid.tsx, shot-editor.tsx
- [x] page.tsx 리컴포즈 — 4개 컴포넌트 조합
- [x] 스펙 업데이트 — ux_pages.md P2 섹션 V3.1
- [x] `pnpm build` 통과

## Phase 4: P1 The Meeting Room (2026-03-06~)

> 브랜치: `feature/producer-writer-artist`
> 스펙: `specs/ux_pages.md` P1 섹션

### DoD
- [x] `/studio/producer` 진입 → 2컬럼 레이아웃 (좌: Meeting Chat, 우: Project Dashboard)
- [x] 채팅 전송 → POST `/api/produce/chat` → Gemini 응답 + Dashboard에 추론된 settings 실시간 반영
- [x] 텍스트 복붙 → storyText로 저장 (.txt 파일 업로드 UI 미구현)
- [x] Dashboard 위젯: Playtime, Genre, AspectRatio, ToneStyle — "Pending..." → 값 채워짐
- [x] "Hand over to Writer →" 클릭 → story_text + settings DB 저장 → `/studio/writer` 이동
- [x] P2 진입 시 story_text 불러와짐 (기존 loadProject 활용)
- [x] P2(Writer), P3(Artist) 기존 동작 변경 없음

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
- [x] Vercel Production 배포 완료

### 설계 메모
- 채팅 기록은 세션 전용 (Zustand 메모리). DB 저장 안 함
- DB에 저장되는 건 결과물만: `story_text` + `settings` (saveAndHandoff 시)

### 남은 DoD
- [x] 채팅 → Gemini 응답 + Dashboard settings 반영
- [x] Dashboard 위젯 Pending → Filled 전환
- [x] Handoff → DB 저장 + P2 이동 + story_text 수신
- [x] P2/P3 기존 동작 불변
- [ ] .txt 파일 업로드 UI (텍스트 복붙은 가능, 파일 업로드 미구현)

## Phase 5: P4 The Set — Director Agent (2026-03-06)

> 브랜치: `feature/producer-writer-artist`
> 스펙: `specs/ux_pages.md` P4 섹션 + `specs/layers/L2_shot_composer.md` + `specs/layers/L3_prompt_builder.md`

### P4-1: Cinematographic Inspector UI
- [x] `features/director/angle-control.tsx` — 6축 슬라이더 + CSS 3D 큐브
- [x] `features/director/key-light.tsx` — 조명 위치/밝기/색온도 컨트롤
- [x] `features/director/cinematographic-inspector.tsx` — Inspector 컨테이너
- [x] `director/page.tsx` — 3패널 레이아웃 (Scene Nav + Shot Grid + Inspector)
- [x] 슬라이더 조작 → store 실시간 반영

### P4-2: Director Kim Chat
- [x] `features/director/director-chat.tsx` — 하단 접이식 채팅 패널
- [x] `POST /api/director/chat` — Gemini Director Kim (촬영기법 추천)
- [x] `director-store.ts` 확장 — chatMessages, sendChatMessage, applySuggested

### P4-3: Knowledge DB + Generation API
- [x] `src/lib/knowledge.ts` — YAML 로더 + 기법 쿼리 (mood + shotType → techniques)
- [x] `POST /api/director/generate-shots` — L2+L3 체인 (scene → shots + Knowledge DB 기법 주입 + 프롬프트 생성)
- [x] `POST /api/director/generate-video` — Stub (Kling/Veo 키 확보 시 연결)
- [x] `director-store.ts` — generateVideo 액션
- [x] 빌드 통과

## Phase 6: P5 Lite Post-Production — Editor Agent (2026-03-06)

> 브랜치: `feature/producer-writer-artist`
> 스펙: `specs/ux_pages.md` P5 섹션

### P5-1: Store + UI
- [x] `editor-store.ts` — clips, clipOrder, reorder, trim, renderDraft
- [x] `features/editor/video-previewer.tsx` — 비디오 플레이어 (URL or placeholder)
- [x] `features/editor/scene-tabs.tsx` — SC_01~04 탭
- [x] `features/editor/shot-timeline.tsx` — 썸네일 타임라인 + HTML5 드래그 리오더 + 삭제
- [x] `features/editor/edit-toolbar.tsx` — 아이콘 플레이스홀더 (Post-MVP)
- [x] `editor/page.tsx` — Viewer + Timeline 레이아웃

### P5-2: API
- [x] `PATCH /api/editor/reorder` — 타임라인 순서 변경
- [x] `POST /api/editor/render-draft` — 순차재생 playlist JSON (MVP)
- [x] `VideoClip` 타입에 `trimStart`, `trimEnd` 추가
- [x] 빌드 통과

### 남은 작업
- [x] P4: mock 데이터 로드 → Inspector 슬라이더 조작 → 값 반영 확인
- [x] P4: Director Chat → Gemini 응답 수신 확인
- [x] P5: 씬 탭 전환 → 타임라인 표시 → 드래그 리오더 확인
- [x] P4/P5: Vercel 배포 후 동작 확인
- [ ] 영상 생성 API 키 확보 후 generate-video 연결 → Phase 8로 이동

## Auth: Google OAuth (2026-03-06)

> 브랜치: `feature/producer-writer-artist`

- [x] Supabase Auth Google OAuth provider 설정
- [x] DB 마이그레이션 — `workspaces.owner_id` 추가 + RLS 정책 owner 기반으로 변경
- [x] `/login` 페이지 + `/auth/callback` OAuth 라우트
- [x] `middleware.ts` — 세션 갱신 + 미인증 시 `/login` 리다이렉트
- [x] `getUser()` auth 헬퍼 + API 라우트 6개 auth guard 적용
- [x] Root layout에서 Sidebar 분리 → studio layout으로 이동
- [x] `project/init` — user 기반 workspace 자동 생성
- [x] Vercel 배포 환경에서 OAuth 콜백 동작 확인
- [x] Supabase Site URL + Redirect URLs에 `tale-ivory.vercel.app` 추가

## Phase 7: 사용자 관리 + 프로젝트 CRUD (2026-03-07~)

> 브랜치: `feature/producer-writer-artist`

- [x] **로그아웃** — User Menu 드롭다운에 로그아웃 버튼 + `signOut()` (`b5870f2`)
- [x] **Idle Timeout** — 30분 비활성 시 자동 로그아웃, 5분 전 경고 토스트 (`b5870f2`)
- [x] **프로젝트 목록** — User Menu 드롭다운에서 프로젝트 전환 (`7a4e840`)
- [x] **프로젝트 이름 변경** — 인라인 에디팅 (`7a4e840`)
- [x] **프로젝트 삭제** — 확인 다이얼로그 후 삭제 (`7a4e840`)
- [x] **새 프로젝트 생성** — User Menu에서 즉시 생성 (`7a4e840`)

## Phase 8: P4 Kling 영상 생성 API (2026-03-11~ WIP)

> 브랜치: `feature/producer-writer-artist`
> 상태: 코드 작성 완료, 미커밋

- [x] `src/lib/kling.ts` — JWT 토큰 생성 + 카메라값→자연어 변환
- [x] `src/app/api/director/generate-video/route.ts` — Kling API 호출 (I2V/T2V)
- [x] `src/app/api/director/generate-video/[taskId]/route.ts` — 폴링 엔드포인트 (5초 간격, 5분 타임아웃)
- [x] `director-store.ts` — generatingVideoShotId, 폴링 로직
- [ ] **Kling API 키 설정** — Vercel 환경변수 `KLING_ACCESS_KEY` + `KLING_SECRET_KEY` 필요
- [ ] **브라우저 검증** — Generate Video 버튼 → 영상 생성 → 상태 표시 확인

---

## 현재 상태 요약 (2026-03-11)

### 프로덕션 배포 완료 (동작 중)
- P1 Producer: 채팅 + 대시보드 + Handoff ✓
- P2 Writer: 씬 생성 + 샷 편집 + AI 채팅 ✓
- P3 Artist: Gemini Imagen 이미지 생성 ✓
- P4 Director: Inspector UI + Director Chat + Knowledge DB ✓
- P5 Editor: 타임라인 + 드래그 리오더 ✓
- Auth: Google OAuth + RLS ✓
- 프로젝트 CRUD + 로그아웃 + Idle Timeout ✓

### 미구현 / 부분 구현
| 항목 | 상태 | 비고 |
|------|------|------|
| P4 영상 생성 (Kling) | 코드 완료, 키 미설정 | Vercel 환경변수 필요 |
| P5 클립 순서 DB 저장 | 클라이언트만 동작 | Supabase shots.sort_order 업데이트 필요 |
| P5 Trim DB 저장 | UI 필드만 존재 | trimStart/trimEnd Supabase 미저장 |
| P5 Draft Render | JSON 플레이리스트만 | 실제 영상 합성 없음 |
| P1 .txt 파일 업로드 | UI 없음 | 텍스트 복붙만 가능 |
| P5 In-Painting/In-Pointing | 미구현 | Post-MVP |
| 음악 파형 싱크 | 미구현 | Post-MVP |
| AI 자동 평가 | 미구현 | Post-MVP |

### P1 DoD 브라우저 검증 (미확인)
- [ ] 채팅 → Gemini 응답 + Dashboard settings 반영
- [ ] .txt 파일 업로드 → storyText 저장
- [ ] Dashboard 위젯 Pending → Filled 전환
- [ ] Handoff → DB 저장 + P2 이동 + story_text 수신
- [ ] P2/P3 기존 동작 불변

---

## 🔴 최우선: Agent SDK 전환 (2026-03-16~)

> 현재 Gemini `generateContent` 직호출 6곳 → Claude Agent SDK 기반으로 전환

### 대상 API 라우트
| # | 라우트 | 현재 | 역할 |
|---|--------|------|------|
| 1 | `/api/produce/chat` | Gemini generateContent | P1 Producer Agent — 설정 추론 + 대화 |
| 2 | `/api/write/generate-scenes` | Gemini generateContent | P2 Pumpup + L1 Scene Architect 체인 |
| 3 | `/api/write/chat` | Gemini generateContent | P2 AI Writer 채팅 |
| 4 | `/api/director/chat` | Gemini generateContent | P4 Director Kim 촬영기법 추천 |
| 5 | `/api/director/generate-shots` | Gemini generateContent | P4 L2+L3 샷 생성 + Knowledge DB |
| 6 | `/api/generate/image` | Gemini Imagen | P3 이미지 생성 (별도 — LLM 아님) |

### 계획
- [ ] Agent SDK 공통 헬퍼 구성 (`src/lib/agent.ts`)
- [ ] #1 `/api/produce/chat` 전환
- [ ] #2 `/api/write/generate-scenes` 전환
- [ ] #3 `/api/write/chat` 전환
- [ ] #4 `/api/director/chat` 전환
- [ ] #5 `/api/director/generate-shots` 전환
- [ ] #6 이미지 생성은 Imagen 유지 (Agent SDK 대상 아님)
- [ ] 기존 동작 불변 검증 (P1→P5 E2E)

### 참고
- `#6 generate/image`는 Gemini Imagen (이미지 생성 모델)이므로 Agent SDK 전환 대상 아님
- 프롬프트/시스템 인스트럭션은 각 라우트에 이미 정의되어 있으므로 Agent tool 정의로 매핑

## Bugfix: 네비게이션 가드 + 플로우 안전장치 (2026-03-19)

> 브랜치: `feature/producer-writer-artist`

- [x] BUG-001: Sidebar `canNavigateTo()` 가드 — 미도달 탭 잠금
- [x] BUG-002: Producer `saveAndHandoff` 실패 시 이동 차단
- [x] BUG-003: Writer→Artist HandoffButton `disabled` 조건 (`shots.length === 0`)
- [x] BUG-004: Artist→Director, Director→Editor HandoffButton `disabled` 조건
- [x] BUG-005: Editor store `loadData()` — DB/upstream 로드 구현
- [x] BUG-006: 프로젝트 전환 시 5개 하위 스토어 `reset()` 호출
- [x] BUG-007: Director `useEffect` projectId 의존성 추가
- [x] BUG-008: Studio layout URL 감지 → 잠긴 스테이지 리다이렉트
- [x] BUG-009: Mock fallback 제거 → empty state 메시지 표시
- [x] `pnpm build` 통과

### 변경 파일
- `src/components/layout/sidebar.tsx` — canNavigateTo 가드 + disabled 스타일
- `src/components/layout/handoff-button.tsx` — current_stage DB 업데이트
- `src/stores/project-store.ts` — canNavigateTo 로직 변경 + resetChildStores()
- `src/stores/producer-store.ts` — saveAndHandoff → boolean + reset()
- `src/stores/writer-store.ts` — reset()
- `src/stores/artist-store.ts` — reset() + mock fallback 제거
- `src/stores/director-store.ts` — reset() + mock fallback 제거
- `src/stores/editor-store.ts` — loadData() DB/upstream 구현 + reset() + mock fallback 제거
- `src/app/studio/layout.tsx` — URL 감지 리다이렉트
- `src/app/studio/producer/page.tsx` — saveAndHandoff 결과 체크
- `src/app/studio/writer/page.tsx` — HandoffButton disabled
- `src/app/studio/artist/page.tsx` — HandoffButton disabled + empty state
- `src/app/studio/director/page.tsx` — HandoffButton disabled + empty state + projectId dep
- `src/app/studio/editor/page.tsx` — loadData() 사용 + empty state

## Backlog

- [ ] Kling API 키 확보 + Vercel 환경변수 등록
- [ ] P5 Editor: 클립 순서 Supabase 영속화
- [ ] P5 Editor: Trim 값 Supabase 영속화
- [ ] 전체 파이프라인 E2E 검증 (P1→P5 Mock 없이)

## Bugfix Log (2026-03-06)

- [x] **P1→P2 handoff 시 story_text 안 보이는 버그** — writer-store `loadProject()`에서 씬이 없으면 early return하여 story_text도 안 읽음. 씬 없을 때도 story_text/expanded_story 로드하도록 수정 (`fec381e`)
