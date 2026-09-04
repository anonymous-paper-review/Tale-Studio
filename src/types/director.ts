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

export type DirectorNodeKind =
  | 'scene'
  | 'shot'
  | 'video'
  | 'asset'
  | 'prompt'
  | 'shotImage'
  | 'videoPlaceholder'

export type DirectorEdgeCategory =
  | 'parent' // Scene→Shot, Shot→Video (계층)
  | 'relates-to' // 사용자 정의 내러티브 관계
  | 'references' // Asset→Shot (Artist 에셋을 참조하는 샷, 파생 — DB 미영속)
  | 'prompt' // Prompt 노드 → Shot T 입력 (프롬프트 와이어, 영속)
  | 'image' // image-capable source → Shot image-reference input (이미지 와이어, 파생)
  | 'frame' // image-capable source → Video frame input (프레임 와이어, 영속)
  | 'video-chain' // completed Video last-frame → Video START (사용자 체인)
  | 'chain' // Shot→ShotImage→Video (샷 체인, 파생 — DB 미영속)

/** Shot image-reference input target handle. */
export type DirectorImageTargetHandle = 'image-reference'

/** Video frame input target handles. DIRECTION is intentionally not a Video input. */
export type DirectorVideoFrameTargetHandle =
  | 'frame-start'
  | 'frame-end'
  | 'frame-ref'

/** Previous-video last-frame input target handle. */
export type DirectorVideoChainTargetHandle = 'video-chain'

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
  /** 대표 프레임(3프레임 세트에선 start) — 단일 이미지 구버전과의 하위 호환 필드. */
  url: string
  status: DirectorVideoStatus // 'pending'|'generating'|'completed'|'failed' 재사용
  errorMessage: string | null
  generatedAt: number
  /** 실사 3프레임 세트(#real-strip 2026-07-22): 러프 스트립을 레퍼런스로 리페인트한 start→direction→end. */
  frames?: {
    start: string
    direction: string
    end: string
  }
  /** [레거시 기록] 이 세트가 잘려 나온 원본 스트립/그리드 — #no-originals(2026-08-24) 이후
   *  미기록·기존 행의 값도 스토리지에서 회수돼 404. 소비처 없음(제거 검증 완료). */
  stripUrl?: string
  /** 약속 I4(2026-09-04): 이 실사가 참조한 러프의 generatedAt. 지금 러프와 다르면 "러프 바뀜". 옛 행은 없음(판정 안 함). */
  roughGeneratedAt?: number | null
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
  /** 하위호환 legacy prompt fallback. Writer sync v2는 derivedPrompt를 갱신한다. */
  prompt: string
  /** Writer sync가 관리하는 파생 prompt. 사용자 편집 금지. */
  derivedPrompt?: string
  /** 사용자 편집 prompt override. Writer sync는 이 필드를 건드리지 않는다. */
  promptOverride?: string
  /** legacy prompt를 v2 필드로 1회 이관했는지 표시하는 멱등 플래그. */
  promptMigratedV2?: boolean
  /** 사용자 업로드 보조 참고 이미지 (생성물 아님 — storyboardImage와 구분, 결정 #37) */
  referenceImages: DirectorReferenceImage[]
  /** Manual image-reference wiring source node IDs. URLs are resolved at generation time. */
  imageInputs: string[]
  /** I2I 생성 샷 대표 이미지 (샷당 1장, I2V 기본 레퍼런스). null = 미생성 */
  storyboardImage: StoryboardImage | null
  /** Artist Asset Storage RegisteredCharacter.id 목록 (references 엣지는 논리적) */
  characterAssetIds: string[]
  /** Artist Asset Storage RegisteredWorld.id 목록 */
  worldAssetIds: string[]
  /** 약속 F·G(2026-09-04): 사람이 참조 목록을 손댔다(선 삭제·팝업 토글). true 면 Writer 동기화가 목록을 덮지 않고
   *  DB(shots.director_refs)에 남아 실사 생성이 이 목록만 붙인다. */
  referenceOverride?: boolean
  camera: CameraConfig
  lighting: LightingConfig
  cameraPreset: CameraPreset
  provider: DirectorVideoProvider
  /** 이미지 생성 모델 키(#image-model-select 2026-08-31 — image-models 레지스트리). 미지정 = 기본 모델 */
  imageModel?: string
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

