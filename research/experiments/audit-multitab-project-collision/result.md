# `audit-multitab-project-collision` 조사 결과

- 조사일: 2026-08-18
- 범위: 프로젝트 ID의 생성·복원·전환, URL 스테이지 이동, `localStorage`·`sessionStorage`·Zustand `persist`, 에이전트(스테이지) 이동 경로
- 모드: 읽기 전용. 코드 수정 0건, 운영 데이터 쓰기 0건, 생성·유료 호출 0건
- 테스트·린트·포맷터: 실행하지 않음(티켓 조건)

## 한 줄 판정

**공유 값이 두 탭의 현재 프로젝트를 실시간으로 덮어쓰는 구조는 아니다.** 각 탭의 `useProjectStore` 메모리는 분리되어 있다. 다만 스테이지 이동 주소가 잠시 `?projectId` 없이 만들어지고, 새로 마운트된 탭이 그 순간의 **origin-wide `localStorage['tale:last-project-id']` 마지막 기록**을 복원 힌트로 쓰면, A/X가 Y로 부팅될 수 있다. 같은 SPA 레이아웃이 유지되는 보통의 클릭에서는 레이아웃이 X를 주소에 다시 써서 이 경로가 닫힌다.

## 진실원과 공유 상태

| 층 | 읽기·쓰기 | 프로젝트 격리 | A/X ↔ B/Y 영향 |
|---|---|---|---|
| 서버 DB | `projects`, `characters`, `locations`, `scenes`, `shots`, 메시지 등은 호출자가 보낸 `projectId`로 조회·수정. 예: `src/app/api/project/init/route.ts:7`, `src/app/api/artist/generate-sheet/route.ts:60-75,128-135` | `project_id`/`id` 조건과 소유권 검사 | 서버는 ID가 맞으면 격리. 잘못된 ID가 들어오면 잘못된 프로젝트가 합법적으로 표시됨 |
| 현재 프로젝트 | `src/stores/project-store.ts:125-168`의 Zustand 메모리. `initProject`, `switchProject`, `createNewProject`가 `projectId`를 set (`:200-201`, `:244-263`, `:304-318`) | 브라우저 탭(자바스크립트 런타임)별 메모리 | B가 X를 직접 덮지는 않음. 단 탭이 새로 시작되면 아래 복원 경로를 다시 탐 |
| URL ID | `src/app/studio/layout.tsx:55-63`가 `?projectId`를 읽음. 레이아웃은 `:70-91`에서 현재 ID를 URL에 다시 씀 | 주소마다 독립 | URL에 X가 있으면 공유 마지막 값보다 우선. ID가 없을 때만 공유 fallback이 개입 |
| 마지막 프로젝트 힌트 | `src/lib/session-restore.ts:26-45`의 고정 키 `tale:last-project-id`; 레이아웃이 `src/app/studio/layout.tsx:75-76`에서 모든 탭마다 기록 | **없음**(origin의 한 키) | A가 X를 쓰고 B가 Y를 쓰면 마지막 기록 Y. 새로 부팅하는 A가 쿼리 없이 시작하면 Y를 읽을 수 있음 |
| 디렉터 캔버스 캐시 | `src/stores/director-store.ts:3070-3085`, 이름 `tale-director-v1-default`; `projectId`와 노드/엣지를 저장. `setProjectId`가 `:1039-1063`에서 프로젝트 전환 시 메모리 캐시를 비움 | 캐시 키는 공유지만 `projectId` 필드·전환 reset·DB hydrate로 보정 | B의 reset/저장이 공유 캐시를 바꿀 수 있음. A의 현재 메모리는 즉시 바뀌지 않지만 A 새로고침 때 옛 캐시가 잠깐 보일 위험이 남음 |
| 에셋 캐시 | `src/stores/asset-storage-store.ts:75-205`, 이름 `tale-asset-storage-v1-default`; 각 record에 `projectId`가 있고 `:123-131`에서 프로젝트별 필터 | record의 `projectId` 필터와 `reset` | 공유 캐시. 현재 화면은 프로젝트 필터를 사용하지만 탭별 last-project 선택과 결합되면 잘못된 projectId를 기준으로 읽을 수 있음 |
| 채팅·Writer·Artist·Producer 메모리 | `src/stores/global-chat-store.ts`, `writer-store.ts`, `artist-store.ts`, `producer-store.ts`는 `persist` 없음. 프로젝트 전환 때 `src/stores/project-store.ts:84-110`의 `resetChildStores()`가 비움 | 정상 전환 시 reset 후 DB reload | 다른 탭의 런타임 상태를 직접 공유하지 않음. 같은 탭의 빠른 전환에서는 비동기 응답이 옛 상태를 덮는 별도 위험(아래 확인 불가 지점) |

