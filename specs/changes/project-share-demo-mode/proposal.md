---
change: project-share-demo-mode
status: active
created: 2026-07-14
decisions: [57]
---

# 프로젝트 공유 — 읽기전용 데모/뷰어 모드

## Why

웹 디자이너 등 비-소유자에게 프로젝트를 Notion처럼 링크로 공유해, **로그인 없이 앱을 실제처럼 눌러보게** 하고 싶다. 단 LLM·이미지·영상 생성과 DB 쓰기는 **절대 실행되면 안 된다**(fal/Claude 비용·데이터 오염 방지). 현재 백엔드 접근이 `fetch('/api/...')`와 `createClient().from(...)` 직접 호출 **두 경계로 흩어져** 있어(스토어 ~24개 파일) "fetch만 가로채기"로는 중립화가 불완전하다 → 단일 `isDemo` 씸(seam)이 필요하다. 데모는 "상류 변경으로 하류를 자동 재생성하지 않는다"는 데이터 원칙(decisions #57)과 정합한다(재생성 버튼 = no-op).

## What Changes

- **접근(Q1: 링크 가진 사람 누구나)**: 공개 `/share/<token>` 라우트 + `middleware.ts` `isPublicPath` 허용. `project_shares` 테이블(추측불가 token, expires_at, revoked_at). 진입 시 httpOnly `demo_share` 쿠키만 세팅(로그인 X). 취소·만료 지원.
- **데이터(Q2: 스냅샷 고정)**: 공유 시점 프로젝트 전체(projects/characters/locations/scenes/shots/video_clips/messages/editor_state 등)를 스냅샷으로 캡처·저장. 미디어는 기존 public Storage URL 그대로 참조(복제 불요). 데모는 이후 소유자 편집과 격리(라이브 반영 안 함).
- **백엔드 중립화(핵심)**: 단일 `isDemo` 씸.
  - `fetch('/api/...')` 클라 가드: read→스냅샷/share 엔드포인트, write·generate→실행 안 함(스크립트 응답), non-/api·blob은 통과.
  - `createClient()` 데모 shim: `.select` 계열=스냅샷 반환, `.update/insert/delete`=no-op(`{data:null,error:null}`).
  - 서버 방어(defense-in-depth): `/api/*` 생성·쓰기 라우트는 `demo_share` 쿠키면 403 하드차단(예산 보호).
- **채팅 척(Q3: canned)**: 데모에선 서버 호출 없이 유저 메시지 append → typing 애니 → 스테이지별 고정 답변.
- **생성 척(Q4: 단순화)**: 재생성/생성 버튼 = no-op. 누르면 press/spinner 애니만 잠깐, **기존 스냅샷 이미지/영상 그대로 유지**(새 결과물 생성·reveal 없음). 빈 산출물은 아무것도 지어내지 않음.
- **UX·범위(Q5·Q6)**: producer/writer/artist/director/editor **5스테이지 전부** 열되 **한 프로젝트에 락**. 상단 "미리보기 · 실제 생성 비활성" 배너/워터마크. 소유자 전용 UI(프로젝트 스위처·새 프로젝트·로그아웃·공유버튼) 숨김. hover/클릭/네비/채팅 타이핑만 허용, **실제 편집(노드 드래그 persist·필드 수정·카드 편집)은 잠금**.
- **공유 생성(Q7: 앱 내 버튼)**: 소유자 앱에 "공유" 버튼 — 링크 생성·복사·취소(Notion식 팝오버).

## Impact

- Affected specs: 없음(신규 capability — 본 change의 `deltas/project-share.md`가 요구사항·수용 시나리오 캐넌). 구현은 코드 source-of-truth.
- Affected code: `src/middleware.ts`, `src/app/share/`(신규), `src/app/api/share/`(신규), `src/app/api/*/generate-*`·`*/chat`(데모 가드), `src/app/studio/layout.tsx`(배너·소유자 UI 게이트), `src/lib/demo/`(신규 — 씸·스냅샷·canned), `src/lib/supabase/client.ts`(데모 shim 분기), `src/components/*`(공유 버튼·배너).
- Affected stores: `global-chat-store.ts`(채팅 척), 생성 액션 보유 스토어(artist/director/writer) 데모 no-op 경유, `project-store.ts`(데모 부팅 hydrate).
- Affected decisions: #57(정합 — 자동 재생성 금지), #22(기술 스택 내).
- Affected DB: 신규 `project_shares`(+스냅샷 저장 = jsonb 컬럼 또는 `share_snapshots`/storage 번들). Supabase migration.

## UI 변경 내성 (decoupling)

데모는 **UI 아래의 데이터 경계에서만** 가로챈다. 2026-07-14 코드 확인: 클라→백엔드 경계는 `fetch('/api/...')` + `createClient().from(...)` **2개뿐** — Server Action(`'use server'`) 0건, 클라 직접 AI SDK(fal/anthropic/genai) 0건, WebSocket·EventSource·Supabase realtime 0건. 따라서:

- **UI 업뎃 = 데모 작업 0인 범위**: 순수 비주얼/레이아웃/애니메이션/스타일, 그리고 기존 스토어·`fetch`·`createClient`로 데이터 읽는 새 컴포넌트 → 데모 동작 자동 상속.
- **UI 커질 때 손대는 3지점(스펙으로 자동화)**:
  1. UI가 새 테이블/컬럼을 읽기 시작 → 스냅샷 빌더가 담아야 함. **완화**: 스냅샷을 allowlist가 아니라 project_id 스코프 테이블 제네릭 덤프로 → 새 테이블 자동 포함.
  2. 새 소유자 전용 컨트롤 추가 → 데모에서 숨김. **완화**: `useIsDemo()` 훅 + `<OwnerOnly>` 래퍼 단일 게이트로 통일(새 버튼 = 한 줄 opt-in).
  3. 누가 Server Action/클라 SDK/WebSocket을 신규 도입 → seam 우회 가능(현재 0건). **완화**: "백엔드 접근은 /api or createClient로만" 컨벤션 유지.
- **백스톱**: 서버 403 가드. 클라 seam이 새 UI를 놓쳐도 최악은 "데모 버튼 무동작"(미관)이지 예산 소모·DB 오염 아님 — 실제 `/api` 호출은 서버가 끊는다.
