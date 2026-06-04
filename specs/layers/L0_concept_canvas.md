# L0: Artist — Character & World Card Studio

> 카드형 패널 기반 컨셉 아트 워크스페이스 — `/studio/artist`
>
> **이력**: 이 스펙은 2026-06-04 사용자 결정으로 노드 그래프 버전(`specs/archive/2026-06-04-redesign-l0-canvas/`)에서 카드형으로 롤백됨. 백엔드(asset-storage-store)는 그대로 유지하며 카드→등록 어댑터를 통해 연결.

## 역할

캐릭터(Character)와 배경 월드(World)를 카드 형식으로 정의하고, 이미지를 생성·누적해 Asset Storage에 등록. 등록된 에셋은 다음 단계(L1/L2/L3 → Director)로 전달.

```
[Character Panel] ─┐
                   ├→ [Register] → asset-storage-store → P4/Director
[World Panel]     ─┘
[Inventory Grid]  ← 등록된 에셋 조회
```

**UX 매핑**: P3 The Visual Studio (`specs/ux_pages.md` P3)
**레퍼런스**: 커밋 8507796의 카드형 UI (character-panel / world-panel / inventory-grid)
**기술**: React Tabs (shadcn/ui), Zustand (`artist-store` + `asset-storage-store`)

---

## 1. 워크스페이스 레이아웃

```
┌─────────────── Tabs ────────────────┐
│  [Characters]  [World]  [Inventory] │
├─────────────────────────────────────┤
│                                     │
│   활성 탭 콘텐츠                     │
│                                     │
└─────────────────────────────────────┘
```

| 탭 | 역할 |
|----|------|
| **Characters** | 캐릭터 카드 목록 (생성·편집·이미지 생성·등록) |
| **World** | 월드/배경 카드 목록 (생성·편집·이미지 생성·등록) |
| **Inventory** | 등록 완료된 에셋 그리드 조회 |

---

## 2. Character Panel (Characters 탭)

### 2.1 카드 구조

각 캐릭터는 카드 1개로 표현.

| 요소 | 설명 |
|------|------|
| 이름 / ID | 인라인 편집 가능 |
| 설명 텍스트 | 캐릭터 배경 + 외형 |
| 프롬프트 입력창 | T2I 프롬프트 (멀티라인) |
| 이미지 그리드 | 생성된 이미지 3-View (Front / Side / Back) |
| Generate Sheet 버튼 | 프롬프트 → 이미지 생성 API 호출 |
| Lock 토글 | 에셋 잠금 (수정 방지) |
| Register 버튼 | asset-storage-store.registerCharacterCard() 호출 |

### 2.2 이미지 생성

- `POST /api/generate/image` 재사용
- 현재 모델: `gemini-2.5-flash-image` (Nano Banana, decisions.md #34 — paid plan 확보 시 Imagen으로 복원)
- 생성 중 로딩 상태 표시

### 2.3 Register 액션

카드의 Register 버튼 클릭 시:
1. `asset-storage-store.registerCharacterCard(card)` 호출
2. `CharacterAsset → RegisterInput` 매핑 (어댑터 내부)
3. `asset-storage-store`에 `RegisteredCharacter` 기록
4. 성공 시 Inventory 탭에 반영

---

## 3. World Panel (World 탭)

### 3.1 카드 구조

각 월드/배경은 카드 1개로 표현.

| 요소 | 설명 |
|------|------|
| 이름 / 설명 | 인라인 편집 가능 |
| 프롬프트 입력창 | 장소·분위기 설명 |
| 이미지 슬롯 | Wide Shot + Establishing Shot 2장 |
| Generate Background 버튼 | 프롬프트 → 이미지 생성 |
| Cinematic Boost 필터 칩 | 프롬프트 후미에 스타일 키워드 주입 |
| Register 버튼 | asset-storage-store.registerWorldCard() 호출 |

### 3.2 Register 액션

카드의 Register 버튼 클릭 시:
1. `asset-storage-store.registerWorldCard(card)` 호출
2. `WorldAsset → RegisterInput` 매핑 (어댑터 내부)
3. `asset-storage-store`에 `RegisteredWorld` 기록

---

## 4. Inventory Grid (Inventory 탭)

등록 완료된 모든 에셋을 그리드로 표시. 읽기 전용 (MVP).

| 열 | 내용 |
|----|------|
| 썸네일 | 첫 번째 생성 이미지 (없으면 placeholder) |
| 이름 / 유형 | 캐릭터 또는 월드 배지 |
| 설명 | 짧은 요약 |

---

## 5. Asset Storage 연동

### 5.1 백엔드 스토어

`src/stores/asset-storage-store.ts` — Zustand + localStorage persist.

- `RegisteredCharacter[]` / `RegisteredWorld[]` 관리
- `registerCharacterCard(card: CharacterAsset)` — 카드 → 등록 어댑터
- `registerWorldCard(card: WorldAsset)` — 카드 → 등록 어댑터
- 상세 스키마: `specs/data/asset_storage.md`

### 5.2 P4 연동

Director Canvas의 ShotNode에서 `characterAssetIds` / `worldAssetIds` 를 채울 때 `asset-storage-store`에서 조회. `resolveShotAssetImages(shot)` 헬퍼가 스토리보드 생성 시 레퍼런스로 사용.

---

## 6. 결정 사항

| # | 결정 | 근거 |
|---|------|------|
| 1 | 카드형 복원 (2026-06-04) | 노드 그래프 구현 복잡도 누적 + 미검증 [c] 항목 과다. 카드형은 검증된 베이스라인 |
| 2 | asset-storage 백엔드 유지 | Director Canvas의 characterAssetIds/worldAssetIds 의존성 유지 필요 (P4 손상 방지) |
| 3 | 카드→등록 어댑터 패턴 | 노드 그래프 시절 asset-storage API 시그니처를 카드형 UI에서 재사용. 스토어 인터페이스 변경 최소화 |
| 4 | artist-store 재활성 | canvas-store 삭제 후 artist-store 복원. director/global-chat 의존성 유지됨 |
| 5 | canvas-store 삭제 | 노드 그래프 폐기로 불필요. asset-storage-store는 유지 |

> 노드 그래프 버전 결정 상세: `specs/archive/2026-06-04-redesign-l0-canvas/proposal.md`
> 롤백 change 상세: `specs/changes/rollback-artist-card/`