서버의 대표 소유권 경계는 `src/app/api/project/init/route.ts:7`(URL ID 읽기), `:51-67`(워크스페이스+요청 ID 일치 조회), `:70-104`(불일치/권한 밖이면 최신 프로젝트 fallback 또는 신규 생성)이다.

## URL 및 에이전트(스테이지) 이동 경로

### 프로젝트를 여는 진입점(쿼리 ID를 명시하는 경로)

1. 프로젝트 목록: `src/app/projects/page.tsx:197-202`
   ```tsx
   switchProject(project.id, project.title, stage as StageId)
   router.push(`/studio/${stage}?projectId=${project.id}`)
   ```
2. 로그인 사용자 메뉴 전환: `src/components/layout/user-menu.tsx:87-92`
   ```tsx
   switchProject(p.id, p.title)
   router.push(`/studio/producer?projectId=${p.id}`)
   ```
3. 공유 링크: `src/app/share/[token]/page.tsx:34-43`
   ```tsx
   const pid = snapshot?.projectId
   router.replace(
     pid
       ? `/studio/producer?projectId=${encodeURIComponent(pid)}&${ticket}`
       : `/studio/producer?${ticket}`,
   )
   ```
4. 루트의 옛 프로젝트 목록도 같은 동작: `src/app/page.tsx:252-257`.

### 레이아웃의 부팅·동기화 순서

원문(`src/app/studio/layout.tsx:52-63`):
```tsx
// mount: URL ?projectId 힌트로 프로젝트 복원 → 없으면 localStorage 마지막 본 프로젝트
// → 그것도 없으면 store가 최신 fallback.
useEffect(() => {
  const hint =
    typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('projectId')
      : null
  initProject(hint ?? readLastProjectId() ?? undefined)
}, [initProject])
```

`initProject`는 `src/stores/project-store.ts:200-201`에서 이미 메모리 ID가 있으면 즉시 반환한다.
그렇지 않으면 `:244-247`의 `restoreId`를 `/api/project/init?projectId=...`로 전달하고, 없으면 `/api/project/init`으로 최신 fallback을 요청한다. 서버가 요청 ID를 찾지 못하거나 권한 밖으로 보면 `src/app/api/project/init/route.ts:67-84`에서 최신 프로젝트를 반환한다.

부팅 후 주소와 마지막 힌트를 쓰는 원문(`src/app/studio/layout.tsx:70-91`):
```tsx
// store.projectId ↔ URL ?projectId 동기화.
useEffect(() => {
  if (!projectId || typeof window === 'undefined') return
  // 마지막 본 프로젝트 기록 — 쿼리 없는 재진입(북마크/홈) 시 복원 힌트
  writeLastProjectId(projectId)
  const params = new URLSearchParams(window.location.search)
  const projectSynced = params.get('projectId') === projectId
  if (projectSynced && shareSynced) return
  params.set('projectId', projectId)
  window.history.replaceState(null, '', `${pathname}?${params.toString()}`)
}, [projectId, pathname])
```

### 스테이지/에이전트 탭 이동 경로

사이드바의 클릭·Alt 단축키는 모두 `goToStage`로 모인다(`src/components/layout/sidebar.tsx:76-88`). 실제 목적지에는 현재 프로젝트 ID가 붙지 않는다.

```tsx
navigateWithStageSlide(pathname, stage.path, () =>
  router.push(withDemoShare(stage.path)),
)
```

일반 세션에서 `withDemoShare(stage.path)`는 그대로 `/studio/artist`, `/studio/director` 같은 경로다(`src/lib/demo/context.ts:72-76`). 채팅 핸드오프도 같은 누락 경로다.

- 직접 제안 이동: `src/components/layout/global-chat.tsx:674-679`
  ```tsx
  const path = await handoffToStage(action.targetStage)
  if (path) navigateWithStageSlide(pathname, path, () => router.push(path))
  ```
