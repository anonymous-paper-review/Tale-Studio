# Canvas Data Model

> **[DEPRECATED — 2026-06-04]** 이 문서는 L0 노드 그래프 재설계(`redesign-l0-canvas`, 아카이브: `specs/archive/2026-06-04-redesign-l0-canvas/`) 시절 작성된 React Flow 기반 타입 정의입니다. 카드형 Artist UI로 롤백됨에 따라 `canvas-store.ts`가 삭제되어 이 모델은 더 이상 active code에 반영되지 않습니다. 삭제하지 않고 역사적 참고용으로 보존.
>
> 현행 L0 스펙: `specs/layers/L0_concept_canvas.md` — 카드형 패널 기반.
> 현행 에셋 스토어: `specs/data/asset_storage.md` (여전히 유효).

---

> ~~L0 Concept Canvas의 TypeScript 타입과 Zustand store 액션 계약. React Flow 커스텀 노드/엣지의 시그니처 단일 진실.~~

## 1. 타입

### 1.1 Enum

```typescript
type NodeKind = 'actor' | 'world' | 'status'

type OutputMode = 'single' | 'five-view' | 'sixteen-angle'

type EdgeCategory = 'parent' | 'in-world' | 'references'

type ModelId = 'imagen' | 'h100-self'  // MVP 2종
```

### 1.2 GeneratedImage

```typescript
type GeneratedImage = {
  id: string              // UUID
  url: string             // MVP: base64 data URL 또는 임시 fetch URL
  prompt: string          // 생성에 실제 사용된 resolved prompt 스냅샷
  seed?: number           // 동일 시드 변주 재현용
  angle?: number          // 16-angle 모드: 0~360 (22.5도 간격)
  view?: 'front' | 'left' | 'right' | 'back' | 'detail'  // 5-view 모드
  modelId: ModelId
  createdAt: number       // epoch ms
}
```

### 1.3 NodeData

```typescript
type ReferenceImage = {
  id: string
  url: string
  uploadedAt: number
}

type Registration = {
  registeredId: string    // Asset Storage의 RegisteredCharacter.id
  name: string
  alias: string
  background: string
  description: string
  registeredAt: number
}

type NodeData = {
  kind: NodeKind
  label: string                       // 노드 박스 라벨 (인라인 편집)
  prompt: string                      // 자체 prompt (자식 노드는 부모와 독립)
  referenceImages: ReferenceImage[]   // 좌→우 스택 순
  outputMode: OutputMode              // 현재 활성 모드
  generatedImages: GeneratedImage[]   // 누적. 모드별 다 보존 (Single 1 + 5-View 5 + 16-Angle 16 = 최대 22장)
  modelId: ModelId                    // 다음 생성에 사용할 모델
  stale: boolean                      // 부모 prompt 변경 후 미재생성 상태
  motherId: string | null             // Status 노드만 사용. 마더 노드의 NodeData.id
  registered: Registration | null     // 등록 시 채워짐. null이면 미등록
}
```

### 1.4 React Flow 호환

```typescript
import type { Node, Edge } from '@xyflow/react'

type CanvasNode = Node<NodeData, NodeKind>   // type 필드에 kind 사용
type CanvasEdge = Edge<EdgeData, EdgeCategory>  // type 필드에 category 사용

type EdgeData = {
  category: EdgeCategory
  relationText: string                // 자유 텍스트 (관계 내러티브)
}
```

### 1.5 ID 발급

- 모든 ID는 client-side UUID v4 (`crypto.randomUUID()`)
- 노드 ID 접두사: `n_<uuid>`
- 엣지 ID 접두사: `e_<uuid>`
- 이미지 ID 접두사: `i_<uuid>`

---

## 2. Zustand Store

`src/stores/canvas-store.ts` (기존 `artist-store.ts` 폐기).

### 2.1 State

```typescript
type CanvasState = {
  // graph
  nodes: CanvasNode[]
  edges: CanvasEdge[]

  // UI
  selectedNodeId: string | null
  selectedEdgeId: string | null
  viewport: { x: number; y: number; zoom: number }

  // persistence meta
  projectId: string
  lastSavedAt: number
}
```

### 2.2 액션

