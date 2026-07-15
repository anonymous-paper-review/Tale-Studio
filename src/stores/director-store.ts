import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { toast } from 'sonner'
import type { XYPosition } from '@xyflow/react'
import {
  DEFAULT_CAMERA_PRESET,
  type CameraConfig,
  type CameraPreset,
  type LightingConfig,
} from '@/types/shot'
import {
  newDirectorId,
  SHOT_OFFSET_X,
  SHOT_OFFSET_Y,
  VIDEO_OFFSET_X,
  VIDEO_OFFSET_Y,
  ASSET_OFFSET_X,
  ASSET_OFFSET_Y,
  isShotData,
  isSceneData,
  isVideoData,
  isAssetData,
  isPromptData,
  type DirectorNode,
  type DirectorEdge,
  type DirectorNodeData,
  type DirectorNodeKind,
  type DirectorEdgeData,
  type DirectorEdgeCategory,
  type SceneNodeData,
  type ShotNodeData,
  type VideoNodeData,
  type PromptNodeData,
  type VideoOverride,
  type DirectorVideoStatus,
  type DirectorVideoProvider,
} from '@/types/director'
import {
  useAssetStorageStore,
  type RegisteredCharacter,
} from '@/stores/asset-storage-store'
import { createClient } from '@/lib/supabase/client'
import { isDemoSession } from '@/lib/demo/context'
import { pollGenerationJob } from '@/lib/generation-jobs-client'
import { notifyGenerationComplete } from '@/lib/generation-notify'
import { DEFAULT_VIDEO_MODEL, normalizeProvider } from '@/lib/video-models'

// ============================================================================
// Defaults
// ============================================================================

const DEFAULT_CAMERA: CameraConfig = {
  horizontal: 0,
  vertical: 0,
  pan: 0,
  tilt: 0,
  roll: 0,
  zoom: 0,
}

const DEFAULT_LIGHTING: LightingConfig = {
  position: 'front',
  brightness: 50,
  colorTemp: 5600,
}

const DEFAULT_PROVIDER: DirectorVideoProvider = DEFAULT_VIDEO_MODEL

function makeSceneData(label: string): SceneNodeData {
  return {
    kind: 'scene',
    label,
    writerSceneId: null,
    location: '',
    timeOfDay: '',
    mood: '',
    description: '',
  }
}

function makeShotData(label: string, parentSceneNodeId: string | null): ShotNodeData {
  return {
    kind: 'shot',
    label,
    writerShotId: null,
    parentSceneNodeId,
    prompt: '',
    referenceImages: [],
    storyboardImage: null,
    characterAssetIds: [],
    worldAssetIds: [],
    camera: { ...DEFAULT_CAMERA },
    lighting: { ...DEFAULT_LIGHTING },
    cameraPreset: { ...DEFAULT_CAMERA_PRESET },
    provider: DEFAULT_PROVIDER,
    durationSeconds: 5,
    generationMethod: 'T2V',
    stale: false,
  }
}

function makeVideoData(
  parentShotNodeId: string,
  takeIndex: number,
): VideoNodeData {
  return {
    kind: 'video',
    label: `take_v${takeIndex}`,
    parentShotNodeId,
    videoClipId: null,
    override: {},
    videoUrl: null,
    thumbnailUrl: null,
    status: 'pending',
    errorMessage: null,
    final: false,
    stale: false,
  }
}

// ============================================================================
// ST-2: Storyboard image (I2I) helpers
// ============================================================================

/** RegisteredCharacter/World에서 대표 이미지 URL 1장 선택 (referenceImages 우선, 없으면 single view) */
function pickAssetImageUrl(reg: RegisteredCharacter | undefined): string | null {
  if (!reg) return null
  if (reg.referenceImages[0]) return reg.referenceImages[0]
  return reg.views.single[0]?.url ?? null
}

/** Shot에 연결된 actor+world asset의 대표 이미지 URL을 모은다 (I2I 입력, 결정 #36) */
function resolveShotAssetImages(data: ShotNodeData): string[] {
  const store = useAssetStorageStore.getState()
  const urls: string[] = []
  for (const id of data.characterAssetIds) {
    const u = pickAssetImageUrl(store.getCharacter(id))
    if (u) urls.push(u)
  }
  for (const id of data.worldAssetIds) {
    const u = pickAssetImageUrl(store.getWorld(id))
    if (u) urls.push(u)
  }
  return urls
}

/** 생성된 이미지 blob을 Supabase Storage에 영속화 → publicUrl (실패 시 null) */
async function persistStoryboardImage(
  projectId: string,
  shotId: string,
  blobUrl: string,
): Promise<string | null> {
  try {
    const r = await fetch(blobUrl)
    const blob = await r.blob()
    const form = new FormData()
    form.append('projectId', projectId)
    form.append('type', 'shot')
    form.append('entityId', shotId)
    form.append('field', 'storyboard_image')
    form.append('file', blob, `${shotId}_storyboard.png`)
    const res = await fetch('/api/assets/upload-image', {
      method: 'POST',
      body: form,
    })
    if (!res.ok) return null
    const { publicUrl } = await res.json()
    return publicUrl ?? null
  } catch {
    return null
  }
}

// ============================================================================
// ST-4: Video generation (I2V/T2V) helpers
// ============================================================================

const VIDEO_POLL_INTERVAL_MS = 5_000
const VIDEO_POLL_TIMEOUT_MS = 300_000

/** 완료된 영상 URL을 Storage에 영속화 → 저장 URL (실패 시 원본 URL) */
async function persistDirectorVideo(
  projectId: string,
  shotId: string,
  videoUrl: string,
): Promise<string> {
  try {
    const res = await fetch('/api/assets/upload-video', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ videoUrl, projectId, shotId }),
    })
    if (!res.ok) return videoUrl
    const { url } = await res.json()
    return url ?? videoUrl
  } catch {
    return videoUrl
  }
}

/** director provider(kling/veo/local) → generate-video 라우트 provider(fal/local) 매핑 */
function toRouteProvider(p: DirectorVideoProvider): 'fal' | 'local' {
  return p === 'local' ? 'local' : 'fal'
}

// ============================================================================
// Thumbnail capture (Node 탭 영상 카드용)
// 서버 ffmpeg 불가(Vercel Hobby) → 클라이언트에서 <video>+<canvas>로 첫 프레임 캡처.
// CORS 차단 시 canvas 가 taint 되어 toBlob 이 throw → null 반환(graceful, 영상 재생엔 무영향).
// 영상 URL 은 우리 Storage(persistDirectorVideo)라 보통 same-CORS 라 캡처 가능.
// ============================================================================

/** 같은 노드 썸네일 중복 캡처 방지 (in-flight 가드). */
const thumbnailInFlight = new Set<string>()

/** 영상 URL 첫 프레임을 JPEG Blob 으로 캡처. 실패(CORS/네트워크/디코드/타임아웃) 시 null. */
async function captureVideoThumbnail(videoUrl: string): Promise<Blob | null> {
  if (typeof document === 'undefined') return null
  return new Promise<Blob | null>((resolve) => {
    const video = document.createElement('video')
    video.crossOrigin = 'anonymous'
    video.muted = true
    video.preload = 'metadata'
    video.playsInline = true

    let settled = false
    const finish = (blob: Blob | null) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      video.removeAttribute('src')
      try {
        video.load()
      } catch {
        /* noop */
      }
      resolve(blob)
    }
    const timer = setTimeout(() => finish(null), 15_000)

    const grab = () => {
      try {
        const w = video.videoWidth
        const h = video.videoHeight
        if (!w || !h) return finish(null)
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext('2d')
        if (!ctx) return finish(null)
        ctx.drawImage(video, 0, 0, w, h)
        canvas.toBlob((blob) => finish(blob), 'image/jpeg', 0.82)
      } catch {
        finish(null)
      }
    }

    video.onloadeddata = () => {
      // 일부 코덱은 currentTime=0 프레임이 비어있어 살짝 seek 후 캡처.
      try {
        video.currentTime = Math.min(0.1, (video.duration || 1) / 2)
      } catch {
        grab()
      }
    }
    video.onseeked = grab
    video.onerror = () => finish(null)
    video.src = videoUrl
  })
}

// ============================================================================
// Step 0 (unify-director-store-db): Shot 편집 → DB shots write-through
// 캐넌 일원화 — 캔버스 샷 편집을 DB로 debounce 저장(옛 director-store 패턴 이식).
// 키 = writerShotId(=shots.shot_id). 컬럼은 007로 이미 존재.
// ============================================================================

const pendingShotDbSaves = new Map<string, ReturnType<typeof setTimeout>>()

function debouncedShotSaveToDb(
  projectId: string,
  writerShotId: string,
  getData: () => ShotNodeData | undefined,
) {
  const existing = pendingShotDbSaves.get(writerShotId)
  if (existing) clearTimeout(existing)
  pendingShotDbSaves.set(
    writerShotId,
    setTimeout(async () => {
      pendingShotDbSaves.delete(writerShotId)
      const data = getData()
      if (!projectId || !data) return
      try {
        const supabase = createClient()
        await supabase
          .from('shots')
          .update({
            camera_config: data.camera,
            lighting_config: data.lighting,
            camera_brand: data.cameraPreset?.brand ?? null,
            focal_length: data.cameraPreset?.focalLength ?? null,
            aperture: data.cameraPreset?.aperture ?? null,
            white_balance: data.cameraPreset?.whiteBalance ?? null,
            prompt: data.prompt,
          })
          .eq('project_id', projectId)
          .eq('shot_id', writerShotId)
      } catch (err) {
        console.error('[director-store] shot DB save failed:', err)
      }
    }, 500),
  )
}

// ============================================================================
// Step 2 (unify-director-store-db): 캔버스 그래프 구조를 DB로 일원화.
// canvas_position / video_clips 행을 DB에 write-through + 진입 시 hydrate.
// localStorage persist는 이제 오프라인 캐시 — 진입 시 hydrateFromDb가 DB 진실로 덮어쓴다.
// 모든 DB write는 fire-and-forget + try/catch + console.error (UI로 throw 금지).
// ============================================================================

const pendingPositionSaves = new Map<string, ReturnType<typeof setTimeout>>()

/** 노드 종류별로 canvas_position을 올바른 테이블에 debounce write. key id null이면 skip. */
function debouncedPositionSaveToDb(
  nodeId: string,
  getState: () => DirectorCanvasState,
) {
  const existing = pendingPositionSaves.get(nodeId)
  if (existing) clearTimeout(existing)
  pendingPositionSaves.set(
    nodeId,
    setTimeout(async () => {
      pendingPositionSaves.delete(nodeId)
      const state = getState()
      const projectId = state.projectId
      const node = state.nodes.find((n) => n.id === nodeId)
      if (!projectId || !node) return
      const pos = { x: node.position.x, y: node.position.y }
      try {
        const supabase = createClient()
        if (isSceneData(node.data)) {
          if (!node.data.writerSceneId) return
          await supabase
            .from('scenes')
            .update({ canvas_position: pos })
            .eq('project_id', projectId)
            .eq('scene_id', node.data.writerSceneId)
        } else if (isShotData(node.data)) {
          if (!node.data.writerShotId) return
          await supabase
            .from('shots')
            .update({ canvas_position: pos })
            .eq('project_id', projectId)
            .eq('shot_id', node.data.writerShotId)
        } else if (isVideoData(node.data)) {
          if (!node.data.videoClipId) return
          await supabase
            .from('video_clips')
            .update({ canvas_position: pos })
            .eq('id', node.data.videoClipId)
        }
      } catch (err) {
        console.error('[director-store] position DB save failed:', err)
      }
    }, 500),
  )
}

