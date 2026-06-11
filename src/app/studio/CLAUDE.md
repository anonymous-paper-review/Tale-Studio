# src/app/studio — Stage 라우트 공통 룰

## 라우트 4종

| URL | Feature |
|---|---|
| `/studio/producer` | `features/producer/` (Meeting Room) |
| `/studio/artist`   | `features/artist/`  (L0 Artist Card Studio — 카드형 Tabs) |
| `/studio/director` | `features/director/` (Director Canvas) |
| `/studio/editor`   | `features/editor/`   (Post-Production Lite) |

`layout.tsx`가 모든 공통 shell.

> writer는 UI 없는 백엔드 스테이지 — 상세는 루트 `CLAUDE.md` §URL→디렉토리 (중복 서술 금지).

## Studio shell layout

```tsx
<Sidebar />                 // w-16 fixed left
<main className="ml-16 mr-80 min-h-screen">  // 좌 sidebar / 우 GlobalChat 여백
  <div className="flex h-screen flex-col">{children}</div>
</main>
<GlobalChat />              // w-80 fixed right (전 stage 공통 렌더, 조건부 hide 없음)
<Samantha />                // floating CTA
```

- 좌측 Sidebar `w-16`, 우측 GlobalChat `w-80`. `main`의 `ml-16 mr-80`은 이 두 fixed 패널의 공간 확보.
- 각 stage 페이지는 `<div className="flex h-screen flex-col">` 안에서 자유롭게 layout 구성.

## canNavigateTo 가드 (project-store)

계약만 (구현은 `src/stores/project-store.ts`가 진실 — 코드 블록 복제 금지):

- `StudioLayout`의 useEffect가 URL ↔ `currentStage` 동기화 + 잠긴 stage는 producer로 리다이렉트.
- **순차 잠금 현행**: 도달한 최고 단계(`reachedStage`)까지만 진입 허용. 다음 단계는 handoff가
  `setStage`로 `reachedStage`를 전진시켜 연다. (옛 "항상 true" TEMP 해제는 원복 완료 — 2026-06)

## Stage 전환 패턴

- Sidebar 클릭 → URL push (`/studio/<stage>`) → useEffect가 `setStage` 호출
- Stage handoff (producer → artist): producer CTA → `setStage('artist')` + `/api/writer/start` 백그라운드 발사 (writer UI 없음)
- **Stage 별 store는 자기 영역만** — cross-store import 금지 (architecture rule §4)

## 새 Stage 페이지 작업 시

1. `features/<stage>/`에 컴포넌트 작성
2. `src/app/studio/<stage>/page.tsx`에서 import + 단순 wrapper
3. 페이지 자체에서 sidebar/global-chat 그리지 않음 (`layout.tsx`가 처리)
4. `STAGES` (`src/lib/constants.ts`) 순서 변경 시 canNavigateTo 게이트 영향 — review 필요

## 안 건드릴 곳

- `src/components/layout/sidebar.tsx`, `global-chat.tsx`, `samantha.tsx` — 공유 컴포넌트, 변경 시 신중하게 편집
- `src/stores/project-store.ts` — 공유 컨테이너, 변경 시 PR 필요