- `handoffToStage`는 현재 store ID로 DB stage를 올리고, ID 없는 `target.path`만 반환: `src/lib/stage-nav.ts:15-31`.
- 채팅으로 보낸 핸드오프는 `src/stores/global-chat-store.ts:311-318`에서 당시의 `projectId`를 잡고, 성공 경로를 `:416-422`에서 잠시 뒤 `pendingNavigatePath`로 저장한다. GlobalChat이 `src/components/layout/global-chat.tsx:359-367`에서 다시 `router.push(pendingNavigatePath)`한다. 이 경로도 ID를 붙이지 않는다.

레이아웃이 SPA로 유지되는 정상 클릭에서는 새 `pathname`을 본 `:70-91` effect가 현재 메모리 ID X를 URL에 다시 써서 `/studio/artist?projectId=X`로 만든다. 따라서 **클릭 한 번만으로 곧바로 Y가 되는 것은 코드 순서상 확정되지 않는다.** 쿼리 없는 순간에 새로고침·탭 복제·하드 네비게이션이 끼어야 아래 충돌 경로가 열린다.

## A/X·B/Y 재현 시나리오와 정확한 순서

### 재현 가능한 충돌 조건(새 부팅/복원 경로)

전제: 같은 origin, 프로젝트 X/Y가 같은 사용자 워크스페이스에 존재한다고 가정한다.

1. **탭 A를 X로 연다.** `/studio/producer?projectId=X` → A 레이아웃이 `hint=X`를 읽고 `initProject(X)`를 호출한다(`layout.tsx:55-63`, `project-store.ts:244-263`). 부팅 후 A가 `localStorage['tale:last-project-id']='X'`를 쓴다(`layout.tsx:75-76`, `session-restore.ts:39-45`).
2. **탭 B를 Y로 연다.** `/studio/producer?projectId=Y` → B는 Y를 메모리에 넣고 같은 고정 키에 `Y`를 쓴다. A 메모리에는 계속 X가 있다(공유 `localStorage`가 React/Zustand 메모리를 실시간 변경하는 코드는 이 저장소에 없다; `src` 안에 `storage` 이벤트 리스너도 없음).
3. **A에서 Artist/Director 등 에이전트 탭을 누른다.** `sidebar.tsx:76-88` 또는 채팅의 `global-chat.tsx:674-679`가 `/studio/artist` 같은 ID 없는 경로를 push한다.
4. **정상 SPA라면** 같은 `StudioLayout`이 살아 있고 현재 ID X를 주소와 last-project에 다시 쓴다(`layout.tsx:70-91`). 이 완료 뒤 곧바로 새로고침하면 X가 복원되므로 여기서는 Y가 표시되지 않는다.
5. **Y를 마지막 writer로 만드는 순서:** A의 이동 후 B를 새로고침하거나 다른 stage로 한 번 이동해 B 레이아웃이 Y를 다시 `tale:last-project-id`에 쓴다. 또는 A의 ID-less push 직후 URL sync effect가 실행되기 전에 A를 새로고침하는 좁은 타이밍이면 B의 기존 Y가 남는다. 이 시점에서 A 주소가 `/studio/artist`처럼 ID 없이 새로 부팅된다(브라우저 새로고침, 쿼리 없는 북마크/직접 입력, 라우트가 레이아웃을 새로 만든 경우).
6. A 초기 effect의 `hint`는 `null`이고 `readLastProjectId()`가 Y를 반환한다(`layout.tsx:55-63`, `session-restore.ts:26-35`). A는 `/api/project/init?projectId=Y`로 부팅한다(`project-store.ts:244-247`). 서버는 Y를 소유한 프로젝트로 돌려준다(`api/project/init/route.ts:51-67`). A store가 Y를 set하고(`project-store.ts:250-263`), URL sync가 `/studio/artist?projectId=Y`를 확정한다(`layout.tsx:75-91`). 이제 화면에 Y가 보인다.

### URL ID와 공유 상태의 우선순위