const pendingVideoClipSaves = new Map<string, ReturnType<typeof setTimeout>>()

/** video_clips 행 1개를 debounce update (override 등). videoClipId 기준. */
function debouncedVideoClipSaveToDb(
  videoClipId: string,
  getPatch: () => Record<string, unknown> | undefined,
) {
  const existing = pendingVideoClipSaves.get(videoClipId)
  if (existing) clearTimeout(existing)
  pendingVideoClipSaves.set(
    videoClipId,
    setTimeout(async () => {
      pendingVideoClipSaves.delete(videoClipId)
      const patch = getPatch()
      if (!patch) return
      try {
        const supabase = createClient()
        await supabase.from('video_clips').update(patch).eq('id', videoClipId)
      } catch (err) {
        console.error('[director-store] video_clip DB save failed:', err)
      }
    }, 500),
  )
}

// ============================================================================
// Store types
// ============================================================================

type RelationModalState = {
  source: string
  target: string
  sourceHandle?: string | null
  targetHandle?: string | null
} | null

type DeleteCascadeInfo = {
  nodeId: string
  shotCount: number // for Scene
  videoCount: number // for Shot
  finalAffected: boolean
} | null

interface DirectorCanvasState {
  // graph
  nodes: DirectorNode[]
  edges: DirectorEdge[]

  // UI
  selectedNodeId: string | null
  selectedEdgeId: string | null
  viewport: { x: number; y: number; zoom: number }
  // 뷰포트 최초 초기화 여부 (ephemeral, persist 제외). false → Node 뷰 최초 진입에서 fitView,
  //   true → 마지막 뷰포트 복원. 탭 전환·스테이지 이동에 CanvasInner가 remount돼도 store(싱글턴)에
  //   살아있어, 재진입 시 fitView로 위치가 초기화되던 문제를 막는다.
  viewportInitialized: boolean
  viewMode: 'node' | 'storyboard'

  // popup/modal
  popupNodeId: string | null
  deleteConfirmInfo: DeleteCascadeInfo
  relationModal: RelationModalState

  // generation state
  generatingNodeIds: Record<string, boolean>
  generationErrors: Record<string, string>

  // playback — 한 번에 1개 Video 노드만 재생 (single-play). 비영속(UI ephemeral).
  playingNodeId: string | null

  // 미사용 에셋(어떤 shot도 참조 안 함) 좌상단 표시 토글. 비영속(UI ephemeral).
  showUnusedAssets: boolean

  // undo/redo 히스토리 (런타임, 비영속). asset/references 파생은 스냅샷에서 제외 —
  // 복원 후 rebuildAssetNodes가 재생성. sync 셋업 중에는 _historySuppressed로 기록 차단.
  historyPast: { nodes: DirectorNode[]; edges: DirectorEdge[] }[]
  historyFuture: { nodes: DirectorNode[]; edges: DirectorEdge[] }[]
  _historySuppressed: boolean

  // persistence meta
  projectId: string
  lastSavedAt: number

  // ─── actions ─────────────────────────────────────────────────────────────

  setProjectId: (projectId: string) => void
  setViewport: (vp: { x: number; y: number; zoom: number }) => void
  setViewMode: (m: 'node' | 'storyboard') => void

  // Step 2 (unify-director-store-db): DB 일원화
  /** 노드 이동 후 canvas_position을 해당 테이블에 debounce write (drag end에서 호출) */
  persistNodePosition: (nodeId: string) => void
  /** [디버그] 전체 노드를 scene 가로 / shot 세로 / video 우측 그리드로 재배치 (+ DB 영속) */
  relayoutCanvas: () => void
  /** 진입 시 DB → 캔버스 hydrate. canvas_position 적용 + 누락 Video 노드 생성 (DB가 진실) */
  hydrateFromDb: (projectId: string) => Promise<void>

  // node lifecycle
  addSceneNode: (position: XYPosition, label?: string) => string
  addShotNode: (
    parentSceneNodeId: string | null,
    position: XYPosition,
    label?: string,
  ) => string
  /** Shot → Video Branch. 마더 설정 상속, override 빈 객체로 시작 (결정 #13) */
  addVideoTake: (parentShotNodeId: string, position?: XYPosition) => string | null

  updateNodeData: <K extends DirectorNodeKind>(
    id: string,
    patch: Partial<Extract<DirectorNodeData, { kind: K }>>,
  ) => void
  deleteNode: (id: string) => void

  // edge lifecycle
  addEdge: (
    source: string,
    target: string,
    data: DirectorEdgeData,
    sourceHandle?: string | null,
    targetHandle?: string | null,
  ) => string | null
  updateEdge: (id: string, patch: Partial<DirectorEdgeData>) => void
  deleteEdge: (id: string) => void
  /**
   * Artist 에셋(asset-storage) → 씬별 asset 노드 + shot 참조 엣지를 재생성한다 (멱등, 파생).
   * 각 Scene 우측에 character(위)→world(아래) 세로 컬럼을 만들고, 그 에셋을 참조하는
   * shot에 references 엣지를 잇는다. asset과 겹치는 shot은 우측으로 밀어 정렬.
   */
  rebuildAssetNodes: () => void
  /** 미사용 에셋 표시 토글 — 켜면 좌상단에 참조되지 않은 character/world 노드를 추가 */
  toggleUnusedAssets: () => void
  /** 현재 노드/엣지 스냅샷을 히스토리에 기록 (변경 직전 호출, suppress 중엔 무시) */
  commitHistory: () => void
  undo: () => void
  redo: () => void

  // video specific
  /** Shot당 1개 강제 enforce (결정 #11) */
  setVideoFinal: (videoNodeId: string, final: boolean) => void
  setVideoStatus: (
    videoNodeId: string,
    status: DirectorVideoStatus,
    payload?: { url?: string; thumbnailUrl?: string; error?: string },
  ) => void
  applyVideoOverride: (videoNodeId: string, override: VideoOverride) => void

  // storyboard image (ST-2, I2I)
  /** 단일 Shot의 storyboardImage를 I2I로 생성 (asset 자동 결합 + prompt) */
  generateStoryboardImage: (shotNodeId: string) => Promise<void>
  /** 모든 Shot의 storyboardImage 일괄 생성 (씬 순서대로). 영상 생성은 포함 안 함 (결정 #40) */
  generateAllStoryboardImages: () => Promise<void>

  // video generation (ST-4, I2V/T2V) — 항상 사용자 클릭으로만 (결정 #40)
  /** Shot에 새 Video take 생성 + 영상 생성 API 호출(+폴링). storyboardImage 있으면 I2V. 생성된 Video 노드 id 반환 */
  generateVideoForShot: (shotNodeId: string) => Promise<string | null>
  /** 기존 Video 노드 1개를 effective 설정으로 (재)생성 (D-5). 마더 Shot storyboardImage 있으면 I2V.
   *  반환 false = 생성 대기열(쿼터) 초과로 시작하지 못함(#e5) — 노드는 pending으로 되돌려짐. */
  regenerateVideo: (videoNodeId: string) => Promise<boolean>

  // stage progression (Higgsfield 진행 버튼)
  /** 진행 버튼: 현 단계 기준 다음 산출물 생성 — rough→generateStoryboardImage(in-place 실사), live/video→generateVideoForShot(별도 Video 노드) */
  advanceShot: (shotNodeId: string) => Promise<void>

  // prompt node (Higgsfield식 분리 프롬프트)
  /** Prompt 노드 추가 (캔버스 보조 노드). 생성된 노드 id 반환 */
  addPromptNode: (position?: XYPosition, text?: string) => string
  /** Prompt 노드를 Shot T 입력에 와이어링 — prompt 엣지 추가 + 대상 Shot.prompt 동기 */
  wirePromptToShot: (promptNodeId: string, shotNodeId: string) => void

  // playback + thumbnail (ST-4 후속 — Node 탭 영상 재생)
  /** single-play 토글 — 이 노드만 재생, 나머지 Video 는 자동 정지. id=null 이면 전부 정지 */
  setPlayingNode: (id: string | null) => void
  /** Video 노드에 썸네일이 없으면 영상 첫 프레임을 캡처 → Storage 업로드 → thumbnail_url 영속 */
  ensureVideoThumbnail: (videoNodeId: string) => Promise<void>

  // propagation (Shot 설정 변경 → 자식 Video stale)
  propagateStaleFromShot: (shotNodeId: string) => void
  clearStale: (id: string) => void

  // selection
  selectNode: (id: string | null) => void
  selectEdge: (id: string | null) => void

  // popups / modals
  openPopup: (id: string) => void
  closePopup: () => void
  openDeleteConfirm: (id: string) => void
  closeDeleteConfirm: () => void
  confirmDelete: () => void
  openRelationModal: (
    source: string,
    target: string,
    sourceHandle?: string | null,
    targetHandle?: string | null,
  ) => void
  closeRelationModal: () => void

  // agentic — D-7 Meeting Room tool-use
  applyUpdates: (updates: DirectorCanvasUpdate[]) => DirectorCanvasUpdateResult

  reset: () => void
}

// ============================================================================
// Agent Actions — specs/layers/director.md §12.2 (DirectorCanvasUpdate)
// ============================================================================

export type DirectorCanvasUpdate =
  // 비파괴 — agent 직접 실행
  | {
      type: 'addScene'
      label?: string
      location?: string
      timeOfDay?: string
      mood?: string
      description?: string
      tempId?: string
    }
  | {
      type: 'addShot'
      sceneId: string
      label?: string
      prompt?: string
      tempId?: string
    }
  | {
      type: 'updateScene'
      id: string
      patch: Partial<
        Pick<
          SceneNodeData,
          'label' | 'location' | 'timeOfDay' | 'mood' | 'description'
        >
      >
    }
  | {
      type: 'updateShot'
      id: string
      patch: Partial<Pick<ShotNodeData, 'label' | 'prompt' | 'provider'>>
    }
  | {
      type: 'addVideoTake'
      shotId: string
      override?: VideoOverride
      tempId?: string
    }
  | { type: 'setCamera'; id: string; camera: Partial<CameraConfig> }
  | { type: 'setLighting'; id: string; lighting: Partial<LightingConfig> }
  | {
      type: 'setCameraPreset'
      id: string
      preset: Partial<CameraPreset>
    }
  | { type: 'generateVideo'; id: string }
  | {
      type: 'connect'
      sourceId: string
      targetId: string
      category: 'relates-to'
      relationText?: string
    }
  // 파괴/등록 — request만, 사용자 확인 모달 경유
  | { type: 'requestDelete'; id: string; reason?: string }
  | { type: 'selectNode'; id: string }

export type DirectorCanvasUpdateResult = {
  applied: number
  skipped: { update: DirectorCanvasUpdate; reason: string }[]
}

// ============================================================================
// Selectors (pure)
// ============================================================================

export function getDirectorNode(
  state: Pick<DirectorCanvasState, 'nodes'>,
  id: string,
): DirectorNode | undefined {
  return state.nodes.find((n) => n.id === id)
}

export function getChildShots(
  state: Pick<DirectorCanvasState, 'nodes'>,
  sceneNodeId: string,
): DirectorNode[] {
  return state.nodes.filter(
    (n) => isShotData(n.data) && n.data.parentSceneNodeId === sceneNodeId,
  )
}

export function getChildVideos(
  state: Pick<DirectorCanvasState, 'nodes'>,
  shotNodeId: string,
): DirectorNode[] {
  return state.nodes.filter(
    (n) => isVideoData(n.data) && n.data.parentShotNodeId === shotNodeId,
  )
}

