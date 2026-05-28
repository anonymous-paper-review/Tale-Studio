# Director Canvas — P4 노드 그래프 재설계

> P4 The Set을 패널 UI에서 React Flow 기반 노드 그래프로 전면 재설계.
> Writer Scene/Shot 양방향 sync + Shot 단위 영상 생성 + 카메라/조명/렌즈 설정 기반 재생성.

## 역할

Writer가 정의한 Scene-Shot 구조 위에서, 각 Shot의 카메라/조명/렌즈 설정을 조정하고 영상을 생성하는 그래프 워크스페이스. Artist의 L0 Concept Canvas가 *이미지 기반 스토리보드*라면, Director Canvas는 *영상 기반 스토리보드 + 디렉팅*.

```
Writer Scene/Shot ⇄ [Director Canvas] → Editor 타임라인
                          ↓
                    Camera/Light Preset Library
```

**UX 매핑**: P4 The Set 전면 교체 (`specs/ux_pages.md` P4)
**선행 스펙**: `specs/layers/L0_concept_canvas.md` (노드-엣지 패턴 공유), `specs/layers/L2_shot_composer.md`, `specs/layers/L3_prompt_builder.md`
**기술**: React Flow (xyflow), Zustand 그래프 스토어

---

## 1. 워크스페이스 레이아웃

```
┌─ Meeting Room ─┬───────── Canvas ─────────┬─ Storage ─┐
│ (좌측 도킹)    │                          │ (탭, MVP  │
│                │     무한 캔버스           │  Disable) │
│ 5-agent 채팅   │   Scene → Shot → Video    │           │
│ (Director 기본)│   계층 그래프              │           │
│                │                          │           │
│                ├──────────────────────────┤           │
│                │   Palette (Camera/Light Preset)      │
└────────────────┴──────────────────────────┴───────────┘
```

| 영역 | MVP | 비고 |
|------|-----|------|
| Canvas | 포함 | React Flow 인스턴스, 카메라 휠 줌, 스페이스+드래그 팬 |
| Meeting Room | 포함 | `global-chat-store` 재사용. Director agent 기본, 다른 4 agent도 선택 가능 |
| Palette (하단 탭) | 라벨 + Preset 라이브러리 (등록·드래그) | Camera/Light Preset 등록 기능은 MVP 범위 |
| Storage (우측 탭) | 라벨만 | 등록 Preset 브라우저는 Future |

---

## 2. 노드 종류

| 종류 | 색상 | 정체성 | 부모 | 생성 방법 |
|------|------|--------|------|-----------|
| **Scene** | `--chart-3` (warm orange) | 씬 메타데이터 컨테이너 (Writer sync) | 최상위 | Writer Scene 동기화 자동 / 캔버스 더블클릭 |
| **Shot** | `--chart-4` (vivid green) | 영상 생성 단위. Artist 이미지 + 카메라/조명/렌즈 설정 보유 | Scene | 캔버스 더블클릭 / Scene 노드 우측 Branch / Writer Shot 동기화 |
| **Video** | `--chart-5` (red orange) | Shot의 생성된 영상 테이크 (한 Shot 아래 여러 테이크) | Shot | Shot 노드 Branch로만 생성 |

> Artist의 Actor/World/Status는 별도 캔버스(`/studio/artist`). Director는 Artist에서 등록된 Asset을 *참조* 한다 (섹션 11).

### 2.1 노드 색상 매핑 (결정, 2026-05-25)

의미 기반 매핑: **구조(주황) → 작업(녹) → 결과(빨강계)**.

| 노드 | 토큰 | 의도 |
|------|------|------|
| Scene | `--chart-3` (warm orange) | 상위 컨테이너 — 채도는 있되 시선의 핵심은 아님 |
| Shot | `--chart-4` (vivid green) | 작업 중심 — 가장 눈에 잘 띔 |
| Video | `--chart-5` (red orange) | 결과물 — take 변주가 누적될 때 시각적 변별 |

### 2.2 색 충돌 완화 정책

| 충돌 | 완화 |
|------|------|
| Artist Actor(`--chart-1`)와 Director Video(`--chart-5`) 색조 유사 | 두 노드가 같은 화면에 동시 등장하지 않음(별도 페이지). 더불어 Video는 헤더에 `▶` 재생 아이콘을 항상 노출해 형태 단서 추가 |
| Shot(`--chart-4`)과 Artist registered 배지(`--chart-4`) | Artist 배지는 Director 캔버스에 등장하지 않음. Director 캔버스 안에서는 chart-4를 Shot 외에 사용 금지(룰) |
| Final 마킹 컬러 | chart-4 사용 금지. `--primary` 또는 별도 accent 사용 [Open O2 결정 시 함께 확정] |