/** 부모 Shot 없이 독립 생성한 Video가 직접 소유하는 완전한 생성 설정. */
export type StandaloneVideoConfig = {
  prompt: string
  camera: CameraConfig
  lighting: LightingConfig
  cameraPreset: CameraPreset
  provider: DirectorVideoProvider
  durationSeconds: number
}

type VideoNodeCommonData = {
  kind: 'video'
  label: string
  /** 연결된 `video_clips.id` (uuid). null = 아직 서버에 영속 안 됨 */
  videoClipId: string | null
  /** DB가 부여한 logical take 순서 */
  takeNumber: number
  /** 가장 최근 생성 attempt의 durable job id와 상태 */
  generationJobId: string | null
  lastAttemptStatus: DirectorVideoStatus | null
  lastAttemptError: string | null
  lastAttemptAt: string | null
  /** Logical take creation time for deterministic projection ordering. */
  createdAt: string | null
  /**
   * Manual frame wiring source node IDs.
   * `start` and `end` accept at most one source each; `refs` accepts multiple source IDs.
   * DIRECTION is intentionally not a Video input.
   */
  frameInputs: { start: string | null; end: string | null; refs: string[] }
  /** Previous completed Video node whose extracted last frame starts this take. */
  videoChainInputId: string | null
  /** Public image URL captured from the previous Video's last frame. */
  videoChainFrameUrl: string | null
  /** 생성 결과 */
  videoUrl: string | null
  thumbnailUrl: string | null
  status: DirectorVideoStatus
  errorMessage: string | null
  /** ★ Editor 핸드오프 시 선정. 결정 #11: Shot당 1개 강제 (앱 레벨 enforce) */
  final: boolean
  /** 마더 변경 후 미재생성 상태 */
  stale: boolean
  /** 모션 계약 준수 판정(#adherence P2) — 완료 후 첫/끝 프레임 검사 결과. null=미검사. */
  adherence?: VideoAdherence | null
  [key: string]: unknown
}

export type VideoNodeData =
  | (VideoNodeCommonData & {
      /** 설정과 take 그룹을 소유하는 마더 Shot Canvas 노드 ID. */
      parentShotNodeId: string
      standaloneVideoKey: null
      /** 마더 Shot 대비 변경된 필드 (없으면 마더 값 그대로 사용). */
      override: VideoOverride
    })
  | (VideoNodeCommonData & {
      /** 독립 Video에는 마더 Shot이 없다. */
      parentShotNodeId: null
      /** `video_clips.shot_id`에 저장된 독립 Video owner key. */
      standaloneVideoKey: string
      /** 독립 Video가 직접 소유하는 완전한 생성 설정. */
      override: StandaloneVideoConfig
    })

/** 영상 모션 준수 판정(video_clips.adherence 와 동형). */
export interface VideoAdherence {
  status: 'ok' | 'over_motion' | 'under_motion' | 'direction_mismatch' | 'skipped'
  reason?: string
  observed?: string
  meanDiff?: number
  cameraStatic?: boolean
  checkedAt?: string
}

// ─── Asset-backed Image Node ────────────────────────────────────────────────

/**
 * Artist 에셋을 입력으로 삼는 Director의 editable Image 템플릿.
 * 원본은 asset-storage가 소유하고, Director에서는 prompt/model/reference와 파생 이미지만
 * 로컬 캔버스 상태로 편집한다. 프로젝트 안에서 같은 에셋은 Image 한 장으로 dedup한다.
 */
export type AssetNodeData = {
  kind: 'asset'
  label: string
  assetKind: 'character' | 'world'
  /** asset-storage RegisteredCharacter/World.id (= DB character_id / location_id) */
  assetId: string
  /** Artist가 소유하는 원본. Director 편집으로 덮어쓰지 않는다. */
  sourceImageUrl: string | null
  /** 현재 카드가 출력하는 이미지. 초기값은 원본이며 생성 후 Director 파생본으로 바뀐다. */
  imageUrl: string | null
  prompt: string
  referenceImages: DirectorReferenceImage[]
  imageModel?: string
  generationStatus: DirectorVideoStatus
  generationError: string | null
  locked: false
  /** 어떤 shot도 참조하지 않는 미사용 에셋 (불러오기 토글로 좌상단에 표시) */
  unused?: boolean
  [key: string]: unknown
}