export function getFinalVideo(
  state: Pick<DirectorCanvasState, 'nodes'>,
  shotNodeId: string,
): DirectorNode | undefined {
  const children = getChildVideos(state, shotNodeId)
  return children.find((n) => isVideoData(n.data) && n.data.final)
}

/** Video 노드의 effective 설정 (마더 Shot 상속 + override) */
export function getEffectiveShotConfig(
  state: Pick<DirectorCanvasState, 'nodes'>,
  videoNodeId: string,
): {
  prompt: string
  camera: CameraConfig
  lighting: LightingConfig
  cameraPreset: CameraPreset
  provider: DirectorVideoProvider
} | null {
  const video = state.nodes.find((n) => n.id === videoNodeId)
  if (!video || !isVideoData(video.data)) return null
  const mother = state.nodes.find((n) => n.id === video.data.parentShotNodeId)
  if (!mother || !isShotData(mother.data)) return null
  const m = mother.data
  const o = video.data.override
  return {
    prompt: o.prompt ?? m.prompt,
    camera: o.camera ?? m.camera,
    lighting: o.lighting ?? m.lighting,
    cameraPreset: o.cameraPreset ?? m.cameraPreset,
    provider: o.provider ?? m.provider,
  }
}

/**
 * 샷 노드의 파이프라인 단계 파생 (우선순위 고정: video > live > rough).
 * - 자식 Video 노드 존재 → 'video'
 * - storyboardImage 완료 → 'live' (실사)
 * - 그 외 → 'rough' (목각, roughStoryboard 표시 단계)
 * rough/live/video는 director-store 상태만으로 판정 — writer-store를 끌어들이지 않는다.
 */
export type ShotStage = 'rough' | 'live' | 'video'

export function getShotStage(
  state: Pick<DirectorCanvasState, 'nodes'>,
  shotNodeId: string,
): ShotStage {
  const shot = state.nodes.find((n) => n.id === shotNodeId)
  if (!shot || !isShotData(shot.data)) return 'rough'
  if (getChildVideos(state, shotNodeId).length > 0) return 'video'
  if (shot.data.storyboardImage?.status === 'completed') return 'live'
  return 'rough'
}

const SHOT_STAGE_LABEL: Record<ShotStage, string> = {
  rough: '실사화',
  live: '영상 생성',
  video: '새 영상 테이크',
}

/** 진행 버튼 라벨 = 현 단계에서 누르면 일어나는 '다음' 행동 */
export function shotStageLabel(stage: ShotStage): string {
  return SHOT_STAGE_LABEL[stage]
}

/** 다음 take_vN 번호 계산 (Shot 자식 중 최대 + 1) */
function nextTakeIndex(
  state: Pick<DirectorCanvasState, 'nodes'>,
  shotNodeId: string,
): number {
  const children = getChildVideos(state, shotNodeId)
  const max = children
    .map((n) => {
      const m = n.data.label.match(/take_v(\d+)/)
      return m ? parseInt(m[1]!, 10) : 0
    })
    .reduce((a, b) => Math.max(a, b), 0)
  return max + 1
}

// ============================================================================
// Cascade helper
// ============================================================================

function collectCascadeIds(
  nodes: DirectorNode[],
  rootId: string,
): Set<string> {
  // Scene → 자식 Shot 모두 → 각 Shot의 자식 Video 모두
  // Shot → 자식 Video 모두
  // Video → 자기 자신만
  const result = new Set<string>([rootId])
  const root = nodes.find((n) => n.id === rootId)
  if (!root) return result

  if (root.data.kind === 'scene') {
    nodes.forEach((n) => {
      if (isShotData(n.data) && n.data.parentSceneNodeId === rootId) {
        result.add(n.id)
        nodes.forEach((v) => {
          if (isVideoData(v.data) && v.data.parentShotNodeId === n.id) {
            result.add(v.id)
          }
        })
      }
    })
  } else if (root.data.kind === 'shot') {
    nodes.forEach((v) => {
      if (isVideoData(v.data) && v.data.parentShotNodeId === rootId) {
        result.add(v.id)
      }
    })
  }
  return result
}

// ============================================================================
// Store
// ============================================================================

const initialNodes: DirectorNode[] = []
const initialEdges: DirectorEdge[] = []