---

## 3. 노드 박스 공통 구조

### 3.1 공통 요소

- **색상**: 종류별
- **호버**: 테두리 강조 + glow + 헤더 액션 아이콘 노출
- **선택**: 외곽선 highlight
- **박스 내부**:
  - 노드 이름/라벨 (인라인 편집)
  - 종류별 핵심 미리보기 (Scene=씬 요약, Shot=참고 이미지 + 카메라/조명 미니 indicator, Video=비디오 썸네일)
  - 액션 버튼 (Edit / Branch / Duplicate / Delete)

### 3.2 헤더 액션 아이콘 (hover 시 노출)

| 버튼 | 동작 | 노출 조건 |
|------|------|-----------|
| Edit | NodePopup 열기 | 모든 노드 |
| Branch | BranchOptionModal 또는 즉시 자식 노드 생성 | Scene / Shot (Video는 자식 없음) |
| Duplicate | 노드 복제 (parent 엣지 자동) | 모든 노드 |
| Delete | DeleteConfirmModal | 모든 노드 |

추가: **노드 더블클릭 = Edit 단축** (Artist와 동일, `onNodeDoubleClick` → `openPopup`)

### 3.3 노드 핀 (Pin)

- 노드 박스 4면 테두리에 호버 → 해당 변 두꺼워지면서 핀 활성
- 핀 클릭 → 엣지 시작점 활성 (드래그 또는 두 번째 클릭 대기)
- ReactFlow `connectionMode='loose'` (Artist와 동일, source/target 양방향)

### 3.4 엣지 종료점

| 종료점 | 결과 |
|--------|------|
| 다른 노드 핀 | 엣지 연결 + RelationModal (카테고리 선택) |
| 빈 공간 | 자식 노드 자동 Branch (Scene→Shot 또는 Shot→Video) |
| 같은 노드 다른 핀 | 무효 |

---

## 4. Scene 노드

### 4.1 역할

Writer 단계에서 정의된 Scene을 시각적으로 표시하는 컨테이너. Scene 자체는 영상 생성 단위가 아니라 *그룹화 + 메타데이터* 역할.

### 4.2 박스 표시

- 헤더: `Scene_01` 같은 ID + 라벨 (Writer Scene.title sync)
- 본문: Location, Time of Day, Mood 등 메타 요약
- 자식 Shot 수 indicator (e.g. `Shots: 4`)

### 4.3 NodePopup

| 요소 | 설명 |
|------|------|
| 라벨 / Title | Writer Scene.title과 양방향 sync |
| Location | Writer Scene.location sync |
| Time of Day | Writer Scene.timeOfDay sync |
| Mood | Writer Scene.mood sync |
| Description | Writer Scene.description sync |
| 자식 Shot 빠른 추가 | `+ Shot` 버튼 |

> Scene 메타데이터는 영상 생성에 직접 쓰이지 않고, 자식 Shot의 prompt 조립에 보조 컨텍스트로 들어감 (L2/L3 파이프라인).

### 4.4 Scene Branch

- Scene 노드 헤더 Branch 아이콘 → 새 Shot 자식 1개 자동 생성
- 핀 드래그 후 빈 공간 release → Shot 자식 생성 (drop 좌표에 배치)
- BranchOptionModal 없음 (단순 Shot 생성)

---

## 5. Shot 노드 (핵심)

### 5.1 역할

영상 생성의 실제 단위. Artist에서 만든 이미지를 받아 카메라/조명/렌즈 설정을 부여해 영상으로 변환하는 출발점.

### 5.2 박스 표시

- 헤더: `sh_01_03` 같은 ID + 라벨
- 본문:
  - 참고 이미지 썸네일 (Artist에서 가져온 캐릭터/월드 이미지 또는 직접 업로드)
  - 카메라 미니 indicator (6축 활성 axis 시각화)
  - 조명 미니 indicator (Key Light position dot)
  - 자식 Video 수 indicator (e.g. `Takes: 3`)
  - stale 배지 (Shot 설정 변경 후 자식 Video 미재생성)

