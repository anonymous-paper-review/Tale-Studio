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

### 다음 예정
- P2 The Script Room (P3 인터페이스 확정 후)
- P1 The Meeting Room (P2 인터페이스 확정 후)
