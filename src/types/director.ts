import type { Node, Edge } from '@xyflow/react'
import type {
  CameraConfig,
  LightingConfig,
  CameraPreset,
  GenerationMethod,
} from '@/types/shot'
import type { VideoModelKey } from '@/lib/video-models'

// ============================================================================
// Director Canvas Types
// ============================================================================

export type DirectorNodeKind = 'scene' | 'shot' | 'video' | 'asset' | 'prompt'

export type DirectorEdgeCategory =
  | 'parent' // Scene→Shot, Shot→Video (계층)
  | 'relates-to' // 사용자 정의 내러티브 관계
  | 'references' // Asset→Shot (Artist 에셋을 참조하는 샷, 파생 — DB 미영속)
  | 'prompt' // Prompt 노드 → Shot T 입력 (프롬프트 와이어, 영속)

export type DirectorVideoStatus =
  | 'pending'
  | 'generating'
  | 'completed'
  | 'failed'

/** 영상 생성 모델 키. video-models 레지스트리의 VideoModelKey 별칭 (#5). */
export type DirectorVideoProvider = VideoModelKey

// ─── Reference / Asset ─────────────────────────────────────────────────────

/** 사용자가 직접 업로드한 보조 참고 이미지 (생성물 아님). */
export type DirectorReferenceImage = {
  id: string
  url: string
  uploadedAt: number
}

/**
 * I2I로 생성된 샷 대표 이미지 (샷당 1장, 내부 결정 #36/#37).
 * 입력: 연결된 actor+world asset 이미지 자동 결합 + 샷 프롬프트.
 * 이 이미지가 해당 샷 I2V 영상 생성의 기본 레퍼런스가 된다.
 */
export type StoryboardImage = {
  url: string
  status: DirectorVideoStatus // 'pending'|'generating'|'completed'|'failed' 재사용
  errorMessage: string | null
  generatedAt: number
}

// ─── Scene Node ────────────────────────────────────────────────────────────

export type SceneNodeData = {
  kind: 'scene'
  label: string
  /** Writer Scene 양방향 sync 키. null이면 Director에서 직접 생성 (Writer로 push 예정) */
  writerSceneId: string | null
  location: string
  timeOfDay: string
  mood: string
  description: string
  [key: string]: unknown // React Flow constraint
}

// ─── Shot Node ─────────────────────────────────────────────────────────────

export type ShotNodeData = {
  kind: 'shot'
  label: string
  /** Writer Shot 양방향 sync 키 */
  writerShotId: string | null
  /** 부모 Scene Canvas 노드 ID */
  parentSceneNodeId: string | null
  prompt: string
  /** 사용자 업로드 보조 참고 이미지 (생성물 아님 — storyboardImage와 구분, 결정 #37) */
  referenceImages: DirectorReferenceImage[]
  /** I2I 생성 샷 대표 이미지 (샷당 1장, I2V 기본 레퍼런스). null = 미생성 */
  storyboardImage: StoryboardImage | null
  /** Artist Asset Storage RegisteredCharacter.id 목록 (references 엣지는 논리적) */
  characterAssetIds: string[]
  /** Artist Asset Storage RegisteredWorld.id 목록 */
  worldAssetIds: string[]
  camera: CameraConfig
  lighting: LightingConfig
  cameraPreset: CameraPreset
  provider: DirectorVideoProvider
  /** Writer가 설계한 샷 길이(초). flexible 모델 duration + Veo 트림 기준 (#4) */
  durationSeconds: number
  /** 영상 생성 방식. storyboardImage/레퍼런스 있으면 I2V, 없으면 T2V (결정 #36) */
  generationMethod: GenerationMethod
  /** Shot 설정 변경 시 자식 Video stale 표시 (시그널, 자동 재생성 X) */
  stale: boolean
  [key: string]: unknown
}

// ─── Video Node ────────────────────────────────────────────────────────────

/** 마더 Shot 대비 override할 수 있는 필드들 */
export type VideoOverride = Partial<{
  prompt: string
  camera: CameraConfig
  lighting: LightingConfig
  cameraPreset: CameraPreset
  provider: DirectorVideoProvider
}>

export type VideoNodeData = {
  kind: 'video'
  label: string
  /** 마더 Shot Canvas 노드 ID (반드시 존재) */
  parentShotNodeId: string
  /** 연결된 `video_clips.id` (uuid). null = 아직 DB에 영속 안 됨 (수동 노드 등) */
  videoClipId: string | null
  /** 마더 대비 변경된 필드 (없으면 마더 값 그대로 사용) */
  override: VideoOverride
  /** 생성 결과 */
  videoUrl: string | null
  thumbnailUrl: string | null
  status: DirectorVideoStatus
  errorMessage: string | null
  /** ★ Editor 핸드오프 시 선정. 결정 #11: Shot당 1개 강제 (앱 레벨 enforce) */
  final: boolean
  /** 마더 변경 후 미재생성 상태 */
  stale: boolean
  [key: string]: unknown
}