export const useDirectorCanvasStore = create<DirectorCanvasState>()(
  persist(
    (set, get) => ({
      nodes: initialNodes,
      edges: initialEdges,
      selectedNodeId: null,
      selectedEdgeId: null,
      viewport: { x: 0, y: 0, zoom: 1 },
      viewportInitialized: false,
      viewMode: 'node',
      popupNodeId: null,
      deleteConfirmInfo: null,
      relationModal: null,
      generatingNodeIds: {},
      generationErrors: {},
      playingNodeId: null,
      showUnusedAssets: false,
      historyPast: [],
      historyFuture: [],
      _historySuppressed: false,
      projectId: 'default',
      lastSavedAt: Date.now(),

      setProjectId: (projectId) => {
        // 프로젝트 격리: projectId가 바뀌면 이전 프로젝트의 노드/엣지 캐시를 비운다.
        // persist 키가 고정(tale-director-v1-default)이라 프로젝트 전환 시
        // localStorage 잔존 노드가 새 프로젝트로 새지 않도록 in-memory를 리셋하고,
        // 변경된 빈 상태가 곧바로 persist에 덮어써지게 한다.
        if (get().projectId !== projectId) {
          set({
            projectId,
            nodes: initialNodes,
            edges: initialEdges,
            selectedNodeId: null,
            selectedEdgeId: null,
            viewportInitialized: false,
            popupNodeId: null,
            deleteConfirmInfo: null,
            relationModal: null,
            generatingNodeIds: {},
            generationErrors: {},
            playingNodeId: null,
            showUnusedAssets: false,
            historyPast: [],
            historyFuture: [],
            lastSavedAt: Date.now(),
          })
        } else {
          set({ projectId })
        }
      },
      setViewport: (vp) => set({ viewport: vp }),
      setViewMode: (m) => set({ viewMode: m }),

      // ─── Step 2: DB 일원화 (position write-back + hydrate) ──────────────

      persistNodePosition: (nodeId) => {
        debouncedPositionSaveToDb(nodeId, get)
      },

      // 자동 정렬 — 겹친 노드를 다이어그램 레이아웃으로 재배치.
      //   [Asset 컬럼(좌)] - Scene - Shot 세로 - Video 세로, 각 scene 그룹은 좌우로 분리.
      //   그룹 폭에 asset 컬럼(좌)·video(우) 공간을 포함해 asset이 옆 그룹과 안 겹치게 한다.
      //   in-memory 즉시 적용 + nodeId별 persist로 DB(canvas_position) 반영(재진입 유지).
      //   asset 노드는 scene 좌측 파생이므로 재배치 후 rebuildAssetNodes로 갱신.
      relayoutCanvas: () => {
        get().commitHistory()
        // 그룹 폭 = asset 컬럼(좌) + scene→shot + shot→video + video 노드/여백
        const GROUP_WIDTH = ASSET_OFFSET_X + SHOT_OFFSET_X + VIDEO_OFFSET_X + 400
        const state = get()
        const scenes = state.nodes
          .filter((n) => isSceneData(n.data))
          .sort((a, b) => a.position.y - b.position.y || a.position.x - b.position.x)
        const posById = new Map<string, XYPosition>()
        scenes.forEach((scene, i) => {
          // 첫 그룹부터 asset 컬럼 공간을 확보(scene을 asset 폭만큼 우측에서 시작)
          const sx = 80 + ASSET_OFFSET_X + i * GROUP_WIDTH
          const sy = 80
          posById.set(scene.id, { x: sx, y: sy })
          getChildShots(state, scene.id)
            .sort((a, b) => a.position.y - b.position.y)
            .forEach((shot, j) => {
              const shx = sx + SHOT_OFFSET_X
              const shy = sy + j * SHOT_OFFSET_Y
              posById.set(shot.id, { x: shx, y: shy })
              getChildVideos(state, shot.id)
                .sort((a, b) => a.position.y - b.position.y)
                .forEach((vid, k) => {
                  posById.set(vid.id, {
                    x: shx + VIDEO_OFFSET_X,
                    y: shy + k * VIDEO_OFFSET_Y,
                  })
                })
            })
        })
        set((s) => ({
          nodes: s.nodes.map((n) => {
            const p = posById.get(n.id)
            return p ? { ...n, position: p } : n
          }),
          lastSavedAt: Date.now(),
        }))
        for (const id of posById.keys()) get().persistNodePosition(id)
        // asset 컬럼을 새 scene 위치 기준으로 재배치
        get().rebuildAssetNodes()
      },

      hydrateFromDb: async (projectId) => {
        if (!projectId) return
        try {
          const supabase = createClient()
          const [scenesRes, shotsRes, clipsRes] = await Promise.all([
            supabase
              .from('scenes')
              .select('scene_id, canvas_position')
              .eq('project_id', projectId),
            supabase
              .from('shots')
              .select('shot_id, canvas_position, storyboard_image')
              .eq('project_id', projectId),
            supabase.from('video_clips').select('*').eq('project_id', projectId),
          ])
          if (scenesRes.error) throw scenesRes.error
          if (shotsRes.error) throw shotsRes.error
          if (clipsRes.error) throw clipsRes.error

          const scenePosBySceneId = new Map<string, { x: number; y: number }>()
          for (const r of scenesRes.data ?? []) {
            const p = r.canvas_position as { x: number; y: number } | null
            if (p && r.scene_id) scenePosBySceneId.set(r.scene_id, p)
          }
          const shotPosByShotId = new Map<string, { x: number; y: number }>()
          for (const r of shotsRes.data ?? []) {
            const p = r.canvas_position as { x: number; y: number } | null
            if (p && r.shot_id) shotPosByShotId.set(r.shot_id, p)
          }
          // #3: DB(shots.storyboard_image)가 진실 — 재진입 시 stale(실패/구버전) 상태를 DB로 덮어쓴다.
          const storyboardByShotId = new Map<string, ShotNodeData['storyboardImage']>()
          for (const r of shotsRes.data ?? []) {
            const sb = r.storyboard_image as ShotNodeData['storyboardImage'] | null
            if (sb && r.shot_id) storyboardByShotId.set(r.shot_id, sb)
          }

          // 1) 기존 Scene/Shot 노드에 canvas_position 덮어쓰기 (DB 우선)
          set((s) => ({
            nodes: s.nodes.map((n) => {
              if (isSceneData(n.data) && n.data.writerSceneId) {
                const p = scenePosBySceneId.get(n.data.writerSceneId)
                if (p) return { ...n, position: { x: p.x, y: p.y } }
              } else if (isShotData(n.data) && n.data.writerShotId) {
                const p = shotPosByShotId.get(n.data.writerShotId)
                const sb = storyboardByShotId.get(n.data.writerShotId)
                if (p || sb) {
                  return {
                    ...n,
                    position: p ? { x: p.x, y: p.y } : n.position,
                    data: sb ? { ...n.data, storyboardImage: sb } : n.data,
                  }
                }
              }
              return n
            }),
            lastSavedAt: Date.now(),
          }))

          // 2) video_clips 행 → 누락 Video 노드 생성 (parent Shot은 1)에서 위치 확정됨)
          for (const row of clipsRes.data ?? []) {
            const clipId = row.id as string
            if (!clipId) continue
            const state = get()
            // 이미 이 videoClipId를 가진 노드가 있으면 skip
            const exists = state.nodes.some(
              (n) => isVideoData(n.data) && n.data.videoClipId === clipId,
            )
            if (exists) continue
            // 부모 Shot 노드 매칭 (shot_id == writerShotId)
            const parentShot = state.nodes.find(
              (n) => isShotData(n.data) && n.data.writerShotId === row.shot_id,
            )
            if (!parentShot) continue // 부모 없으면 생성 안 함

            const takeIndex = nextTakeIndex(state, parentShot.id)
            const dbPos = row.canvas_position as { x: number; y: number } | null
            const position: XYPosition = dbPos
              ? { x: dbPos.x, y: dbPos.y }
              : nextVideoPosition(state, parentShot.id)

            const id = newDirectorId('dn')
            const data = makeVideoData(parentShot.id, takeIndex)
            data.videoClipId = clipId
            data.label = (row.take_label as string) ?? data.label
            data.override = (row.override as VideoOverride) ?? {}
            data.final = (row.is_final as boolean) ?? false
            data.videoUrl = (row.url as string) ?? null
            data.thumbnailUrl = (row.thumbnail_url as string) ?? null
            data.status = ((row.status as DirectorVideoStatus) ??
              'pending') as DirectorVideoStatus
            const videoNode: DirectorNode = {
              id,
              type: 'video',
              position,
              data,
            }
            const parentEdge: DirectorEdge = {
              id: newDirectorId('de'),
              source: parentShot.id,
              target: id,
              sourceHandle: 'right',
              targetHandle: 'left',
              type: 'parent',
              data: { category: 'parent', relationText: '' },
            }
            set((s) => ({
              nodes: [...s.nodes, videoNode],
              edges: [...s.edges, parentEdge],
              lastSavedAt: Date.now(),
            }))
          }
        } catch (err) {
          console.error('[director-store] hydrateFromDb failed:', err)
        }
      },

      // ─── node lifecycle ────────────────────────────────────────────────

      addSceneNode: (position, label) => {
        if (isDemoSession()) return ''
        get().commitHistory()
        const id = newDirectorId('dn')
        const node: DirectorNode = {
          id,
          type: 'scene',
          position,
          data: makeSceneData(label ?? 'New Scene'),
        }
        set((s) => ({ nodes: [...s.nodes, node], lastSavedAt: Date.now() }))
        return id
      },

      addShotNode: (parentSceneNodeId, position, label) => {
        if (isDemoSession()) return ''
        get().commitHistory()
        const id = newDirectorId('dn')
        const node: DirectorNode = {
          id,
          type: 'shot',
          position,
          data: makeShotData(label ?? 'New Shot', parentSceneNodeId),
        }
        const updates: { nodes: DirectorNode[]; edges?: DirectorEdge[]; lastSavedAt: number } = {
          nodes: [...get().nodes, node],
          lastSavedAt: Date.now(),
        }
        // Scene → Shot parent edge 자동
        if (parentSceneNodeId) {
          const parentEdge: DirectorEdge = {
            id: newDirectorId('de'),
            source: parentSceneNodeId,
            target: id,
            sourceHandle: 'right',
            targetHandle: 'left',
            type: 'parent',
            data: { category: 'parent', relationText: '' },
          }
          updates.edges = [...get().edges, parentEdge]
        }
        set(updates)
        return id
      },

      addVideoTake: (parentShotNodeId, position) => {
        if (isDemoSession()) return null
        const state = get()
        const mother = state.nodes.find((n) => n.id === parentShotNodeId)
        if (!mother || !isShotData(mother.data)) return null
        get().commitHistory()

        const takeIndex = nextTakeIndex(state, parentShotNodeId)
        const defaultPos: XYPosition =
          position ?? nextVideoPosition(state, parentShotNodeId)
        const id = newDirectorId('dn')
        const videoData = makeVideoData(parentShotNodeId, takeIndex)
        const videoNode: DirectorNode = {
          id,
          type: 'video',
          position: defaultPos,
          data: videoData,
        }
        const parentEdge: DirectorEdge = {
          id: newDirectorId('de'),
          source: parentShotNodeId,
          target: id,
          sourceHandle: 'right',
          targetHandle: 'left',
          type: 'parent',
          data: { category: 'parent', relationText: '' },
        }
        set((s) => ({
          nodes: [...s.nodes, videoNode],
          edges: [...s.edges, parentEdge],
          lastSavedAt: Date.now(),
        }))

        // Step 2: video_clips 행 INSERT (fire-and-forget). 마더 Shot에 writerShotId
        // 있을 때만 — 수동 노드(shots 행 없음)는 local-only로 두고 videoClipId=null 유지.
        const parentWriterShotId = isShotData(mother.data)
          ? mother.data.writerShotId
          : null
        const projectId = state.projectId
        if (parentWriterShotId && projectId) {
          void (async () => {
            try {
              const supabase = createClient()
              const { data: inserted, error } = await supabase
                .from('video_clips')
                .insert({
                  project_id: projectId,
                  shot_id: parentWriterShotId,
                  take_label: videoData.label,
                  is_final: false,
                  canvas_position: { x: defaultPos.x, y: defaultPos.y },
                  status: 'pending',
                })
                .select('id')
                .single()
              if (error) throw error
              const clipId = inserted?.id as string | undefined
              if (clipId) {
                get().updateNodeData<'video'>(id, { videoClipId: clipId })
              }
            } catch (err) {
              console.error(
                '[director-store] video_clip INSERT failed:',
                err,
              )
            }
          })()
        }
        return id
      },

      // ─── stage progression (진행 버튼) ──────────────────────────────────
      advanceShot: async (shotNodeId) => {
        if (isDemoSession()) return
        const api = get()
        const node = api.nodes.find((n) => n.id === shotNodeId)
        if (!node || !isShotData(node.data)) return
        const stage = getShotStage(api, shotNodeId)
        if (stage === 'rough') {
          // 목각 → 실사: 같은 Shot 노드에서 storyboardImage 생성 (in-place)
          await api.generateStoryboardImage(shotNodeId)
        } else {
          // 실사/영상 → 영상: 기존 수명주기 유지 (별도 Video 노드 생성, 결정 #40)
          await api.generateVideoForShot(shotNodeId)
        }
      },

      // ─── prompt node (Higgsfield식 분리 프롬프트) ───────────────────────
      addPromptNode: (position, text) => {
        if (isDemoSession()) return ''
        get().commitHistory()
        const id = newDirectorId('dn')
        const data: PromptNodeData = {
          kind: 'prompt',
          label: 'Prompt',
          text: text ?? '',
          targetShotNodeId: null,
        }
        const node: DirectorNode = {
          id,
          type: 'prompt',
          position: position ?? { x: 80, y: 80 },
          data,
        }
        set((s) => ({ nodes: [...s.nodes, node], lastSavedAt: Date.now() }))
        return id
      },

      wirePromptToShot: (promptNodeId, shotNodeId) => {
        if (isDemoSession()) return
        const api = get()
        const promptNode = api.nodes.find((n) => n.id === promptNodeId)
        const shotNode = api.nodes.find((n) => n.id === shotNodeId)
        if (!promptNode || !isPromptData(promptNode.data)) return
        if (!shotNode || !isShotData(shotNode.data)) return
        const text = promptNode.data.text
        // prompt 엣지 추가 (출력 'right' → Shot T 입력 'prompt'). 중복이면 addEdge가 무시.
        api.addEdge(
          promptNodeId,
          shotNodeId,
          { category: 'prompt', relationText: '' },
          'right',
          'prompt',
        )
        // Prompt 노드의 target 기록
        set((s) => ({
          nodes: s.nodes.map((n) =>
            n.id === promptNodeId && isPromptData(n.data)
              ? ({ ...n, data: { ...n.data, targetShotNodeId: shotNodeId } } as DirectorNode)
              : n,
          ),
        }))
        // 대상 Shot.prompt 동기 (updateNodeData 경로 → undo 제외)
        api.updateNodeData<'shot'>(shotNodeId, { prompt: text })
      },

      updateNodeData: (id, patch) => {
        if (isDemoSession()) return
        const prev = get().nodes.find((n) => n.id === id)
        if (!prev) return
        // 노드 데이터 수정은 undo 대상에서 제외 — generateStoryboardImage 등 생성 결과도
        // 이 경로로 들어와 history를 오염시키기 때문. undo는 드래그/추가/삭제/연결/정렬만.

        // Shot 설정 변경 시 prompt/camera/lighting/cameraPreset/provider 변경이면 자식 Video stale
        const shotConfigKeys: (keyof ShotNodeData)[] = [
          'prompt',
          'camera',
          'lighting',
          'cameraPreset',
          'provider',
          'generationMethod',
          'referenceImages',
          'characterAssetIds',
          'worldAssetIds',
        ]
        // 주: storyboardImage는 제외 — 생성 status 전이(generating/failed)마다 stale 전파되는
        // 것을 피하기 위함. "새 storyboardImage → 자식 Video stale"은 ST-4에서 명시 처리.
        const isShotConfigChange =
          isShotData(prev.data) &&
          shotConfigKeys.some((k) => k in patch)

        set((s) => ({
          nodes: s.nodes.map((n) =>
            n.id === id
              ? ({
                  ...n,
                  data: { ...n.data, ...patch } as DirectorNodeData,
                } as DirectorNode)
              : n,
          ),
          lastSavedAt: Date.now(),
        }))

        if (isShotConfigChange) {
          get().propagateStaleFromShot(id)
        }

        // Step 0 (unify-director-store-db): camera/lighting/cameraPreset/prompt 변경을
        // DB shots로 write-through (캐넌 일원화). writerShotId 있는 노드만 — 수동생성 노드는 Step 2까지 skip.
        const dbCols: (keyof ShotNodeData)[] = [
          'camera',
          'lighting',
          'cameraPreset',
          'prompt',
        ]
        if (isShotData(prev.data) && dbCols.some((k) => k in patch)) {
          const node = get().nodes.find((n) => n.id === id)
          if (node && isShotData(node.data) && node.data.writerShotId) {
            const writerShotId = node.data.writerShotId
            debouncedShotSaveToDb(get().projectId, writerShotId, () => {
              const n = get().nodes.find((x) => x.id === id)
              return n && isShotData(n.data) ? n.data : undefined
            })
          }
        }
      },

      deleteNode: (id) => {
        if (isDemoSession()) return
        get().commitHistory()
        const ids = collectCascadeIds(get().nodes, id)

        // Step 2: cascade에 포함된 Video 노드의 videoClipId를 제거 전에 수집 → DB DELETE
        const clipIdsToDelete: string[] = []
        for (const n of get().nodes) {
          if (
            ids.has(n.id) &&
            isVideoData(n.data) &&
            n.data.videoClipId
          ) {
            clipIdsToDelete.push(n.data.videoClipId)
          }
        }

        set((s) => ({
          nodes: s.nodes.filter((n) => !ids.has(n.id)),
          edges: s.edges.filter(
            (e) => !ids.has(e.source) && !ids.has(e.target),
          ),
          selectedNodeId:
            s.selectedNodeId && ids.has(s.selectedNodeId)
              ? null
              : s.selectedNodeId,
          lastSavedAt: Date.now(),
        }))

        // Step 2: video_clips 행 DELETE (fire-and-forget)
        if (clipIdsToDelete.length > 0) {
          void (async () => {
            try {
              const supabase = createClient()
              await supabase
                .from('video_clips')
                .delete()
                .in('id', clipIdsToDelete)
            } catch (err) {
              console.error(
                '[director-store] video_clip DELETE failed:',
                err,
              )
            }
          })()
        }
      },

      // ─── edge lifecycle ────────────────────────────────────────────────

      addEdge: (source, target, data, sourceHandle, targetHandle) => {
        if (isDemoSession()) return null
        if (source === target) return null
        get().commitHistory()
        const exists = get().edges.find(
          (e) => e.source === source && e.target === target,
        )
        if (exists) return null
        const id = newDirectorId('de')
        const edge: DirectorEdge = {
          id,
          source,
          target,
          sourceHandle: sourceHandle ?? undefined,
          targetHandle: targetHandle ?? undefined,
          type: data.category,
          data,
        }
        set((s) => ({ edges: [...s.edges, edge], lastSavedAt: Date.now() }))
        return id
      },

      updateEdge: (id, patch) => {
        if (isDemoSession()) return
        set((s) => ({
          edges: s.edges.map((e) =>
            e.id === id
              ? {
                  ...e,
                  data: { ...(e.data ?? {}), ...patch } as DirectorEdgeData,
                  type: (patch.category ?? e.type) as DirectorEdgeCategory,
                }
              : e,
          ),
          lastSavedAt: Date.now(),
        }))
      },

      rebuildAssetNodes: () => {
        const assetStore = useAssetStorageStore.getState()
        set((s) => {
          // 1) 기존 파생물(asset 노드 + references 엣지) 제거 — 멱등 재생성
          const nodes = s.nodes.filter((n) => !isAssetData(n.data))
          const edges = s.edges.filter((e) => e.data?.category !== 'references')

          // 토글 ON: 이 프로젝트에 등록된 전체 에셋(미사용 후보). 씬별로 안 쓰는 것도 표시한다.
          //   asset-storage는 localStorage 영속이라 타 프로젝트 잔재 혼입 방지 위해 projectId 필터.
          const allCharIds = s.showUnusedAssets
            ? Object.keys(assetStore.characters).filter(
                (id) => assetStore.characters[id]?.projectId === s.projectId,
              )
            : []
          const allWorldIds = s.showUnusedAssets
            ? Object.keys(assetStore.worlds).filter(
                (id) => assetStore.worlds[id]?.projectId === s.projectId,
              )
            : []

          const sceneNodes = nodes.filter((n) => isSceneData(n.data))
          for (const scene of sceneNodes) {
            const childShots = nodes.filter(
              (n) =>
                isShotData(n.data) && n.data.parentSceneNodeId === scene.id,
            )
            if (childShots.length === 0) continue

            // 2) 이 씬 shot들이 참조하는 character/world 에셋 수집 (등록된 것만, 순서 보존 dedup)
            const charIds: string[] = []
            const worldIds: string[] = []
            for (const sn of childShots) {
              const sd = sn.data as ShotNodeData
              for (const cid of sd.characterAssetIds)
                if (!charIds.includes(cid) && assetStore.getCharacter(cid))
                  charIds.push(cid)
              for (const wid of sd.worldAssetIds)
                if (!worldIds.includes(wid) && assetStore.getWorld(wid))
                  worldIds.push(wid)
            }
            // 2.5) 토글 ON: 이 씬이 안 쓰는 등록 에셋 = per-scene 미사용. 엣지 없이 표시만.
            const unusedCharIds = allCharIds.filter((id) => !charIds.includes(id))
            const unusedWorldIds = allWorldIds.filter(
              (id) => !worldIds.includes(id),
            )

            if (
              charIds.length === 0 &&
              worldIds.length === 0 &&
              unusedCharIds.length === 0 &&
              unusedWorldIds.length === 0
            )
              continue

            // 3) asset 노드 생성 — Scene 좌측 컬럼, character(위)→world(아래), 사용→미사용 순.
            const baseX = scene.position.x - ASSET_OFFSET_X
            let y = scene.position.y
            const assetNodeIdByAssetId = new Map<string, string>()
            const make = (
              assetId: string,
              kind: 'character' | 'world',
              unused: boolean,
            ) => {
              const reg =
                kind === 'character'
                  ? assetStore.getCharacter(assetId)
                  : assetStore.getWorld(assetId)
              const id = `dn_asset_${scene.id}_${kind}_${assetId}`
              nodes.push({
                id,
                type: 'asset',
                position: { x: baseX, y },
                draggable: false,
                selectable: false,
                data: {
                  kind: 'asset',
                  assetKind: kind,
                  assetId,
                  label: reg?.name ?? assetId,
                  imageUrl: pickAssetImageUrl(reg),
                  locked: true,
                  ...(unused ? { unused: true } : {}),
                },
              })
              // 미사용 노드는 ref 엣지를 안 만드므로 매핑에서 제외(사용분만 등록).
              if (!unused) assetNodeIdByAssetId.set(assetId, id)
              y += ASSET_OFFSET_Y
            }
            for (const cid of charIds) make(cid, 'character', false)
            for (const cid of unusedCharIds) make(cid, 'character', true)
            for (const wid of worldIds) make(wid, 'world', false)
            for (const wid of unusedWorldIds) make(wid, 'world', true)

            // 4) shot → 참조 asset references 엣지 (asset 우측 포트 → shot 좌측 포트)
            //    asset이 Scene 좌측에 있으므로 shot 위치는 건드리지 않는다(기존 흐름 보존).
            for (const sn of childShots) {
              const sd = sn.data as ShotNodeData
              for (const aid of [...sd.characterAssetIds, ...sd.worldAssetIds]) {
                const assetNodeId = assetNodeIdByAssetId.get(aid)
                if (!assetNodeId) continue
                edges.push({
                  id: `de_ref_${assetNodeId}_${sn.id}`,
                  source: assetNodeId,
                  target: sn.id,
                  sourceHandle: 'right',
                  targetHandle: 'left',
                  type: 'references',
                  data: { category: 'references', relationText: '' },
                })
              }
            }
          }

          return { nodes, edges, lastSavedAt: Date.now() }
        })
      },

      deleteEdge: (id) => {
        if (isDemoSession()) return
        set((s) => ({
          edges: s.edges.filter((e) => e.id !== id),
          selectedEdgeId: s.selectedEdgeId === id ? null : s.selectedEdgeId,
          lastSavedAt: Date.now(),
        }))
      },

      // ─── video ─────────────────────────────────────────────────────────

      setVideoFinal: (videoNodeId, final) => {
        const video = get().nodes.find((n) => n.id === videoNodeId)
        if (!video || !isVideoData(video.data)) return
        const shotId = video.data.parentShotNodeId

        // Step 2: DB로 flip할 형제 clip id 수집 (final=true일 때 기존 final 해제)
        const demotedClipIds: string[] = []
        if (final) {
          for (const n of get().nodes) {
            if (
              n.id !== videoNodeId &&
              isVideoData(n.data) &&
              n.data.parentShotNodeId === shotId &&
              n.data.final &&
              n.data.videoClipId
            ) {
              demotedClipIds.push(n.data.videoClipId)
            }
          }
        }

        set((s) => ({
          nodes: s.nodes.map((n) => {
            if (n.id === videoNodeId && isVideoData(n.data)) {
              return { ...n, data: { ...n.data, final } } as DirectorNode
            }
            // Shot당 1개 강제: 같은 Shot 다른 Video는 final 해제
            if (
              final &&
              isVideoData(n.data) &&
              n.data.parentShotNodeId === shotId &&
              n.id !== videoNodeId
            ) {
              return { ...n, data: { ...n.data, final: false } } as DirectorNode
            }
            return n
          }),
          lastSavedAt: Date.now(),
        }))

        // Step 2: is_final → video_clips 행 write (fire-and-forget)
        const clipId = isVideoData(video.data) ? video.data.videoClipId : null
        if (clipId || demotedClipIds.length > 0) {
          void (async () => {
            try {
              const supabase = createClient()
              const ops: Promise<unknown>[] = []
              if (clipId) {
                ops.push(
                  Promise.resolve(
                    supabase
                      .from('video_clips')
                      .update({ is_final: final })
                      .eq('id', clipId),
                  ),
                )
              }
              for (const demoted of demotedClipIds) {
                ops.push(
                  Promise.resolve(
                    supabase
                      .from('video_clips')
                      .update({ is_final: false })
                      .eq('id', demoted),
                  ),
                )
              }
              await Promise.all(ops)
            } catch (err) {
              console.error(
                '[director-store] setVideoFinal DB write failed:',
                err,
              )
            }
          })()
        }
      },

      setVideoStatus: (videoNodeId, status, payload) => {
        set((s) => ({
          nodes: s.nodes.map((n) => {
            if (n.id !== videoNodeId || !isVideoData(n.data)) return n
            return {
              ...n,
              data: {
                ...n.data,
                status,
                videoUrl: payload?.url ?? n.data.videoUrl,
                thumbnailUrl: payload?.thumbnailUrl ?? n.data.thumbnailUrl,
                errorMessage: payload?.error ?? null,
                // 완료된 영상은 stale 해제
                stale: status === 'completed' ? false : n.data.stale,
              },
            } as DirectorNode
          }),
          generatingNodeIds: (() => {
            const next = { ...s.generatingNodeIds }
            if (status === 'generating') next[videoNodeId] = true
            else delete next[videoNodeId]
            return next
          })(),
          lastSavedAt: Date.now(),
        }))

        // Step 2: completed 시 url/status를 video_clips 행에 반영 (videoClipId 있을 때만).
        // 파일 영속은 이미 /api/assets/upload-video가 처리 — 여기선 row에 url+status만 반영.
        if (status === 'completed') {
          // 완료 즉시 썸네일 생성(첫 프레임 캡처 → Storage 업로드). 수동 노드 포함.
          void get().ensureVideoThumbnail(videoNodeId)
          const node = get().nodes.find((n) => n.id === videoNodeId)
          if (node && isVideoData(node.data) && node.data.videoClipId) {
            const clipId = node.data.videoClipId
            const url = node.data.videoUrl
            void (async () => {
              try {
                const supabase = createClient()
                await supabase
                  .from('video_clips')
                  .update({
                    status: 'completed',
                    ...(url ? { url } : {}),
                  })
                  .eq('id', clipId)
              } catch (err) {
                console.error(
                  '[director-store] setVideoStatus DB write failed:',
                  err,
                )
              }
            })()
          }
        }
      },

      applyVideoOverride: (videoNodeId, override) => {
        if (isDemoSession()) return
        set((s) => ({
          nodes: s.nodes.map((n) => {
            if (n.id !== videoNodeId || !isVideoData(n.data)) return n
            return {
              ...n,
              data: { ...n.data, override: { ...n.data.override, ...override } },
            } as DirectorNode
          }),
          lastSavedAt: Date.now(),
        }))

        // Step 2: override → video_clips 행 debounce write (videoClipId 있을 때만)
        const node = get().nodes.find((n) => n.id === videoNodeId)
        if (node && isVideoData(node.data) && node.data.videoClipId) {
          const clipId = node.data.videoClipId
          debouncedVideoClipSaveToDb(clipId, () => {
            const n = get().nodes.find((x) => x.id === videoNodeId)
            return n && isVideoData(n.data)
              ? { override: n.data.override }
              : undefined
          })
        }
      },

      // ─── storyboard image (ST-2, I2I) ──────────────────────────────────

      generateStoryboardImage: async (shotNodeId) => {
        if (isDemoSession()) return
        const api = get()
        const node = api.nodes.find((n) => n.id === shotNodeId)
        if (!node || !isShotData(node.data)) return
        const data = node.data
        const prevUrl = data.storyboardImage?.url ?? ''

        // status → generating (storyboardImage는 shotConfigKeys 아님 → stale 전파 없음)
        api.updateNodeData<'shot'>(shotNodeId, {
          storyboardImage: {
            url: prevUrl,
            status: 'generating',
            errorMessage: null,
            generatedAt: data.storyboardImage?.generatedAt ?? 0,
          },
        })

        const referenceImageUrls = resolveShotAssetImages(data)

        // DB 샷(writerShotId=shots.shot_id 있음) → webhook job 경로.
        // 서버가 fal submit + storage 업로드 + shots.storyboard_image 갱신을 처리(탭 닫혀도 보존).
        const writerShotId = data.writerShotId
        const projectId = get().projectId
        if (writerShotId && projectId) {
          try {
            const res = await fetch('/api/director/generate-storyboard', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                projectId,
                writerShotId,
                prompt: data.prompt || data.label,
                referenceImageUrls,
                aspectRatio: '16:9',
              }),
            })
            if (!res.ok) {
              const body = await res.json().catch(() => ({}))
              throw new Error(body.error ?? `HTTP ${res.status}`)
            }
            const { jobId } = (await res.json()) as { jobId: string }
            const url = await pollGenerationJob(jobId)
            get().updateNodeData<'shot'>(shotNodeId, {
              storyboardImage: {
                url,
                status: 'completed',
                errorMessage: null,
                generatedAt: Date.now(),
              },
            })
            notifyGenerationComplete('director', '스토리보드') // 다른 stage에 있을 때만 알림
          } catch (err) {
            const message = err instanceof Error ? err.message : 'Unknown error'
            get().updateNodeData<'shot'>(shotNodeId, {
              storyboardImage: {
                url: prevUrl,
                status: 'failed',
                errorMessage: message,
                generatedAt: 0,
              },
            })
          }
          return
        }

        // 수동 노드(writerShotId 없음) → 기존 동기 경로 (canvas-local, DB 미반영).
        // 단일 시도 — 90s 타임아웃(fal 행 방지). 실패/타임아웃 시 throw.
        const attempt = async (): Promise<string> => {
          const controller = new AbortController()
          const timer = setTimeout(() => controller.abort(), 90_000)
          try {
            const res = await fetch('/api/generate/image', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                prompt: data.prompt || data.label,
                aspectRatio: '16:9',
                referenceImageUrls,
              }),
              signal: controller.signal,
            })
            if (!res.ok) {
              const body = await res.json().catch(() => ({}))
              throw new Error(body.error ?? `HTTP ${res.status}`)
            }
            const blob = await res.blob()
            return URL.createObjectURL(blob)
          } finally {
            clearTimeout(timer)
          }
        }

        try {
          // 실패 시 1회 재시도 후 최종 실패 처리.
          let blobUrl: string
          try {
            blobUrl = await attempt()
          } catch {
            blobUrl = await attempt()
          }
          const publicUrl =
            (await persistStoryboardImage(
              get().projectId,
              shotNodeId,
              blobUrl,
            )) ?? blobUrl

          get().updateNodeData<'shot'>(shotNodeId, {
            storyboardImage: {
              url: publicUrl,
              status: 'completed',
              errorMessage: null,
              generatedAt: Date.now(),
            },
          })
        } catch (err) {
          const message =
            err instanceof Error
              ? err.name === 'AbortError'
                ? '시간 초과 (90s)'
                : err.message
              : 'Unknown error'
          get().updateNodeData<'shot'>(shotNodeId, {
            storyboardImage: {
              url: prevUrl,
              status: 'failed',
              errorMessage: message,
              generatedAt: 0,
            },
          })
        }
      },

      generateAllStoryboardImages: async () => {
        if (isDemoSession()) return
        // 씬 순서대로 Shot 수집 후 동시성 제한 병렬(2).
        // 순차(20장 직렬 → 수 분)에서 병렬로 단축. 각 샷은 자체 재시도/타임아웃 보유.
        const sceneNodes = get().nodes.filter((n) => isSceneData(n.data))
        const orphanShots = get().nodes.filter(
          (n) => isShotData(n.data) && !n.data.parentSceneNodeId,
        )
        // #2: 이미 완료된 샷은 건너뛴다 (일괄 버튼은 미생성분만 생성; 재생성은 개별 팝업).
        const isPending = (n: DirectorNode) =>
          isShotData(n.data) && n.data.storyboardImage?.status !== 'completed'
        const ordered: string[] = []
        for (const scene of sceneNodes) {
          for (const shot of getChildShots(get(), scene.id)) {
            if (isPending(shot)) ordered.push(shot.id)
          }
        }
        for (const shot of orphanShots) if (isPending(shot)) ordered.push(shot.id)

        const CONCURRENCY = 2
        let cursor = 0
        const worker = async () => {
          while (cursor < ordered.length) {
            const i = cursor++
            await get().generateStoryboardImage(ordered[i]!)
          }
        }
        await Promise.all(
          Array.from({ length: Math.min(CONCURRENCY, ordered.length) }, worker),
        )
      },

      // ─── video generation (ST-4) ────────────────────────────────────────

      generateVideoForShot: async (shotNodeId) => {
        if (isDemoSession()) return null
        const api = get()
        const shotNode = api.nodes.find((n) => n.id === shotNodeId)
        if (!shotNode || !isShotData(shotNode.data)) return null

        // 새 Video take 생성 (마더 설정 상속, 결정 #13) → 그 노드를 생성
        const videoNodeId = api.addVideoTake(shotNodeId)
        if (!videoNodeId) return null

        const started = await get().regenerateVideo(videoNodeId)
        if (!started) {
          // 대기열(쿼터) 초과 — 방금 만든 take 노드를 롤백해 에러 노드를 남기지 않는다(#e5).
          const node = get().nodes.find((n) => n.id === videoNodeId)
          const clipId =
            node && isVideoData(node.data) ? node.data.videoClipId : null
          const takeLabel =
            node && isVideoData(node.data) ? node.data.label : null
          get().deleteNode(videoNodeId)
          // addVideoTake의 clip INSERT는 fire-and-forget — 429가 그보다 빨리 돌아오면
          // 노드에 videoClipId가 아직 없어 deleteNode가 클립을 못 지운다 → 지연 정리.
          // (같은 take_label의 pending 행만 — 쿼터 초과 상태라 동일 라벨 재생성 경합은 사실상 없음)
          if (!clipId && takeLabel && isShotData(shotNode.data) && shotNode.data.writerShotId) {
            const writerShotId = shotNode.data.writerShotId
            const projectId = get().projectId
            setTimeout(() => {
              void createClient()
                .from('video_clips')
                .delete()
                .eq('project_id', projectId)
                .eq('shot_id', writerShotId)
                .eq('take_label', takeLabel)
                .eq('status', 'pending')
                .then(({ error }) => {
                  if (error)
                    console.warn('[director-store] quota rollback clip cleanup:', error.message)
                })
            }, 4000)
          }
          return null
        }
        return videoNodeId
      },

      regenerateVideo: async (videoNodeId) => {
        if (isDemoSession()) return true
        const api = get()
        const videoNode = api.nodes.find((n) => n.id === videoNodeId)
        if (!videoNode || !isVideoData(videoNode.data)) return true
        const shotNode = api.nodes.find(
          (n) => n.id === (videoNode.data as VideoNodeData).parentShotNodeId,
        )
        if (!shotNode || !isShotData(shotNode.data)) return true
        const shot = shotNode.data
        const shotNodeId = shotNode.id

        // effective 설정 = 마더 Shot 상속 + 이 Video의 override
        const eff = getEffectiveShotConfig(get(), videoNodeId)
        if (!eff) return true

        // 레퍼런스 결정: 마더 storyboardImage(완료) 우선 → 유저 업로드 → 없으면 T2V (결정 #40)
        const storyboardUrl =
          shot.storyboardImage?.status === 'completed' &&
          shot.storyboardImage.url
            ? shot.storyboardImage.url
            : null
        const referenceImageUrl =
          storyboardUrl ?? shot.referenceImages[0]?.url ?? null
        const generationMethod: 'T2V' | 'I2V' = referenceImageUrl
          ? 'I2V'
          : 'T2V'

        get().setVideoStatus(videoNodeId, 'generating')

        try {
          const res = await fetch('/api/director/generate-video', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              shotId: shotNodeId,
              // webhook 서버사이드 영속(shots.video_url)을 위해 projectId + DB shot_id 전달.
              // writerShotId 없으면(수동 노드) job 추적 없이 client polling만으로 동작.
              projectId: get().projectId,
              writerShotId: shot.writerShotId,
              // TODO(ST-4 후속): writer 시간 축 연출 정보(움직임/카메라 동선)를 prompt에 추가 투입.
              // 현재는 Shot prompt만 사용 (writer-store 연동은 D-4 sync 이후).
              prompt: eff.prompt,
              camera: eff.camera,
              cameraPreset: eff.cameraPreset,
              aspectRatio: '16:9',
              generationMethod,
              // #5: 모델 레지스트리 키 전달 (legacy 'kling'→'kling-o3' 정규화).
              // provider는 라우트 back-compat 위해 병행 전송 (fal/local 매핑).
              model: normalizeProvider(eff.provider),
              provider: toRouteProvider(eff.provider),
              // #4: flexible 모델 duration + Veo 트림 기준이 되는 설계 샷 길이
              durationSeconds: shot.durationSeconds ?? 5,
              referenceImageUrl,
            }),
          })
          if (!res.ok) {
            const body = await res.json().catch(() => ({}))
            // 생성 대기열(유저 쿼터) 초과(#e5) — 에러 노드를 만들지 않고 하단 알림으로만.
            //   기존 노드는 pending으로 되돌리고, 새 take였다면 호출자가 노드를 롤백한다.
            if (res.status === 429 && body?.code === 'quota_exceeded') {
              get().setVideoStatus(videoNodeId, 'pending')
              toast.error(
                body.error ??
                  '생성 대기열이 가득 찼어요. 진행 중인 작업이 끝나면 다시 시도해주세요.',
                { duration: 5000, closeButton: true },
              )
              return false
            }
            throw new Error(body.error ?? `HTTP ${res.status}`)
          }
          const { taskId, provider: respProvider, model } = await res.json()

          const pollUrl = `/api/director/generate-video/${encodeURIComponent(
            taskId,
          )}?provider=${respProvider}&model=${encodeURIComponent(model)}`

          const startedAt = Date.now()
          while (true) {
            if (Date.now() - startedAt > VIDEO_POLL_TIMEOUT_MS) {
              throw new Error('영상 생성 타임아웃 (5분)')
            }
            const pollRes = await fetch(pollUrl)
            if (!pollRes.ok) {
              const e = await pollRes.json().catch(() => ({}))
              throw new Error(e.error ?? `폴링 실패 HTTP ${pollRes.status}`)
            }
            const poll = await pollRes.json()
            if (poll.status === 'completed') {
              const savedUrl = await persistDirectorVideo(
                get().projectId,
                shotNodeId,
                poll.url,
              )
              get().setVideoStatus(videoNodeId, 'completed', { url: savedUrl })
              notifyGenerationComplete('director', '영상') // 다른 stage에 있을 때만 알림
              break
            }
            if (poll.status === 'failed') {
              throw new Error(poll.error ?? '영상 생성 실패')
            }
            await new Promise((r) => setTimeout(r, VIDEO_POLL_INTERVAL_MS))
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Unknown error'
          get().setVideoStatus(videoNodeId, 'failed', { error: message })
        }
        return true
      },

      // ─── playback + thumbnail ──────────────────────────────────────────

      setPlayingNode: (id) => set({ playingNodeId: id }),

      toggleUnusedAssets: () => {
        set((s) => ({ showUnusedAssets: !s.showUnusedAssets }))
        get().rebuildAssetNodes()
      },

      // ─── undo/redo ─────────────────────────────────────────────────────
      // 스냅샷은 asset/references 파생 제외 — 복원 후 rebuildAssetNodes가 재생성.
      commitHistory: () => {
        if (get()._historySuppressed) return
        const s = get()
        const snap = {
          nodes: s.nodes.filter((n) => !isAssetData(n.data)),
          edges: s.edges.filter((e) => e.data?.category !== 'references'),
        }
        // past 최대 50개 유지, 새 변경이 생기면 redo 가지(future)는 버린다
        set({ historyPast: [...s.historyPast.slice(-49), snap], historyFuture: [] })
      },
      undo: () => {
        const s = get()
        if (!s.historyPast.length) return
        const prev = s.historyPast[s.historyPast.length - 1]!
        const cur = {
          nodes: s.nodes.filter((n) => !isAssetData(n.data)),
          edges: s.edges.filter((e) => e.data?.category !== 'references'),
        }
        set({
          nodes: prev.nodes,
          edges: prev.edges,
          historyPast: s.historyPast.slice(0, -1),
          historyFuture: [...s.historyFuture, cur],
          lastSavedAt: Date.now(),
        })
        get().rebuildAssetNodes()
      },
      redo: () => {
        const s = get()
        if (!s.historyFuture.length) return
        const next = s.historyFuture[s.historyFuture.length - 1]!
        const cur = {
          nodes: s.nodes.filter((n) => !isAssetData(n.data)),
          edges: s.edges.filter((e) => e.data?.category !== 'references'),
        }
        set({
          nodes: next.nodes,
          edges: next.edges,
          historyPast: [...s.historyPast, cur],
          historyFuture: s.historyFuture.slice(0, -1),
          lastSavedAt: Date.now(),
        })
        get().rebuildAssetNodes()
      },

      ensureVideoThumbnail: async (videoNodeId) => {
        const node = get().nodes.find((n) => n.id === videoNodeId)
        if (!node || !isVideoData(node.data)) return
        const data = node.data
        // 이미 썸네일 있거나, 영상 없거나, 캡처 진행 중이면 skip.
        if (!data.videoUrl || data.thumbnailUrl) return
        if (thumbnailInFlight.has(videoNodeId)) return
        thumbnailInFlight.add(videoNodeId)
        try {
          const blob = await captureVideoThumbnail(data.videoUrl)
          if (!blob) return

          const projectId = get().projectId
          const clipId = data.videoClipId
          // DB 샷(video_clips 행 존재) → Storage 업로드 + thumbnail_url/path 영속(속도·전송 안정).
          if (clipId && projectId && projectId !== 'default') {
            try {
              const form = new FormData()
              form.append('projectId', projectId)
              form.append('type', 'video')
              form.append('entityId', clipId)
              form.append('field', 'thumbnail')
              form.append('file', blob, `${clipId}_thumbnail.jpg`)
              const res = await fetch('/api/assets/upload-image', {
                method: 'POST',
                body: form,
              })
              if (res.ok) {
                const { publicUrl } = await res.json()
                if (publicUrl) {
                  get().updateNodeData<'video'>(videoNodeId, {
                    thumbnailUrl: publicUrl,
                  })
                  return
                }
              }
            } catch (err) {
              console.error(
                '[director-store] thumbnail upload failed:',
                err,
              )
            }
          }
          // 수동 노드(clip 없음) 또는 업로드 실패 → 로컬 objectURL 폴백(세션 한정).
          get().updateNodeData<'video'>(videoNodeId, {
            thumbnailUrl: URL.createObjectURL(blob),
          })
        } finally {
          thumbnailInFlight.delete(videoNodeId)
        }
      },

      // ─── propagation ───────────────────────────────────────────────────

      propagateStaleFromShot: (shotNodeId) => {
        const videos = getChildVideos(get(), shotNodeId)
        if (videos.length === 0) return
        const videoIds = new Set(videos.map((n) => n.id))
        set((s) => ({
          nodes: s.nodes.map((n) =>
            videoIds.has(n.id) && isVideoData(n.data)
              ? ({ ...n, data: { ...n.data, stale: true } } as DirectorNode)
              : n,
          ),
          lastSavedAt: Date.now(),
        }))
      },

      clearStale: (id) => {
        set((s) => ({
          nodes: s.nodes.map((n) => {
            if (n.id !== id) return n
            if (isShotData(n.data) || isVideoData(n.data)) {
              return { ...n, data: { ...n.data, stale: false } } as DirectorNode
            }
            return n
          }),
          lastSavedAt: Date.now(),
        }))
      },

      // ─── selection ─────────────────────────────────────────────────────

      selectNode: (id) =>
        set({ selectedNodeId: id, selectedEdgeId: id ? null : null }),
      selectEdge: (id) =>
        set({ selectedEdgeId: id, selectedNodeId: id ? null : null }),

      // ─── popups / modals ───────────────────────────────────────────────

      openPopup: (id) => set({ popupNodeId: id }),
      closePopup: () => set({ popupNodeId: null }),

      openDeleteConfirm: (id) => {
        const node = get().nodes.find((n) => n.id === id)
        if (!node) return
        const info: DeleteCascadeInfo = {
          nodeId: id,
          shotCount: 0,
          videoCount: 0,
          finalAffected: false,
        }
        if (node.data.kind === 'scene') {
          const shots = getChildShots(get(), id)
          info.shotCount = shots.length
          shots.forEach((sh) => {
            const vids = getChildVideos(get(), sh.id)
            info.videoCount += vids.length
            if (vids.some((v) => isVideoData(v.data) && v.data.final)) {
              info.finalAffected = true
            }
          })
        } else if (node.data.kind === 'shot') {
          const vids = getChildVideos(get(), id)
          info.videoCount = vids.length
          if (vids.some((v) => isVideoData(v.data) && v.data.final)) {
            info.finalAffected = true
          }
        } else if (node.data.kind === 'video' && node.data.final) {
          info.finalAffected = true
        }
        set({ deleteConfirmInfo: info })
      },
      closeDeleteConfirm: () => set({ deleteConfirmInfo: null }),
      confirmDelete: () => {
        const info = get().deleteConfirmInfo
        if (!info) return
        get().deleteNode(info.nodeId)
        set({ deleteConfirmInfo: null })
      },

      openRelationModal: (source, target, sourceHandle, targetHandle) =>
        set({
          relationModal: {
            source,
            target,
            sourceHandle: sourceHandle ?? null,
            targetHandle: targetHandle ?? null,
          },
        }),
      closeRelationModal: () => set({ relationModal: null }),

      // ─── agentic ───────────────────────────────────────────────────────

      applyUpdates: (updates) => {
        const tempIdMap = new Map<string, string>()
        const resolveId = (id: string): string => tempIdMap.get(id) ?? id
        const result: DirectorCanvasUpdateResult = { applied: 0, skipped: [] }
        const api = get()

        const findNodeOrSkip = (id: string, u: DirectorCanvasUpdate): boolean => {
          if (!get().nodes.find((n) => n.id === id)) {
            result.skipped.push({ update: u, reason: 'unknown id' })
            return false
          }
          return true
        }

        for (const u of updates) {
          try {
            switch (u.type) {
              case 'addScene': {
                const defaultPos = nextScenePosition(get())
                const newId = api.addSceneNode(defaultPos, u.label)
                if (u.tempId) tempIdMap.set(u.tempId, newId)
                if (
                  u.location !== undefined ||
                  u.timeOfDay !== undefined ||
                  u.mood !== undefined ||
                  u.description !== undefined
                ) {
                  api.updateNodeData<'scene'>(newId, {
                    ...(u.location !== undefined && { location: u.location }),
                    ...(u.timeOfDay !== undefined && { timeOfDay: u.timeOfDay }),
                    ...(u.mood !== undefined && { mood: u.mood }),
                    ...(u.description !== undefined && {
                      description: u.description,
                    }),
                  })
                }
                result.applied += 1
                break
              }
              case 'addShot': {
                const sceneId = resolveId(u.sceneId)
                const scene = get().nodes.find((n) => n.id === sceneId)
                if (!scene || !isSceneData(scene.data)) {
                  result.skipped.push({
                    update: u,
                    reason: 'sceneId is not a Scene node',
                  })
                  break
                }
                const pos = nextShotPosition(get(), sceneId)
                const newId = api.addShotNode(sceneId, pos, u.label)
                if (u.tempId) tempIdMap.set(u.tempId, newId)
                if (u.prompt !== undefined) {
                  api.updateNodeData<'shot'>(newId, { prompt: u.prompt })
                }
                result.applied += 1
                break
              }
              case 'updateScene': {
                const id = resolveId(u.id)
                if (!findNodeOrSkip(id, u)) break
                const node = get().nodes.find((n) => n.id === id)
                if (!node || !isSceneData(node.data)) {
                  result.skipped.push({ update: u, reason: 'not a Scene' })
                  break
                }
                api.updateNodeData<'scene'>(id, u.patch)
                result.applied += 1
                break
              }
              case 'updateShot': {
                const id = resolveId(u.id)
                if (!findNodeOrSkip(id, u)) break
                const node = get().nodes.find((n) => n.id === id)
                if (!node || !isShotData(node.data)) {
                  result.skipped.push({ update: u, reason: 'not a Shot' })
                  break
                }
                api.updateNodeData<'shot'>(id, u.patch)
                result.applied += 1
                break
              }
              case 'addVideoTake': {
                const shotId = resolveId(u.shotId)
                const newId = api.addVideoTake(shotId)
                if (!newId) {
                  result.skipped.push({
                    update: u,
                    reason: 'shotId invalid',
                  })
                  break
                }
                if (u.tempId) tempIdMap.set(u.tempId, newId)
                if (u.override) api.applyVideoOverride(newId, u.override)
                result.applied += 1
                break
              }
              case 'setCamera': {
                const id = resolveId(u.id)
                if (!findNodeOrSkip(id, u)) break
                const node = get().nodes.find((n) => n.id === id)
                if (!node) break
                if (isShotData(node.data)) {
                  api.updateNodeData<'shot'>(id, {
                    camera: { ...node.data.camera, ...u.camera },
                  })
                  result.applied += 1
                } else if (isVideoData(node.data)) {
                  const eff = getEffectiveShotConfig(get(), id)
                  if (eff) {
                    api.applyVideoOverride(id, {
                      camera: { ...eff.camera, ...u.camera },
                    })
                    result.applied += 1
                  }
                } else {
                  result.skipped.push({
                    update: u,
                    reason: 'camera only on Shot/Video',
                  })
                }
                break
              }
              case 'setLighting': {
                const id = resolveId(u.id)
                if (!findNodeOrSkip(id, u)) break
                const node = get().nodes.find((n) => n.id === id)
                if (!node) break
                if (isShotData(node.data)) {
                  api.updateNodeData<'shot'>(id, {
                    lighting: { ...node.data.lighting, ...u.lighting },
                  })
                  result.applied += 1
                } else if (isVideoData(node.data)) {
                  const eff = getEffectiveShotConfig(get(), id)
                  if (eff) {
                    api.applyVideoOverride(id, {
                      lighting: { ...eff.lighting, ...u.lighting },
                    })
                    result.applied += 1
                  }
                } else {
                  result.skipped.push({
                    update: u,
                    reason: 'lighting only on Shot/Video',
                  })
                }
                break
              }
              case 'setCameraPreset': {
                const id = resolveId(u.id)
                if (!findNodeOrSkip(id, u)) break
                const node = get().nodes.find((n) => n.id === id)
                if (!node) break
                if (isShotData(node.data)) {
                  api.updateNodeData<'shot'>(id, {
                    cameraPreset: {
                      ...node.data.cameraPreset,
                      ...u.preset,
                    },
                  })
                  result.applied += 1
                } else if (isVideoData(node.data)) {
                  const eff = getEffectiveShotConfig(get(), id)
                  if (eff) {
                    api.applyVideoOverride(id, {
                      cameraPreset: { ...eff.cameraPreset, ...u.preset },
                    })
                    result.applied += 1
                  }
                } else {
                  result.skipped.push({
                    update: u,
                    reason: 'cameraPreset only on Shot/Video',
                  })
                }
                break
              }
              case 'generateVideo': {
                // D-5 wire-up 전: 노드 status만 generating으로 토글 (placeholder)
                const id = resolveId(u.id)
                const node = get().nodes.find((n) => n.id === id)
                if (!node || !isVideoData(node.data)) {
                  result.skipped.push({
                    update: u,
                    reason: 'generateVideo target must be Video node',
                  })
                  break
                }
                api.setVideoStatus(id, 'generating')
                // D-5에서 실제 API 호출. 지금은 placeholder.
                setTimeout(() => {
                  useDirectorCanvasStore.getState().setVideoStatus(id, 'pending')
                }, 800)
                result.applied += 1
                break
              }
              case 'connect': {
                const s = resolveId(u.sourceId)
                const t = resolveId(u.targetId)
                if (
                  !get().nodes.find((n) => n.id === s) ||
                  !get().nodes.find((n) => n.id === t)
                ) {
                  result.skipped.push({ update: u, reason: 'unknown id' })
                  break
                }
                const edgeId = api.addEdge(s, t, {
                  category: u.category,
                  relationText: u.relationText ?? '',
                })
                if (edgeId) result.applied += 1
                else
                  result.skipped.push({
                    update: u,
                    reason: 'duplicate or self',
                  })
                break
              }
              case 'requestDelete': {
                const id = resolveId(u.id)
                if (!findNodeOrSkip(id, u)) break
                api.openDeleteConfirm(id)
                result.applied += 1
                break
              }
              case 'selectNode': {
                const id = resolveId(u.id)
                if (!findNodeOrSkip(id, u)) break
                api.selectNode(id)
                result.applied += 1
                break
              }
              default: {
                const _exhaustive: never = u
                result.skipped.push({
                  update: u,
                  reason: `unknown type: ${(_exhaustive as { type: string }).type}`,
                })
              }
            }
          } catch (err) {
            result.skipped.push({
              update: u,
              reason: err instanceof Error ? err.message : 'error',
            })
          }
        }
        return result
      },

      reset: () =>
        set({
          nodes: initialNodes,
          edges: initialEdges,
          selectedNodeId: null,
          selectedEdgeId: null,
          viewport: { x: 0, y: 0, zoom: 1 },
          viewportInitialized: false,
          popupNodeId: null,
          deleteConfirmInfo: null,
          relationModal: null,
          generatingNodeIds: {},
          generationErrors: {},
          playingNodeId: null,
          showUnusedAssets: false,
          historyPast: [],
          historyFuture: [],
          lastSavedAt: Date.now(),
        }),
    }),
    {
      // Step 2 (unify-director-store-db): localStorage persist는 이제 오프라인 캐시.
      // 진입 시 hydrateFromDb(projectId)가 DB(canvas_position/video_clips)를 진실로
      // 적용해 캐시를 reconcile한다. 충돌 시 DB가 캐넌.
      name: 'tale-director-v1-default',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        // asset 노드/references 엣지는 파생물(asset-storage가 진실) — persist 제외.
        // 매 진입 시 sync가 rebuildAssetNodes로 재생성하므로 캐시에 남기면 stale 위험.
        nodes: s.nodes.filter((n) => n.data.kind !== 'asset'),
        edges: s.edges.filter((e) => e.data?.category !== 'references'),
        viewport: s.viewport,
        viewMode: s.viewMode,
        projectId: s.projectId,
        lastSavedAt: s.lastSavedAt,
      }),
    },
  ),
)