- **URL에 `projectId=X`가 남아 있으면:** 레이아웃은 X를 먼저 읽으므로 공유 마지막 값 Y보다 URL X가 우선한다.
- **URL 쿼리가 없으면:** `localStorage['tale:last-project-id']`가 사용된다. A/B가 같은 키를 번갈아 쓰므로 마지막 writer(Y)가 승리한다.
- **URL ID가 틀렸거나 권한 밖이면:** 서버가 요청 ID를 거부하고 최신 프로젝트를 fallback한다(`api/project/init/route.ts:67-84`). 이때 최신이 Y이면 주소와 화면이 Y로 맞춰지는 것은 “공유 상태 충돌”이 아니라 서버 fallback 결과다.
- **이미 store ID가 있는 SPA에서 URL만 Y로 바꿔도:** `initProject`의 `if (get().projectId) return`(`project-store.ts:200-201`) 때문에 Y를 읽지 않고, URL sync가 메모리 X를 다시 쓴다. 이는 URL보다 메모리 store가 우선하는 별도 불일치다.

## 저장소별 상세 감사

### `localStorage`

1. **가장 직접적인 충돌원 — 프로젝트 복원 키**
   - `src/lib/session-restore.ts:28-45`: `const LAST_PROJECT_KEY = 'tale:last-project-id'`, `getItem`/`setItem`.
   - 탭·프로젝트·에이전트로 나눈 키가 아니며, A/B의 `writeLastProjectId`가 서로 덮는다.
2. **프로젝트 ID로 네임스페이스 된 값(직접적인 X/Y 충돌은 낮음)**
   - 편집기: `src/lib/editor-persistence.ts:16-43,67-72`, 키 `tale:editor:v1:${projectId}`.
   - Writer 엔진: `src/lib/writer/engine.ts:5-35`, 키 `tale-studio:writer-engine:${projectId}`.
   - Director 안내: `src/app/studio/director/page.tsx:894-912`, 키 `director:${key}:${guideProjectId}`.
3. **프로젝트와 무관한 UI 값**
   - Artist 확대: `src/app/studio/artist/page.tsx:70-101`, `artist:zoomLevel:characters/world`.
   - Writer 확대: `src/features/writer/rough-storyboard-view.tsx:104-132`, `writer:zoomLevel`.
   - 이 값들은 Y의 데이터를 보여주지는 않지만 탭 A/B에서 마지막 UI 설정이 공유된다.
4. **공유 Zustand persist 키**
   - Director: `tale-director-v1-default` (`director-store.ts:3070-3085`), Asset: `tale-asset-storage-v1-default` (`asset-storage-store.ts:202-204`). 아래 Zustand 절 참조.

### `sessionStorage`

- 유일한 프로젝트 관련 사용은 핸드오프 측정값이다.
  - 기록: `src/stores/producer-store.ts:790-795`
    ```tsx
    sessionStorage.setItem(`handoffStartedAt:${projectId}`, String(Date.now()))
    ```
  - 읽기: `src/app/studio/artist/page.tsx:229-240`
    ```tsx
    const t0 = sessionStorage.getItem(`handoffStartedAt:${projectId}`)
    ```
- 키 자체에는 ID가 들어가며 `sessionStorage`는 브라우저 탭별 저장소이므로 A/B가 같은 값을 공유하는 경로는 코드상 확인되지 않았다. 이는 프로젝트 선택 진실원이 아니고 시간 로그용이다. 새 탭을 `window.open`으로 복제할 때의 브라우저별 sessionStorage 초기 복제 여부는 이 저장소에서 확인할 수 없다(앱에 `window.open` 경로도 검색되지 않음).

### Zustand `persist`

| 파일·줄 | persist 이름 | 실제 내용 | 충돌 평가 |
|---|---|---|---|
| `src/stores/chat-ui-store.ts:45-75` | `tale-chat-ui` | `chatWidth`, `collapsed`만 `partialize` | 탭 간 UI 폭/접힘 공유. 프로젝트 ID 없음 |
| `src/stores/writer-ui-store.ts:26-49` | `tale-writer-ui` | `activeTab`만 `partialize`; `v2Available`는 비영속 | 탭 간 Writer 내부 탭 선택 공유. Y 데이터 자체는 아님 |
| `src/stores/asset-storage-store.ts:75-205` | `tale-asset-storage-v1-default` | characters/worlds 전체(각 record에 `projectId`) | 공유 캐시. `list*ByProject`와 Director 필터가 방어하지만, 잘못 부팅된 ID를 기준으로 보면 잘못된 프로젝트 화면이 정상 조회됨 |
| `src/stores/director-store.ts:1017-1070,3070-3085` | `tale-director-v1-default` | 노드·엣지·viewport·`projectId` | 공유 캐시. `setProjectId`는 이전 캐시를 비우고 `hydrationEpoch`를 올림(`:1039-1063`); DB hydrate도 현재 ID/token을 확인(`:1128-1132,1193-1195`) |