// ─── Shot 체인 파생 노드 (#previz-chain 2026-07-22) ──────────────────────────
//
// 체인: SCENE → SHOT(previz 3프레임 보드) → SHOT IMAGE(실사) → SHOT VIDEO.
// 2026-07-27: PREVIZ SHOT VIDEO 노드 제거 — previz 는 3프레임 순환 재생 전용이 되고
//   영상 생성 진입점은 SHOT VIDEO 하나로 통일(유저 부담 완화). 백엔드(previz_video 컬럼·
//   생성 API·webhook finalize)는 남아 있어 되살릴 때 UI 만 복구하면 된다.

/**
 * Shot 의 실사 스토리보드 이미지(shots.storyboard_image)를 표시하는 파생 노드.
 * 진실은 부모 Shot 노드 data.storyboardImage — 이 노드는 표시+생성 트리거만.
 */
export type ShotImageNodeData = {
  kind: 'shotImage'
  label: string
  parentShotNodeId: string
  [key: string]: unknown
}

/**
 * SHOT VIDEO 자리 표시 파생 노드 — 테이크가 0개인 체인 샷의 종점을 회색 카드로 보여줘
 * "여기서 영상이 나온다"는 연결성을 넌지시 안내한다(2026-07-22 피드백). 생성 버튼으로
 * 첫 테이크를 만들면 rebuild 가 실제 Video 노드로 대체(플레이스홀더 제거)한다.
 */
export type VideoPlaceholderNodeData = {
  kind: 'videoPlaceholder'
  label: string
  parentShotNodeId: string
  [key: string]: unknown
}

// ─── Prompt Node (Higgsfield식 분리 프롬프트) ────────────────────────────────

/**
 * 이미지 노드의 프롬프트를 캔버스에 별도 노드로 분리한 것 (Higgsfield "Prompt" 노드).
 * 우측 출력 핸들을 Shot 노드의 T 입력에 와이어링하면 wirePromptToShot이
 * 대상 Shot.promptOverride를 이 노드의 text로 동기화한다. DB 미영속(파생/보조 UI).
 */
export type PromptNodeData = {
  kind: 'prompt'
  /** 노드 라벨 (union 공통 속성) */
  label: string
  /** 프롬프트 텍스트 (Shot.promptOverride의 source) */
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
  | ShotImageNodeData
  | VideoPlaceholderNodeData

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
/** Shot 형제 간 세로 간격 — Video 테이크 2개(260 stacking + 카드 높이)가 다음 샷 행과 안 겹치는 높이.
 *  (#previz-chain 때 340→560. 2026-07-27 previz 영상 제거로 체인이 1행이 됐지만, 테이크 stacking이
 *   같은 높이를 요구하므로 값은 유지 — 근거만 바뀜) */
export const SHOT_OFFSET_Y = 560
/** Shot Image(실사) 노드 x — Shot 우측(#previz-chain. 2026-07-27: previz 영상 컬럼을 이어받아 같은 행) */
export const SHOT_IMAGE_OFFSET_X = 360
/** Video 노드 x (Shot 기준) — SHOT IMAGE 다음 컬럼 */
export const VIDEO_OFFSET_X = 720
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

export function isShotImageData(d: DirectorNodeData): d is ShotImageNodeData {
  return d.kind === 'shotImage'
}

export function isVideoPlaceholderData(
  d: DirectorNodeData,
): d is VideoPlaceholderNodeData {
  return d.kind === 'videoPlaceholder'
}

/** 재구성 때 제거하는 legacy 파생 노드 판별 — editable asset Image는 포함하지 않는다. */
export function isDerivedNodeData(d: DirectorNodeData): boolean {
  return d.kind === 'shotImage' || d.kind === 'videoPlaceholder'
}