| 액션 | 시그니처 | 동작 |
|------|----------|------|
| `addNode` | `(kind: NodeKind, position: XY) => string` | 새 노드, 기본 outputMode='single', stale=false. id 반환 |
| `updateNodeData` | `(id: string, patch: Partial<NodeData>) => void` | 부분 갱신. prompt 변경 시 자동 propagateStale 호출 |
| `deleteNode` | `(id: string) => void` | 섹션 5번 cascade 정책 적용 |
| `duplicateNode` | `(id: string) => string` | 독립 자식 생성. 마더 속성 복제, motherId 안 채움, parent 엣지 자동 추가 |
| `branchStatus` | `(motherId: string) => string` | Status 노드 생성. motherId 채움, parent 엣지 자동 추가 |
| `addEdge` | `(source: string, target: string, data: EdgeData, sourceHandle?: string \| null, targetHandle?: string \| null) => string \| null` | 엣지 추가. 자기 자신·중복 거부. handle 정보는 ReactFlow 끝점 매핑용 |
| `updateEdge` | `(id: string, patch: Partial<EdgeData>) => void` | 카테고리·관계 텍스트 갱신 |
| `deleteEdge` | `(id: string) => void` | 엣지만 제거 (노드 영향 없음) |
| `setOutputMode` | `(id: string, mode: OutputMode) => void` | 모드 전환. 기존 생성 이미지는 보존 |
| `appendGeneratedImages` | `(id: string, images: GeneratedImage[]) => void` | 생성 결과 누적 |
| `propagateStale` | `(rootId: string) => void` | 직계+후손 모두 stale=true. Status 노드는 강한 stale 플래그 (시각 차별, 섹션 3.2 참조) |
| `clearStale` | `(id: string) => void` | 사용자가 재생성 클릭 시 호출 |
| `registerCharacter` | `(id: string, input: RegistrationInput) => string` | Asset Storage에 export, NodeData.registered 채움. 등록 ID 반환 |
| `selectNode` | `(id: string \| null) => void` | UI 상태 |
| `selectEdge` | `(id: string \| null) => void` | UI 상태 |

### 2.3 Selectors (computed, hook으로 expose)

| Selector | 반환 | 용도 |
|----------|------|------|
| `getNode(id)` | `CanvasNode \| undefined` | 단일 조회 |
| `getDescendants(id)` | `CanvasNode[]` | parent 엣지 따라 BFS, 후손 전체 |
| `getMotherChain(id)` | `CanvasNode[]` | Status 노드 → 마더 → 마더의 마더 (root까지) |
| `countImagesInSubtree(id)` | `number` | 캐릭터 등록 임계 (≥ 20) 판정 |
| `canRegister(id)` | `boolean` | `countImagesInSubtree(id) >= 20 && !registered` |
| `getOutgoingEdges(id)` | `CanvasEdge[]` | source가 id인 엣지 |
| `getIncomingEdges(id)` | `CanvasEdge[]` | target이 id인 엣지 |
| `getEffectivePrompt(id)` | `string` | Status 노드: 마더 prompt + 자체 prompt 결합. 그 외: 자체 prompt 그대로. (L0 스펙 섹션 9 참조) |

---

## 3. Persistence

### 3.1 LocalStorage Key

```
tale-canvas-v1-<projectId>
```

값: `CanvasState` JSON.stringify (이미지 base64 포함 시 용량 주의, 5MB 한도).

### 3.2 Strong stale flag

`stale: boolean`은 단순 boolean이지만 시각 강도는 노드 종류로 결정:
- 일반 자식 노드: stale 시 좌상단 점멸 점 (`--destructive` 50% 채도)
- Status 노드: stale 시 좌상단 점멸 점 + 박스 전체 border 색 `--destructive` 100%로 강조

별도 플래그 필드 없이 노드 종류 + stale 조합으로 시각 분기.

### 3.3 Migration

- v1 → v2 마이그레이션 시점에는 lastSavedAt 기준 변환 함수 작성
- 기존 `artist-store` localStorage 키는 v1 도입 시점에 별도 정리 함수로 제거

---

## 4. React Flow 통합

### 4.1 커스텀 노드 컴포넌트