`project-store` 자체에는 `persist`가 없다. 따라서 “프로젝트 ID를 persist가 실시간 공유해 Y로 바꾼다”는 증거는 없다. 실제 공유되는 핵심은 고정 `localStorage` 마지막 ID와 두 개의 고정 persist 캐시다.

## 화면 데이터 로딩에서 확인된 방어와 별도 레이스

- Producer/Writer/Artist 로더는 현재 `useProjectStore.getState().projectId`를 캡처해 DB를 `eq('project_id', projectId)`로 읽지만, 응답 후 현재 ID가 여전히 같은지 확인하는 공통 가드가 모든 로더에 있지는 않다. 예: `src/stores/producer-store.ts:910-918`, `writer-store.ts:897-907`, `artist-store.ts:406-417`.
- GlobalChat은 `src/components/layout/global-chat.tsx:359-362`에서 ID가 바뀔 때 `loadMessages(projectId)`를 부르며, `src/stores/global-chat-store.ts:267-308`의 응답 적용에 현재 ID 비교가 없다. **같은 탭에서 X→Y를 빠르게 전환하면 X 메시지 응답이 Y 화면을 덮는 별도 same-tab 레이스 가능성**은 코드상 남아 있다. 이는 A/B의 `localStorage` 충돌과는 다른 문제이며, 이 조사는 네트워크 타이밍을 실행해 확정하지 않았다.
- Director는 반대로 `src/stores/director-store.ts:1130-1132,1193-1195`에서 `hydrationEpoch`와 현재 `projectId`를 검사하는 방어가 확인된다.

## 해결 후보(코드 수정은 하지 않음)

### 후보 1 — 스테이지 이동 URL에 현재 프로젝트 ID를 항상 붙인다 (우선 후보)

`sidebar.tsx:85-86`, `global-chat.tsx:367`, `global-chat.tsx:678`, `stage-nav.ts:31`의 target을 `/studio/<stage>?projectId=${currentId}` 형태로 만들고, 기존 `share` 쿼리는 별도로 보존한다.

- 장점: 브라우저 탭마다 주소가 X/Y를 계속 들고 있어 새로고침·복제·북마크에서도 선택이 결정적이다. `localStorage` 마지막 값은 보조 fallback으로 남겨도 충돌 창이 닫힌다.
- 단점: 이동 공통 함수가 현재 ID를 받아야 하고, 데모 `share` 쿼리·URL 인코딩·이미 쿼리가 있는 경로를 함께 처리해야 한다. ID 없는 주소를 외부에서 직접 열 때의 fallback 정책은 여전히 남는다.

### 후보 2 — 마지막 프로젝트 힌트를 `sessionStorage`로 탭별 분리

`session-restore.ts:26-45`의 `localStorage`를 `sessionStorage`로 바꾸거나, URL이 없는 경우 탭별 값만 사용한다.

- 장점: A의 X와 B의 Y가 마지막 힌트를 서로 덮지 않는다. 변경 범위가 작다.
- 단점: 주소에 ID가 없는 새 탭은 빈 저장소라 최신 fallback으로 갈 수 있고, 브라우저/복제 탭의 sessionStorage 초기화 동작에 의존한다. “어디서든 마지막 프로젝트 복원”이라는 기존 UX가 약해진다. URL 누락 자체는 고치지 않는다.

### 후보 3 — persist 캐시를 프로젝트별 키로 만들거나 프로젝트 ID를 저장 제외

Director/Asset의 고정 이름(`tale-*-default`)을 프로젝트 ID별 저장 키로 바꾸거나, DB가 진실인 노드·에셋 캐시를 persist하지 않는다.

