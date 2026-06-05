# Delta: layers/director_canvas.md

> 이 파일은 `director-storyboard` change가 source-of-truth spec(`specs/layers/director_canvas.md`)에
> 적용할 ADDED / MODIFIED / REMOVED Requirements를 명세합니다.
> 구현(ST-1~ST-4) 진행에 따라 본 delta를 확정하고, archive 직전 spec 본문에 반영합니다.

## ADDED Requirements

### A1. Shot 노드 — Storyboard 이미지 (생성물)
- 각 Shot 노드는 `storyboardImage`(샷당 1장, 생성물) 슬롯을 가진다. I2I(text+image→image)로 생성되며,
  입력은 그 샷에 연결된 actor(`characterAssetIds`)+world(`worldAssetIds`) asset 이미지를 자동 결합한 것 +
  샷 프롬프트다. (내부 결정 #36)
- `storyboardImage`는 사용자 업로드용 `referenceImages[]`와 **의미상 분리**된다. (내부 결정 #37)
- `storyboardImage`는 해당 샷 I2V 영상 생성의 **기본 레퍼런스**가 된다. (내부 결정 #37)
- `storyboardImage`는 status(pending/generating/completed/failed)를 가진다.

### A2. Shot 노드 — generationMethod
- 각 Shot 노드는 `generationMethod: 'T2V' | 'I2V'`를 가진다. `storyboardImage`(또는 레퍼런스)가 있으면
  I2V, 없으면 T2V로 영상을 생성한다. (기존 API `generate-video`의 요구 파라미터와 정합)

### A3. 스토리보드 일괄 생성
- "스토리보드 생성" 액션은 모든 Shot에 대해 storyboardImage를 씬 순서대로 일괄 생성한다. 샷별 status를
  표시한다. (영상 생성은 일괄에 포함하지 않는다 — 내부 결정 #40)

### A4. 2-뷰 모드 (노드 그래프 / 스토리보드 그리드)
- Director Canvas는 **노드 그래프 뷰**(세부 흐름)와 **스토리보드 그리드 뷰**(씬 단위 요약)를 제공하며,
  우측하단(채팅 패널 왼쪽) 탭으로 전환한다. (내부 결정 #38)
- 스토리보드 그리드 뷰는 씬별로 그룹화하여 샷 셀을 나열한다. 셀 = storyboardImage 썸네일 + Shot 라벨 +
  prompt 요약.
- 그리드 셀 상호작용 (내부 결정 #39):
  - storyboardImage 있음 → 셀 우하단 ▶▶(영상 생성)
  - storyboardImage 없음 → 셀 우하단 🖼(이미지 생성)
  - 셀 더블클릭 → 기존 `ShotNodePopup`(편집)

### A5. 영상 생성 트리거 / 레퍼런스 정책
- 영상(I2V/T2V) 생성은 **항상 사용자 클릭**으로만 트리거된다(자동 생성 금지). (내부 결정 #40)
- 레퍼런스 이미지는 필수가 아니다. storyboardImage 없이 asset에서 바로 I2V로 가는 경로를 허용한다.
- Writer의 시간 축 연출 정보(움직임/카메라 동선)는 I2V 프롬프트에 추가 투입된다.

## MODIFIED Requirements

### M1. Shot 노드 데이터 모델
- 기존 `ShotNodeData`(referenceImages/characterAssetIds/worldAssetIds/camera/lighting/cameraPreset/
  provider/stale)에 `storyboardImage`, `generationMethod`를 추가한다. (A1, A2)
- 노드 위치 저장과 동일 정책으로(내부 #15) `shots` 테이블에 `storyboard_image` JSONB + `generation_method`
  컬럼을 추가한다.

### M2. 이미지 생성 경로 (T2I → I2I)
- 기존 `/api/generate/image`(T2I 전용, decisions #34 모델)를 I2I(레퍼런스 이미지 입력)로 확장하거나
  director 전용 엔드포인트를 신설한다. 실제 모델 계약은 구현 시 검증 후 확정.

### M3. 영상 생성 흐름
- 기존 Shot NodePopup "생성"(redesign-director-canvas D-5)에 더해, 그리드 셀 ▶▶에서도 동일 경로로
  영상을 생성한다. storyboardImage가 있으면 그것을 I2V 레퍼런스로 사용한다.

## REMOVED Requirements

(없음 — 본 change는 추가 위주. 기존 referenceImages[] 의미/동작은 유지)