`src/features/artist/nodes/`:
- `ActorNode.tsx` — `NodeProps<NodeData>` 받음, `data.kind === 'actor'` 가정
- `WorldNode.tsx`
- `StatusNode.tsx`

`<ReactFlow nodeTypes={{ actor: ActorNode, world: WorldNode, status: StatusNode }} />`로 등록.

### 4.2 커스텀 엣지 컴포넌트

`src/features/artist/edges/`:
- `ParentEdge.tsx` — 2px 실선
- `InWorldEdge.tsx` — 1.5px 실선
- `ReferencesEdge.tsx` — 1.5px 점선

`<ReactFlow edgeTypes={{ parent: ParentEdge, 'in-world': InWorldEdge, references: ReferencesEdge }} />`.

### 4.3 핸들러

| 이벤트 | 처리 |
|--------|------|
| `onPaneDoubleClick` | 빈 공간 더블클릭 → 노드 생성 팝업 (Actor/World 선택) |
| `onNodeDoubleClick` | 노드 더블클릭 → `openPopup(id)` (Edit 단축, decisions.md #33) |
| `onNodeContextMenu` | **사용 안 함** — 우클릭 컨텍스트 메뉴 제거 (decisions.md #33). 액션은 BaseNode 헤더 4 아이콘으로 일원화 |
| `onConnect` | 엣지 연결 시 `openRelationModal(source, target, sourceHandle, targetHandle)` 호출. 사용자 connect의 handle 정보 보존 |
| `onConnectStart` / `onConnectEnd` | 빈 공간으로 드롭 시 Branch (Status 자식 자동 생성) |
| `onNodesDelete` / `onEdgesDelete` | 키보드 Delete 처리. 섹션 5번 cascade 적용 |
| `connectionMode='loose'` | source/target Handle 양방향 연결 허용 (BaseNode의 Handle 4개가 모두 type='source'라 strict 모드에서 연결 불가했던 이슈 해결) |

---

## 5. Cascade 정책 요약

(L0 스펙 섹션 13 참조 — 노드 삭제 cascade)

| 대상 | 정책 |
|------|------|
| 일반 자식 (Actor/World가 parent 엣지로 연결) | **Orphan**. 자식만 남고 incident 엣지만 제거 |
| Status 자식 (motherId 채워진 노드) | **Cascade**. 마더 의존이므로 함께 삭제 |
| 등록된 캐릭터를 가진 노드 | Asset Storage의 RegisteredCharacter는 **보존**. 그래프에서만 사라짐 |
| 엣지 삭제 | 노드는 영향 없음 |

---

## 6. Agent Actions (CanvasUpdate union)

L0 Meeting Room의 artist agent가 캔버스를 조작할 수 있는 액션 셋. `applyUpdates(updates: CanvasUpdate[])` 액션이 순차 디스패치.

### 7.1 Type

```typescript
type CanvasUpdate =
  // 비파괴 — agent 직접 실행
  | { type: 'addNode'; kind: NodeKind; label?: string; prompt?: string; position?: XYPosition; tempId?: string }
  | { type: 'updateNode'; id: string; patch: Partial<Pick<NodeData, 'label' | 'prompt' | 'modelId' | 'outputMode'>> }
  | { type: 'connect'; sourceId: string; targetId: string; category: EdgeCategory; relationText?: string }
  | { type: 'setOutputMode'; id: string; mode: OutputMode }
  | { type: 'generate'; id: string }
  | { type: 'branchStatus'; motherId: string; label?: string; prompt?: string }
  | { type: 'duplicateNode'; id: string }
  // 파괴·등록 — agent는 request만, 실제 실행은 사용자 확인 모달
  | { type: 'requestDelete'; id: string; reason?: string }
  | { type: 'requestRegister'; id: string; suggestedName?: string; suggestedAlias?: string; suggestedBackground?: string; suggestedDescription?: string }
  // 안내 — UI 강조만
  | { type: 'selectNode'; id: string }
```

### 7.2 `tempId` 메커니즘 (multi-step 시나리오)

agent가 같은 turn에 "노드 생성 + 그 노드 prompt 수정"을 보낼 때, 첫 액션의 결과 ID를 두 번째 액션이 참조해야 함. `addNode`/`branchStatus`에 `tempId`를 옵션으로 받고, 같은 batch 내 후속 액션이 `tempId`로 참조.

예: agent가 보내는 updates 배열:
```json
[
  { "type": "addNode", "kind": "actor", "label": "Kai", "tempId": "T1" },
  { "type": "updateNode", "id": "T1", "patch": { "prompt": "갈색 머리…" } },
  { "type": "setOutputMode", "id": "T1", "mode": "five-view" },
  { "type": "generate", "id": "T1" }
]
```

`applyUpdates` 내부에서 tempId → 실제 ID 매핑 테이블을 유지하며 후속 액션의 id를 swap.

### 7.3 검증·실패 정책

- 모든 액션 실행 전 ID 유효성 검사. 유효하지 않으면 그 액션만 skip, 나머지 계속 (best-effort).
- `connect` 시 source/target 둘 다 존재해야 추가. 한쪽 없으면 skip.
- `setOutputMode` / `generate` / `branchStatus`: 노드 종류 검증 (status 노드는 branchStatus 거부 등 기존 store 규칙 그대로).
- 실패한 액션은 toast로 알림 (사용자에게 투명성 제공).

### 7.4 액션 매핑 (store 메서드)

| CanvasUpdate | 호출 메서드 |
|---|---|
| `addNode` | `addNode(kind, position ?? default, label)` + (옵션) `updateNodeData(prompt)` |
| `updateNode` | `updateNodeData(id, patch)` |
| `connect` | `addEdge(source, target, { category, relationText })`. LLM 출력에는 `sourceHandle`/`targetHandle` 미포함 — ReactFlow가 default 매핑 |
| `setOutputMode` | `setOutputMode(id, mode)` |
| `generate` | `generateMockImages(id)` (P10-6에서 실제 API로 교체) |
| `branchStatus` | `branchStatus(motherId)` + (옵션) `updateNodeData` |
| `duplicateNode` | `duplicateNode(id)` |
| `requestDelete` | `openDeleteConfirm(id)` |
| `requestRegister` | `openPopup(id)` + 등록 폼 자동 펼침 + suggested 값 prefill |
| `selectNode` | `selectNode(id)` |

### 7.5 컨텍스트 직렬화 (`serializeCanvasContext`)

agent에 매 chat turn 전송하는 캔버스 스냅샷 포맷:

```
## 캔버스 상태

### 통계
- 노드 N개 (Actor X, World Y, Status Z)
- 엣지 N개 (parent X, in-world Y, references Z)
- 누적 이미지 N장 / 등록 임계 20

### 노드 목록
- [n_abc] Actor "Kai" (single, 5 imgs): "갈색 머리, 검은 코트..."
- [n_def] World "사막" (five-view, 0 imgs): "황량한 모래언덕..."
- [n_ghi] Status "Kai - injured" (mother: n_abc, single, 0 imgs)

### 엣지 목록
- n_abc -parent-> n_ghi
- n_abc -in-world-> n_def ("사막에 사는 검사")

### 선택
- n_abc (full prompt 포함)
```

큰 그래프(노드 30+)에선 노드 prompt 80자 truncate. 선택 노드만 풀 prompt.

---

## 7. 검증 케이스 (구현 시 테스트해야 할 것)

| # | 케이스 | 기대 |
|---|--------|------|
| 1 | Actor 노드 prompt 변경 | 모든 후손 stale=true. Status 자식은 강한 stale |
| 2 | Actor 노드 삭제, parent 엣지로 자식 2개 연결 | 자식 2개는 orphan으로 남음, 엣지 2개 제거 |
| 3 | Status 노드의 마더 삭제 | Status도 함께 삭제 |
| 4 | 5-View 생성 5장 + 16-Angle 생성 16장 + Single 1장 | `countImagesInSubtree` = 22, `canRegister = true` |
| 5 | 같은 노드끼리 엣지 연결 시도 | 거부 |
| 6 | 동일 source-target 엣지 중복 추가 | 거부 (마지막 1개만 유지 또는 무시) |
| 7 | Status 노드의 effective prompt | 마더 prompt + 자체 prompt 결합 (L0 9번 규칙) |