### 5.3 NodePopup (Shot)

가벼운 필수 기능만. 무거운 라이브러리 편집은 Palette로.

| 요소 | 설명 |
|------|------|
| 프롬프트 입력창 | T2V/I2V용. 커서 깜빡임. 멀티라인 |
| 참고 이미지 | 여러 장 가능, 좌→우 스택. Artist의 등록 Asset에서 가져오기 또는 직접 업로드 |
| 등장 캐릭터 / 월드 선택 | Artist Asset Storage의 RegisteredCharacter / RegisteredWorld 드롭다운. 선택 시 references 엣지 자동 추가 (섹션 11) |
| 카메라 6축 | horizontal / vertical / pan / tilt / roll / zoom 슬라이더 (`director-store` `CameraConfig` 재사용, -10~+10) |
| 조명 (Key Light) | position / brightness / colorTemp (`LightingConfig` 재사용) |
| 카메라 프리셋 | brand / focalLength / aperture / whiteBalance (`CameraPreset` 재사용) |
| 생성 모델 선택 | Kling / Veo / Pro6000 self-hosted (`VideoProvider`) |
| 생성 버튼 | 우측에 필요 토큰 수 표시. 클릭 시 **새 Video 노드 자동 생성 + 자식으로 연결** |
| Branch | 명시적 새 테이크 생성 (생성 안 누르고 노드만 미리 만들 때) |
| Duplicate | Shot 자체 복제 (자식 Video 미포함) |
| Delete | DeleteConfirmModal |

### 5.4 Shot Branch (= 새 Video 테이크 생성)

사용자가 새 테이크를 만들고 싶을 때:

| 트리거 | 결과 |
|--------|------|
| Shot의 NodePopup `생성` 버튼 | 새 Video 노드 + 즉시 영상 API 호출. 자동 parent 엣지 |
| Shot 헤더 Branch 아이콘 | 새 Video 노드 (빈 상태) + parent 엣지. 생성은 Video 노드에서 별도 클릭 |
| Shot 핀 → 빈 공간 release | 새 Video 노드 (drop 좌표) + parent 엣지 |

새 Video 노드는 **마더 Shot의 카메라/조명/프리셋/프롬프트를 자동 상속**. 사용자는 새 Video 노드 안에서 한두 개만 바꿔 변주 테이크 생성.

---

## 6. Video 노드

### 6.1 역할

Shot의 자식. 한 Shot 아래 여러 테이크(variant)를 가질 수 있음. 각 테이크는 자체 카메라/조명/렌즈/프롬프트 사본을 가짐.

### 6.2 박스 표시

