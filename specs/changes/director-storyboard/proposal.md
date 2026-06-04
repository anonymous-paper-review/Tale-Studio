---
change: director-storyboard
status: active
created: 2026-06-04
decisions: [26, 34]
internal_decisions: [10, 11, 13, 15, 18]
---

# Director Storyboard — I2I 샷 이미지 생성 + 그리드 뷰 + I2V wire-up

## Why

Director Canvas(노드 그래프 재설계, `redesign-director-canvas`)는 Scene/Shot/Video 노드 골격까지
완성됐지만, **실제 생성 파이프라인이 비어 있다**. Writer·Artist가 만든 정보(샷 시퀀스 + actor/world
asset)가 Director로 넘어온 뒤, 사용자가 다음을 할 수 있어야 한다:

1. **스토리보드 생성** — 샷별 대표 이미지를 I2I(text+image→image)로 일괄 생성. 입력은 그 샷에
   연결된 actor/world asset 이미지(자동 결합) + 샷 프롬프트. 일관성(consistency) 유지 + 스토리보드
   시각화 목적.
2. **두 가지 뷰** — 세부 흐름용 **노드 그래프 뷰**와 씬 단위 요약용 **스토리보드 그리드 뷰**를 탭으로 전환.
3. **영상 생성(I2V)** — 생성된 샷 이미지를 레퍼런스로 샷별 영상을 생성. **항상 사용자가 직접 클릭**해야
   생성된다(토큰/비용 보호, 내부 #9 정신 계승). 레퍼런스 이미지는 필수가 아니며, asset에서 바로 I2V로
   가는 경로도 허용한다.

기존 `redesign-director-canvas`의 D-5(영상 생성 wire-up)는 "Shot NodePopup 생성 버튼 → generate-video"
범위였다. 본 change는 그 위에 **스토리보드 이미지 레이어 + 그리드 뷰 + I2I**를 새로 얹는다.

기결정 참조: decisions #26(P4 Storyboard = Shot Node Grid-Mindmap 통합), #34(이미지 생성 모델
`gemini-2.5-flash-image` / Tailscale self-hosted).

## What Changes

- **데이터 모델**: `ShotNodeData`에 `storyboardImage`(생성물 전용) + `generationMethod`(T2V/I2V) 필드 신설.
  생성 이미지와 사용자 업로드 `referenceImages[]`를 의미상 분리. `storyboardImage`가 해당 샷 I2V의 기본 레퍼런스.
- **I2I 생성**: `/api/generate/image`를 reference 이미지 입력을 받도록 확장(또는 director 전용 엔드포인트
  신설). `characterAssetIds`+`worldAssetIds`를 asset-storage의 실제 이미지 URL로 해석해 입력으로 결합.
- **일괄 생성**: "스토리보드 생성" 버튼 → 모든 샷(씬 순회) storyboardImage 일괄 생성, 샷별 status 표시.
- **뷰 전환**: `viewMode = 'node' | 'storyboard'`. 우측하단(채팅 패널 왼쪽) 탭 토글.
- **스토리보드 그리드 뷰**: 씬별 그룹, 셀 = storyboardImage 썸네일 + Shot 라벨 + prompt 요약.
  셀 우하단 ▶▶(영상 생성) / 이미지 없으면 🖼(이미지 생성) 버튼. 셀 더블클릭 → 기존 `ShotNodePopup` 편집.
- **I2V wire-up**: storyboardImage 있으면 `generationMethod='I2V'` + `storyboardImage.url`을 레퍼런스로
  `/api/director/generate-video` 호출. 없으면 T2V 또는 asset 직접 I2V. Writer 시간 축 연출 정보(움직임/
  카메라 동선)를 I2V 프롬프트에 추가 투입.

## Impact

- Affected specs: `specs/layers/director_canvas.md` (Shot 노드 모델, 생성 흐름, 그리드 뷰 섹션 추가)
- Affected code:
  - `src/types/director-canvas.ts` (필드 추가)
  - `src/stores/director-canvas-store.ts` (액션 + persist + 기본값)
  - `src/app/api/generate/image/route.ts` (I2I 확장) 또는 신규 director storyboard 엔드포인트
  - `src/app/api/director/generate-video/route.ts` (레퍼런스/시간축 프롬프트 결합 — 기존 파라미터 활용)
  - `src/app/studio/director/page.tsx` (뷰 토글 + 그리드 뷰 마운트)
  - `src/features/director/` 신규: 그리드 뷰 컴포넌트, 뷰 토글, asset 이미지 해석 헬퍼
  - DB 마이그레이션: `shots.storyboard_image` JSONB + `shots.generation_method`
- Affected stores: `director-canvas-store`, 읽기 의존 `asset-storage-store`(actor/world 이미지 URL)
- Affected decisions: #26, #34 인용. **신규 결정 #36~#40 append 필요**(아래 Decisions to append).

## Decisions to append (사용자가 decisions.md에 직접 추가 — append-only)

