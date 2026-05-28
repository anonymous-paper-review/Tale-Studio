import type { Node, Edge } from '@xyflow/react'
import type { CameraConfig, LightingConfig, CameraPreset } from '@/types/shot'

// ============================================================================
// Director Canvas Types — specs/layers/director_canvas.md §2~7
// ============================================================================

export type DirectorNodeKind = 'scene' | 'shot' | 'video'

export type DirectorEdgeCategory =
  | 'parent' // Scene→Shot, Shot→Video (계층)
  | 'relates-to' // 사용자 정의 내러티브 관계

export type DirectorVideoStatus =
  | 'pending'
  | 'generating'
  | 'completed'
  | 'failed'

export type DirectorVideoProvider = 'kling' | 'veo' | 'local'

// ─── Reference / Asset ─────────────────────────────────────────────────────

export type DirectorReferenceImage = {
  id: string
  url: string
  uploadedAt: number
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
  referenceImages: DirectorReferenceImage[]
  /** Artist Asset Storage RegisteredCharacter.id 목록 (references 엣지는 논리적) */
  characterAssetIds: string[]
  /** Artist Asset Storage RegisteredWorld.id 목록 */
  worldAssetIds: string[]
  camera: CameraConfig
  lighting: LightingConfig
  cameraPreset: CameraPreset
  provider: DirectorVideoProvider
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

// ─── Discriminated union ───────────────────────────────────────────────────

export type DirectorNodeData = SceneNodeData | ShotNodeData | VideoNodeData

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
/** Shot 형제 간 세로 간격 */
export const SHOT_OFFSET_Y = 200
/** Video 노드 폭 + gap (Shot 우측 stacking) */
export const VIDEO_OFFSET_X = 280
/** Video 형제 간 세로 간격 */
export const VIDEO_OFFSET_Y = 180
/** snap-to-grid */
export const SNAP_GRID: [number, number] = [16, 16]

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
