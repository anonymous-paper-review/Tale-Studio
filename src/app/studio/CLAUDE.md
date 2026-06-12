# src/app/studio — Stage 라우트 공통 룰

## 라우트 5종

| URL | Feature |
|---|---|
| `/studio/producer` | `features/producer/` (Meeting Room) |
| `/studio/writer`   | `features/writer/`   (러프 스토리보드 — Writers' Room) |
| `/studio/artist`   | `features/artist/`  (L0 Concept Canvas) |
| `/studio/director` | `features/director/` (Director Canvas) |
| `/studio/editor`   | `features/editor/`   (Post-Production Lite) |

`layout.tsx`가 모든 공통 shell.

> **writer 탭 부활 (2026-06-12)**: 파이프라인은 여전히 `lib/writer` 백엔드가 producer 핸드오프
> (`/api/writer/start`)에서 백그라운드 실행해 DB(characters/scenes/locations/shots)를 채우고,
> 탭은 완료 후 러프 스토리보드(`shots.rough_storyboard`, 목각 인형 previz) 검토 단계.
> producer → **writer** → artist.

## Studio shell layout

```tsx
<Sidebar />                 // w-16 fixed left
<main className="ml-16 mr-80 min-h-screen">  // 좌 sidebar / 우 GlobalChat 여백
  <div className="flex h-screen flex-col">{children}</div>
</main>
<GlobalChat />              // w-80 fixed right (전 stage 공통 렌더 — layout.tsx:87, 조건부 hide 없음)
<Samantha />                // floating CTA
```

- 좌측 Sidebar `w-16`, 우측 GlobalChat `w-80`. `main`의 `ml-16 mr-80`은 이 두 fixed 패널의 공간 확보.
- 각 stage 페이지는 `<div className="flex h-screen flex-col">` 안에서 자유롭게 layout 구성.

## canNavigateTo 가드 (project-store)

`StudioLayout`의 useEffect가 URL ↔ `currentStage` 동기화 + 잠긴 stage 리다이렉트 수행:

```tsx
useEffect(() => {
  if (initLoading) return
  const stage = STAGES.find((s) => pathname.startsWith(s.path))
  if (!stage) return
  if (!canNavigateTo(stage.id as StageId)) {
    router.replace('/studio/producer')
    return
  }
  if (useProjectStore.getState().currentStage !== stage.id) {
    setStage(stage.id as StageId)
  }
}, [pathname, canNavigateTo, initLoading, router, setStage])
```

### TEMP 가드 해제 (2026-05-17~)

`canNavigateTo`는 **현재 항상 `true`** (검증 편의). 원본 로직은:

```ts
canNavigateTo: (stage) => {
  const { currentStage } = get()
  return getStageIndex(stage) <= getStageIndex(currentStage)
}
```

검증 완료 시 (Phase 11 검증 보드 OK) 원본 복원. 그 전까지 모든 stage 자유 진입 허용.

## Stage 전환 패턴

- Sidebar 클릭 → URL push (`/studio/<stage>`) → useEffect가 `setStage` 호출
- Stage handoff (producer → writer): producer CTA → `setStage('writer')` + `/api/writer/start` 백그라운드 발사 → writer 탭이 진행/러프 보드 표시
- **Stage 별 store는 자기 영역만** — cross-store import 금지 (project-store 외, decisions/stores 룰)

## 새 Stage 페이지 작업 시

1. `features/<stage>/`에 컴포넌트 작성
2. `src/app/studio/<stage>/page.tsx`에서 import + 단순 wrapper
3. 페이지 자체에서 sidebar/global-chat 그리지 않음 (`layout.tsx`가 처리)
4. `STAGES` (`src/lib/constants.ts`) 순서 변경 시 canNavigateTo 게이트 영향 — review 필요

## 안 건드릴 곳

- `src/components/layout/sidebar.tsx`, `global-chat.tsx`, `samantha.tsx` — 공유 컴포넌트, 변경 시 신중하게 편집
- `src/stores/project-store.ts` — 공유 컨테이너, 변경 시 PR 필요
