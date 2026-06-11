---
change: unify-director-store-db
status: active
created: 2026-06-05
decisions: [14, 15, 43, 47]
---

# Director 데이터 일원화 — DB 단일 진실 + 스토어 통합

## Why

현재 Director 데이터가 **두 곳으로 갈라져** 있다:

- **DB** (`shots`/`scenes`/`video_clips`) — writer 파이프라인이 채우는 캐넌. 옛 `director-store`가
  카메라/조명 편집을 여기에 debounce 저장. editor 등 다른 스테이지가 읽음.
- **localStorage** (`director-store`, key `tale-director-v1-default`) — 새 노드 그래프
  전체(노드 위치/테이크/override/엣지/카메라/조명)를 통째 저장. **DB에 안 씀.**

문제:
1. **Drift** — 새 Director 캔버스에서 카메라/조명/브랜치를 편집해도 DB `shots`엔 안 들어감 →
   editor 등이 읽는 캐넌과 어긋남. seed는 1회뿐이라 시간이 갈수록 벌어짐.
2. **스토어 2개** — `director-store`(옛, 780줄)와 `director-store`(새)가 공존. 옛것은
   `editor-store`(핸드오프 fallback) + `global-chat-store`(legacy 채팅 분기)가 의존해 못 지움(#47).
3. **B2B 제품인데 화면 데이터가 브라우저 로컬** — 기기/사용자 간 공유·서버 영속 불가.

## What Changes (방향)

**끝그림: DB = 단일 진실. `director-store`가 유일한 Director 스토어. localStorage는 캐시로 강등.**

### Step 0 — canvas-store 샷 편집 write-through (마이그레이션 0, 즉효)
- `director-store.updateNodeData`가 Shot의 camera/lighting/cameraPreset/prompt를 바꾸면
  → `shots` 테이블에 debounce 저장(옛 `director-store.debouncedShotSave` 패턴 재사용).
- 키 = 노드의 `writerShotId`(=`shots.shot_id`). writerShotId 없는(캔버스 수동생성) 노드는 Step 2까지 skip.
- 컬럼 이미 존재(007 적용: camera_config/lighting_config/camera_brand/focal_length/aperture/white_balance, prompt).

### Step 1 — director-store 제거 (스토어 통합, #47 후속)
- `editor-store` fallback을 `director-store` → **DB 직접 읽기**로 교체.
- `global-chat-store`의 legacy director 분기 제거 (canvas 모드만 유지 — 이제 항상 DB hydrate).
- `director-store.ts` 삭제. 내부 #14 종결.

### Step 2 — 그래프 구조까지 DB-back (완전 일원화)
- 마이그레이션 **005 적용** (scenes/shots/video_clips `canvas_position`, video_clips `is_final`/`take_label`/`override`).
  ⚠️ decision #43("005 불필요, localStorage 유지")을 **의식적으로 번복** — 노선이 DB로 전환됨. 새 결정으로 기록.
- hydrate: 진입 시 `video_clips`를 Video 테이크로, `canvas_position`을 노드 좌표로 DB에서 로드.
- write-back: 노드 위치/테이크 추가/override/final → DB. localStorage는 **순수 캐시**(없어도 DB 복원).

## Impact
- Affected code: `src/stores/director-store.ts`(hydrate+write-through), `src/stores/editor-store.ts`,
  `src/stores/global-chat-store.ts`, `src/features/director/hooks/use-writer-director-sync.ts`(hydrate 확장),
  `src/app/api/director/*`(필요 시 video_clips persist 라우트)
- Affected stores: `director-store`(메인), `director-store`(삭제), `editor-store`/`global-chat-store`(의존 이전)
- Affected DB: 005 적용 (canvas_position 등). shots는 컬럼 기존.
- Affected decisions: #14(종결), #15(실현), **#43 번복**, #47(연속)

## 비결합 / 트레이드오프
- **단방향만**: canvas→DB write-through + DB→canvas 1회 hydrate. 우리가 드롭한 *양방향 라이브 sync*(#44)는 여전히 안 함.
- **충돌**: 멀티 디바이스 동시편집 last-write-wins(debounce). 단일 사용자 MVP엔 충분.
- **#43 번복**: 결정 로그에 "localStorage→DB 노선 전환" 명시(decisions-archive 인덱스).

## Verification gate (archive 조건)
- tasks.md의 모든 [c] → [x]
- (Step 0) 캔버스에서 샷 카메라/조명 편집 → 새로고침/다른 경로(editor)에서 동일 값 (DB 반영 확인)
- (Step 1) director-store 삭제 후 editor 로드 + 채팅 정상, tsc/lint clean
- (Step 2) 005 라이브 적용 + 노드 위치/테이크가 DB 영속 → localStorage 비워도 DB에서 복원
- source-of-truth = 코드. (specs/layers L1/L2 상세문서 없음 — 반영 대상 없음)
