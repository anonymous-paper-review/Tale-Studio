# Asset Storage

> L0 Concept Canvas에서 등록된 캐릭터/월드를 저장하고 P4 등 다음 단계로 공급하는 저장소. MVP는 Zustand + localStorage, 추후 Supabase 마이그레이션.

## 1. 역할

| 입력 | 캔버스에서 등록된 노드 (Actor / World) + 누적 이미지 + 메타데이터 |
| 출력 | P4 The Set이 사용할 `CharacterAsset[]` / `WorldAsset[]` |
| MVP 저장소 | Zustand store + localStorage persist |
| 미래 저장소 | Supabase (이미지는 별도 스토리지 결정 후 마이그레이션) |

상위 의존: `specs/archive/2026-06-04-redesign-l0-canvas/canvas_data_model.md`의 `NodeData`, `GeneratedImage`, `Registration`.

---

## 2. 스키마

### 2.1 RegisteredCharacter

```typescript
type RegisteredCharacter = {
  // 식별자
  id: string                     // r_<uuid>. NodeData.registered.registeredId와 일치
  projectId: string
  sourceCanvasNodeId: string     // 어느 캔버스 노드에서 등록됐는지 추적

  // 사용자 입력 (등록 폼)
  name: string                   // 표시명 ("Kai")
  alias: string                  // 짧은 ID ("kai-001")
  background: string             // 배경 설명
  description: string            // 캐릭터 디테일

  // 등록 시점 스냅샷
  prompt: string                 // 노드 prompt 스냅샷
  referenceImages: string[]      // 업로드한 참고 이미지 URL/base64

  // 생성 이미지 — 모드별 분리
  views: {
    single: GeneratedImage[]     // Single 모드 생성분 (0~N장)
    fiveView: GeneratedImage[]   // 5-View 모드 (0 또는 5장 단위)
    sixteenAngle: GeneratedImage[] // 16-Angle 모드 (0 또는 16장 단위)
  }

  // Status 변형 (마더의 Status 자식들이 등록 시 함께 직렬화)
  statusVariants: {
    label: string                // Status 노드의 라벨
    prompt: string               // 마더 + Status 결합된 effective prompt
    images: GeneratedImage[]
  }[]

  // 메타
  registeredAt: number           // epoch ms
  updatedAt: number              // 재등록/갱신 시 갱신
}
```

### 2.2 RegisteredWorld

```typescript
type RegisteredWorld = {
  // 식별자
  id: string                     // r_<uuid>
  projectId: string
  sourceCanvasNodeId: string

  // 사용자 입력
  name: string
  alias: string
  background: string             // 세계관 설명
  description: string

  // 등록 시점 스냅샷
  prompt: string
  referenceImages: string[]

  // 생성 이미지
  views: {
    single: GeneratedImage[]
    fiveView: GeneratedImage[]   // 월드는 5-View 의미가 약함 (정면/측면이 모호) — 사용자 자유
    sixteenAngle: GeneratedImage[]
  }

  // 환경 변형 (예: 같은 장소 낮/밤/비)
  statusVariants: {
    label: string
    prompt: string
    images: GeneratedImage[]
  }[]

  registeredAt: number
  updatedAt: number
}
```

### 2.3 AssetStorageState

```typescript
type AssetStorageState = {
  characters: Record<string, RegisteredCharacter>  // id로 인덱싱
  worlds: Record<string, RegisteredWorld>
}
```

---

## 3. Zustand Store

`src/stores/asset-storage-store.ts` (신규).

### 3.1 액션

| 액션 | 시그니처 | 동작 |
|------|----------|------|
| `registerCharacter` | `(input: RegisterCharacterInput) => string` | id 발급, 저장, id 반환 |
| `registerWorld` | `(input: RegisterWorldInput) => string` | 동일 |
| `unregister` | `(id: string) => void` | 캔버스 노드의 `registered` 필드도 함께 초기화 (cross-store 호출) |
| `updateRegistration` | `(id: string, patch: Partial<RegisteredCharacter>) => void` | 부분 갱신, updatedAt 갱신 |
| `getCharacter` | `(id: string) => RegisteredCharacter \| undefined` | 단일 조회 |
| `listCharactersByProject` | `(projectId: string) => RegisteredCharacter[]` | P4 export용 |
| `listWorldsByProject` | `(projectId: string) => RegisteredWorld[]` | P4 export용 |