// ============================================================================
// Auto-placement (결정 #18) — Writer ↔ Director sync에서 사용 (Phase D-4)
// ============================================================================

/**
 * 부모 Scene의 우측에 새 Shot 노드 위치 자동 계산.
 * 형제 Shot 아래로 stacking (snap 16px).
 */
export function nextShotPosition(
  state: Pick<DirectorCanvasState, 'nodes'>,
  parentSceneNodeId: string,
): XYPosition {
  const parent = state.nodes.find((n) => n.id === parentSceneNodeId)
  if (!parent) return { x: 80, y: 80 }
  const siblings = getChildShots(state, parentSceneNodeId)
  return {
    x: parent.position.x + SHOT_OFFSET_X,
    y: parent.position.y + siblings.length * SHOT_OFFSET_Y,
  }
}

/**
 * 부모 Shot의 우측에 새 Video take 노드 위치 자동 계산 (addVideoTake와 동일 규칙).
 * 형제 Video 아래로 stacking.
 */
export function nextVideoPosition(
  state: Pick<DirectorCanvasState, 'nodes'>,
  parentShotNodeId: string,
): XYPosition {
  const parent = state.nodes.find((n) => n.id === parentShotNodeId)
  if (!parent) return { x: 80, y: 80 }
  const siblings = getChildVideos(state, parentShotNodeId)
  return {
    x: parent.position.x + VIDEO_OFFSET_X,
    y: parent.position.y + siblings.length * VIDEO_OFFSET_Y,
  }
}

