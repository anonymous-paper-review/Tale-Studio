# project-share-demo-mode — Tasks

## 완료 — 파운데이션 (2026-07-14, 충돌 없는 신규/clean 파일만)

### seam
- [x] `src/lib/demo/context.ts` — `isDemoSession()`/`readDemoToken()`(demo_share 쿠키), 스냅샷 accessor, `DEMO_SHARE_COOKIE`
- [x] `src/lib/demo/supabase-shim.ts` — `createClient()` 데모 shim(select=스냅샷, update/insert/delete/upsert=no-op; eq/neq/in/match/order/limit/single/maybeSingle)
- [x] `src/lib/supabase/client.ts` — 데모면 shim, 아니면 실 브라우저 클라(분기)
- [c] `src/lib/demo/fetch-guard.ts` — `classifyDemoFetch`(순수·테스트됨) + `installDemoFetchGuard`(window.fetch 패치). ※ 앱 루트 install 배선 = 통합
- [x] 단위 테스트 `tests/demo-seam.test.ts` — shim 필터/정렬/no-op, fetch 분류, 서버가드, canned 커버리지 (통과)

### 스냅샷·데이터
- [x] DB migration `databases/migrations/031_project_shares.sql` (라이브 DB 수동 적용 대기)
- [c] `src/lib/demo/snapshot.ts` — 제네릭 빌더(project_id 스코프 테이블 전부 `select('*')` + inventory). 실 DB 실행 검증 대기
- [x] `src/lib/demo/types.ts` — `ProjectSnapshot`/`ProjectShareRow`
- [x] `src/lib/demo/canned.ts` — 스테이지별 canned 채팅

### 접근·라우트
- [x] `src/middleware.ts` — `/share` 공개 + `demo_share` 쿠키 시 `/studio` 열람 (`/api/*`는 matcher 제외라 자체 게이트)
- [c] `src/app/api/share/[token]/route.ts` — 토큰 게이트 스냅샷 GET(revoked/expired 거부). 실 DB 검증 대기
- [c] `src/app/api/share/route.ts` — 공유 CRUD(POST 생성+스냅샷, GET 목록, DELETE 취소; 소유자 검증). 실 DB 검증 대기
- [c] `src/app/share/[token]/page.tsx` — 링크 진입: 쿠키+스냅샷 로드→/studio 이동. ※ 전체 새로고침 재hydrate = 통합
- [c] `src/hooks/use-is-demo.ts` + `src/components/demo/{owner-only,demo-banner}.tsx` — 단일 게이트·배너

### 서버 방어
- [c] `src/lib/demo/guard-server.ts` — `demoWriteBlock(req)` 403 헬퍼(테스트됨). ※ 각 라우트 적용 = 통합

## ⛔ 대기 — 통합 배선 (다른 ultragoal 세션 커밋 후, 핫파일 위에 얹음)

> 그 세션이 producer→artist 이중생성 방지로 생성 트리거·`project-store`·`artist-store`·`layout`·`sidebar`·`generation-jobs`를 재작성 중. 아래는 그 최종본 위에 얹어야 정합.

- [ ] `project-store` 데모 hydrate 배선 (스냅샷→스토어; 전체 새로고침 시 쿠키 토큰으로 재fetch)
- [ ] 생성 액션(artist/director/writer) 데모 no-op 분기 — 걔네 최종 트리거 위에
- [ ] `studio/layout.tsx` — `<DemoBanner/>` + `installDemoFetchGuard()` 부팅 + 소유자 UI `<OwnerOnly>`
- [ ] `sidebar.tsx` — 소유자 nav `<OwnerOnly>` + "공유" 버튼/팝오버 배치
- [ ] `global-chat-store` 채팅 척 — 서버 호출 대신 `cannedFor(stage)`
- [ ] 생성·쓰기 라우트에 `demoWriteBlock(req)` 적용 (generate-*·*/chat·assets/upload*·editor/*)
- [ ] 편집 잠금(Q6a): 노드 드래그 persist off·필드 read-only·카드 편집 비활성
- [ ] 한 프로젝트 락(다른 프로젝트 진입 차단)

## Verification
- [ ] e2e(Skip 모드): 실브라우저 `/share/<token>` → 로그인 없이 열림, 5스테이지 네비, 채팅 척, 재생성 no-op, 실 DB/외부 API 무호출을 네트워크 탭으로 확인
- [ ] 서버 가드: `demo_share` 쿠키로 `/api/*/generate-*` 직접 호출 시 403
- [ ] 취소·만료 링크 접근 거부

## Notes
- 데모는 스냅샷에 **이미 있는 산출물**만 진짜처럼 보인다 — 리얼하게 보일 스테이지는 공유 전 채워둘 것.
- 미디어 URL은 public Storage(무인증 fetch 가능) 전제. 비공개 버킷이면 서명 URL 스냅샷 필요(별도 처리).
- UI 내성: 데모는 데이터 seam(2경계)에서만 가로챔 → 순수 비주얼·신규 read 컴포넌트는 자동 상속. 상세 = proposal.md §UI 변경 내성.