### 3.2 RegisterCharacterInput

```typescript
type RegisterCharacterInput = {
  projectId: string
  sourceCanvasNodeId: string
  name: string
  alias: string
  background: string
  description: string
  // 아래 4개는 canvas-store에서 자동 추출해 전달 (사용자 입력 아님)
  prompt: string
  referenceImages: string[]
  views: RegisteredCharacter['views']
  statusVariants: RegisteredCharacter['statusVariants']
}
```

---

## 4. P4 인터페이스 (export 계약)

P4 The Set이 Asset Storage를 직접 의존하지 않고 export 함수로 추상화.

`src/features/artist/asset-export.ts`:

```typescript
import type { CharacterAsset, WorldAsset } from '@/types'  // 기존 P4 타입

export function exportCharacterAssets(projectId: string): CharacterAsset[]
export function exportWorldAssets(projectId: string): WorldAsset[]
```

### 4.1 매핑 규칙

`RegisteredCharacter` → 기존 `CharacterAsset` (mocks/character-assets.ts 참조):

| 기존 필드 | 매핑 |
|-----------|------|
| `id` | `RegisteredCharacter.id` |
| `name` | `name` |
| `alias` | `alias` |
| `prompt` | `prompt` |
| `referenceImages` | `referenceImages` |
| `views.front/side/back` (3뷰) | `views.fiveView`에서 `view === 'front' | 'left' | 'back'` 매핑 |
| (확장 필드) `views.fiveView`, `views.sixteenAngle`, `statusVariants` | P4 추가 활용 가능, 기존 호환은 3뷰만 |

> P4는 기존 3뷰 인터페이스로 시작, 추후 5-View / 16-Angle / Status 활용 단계는 별도 결정.

---

## 5. Persistence

### 5.1 LocalStorage Key

```
tale-asset-storage-v1-<projectId>
```

값: `AssetStorageState` JSON.stringify.

### 5.2 이미지 저장 전략 (MVP)

- 이미지 URL은 두 형태 혼재 가능:
  - `data:image/png;base64,...` (base64 인라인, 작은 이미지)
  - 임시 fetch URL (생성 직후 메모리 캐시, persist 시 base64로 변환)
- localStorage 용량 한계 (5MB) 도달 시 경고 표시
- 실 이미지 전용 스토리지(Supabase Storage / S3 / R2) 도입은 별도 결정. 본 문서의 `url: string` 필드는 변경 없이 유지.

### 5.3 Migration

- v1: localStorage Zustand persist
- v2 (Supabase): `RegisteredCharacter` row + `registered_images` row 분리, projectId 외래키
- 마이그레이션 시 v1 키 백업 후 변환 함수 실행

---

## 6. 캔버스 ↔ Asset Storage 동기화

| 시나리오 | 동작 |
|----------|------|
| 사용자가 노드에서 등록 | `canvas-store.registerCharacter` 호출 → 내부에서 `asset-storage.registerCharacter` 호출 → 반환된 id를 `NodeData.registered.registeredId`에 채움 |
| 등록 후 노드 prompt 변경 | 노드 stale=true. Asset Storage 자동 갱신 안 함. 사용자가 "재등록" 명시 액션 시에만 갱신 |
| 등록 후 노드 삭제 | `RegisteredCharacter`는 그대로 유지. `sourceCanvasNodeId`는 dangling reference로 남음 (그래프 복원 시 안내) |
| 캔버스 일괄 초기화 | Asset Storage는 별개. 사용자가 명시적으로 unregister 해야 사라짐 |

---

## 7. 검증 케이스

| # | 케이스 | 기대 |
|---|--------|------|
| 1 | 5-View 5장만 있는 Actor 등록 시도 | `canRegister = false` (5 < 20). 등록 거부 |
| 2 | 5-View 5장 + 16-Angle 16장 + Single 1장 | 22장 → 등록 가능 |
| 3 | 등록 후 Single 1장 추가 생성 | RegisteredCharacter 자동 갱신 안 함. 노드는 "재등록" 가능 표시 |
| 4 | Status 자식 3개를 가진 마더 등록 | RegisteredCharacter.statusVariants에 3개 직렬화 |
| 5 | 등록된 노드 삭제 | RegisteredCharacter 보존, sourceCanvasNodeId는 dangling |
| 6 | 동일 노드 재등록 | 기존 id 유지, updatedAt 갱신, 전체 필드 덮어쓰기 |