// ─── Asset Node (파생 — Artist Asset Storage 시각화) ─────────────────────────

/**
 * Artist에서 생성된 캐릭터/월드 에셋을 Director 캔버스에 표시하는 read-only 노드.
 * DB에 영속하지 않는 파생 노드 — asset-storage(characters/locations)가 진실이고,
 * 매 진입 시 sync가 재생성한다(persist partialize에서 제외). Director에서 편집 불가(locked).
 * 같은 에셋이 여러 씬에 등장하면 씬별 인스턴스로 표시된다(scene 우측 컬럼).
 */
export type AssetNodeData = {
  kind: 'asset'
  label: string
  assetKind: 'character' | 'world'
  /** asset-storage RegisteredCharacter/World.id (= DB character_id / location_id) */
  assetId: string
  imageUrl: string | null
  /** 항상 true — Artist가 진실, Director는 표시만 */
  locked: true
  /** 어떤 shot도 참조하지 않는 미사용 에셋 (불러오기 토글로 좌상단에 표시) */
  unused?: boolean
  [key: string]: unknown
}

// ─── Prompt Node (Higgsfield식 분리 프롬프트) ────────────────────────────────

/**
 * 이미지 노드의 프롬프트를 캔버스에 별도 노드로 분리한 것 (Higgsfield "Prompt" 노드).
 * 우측 출력 핸들을 Shot 노드의 T 입력에 와이어링하면 wirePromptToShot이
 * 대상 Shot.prompt를 이 노드의 text로 동기화한다. DB 미영속(파생/보조 UI).
 */
export type PromptNodeData = {
  kind: 'prompt'
  /** 노드 라벨 (union 공통 속성) */
  label: string
  /** 프롬프트 텍스트 (Shot.prompt의 source) */
  text: string
  /** 와이어링된 대상 Shot 노드 ID. null = 아직 미연결 */
  targetShotNodeId: string | null
  [key: string]: unknown
}

// ─── Discriminated union ───────────────────────────────────────────────────

export type DirectorNodeData =
  | SceneNodeData
  | ShotNodeData
  | VideoNodeData
  | AssetNodeData
  | PromptNodeData

export type DirectorEdgeData = {
  category: DirectorEdgeCategory
  relationText: string
  [key: string]: unknown
}

export type DirectorNode = Node<DirectorNodeData, DirectorNodeKind>
export type DirectorEdge = Edge<DirectorEdgeData, DirectorEdgeCategory>

// ─── ID helpers ────────────────────────────────────────────────────────────

export const newDirectorId = (
  prefix: 'dn' | 'de' | 'dr' | 'dp',
): string => `${prefix}_${crypto.randomUUID()}`

// ─── Canvas layout constants (결정 #18) ────────────────────────────────────

/** Scene 노드 폭 + gap */
export const SCENE_OFFSET_X = 360
/** Shot 노드 폭 + gap (Scene 우측에 stacking) */
export const SHOT_OFFSET_X = 360
/** Shot 형제 간 세로 간격 — 스토리보드 썸네일 포함 카드 실높이(~300px)보다 커야 자동 정렬 시 안 겹친다(#e3 2026-07-13) */
export const SHOT_OFFSET_Y = 340
/** Video 노드 폭 + gap (Shot 우측 stacking). Scene→Shot(360)과 동일 간격으로 여유 확보 */
export const VIDEO_OFFSET_X = 360
/** Video 형제 간 세로 간격 — 썸네일 카드 겹침 방지 여유 포함(#e3) */
export const VIDEO_OFFSET_Y = 260
/** snap-to-grid */
export const SNAP_GRID: [number, number] = [16, 16]

// ─── Asset 컬럼 레이아웃 (Scene 좌측: character 위 → world 아래) ─────────────
/** asset 컬럼이 Scene 좌측으로 떨어진 거리 (asset.x = scene.x - 이 값) */
export const ASSET_OFFSET_X = 300
/** asset 노드 폭 */
export const ASSET_NODE_WIDTH = 200
/** asset 형제 간 세로 간격 */
export const ASSET_OFFSET_Y = 132

// ─── Type guards ───────────────────────────────────────────────────────────

export function isSceneData(d: DirectorNodeData): d is SceneNodeData {
  return d.kind === 'scene'
}
export function isShotData(d: DirectorNodeData): d is ShotNodeData {
  return d.kind === 'shot'
}
export function isVideoData(d: DirectorNodeData): d is VideoNodeData {
  return d.kind === 'video'
}
export function isAssetData(d: DirectorNodeData): d is AssetNodeData {
  return d.kind === 'asset'
}

export function isPromptData(d: DirectorNodeData): d is PromptNodeData {
  return d.kind === 'prompt'
}
