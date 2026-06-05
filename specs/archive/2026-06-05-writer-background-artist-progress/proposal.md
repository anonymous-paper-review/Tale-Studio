---
change: writer-background-artist-progress
status: active
created: 2026-06-05
decisions: [25, 29, 37]
---

# Writer 백그라운드化 + Artist 턴어라운드 시트 파이프라인

## Why

Writer 단계는 사용자가 직접 조작할 UI가 아니라 **씬/샷/연출을 백그라운드에서 생성**하는
단계다. 현재는 writer 페이지를 거쳐야 생성이 트리거되고, 디버그용 MediaGenerationPanel이
노출돼 있다. Writer를 백그라운드 전용 스테이지로 돌리고, producer→artist 직행 흐름에서
artist 첫 진입 시 진행 상황만 보여준 뒤(블로킹) 준비되면 카드 UI로 전환한다.

동시에 artist의 캐릭터 이미지 생성을 **A 방식(svc 구조화 프롬프트) 기반의 "턴어라운드 시트"**
로 전환한다. 한 장에 4각도(front/back/side-L/side-R)를 생성하고 서버에서 셀 좌표로 crop해
개별 뷰에 채운다. (관련: decisions #25 P3 에셋 전용 범위, #29 P3 L0 재설계)

## What Changes

### 흐름/네비
- 사이드바에서 **writer 탭 숨김** (백그라운드 전용). writer route/페이지는 유지(직접 URL 접근만).
- producer 핸드오프 목적지를 `/studio/writer` → **`/studio/artist`** 로 변경.
- writer 씬 생성 트리거(`/api/write/generate-scenes`)를 **writer-page-mount → producer 핸드오프**로 이전.
  artist가 읽을 DB(scenes/characters/locations)를 백그라운드에서 채우기 위함.
- artist **첫 진입 = progress bar만(블로킹)**. 준비되면(캐릭터/로케이션 DB 존재) 카드 UI 전환.
  writer 페이지의 svc 진행 UI(`useSvcStatus` + progress bar)를 공유 컴포넌트로 추출해 재사용.

### Writer UI 정리
- writer 페이지의 `<MediaGenerationPanel>` 렌더 제거 (컴포넌트 파일은 보존).
- 고아가 된 svc asset 경로(`/api/svc/generate/assets`, `resume/assets`, 14b_assets)는
  artist 이미지가 A 파이프라인으로 이관되면 **호출자 소멸** → 정리/비활성 확인.

### Artist 턴어라운드 시트 (A 기반)
- **뷰 모델 변경**: `views = {front, side, back, threeQuarterLeft, threeQuarterRight}`
  → **`{main, front, back, sideLeft, sideRight}`**. 타입 + DB 컬럼 마이그레이션
  (`view_main`, `view_side_left`, `view_side_right` 신설 / `view_side`·`view_three_quarter_*` deprecate).
- **시트 생성 엔드포인트**: A-style 구조화 프롬프트(S2.appearance + L1.art_style/shape_language +
  L2.palette)로 **1×4 가로 스트립**(front | side-L | side-R | back, 균등 4등분) 프롬프트 구성 →
  fal `openai/gpt-image-2` 생성. 입력 토큰 출처는 svc 로그(`04_S2`/`08_L0_L1`/`09_L2`).
- **crop**: `sharp` 추가, 서버사이드로 스트립을 4등분 고정좌표 crop → 각 조각 + 전체 시트(main)
  를 Supabase storage 업로드 + DB 기록.
- **Artist UI 탭**: `main / front / back / side(left) / side(right)`. main=전체 시트, 나머지=crop.
- 기존 artist `autoGenerateBaseImages`(Path B) → 시트+crop 파이프라인으로 대체.

## Impact
- Affected specs: 없음 (artist 뷰 모델/이미지 파이프라인 = 코드 source-of-truth: `src/features/artist/`, `src/types/asset.ts`)
- Affected code: `src/app/studio/{producer,writer,artist}/page.tsx`, `src/components/layout/{sidebar,handoff-button}.tsx`, `src/features/{writer,artist}/*`, `src/lib/svc/llm/fal.ts`(crop 호출 측), 신규 `src/app/api/artist/generate-sheet/*`
- Affected stores: `artist-store`(시트/crop 액션, 뷰 모델), `producer-store`(핸드오프+트리거), `writer-store`(트리거 이전)
- Affected types: `CharacterAsset.views` (main/sideLeft/sideRight)
- Affected DB: `characters` 테이블 컬럼 (`view_main`/`view_side_left`/`view_side_right`)
- Affected decisions: [25, 29] (참조). 신규 결정(턴어라운드 시트 채택) 필요 시 decisions.md 별도 append.
- 새 의존성: `sharp`

## 열린 질문 (구현 중 확정)
- **시트 프롬프트 입력 출처**: svc 로그 토큰(04_S2/08_L0_L1/09_L2) 직접 로드 vs DB `fixedPrompt` 폴백.
  svc L2 미완료 시 폴백 전략 필요.
- **crop 정합 한계**: 고정좌표라 모델이 스트립을 안 맞추면 일부 잘림. MVP 후 수동조정/감지 crop 승급 여지.
- **svc asset 경로 완전 제거 vs 비활성 유지**: 디버그 재사용 가능성 따라 결정.

## Verification gate (archive 조건)
- tasks.md의 모든 [c] → [x]
- (흐름) producer 핸드오프 → 사이드바에 writer 안 보이고 artist로 진입, 백그라운드에서 generate-scenes 동작
- (gating) artist 첫 진입 시 progress bar 표시 → 캐릭터/로케이션 준비되면 카드 전환 (브라우저 확인)
- (시트) 캐릭터 1인 시트 생성 → 4조각 crop → main/front/back/side-L/side-R 탭에 올바른 각도 렌더 (브라우저 확인)
- (정리) writer 페이지에 MediaGenerationPanel 미노출, svc asset Forbidden 루프 미발생
- L0 spec 본문에 새 뷰 모델/파이프라인 반영
