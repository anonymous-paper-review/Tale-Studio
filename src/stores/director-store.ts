import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
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
  isShotData,
  isSceneData,
  isVideoData,
  type DirectorNode,
  type DirectorEdge,
  type DirectorNodeData,
  type DirectorNodeKind,
  type DirectorEdgeData,
  type DirectorEdgeCategory,
  type SceneNodeData,
  type ShotNodeData,
  type VideoNodeData,
  type VideoOverride,
  type DirectorVideoStatus,
  type DirectorVideoProvider,
} from '@/types/director'
import {
  useAssetStorageStore,
  type RegisteredCharacter,
} from '@/stores/asset-storage-store'
import { createClient } from '@/lib/supabase/client'
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
  /** 기존 Video 노드 1개를 effective 설정으로 (재)생성 (D-5). 마더 Shot storyboardImage 있으면 I2V */
  regenerateVideo: (videoNodeId: string) => Promise<void>

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
      viewMode: 'node',
      popupNodeId: null,
      deleteConfirmInfo: null,
      relationModal: null,
      generatingNodeIds: {},
      generationErrors: {},
      playingNodeId: null,
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
            popupNodeId: null,
            deleteConfirmInfo: null,
            relationModal: null,
            generatingNodeIds: {},
            generationErrors: {},
            playingNodeId: null,
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

      // [디버그] 겹친 노드 정리용 — #1 시딩과 동일 규칙으로 전체 재배치.
      //   scene 가로(그룹 폭만큼) / 그 우측에 shot 세로 stack / shot 우측에 video 세로 stack.
      //   in-memory 즉시 적용 + nodeId별 persist로 DB(canvas_position)까지 반영(재진입 유지).
      relayoutCanvas: () => {
        const GROUP_WIDTH = SHOT_OFFSET_X + VIDEO_OFFSET_X + 400
        const state = get()
        const scenes = state.nodes
          .filter((n) => isSceneData(n.data))
          .sort((a, b) => a.position.y - b.position.y || a.position.x - b.position.x)
        const posById = new Map<string, XYPosition>()
        scenes.forEach((scene, i) => {
          const sx = 80 + i * GROUP_WIDTH
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
        const state = get()
        const mother = state.nodes.find((n) => n.id === parentShotNodeId)
        if (!mother || !isShotData(mother.data)) return null

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

      updateNodeData: (id, patch) => {
        const prev = get().nodes.find((n) => n.id === id)
        if (!prev) return

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
        if (source === target) return null
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

      deleteEdge: (id) => {
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
        const api = get()
        const shotNode = api.nodes.find((n) => n.id === shotNodeId)
        if (!shotNode || !isShotData(shotNode.data)) return null

        // 새 Video take 생성 (마더 설정 상속, 결정 #13) → 그 노드를 생성
        const videoNodeId = api.addVideoTake(shotNodeId)
        if (!videoNodeId) return null

        await get().regenerateVideo(videoNodeId)
        return videoNodeId
      },

      regenerateVideo: async (videoNodeId) => {
        const api = get()
        const videoNode = api.nodes.find((n) => n.id === videoNodeId)
        if (!videoNode || !isVideoData(videoNode.data)) return
        const shotNode = api.nodes.find(
          (n) => n.id === (videoNode.data as VideoNodeData).parentShotNodeId,
        )
        if (!shotNode || !isShotData(shotNode.data)) return
        const shot = shotNode.data
        const shotNodeId = shotNode.id

        // effective 설정 = 마더 Shot 상속 + 이 Video의 override
        const eff = getEffectiveShotConfig(get(), videoNodeId)
        if (!eff) return

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
      },

      // ─── playback + thumbnail ──────────────────────────────────────────

      setPlayingNode: (id) => set({ playingNodeId: id }),

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
          popupNodeId: null,
          deleteConfirmInfo: null,
          relationModal: null,
          generatingNodeIds: {},
          generationErrors: {},
          playingNodeId: null,
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
        nodes: s.nodes,
        edges: s.edges,
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