/**
 * 새 Scene 노드 자동 위치 — 가장 아래 Scene 아래로 stacking.
 */
export function nextScenePosition(
  state: Pick<DirectorCanvasState, 'nodes'>,
): XYPosition {
  const scenes = state.nodes.filter((n) => n.data.kind === 'scene')
  if (scenes.length === 0) return { x: 80, y: 80 }
  // Scene을 가로로 배치 — 각 그룹(scene + 우측 shot 컬럼 + video 공간)이 겹치지 않게
  // 그룹 폭(scene→shot + shot→video + video 노드/여백)만큼 우측으로. (#1 레이아웃)
  const maxX = Math.max(...scenes.map((n) => n.position.x))
  return { x: maxX + SHOT_OFFSET_X + VIDEO_OFFSET_X + 400, y: 80 }
}

// ============================================================================
// Context serialization for LLM — specs/layers/director.md §12.4
// ============================================================================

/**
 * LLM prompt 컨텍스트용 캔버스 스냅샷 직렬화.
 * 통계 + Scene→Shot→Video 트리 + 선택된 노드의 풀 정보.
 */
export function serializeDirectorCanvasContext(
  state: Pick<DirectorCanvasState, 'nodes' | 'edges' | 'selectedNodeId'>,
): string {
  const { nodes, edges, selectedNodeId } = state

  const scenes = nodes.filter((n) => isSceneData(n.data))
  const shots = nodes.filter((n) => isShotData(n.data))
  const videos = nodes.filter((n) => isVideoData(n.data))
  const finalVideos = videos.filter(
    (n) => isVideoData(n.data) && n.data.final,
  )

  const lines: string[] = []
  lines.push('## Director Canvas')
  lines.push('')
  lines.push('### 통계')
  lines.push(
    `- 노드 ${nodes.length}개 (Scene ${scenes.length}, Shot ${shots.length}, Video ${videos.length})`,
  )
  lines.push(`- ★ Final 마킹 Video ${finalVideos.length}개`)
  lines.push(
    `- 엣지 ${edges.length}개 (parent ${edges.filter((e) => e.data?.category === 'parent').length}, relates-to ${edges.filter((e) => e.data?.category === 'relates-to').length})`,
  )
  lines.push('')

  if (nodes.length > 0) {
    lines.push('### 노드 트리')
    scenes.forEach((scene) => {
      if (!isSceneData(scene.data)) return
      lines.push(`- [${scene.id}] Scene "${scene.data.label}"`)
      if (scene.data.location) lines.push(`    location: ${scene.data.location}`)
      if (scene.data.timeOfDay)
        lines.push(`    timeOfDay: ${scene.data.timeOfDay}`)
      if (scene.data.mood) lines.push(`    mood: ${scene.data.mood}`)

      const childShots = nodes.filter(
        (n) => isShotData(n.data) && n.data.parentSceneNodeId === scene.id,
      )
      childShots.forEach((sh) => {
        if (!isShotData(sh.data)) return
        const shData = sh.data
        const promptSnippet =
          shData.prompt.length > 60
            ? `${shData.prompt.slice(0, 60)}…`
            : shData.prompt
        const camActive = (
          ['horizontal', 'vertical', 'pan', 'tilt', 'roll', 'zoom'] as const
        ).filter((k) => shData.camera[k] !== 0).length
        lines.push(
          `  - [${sh.id}] Shot "${shData.label}" (camera ${camActive}/6 active, light ${shData.lighting.position}, ${shData.provider})${shData.stale ? ' [stale]' : ''}: ${promptSnippet || '(빈 prompt)'}`,
        )
        const childVideos = nodes.filter(
          (n) => isVideoData(n.data) && n.data.parentShotNodeId === sh.id,
        )
        childVideos.forEach((v) => {
          if (!isVideoData(v.data)) return
          const vData = v.data
          const ovKeys = Object.keys(vData.override).join(',') || '-'
          lines.push(
            `      - [${v.id}] Video "${vData.label}" (${vData.status}${vData.final ? ', ★FINAL' : ''}${vData.stale ? ', stale' : ''}, override: ${ovKeys})`,
          )
        })
      })
    })

    // Orphan shots (parent Scene 없는)
    const orphanShots = shots.filter(
      (n) => isShotData(n.data) && n.data.parentSceneNodeId === null,
    )
    if (orphanShots.length > 0) {
      lines.push('- (orphan Shots — Scene 미연결)')
      orphanShots.forEach((sh) => {
        if (!isShotData(sh.data)) return
        lines.push(`  - [${sh.id}] Shot "${sh.data.label}"`)
      })
    }
    lines.push('')
  }

  // relates-to edges
  const relatesEdges = edges.filter(
    (e) => e.data?.category === 'relates-to',
  )
  if (relatesEdges.length > 0) {
    lines.push('### 사용자 정의 관계 (relates-to)')
    relatesEdges.forEach((e) => {
      const rt = e.data?.relationText
      const rtSuffix = rt ? ` ("${rt}")` : ''
      lines.push(`- ${e.source} <-> ${e.target}${rtSuffix}`)
    })
    lines.push('')
  }

  if (selectedNodeId) {
    const sel = nodes.find((n) => n.id === selectedNodeId)
    if (sel) {
      lines.push('### 선택된 노드 (풀 정보)')
      lines.push(`- ID: ${sel.id}`)
      lines.push(`- 종류: ${sel.data.kind}`)
      lines.push(`- 라벨: ${sel.data.label}`)
      if (isShotData(sel.data)) {
        lines.push(`- prompt (full): ${sel.data.prompt || '(빈)'}`)
        lines.push(`- camera: ${JSON.stringify(sel.data.camera)}`)
        lines.push(`- lighting: ${JSON.stringify(sel.data.lighting)}`)
        lines.push(`- cameraPreset: ${JSON.stringify(sel.data.cameraPreset)}`)
        lines.push(`- provider: ${sel.data.provider}`)
      } else if (isVideoData(sel.data)) {
        lines.push(`- parent Shot: ${sel.data.parentShotNodeId}`)
        lines.push(`- override: ${JSON.stringify(sel.data.override)}`)
        lines.push(`- status: ${sel.data.status}`)
        lines.push(`- final: ${sel.data.final}`)
      } else if (isSceneData(sel.data)) {
        lines.push(`- description: ${sel.data.description || '(빈)'}`)
      }
    }
  }

  return lines.join('\n')
}