- 헤더 좌측: `take_v2` 라벨 (마더 Shot 안에서 순번) + ▶ 재생 아이콘
- 헤더 우측: ☆/★ Final 별 아이콘 (항상 노출). 클릭 시 토글
  - 같은 Shot 안의 다른 Video의 ★는 자동으로 ☆로 해제 (Shot당 Final 1개 강제 — 결정 #11)
- 본문:
  - 비디오 썸네일 (생성 중 = 로딩 spinner, 완료 = 첫 프레임 + 재생 hover)
  - 카메라/조명 차이 indicator (마더 Shot 대비 변경된 항목만 강조, e.g. "Zoom +3, Color 7500K")
  - 생성 모델 라벨

### 6.3 NodePopup (Video)

Shot Popup과 거의 동일하나 다음 차이:

| 차이 | 설명 |
|------|------|
| 모든 필드 prefilled | 마더 Shot 값 상속 |
| 변경된 필드 강조 | UI상 dirty indicator로 마더 대비 차이 표시 |
| `재생성` 버튼 | 현재 설정으로 새로운 영상 fetch (기존 영상 url 덮어쓰기) |
| 자식 Branch 없음 | Video는 leaf 노드 (Shot 자식만 허용) |
| Final 토글 | 노드 헤더 별 아이콘과 동기화. NodePopup에서도 명시적으로 ON/OFF 가능 (결정 #11) |

### 6.4 Branch 옵션 (현재 결정)

사용자 의도: "기본 노드는 샷 단위, 설정 기반 재생성으로 충분".
따라서 **Branch 옵션 모달은 없음**. Shot의 Branch는 항상 새 Video 노드 1개를 만들고, 사용자가 NodePopup에서 어떤 설정을 다르게 할지 결정.

> Future: "조명 변주 / 카메라 무브 변주 / 렌즈 변주" 같은 프리셋 변주 템플릿이 필요해지면 BranchOptionModal 추가 (Artist의 BranchOptionModal 패턴 재사용).

---

## 7. 핀 + 엣지 + 관계

### 7.1 엣지 카테고리

| 카테고리 | 시각 | 용도 | 생성 방식 |
|----------|------|------|-----------|
| `parent` | 2px 실선 | Scene→Shot, Shot→Video 계층 | Branch 자동 / Scene·Shot 핀 drop 자동 |
| `references` | 1.5px 점선 | Shot ↔ Artist Asset(Character/World) 참조 | NodePopup에서 캐릭터/월드 선택 시 자동 |
| `relates-to` | 1.5px 실선 | 사용자 정의 내러티브 관계 (예: "Shot A의 연속 동작") | 사용자 핀-핀 연결 시 RelationModal에서 선택 |

`references` 엣지는 외부 그래프(Artist Asset Storage)를 가리키는 *논리적 참조*이며 React Flow 안의 실제 엣지로 그려지지는 않음 (Artist는 별도 캔버스). NodePopup의 "등장 캐릭터/월드" 리스트에만 표현.

> Artist의 `in-world`는 Artist 캔버스 내부 카테고리. Director Canvas에는 `parent` + `references` + `relates-to` 세 종류만.

### 7.2 RelationModal

사용자가 핀으로 두 노드 연결할 때:
- 카테고리: `parent` (자동, Scene→Shot/Shot→Video 부모-자식만) / `relates-to` (기본)
- 자유 텍스트 (선택)
- `references`는 사용자가 직접 그리지 않음 (NodePopup에서 캐릭터/월드 선택으로 자동)

---

## 8. Writer ↔ Director 양방향 Sync

### 8.1 동기화 단위

| Writer 모델 | Director Canvas 노드 |
|-------------|----------------------|
| `Scene` | Scene 노드 (1:1) |
| `Shot` | Shot 노드 (1:1) |
| `DialogueLine[]` | Shot 노드의 prompt에 컨텍스트로만 사용 (캔버스 노드 X) |

### 8.2 동기화 트리거

| 발생 위치 | 영향 |
|-----------|------|
| Writer에서 Scene 추가 | Director Canvas에 Scene 노드 자동 생성 (Y 좌표 자동 배치) |
| Writer에서 Scene.title/location/etc 수정 | Director Scene 노드 data 갱신 |
| Writer에서 Shot 추가 | Director Canvas에 Shot 노드 + parent 엣지 자동 |
| Writer에서 Shot.description 등 수정 | Director Shot 노드 prompt seed 갱신 (stale 표시) |
| Writer에서 Scene/Shot 삭제 | Director 해당 노드 + 자식 cascade 삭제 (섹션 14 정책) |
| Director에서 Scene 메타 수정 | Writer `sceneManifest` 갱신 (Auto-Save 기존 패턴) |
| Director에서 Shot prompt/카메라 등 수정 | Writer Shot 모델의 해당 필드 갱신 (Auto-Save) |
| Director에서 Shot 추가 | Writer `shots[]`에 동일 ID로 추가 |
| Director에서 Shot 삭제 | Writer `shots[]`에서 제거 |
| Video 노드 변경 | Writer 영향 없음 (Director 전용) |

### 8.3 충돌 해결

- 두 store가 동시에 같은 필드 수정 시: **last-write-wins** (마지막 액션 적용)
- Auto-Save 디바운스 500ms 기존 패턴 유지 (`debouncedShotSave` 재사용)
- 한쪽 store가 reset/loadProject로 갱신될 때 다른 쪽도 강제 reseed

### 8.4 구현 메모

- `writer-store` ↔ `director-canvas-store` 간 cross-store subscribe 패턴 (zustand `subscribe`)
- DB persistence는 Writer 쪽 `shots` 테이블 + Director 쪽 카메라/조명/Video 정보가 같은 row에 살림 (기존 director-store 패턴 `camera_config`/`lighting_config` 컬럼 재사용)
- Video 테이크는 별도 row (`video_clips` 테이블). 마더 `shot_id` 외래키

---

## 9. Real-time Propagation (Shot → Video)

### 9.1 핵심 원칙

- **전파 대상**: prompt / 카메라 / 조명 / 렌즈 / 참고 이미지
- **전파 범위**: 직계 Video 자식
- **자동 재생성 없음**: stale 배지만 표시. 사용자가 Video 노드에서 "재생성" 클릭해야 새 영상 생성 (토큰 비용 보호)

### 9.2 자식 Video의 effective 설정 계산

- Video 노드의 각 필드는 *마더 Shot에서 상속 + 자체 override* 구조
- Override 없는 필드는 마더 값 그대로 사용
- 마더 변경 시 override 없는 필드의 effective 값이 자동 갱신됨

### 9.3 stale 시각

| 노드 | 마더 prompt/설정 변경 시 |
|------|--------------------------|
| Video (override 없는 필드) | 좌상단 점멸 점 + 변경된 필드 indicator highlight |
| Video (모든 필드 override) | 약한 stale (사용자가 의도적으로 분리한 경우 존중) |

### 9.4 전파 안 되는 변경

- Video 자체의 카메라/조명 override 편집은 마더에 역전파 안 됨
- Final 마킹은 마더와 독립

---

## 10. Camera/Light Preset Library (Palette)

### 10.1 등록

Shot 또는 Video 노드의 카메라/조명/렌즈 셋팅을 재사용 가능한 프리셋으로 저장.

| 입력 | 노드의 `camera`, `lighting`, `cameraPreset` 스냅샷 |
|------|----------------------------------------------------|
| 사용자 입력 | 프리셋 이름, 설명, 태그 (선택) |
| 저장 위치 | `preset-storage-store` (신규) + localStorage persist |
| 저장 키 | `tale-preset-storage-v1-<projectId>` |

### 10.2 등록 조건

사용자 명시적 액션. 임계 조건 없음 (Artist의 "이미지 20장" 같은 임계 미적용).

> 사유: Director 프리셋은 *사용자 의도가 명확한 시점*에 즉시 저장하는 게 자연스럽다 (i.e. "이 셋업 마음에 든다" 순간). 이미지 누적 임계는 캐릭터 일관성용이라 Director에는 부적합.

### 10.3 Preset 적용

- Palette에서 프리셋 카드 드래그 → Shot/Video 노드에 drop → 해당 노드의 camera/lighting/cameraPreset 덮어쓰기
- 또는 NodePopup의 "Preset 적용" 드롭다운에서 선택

### 10.4 Preset 스키마

```typescript
type CameraLightPreset = {
  id: string                   // p_<uuid>
  projectId: string
  name: string                 // "Golden Hour Close-up"
  description?: string
  tags: string[]               // ["close-up", "warm", "natural"]
  camera: CameraConfig
  lighting: LightingConfig
  cameraPreset: CameraPreset
  createdAt: number
  sourceNodeId?: string        // 등록 시점의 노드 ID (참조용)
}
```

> 상세 스토어 액션·UI는 별도 짧은 추가 스펙으로 분리 가능. MVP는 등록·드래그 적용 두 동작만.

---

## 11. Artist Asset Storage 연동

### 11.1 참조 방향

Director는 Artist Asset Storage를 *읽기 전용*으로 소비.

| 사용처 | 동작 |
|--------|------|
| Shot NodePopup의 "등장 캐릭터/월드" 셀렉터 | `assetStorageStore.listCharactersByProject()` / `listWorldsByProject()` 호출 |
| 선택 시 자동 | RegisteredCharacter.referenceImages를 Shot의 참고 이미지에 추가 (사용자가 빼고 싶으면 수동 제거) |
| references 엣지 | 논리적 — UI에 "참조 캐릭터 N명" 뱃지로만 표시 (실제 React Flow 엣지 X) |

### 11.2 미등록 캐릭터 안내

Artist에서 아직 등록 안 된 캐릭터를 Shot에 쓰고 싶을 때:
- "등록된 캐릭터가 없어요. Artist 단계에서 먼저 등록해 주세요" 안내 + Artist 페이지 link
- 미등록 상태에서 Shot 생성 자체는 막지 않음 (Shot은 자체 프롬프트로도 동작)

---

## 12. Meeting Room (좌측 도킹) — 5-Agent

### 12.1 패턴

Artist Canvas의 Meeting Room 패턴(`docs/`/`L0_concept_canvas.md` §11) 재사용:
- 같은 `global-chat-store` 인스턴스 사용
- Director 페이지에서는 기본 agent = `director`
- 다른 agent(producer/writer/concept-artist/editor)로 토글 가능

### 12.2 Director Agent Tool-use (CanvasUpdate union)

Artist의 `CanvasUpdate`와 같은 패턴, 액션 셋은 Director 전용:

```typescript
type DirectorCanvasUpdate =
  | { type: 'addShot'; sceneId: string; label?: string; prompt?: string; tempId?: string }
  | { type: 'updateShot'; id: string; patch: Partial<ShotData> }
  | { type: 'addVideoTake'; shotId: string; override?: Partial<ShotData>; tempId?: string }
  | { type: 'generateVideo'; id: string }
  | { type: 'setCameraPreset'; id: string; preset: Partial<CameraPreset> }
  | { type: 'setCamera'; id: string; camera: Partial<CameraConfig> }
  | { type: 'setLighting'; id: string; lighting: Partial<LightingConfig> }
  | { type: 'applyPreset'; nodeId: string; presetId: string }
  | { type: 'connect'; sourceId: string; targetId: string; category: 'relates-to'; relationText?: string }
  | { type: 'requestDelete'; id: string }
  | { type: 'requestRegisterPreset'; nodeId: string; suggestedName?: string }
  | { type: 'selectNode'; id: string }
```

파괴/등록 액션은 사용자 확인 모달 경유 (Artist의 destructive 안전장치와 동일).

### 12.3 Warm Starting (룰 기반)

| 상태 | 메시지 |
|------|--------|
| Scene 0개 (초기 진입) | "Writer에서 씬을 먼저 만들면 자동으로 들어와요. 또는 더블클릭으로 직접 만들 수 있어요." |
| Scene 있고 Shot 0개 | "각 씬에 샷을 추가해보세요. 헤더의 Branch 아이콘 또는 더블클릭으로." |
| Shot 있고 Video 0개 | "Shot 노드의 '생성' 버튼으로 첫 영상 테이크를 만들어보세요." |
| 같은 Shot에 Video ≥ 3 | "조명이나 렌즈만 살짝 바꿔서 테이크를 비교해보면 좋아요." |

LLM 호출 없음.

### 12.4 컨텍스트 직렬화

매 chat turn마다 캔버스 스냅샷 전송:
```
## Director Canvas
### 통계
- Scene N, Shot N, Video N
- 생성 완료/실패/대기 비율

### 노드 트리
- Scene_01 "재회"
  - sh_01_01 "주인공 등장" (camera: zoom=+3, take 2)
    - take_v1 (kling, complete)
    - take_v2 (kling, dirty: aperture=2.8)
  - sh_01_02 "...

### 선택
- 선택된 노드의 전체 필드
```

---

## 13. 캔버스 인터랙션

| 제스처 | 동작 |
|--------|------|
| 빈 공간 더블클릭 | 노드 생성 팝업 (Scene / Shot 선택. Scene 0개면 Scene 강제) |
| 노드 더블클릭 | NodePopup 열기 |
| 노드 박스 호버 | 테두리 강조 + 핀 활성 + 헤더 아이콘 노출 |
| 노드 우클릭 | 브라우저 기본 (별도 UI 없음, Artist `decisions.md` #33 일관) |
| 핀 클릭 | 엣지 시작점 활성. `connectionMode='loose'` |
| 핀 → 빈 공간 release | 부모 종류에 따라 자식 자동 생성 (Scene→Shot / Shot→Video) |
| 마우스 휠 | 줌 인/아웃 (`zoomOnDoubleClick=false`) |
| 스페이스 + 드래그 | 팬 |
| 휠 클릭 + 드래그 | 팬 (대안) |
| Delete 키 | 선택 노드 삭제 (DeleteConfirmModal 경유) |
| Ctrl/Cmd + Z | Undo [Future, P10-7과 동일] |
| 드래그 from Palette | 노드에 drop → camera/lighting/preset 덮어쓰기 |

---

## 14. 노드 삭제 cascade

| 삭제 대상 | 자식 처리 |
|-----------|-----------|
| Scene (Shot N개 자식) | **확인 모달**: "Shot N개 + Video M개가 함께 삭제됩니다" → 확인 시 cascade. Writer `sceneManifest`에서도 제거 |
| Shot (Video N개 자식) | **확인 모달**: "Video 테이크 N개가 함께 삭제됩니다" → 확인 시 cascade. Writer `shots[]`에서도 제거 |
| Video (leaf) | 즉시 삭제. 확인 없음 (또는 Final 마킹 시 경고) |
| Final 마킹된 Video | 추가 경고: "이 테이크가 Editor 핸드오프 대상입니다" |

### 14.1 Undo

- Cmd/Ctrl+Z 지원 [Future, Artist P10-7과 같은 마일스톤]
- cascade 삭제 undo 시 자식 노드 전체 복원

---

## 15. Persistence

### 15.1 Zustand 스토어

- 신규 `src/stores/director-canvas-store.ts` (기존 `director-store.ts` 폐기 또는 흡수)
- 노드/엣지 상태 + Video 생성 상태(`generatingNodeIds`)
- LocalStorage key: `tale-director-canvas-v1-<projectId>`

### 15.2 DB 영속화

- Scene/Shot: 기존 `scenes` / `shots` 테이블 (Writer와 공유)
- Video 테이크: 기존 `video_clips` 테이블 (`shot_id` FK)
- 카메라/조명/렌즈: 기존 `shots.camera_config` / `lighting_config` / `camera_brand` 등 컬럼 재사용
- 노드 위치 (x, y): 신규 컬럼 `shots.canvas_position` / `scenes.canvas_position` (JSONB) 또는 별도 `director_canvas_layout` 테이블 [Open]

### 15.3 Camera/Light Preset 별도 스토어

- `src/stores/preset-storage-store.ts` (신규)
- LocalStorage key: `tale-preset-storage-v1-<projectId>`
- 추후 Supabase 마이그레이션 (Artist Asset Storage와 동일 패턴)

---

## 16. Editor 핸드오프

| 시점 | 동작 |
|------|------|
| 사용자가 "Head to Editor →" 클릭 | 각 Shot에서 Final ★ 마킹된 Video 1개씩을 Editor `clips[]`에 export |
| Final 마킹 없는 Shot | export 시 경고 토스트: "Shot N개에 Final이 지정되지 않았어요. 마지막 테이크가 들어갑니다" (fallback: 가장 최근 Video) |
| Final 마킹 정책 | **Shot당 Final 1개 강제** (결정 #11). 사용자가 새 Video에 ★ 누르면 같은 Shot의 기존 ★ 자동 해제 |

> 현재 Editor (`editor-store.ts`)는 `loadData()`에서 director 결과를 받음. 기존 인터페이스 유지하되 export 시점에 Final 선정 로직만 끼움.

---

## 17. 결정 사항

| # | 결정 | 근거 |
|---|------|------|
| 1 | React Flow 채택 (Artist와 동일) | 일관성, 학습 비용 0 |
| 2 | Scene → Shot → Video 3-tier 계층 | 사용자 명시. Shot이 영상 생성 단위 |
| 3 | Branch = 새 Video 테이크 (옵션 모달 없음) | 사용자 의도 "샷 단위 + 설정 기반 재생성" |
| 4 | 등록 = Camera/Light Preset Library | 사용자 명시. Artist의 "캐릭터 등록"과 다른 도메인 |
| 5 | 등록 임계 조건 없음 | Director 프리셋은 의도 명확 시점에 즉시 저장이 자연스러움 |
| 6 | Writer ↔ Director 양방향 sync | 사용자 명시. 충돌 = last-write-wins |
| 7 | references 엣지는 논리적 (Artist 캔버스 외부 참조) | 두 캔버스 분리 유지 |
| 8 | Meeting Room = `global-chat-store` 재사용, Director agent 기본 | Artist 패턴 일관 |
| 9 | 자동 재생성 X, stale 배지만 | 토큰 비용 보호 (Artist와 동일) |
| 10 | 노드 색: Scene=chart-3, Shot=chart-4, Video=chart-5 (2026-05-25) | 의미 매핑(구조→작업→결과). Video는 ▶ 아이콘으로 형태 단서 보강 |
| 11 | Final 마킹: Shot당 ★ 1개 강제. UI는 Video 헤더 별 아이콘(primary) + NodePopup 토글 (2026-05-25) | 명확함. Editor 핸드오프 시 자동 선정 가능 |
| 12 | 기존 Inspector 패널 처리: 단계적 마이그레이션 (2026-05-25) | 노드 그래프 검증 동안 둘 다 동작. 검증 완료 후 Inspector 제거 |
| 13 | Branch 변주 템플릿: MVP 제외 (2026-05-25) | Branch = 마더 설정 그대로 복사된 빈 새 Video 1개. 변주는 NodePopup에서 사용자가 직접 |
| 14 | director-store 마이그레이션: 점진적 (2026-05-25) | 새 `director-canvas-store.ts`가 메인. 기존 store는 의존 정리 후 제거 (Artist artist-store 빚 패턴) |
| 15 | 노드 위치 저장: shots/scenes에 `canvas_position` JSONB 컬럼 추가 (2026-05-25) | 같은 row에 설정·위치 공존, 마이그레이션 가벼움 |
| 16 | 프리셋 적용: 카메라/조명/렌즈 필드 전체 덮어쓰기. prompt/참고이미지는 유지 (2026-05-25) | 프리셋 = 셋업 단위. 부분 머지보다 의미 명확 |
| 17 | Scene 노드 박스: 메타 정보만, 자식 Shot 미니맵 X (2026-05-25) | 캔버스 그래프가 자식 관계 표현. 박스 안 중복 X |
| 18 | 자동 배치: 부모 Scene 우측, 형제 Shot 아래로 stacking, snap 16px (2026-05-25) | 예측 가능 + 구현 가벼움 |

---

## 18. Open Questions (해소 완료)

2026-05-25 라운드에서 O1~O10 모두 결정 완료 (§17 결정 #10~#18 참조). 추가로 발견되는 모호점은 본 섹션에 누적.

| # | 항목 | 결정 |
|---|------|------|
| O1 | 노드 색상 토큰 | #10 — Scene=chart-3, Shot=chart-4, Video=chart-5 |
| O2 | Final 마킹 정책 | #11 — Shot당 ★ 1개 강제 |
| O3 | Final UI 위치 | #11 — Video 헤더 별 아이콘 + NodePopup 토글 |
| O4 | 노드 위치 영속화 | #15 — `canvas_position` JSONB 컬럼 |
| O5 | Preset 적용 방식 | #16 — 카메라/조명/렌즈 전체 덮어쓰기 |
| O6 | Scene 박스 안 자식 미니맵 | #17 — 표시 안 함 |
| O7 | 기존 Inspector 패널 | #12 — 단계적 마이그레이션 |
| O8 | Branch 변주 템플릿 | #13 — MVP 제외 |
| O9 | director-store 처리 | #14 — 점진적 교체 |
| O10 | 자동 배치 알고리즘 | #18 — 부모 Scene 우측 stacking |

---

## 19. 구현 마일스톤 (제안)

> 상세 phase 분할은 별도 PROGRESS.md 항목으로. 본 스펙은 산출물 정의만.

### Phase D-1: 인프라
- `director-canvas-store.ts` 신규 (canvas-store 패턴 복사)
- Scene/Shot/Video 노드 컴포넌트 (BaseNode 패턴 재사용)
- ReactFlow 마운트 + 양방향 sync subscribe

### Phase D-2: NodePopup
- Scene/Shot/Video 별 popup
- 카메라/조명/프리셋 UI는 기존 `angle-control.tsx` / `key-light.tsx` 재사용

### Phase D-3: Sync + 영상 생성 wire-up
- Writer ↔ Director store cross-subscribe
- Shot NodePopup 생성 버튼 → 새 Video 노드 + 기존 `/api/director/generate-video` 호출

### Phase D-4: Preset Library
- `preset-storage-store.ts`
- Palette UI + 드래그 적용

### Phase D-5: Meeting Room 통합
- DirectorCanvasUpdate union + `/api/director/chat` 개편
- Warm starting 룰

### Phase D-6: Editor 핸드오프 + Cascade + Persistence
- Final 마킹
- Cascade 삭제 모달
- DB 영속화 (canvas_position 등)

---

## 20. 참조

- `specs/layers/L0_concept_canvas.md` — Artist 노드 그래프 패턴 (이 스펙의 모범)
- `specs/data/canvas_data_model.md` — Artist 데이터 모델 (Director도 유사 구조)
- `specs/data/asset_storage.md` — Artist 등록 자산 (Director가 참조)
- `specs/layers/L2_shot_composer.md` / `L3_prompt_builder.md` — 영상 생성 파이프라인
- `specs/design.md` — 색 토큰 / 모션 / 인터랙션 헌법
- `specs/decisions.md` — Artist 결정 #29~34 (패턴 참고)