- 장점: B가 쓰거나 reset한 공유 캐시가 A의 새 부팅에 섞이는 면적을 줄인다. 캐시가 프로젝트 경계를 명시적으로 갖는다.
- 단점: 동적 persist storage 생성·마이그레이션·오래된 키 정리가 필요하다. 이 후보만으로는 `tale:last-project-id` URL 복원 충돌을 해결하지 못한다.

### 후보 4 — 라우트 자체에 프로젝트 ID를 포함

예: `/studio/<projectId>/<stage>`로 바꾸어 stage path에 ID가 없을 수 없게 한다.

- 장점: URL이 단일 진실원이 되고 Next 라우터 레벨에서 탭 격리가 드러난다.
- 단점: 모든 `STAGES` path, middleware의 보호/공유 경로, 로그인 `next`, 링크·테스트·프리페치·데모 URL을 일괄 마이그레이션해야 한다. 현재 레이아웃의 query 동기화와도 계약이 겹친다.

### 후보 5 — ID 캡처 로더의 응답 가드 공통화

Producer/Writer/Artist/GlobalChat 로더가 응답 적용 전에 `useProjectStore.getState().projectId === capturedProjectId`를 확인하고, 탭 이동 시 취소/무효화한다.

- 장점: 같은 탭의 X→Y 빠른 전환에서 낡은 응답이 새 화면을 덮는 문제를 직접 막는다. Director가 이미 쓰는 `hydrationEpoch` 방식과 맞는다.
- 단점: A/B의 고정 localStorage 마지막 ID 충돌은 해결하지 않는다. 보조 방어로만 필요하다.

## 확인 불가·재현 시 한계

- 이 결과는 소스 정적 조사다. 브라우저 두 탭을 실제로 열어 새로고침·라우트 커밋 사이의 타이밍을 실측하지 않았다(티켓상 테스트/실행 금지).
- `router.push('/studio/artist')` 뒤 같은 `StudioLayout`이 유지되는 SPA 클릭에서는 `layout.tsx:70-91`이 X를 재기록한다. 따라서 “A에서 클릭하는 즉시 Y”는 확정할 수 없고, **ID 없는 URL에서 새 부팅이 일어나는지**가 재현의 핵심 조건이다.
- 레이아웃이 새로 마운트되는 구체적 브라우저/Next 런타임 조건, 새로고침이 URL sync effect보다 먼저 일어나는 정확한 시간 창은 코드만으로 측정할 수 없다.
- 탭을 복제하는 방식에 따른 `sessionStorage` 초기 복제는 브라우저 구현 문제이며 이 앱 코드에는 새 탭을 여는 `window.open` 호출이 없다.
- 같은 탭에서 비동기 로더 응답이 뒤집히는 문제는 코드상 가능성을 적었지만, 실제 X 응답/Y 응답 순서는 확인하지 않았다.

## 파일:줄 원문 색인

- URL 읽기·fallback 호출: `src/app/studio/layout.tsx:55-63`
- URL/last-project 쓰기: `src/app/studio/layout.tsx:70-91`
- last-project 키: `src/lib/session-restore.ts:28-45`
- ID 없는 사이드바 이동: `src/components/layout/sidebar.tsx:76-88`
- 채팅 이동 소비: `src/components/layout/global-chat.tsx:359-367,674-679`
- 핸드오프 target: `src/lib/stage-nav.ts:15-31`
- init early return/restore: `src/stores/project-store.ts:200-201,244-263`
- 프로젝트 전환 reset: `src/stores/project-store.ts:84-110,297-318`
- 서버 URL ID/fallback: `src/app/api/project/init/route.ts:7,51-84`
- sessionStorage timing: `src/stores/producer-store.ts:790-795`, `src/app/studio/artist/page.tsx:229-240`
- persist 이름·내용: `src/stores/chat-ui-store.ts:45-75`, `src/stores/writer-ui-store.ts:26-49`, `src/stores/asset-storage-store.ts:75-205`, `src/stores/director-store.ts:1017-1070,3070-3085`
- Director 현재-ID hydrate 방어: `src/stores/director-store.ts:1128-1132,1193-1195`

한 줄 요약: **URL에 프로젝트 ID를 붙이지 않은 에이전트 탭 이동이 새로 부팅되면, 탭 전체가 공유하는 `tale:last-project-id`의 마지막 값(Y)이 A의 X를 대신할 수 있으므로 URL ID 상시 유지가 가장 직접적인 해결 후보다.**