- **#36 Storyboard 이미지 단위 = 샷당 1장**. I2I 입력 = 연결된 actor+world asset 이미지 자동 결합 + 샷 프롬프트.
- **#37 storyboardImage 전용 필드**. 생성물은 `storyboardImage`(샷당 1장)에, 사용자 업로드는 `referenceImages[]`에.
  storyboardImage가 그 샷 I2V의 기본 레퍼런스.
- **#38 Director 2-뷰 모드**: 노드 그래프 / 스토리보드 그리드. 우측하단 채팅 패널 왼쪽 탭 토글.
- **#39 그리드 셀 상호작용**: 우하단 ▶▶=영상 생성(사용자 클릭 강제), 이미지 없으면 🖼=이미지 생성,
  더블클릭=ShotNodePopup 편집.
- **#40 영상 생성은 항상 사용자 클릭**으로만 트리거(자동 생성 금지). 레퍼런스 이미지는 선택적
  (asset 직접 I2V 허용).

## 구현 중 독단 결정 (spec 미정의 — 사용자 확인 권장, 2026-06-04)

> 구현하며 spec에 없던 세부를 결정한 항목. ⚠️ = 사용자 판단 필요.

### 데이터 모델 (ST-1)
- `StoryboardImage.status`는 기존 `DirectorVideoStatus`(pending/generating/completed/failed) 타입 재사용.
- persist는 `nodes` 배열 전체를 partialize → 새 필드 자동 영속화. 필드별 화이트리스트 작업 불필요.
- stale 트리거(`shotConfigKeys`)에 `generationMethod` 추가, `storyboardImage`는 **제외**(상태 전이마다 자식 Video stale 방지).
- DB `shots.generation_method`는 `NOT NULL DEFAULT 'T2V'`(기존 row 호환).

### 이미지 생성 (ST-2)
- `/api/generate/image` 기본 provider `gemini`→`fal`. **기존 호출부(artist/canvas/director-legacy)는 provider를
  명시 전달하므로 동작 무변경** — fal 기본은 신규 스토리보드 경로에만 적용.
- I2I 입력 asset 이미지: asset당 `referenceImages[0]` 우선, 없으면 `views.single[0].url` (asset당 1장).
- 일괄 생성은 **순차**(병렬 아님 — rate limit/비용 가시성). 일괄엔 이미지만, 영상 제외.
- I2I 프롬프트 = `prompt || label`(prompt 비면 label), aspectRatio '16:9' 고정.
- 영속화 field 명 `storyboard_image`, 파일명 `{shotId}_storyboard.png`.

### 영상 생성 (ST-4)
- ⚠️ **Writer 시간 축 연출 정보(움직임/카메라 동선) 투입 보류** — director-canvas Shot에 movement 필드가 없고
  writer-store 연동(D-4 sync)이 선행돼야 함. 현재 Shot prompt만 투입(코드에 TODO 명시). **후속 작업 필요.**
- provider 매핑: `kling`/`veo`→라우트 `fal`, `local`→`local`.
- 영상 레퍼런스 우선순위: storyboardImage(completed) → referenceImages[0] → 없으면 T2V.
- duration 미전달(director-canvas Shot에 없음 → 라우트 기본값). 폴링 5초 간격/5분 타임아웃(legacy 동일).

### 그리드 UI (ST-3)
- ▶▶를 텍스트 글리프로 표현(Play 아이콘 1개 대안 가능). 그리드 컬럼 `cols-2 lg:3 xl:4`(데스크탑 우선).
- Scene 헤더 MapPin/Clock 아이콘. 진행률 `completed/total`. Shot 0개면 일괄 버튼 disabled.
- 일괄 "스토리보드 생성"은 중립색(accent는 ▶▶ 영상생성에만). Palette bar 높이 h-9→h-11.

## Verification gate (archive 조건)

- tasks.md의 모든 `[c]` → `[x]`
- 브라우저 검증 시나리오:
  - Director 진입 → Writer 샷 + Artist asset 로드 상태에서 Shot 노드들이 존재
  - "스토리보드 생성" → 샷들에 storyboardImage 일괄 채워짐(샷별 status: pending→generating→completed/failed)
  - 노드뷰 ↔ 스토리보드 그리드뷰 탭 전환 동작, 그리드가 씬별 그룹 + 셀 썸네일 표시
  - 그리드 셀 ▶▶ 클릭 → 그 샷 I2V 생성(storyboardImage가 레퍼런스로 투입), generating spinner → 완료
  - 이미지 없는 셀 🖼 클릭 → 그 샷만 이미지 생성
  - 셀 더블클릭 → ShotNodePopup 열려 프롬프트/카메라 편집
  - asset 직접 I2V(storyboardImage 없는 샷) 경로 동작
  - 새로고침 후 storyboardImage / generationMethod 보존(persist)
- source-of-truth spec(`director_canvas.md`) 본문에 final state 반영
- `pnpm typecheck` clean
