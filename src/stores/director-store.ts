import { create } from 'zustand'
import type { SceneLedger } from '@/lib/writer/types/pipeline'
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
  ASSET_OFFSET_X,
  ASSET_OFFSET_Y,
  isShotData,
  isSceneData,
  isVideoData,
  isAssetData,
  isPromptData,
  isShotImageData,
  isVideoPlaceholderData,
  isDerivedNodeData,
  type DirectorNode,
  type DirectorEdge,
  type DirectorNodeData,
  type DirectorNodeKind,
  type DirectorEdgeData,
  type SceneNodeData,
  type ShotNodeData,
  type VideoNodeData,
  type DirectorImageTargetHandle,
  type DirectorVideoFrameTargetHandle,
  type DirectorVideoChainTargetHandle,
  type PromptNodeData,
  type VideoOverride,
  type StandaloneVideoConfig,
  type VideoAdherence,
  type DirectorVideoStatus,
  type DirectorVideoProvider,
} from '@/types/director'
import { notifyIfQuotaExceeded } from '@/lib/generation-quota-toast'
import {
  isPrerequisiteMissing,
  notifyPrerequisiteResumed,
  notifyPrerequisiteTimeout,
  notifyPrerequisiteWaiting,
  waitForPrerequisite,
} from '@/lib/generation-prerequisite-toast'
import {
  useAssetStorageStore,
  type RegisteredCharacter,
} from '@/stores/asset-storage-store'
import { createClient } from '@/lib/supabase/client'
import type { Json } from '@/types/database'
import { invalidateShots, loadShotsResult } from '@/lib/shots-cache'
import {
  isEmptyStableFrameInputs,
  parseStableFrameInputs,
  parseStableImageInputs,
  parseStableVideoChain,
  resolveFrameInputs,
  resolveImageInputs,
  serializeFrameInputs,
  serializeImageInputs,
  type StableFrameInputs,
  type StableVideoChain,
  type StableWiringRef,
} from '@/lib/director/wiring-persistence'
import { runVideoAdherence } from '@/lib/director/video-adherence-client'
import { isDemoSession } from '@/lib/demo/context'
import {
  pollGenerationJob,
  type GenerationJobObserver,
  type GenerationJobReceipt,
} from '@/lib/generation-jobs-client'
import { notifyGenerationComplete, notifyGenerationFailure } from '@/lib/generation-notify'
import { claimAction, releaseAction } from '@/lib/action-guard'
import { translate } from '@/lib/i18n'
import { useLocaleStore } from '@/stores/locale-store'
import { DEFAULT_VIDEO_MODEL, normalizeProvider } from '@/lib/video-models'
import {
  isStandaloneVideoOwnerKey,
  normalizeStandaloneVideoConfig,
} from '@/lib/director/standalone-video'
import {
  beginPipelineProgressBatch,
  resetPipelineProgressBatches,
} from '@/lib/pipeline-progress'

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

export type DirectorGenerationRequestOptions = {
  traceId?: string
  onJob?: GenerationJobObserver
  /** #ref-gate 자동 재개 깊이(내부) — 선행조건 대기 후 재호출이 무한히 이어지지 않게 상한(3). */
  resumeDepth?: number
  /** Internal flag used exclusively by the explicit full-video batch runner. */
  batch?: boolean
  /**
   * 리테이크 상속(#retake-inherit 2026-08-31 오너): 이 Video 노드의 수동 배선
   * (frameInputs·영상 체인·override)을 새 테이크에 복사한다. 8/31 실측에서
   * '영상 리테이크'가 체인 없는 새 테이크를 만들던 함정의 교정.
   */
  inheritFromVideoNodeId?: string
}

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
    derivedPrompt: '',
    promptOverride: undefined,
    promptMigratedV2: true,
    referenceImages: [],
    imageInputs: [],
    storyboardImage: null,
    characterAssetIds: [],
    worldAssetIds: [],
    camera: { ...DEFAULT_CAMERA },
    lighting: { ...DEFAULT_LIGHTING },
    cameraPreset: { ...DEFAULT_CAMERA_PRESET },
    provider: DEFAULT_PROVIDER,
    imageModel: undefined,
    durationSeconds: 5,
    generationMethod: 'T2V',
    stale: false,
  }
}

type HydratedVideoTake = {
  id: string
  shot_id: string
  take_number: number
  take_label: string | null
  override: VideoOverride | null
  canvas_position: { x: number; y: number } | null
  is_final: boolean
  url: string | null
  thumbnail_url: string | null
  status: DirectorVideoStatus | 'queued'
  latestJobId: string | null
  last_attempt_status: DirectorVideoStatus | 'queued' | null
  last_attempt_error: string | null
  last_attempt_at: string | null
  created_at: string | null
  updated_at: string | null
  latestJobStatus: DirectorVideoStatus | null
  latestJobError: string | null
  latestAttemptAt: string | null
  /** #adherence P2: 모션 준수 판정(video_clips.adherence — select * 로 흘러옴). 구행/미검사 = 없음. */
  adherence?: VideoAdherence | null
  /** #wiring-persistence: 수동 연결 안정 참조 (select * 로 흘러옴). 구행 = 없음. */
  frame_inputs?: unknown
  video_chain?: unknown
}
type VideoGenerationResponse = {
  error?: string
  code?: string
  jobId?: string
  videoClipId?: string
  takeNumber?: number
  status?: DirectorVideoStatus | 'queued'
  retryable?: boolean
  recoveryReceipt?: string
}

const EMPTY_FRAME_INPUTS = (): VideoNodeData['frameInputs'] => ({
  start: null,
  end: null,
  refs: [],
})

/**
 * Persisted Director snapshots can predate frame wiring. Normalize that payload
 * at every rebuild boundary so old cached Video nodes remain usable.
 */
function normalizeFrameInputs(value: unknown): VideoNodeData['frameInputs'] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return EMPTY_FRAME_INPUTS()
  }
  const row = value as Record<string, unknown>
  const refs = Array.isArray(row.refs)
    ? row.refs.filter(
        (id): id is string => typeof id === 'string' && id.length > 0,
      )
    : []
  return {
    start: typeof row.start === 'string' && row.start.length > 0 ? row.start : null,
    end: typeof row.end === 'string' && row.end.length > 0 ? row.end : null,
    refs: [...new Set(refs)],
  }
}

/** Persisted Shot image-reference IDs may be absent or malformed in old caches. */
function normalizeImageInputs(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return [
    ...new Set(
      value.filter(
        (id): id is string => typeof id === 'string' && id.length > 0,
      ),
    ),
  ]
}

function isFrameSourceNode(node: DirectorNode): boolean {
  // #node-merge: 파생 shotImage 카드 제거 — 이미지 출처는 Shot/Asset 노드뿐.
  return isShotData(node.data) || isAssetData(node.data)
}

function isImageSourceNode(node: DirectorNode): boolean {
  return isFrameSourceNode(node)
}

type FrameInputSlot = 'start' | 'end' | 'ref'

function usableFrameImageUrl(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null
}

function firstUploadedReferenceImageUrl(value: unknown): string | null {
  if (!Array.isArray(value)) return null
  for (const image of value) {
    if (!image || typeof image !== 'object' || Array.isArray(image)) continue
    const url = usableFrameImageUrl((image as { url?: unknown }).url)
    if (url) return url
  }
  return null
}

function resolveShotFrameImageUrl(
  data: ShotNodeData,
  slot: FrameInputSlot,
): string | null {
  const storyboard = data.storyboardImage
  if (storyboard?.status === 'completed') {
    const frame =
      slot === 'start'
        ? storyboard.frames?.start
        : slot === 'end'
          ? storyboard.frames?.end
          : undefined
    const storyboardUrl = usableFrameImageUrl(frame) ?? usableFrameImageUrl(storyboard.url)
    if (storyboardUrl) return storyboardUrl
  }
  return firstUploadedReferenceImageUrl(data.referenceImages)
}

/**
 * Resolve a persisted frame-input source node ID to an image URL. Frame inputs
 * intentionally store Director IDs, so unsupported or not-yet-generated nodes
 * must resolve to null rather than leaking an ID into the generation request.
 */
function resolveFrameInputImageUrl(
  nodes: DirectorNode[],
  sourceNodeId: string,
  slot: FrameInputSlot,
): string | null {
  const source = nodes.find((node) => node.id === sourceNodeId)
  if (!source || !isFrameSourceNode(source)) return null
  if (isAssetData(source.data)) return usableFrameImageUrl(source.data.imageUrl)
  return isShotData(source.data)
    ? resolveShotFrameImageUrl(source.data, slot)
    : null
}

function resolveStoryboardImageUrl(data: ShotNodeData): string | null {
  const storyboard = data.storyboardImage
  if (!storyboard || storyboard.status !== 'completed') return null
  return (
    usableFrameImageUrl(storyboard.url) ??
    usableFrameImageUrl(storyboard.frames?.start)
  )
}

function resolveImageInputImageUrl(
  nodes: DirectorNode[],
  sourceNodeId: string,
): string | null {
  const source = nodes.find((node) => node.id === sourceNodeId)
  if (!source || !isImageSourceNode(source)) return null
  if (isAssetData(source.data)) return usableFrameImageUrl(source.data.imageUrl)
  return isShotData(source.data)
    ? resolveStoryboardImageUrl(source.data)
    : null
}

function frameEdgeId(
  sourceNodeId: string,
  videoNodeId: string,
  targetHandle: DirectorVideoFrameTargetHandle,
): string {
  return `de_frame_${sourceNodeId}_${videoNodeId}_${targetHandle}`
}

function imageEdgeId(sourceNodeId: string, shotNodeId: string): string {
  return `de_image_${sourceNodeId}_${shotNodeId}`
}

function makeImageEdge(sourceNodeId: string, shotNodeId: string): DirectorEdge {
  return {
    id: imageEdgeId(sourceNodeId, shotNodeId),
    source: sourceNodeId,
    target: shotNodeId,
    sourceHandle: 'right',
    targetHandle: 'image-reference',
    type: 'image',
    data: { category: 'image', relationText: '' },
  }
}

function makeFrameEdge(
  sourceNodeId: string,
  videoNodeId: string,
  targetHandle: DirectorVideoFrameTargetHandle,
): DirectorEdge {
  return {
    id: frameEdgeId(sourceNodeId, videoNodeId, targetHandle),
    source: sourceNodeId,
    target: videoNodeId,
    sourceHandle: 'right',
    targetHandle,
    type: 'frame',
    data: { category: 'frame', relationText: '' },
  }
}

function videoChainEdgeId(sourceVideoNodeId: string, targetVideoNodeId: string): string {
  return `de_video_chain_${sourceVideoNodeId}_${targetVideoNodeId}`
}

function makeVideoChainEdge(
  sourceVideoNodeId: string,
  targetVideoNodeId: string,
): DirectorEdge {
  return {
    id: videoChainEdgeId(sourceVideoNodeId, targetVideoNodeId),
    source: sourceVideoNodeId,
    target: targetVideoNodeId,
    sourceHandle: 'right',
    targetHandle: 'video-chain',
    type: 'video-chain',
    data: { category: 'video-chain', relationText: '' },
  }
}

function videoChainWouldCycle(
  nodes: DirectorNode[],
  sourceVideoNodeId: string,
  targetVideoNodeId: string,
): boolean {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const seen = new Set<string>()
  let currentId: string | null = sourceVideoNodeId
  while (currentId) {
    if (currentId === targetVideoNodeId) return true
    if (seen.has(currentId)) return true
    seen.add(currentId)
    const current = byId.get(currentId)
    if (!current || !isVideoData(current.data)) return false
    currentId = current.data.videoChainInputId
  }
  return false
}

function chainFrameMatchesSource(
  frameUrl: string | null,
  source: VideoNodeData,
): boolean {
  const frame = usableFrameImageUrl(frameUrl)
  if (!frame || !source.videoClipId || !source.generationJobId) {
    return false
  }
  return (
    frame.includes(source.videoClipId) &&
    frame.includes(source.generationJobId)
  )
}

function isHydratedVideoTake(value: unknown): value is HydratedVideoTake {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const row = value as Record<string, unknown>
  const nullableString = (field: unknown) => field === null || typeof field === 'string'
  const nullableStatus = (field: unknown) =>
    field === null ||
    field === 'queued' ||
    field === 'pending' ||
    field === 'generating' ||
    field === 'completed' ||
    field === 'failed'
  const position =
    row.canvas_position === null ||
    (!!row.canvas_position &&
      typeof row.canvas_position === 'object' &&
      !Array.isArray(row.canvas_position) &&
      typeof (row.canvas_position as Record<string, unknown>).x === 'number' &&
      typeof (row.canvas_position as Record<string, unknown>).y === 'number')
  return (
    typeof row.id === 'string' &&
    typeof row.shot_id === 'string' &&
    typeof row.take_number === 'number' &&
    nullableString(row.take_label) &&
    (row.override === null ||
      (!!row.override && typeof row.override === 'object' && !Array.isArray(row.override))) &&
    position &&
    typeof row.is_final === 'boolean' &&
    nullableString(row.url) &&
    nullableString(row.thumbnail_url) &&
    nullableStatus(row.status) &&
    nullableString(row.latestJobId) &&
    nullableStatus(row.latestJobStatus) &&
    nullableString(row.latestJobError) &&
    nullableString(row.latestAttemptAt) &&
    nullableStatus(row.last_attempt_status) &&
    nullableString(row.last_attempt_error) &&
    nullableString(row.last_attempt_at) &&
    nullableString(row.created_at) &&
    nullableString(row.updated_at) &&
    (!isStandaloneVideoOwnerKey(row.shot_id) ||
      normalizeStandaloneVideoConfig(row.override) !== null)
  )
}
/**
 * `queued` predates the client-facing `generating` state and is the only legacy
 * status projection retained during hydration. A URL never overrides canonical
 * terminal status: failed attempts may deliberately retain their prior success.
 */
export function hydratedVideoStatus(row: HydratedVideoTake): DirectorVideoStatus {
  return row.status === 'queued' ? 'generating' : row.status
}

export function canRecoverGenerationAttempt(
  response: Pick<VideoGenerationResponse, 'retryable' | 'recoveryReceipt'>,
  recoveryAttempts: number,
  isCurrentAttempt: boolean,
): response is VideoGenerationResponse & { recoveryReceipt: string } {
  const receipt = response.recoveryReceipt
  return (
    isCurrentAttempt &&
    response.retryable === true &&
    recoveryAttempts < 3 &&
    typeof receipt === 'string' &&
    receipt.length <= 4096 &&
    /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(receipt)
  )
}


function makeVideoData(
  parentShotNodeId: string,
  takeIndex: number,
): VideoNodeData {
  return {
    kind: 'video',
    label: `take_v${takeIndex}`,
    parentShotNodeId,
    standaloneVideoKey: null,
    videoClipId: null,
    takeNumber: takeIndex,
    generationJobId: null,
    lastAttemptStatus: null,
    lastAttemptError: null,
    lastAttemptAt: null,
    createdAt: new Date().toISOString(),
    override: {},
    frameInputs: EMPTY_FRAME_INPUTS(),
    videoChainInputId: null,
    videoChainFrameUrl: null,
    videoUrl: null,
    thumbnailUrl: null,
    status: 'pending',
    errorMessage: null,
    final: false,
    stale: false,
    adherence: null,
  }
}

function makeStandaloneVideoData(
  standaloneVideoKey: string,
  config: StandaloneVideoConfig,
  takeIndex = 1,
): VideoNodeData {
  return {
    kind: 'video',
    label: 'Video',
    parentShotNodeId: null,
    standaloneVideoKey,
    videoClipId: null,
    takeNumber: takeIndex,
    generationJobId: null,
    lastAttemptStatus: null,
    lastAttemptError: null,
    lastAttemptAt: null,
    createdAt: new Date().toISOString(),
    override: config,
    frameInputs: EMPTY_FRAME_INPUTS(),
    videoChainInputId: null,
    videoChainFrameUrl: null,
    videoUrl: null,
    thumbnailUrl: null,
    status: 'pending',
    errorMessage: null,
    final: false,
    stale: false,
    adherence: null,
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
/** #asset-authority(2026-09-02 오너): 레퍼런스 배열은 [인물 시트..., 배경...] 순 — 서버가 역할별
 *  권위 절을 쓰려면 경계가 필요하다. 카운트를 URL 배열과 함께 보낸다. */
function resolveShotAssetRefs(data: ShotNodeData): { urls: string[]; characterRefCount: number; worldRefCount: number } {
  const store = useAssetStorageStore.getState()
  const urls: string[] = []
  let characterRefCount = 0
  for (const id of data.characterAssetIds) {
    const u = pickAssetImageUrl(store.getCharacter(id))
    if (u) {
      urls.push(u)
      characterRefCount += 1
    }
  }
  let worldRefCount = 0
  for (const id of data.worldAssetIds) {
    const u = pickAssetImageUrl(store.getWorld(id))
    if (u) {
      urls.push(u)
      worldRefCount += 1
    }
  }
  return { urls, characterRefCount, worldRefCount }
}

function resolveShotImageInputs(
  nodes: DirectorNode[],
  imageInputs: unknown,
): string[] {
  const urls: string[] = []
  for (const sourceNodeId of normalizeImageInputs(imageInputs)) {
    const url = resolveImageInputImageUrl(nodes, sourceNodeId)
    if (url) urls.push(url)
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

async function persistDirectorAssetImage(
  projectId: string,
  assetKind: 'character' | 'world',
  assetId: string,
  blobUrl: string,
): Promise<string | null> {
  try {
    const response = await fetch(blobUrl)
    const blob = await response.blob()
    const form = new FormData()
    form.append('projectId', projectId)
    form.append('type', 'director-asset')
    form.append('entityId', assetId)
    form.append('field', assetKind)
    form.append('file', blob, `${assetKind}-image.png`)
    const upload = await fetch('/api/assets/upload-image', {
      method: 'POST',
      body: form,
    })
    if (!upload.ok) return null
    const body = (await upload.json()) as { publicUrl?: unknown }
    return typeof body.publicUrl === 'string' ? body.publicUrl : null
  } catch {
    return null
  }
}

// ============================================================================
// ST-4: Video generation (I2V/T2V) helpers
// ============================================================================

const VIDEO_POLL_INTERVAL_MS = 5_000
const VIDEO_POLL_TIMEOUT_MS = 300_000
type GenerationLock = { key: string; token: symbol }

const generationLocks = new Map<string, symbol>()

function generationLockKey(projectId: string, shotNodeId: string) {
  return JSON.stringify([projectId, shotNodeId])
}

function acquireGenerationLock(projectId: string, shotNodeId: string): GenerationLock | null {
  const key = generationLockKey(projectId, shotNodeId)
  if (generationLocks.has(key)) return null
  const token = Symbol(key)
  generationLocks.set(key, token)
  return { key, token }
}

function releaseGenerationLock(lock: GenerationLock | null) {
  if (lock && generationLocks.get(lock.key) === lock.token) generationLocks.delete(lock.key)
}


/** director provider(kling/veo/local) → generate-video 라우트 provider(fal/local) 매핑 */
function toRouteProvider(p: DirectorVideoProvider): 'fal' | 'local' {
  return p === 'local' ? 'local' : 'fal'
}

// ============================================================================
// Thumbnail capture (Node 탭 영상 카드용)
// 서버 ffmpeg 불가(Vercel Hobby) → 클라이언트에서 <video>+<canvas>로 첫 프레임 캡처.
// CORS 차단 시 canvas 가 taint 되어 toBlob 이 throw → null 반환(graceful, 영상 재생엔 무영향).
// ============================================================================

/** 같은 노드 썸네일 중복 캡처 방지 (in-flight 가드). */
const thumbnailInFlight = new Set<string>()

type VideoCapturePosition = 'start' | 'end'

/** 영상 URL의 시작/끝 프레임을 JPEG Blob으로 캡처한다. 실패 시 null. */
async function captureVideoFrame(
  videoUrl: string,
  position: VideoCapturePosition,
): Promise<Blob | null> {
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
      try {
        video.removeAttribute('src')
        video.load()
      } catch {
        /* noop */
      }
      resolve(blob)
    }
    const timer = setTimeout(() => finish(null), 15_000)
    let metadataLoaded = false
    let seekStarted = false

    const seekToPosition = () => {
      if (seekStarted) return
      const duration = Number.isFinite(video.duration) ? video.duration : 0
      // A last-frame capture must never guess a position when metadata did not
      // provide a usable duration.
      if (position === 'end' && duration <= 0) {
        if (metadataLoaded) finish(null)
        return
      }
      const target =
        position === 'end'
          ? Math.max(0, duration - 0.15)
          : Math.min(0.1, (duration || 1) / 2)
      seekStarted = true
      if (target === 0) {
        grab()
        return
      }
      try {
        video.currentTime = target
      } catch {
        grab()
      }
    }

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

    video.onloadedmetadata = () => {
      metadataLoaded = true
      seekToPosition()
    }
    video.onloadeddata = () => {
      // 일부 코덱은 currentTime=0 프레임이 비어있어 살짝 seek 후 캡처.
      seekToPosition()
    }
    video.onseeked = grab
    video.onerror = () => finish(null)
    video.src = videoUrl
  })
}

/** 영상 카드용 기존 썸네일은 시작 프레임 동작을 유지한다. */
async function captureVideoThumbnail(videoUrl: string): Promise<Blob | null> {
  return captureVideoFrame(videoUrl, 'start')
}

async function captureVideoEndFrame(videoUrl: string): Promise<Blob | null> {
  return captureVideoFrame(videoUrl, 'end')
}

async function uploadVideoChainFrame(
  projectId: string,
  sourceVideoClipId: string,
  sourceGenerationJobId: string,
  blob: Blob,
): Promise<string | null> {
  if (!projectId || !sourceVideoClipId || !sourceGenerationJobId) return null
  try {
    const form = new FormData()
    form.append('projectId', projectId)
    form.append('type', 'video')
    form.append('entityId', sourceVideoClipId)
    form.append('field', 'chain_frame')
    form.append('generationJobId', sourceGenerationJobId)
    form.append('file', blob, `${sourceVideoClipId}_chain-frame.jpg`)
    const response = await fetch('/api/assets/upload-image', {
      method: 'POST',
      body: form,
    })
    if (!response.ok) return null
    const body = (await response.json().catch(() => ({}))) as { publicUrl?: unknown }
    return usableFrameImageUrl(body.publicUrl)
  } catch {
    return null
  }
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
            // prompt 는 쓰지 않는다(#F-005 2026-08-12). data.prompt 는 legacy 폴백 필드로,
            //   2eb25ea(07-21)가 sync 를 derivedPrompt 로 이관한 뒤 항상 '' 다 — 이 write-through
            //   가 writer 의 rich 프롬프트(shots.prompt)를 프로젝트 단위로 전량 지워 왔다
            //   (실측: director 도달 9/9 프로젝트 채움률 0% vs 미도달 19/19 100%).
            //   architecture §5 원칙1: 스테이지는 다른 스테이지의 생성물을 고치지 않는다 —
            //   shots.prompt 는 writer 파생물이고 director 의 사람 편집은 promptOverride
            //   (아직 DB 미영속, persist_manifest TODO(P4) 예약석) 소관이다.
          })
          .eq('project_id', projectId)
          .eq('shot_id', writerShotId)
        void invalidateShots(projectId) // 사물함 표시 — writer/editor 의 다음 읽기가 새로 받게
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
          void invalidateShots(projectId)
        } else if (isVideoData(node.data)) {
          if (!node.data.videoClipId) return
          const response = await fetch(
            `/api/director/video-takes/${encodeURIComponent(node.data.videoClipId)}`,
            {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ projectId, canvas_position: pos }),
            },
          )
          if (!response.ok) throw new Error(`HTTP ${response.status}`)
        }
      } catch (err) {
        console.error('[director-store] position DB save failed:', err)
        if (isVideoData(node.data)) {
          try {
            await getState().hydrateFromDb(projectId)
          } catch (hydrateErr) {
            console.error('[director-store] position rollback hydration failed:', hydrateErr)
          }
        }
      }
    }, 500),
  )
}

// #wiring-persistence (2026-08-31): 수동 연결(imageInputs/frameInputs/videoChain)의 DB
// write-through 스윅. 연결 편집은 진입점이 넓어(와이어링 3종·엣지 삭제·노드 삭제·해제)
// 개별 추적 대신 debounce 후 전체를 직렬화해 "직전 저장값과 달라진 행만" 쓴다.
// 노드 id 는 기기-로컬이라 안정 참조(wiring-persistence.ts)로 변환해 저장한다.
let pendingWiringSweep: ReturnType<typeof setTimeout> | null = null
const lastSavedWiringByKey = new Map<string, string>()

function scheduleWiringSweepToDb(getState: () => DirectorCanvasState) {
  if (pendingWiringSweep) clearTimeout(pendingWiringSweep)
  pendingWiringSweep = setTimeout(async () => {
    pendingWiringSweep = null
    const state = getState()
    const projectId = state.projectId
    if (!projectId) return
    const nodes = state.nodes
    try {
      const supabase = createClient()
      for (const node of nodes) {
        if (getState().projectId !== projectId) return
        if (isShotData(node.data) && node.data.writerShotId) {
          const stable = serializeImageInputs(
            nodes,
            normalizeImageInputs(node.data.imageInputs),
          )
          const key = `shot:${node.data.writerShotId}`
          const json = JSON.stringify(stable)
          if (lastSavedWiringByKey.get(key) === json) continue
          const { error } = await supabase
            .from('shots')
            .update({ image_inputs: stable as unknown as Json })
            .eq('project_id', projectId)
            .eq('shot_id', node.data.writerShotId)
          if (error) throw error
          lastSavedWiringByKey.set(key, json)
        } else if (isVideoData(node.data) && node.data.videoClipId) {
          const stableFrames = serializeFrameInputs(
            nodes,
            normalizeFrameInputs(node.data.frameInputs),
          )
          const framePayload = isEmptyStableFrameInputs(stableFrames)
            ? null
            : stableFrames
          const chainSource = node.data.videoChainInputId
            ? nodes.find((n) => n.id === node.data.videoChainInputId)
            : null
          const chainClipId =
            chainSource && isVideoData(chainSource.data)
              ? chainSource.data.videoClipId
              : null
          const chainPayload: StableVideoChain | null = chainClipId
            ? {
                source_clip_id: chainClipId,
                frame_url: node.data.videoChainFrameUrl,
              }
            : null
          const key = `clip:${node.data.videoClipId}`
          const json = JSON.stringify({ f: framePayload, c: chainPayload })
          if (lastSavedWiringByKey.get(key) === json) continue
          const response = await fetch(
            `/api/director/video-takes/${encodeURIComponent(node.data.videoClipId)}`,
            {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                projectId,
                frame_inputs: framePayload,
                video_chain: chainPayload,
              }),
            },
          )
          if (!response.ok) throw new Error(`HTTP ${response.status}`)
          lastSavedWiringByKey.set(key, json)
        }
      }
    } catch (err) {
      // fire-and-forget 계약(Step 2와 동일): 실패는 다음 연결 편집/스윅이 재시도한다.
      console.error('[director-store] wiring DB save failed:', err)
    }
  }, 500)
}

const pendingVideoClipSaves = new Map<string, ReturnType<typeof setTimeout>>()
const inFlightVideoClipSaves = new Map<string, Promise<void>>()
const pendingVideoFinalWrites = new Map<string, Promise<void>>()
const latestVideoFinalIntent = new Map<string, number>()
const latestVideoDeleteIntent = new Map<string, number>()
let hydrationEpoch = 0
type HydrationLocalSnapshot = {
  position: XYPosition
  label?: string
  override?: string
  final?: boolean
  storyboardImage?: string
}
const stableHydrationValue = (value: unknown): string => JSON.stringify(value) ?? ''
const snapshotHydrationLocals = (nodes: DirectorNode[]) =>
  new Map(
    nodes.map((node): [string, HydrationLocalSnapshot] => [
      node.id,
      {
        position: { ...node.position },
        ...(isVideoData(node.data)
          ? {
              label: node.data.label,
              override: stableHydrationValue(node.data.override),
              final: node.data.final,
            }
          : isShotData(node.data)
            ? { storyboardImage: stableHydrationValue(node.data.storyboardImage) }
            : {}),
      },
    ]),
  )
const positionMatchesHydrationSnapshot = (
  node: DirectorNode,
  snapshot: HydrationLocalSnapshot | undefined,
) =>
  !!snapshot &&
  node.position.x === snapshot.position.x &&
  node.position.y === snapshot.position.y
const videoFieldMatchesHydrationSnapshot = (
  node: DirectorNode,
  snapshot: HydrationLocalSnapshot | undefined,
  field: 'label' | 'override' | 'final',
) =>
  isVideoData(node.data) &&
  !!snapshot &&
  (field === 'label'
    ? node.data.label === snapshot.label
    : field === 'override'
      ? stableHydrationValue(node.data.override) === snapshot.override
      : node.data.final === snapshot.final)
const shotStoryboardMatchesHydrationSnapshot = (
  node: DirectorNode,
  snapshot: HydrationLocalSnapshot | undefined,
) =>
  isShotData(node.data) &&
  !!snapshot &&
  stableHydrationValue(node.data.storyboardImage) === snapshot.storyboardImage
const isStrictlyNewerAttempt = (localAttemptAt: string | null, canonicalAttemptAt: string | null) => {
  if (!localAttemptAt || !canonicalAttemptAt) return false
  const localTime = Date.parse(localAttemptAt)
  const canonicalTime = Date.parse(canonicalAttemptAt)
  return Number.isFinite(localTime) && Number.isFinite(canonicalTime) && localTime > canonicalTime
}

/** Persist a clip patch through the Director API rather than direct client DB writes. */
function debouncedVideoClipSaveToDb(
  videoClipId: string,
  projectId: string,
  getPatch: () => Record<string, unknown> | undefined,
  onFailure: () => Promise<void>,
) {
  const existing = pendingVideoClipSaves.get(videoClipId)
  if (existing) clearTimeout(existing)
  pendingVideoClipSaves.set(
    videoClipId,
    setTimeout(() => {
      pendingVideoClipSaves.delete(videoClipId)
      const previous =
        inFlightVideoClipSaves.get(videoClipId) ?? Promise.resolve()
      const operation = previous
        .catch(() => undefined)
        .then(async () => {
          const patch = getPatch()
          if (!patch) return
          const response = await fetch(
            `/api/director/video-takes/${encodeURIComponent(videoClipId)}`,
            {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ projectId, ...patch }),
            },
          )
          if (!response.ok) throw new Error(`HTTP ${response.status}`)
        })
        .catch(async (err) => {
          console.error('[director-store] video take save failed:', err)
          if (inFlightVideoClipSaves.get(videoClipId) === operation) {
            inFlightVideoClipSaves.delete(videoClipId)
          }
          try {
            await onFailure()
          } catch (hydrateErr) {
            console.error(
              '[director-store] video take rollback hydration failed:',
              hydrateErr,
            )
          }
        })
      inFlightVideoClipSaves.set(videoClipId, operation)
      void operation.finally(() => {
        if (inFlightVideoClipSaves.get(videoClipId) === operation) {
          inFlightVideoClipSaves.delete(videoClipId)
        }
      })
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
  // 뷰포트 최초 초기화 여부. false → Node 뷰 최초 진입에서 fitView,
  //   true → 마지막 뷰포트 복원. 프로젝트별 완료 표시는 persist해 새로고침 때도
  //   Node 진입 애니메이션이 반복되지 않게 한다.
  viewportInitialized: boolean
  /** 프로젝트별 Node 첫 진입 애니메이션 완료 여부. */
  viewportInitializedProjects: Record<string, boolean>
  viewMode: 'node' | 'storyboard'
  /** Storyboard 뷰 미디어 모드(#previz-video) — Previz(목각, 기본) | Real(실사). 상단바 토글이 제어. */
  storyboardMediaMode: 'previz' | 'real'
  /** #ledger: 씬별 상태 장부(scenes.stage.ledger) — hydrate 때 DB 에서 읽는다. 화면 파생 전용. */
  sceneLedgers: Record<string, SceneLedger>
  // #real-grid-auto: 실사 일괄 생성 진행 중 — 개별 이미지 생성/재생성을 잠근다(시트 단위 작업과 충돌 방지).
  realBatchBusy: boolean
  /** #batch-backlog(2026-08-25): 일괄 생성에서 아직 fal 에 제출되지 않고 우리 서버 라운드를
   *  기다리는 샷 수 — 배치 라우트 응답의 remaining 을 러너가 흘려 넣는다. 진행 알림바가
   *  "fal 에 들어간 것만"이 아니라 배치 전체 작업량을 분모로 보여주기 위한 화면 파생값
   *  (DB 에 저장하지 않는다, architecture §0). null = 배치 비활성 또는 아직 1라운드 응답 전. */
  realBatchRemaining: number | null
  /** Explicit full-video batch progress. Ephemeral UI state; never persisted. */
  videoBatchBusy: boolean
  videoBatchProgress: { done: number; total: number; failed: number } | null

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

  // undo/redo 히스토리 (런타임, 비영속). references/legacy 체인만 재구성하며
  // editable asset Image 설정은 일반 노드처럼 스냅샷에 포함한다.
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
  setStoryboardMediaMode: (m: 'previz' | 'real') => void

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
  /** 부모 Shot 없이 자체 설정과 영속 clip을 소유하는 Video 노드 생성. */
  addStandaloneVideo: (position: XYPosition) => Promise<string | null>

  updateNodeData: <K extends DirectorNodeKind>(
    id: string,
    patch: Partial<Extract<DirectorNodeData, { kind: K }>>,
  ) => void
  deleteNode: (id: string) => Promise<void>

  // edge lifecycle
  addEdge: (
    source: string,
    target: string,
    data: DirectorEdgeData,
    sourceHandle?: string | null,
    targetHandle?: string | null,
  ) => string | null
  deleteEdge: (id: string) => void
  /**
   * Artist 에셋(asset-storage) → 프로젝트당 하나의 editable Image와 참조 엣지를 재조정한다.
   * Character/Background는 같은 Image 카드 외형을 쓰고 역할 라벨만 다르다.
   */
  rebuildAssetNodes: () => void
  /** Persisted Shot imageInputs에서 유효한 image 엣지를 멱등 재생성한다. */
  rebuildImageEdges: () => void
  /** Persisted Video frameInputs에서 유효한 frame 엣지를 멱등 재생성한다. */
  rebuildFrameEdges: () => void
  /** Persisted Video chain inputs에서 last-frame chain 엣지를 멱등 재생성한다. */
  rebuildVideoChainEdges: () => void
  /**
   * Shot 체인 파생 노드/엣지 재생성(#previz-chain 2026-07-22, 멱등) —
   * writerShotId 있는 Shot 마다 SHOT IMAGE(우측) 노드를 만들고
   * Shot→ShotImage→Video 직선 체인 엣지로 배선한다(2026-07-27: previz 영상 단계 제거).
   * 해당 Shot 의 기존 Shot→Video parent 엣지는 체인으로 대체(제거)된다.
   */
  rebuildShotChainNodes: () => void
  /** 미사용 에셋 표시 토글 — 켜면 좌상단에 참조되지 않은 character/world 노드를 추가 */
  toggleUnusedAssets: () => void
  /** 현재 노드/엣지 스냅샷을 히스토리에 기록 (변경 직전 호출, suppress 중엔 무시) */
  commitHistory: () => void
  undo: () => void
  redo: () => void

  // video specific
  /** Shot당 1개 강제 enforce (결정 #11) */
  setVideoFinal: (videoNodeId: string, final: boolean) => Promise<void>
  setVideoStatus: (
    videoNodeId: string,
    status: DirectorVideoStatus,
    payload?: { url?: string; thumbnailUrl?: string; error?: string },
  ) => void
  applyVideoOverride: (videoNodeId: string, override: VideoOverride) => void

  // storyboard image (ST-2, I2I)
  /** 단일 Shot의 storyboardImage를 I2I로 생성 (asset 자동 결합 + prompt) */
  generateStoryboardImage: (
    shotNodeId: string,
    options?: DirectorGenerationRequestOptions,
  ) => Promise<GenerationJobReceipt | null>
  /** Artist 원본을 reference로 쓰는 editable Image 템플릿을 생성/재생성한다. */
  generateAssetImage: (assetNodeId: string) => Promise<boolean>
  /** 모든 Shot의 storyboardImage 일괄 생성 (씬 순서대로). 영상 생성은 포함 안 함 (결정 #40) */
  generateAllStoryboardImages: () => Promise<void>

  // video generation (ST-4, I2V/T2V) — 항상 사용자 클릭으로만 (결정 #40)
  /** Shot에 새 Video take 생성 + 영상 생성 API 호출(+폴링). storyboardImage 있으면 I2V. 생성된 Video 노드 id 반환 */
  generateVideoForShot: (
    shotNodeId: string,
    options?: DirectorGenerationRequestOptions,
  ) => Promise<string | null>
  /** 기존 Video 노드 1개를 effective 설정으로 (재)생성 (D-5). 마더 Shot storyboardImage 있으면 I2V.
   *  반환 false = 생성 대기열(쿼터) 초과로 시작하지 못함(#e5) — 노드는 pending으로 되돌려짐. */
  regenerateVideo: (
    videoNodeId: string,
    heldLock?: GenerationLock,
    options?: DirectorGenerationRequestOptions,
  ) => Promise<boolean>

  // prompt node (Higgsfield식 분리 프롬프트)
  /** Prompt 노드 추가 (캔버스 보조 노드). 생성된 노드 id 반환 */
  addPromptNode: (position?: XYPosition, text?: string) => string
  /** Prompt 노드를 Shot T 입력에 와이어링 — prompt 엣지 추가 + 대상 Shot.promptOverride 동기 */
  wirePromptToShot: (promptNodeId: string, shotNodeId: string) => void
  /** 이미지 소스를 Shot image-reference 입력에 수동 와이어링한다. */
  wireImageToShot: (
    sourceNodeId: string,
    shotNodeId: string,
    targetHandle: DirectorImageTargetHandle,
  ) => void
  /** 이미지 소스를 Video START/END/REF 입력에 수동 와이어링한다. */
  wireFrameToVideo: (
    sourceNodeId: string,
    videoNodeId: string,
    targetHandle: DirectorVideoFrameTargetHandle,
  ) => void
  /** Completed Video의 마지막 프레임을 다음 Video START 이미지로 연결한다. */
  wireVideoChainToVideo: (
    sourceVideoNodeId: string,
    targetVideoNodeId: string,
    targetHandle: DirectorVideoChainTargetHandle,
  ) => Promise<boolean>

  // playback + thumbnail (ST-4 후속 — Node 탭 영상 재생)
  /** single-play 토글 — 이 노드만 재생, 나머지 Video 는 자동 정지. id=null 이면 전부 정지 */
  setPlayingNode: (id: string | null) => void
  /** Video 노드에 썸네일이 없으면 영상 첫 프레임을 캡처 → Storage 업로드 → thumbnail_url 영속 */
  ensureVideoThumbnail: (videoNodeId: string) => Promise<void>

  // propagation (Shot 설정 변경 → 자식 Video stale)
  propagateStaleFromShot: (shotNodeId: string) => void

  // selection
  selectNode: (id: string | null) => void
  selectEdge: (id: string | null) => void

  // popups / modals
  openPopup: (id: string) => void
  closePopup: () => void
  openDeleteConfirm: (id: string) => void
  closeDeleteConfirm: () => void
  confirmDelete: () => Promise<void>
  openRelationModal: (
    source: string,
    target: string,
    sourceHandle?: string | null,
    targetHandle?: string | null,
  ) => void
  closeRelationModal: () => void

  // agentic — D-7 Meeting Room tool-use
  applyUpdates: (
    updates: DirectorCanvasUpdate[],
    options?: DirectorGenerationRequestOptions,
  ) => DirectorCanvasUpdateResult

  reset: () => void
}

// ============================================================================
// Agent Actions — DirectorCanvasUpdate
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
  // #c5 (2026-08-27): 진입 자동 실사 생성을 끄면서 채팅 경로를 열었다. id 를 주면 그 샷만,
  //   생략하면 미생성 전체를 일괄로 — 버튼과 같은 경로(generateStoryboardImage / runRealBatch)를 탄다.
  | { type: 'generateImage'; id?: string }
  | {
      type: 'connect'
      sourceId: string
      targetId: string
      category: 'relates-to'
      relationText?: string
    }
  | {
      type: 'connectFrame'
      sourceId: string
      targetId: string
      targetHandle: DirectorVideoFrameTargetHandle
    }
  | {
      type: 'connectVideo'
      sourceId: string
      targetId: string
      targetHandle: DirectorVideoChainTargetHandle
    }
  | {
      type: 'connectImage'
      sourceId: string
      targetId: string
      targetHandle: DirectorImageTargetHandle
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

export function effectivePrompt(
  data: Pick<ShotNodeData, 'prompt' | 'derivedPrompt' | 'promptOverride'>,
): string {
  return data.promptOverride ?? data.derivedPrompt ?? data.prompt ?? ''
}

/** Video 노드의 최종 생성 설정. Shot-backed는 상속, standalone은 자체 설정을 쓴다. */
export function getEffectiveVideoConfig(
  state: Pick<DirectorCanvasState, 'nodes'>,
  videoNodeId: string,
): {
  prompt: string
  camera: CameraConfig
  lighting: LightingConfig
  cameraPreset: CameraPreset
  provider: DirectorVideoProvider
  durationSeconds: number
} | null {
  const video = state.nodes.find((n) => n.id === videoNodeId)
  if (!video || !isVideoData(video.data)) return null
  if (video.data.parentShotNodeId === null) {
    return normalizeStandaloneVideoConfig(video.data.override)
  }
  const mother = state.nodes.find((n) => n.id === video.data.parentShotNodeId)
  if (!mother || !isShotData(mother.data)) return null
  const m = mother.data
  const o = video.data.override
  return {
    prompt: o.prompt ?? effectivePrompt(m),
    camera: o.camera ?? m.camera,
    lighting: o.lighting ?? m.lighting,
    cameraPreset: o.cameraPreset ?? m.cameraPreset,
    provider: o.provider ?? m.provider,
    durationSeconds: m.durationSeconds,
  }
}

function videoOwnerKey(data: VideoNodeData): string {
  return data.parentShotNodeId ?? data.standaloneVideoKey
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

/** 진입 시 진행 중인 잡이 있으면 마지막 탭보다 생성 화면을 우선 복원한다. */
async function restoreActiveGenerationView(projectId: string): Promise<void> {
  if (typeof window === 'undefined' || !projectId || projectId === 'default') return
  try {
    const response = await fetch(
      `/api/generation/active?projectId=${encodeURIComponent(projectId)}`,
    )
    if (!response.ok) return
    const body: unknown = await response.json()
    const rawJobs =
      body && typeof body === 'object' && (body as { data?: unknown }).data
        ? (body as { data: { jobs?: unknown } }).data.jobs
        : null
    if (!Array.isArray(rawJobs)) return
    const kinds = new Set(
      rawJobs
        .filter(
          (job): job is { kind: string } =>
            !!job &&
            typeof job === 'object' &&
            typeof (job as { kind?: unknown }).kind === 'string',
        )
        .map((job) => job.kind),
    )
    const real =
      kinds.has('storyboard_real_grid') ||
      kinds.has('shot_storyboard') ||
      kinds.has('shot_video')
    const previz = kinds.has('shot_rough_storyboard')
    if (!real && !previz) return
    const current = useDirectorCanvasStore.getState()
    if (current.projectId !== projectId) return
    current.setViewMode('storyboard')
    current.setStoryboardMediaMode(real ? 'real' : 'previz')
  } catch {
    // 진행 상태 조회 실패는 마지막 탭 복원을 방해하지 않는다.
  }
}

export const useDirectorCanvasStore = create<DirectorCanvasState>()(
  persist(
    (set, get) => ({
      nodes: initialNodes,
      edges: initialEdges,
      selectedNodeId: null,
      selectedEdgeId: null,
      viewport: { x: 0, y: 0, zoom: 1 },
      viewportInitialized: false,
      viewportInitializedProjects: {},
      viewMode: 'node',
      storyboardMediaMode: 'previz',
      sceneLedgers: {},
      realBatchBusy: false,
      realBatchRemaining: null,
      videoBatchBusy: false,
      videoBatchProgress: null,
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
          resetPipelineProgressBatches()
          const previous = get()
          const viewportInitializedProjects = { ...previous.viewportInitializedProjects }
          if (previous.projectId !== 'default' && previous.viewportInitialized) {
            viewportInitializedProjects[previous.projectId] = true
          }
          hydrationEpoch += 1
          set({
            projectId,
            nodes: initialNodes,
            edges: initialEdges,
            selectedNodeId: null,
            selectedEdgeId: null,
            viewportInitialized: viewportInitializedProjects[projectId] === true,
            viewportInitializedProjects,
            // #first-entry-node(2026-08-27 오너): 이 브라우저가 처음 보는 프로젝트는 Node 뷰
            //   (+미디어 모드 기본 previz)에서 출발한다 — persist 키가 전역이라 직전 프로젝트의
            //   storyboard 탭이 새 프로젝트 최초 진입을 덮던 것. 재진입은 종전대로 마지막 뷰 유지.
            ...(viewportInitializedProjects[projectId] === true
              ? {}
              : { viewMode: 'node' as const, storyboardMediaMode: 'previz' as const }),
            popupNodeId: null,
            deleteConfirmInfo: null,
            relationModal: null,
            videoBatchBusy: false,
            videoBatchProgress: null,
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
        void restoreActiveGenerationView(projectId)
      },
      setViewport: (vp) => set({ viewport: vp }),
      setViewMode: (m) => set({ viewMode: m }),
      setStoryboardMediaMode: (m) => set({ storyboardMediaMode: m }),

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
        // asset 컬럼·previz 체인을 새 위치 기준으로 재배치 (둘 다 파생 — 멱등 재생성)
        get().rebuildAssetNodes()
        get().rebuildShotChainNodes()
      },

      hydrateFromDb: async (projectId) => {
        if (!projectId || get().projectId !== projectId) return
        const hydrationToken = ++hydrationEpoch
        const localSnapshot = snapshotHydrationLocals(get().nodes)
        try {
          const supabase = createClient()
          const [scenesRes, shotsRes, clipsRes] = await Promise.all([
            supabase
              .from('scenes')
              .select('scene_id, canvas_position, stage')
              .eq('project_id', projectId),
            loadShotsResult(projectId),
            fetch(`/api/director/video-takes?projectId=${encodeURIComponent(projectId)}`).then(
              async (response) => {
                if (!response.ok) throw new Error(`video takes HTTP ${response.status}`)
                const body: unknown = await response.json()
                const rawTakes =
                  body && typeof body === 'object'
                    ? (body as Record<string, unknown>).takes
                    : null
                if (!Array.isArray(rawTakes) || !rawTakes.every(isHydratedVideoTake)) {
                  throw new Error('Invalid video takes payload')
                }
                return { data: rawTakes }
              },
            ),
          ])
          if (scenesRes.error) throw scenesRes.error
          if (shotsRes.error) throw shotsRes.error

          const scenePosBySceneId = new Map<string, { x: number; y: number }>()
          const sceneLedgers: Record<string, SceneLedger> = {}
          for (const r of scenesRes.data ?? []) {
            const p = r.canvas_position as { x: number; y: number } | null
            if (p && r.scene_id) scenePosBySceneId.set(r.scene_id, p)
            // #ledger: 씬 무대의 상태 장부 — Director 누락 목록("변화를 보여주는 샷 없음")의 원천.
            const stage = (r as { stage?: unknown }).stage
            const ledger = stage && typeof stage === 'object' ? (stage as { ledger?: SceneLedger }).ledger : undefined
            if (ledger && r.scene_id) sceneLedgers[r.scene_id] = ledger
          }
          if (get().projectId === projectId) set({ sceneLedgers })
          const shotPosByShotId = new Map<string, { x: number; y: number }>()
          for (const r of shotsRes.data ?? []) {
            const p = r.canvas_position as { x: number; y: number } | null
            if (p && r.shot_id) shotPosByShotId.set(r.shot_id, p)
          }
          // DB is canonical. Apply one current-project snapshot so an older response cannot
          // leak cached media, positions, or takes into a subsequently selected project.
          const storyboardByShotId = new Map<string, ShotNodeData['storyboardImage'] | null>()
          for (const r of shotsRes.data ?? []) {
            if (r.shot_id) {
              storyboardByShotId.set(
                r.shot_id,
                (r.storyboard_image as ShotNodeData['storyboardImage'] | null) ?? null,
              )
            }
          }
          // #wiring-persistence: DB에 저장된 안정 참조 연결. 노드 재구성 후 resolve 해 복원한다.
          const stableImageInputsByShotId = new Map<string, StableWiringRef[]>()
          for (const r of shotsRes.data ?? []) {
            if (r.shot_id) {
              stableImageInputsByShotId.set(
                r.shot_id,
                parseStableImageInputs((r as { image_inputs?: unknown }).image_inputs),
              )
            }
          }
          const stableFrameByClipId = new Map<string, StableFrameInputs | null>()
          const stableChainByClipId = new Map<string, StableVideoChain | null>()
          for (const row of clipsRes.data ?? []) {
            const clipId = row.id as string
            if (!clipId) continue
            stableFrameByClipId.set(
              clipId,
              parseStableFrameInputs((row as { frame_inputs?: unknown }).frame_inputs),
            )
            stableChainByClipId.set(
              clipId,
              parseStableVideoChain((row as { video_chain?: unknown }).video_chain),
            )
          }
          const liveSceneIds = new Set(
            (scenesRes.data ?? []).map((row) => row.scene_id as string).filter(Boolean),
          )
          const liveShotIds = new Set(
            (shotsRes.data ?? []).map((row) => row.shot_id as string).filter(Boolean),
          )
          const liveClipIds = new Set(
            (clipsRes.data ?? []).map((row) => row.id as string).filter(Boolean),
          )

          set((s) => {
            if (s.projectId !== projectId || hydrationEpoch !== hydrationToken) return {}

            // writer-backed scene/shot nodes are canonical. Nodes without a writer
            // backing ID are the explicitly supported local-only canvas nodes.
            let nodes = s.nodes
              .filter((node) => {
                if (isSceneData(node.data) && node.data.writerSceneId) {
                  return liveSceneIds.has(node.data.writerSceneId)
                }
                if (isShotData(node.data) && node.data.writerShotId) {
                  return liveShotIds.has(node.data.writerShotId)
                }
                return !isVideoData(node.data) ||
                  node.data.lastAttemptStatus === 'generating' ||
                  (node.data.videoClipId !== null && liveClipIds.has(node.data.videoClipId))
              })
              .map((n) => {
                if (isSceneData(n.data) && n.data.writerSceneId) {
                  const p = scenePosBySceneId.get(n.data.writerSceneId)
                  return p && positionMatchesHydrationSnapshot(n, localSnapshot.get(n.id))
                    ? { ...n, position: { x: p.x, y: p.y } }
                    : n
                }
                if (isShotData(n.data) && n.data.writerShotId) {
                  const p = shotPosByShotId.get(n.data.writerShotId)
                  return {
                    ...n,
                    position:
                      p && positionMatchesHydrationSnapshot(n, localSnapshot.get(n.id))
                        ? { x: p.x, y: p.y }
                        : n.position,
                    data: {
                      ...n.data,
                      imageInputs: normalizeImageInputs(n.data.imageInputs),
                      storyboardImage: shotStoryboardMatchesHydrationSnapshot(
                        n,
                        localSnapshot.get(n.id),
                      )
                        ? storyboardByShotId.get(n.data.writerShotId) ?? null
                        : n.data.storyboardImage,
                    },
                  } as DirectorNode
                }
                return n
              })
            const seenClipIds = new Set<string>()
            nodes = nodes.filter((node) => {
              if (!isVideoData(node.data) || !node.data.videoClipId) return true
              if (seenClipIds.has(node.data.videoClipId)) return false
              seenClipIds.add(node.data.videoClipId)
              return true
            })
            const retainedNodeIds = new Set(nodes.map((node) => node.id))
            let edges = s.edges.filter(
              (edge) => retainedNodeIds.has(edge.source) && retainedNodeIds.has(edge.target),
            )

            for (const row of clipsRes.data ?? []) {
              const clipId = row.id as string
              if (!clipId) continue
              const standaloneConfig = isStandaloneVideoOwnerKey(row.shot_id)
                ? normalizeStandaloneVideoConfig(row.override)
                : null
              const parentShot = standaloneConfig
                ? null
                : nodes.find(
                    (n) =>
                      isShotData(n.data) &&
                      n.data.writerShotId === row.shot_id,
                  ) ?? null
              const existingIndex = nodes.findIndex(
                (n) => isVideoData(n.data) && n.data.videoClipId === clipId,
              )
              const dbPos = row.canvas_position as { x: number; y: number } | null
              if (existingIndex >= 0) {
                const existingNode = nodes[existingIndex]
                if (!isVideoData(existingNode.data)) continue
                const snapshot = localSnapshot.get(existingNode.id)
                const canonicalAttemptAt =
                  row.latestAttemptAt ?? row.last_attempt_at ?? row.updated_at ?? null
                const preserveLocalAttempt =
                  existingNode.data.lastAttemptStatus === 'generating' &&
                  existingNode.data.generationJobId !== null &&
                  row.latestJobId !== existingNode.data.generationJobId &&
                  isStrictlyNewerAttempt(existingNode.data.lastAttemptAt, canonicalAttemptAt)
                const preserveLocalFinal =
                  !videoFieldMatchesHydrationSnapshot(existingNode, snapshot, 'final') ||
                  pendingVideoFinalWrites.has(
                    `${projectId}:${videoOwnerKey(existingNode.data)}`,
                  )
                const preserveLocalOverride =
                  pendingVideoClipSaves.has(clipId) ||
                  inFlightVideoClipSaves.has(clipId) ||
                  !videoFieldMatchesHydrationSnapshot(
                    existingNode,
                    snapshot,
                    'override',
                  )
                nodes[existingIndex] = {
                  ...existingNode,
                  position:
                    dbPos && positionMatchesHydrationSnapshot(existingNode, snapshot)
                      ? { x: dbPos.x, y: dbPos.y }
                      : existingNode.position,
                  data: {
                    ...existingNode.data,
                    label: videoFieldMatchesHydrationSnapshot(existingNode, snapshot, 'label')
                      ? (row.take_label as string) ?? `take_v${row.take_number}`
                      : existingNode.data.label,
                    takeNumber: (row.take_number as number) ?? existingNode.data.takeNumber,
                    override: preserveLocalOverride
                      ? existingNode.data.override
                      : standaloneConfig ?? (row.override as VideoOverride) ?? {},
                    parentShotNodeId: standaloneConfig
                      ? null
                      : parentShot?.id ?? existingNode.data.parentShotNodeId,
                    standaloneVideoKey: standaloneConfig
                      ? row.shot_id
                      : parentShot
                        ? null
                        : existingNode.data.standaloneVideoKey,
                    final: preserveLocalFinal
                      ? existingNode.data.final
                      : (row.is_final as boolean) ?? false,
                    videoUrl: (row.url as string) ?? null,
                    thumbnailUrl: (row.thumbnail_url as string) ?? null,
                    status: preserveLocalAttempt ? existingNode.data.status : hydratedVideoStatus(row),
                    generationJobId: preserveLocalAttempt
                      ? existingNode.data.generationJobId
                      : row.latestJobId ?? null,
                    lastAttemptStatus: preserveLocalAttempt
                      ? existingNode.data.lastAttemptStatus
                      : row.latestJobStatus ??
                        (row.last_attempt_status === 'queued'
                          ? 'generating'
                          : row.last_attempt_status),
                    lastAttemptError: preserveLocalAttempt
                      ? existingNode.data.lastAttemptError
                      : row.latestJobError ?? row.last_attempt_error ?? null,
                    lastAttemptAt: preserveLocalAttempt
                      ? existingNode.data.lastAttemptAt
                      : row.latestAttemptAt ?? row.last_attempt_at ?? row.updated_at ?? null,
                    createdAt: row.created_at ?? existingNode.data.createdAt,
                    // #adherence P2: DB 판정이 있으면 채택(재검사 결과 수렴), 없으면 로컬 유지
                    adherence: (row.adherence as VideoAdherence | null) ?? existingNode.data.adherence ?? null,
                  },
                } as DirectorNode
                if (standaloneConfig) {
                  edges = edges.filter(
                    (edge) =>
                      edge.target !== existingNode.id ||
                      (edge.data?.category !== 'parent' &&
                        edge.data?.category !== 'chain'),
                  )
                }
                continue
              }

              if (!standaloneConfig && !parentShot) continue
              const takeIndex =
                (row.take_number as number) ??
                (parentShot ? nextTakeIndex({ ...s, nodes }, parentShot.id) : 1)
              const data = standaloneConfig
                ? makeStandaloneVideoData(row.shot_id, standaloneConfig, takeIndex)
                : makeVideoData(parentShot!.id, takeIndex)
              data.videoClipId = clipId
              data.label = (row.take_label as string) ?? data.label
              data.takeNumber = takeIndex
              data.generationJobId = row.latestJobId ?? null
              data.lastAttemptStatus = row.latestJobStatus ?? (row.last_attempt_status === 'queued' ? 'generating' : row.last_attempt_status)
              data.lastAttemptError = row.latestJobError ?? row.last_attempt_error ?? null
              data.lastAttemptAt = row.latestAttemptAt ?? row.last_attempt_at ?? row.updated_at ?? null
              data.createdAt = row.created_at ?? data.createdAt
              data.override = standaloneConfig ?? (row.override as VideoOverride) ?? {}
              data.final = (row.is_final as boolean) ?? false
              data.videoUrl = (row.url as string) ?? null
              data.thumbnailUrl = (row.thumbnail_url as string) ?? null
              data.status = hydratedVideoStatus(row)
              data.adherence = (row.adherence as VideoAdherence | null) ?? null
              const id = newDirectorId('dn')
              nodes = [...nodes, {
                id,
                type: 'video',
                position: dbPos
                  ? { x: dbPos.x, y: dbPos.y }
                  : standaloneConfig
                    ? { x: 80, y: 80 }
                    : nextVideoPosition({ ...s, nodes }, parentShot!.id),
                data,
              }]
              if (parentShot) {
                edges = [...edges, {
                  id: newDirectorId('de'),
                  source: parentShot.id,
                  target: id,
                  sourceHandle: 'right',
                  targetHandle: 'left',
                  type: 'parent',
                  data: { category: 'parent', relationText: '' },
                }]
              }
            }

            return { nodes, edges, lastSavedAt: Date.now() }
          })
          // hydrate 로 Video 노드 집합이 바뀌었을 수 있음 — previz 체인 엣지 재배선(멱등).
          get().rebuildShotChainNodes()
          // #wiring-persistence: DB 안정 참조 → 현재 노드 id 복원. 파생 노드(rebuild)가 생긴 뒤에
          //   resolve 해야 shotImage 참조가 맞는다. DB가 빈 값이면 로컬 유지(미저장 편집 보존 —
          //   아래 스윅이 백필한다). DB 값이 있으면 DB가 진실(새 기기에서의 복원 경로).
          set((s) => {
            if (s.projectId !== projectId || hydrationEpoch !== hydrationToken) return {}
            const allNodes = s.nodes
            let changed = false
            const nodes = allNodes.map((node) => {
              if (isShotData(node.data) && node.data.writerShotId) {
                const stable = stableImageInputsByShotId.get(node.data.writerShotId)
                if (!stable || stable.length === 0) return node
                const resolved = resolveImageInputs(allNodes, stable)
                const local = normalizeImageInputs(node.data.imageInputs)
                if (
                  resolved.length === local.length &&
                  resolved.every((v, i) => v === local[i])
                ) {
                  return node
                }
                changed = true
                return {
                  ...node,
                  data: { ...node.data, imageInputs: resolved },
                } as DirectorNode
              }
              if (isVideoData(node.data) && node.data.videoClipId) {
                const stableF = stableFrameByClipId.get(node.data.videoClipId) ?? null
                const stableC = stableChainByClipId.get(node.data.videoClipId) ?? null
                let data = node.data
                let touched = false
                if (stableF) {
                  const resolved = resolveFrameInputs(allNodes, stableF)
                  const local = normalizeFrameInputs(data.frameInputs)
                  if (
                    resolved.start !== local.start ||
                    resolved.end !== local.end ||
                    resolved.refs.length !== local.refs.length ||
                    resolved.refs.some((v, i) => v !== local.refs[i])
                  ) {
                    data = { ...data, frameInputs: resolved }
                    touched = true
                  }
                }
                if (stableC) {
                  const sourceNode = allNodes.find(
                    (n) =>
                      isVideoData(n.data) &&
                      n.data.videoClipId === stableC.source_clip_id,
                  )
                  if (
                    sourceNode &&
                    (data.videoChainInputId !== sourceNode.id ||
                      data.videoChainFrameUrl !== stableC.frame_url)
                  ) {
                    data = {
                      ...data,
                      videoChainInputId: sourceNode.id,
                      videoChainFrameUrl: stableC.frame_url,
                    }
                    touched = true
                  }
                }
                if (!touched) return node
                changed = true
                return { ...node, data } as DirectorNode
              }
              return node
            })
            return changed ? { nodes, lastSavedAt: Date.now() } : {}
          })
          // 스윅 캐시 시드 — DB와 같은 값을 다시 쓰지 않게. 로컬 우위로 달라진 항목은
          //   캐시 미스가 나 아래 스윅이 자연스럽게 백필한다.
          for (const [shotId, stable] of stableImageInputsByShotId) {
            lastSavedWiringByKey.set(`shot:${shotId}`, JSON.stringify(stable))
          }
          for (const [clipId, stableF] of stableFrameByClipId) {
            lastSavedWiringByKey.set(
              `clip:${clipId}`,
              JSON.stringify({ f: stableF, c: stableChainByClipId.get(clipId) ?? null }),
            )
          }
          scheduleWiringSweepToDb(get)
          // 파생 Shot Image 노드가 다시 만들어진 뒤 persisted frameInputs를 엣지로 복원한다.
          get().rebuildFrameEdges()
          // 파생 Image/Asset 노드가 다시 만들어진 뒤 persisted imageInputs를 엣지로 복원한다.
          get().rebuildImageEdges()
          // Video data is canonical for previous-video links; restore their edges last.
          get().rebuildVideoChainEdges()
          set((s) => {
            const sourceById = new Map(
              s.nodes
                .filter((node) => isVideoData(node.data))
                .map((node) => [node.id, node.data as VideoNodeData]),
            )
            return {
              nodes: s.nodes.map((node) => {
                if (!isVideoData(node.data) || !node.data.videoChainInputId) return node
                const source = sourceById.get(node.data.videoChainInputId)
                return source &&
                  chainFrameMatchesSource(node.data.videoChainFrameUrl, source)
                  ? node
                  : ({ ...node, data: { ...node.data, stale: true } } as DirectorNode)
              }),
              lastSavedAt: Date.now(),
            }
          })
        } catch (err) {
          console.error('[director-store] hydrateFromDb failed:', err)
          throw err
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
        // 체인 샷이면 parent 엣지를 샷 체인(ShotImage→Video)으로 즉시 전환.
        get().rebuildShotChainNodes()

        return id
      },

      addStandaloneVideo: async (position) => {
        if (isDemoSession()) return null
        const projectId = get().projectId
        if (!projectId) return null
        const response = await fetch('/api/director/video-takes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId, canvasPosition: position }),
        })
        const body = (await response.json().catch(() => ({}))) as {
          error?: string
          take?: Record<string, unknown>
        }
        if (!response.ok) {
          throw new Error(body.error ?? `HTTP ${response.status}`)
        }
        if (get().projectId !== projectId) return null
        const take = body.take
        const clipId = take?.id
        const ownerKey = take?.shot_id
        const config = normalizeStandaloneVideoConfig(take?.override)
        if (
          typeof clipId !== 'string' ||
          !isStandaloneVideoOwnerKey(ownerKey) ||
          !config
        ) {
          throw new Error('Invalid standalone video take response')
        }
        const existing = get().nodes.find(
          (node) =>
            isVideoData(node.data) && node.data.videoClipId === clipId,
        )
        if (existing) {
          set({
            selectedNodeId: existing.id,
            selectedEdgeId: null,
            historyPast: [],
            historyFuture: [],
          })
          return existing.id
        }
        const takeNumber =
          typeof take?.take_number === 'number' && take.take_number > 0
            ? take.take_number
            : 1
        const data = makeStandaloneVideoData(ownerKey, config, takeNumber)
        data.videoClipId = clipId
        data.label =
          typeof take?.take_label === 'string' && take.take_label.trim()
            ? take.take_label
            : 'Video'
        data.createdAt =
          typeof take?.created_at === 'string' ? take.created_at : data.createdAt
        const node: DirectorNode = {
          id: newDirectorId('dn'),
          type: 'video',
          position,
          data,
        }
        set((s) => ({
          nodes: [...s.nodes, node],
          selectedNodeId: node.id,
          selectedEdgeId: null,
          historyPast: [],
          historyFuture: [],
          lastSavedAt: Date.now(),
        }))
        return node.id
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
        // 대상 Shot의 사용자 prompt override 동기 (writer sync derivedPrompt 불가침)
        api.updateNodeData<'shot'>(shotNodeId, { promptOverride: text })
      },

      wireImageToShot: (sourceNodeId, shotNodeId, targetHandle) => {
        if (isDemoSession()) return
        if (targetHandle !== 'image-reference') return
        const state = get()
        const sourceNode = state.nodes.find((node) => node.id === sourceNodeId)
        const shotNode = state.nodes.find((node) => node.id === shotNodeId)
        if (
          !sourceNode ||
          !shotNode ||
          sourceNodeId === shotNodeId ||
          !isImageSourceNode(sourceNode) ||
          !isShotData(shotNode.data)
        ) {
          return
        }

        const currentInputs = normalizeImageInputs(shotNode.data.imageInputs)
        const hasInput = currentInputs.includes(sourceNodeId)
        const expectedEdgeId = imageEdgeId(sourceNodeId, shotNodeId)
        const hasExpectedEdge = state.edges.some(
          (edge) =>
            edge.id === expectedEdgeId &&
            edge.data?.category === 'image' &&
            edge.source === sourceNodeId &&
            edge.target === shotNodeId &&
            edge.targetHandle === targetHandle,
        )
        if (hasInput && hasExpectedEdge) return

        get().commitHistory()
        set((s) => {
          const edges = [
            ...s.edges.filter(
              (edge) =>
                !(
                  edge.data?.category === 'image' &&
                  edge.source === sourceNodeId &&
                  edge.target === shotNodeId
                ),
            ),
            makeImageEdge(sourceNodeId, shotNodeId),
          ]
          return {
            nodes: s.nodes.map((node) =>
              node.id === shotNodeId && isShotData(node.data)
                ? ({
                    ...node,
                    data: {
                      ...node.data,
                      imageInputs: currentInputs.includes(sourceNodeId)
                        ? currentInputs
                        : [...currentInputs, sourceNodeId],
                      stale:
                        node.data.storyboardImage?.status === 'completed'
                          ? true
                          : node.data.stale,
                    },
                  } as DirectorNode)
                : node,
            ),
            edges,
            lastSavedAt: Date.now(),
          }
        })
        scheduleWiringSweepToDb(get)
      },

      wireFrameToVideo: (sourceNodeId, videoNodeId, targetHandle) => {
        if (isDemoSession()) return
        if (
          targetHandle !== 'frame-start' &&
          targetHandle !== 'frame-end' &&
          targetHandle !== 'frame-ref'
        ) {
          return
        }
        const state = get()
        const sourceNode = state.nodes.find((node) => node.id === sourceNodeId)
        const videoNode = state.nodes.find((node) => node.id === videoNodeId)
        if (
          !sourceNode ||
          !videoNode ||
          sourceNodeId === videoNodeId ||
          !isFrameSourceNode(sourceNode) ||
          !isVideoData(videoNode.data)
        ) {
          return
        }

        const currentInputs = normalizeFrameInputs(videoNode.data.frameInputs)
        const existingEdge = state.edges.find(
          (edge) =>
            edge.data?.category === 'frame' &&
            edge.source === sourceNodeId &&
            edge.target === videoNodeId &&
            edge.targetHandle === targetHandle,
        )
        const slot = targetHandle === 'frame-start'
          ? 'start'
          : targetHandle === 'frame-end'
            ? 'end'
            : 'refs'
        const alreadyWired =
          existingEdge &&
          (slot === 'refs'
            ? currentInputs.refs.includes(sourceNodeId)
            : currentInputs[slot] === sourceNodeId)
        if (alreadyWired) return

        get().commitHistory()
        set((s) => {
          const currentVideo = s.nodes.find((node) => node.id === videoNodeId)
          const frameInputs = normalizeFrameInputs(
            currentVideo && isVideoData(currentVideo.data)
              ? currentVideo.data.frameInputs
              : currentInputs,
          )
          const nextInputs: VideoNodeData['frameInputs'] = {
            ...frameInputs,
            ...(slot === 'start' ? { start: sourceNodeId } : {}),
            ...(slot === 'end' ? { end: sourceNodeId } : {}),
            ...(slot === 'refs' && !frameInputs.refs.includes(sourceNodeId)
              ? { refs: [...frameInputs.refs, sourceNodeId] }
              : {}),
          }
          const edges = s.edges.filter((edge) => {
            if (edge.data?.category !== 'frame' || edge.target !== videoNodeId) {
              return true
            }
            if (slot === 'refs') {
              return !(
                edge.targetHandle === targetHandle &&
                edge.source === sourceNodeId
              )
            }
            return edge.targetHandle !== targetHandle
          })
          const hasTargetEdge = edges.some(
            (edge) =>
              edge.data?.category === 'frame' &&
              edge.source === sourceNodeId &&
              edge.target === videoNodeId &&
              edge.targetHandle === targetHandle,
          )
          if (!hasTargetEdge) {
            edges.push(makeFrameEdge(sourceNodeId, videoNodeId, targetHandle))
          }

          return {
            nodes: s.nodes.map((node) =>
              node.id === videoNodeId && isVideoData(node.data)
                ? ({
                    ...node,
                    data: {
                      ...node.data,
                      frameInputs: nextInputs,
                      stale:
                        node.data.status === 'completed' || node.data.videoUrl
                          ? true
                          : node.data.stale,
                    },
                  } as DirectorNode)
                : node,
            ),
            edges,
            lastSavedAt: Date.now(),
          }
        })
        scheduleWiringSweepToDb(get)
      },

      wireVideoChainToVideo: async (sourceVideoNodeId, targetVideoNodeId, targetHandle) => {
        if (isDemoSession() || targetHandle !== 'video-chain') return false
        const initial = get()
        const sourceNode = initial.nodes.find((node) => node.id === sourceVideoNodeId)
        const targetNode = initial.nodes.find((node) => node.id === targetVideoNodeId)
        const sourceClipId =
          sourceNode && isVideoData(sourceNode.data)
            ? usableFrameImageUrl(sourceNode.data.videoClipId)
            : null
        const sourceJobId =
          sourceNode && isVideoData(sourceNode.data)
            ? usableFrameImageUrl(sourceNode.data.generationJobId)
            : null
        const sourceVideoUrl =
          sourceNode && isVideoData(sourceNode.data)
            ? usableFrameImageUrl(sourceNode.data.videoUrl)
            : null
        if (
          !sourceNode ||
          !targetNode ||
          sourceVideoNodeId === targetVideoNodeId ||
          !isVideoData(sourceNode.data) ||
          !isVideoData(targetNode.data) ||
          sourceNode.data.status !== 'completed' ||
          !sourceVideoUrl ||
          !sourceClipId ||
          !sourceJobId ||
          videoChainWouldCycle(initial.nodes, sourceVideoNodeId, targetVideoNodeId)
        ) {
          return false
        }
        get().commitHistory()
        set((s) => ({
          nodes: s.nodes.map((node) =>
            node.id === targetVideoNodeId && isVideoData(node.data)
              ? ({
                  ...node,
                  data: {
                    ...node.data,
                    videoChainInputId: sourceVideoNodeId,
                    videoChainFrameUrl: null,
                    stale: true,
                    errorMessage: null,
                    lastAttemptError: null,
                  },
                } as DirectorNode)
              : node,
          ),
          edges: [
            ...s.edges.filter(
              (edge) =>
                edge.data?.category !== 'video-chain' ||
                edge.target !== targetVideoNodeId,
            ),
            makeVideoChainEdge(sourceVideoNodeId, targetVideoNodeId),
          ],
          generationErrors: { ...s.generationErrors, [targetVideoNodeId]: '' },
          lastSavedAt: Date.now(),
        }))

        const projectId = get().projectId
        const failure = (message: string): false => {
          const current = get()
          if (current.projectId !== projectId) return false
          const target = current.nodes.find((node) => node.id === targetVideoNodeId)
          if (
            !target ||
            !isVideoData(target.data) ||
            target.data.videoChainInputId !== sourceVideoNodeId
          ) {
            return false
          }
          set((s) => ({
            nodes: s.nodes.map((node) =>
              node.id === targetVideoNodeId && isVideoData(node.data)
                ? ({
                    ...node,
                    data: {
                      ...node.data,
                      videoChainInputId: null,
                      videoChainFrameUrl: null,
                      lastAttemptError: message,
                      errorMessage: message,
                    },
                  } as DirectorNode)
                : node,
            ),
            edges: s.edges.filter(
              (edge) =>
                !(
                  edge.data?.category === 'video-chain' &&
                  edge.target === targetVideoNodeId
                ),
            ),
            generationErrors: { ...s.generationErrors, [targetVideoNodeId]: message },
            lastSavedAt: Date.now(),
          }))
          scheduleWiringSweepToDb(get)
          return false
        }

        let blob: Blob | null
        try {
          blob = await captureVideoEndFrame(sourceVideoUrl)
        } catch {
          blob = null
        }
        if (!blob) {
          return failure(
            translate(
              useLocaleStore.getState().locale,
              'Unable to capture the source video last frame.',
            ),
          )
        }
        const publicUrl = await uploadVideoChainFrame(projectId, sourceClipId, sourceJobId, blob)
        if (!publicUrl) {
          return failure(
            translate(
              useLocaleStore.getState().locale,
              'Unable to upload the source video last frame.',
            ),
          )
        }

        const latestSource = get().nodes.find((node) => node.id === sourceVideoNodeId)
        const latestTarget = get().nodes.find((node) => node.id === targetVideoNodeId)
        if (
          get().projectId !== projectId ||
          !latestSource ||
          !latestTarget ||
          !isVideoData(latestSource.data) ||
          !isVideoData(latestTarget.data) ||
          latestSource.data.videoClipId !== sourceClipId ||
          latestSource.data.generationJobId !== sourceJobId ||
          latestSource.data.videoUrl !== sourceVideoUrl ||
          latestSource.data.status !== 'completed' ||
          latestTarget.data.videoChainInputId !== sourceVideoNodeId
        ) {
          return failure(
            translate(
              useLocaleStore.getState().locale,
              'The source video changed while its last frame was captured.',
            ),
          )
        }
        set((s) => ({
          nodes: s.nodes.map((node) =>
            node.id === targetVideoNodeId && isVideoData(node.data)
              ? ({
                  ...node,
                  data: { ...node.data, videoChainFrameUrl: publicUrl },
                } as DirectorNode)
              : node,
          ),
          lastSavedAt: Date.now(),
        }))
        scheduleWiringSweepToDb(get)
        return true
      },

      updateNodeData: (id, patch) => {
        if (isDemoSession()) return
        const prev = get().nodes.find((n) => n.id === id)
        if (!prev) return
        if (isVideoData(prev.data)) {
          if (
            'parentShotNodeId' in patch ||
            'standaloneVideoKey' in patch
          ) {
            return
          }
          if (
            prev.data.parentShotNodeId === null &&
            'override' in patch &&
            normalizeStandaloneVideoConfig(
              (patch as Partial<VideoNodeData>).override,
            ) === null
          ) {
            return
          }
        }
        // 노드 데이터 수정은 undo 대상에서 제외 — generateStoryboardImage 등 생성 결과도
        // 이 경로로 들어와 history를 오염시키기 때문. undo는 드래그/추가/삭제/연결/정렬만.

        // Shot 생성 설정 변경 시 prompt/camera/lighting/cameraPreset/provider 변경이면 자식 Video stale
        const shotConfigKeys: (keyof ShotNodeData)[] = [
          'prompt',
          'derivedPrompt',
          'promptOverride',
          'camera',
          'lighting',
          'cameraPreset',
          'provider',
          'generationMethod',
          'referenceImages',
          'characterAssetIds',
          'worldAssetIds',
        ]
        const shotPatch = patch as Partial<ShotNodeData>
        // 주: storyboardImage는 제외 — 생성 status 전이(generating/failed)마다 stale 전파되는
        // 것을 피하기 위함. "새 storyboardImage → 자식 Video stale"은 ST-4에서 명시 처리.
        const isShotConfigChange =
          isShotData(prev.data) &&
          shotConfigKeys.some((k) => k in shotPatch && prev.data[k] !== shotPatch[k])

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

        const previousVideoData = isVideoData(prev.data) ? prev.data : null
        const videoPatch = patch as Partial<VideoNodeData>
        const sourceAttemptChanged =
          !!previousVideoData &&
          (('generationJobId' in patch &&
            videoPatch.generationJobId !== previousVideoData.generationJobId) ||
            ('videoUrl' in patch && videoPatch.videoUrl !== previousVideoData.videoUrl) ||
            ('status' in patch && videoPatch.status !== previousVideoData.status))
        if (sourceAttemptChanged) {
          const source = get().nodes.find((node) => node.id === id)
          if (source && isVideoData(source.data)) {
            const sourceData = source.data
            set((s) => ({
              nodes: s.nodes.map((node) =>
                isVideoData(node.data) &&
                node.data.videoChainInputId === id &&
                (!chainFrameMatchesSource(node.data.videoChainFrameUrl, sourceData) ||
                  sourceAttemptChanged)
                  ? ({
                      ...node,
                      data: {
                        ...node.data,
                        stale: true,
                        videoChainFrameUrl: null,
                        errorMessage: translate(
                          useLocaleStore.getState().locale,
                          'Previous video chain frame is unavailable.',
                        ),
                      },
                    } as DirectorNode)
                  : node,
              ),
              lastSavedAt: Date.now(),
            }))
          }
        }

        if (isShotConfigChange) {
          get().propagateStaleFromShot(id)
        }

        // Step 0 (unify-director-store-db): camera/lighting/cameraPreset 변경을
        // DB shots로 write-through (캐넌 일원화). writerShotId 있는 노드만 — 수동생성 노드는 Step 2까지 skip.
        //   'prompt' 는 제외(#F-005) — legacy 필드('' 고정)가 writer 산출 컬럼을 지우던 회귀.
        const dbCols: (keyof ShotNodeData)[] = [
          'camera',
          'lighting',
          'cameraPreset',
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
        if (isVideoData(prev.data) && ('label' in patch || 'override' in patch)) {
          const node = get().nodes.find((n) => n.id === id)
          if (node && isVideoData(node.data) && node.data.videoClipId) {
            const clipId = node.data.videoClipId
            debouncedVideoClipSaveToDb(
              clipId,
              get().projectId,
              () => {
                const current = get().nodes.find((n) => n.id === id)
                if (!current || !isVideoData(current.data)) return undefined
                return {
                  ...('label' in patch ? { take_label: current.data.label } : {}),
                  ...('override' in patch ? { override: current.data.override } : {}),
                }
              },
              () => get().hydrateFromDb(get().projectId),
            )
          }
        }
      },

      deleteNode: async (id) => {
        if (isDemoSession()) return
        get().commitHistory()
        const projectId = get().projectId
        const deleteKey = `${projectId}:${id}`
        const intent = (latestVideoDeleteIntent.get(deleteKey) ?? 0) + 1
        latestVideoDeleteIntent.set(deleteKey, intent)
        const ids = collectCascadeIds(get().nodes, id)
        const removedNodes = get().nodes.filter((node) => ids.has(node.id))
        const removedEdges = get().edges.filter(
          (edge) => ids.has(edge.source) || ids.has(edge.target),
        )
        const removedFrameEdges = removedEdges.filter(
          (edge) => edge.data?.category === 'frame',
        )
        const clipIdsToDelete = removedNodes.flatMap((node) =>
          isVideoData(node.data) && node.data.videoClipId ? [node.data.videoClipId] : [],
        )
        const sceneIdsToDelete = removedNodes.flatMap((node) =>
          isSceneData(node.data) && node.data.writerSceneId ? [node.data.writerSceneId] : [],
        )
        const shotIdsToDelete = removedNodes.flatMap((node) =>
          isShotData(node.data) && node.data.writerShotId ? [node.data.writerShotId] : [],
        )

        set((s) => ({
          nodes: s.nodes
            .filter((node) => !ids.has(node.id))
            .map((node) => {
              if (isShotData(node.data)) {
                const imageInputs = normalizeImageInputs(node.data.imageInputs)
                const nextImageInputs = imageInputs.filter(
                  (sourceId) => !ids.has(sourceId),
                )
                if (nextImageInputs.length !== imageInputs.length) {
                  return {
                    ...node,
                    data: {
                      ...node.data,
                      imageInputs: nextImageInputs,
                      stale:
                        node.data.storyboardImage?.status === 'completed'
                          ? true
                          : node.data.stale,
                    },
                  } as DirectorNode
                }
              }
              if (!isVideoData(node.data)) return node
              const chainCleared =
                node.data.videoChainInputId &&
                ids.has(node.data.videoChainInputId)
              const incomingRemoved = removedFrameEdges.filter(
                (edge) => edge.target === node.id,
              )
              if (incomingRemoved.length === 0 && !chainCleared) return node
              const frameInputs = normalizeFrameInputs(node.data.frameInputs)
              const nextInputs = incomingRemoved.reduce(
                (inputs, edge) => {
                  if (edge.targetHandle === 'frame-start' && inputs.start === edge.source) {
                    return { ...inputs, start: null }
                  }
                  if (edge.targetHandle === 'frame-end' && inputs.end === edge.source) {
                    return { ...inputs, end: null }
                  }
                  if (edge.targetHandle === 'frame-ref') {
                    return {
                      ...inputs,
                      refs: inputs.refs.filter((sourceId) => sourceId !== edge.source),
                    }
                  }
                  return inputs
                },
                frameInputs,
              )
              return {
                ...node,
                data: {
                  ...node.data,
                  frameInputs: nextInputs,
                  ...(chainCleared
                    ? {
                        videoChainInputId: null,
                        videoChainFrameUrl: null,
                      }
                    : {}),
                  stale:
                    chainCleared ||
                    node.data.status === 'completed' ||
                    node.data.videoUrl
                      ? true
                      : node.data.stale,
                },
              } as DirectorNode
            }),
          edges: s.edges.filter((edge) => !ids.has(edge.source) && !ids.has(edge.target)),
          selectedNodeId: s.selectedNodeId && ids.has(s.selectedNodeId) ? null : s.selectedNodeId,
          lastSavedAt: Date.now(),
        }))
        // 삭제된 샷의 previz 체인 파생 노드 정리 (부모 없는 파생은 rebuild 가 재생성 안 함)
        get().rebuildShotChainNodes()
        // Source deletion can leave a target's persisted chain relation without an edge.
        get().rebuildVideoChainEdges()
        // #wiring-persistence: 소스 삭제로 정리된 입력들을 DB에 반영한다.
        scheduleWiringSweepToDb(get)

        try {
          await Promise.all(
            clipIdsToDelete.map(async (clipId) => {
              const response = await fetch(
                `/api/director/video-takes/${encodeURIComponent(clipId)}`,
                {
                  method: 'DELETE',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ projectId }),
                },
              )
              if (!response.ok) throw new Error(`HTTP ${response.status}`)
            }),
          )
          const supabase = createClient()
          if (projectId && shotIdsToDelete.length > 0) {
            const { error } = await supabase
              .from('shots')
              .delete()
              .eq('project_id', projectId)
              .in('shot_id', shotIdsToDelete)
            if (error) throw error
            void invalidateShots(projectId)
          }
          if (projectId && sceneIdsToDelete.length > 0) {
            const { error } = await supabase
              .from('scenes')
              .delete()
              .eq('project_id', projectId)
              .in('scene_id', sceneIdsToDelete)
            if (error) throw error
          }
        } catch (error) {
          if (
            latestVideoDeleteIntent.get(deleteKey) === intent &&
            get().projectId === projectId
          ) {
            // Restore only removed entities, preserving edits made after this optimistic delete.
            set((s) => ({
              nodes: [
                ...s.nodes,
                ...removedNodes.filter((node) => !s.nodes.some((current) => current.id === node.id)),
              ],
              edges: [
                ...s.edges,
                ...removedEdges.filter((edge) => !s.edges.some((current) => current.id === edge.id)),
              ],
              generationErrors: {
                ...s.generationErrors,
                [id]: error instanceof Error ? error.message : 'Video take deletion failed',
              },
              lastSavedAt: Date.now(),
            }))
            try {
              await get().hydrateFromDb(projectId)
            } catch (hydrateError) {
              console.error('[director-store] delete reconciliation failed:', hydrateError)
            }
          }
          throw error
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

      rebuildImageEdges: () => {
        set((s) => {
          const nodeById = new Map(s.nodes.map((node) => [node.id, node]))
          const imageEdges: DirectorEdge[] = []
          const seen = new Set<string>()

          const nodes = s.nodes.map((node) => {
            if (!isShotData(node.data)) return node
            const imageInputs = normalizeImageInputs(node.data.imageInputs)
            for (const sourceNodeId of imageInputs) {
              if (sourceNodeId === node.id) continue
              const sourceNode = nodeById.get(sourceNodeId)
              if (!sourceNode || !isImageSourceNode(sourceNode)) continue
              const key = `${sourceNodeId}:${node.id}`
              if (seen.has(key)) continue
              seen.add(key)
              imageEdges.push(makeImageEdge(sourceNodeId, node.id))
            }
            return {
              ...node,
              data: { ...node.data, imageInputs },
            } as DirectorNode
          })

          return {
            nodes,
            edges: [
              ...s.edges.filter((edge) => edge.data?.category !== 'image'),
              ...imageEdges,
            ],
            lastSavedAt: Date.now(),
          }
        })
      },

      rebuildFrameEdges: () => {
        set((s) => {
          const nodeById = new Map(s.nodes.map((node) => [node.id, node]))
          const frameEdges: DirectorEdge[] = []
          const seen = new Set<string>()

          const nodes = s.nodes.map((node) => {
            if (!isVideoData(node.data)) return node
            const frameInputs = normalizeFrameInputs(node.data.frameInputs)
            const addFrameEdge = (
              sourceNodeId: string | null,
              targetHandle: DirectorVideoFrameTargetHandle,
            ) => {
              if (!sourceNodeId || sourceNodeId === node.id) return
              const sourceNode = nodeById.get(sourceNodeId)
              if (!sourceNode || !isFrameSourceNode(sourceNode)) return
              const key = `${sourceNodeId}:${node.id}:${targetHandle}`
              if (seen.has(key)) return
              seen.add(key)
              frameEdges.push(makeFrameEdge(sourceNodeId, node.id, targetHandle))
            }

            addFrameEdge(frameInputs.start, 'frame-start')
            addFrameEdge(frameInputs.end, 'frame-end')
            for (const sourceNodeId of frameInputs.refs) {
              addFrameEdge(sourceNodeId, 'frame-ref')
            }

            return {
              ...node,
              data: { ...node.data, frameInputs },
            } as DirectorNode
          })

          return {
            nodes,
            edges: [
              ...s.edges.filter((edge) => edge.data?.category !== 'frame'),
              ...frameEdges,
            ],
            lastSavedAt: Date.now(),
          }
        })
      },

      rebuildVideoChainEdges: () => {
        set((s) => {
          const nodeById = new Map(s.nodes.map((node) => [node.id, node]))
          const chainEdges: DirectorEdge[] = []
          const nodes = s.nodes.map((node) => {
            if (!isVideoData(node.data)) return node
            const sourceId = node.data.videoChainInputId
            if (!sourceId || sourceId === node.id) {
              return sourceId || node.data.videoChainFrameUrl
                ? ({
                    ...node,
                    data: {
                      ...node.data,
                      videoChainInputId: null,
                      videoChainFrameUrl: null,
                      stale: true,
                    },
                  } as DirectorNode)
                : node
            }
            const source = nodeById.get(sourceId)
            if (
              !source ||
              !isVideoData(source.data) ||
              videoChainWouldCycle(s.nodes, sourceId, node.id)
            ) {
              return {
                ...node,
                data: {
                  ...node.data,
                  videoChainInputId: null,
                  videoChainFrameUrl: null,
                  stale: true,
                },
              } as DirectorNode
            }
            chainEdges.push(makeVideoChainEdge(sourceId, node.id))
            const frameValid = chainFrameMatchesSource(
              node.data.videoChainFrameUrl,
              source.data,
            )
            return frameValid
              ? node
              : ({
                  ...node,
                  data: {
                    ...node.data,
                    videoChainFrameUrl: null,
                    stale: true,
                  },
                } as DirectorNode)
          })

          return {
            nodes,
            edges: [
              ...s.edges.filter((edge) => edge.data?.category !== 'video-chain'),
              ...chainEdges,
            ],
            lastSavedAt: Date.now(),
          }
        })
      },

      rebuildAssetNodes: () => {
        const assetStore = useAssetStorageStore.getState()
        set((s) => {
          // 1) upstream 연결은 다시 계산하되 Director에서 편집한 이미지 설정/결과는 보존한다.
          const existingAssets = new Map<string, DirectorNode>()
          for (const node of s.nodes) {
            if (!isAssetData(node.data)) continue
            const key = `${node.data.assetKind}:${node.data.assetId}`
            const current = existingAssets.get(key)
            const hasDirectorResult =
              node.data.imageUrl !==
              (node.data.sourceImageUrl ?? node.data.imageUrl)
            if (!current || hasDirectorResult) existingAssets.set(key, node)
          }
          const nodes = s.nodes.filter((n) => !isAssetData(n.data))
          const edges = s.edges.filter((e) => e.data?.category !== 'references')

          // 토글 ON: 이 프로젝트에 등록된 전체 에셋(미사용 후보)도 표시한다.
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

          // 2) 프로젝트 전체 Shot에서 쓰는 에셋을 dedup한다. 한 에셋은 Image 한 장만 가진다.
          const shots = nodes.filter(
            (node): node is DirectorNode =>
              isShotData(node.data),
          )
          const charIds: string[] = []
          const worldIds: string[] = []
          for (const shot of shots) {
            if (!isShotData(shot.data)) continue
            for (const id of shot.data.characterAssetIds) {
              if (!charIds.includes(id) && assetStore.getCharacter(id)) {
                charIds.push(id)
              }
            }
            for (const id of shot.data.worldAssetIds) {
              if (!worldIds.includes(id) && assetStore.getWorld(id)) {
                worldIds.push(id)
              }
            }
          }
          const unusedCharIds = allCharIds.filter((id) => !charIds.includes(id))
          const unusedWorldIds = allWorldIds.filter(
            (id) => !worldIds.includes(id),
          )

          const anchors = [...shots, ...nodes.filter((node) => isSceneData(node.data))]
          const baseX =
            (anchors.length > 0
              ? Math.min(...anchors.map((node) => node.position.x))
              : 400) - ASSET_OFFSET_X
          let y =
            anchors.length > 0
              ? Math.min(...anchors.map((node) => node.position.y))
              : 80
          const assetNodeIdByKey = new Map<string, string>()
          const make = (
            assetId: string,
            kind: 'character' | 'world',
            unused: boolean,
          ) => {
            const key = `${kind}:${assetId}`
            const reg =
              kind === 'character'
                ? assetStore.getCharacter(assetId)
                : assetStore.getWorld(assetId)
            const existing = existingAssets.get(key)
            const previousData =
              existing && isAssetData(existing.data) ? existing.data : null
            const sourceImageUrl = pickAssetImageUrl(reg)
            const previousSource =
              previousData?.sourceImageUrl ?? previousData?.imageUrl ?? null
            const imageUrl =
              previousData && previousData.imageUrl !== previousSource
                ? previousData.imageUrl
                : sourceImageUrl
            const id = `dn_asset_${kind}_${assetId}`
            nodes.push({
              id,
              type: 'asset',
              position: existing?.position ?? { x: baseX, y },
              draggable: false,
              selectable: true,
              data: {
                kind: 'asset',
                assetKind: kind,
                assetId,
                label: previousData?.label ?? reg?.name ?? assetId,
                sourceImageUrl,
                imageUrl,
                prompt:
                  previousData?.prompt ??
                  reg?.prompt ??
                  reg?.description ??
                  '',
                referenceImages: previousData?.referenceImages ?? [],
                imageModel: previousData?.imageModel,
                generationStatus:
                  previousData?.generationStatus === 'generating'
                    ? 'pending'
                    : previousData?.generationStatus ?? 'pending',
                generationError: previousData?.generationError ?? null,
                locked: false,
                ...(unused ? { unused: true } : {}),
              },
            })
            if (!unused) assetNodeIdByKey.set(key, id)
            y += ASSET_OFFSET_Y
          }
          for (const id of charIds) make(id, 'character', false)
          for (const id of unusedCharIds) make(id, 'character', true)
          for (const id of worldIds) make(id, 'world', false)
          for (const id of unusedWorldIds) make(id, 'world', true)

          // 3) 공통 Image 출력에서 참조하는 모든 Shot으로 edge를 잇는다.
          for (const shot of shots) {
            if (!isShotData(shot.data)) continue
            const refs = [
              ...shot.data.characterAssetIds.map(
                (id) => `character:${id}`,
              ),
              ...shot.data.worldAssetIds.map((id) => `world:${id}`),
            ]
            for (const key of refs) {
              const assetNodeId = assetNodeIdByKey.get(key)
              if (!assetNodeId) continue
              edges.push({
                id: `de_ref_${assetNodeId}_${shot.id}`,
                source: assetNodeId,
                target: shot.id,
                sourceHandle: 'right',
                targetHandle: 'left',
                type: 'references',
                data: { category: 'references', relationText: '' },
              })
            }
          }

          return { nodes, edges, lastSavedAt: Date.now() }
        })
        get().rebuildFrameEdges()
        get().rebuildImageEdges()
        get().rebuildVideoChainEdges()
      },

      rebuildShotChainNodes: () => {
        // #node-merge(2026-08-31 오너 대공사): 파생 SHOT IMAGE/플레이스홀더 카드 제거 —
        //   실사 이미지는 Shot(이미지 노드) 카드가 직접 표시하고, 체인은 Shot→Video 직결.
        //   구 persist 쟔재(shotImage/videoPlaceholder 노드)는 여기서 멱등 정리된다.
        set((s) => {
          const nodes = s.nodes.filter(
            (n) => !isShotImageData(n.data) && !isVideoPlaceholderData(n.data),
          )
          let edges = s.edges.filter((e) => e.data?.category !== 'chain')

          // 체인 대상: writer 파이프라인 샷(writerShotId 有)만 — 수동 노드는 기존 직결(parent) 유지.
          const chainShots = nodes.filter(
            (n) => isShotData(n.data) && !!n.data.writerShotId,
          )
          if (chainShots.length === 0) return { nodes, edges, lastSavedAt: Date.now() }

          const chainShotIds = new Set(chainShots.map((n) => n.id))
          const videoNodeIds = new Set(
            nodes.filter((n) => isVideoData(n.data)).map((n) => n.id),
          )
          edges = edges.filter(
            (e) =>
              !(
                e.data?.category === 'parent' &&
                chainShotIds.has(e.source) &&
                videoNodeIds.has(e.target)
              ),
          )

          const chainEdge = (id: string, source: string, target: string): DirectorEdge => ({
            id,
            source,
            target,
            sourceHandle: 'right',
            targetHandle: 'left',
            type: 'chain',
            data: { category: 'chain', relationText: '' },
          })

          for (const shot of chainShots) {
            for (const v of nodes) {
              if (!isVideoData(v.data) || v.data.parentShotNodeId !== shot.id) continue
              edges.push(chainEdge(`de_chain_${shot.id}_${v.id}`, shot.id, v.id))
            }
          }

          return { nodes, edges, lastSavedAt: Date.now() }
        })
        get().rebuildFrameEdges()
        get().rebuildImageEdges()
        get().rebuildVideoChainEdges()
      },

      deleteEdge: (id) => {
        if (isDemoSession()) return
        const removedEdge = get().edges.find((edge) => edge.id === id)
        set((s) => ({
          nodes:
            removedEdge?.data?.category === 'video-chain'
              ? s.nodes.map((node) => {
                  if (
                    node.id !== removedEdge.target ||
                    !isVideoData(node.data) ||
                    node.data.videoChainInputId !== removedEdge.source
                  ) {
                    return node
                  }
                  return {
                    ...node,
                    data: {
                      ...node.data,
                      videoChainInputId: null,
                      videoChainFrameUrl: null,
                      stale: true,
                    },
                  } as DirectorNode
                })
              : removedEdge?.data?.category === 'frame'
              ? s.nodes.map((node) => {
                  if (
                    node.id !== removedEdge.target ||
                    !isVideoData(node.data)
                  ) {
                    return node
                  }
                  const frameInputs = normalizeFrameInputs(node.data.frameInputs)
                  const nextInputs: VideoNodeData['frameInputs'] =
                    removedEdge.targetHandle === 'frame-start'
                      ? {
                          ...frameInputs,
                          start:
                            frameInputs.start === removedEdge.source
                              ? null
                              : frameInputs.start,
                        }
                      : removedEdge.targetHandle === 'frame-end'
                        ? {
                            ...frameInputs,
                            end:
                              frameInputs.end === removedEdge.source
                                ? null
                                : frameInputs.end,
                          }
                        : removedEdge.targetHandle === 'frame-ref'
                          ? {
                              ...frameInputs,
                              refs: frameInputs.refs.filter(
                                (sourceId) => sourceId !== removedEdge.source,
                              ),
                            }
                          : frameInputs
                  return {
                    ...node,
                    data: { ...node.data, frameInputs: nextInputs },
                  } as DirectorNode
                })
              : removedEdge?.data?.category === 'image'
                ? s.nodes.map((node) => {
                    if (
                      node.id !== removedEdge.target ||
                      !isShotData(node.data) ||
                      removedEdge.targetHandle !== 'image-reference'
                    ) {
                      return node
                    }
                    const imageInputs = normalizeImageInputs(node.data.imageInputs)
                    if (!imageInputs.includes(removedEdge.source)) return node
                    return {
                      ...node,
                      data: {
                        ...node.data,
                        imageInputs: imageInputs.filter(
                          (sourceId) => sourceId !== removedEdge.source,
                        ),
                        stale:
                          node.data.storyboardImage?.status === 'completed'
                            ? true
                            : node.data.stale,
                      },
                    } as DirectorNode
                  })
              : s.nodes,
          edges: s.edges.filter((e) => e.id !== id),
          selectedEdgeId: s.selectedEdgeId === id ? null : s.selectedEdgeId,
          lastSavedAt: Date.now(),
        }))
        // #wiring-persistence: frame/image/video-chain 해제도 DB에 반영한다.
        if (
          removedEdge?.data?.category === 'frame' ||
          removedEdge?.data?.category === 'image' ||
          removedEdge?.data?.category === 'video-chain'
        ) {
          scheduleWiringSweepToDb(get)
        }
      },

      // ─── video ─────────────────────────────────────────────────────────

      setVideoFinal: (videoNodeId, final) => {
        const video = get().nodes.find((node) => node.id === videoNodeId)
        if (!video || !isVideoData(video.data)) {
          return Promise.reject(new Error('Video take not found'))
        }
        if (final && (!video.data.videoUrl || video.data.status !== 'completed')) {
          return Promise.reject(new Error('Only completed playable videos can be Final'))
        }

        const clipId = video.data.videoClipId
        const projectId = get().projectId
        if (!clipId || !projectId) {
          return Promise.reject(new Error('Video take is not persisted'))
        }
        const ownerKey = videoOwnerKey(video.data)
        const queueKey = `${projectId}:${ownerKey}`
        const intent = (latestVideoFinalIntent.get(queueKey) ?? 0) + 1
        latestVideoFinalIntent.set(queueKey, intent)
        const previousFinalFlags = new Map(
          get().nodes
            .filter(
              (node): node is DirectorNode =>
                isVideoData(node.data) &&
                videoOwnerKey(node.data) === ownerKey,
            )
            .map((node) => [node.id, node.data.final]),
        )

        set((s) => ({
          nodes: s.nodes.map((node) => {
            if (!isVideoData(node.data) || videoOwnerKey(node.data) !== ownerKey) {
              return node
            }
            return {
              ...node,
              data: { ...node.data, final: node.id === videoNodeId ? final : false },
            } as DirectorNode
          }),
          generationErrors: { ...s.generationErrors, [videoNodeId]: '' },
          lastSavedAt: Date.now(),
        }))

        let patchSucceeded = false
        const previous = pendingVideoFinalWrites.get(queueKey) ?? Promise.resolve()
        const write = previous
          .catch(() => undefined)
          .then(async () => {
            const response = await fetch(`/api/director/video-takes/${encodeURIComponent(clipId)}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ projectId, is_final: final }),
            })
            if (!response.ok) throw new Error(`HTTP ${response.status}`)
            patchSucceeded = true
            if (
              latestVideoFinalIntent.get(queueKey) === intent &&
              get().projectId === projectId
            ) {
              await get().hydrateFromDb(projectId)
            }
          })
          .catch(async (error) => {
            if (
              latestVideoFinalIntent.get(queueKey) === intent &&
              get().projectId === projectId
            ) {
              set((s) => ({
                generationErrors: {
                  ...s.generationErrors,
                  [videoNodeId]: error instanceof Error ? error.message : 'Final update failed',
                },
              }))
              // Remove only this failed queue entry before reconciliation. A newer
              // intent owns a different entry and must continue protecting its
              // optimistic Final state from hydration.
              if (!patchSucceeded && pendingVideoFinalWrites.get(queueKey) === write) {
                pendingVideoFinalWrites.delete(queueKey)
              }
              try {
                await get().hydrateFromDb(projectId)
              } catch (hydrateError) {
                console.error('[director-store] Final reconciliation failed:', hydrateError)
                if (
                  !patchSucceeded &&
                  latestVideoFinalIntent.get(queueKey) === intent &&
                  get().projectId === projectId
                ) {
                  set((s) => ({
                    nodes: s.nodes.map((node) => {
                      const previousFinal = previousFinalFlags.get(node.id)
                      return previousFinal === undefined || !isVideoData(node.data)
                        ? node
                        : { ...node, data: { ...node.data, final: previousFinal } } as DirectorNode
                    }),
                  }))
                }
              }
            }
            throw error
          })
        pendingVideoFinalWrites.set(queueKey, write)
        void write.then(
          () => {
            if (pendingVideoFinalWrites.get(queueKey) === write) {
              pendingVideoFinalWrites.delete(queueKey)
            }
          },
          () => {
            if (pendingVideoFinalWrites.get(queueKey) === write) {
              pendingVideoFinalWrites.delete(queueKey)
            }
          },
        )
        return write
      },

      setVideoStatus: (videoNodeId, status, payload) => {
        const previousSource = get().nodes.find((node) => node.id === videoNodeId)
        const sourceVideoChanged =
          !!previousSource &&
          isVideoData(previousSource.data) &&
          payload?.url !== undefined &&
          payload.url !== previousSource.data.videoUrl
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

        const source = get().nodes.find((node) => node.id === videoNodeId)
        if (source && isVideoData(source.data)) {
          const sourceData = source.data
          set((s) => ({
            nodes: s.nodes.map((node) =>
              isVideoData(node.data) &&
              node.data.videoChainInputId === videoNodeId &&
              (status !== 'completed' ||
                sourceVideoChanged ||
                !chainFrameMatchesSource(node.data.videoChainFrameUrl, sourceData))
                ? ({
                      ...node,
                      data: {
                        ...node.data,
                        stale: true,
                        videoChainFrameUrl: null,
                        errorMessage: translate(
                          useLocaleStore.getState().locale,
                          'Previous video chain frame is unavailable.',
                        ),
                      },
                    } as DirectorNode)
                : node,
            ),
            lastSavedAt: Date.now(),
          }))
        }
        if (status === 'completed') {
          void get().ensureVideoThumbnail(videoNodeId)
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
          debouncedVideoClipSaveToDb(
            clipId,
            get().projectId,
            () => {
              const n = get().nodes.find((x) => x.id === videoNodeId)
              return n && isVideoData(n.data)
                ? { override: n.data.override }
                : undefined
            },
            () => get().hydrateFromDb(get().projectId),
          )
        }
      },

      generateAssetImage: async (assetNodeId) => {
        if (isDemoSession()) return false
        const node = get().nodes.find((candidate) => candidate.id === assetNodeId)
        if (!node || !isAssetData(node.data)) return false
        if (node.data.generationStatus === 'generating') return false
        const prompt = node.data.prompt.trim() || node.data.label.trim()
        if (!prompt) {
          get().updateNodeData<'asset'>(assetNodeId, {
            generationStatus: 'failed',
            generationError: 'Image prompt is required',
          })
          return false
        }
        const referenceImageUrls = [
          ...new Set(
            [
              node.data.sourceImageUrl,
              ...node.data.referenceImages.map((image) => image.url),
            ].filter((url): url is string => !!url),
          ),
        ]
        get().updateNodeData<'asset'>(assetNodeId, {
          generationStatus: 'generating',
          generationError: null,
        })
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), 90_000)
        let blobUrl: string | null = null
        try {
          const response = await fetch('/api/generate/image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              prompt,
              aspectRatio:
                node.data.assetKind === 'character' ? '1:1' : '16:9',
              referenceImageUrls,
              ...(node.data.imageModel
                ? { imageModel: node.data.imageModel }
                : {}),
            }),
            signal: controller.signal,
          })
          if (!response.ok) {
            const body = (await response.json().catch(() => ({}))) as {
              error?: string
            }
            throw new Error(body.error ?? `HTTP ${response.status}`)
          }
          blobUrl = URL.createObjectURL(await response.blob())
          const persistedUrl = await persistDirectorAssetImage(
            get().projectId,
            node.data.assetKind,
            node.data.assetId,
            blobUrl,
          )
          if (!persistedUrl) {
            URL.revokeObjectURL(blobUrl)
            get().updateNodeData<'asset'>(assetNodeId, {
              generationStatus: 'failed',
              generationError: translate(
                useLocaleStore.getState().locale,
                'The image was generated but could not be saved.',
              ),
            })
            return false
          }
          URL.revokeObjectURL(blobUrl)
          get().updateNodeData<'asset'>(assetNodeId, {
            imageUrl: persistedUrl,
            generationStatus: 'completed',
            generationError: null,
          })
          return true
        } catch (error) {
          const message =
            error instanceof Error
              ? error.name === 'AbortError'
                ? translate(useLocaleStore.getState().locale, 'Timed out (90s)')
                : error.message
              : 'Unknown error'
          get().updateNodeData<'asset'>(assetNodeId, {
            generationStatus: 'failed',
            generationError: message,
          })
          return false
        } finally {
          clearTimeout(timer)
        }
      },

      // ─── storyboard image (ST-2, I2I) ──────────────────────────────────

      generateStoryboardImage: async (shotNodeId, options) => {
        // #real-grid-auto: 일괄 시트 생성 중 개별 생성 차단 — 같은 샷이 시트와 단일 잡에서
        //   동시에 그려지는 충돌 방지. UI 버튼도 disabled 지만 스토어가 최종 방어선.
        if (get().realBatchBusy) {
          console.warn('[director] 실사 일괄 생성 중 — 개별 생성 요청 무시:', shotNodeId)
          options?.onJob?.({ jobId: null, status: 'deduped' })
          return { jobId: null, status: 'deduped' }
        }
        if (isDemoSession()) return null
        // #c4 (2026-08-27): 예전엔 여기서 viewMode 를 storyboard 로 밀어 Node 뷰에서 생성을
        //   누르면 화면이 통째로 튀었다. 사용자가 있는 화면을 뺏지 않는다 — 스토리보드 뷰에
        //   있을 때만 실사 모드로 맞춰주고, Node 뷰면 그 자리에 머문다.
        if (get().viewMode === 'storyboard') set({ storyboardMediaMode: 'real' })
        // 연타 방어(#double-fire) — 같은 샷의 생성 버튼은 캔버스 노드/그리드 카드/상세 패널에
        //   동시에 떠 있다. 버튼마다 잠가서는 서로를 못 막으므로 샷 키 하나로 창을 공유한다.
        if (!claimAction(`director:storyboard:${shotNodeId}`)) {
          options?.onJob?.({ jobId: null, status: 'deduped' })
          return { jobId: null, status: 'deduped' }
        }
        const api = get()
        const node = api.nodes.find((n) => n.id === shotNodeId)
        if (!node || !isShotData(node.data)) return null
        const data = node.data
        const prevUrl = data.storyboardImage?.url ?? ''
        const prompt = effectivePrompt(data) || data.label

        const storyboardAlreadyGenerating = api.nodes.some(
          (candidate) =>
            isShotData(candidate.data) && candidate.data.storyboardImage?.status === 'generating',
        )
        beginPipelineProgressBatch(
          'director-storyboard',
          data.writerShotId ?? shotNodeId,
          storyboardAlreadyGenerating,
        )

        // status → generating (storyboardImage는 shotConfigKeys 아님 → stale 전파 없음)
        api.updateNodeData<'shot'>(shotNodeId, {
          storyboardImage: {
            url: prevUrl,
            status: 'generating',
            errorMessage: null,
            generatedAt: data.storyboardImage?.generatedAt ?? 0,
          },
        })

        // #asset-authority: 배열은 [인물 시트..., 배경..., 프레임 입력...] 순. 서버가 역할 경계를
        //   알아야 "시트가 연필을 이긴다" 절을 정확히 쓸 수 있어 카운트를 같이 보낸다.
        const assetRefs = resolveShotAssetRefs(data)
        const referenceImageUrls = [
          ...new Set([
            ...assetRefs.urls,
            ...resolveShotImageInputs(api.nodes, data.imageInputs),
          ]),
        ]

        // DB 샷(writerShotId=shots.shot_id 있음) → webhook job 경로.
        // 서버가 fal submit + storage 업로드 + shots.storyboard_image 갱신을 처리(탭 닫혀도 보존).
        const writerShotId = data.writerShotId
        const projectId = get().projectId
        let activeJobId: string | null = null
        if (writerShotId && projectId) {
          try {
            const res = await fetch('/api/director/generate-storyboard', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              // aspectRatio 미전송 — 서버가 프로듀서 포맷(projects.settings.format)에서 파생한다
              //   (#fal-canvas: 클라 '16:9' 하드코딩이 세로 프로젝트의 화면비를 덮던 결함 제거).
              body: JSON.stringify({
                projectId,
                writerShotId,
                prompt,
                referenceImageUrls,
                characterRefCount: assetRefs.characterRefCount,
                worldRefCount: assetRefs.worldRefCount,
                // #image-model-select: 샷이 고른 fal 이미지 모델 (미지정 = 서버 기본)
                ...(data.imageModel ? { imageModel: data.imageModel } : {}),
                ...(options?.traceId ? { traceId: options.traceId } : {}),
              }),
            })
            if (!res.ok) {
              const body = await res.json().catch(() => ({}))
              options?.onJob?.({
                jobId: null,
                status: 'failed',
                httpStatus: res.status,
                error: body.error ?? `HTTP ${res.status}`,
              })
              // #ref-gate(오너 결정 1번): 선행 산출물(인물 시트·러프)이 없으면 안내 후 대기 → 나타나면 자동 재개.
              //   대기 중엔 노드를 generating(스피너)으로 두고, 사람이 다시 누르지 않아도 이어진다. 20분 상한.
              if (isPrerequisiteMissing(res.status, body)) {
                notifyPrerequisiteWaiting('director', body)
                releaseAction(`director:storyboard:${shotNodeId}`)
                const outcome = await waitForPrerequisite(projectId, body, {
                  isCancelled: () => get().projectId !== projectId,
                })
                const depth = options?.resumeDepth ?? 0
                if (outcome === 'ready' && depth < 3) {
                  notifyPrerequisiteResumed(body)
                  return get().generateStoryboardImage(shotNodeId, { ...options, resumeDepth: depth + 1 })
                }
                if (outcome === 'timeout') notifyPrerequisiteTimeout('director', body)
                get().updateNodeData<'shot'>(shotNodeId, {
                  storyboardImage: {
                    url: prevUrl,
                    status: 'pending',
                    errorMessage: null,
                    generatedAt: data.storyboardImage?.generatedAt ?? 0,
                  },
                })
                return { jobId: null, status: 'failed', httpStatus: res.status, error: body.error ?? 'prerequisite missing' }
              }
              if (notifyIfQuotaExceeded(res.status, body)) {
                get().updateNodeData<'shot'>(shotNodeId, {
                  storyboardImage: {
                    url: prevUrl,
                    status: 'pending',
                    errorMessage: null,
                    generatedAt: data.storyboardImage?.generatedAt ?? 0,
                  },
                })
                releaseAction(`director:storyboard:${shotNodeId}`)
                return null
              }
              throw new Error(body.error ?? `HTTP ${res.status}`)
            }
            const { jobId } = (await res.json()) as { jobId: string }
            activeJobId = jobId
            options?.onJob?.({ jobId, status: 'queued', httpStatus: res.status })
            const url = await pollGenerationJob(jobId, { onStatus: options?.onJob })
            get().updateNodeData<'shot'>(shotNodeId, {
              storyboardImage: {
                url,
                status: 'completed',
                errorMessage: null,
                generatedAt: Date.now(),
              },
            })
            // 생성 완료 확정 — 사물함을 먼저 낡음으로 표시해야 바로 아래 hydrateFromDb 의 재수화도,
            //   writer/editor 의 다음 읽기도 이 화면 완료를 반영한 새 행을 받는다(#shots-cache-invalidate).
            void invalidateShots(projectId)
            // 스트립 모드(#real-strip)의 frames{start,direction,end}는 잡 result_url(=start)에
            //   실리지 않는다 — DB 진실 재수화로 회수(로컬이 방금 쓴 완료값 그대로면 DB 값 채택).
            await get().hydrateFromDb(projectId).catch(() => {})
            notifyGenerationComplete('director', translate(useLocaleStore.getState().locale, 'Storyboard')) // 다른 stage에 있을 때만 알림
            return { jobId, status: 'completed', resultUrl: url, httpStatus: res.status }
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
            // 실패한 시도가 1초 창을 붙잡고 있으면 즉시 재시도가 막힌다 — 창을 바로 연다.
            releaseAction(`director:storyboard:${shotNodeId}`)
            // 카드의 작은 빨간 글씨는 스크롤하면 사라진다 — 사유를 채팅에도 남긴다(#double-fire).
            notifyGenerationFailure('director', translate(useLocaleStore.getState().locale, 'Storyboard image'), message)
            return { jobId: activeJobId, status: 'failed', error: message }
          }
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
                prompt,
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
          return { jobId: null, status: 'completed', resultUrl: publicUrl }
        } catch (err) {
          const message =
            err instanceof Error
              ? err.name === 'AbortError'
                ? translate(useLocaleStore.getState().locale, 'Timed out (90s)')
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
          return {
            jobId: null,
            status: 'failed',
            error: message,
          }
        }
      },

      generateAllStoryboardImages: async () => {
        if (isDemoSession()) return
        if (!claimAction('director:storyboard:all')) return
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

      // 연타 방어는 아래 acquireGenerationLock 이 이미 담당한다 — 1초 창이 아니라 생성 전 구간을
      //   잠그므로 더 강하다. 여기에 창을 덧대면 앞 시도가 *끝난 뒤*의 정당한 재시도까지 막힌다.
      generateVideoForShot: async (shotNodeId, options) => {
        if (get().videoBatchBusy && options?.batch !== true) return null
        if (isDemoSession()) return null
        // #c4 (2026-08-27): Node 뷰에서 영상 생성을 눌렀는데 Storyboard 로 튀던 것 — 화면을
        //   빼앗지 않는다. 스토리보드 뷰일 때만 실사 모드로 맞춘다.
        if (get().viewMode === 'storyboard') set({ storyboardMediaMode: 'real' })
        const api = get()
        const shotNode = api.nodes.find((n) => n.id === shotNodeId)
        if (!shotNode || !isShotData(shotNode.data)) return null
        const lock = acquireGenerationLock(api.projectId, shotNodeId)
        if (!lock) return null
        try {
          // 새 Video take 생성 (마더 설정 상속, 결정 #13) → 그 노드를 생성
          const videoNodeId = api.addVideoTake(shotNodeId)
          if (!videoNodeId) return null

          // #retake-inherit: 원본 테이크의 수동 배선(프레임 입력·영상 체인·override)을 상속.
          if (options?.inheritFromVideoNodeId) {
            const source = get().nodes.find(
              (n) => n.id === options.inheritFromVideoNodeId,
            )
            if (source && isVideoData(source.data)) {
              const src = source.data
              get().updateNodeData<'video'>(videoNodeId, {
                frameInputs: {
                  start: src.frameInputs?.start ?? null,
                  end: src.frameInputs?.end ?? null,
                  refs: [...(src.frameInputs?.refs ?? [])],
                },
                videoChainInputId: src.videoChainInputId,
                videoChainFrameUrl: src.videoChainFrameUrl,
                override: { ...src.override },
              })
              // 상속된 배선을 엣지로 복원 + DB write-through.
              get().rebuildFrameEdges()
              get().rebuildVideoChainEdges()
              scheduleWiringSweepToDb(get)
            }
          }

          const started = await get().regenerateVideo(videoNodeId, lock, options)
          if (!started) {
            // 대기열(쿼터) 초과 — 방금 만든 take 노드를 롤백해 에러 노드를 남기지 않는다(#e5).
            const node = get().nodes.find((n) => n.id === videoNodeId)
            // Only an unsaved local take is rolled back on quota rejection.
            if (node && isVideoData(node.data) && !node.data.videoClipId) {
              await get().deleteNode(videoNodeId)
            }
            return null
          }
          return videoNodeId
        } finally {
          releaseGenerationLock(lock)
        }
      },

      // generateVideoForShot 과 같은 이유로 창을 두지 않는다 — 아래 lock 이 전 구간을 덮는다.
      regenerateVideo: async (videoNodeId, heldLock, options) => {
        if (isDemoSession()) return true
        const initialVideoNode = get().nodes.find((n) => n.id === videoNodeId)
        if (!initialVideoNode || !isVideoData(initialVideoNode.data)) return true
        let videoNode = initialVideoNode as DirectorNode & {
          data: VideoNodeData
        }
        const shotNode =
          videoNode.data.parentShotNodeId === null
            ? null
            : get().nodes.find(
                (n) =>
                  n.id === videoNode.data.parentShotNodeId &&
                  isShotData(n.data),
              ) ?? null
        if (videoNode.data.parentShotNodeId !== null && !shotNode) return false
        if (shotNode && !isShotData(shotNode.data)) return false
        const eff = getEffectiveVideoConfig(get(), videoNodeId)
        if (!eff) return false
        const standaloneConfigIntent =
          videoNode.data.parentShotNodeId === null
            ? normalizeStandaloneVideoConfig(videoNode.data.override)
            : null
        if (
          videoNode.data.parentShotNodeId === null &&
          !eff.prompt.trim()
        ) {
          const message = 'Video prompt is required'
          set((s) => ({
            generationErrors: { ...s.generationErrors, [videoNodeId]: message },
            nodes: s.nodes.map((node) =>
              node.id === videoNodeId && isVideoData(node.data)
                ? ({
                    ...node,
                    data: {
                      ...node.data,
                      lastAttemptError: message,
                      errorMessage: message,
                    },
                  } as DirectorNode)
                : node,
            ),
          }))
          return false
        }
        if (
          videoNode.data.parentShotNodeId === null &&
          (!standaloneConfigIntent ||
            !videoNode.data.videoClipId ||
            !isStandaloneVideoOwnerKey(videoNode.data.standaloneVideoKey))
        ) {
          return false
        }
        const projectId = get().projectId
        const lockIsHeld = !!heldLock && generationLocks.get(heldLock.key) === heldLock.token
        const lock = lockIsHeld
          ? null
          : acquireGenerationLock(projectId, videoOwnerKey(videoNode.data))
        if (!lockIsHeld && !lock) return true
        if (
          videoNode.data.parentShotNodeId === null &&
          videoNode.data.videoClipId
        ) {
          const pendingSave = pendingVideoClipSaves.get(
            videoNode.data.videoClipId,
          )
          if (pendingSave) {
            clearTimeout(pendingSave)
            pendingVideoClipSaves.delete(videoNode.data.videoClipId)
          }
          await inFlightVideoClipSaves.get(videoNode.data.videoClipId)
          const current = get()
          const refreshed = current.nodes.find(
            (node) => node.id === videoNodeId,
          )
          if (
            current.projectId !== projectId ||
            !refreshed ||
            !isVideoData(refreshed.data) ||
            refreshed.data.videoClipId !== videoNode.data.videoClipId ||
            refreshed.data.standaloneVideoKey !==
              videoNode.data.standaloneVideoKey
          ) {
            releaseGenerationLock(lock)
            return false
          }
          videoNode = refreshed as DirectorNode & { data: VideoNodeData }
        }
        const chainInputId = videoNode.data.videoChainInputId
        const chainFrameUrl = usableFrameImageUrl(
          videoNode.data.videoChainFrameUrl,
        )
        const chainSource = chainInputId
          ? get().nodes.find((node) => node.id === chainInputId)
          : null
        const chainReady =
          !!chainInputId &&
          !!chainSource &&
          isVideoData(chainSource.data) &&
          chainSource.data.status === 'completed' &&
          chainFrameMatchesSource(chainFrameUrl, chainSource.data)
        if (chainInputId && !chainReady) {
          const message = translate(
            useLocaleStore.getState().locale,
            'Previous video chain frame is unavailable.',
          )
          set((s) => ({
            nodes: s.nodes.map((node) =>
              node.id === videoNodeId && isVideoData(node.data)
                ? ({
                    ...node,
                    data: {
                      ...node.data,
                      lastAttemptError: message,
                      errorMessage: message,
                    },
                  } as DirectorNode)
                : node,
            ),
            generationErrors: { ...s.generationErrors, [videoNodeId]: message },
            lastSavedAt: Date.now(),
          }))
          releaseGenerationLock(lock)
          return false
        }
        const idempotencyKey = crypto.randomUUID()
        const preserveSuccess = !!videoNode.data.videoUrl
        const frameInputs = normalizeFrameInputs(videoNode.data.frameInputs)
        const hasManualFrameInputs =
          !!frameInputs.start || !!frameInputs.end || frameInputs.refs.length > 0
        const storyboard =
          shotNode && isShotData(shotNode.data)
            ? shotNode.data.storyboardImage
            : null
        // V2 refs(#real-strip): 실사 3프레임이 있으면 [START, END] 2장 — 시작·끝 구도 고정.
        const sbFrames = storyboard?.status === 'completed' ? storyboard.frames : undefined
        const automaticStart =
          shotNode && isShotData(shotNode.data)
            ? resolveShotFrameImageUrl(shotNode.data, 'start')
            : null
        const automaticEnd = sbFrames
          ? shotNode && isShotData(shotNode.data)
            ? resolveShotFrameImageUrl(shotNode.data, 'end')
            : null
          : null
        const automaticReferenceImageUrl =
          shotNode && isShotData(shotNode.data)
            ? (storyboard?.status === 'completed'
                ? usableFrameImageUrl(storyboard.url)
                : null) ??
              resolveShotFrameImageUrl(shotNode.data, 'ref')
            : null
        let referenceImageUrls: string[] | undefined
        let referenceImageRoles: Array<'start' | 'end' | 'ref'> | undefined
        if (chainFrameUrl || hasManualFrameInputs || sbFrames) {
          // Unresolvable manual slots deliberately fall back to the corresponding
          // automatic image so a stale source node cannot remove a valid frame.
          const start =
            chainFrameUrl ??
            (frameInputs.start
              ? resolveFrameInputImageUrl(get().nodes, frameInputs.start, 'start')
              : null) ??
            automaticStart
          const refs = frameInputs.refs
            .map((sourceNodeId) =>
              resolveFrameInputImageUrl(get().nodes, sourceNodeId, 'ref'),
            )
            .filter((url): url is string => !!url)
          const end =
            (frameInputs.end
              ? resolveFrameInputImageUrl(get().nodes, frameInputs.end, 'end')
              : null) ?? automaticEnd
          const urls: string[] = []
          const roles: Array<'start' | 'end' | 'ref'> = []
          if (start) {
            urls.push(start)
            roles.push('start')
          }
          for (const url of refs) {
            urls.push(url)
            roles.push('ref')
          }
          if (end) {
            urls.push(end)
            roles.push('end')
          }
          if (urls.length > 0) {
            referenceImageUrls = urls
            referenceImageRoles = roles
          }
        }
        const referenceImageUrl =
          referenceImageUrls?.find((url) => !!usableFrameImageUrl(url)) ??
          automaticReferenceImageUrl ??
          automaticStart ??
          null
        const videoAlreadyGenerating = get().nodes.some(
          (candidate) =>
            isVideoData(candidate.data) &&
            (candidate.data.status === 'generating' ||
              candidate.data.lastAttemptStatus === 'generating'),
        )
        beginPipelineProgressBatch('director-video', videoNodeId, videoAlreadyGenerating)
        get().updateNodeData<'video'>(videoNodeId, {
          lastAttemptStatus: 'generating',
          lastAttemptError: null,
          lastAttemptAt: new Date().toISOString(),
          generationJobId: idempotencyKey,
          ...(preserveSuccess ? {} : { status: 'generating', errorMessage: null }),
        })
        const requestPayload = {
          projectId,
          ...(shotNode && isShotData(shotNode.data)
            ? {
                shotId: shotNode.id,
                writerShotId: shotNode.data.writerShotId,
              }
            : {
                standaloneVideoKey: videoNode.data.standaloneVideoKey,
                standaloneConfig: standaloneConfigIntent,
              }),
          videoClipId: videoNode.data.videoClipId,
          takeNumber: videoNode.data.takeNumber,
          takeLabel: videoNode.data.label,
          canvasPosition: videoNode.position,
          idempotencyKey,
          prompt: eff.prompt,
          camera: eff.camera,
          cameraPreset: eff.cameraPreset,
          aspectRatio: '16:9',
          generationMethod: referenceImageUrl ? 'I2V' : 'T2V',
          model: normalizeProvider(eff.provider),
          provider: toRouteProvider(eff.provider),
          durationSeconds: eff.durationSeconds,
          referenceImageUrl,
          ...(referenceImageUrls ? { referenceImageUrls } : {}),
          ...(referenceImageUrls && referenceImageRoles ? { referenceImageRoles } : {}),
          ...(options?.traceId ? { traceId: options.traceId, actor: 'chat' } : {}),
        }
        const postGeneration = (recoveryReceipt?: string) =>
          fetch('/api/director/generate-video', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Idempotency-Key': idempotencyKey,
            },
            body: JSON.stringify(
              recoveryReceipt ? { ...requestPayload, recoveryReceipt } : requestPayload,
            ),
          })
        let activeJobId: string | null = null
        try {
          let res = await postGeneration()
          let body = (await res.json().catch(() => ({}))) as VideoGenerationResponse
          for (
            let recoveryAttempt = 0;
            !res.ok &&
            canRecoverGenerationAttempt(
              body,
              recoveryAttempt,
              (() => {
                const current = get().nodes.find((node) => node.id === videoNodeId)
                return (
                  get().projectId === projectId &&
                  !!current &&
                  isVideoData(current.data) &&
                  current.data.generationJobId === idempotencyKey
                )
              })(),
            );
            recoveryAttempt += 1
          ) {
            await new Promise((resolve) => setTimeout(resolve, 250 * (recoveryAttempt + 1)))
            const current = get().nodes.find((node) => node.id === videoNodeId)
            if (
              get().projectId !== projectId ||
              !current ||
              !isVideoData(current.data) ||
              current.data.generationJobId !== idempotencyKey
            ) {
              return true
            }
            res = await postGeneration(body.recoveryReceipt)
            body = (await res.json().catch(() => ({}))) as VideoGenerationResponse
          }
          const currentAttemptNode = get().nodes.find((n) => n.id === videoNodeId)
          if (
            get().projectId !== projectId ||
            !currentAttemptNode ||
            !isVideoData(currentAttemptNode.data) ||
            currentAttemptNode.data.generationJobId !== idempotencyKey
          ) return true
          if (!res.ok) {
            if (body.jobId || body.videoClipId) {
              get().updateNodeData<'video'>(videoNodeId, {
                videoClipId: body.videoClipId ?? videoNode.data.videoClipId,
                takeNumber: body.takeNumber ?? videoNode.data.takeNumber,
                generationJobId: body.jobId ?? videoNode.data.generationJobId,
                lastAttemptStatus: body.status === 'queued' ? 'generating' : body.status ?? 'failed',
                lastAttemptError: body.error ?? null,
              })
              if (body.jobId) {
                options?.onJob?.({
                  jobId: body.jobId,
                  status: body.status === 'queued' ? 'queued' : 'failed',
                  httpStatus: res.status,
                  error: body.error ?? null,
                })
              }
              await get().hydrateFromDb(projectId)
            }
            // #ref-gate(오너 결정 1번): 실사 스토리보드가 아직 없으면 대기 → 나타나면 같은 샷의 영상 생성을 자동 재개.
            //   false 를 돌려주면 호출부가 방금 만든 미저장 take 노드를 롤백하므로, 재개는 새 take 로 다시 시작한다.
            if (isPrerequisiteMissing(res.status, body)) {
              notifyPrerequisiteWaiting('director', body)
              if (!preserveSuccess) get().setVideoStatus(videoNodeId, 'pending')
              const depth = options?.resumeDepth ?? 0
              const resumeShotNodeId = shotNode && isShotData(shotNode.data) ? shotNode.id : null
              if (resumeShotNodeId && depth < 3) {
                const resumeBody = body
                void waitForPrerequisite(projectId, resumeBody, {
                  isCancelled: () => get().projectId !== projectId,
                }).then((outcome) => {
                  if (outcome === 'ready') {
                    notifyPrerequisiteResumed(resumeBody)
                    void get().generateVideoForShot(resumeShotNodeId, { ...options, resumeDepth: depth + 1 })
                  } else if (outcome === 'timeout') notifyPrerequisiteTimeout('director', resumeBody)
                })
              }
              return false
            }
            if (notifyIfQuotaExceeded(res.status, body)) {
              if (!preserveSuccess) get().setVideoStatus(videoNodeId, 'pending')
              return false
            }
            throw new Error(body.error ?? `HTTP ${res.status}`)
          }
          const jobId = body.jobId
          if (typeof jobId !== 'string' || !jobId) {
            throw new Error('Generation response missing jobId')
          }
          get().updateNodeData<'video'>(videoNodeId, {
            videoClipId: body.videoClipId ?? videoNode.data.videoClipId,
            takeNumber: body.takeNumber ?? videoNode.data.takeNumber,
            generationJobId: jobId,
            lastAttemptStatus: body.status === 'queued' ? 'generating' : body.status ?? 'generating',
          })
          activeJobId = jobId
          options?.onJob?.({ jobId, status: 'queued', httpStatus: res.status })
          const isCurrentAttempt = () => {
            const current = get()
            const node = current.nodes.find((n) => n.id === videoNodeId)
            return (
              current.projectId === projectId &&
              !!node &&
              isVideoData(node.data) &&
              node.data.generationJobId === jobId
            )
          }
          const startedAt = Date.now()
          while (Date.now() - startedAt < VIDEO_POLL_TIMEOUT_MS) {
            const pollResponse = await fetch(`/api/generation-jobs/${encodeURIComponent(jobId)}`)
            if (!pollResponse.ok) throw new Error(`Polling HTTP ${pollResponse.status}`)
            const envelope: unknown = await pollResponse.json()
            const job =
              envelope &&
              typeof envelope === 'object' &&
              (envelope as Record<string, unknown>).ok === true &&
              (envelope as Record<string, unknown>).data &&
              typeof (envelope as Record<string, unknown>).data === 'object'
                ? ((envelope as Record<string, unknown>).data as Record<string, unknown>)
                : null
            if (!job || typeof job.status !== 'string') throw new Error('Invalid polling response')
            if (!isCurrentAttempt()) return true
            const status = job.status === 'queued' ? 'generating' : job.status as DirectorVideoStatus
            if (status === 'completed' || status === 'failed') {
              options?.onJob?.({
                jobId,
                status,
                resultUrl: typeof job.resultUrl === 'string' ? job.resultUrl : null,
                error: typeof job.error === 'string' ? job.error : null,
              })
            } else {
              options?.onJob?.({ jobId, status: 'queued' })
            }
            get().updateNodeData<'video'>(videoNodeId, {
              lastAttemptStatus: status,
              lastAttemptError: typeof job.error === 'string' ? job.error : null,
              lastAttemptAt: new Date().toISOString(),
            })
            if (status === 'completed' || status === 'failed') {
              if (!isCurrentAttempt()) return true
              // The provider terminal outcome is authoritative for this attempt. A
              // reconciliation failure is a separate canonical-sync error and must
              // never rewrite that outcome.
              const acceptedJobId = jobId
              if (status === 'completed') {
                // 생성 완료 확정 — 사물함을 먼저 낡음으로 표시해야 바로 아래 hydrateFromDb 의 재수화도,
                //   writer/editor 의 다음 읽기도 이 화면 완료를 반영한 새 행을 받는다(#shots-cache-invalidate).
                void invalidateShots(projectId)
              }
              try {
                await get().hydrateFromDb(projectId)
              } catch (err) {
                const message = `Canonical video-take hydration failed: ${
                  err instanceof Error ? err.message : 'Unknown error'
                }`
                set((s) => ({
                  generationErrors: { ...s.generationErrors, [videoNodeId]: message },
                }))
                console.error(`[director-store] ${message} for accepted job ${acceptedJobId}`)
              }
              if (!isCurrentAttempt()) return true
              if (status === 'completed') {
                notifyGenerationComplete('director', translate(useLocaleStore.getState().locale, 'Video'))
                // #adherence P2: 모션 계약 준수 검사(fire-and-forget) — 브라우저가 첫/끝 프레임을
                //   캡처해 서버 판정 후 배지 반영. 실패는 조용히 무시(생성 결과에 영향 없음).
                const doneNode = get().nodes.find((n) => n.id === videoNodeId)
                const clipId = doneNode && isVideoData(doneNode.data) ? doneNode.data.videoClipId : null
                const doneUrl = doneNode && isVideoData(doneNode.data) ? doneNode.data.videoUrl : null
                const parentShotId = doneNode && isVideoData(doneNode.data)
                  ? (() => {
                      const shot = get().nodes.find((n) => n.id === (doneNode.data as VideoNodeData).parentShotNodeId)
                      return shot && isShotData(shot.data) ? shot.data.writerShotId : null
                    })()
                  : null
                if (clipId && doneUrl && parentShotId) {
                  void runVideoAdherence({ projectId, writerShotId: parentShotId, videoClipId: clipId, videoUrl: doneUrl })
                    .then((verdict) => {
                      if (!verdict || !isCurrentAttempt()) return
                      get().updateNodeData<'video'>(videoNodeId, { adherence: verdict })
                    })
                    .catch(() => {})
                }
              }
              return true
            }
            await new Promise((resolve) => setTimeout(resolve, VIDEO_POLL_INTERVAL_MS))
          }
          throw new Error(translate(useLocaleStore.getState().locale, 'Video generation timed out (5 min)'))
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Unknown error'
          if (message.startsWith('Canonical video-take hydration failed:')) throw err
          const current = get()
          const node = current.nodes.find((n) => n.id === videoNodeId)
          if (
            current.projectId !== projectId ||
            !node ||
            !isVideoData(node.data) ||
            node.data.generationJobId !== (activeJobId ?? idempotencyKey)
          ) return true
          get().updateNodeData<'video'>(videoNodeId, {
            lastAttemptStatus: 'failed',
            lastAttemptError: message,
            ...(preserveSuccess ? {} : { status: 'failed', errorMessage: message }),
          })
          options?.onJob?.({
            jobId: activeJobId,
            status: 'failed',
            error: message,
          })
          return true
        }
        finally {
          releaseGenerationLock(lock)
        }
      },

      // ─── playback + thumbnail ──────────────────────────────────────────

      setPlayingNode: (id) => set({ playingNodeId: id }),

      toggleUnusedAssets: () => {
        set((s) => ({ showUnusedAssets: !s.showUnusedAssets }))
        get().rebuildAssetNodes()
      },

      // ─── undo/redo ─────────────────────────────────────────────────────
      // 스냅샷은 legacy previz 체인만 제외 — editable asset Image는 보존한다.
      commitHistory: () => {
        if (get()._historySuppressed) return
        const s = get()
        const snap = {
          nodes: s.nodes.filter((n) => !isDerivedNodeData(n.data)),
          edges: s.edges.filter(
            (e) =>
              e.data?.category !== 'references' &&
              e.data?.category !== 'chain' &&
              e.data?.category !== 'video-chain' &&
              e.data?.category !== 'image',
          ),
        }
        // past 최대 50개 유지, 새 변경이 생기면 redo 가지(future)는 버린다
        set({ historyPast: [...s.historyPast.slice(-49), snap], historyFuture: [] })
      },
      undo: () => {
        const s = get()
        if (!s.historyPast.length) return
        const prev = s.historyPast[s.historyPast.length - 1]!
        const cur = {
          nodes: s.nodes.filter((n) => !isDerivedNodeData(n.data)),
          edges: s.edges.filter(
            (e) =>
              e.data?.category !== 'references' &&
              e.data?.category !== 'chain' &&
              e.data?.category !== 'video-chain' &&
              e.data?.category !== 'image',
          ),
        }
        set({
          nodes: prev.nodes,
          edges: prev.edges,
          historyPast: s.historyPast.slice(0, -1),
          historyFuture: [...s.historyFuture, cur],
          lastSavedAt: Date.now(),
        })
        get().rebuildAssetNodes()
        get().rebuildShotChainNodes()
      },
      redo: () => {
        const s = get()
        if (!s.historyFuture.length) return
        const next = s.historyFuture[s.historyFuture.length - 1]!
        const cur = {
          nodes: s.nodes.filter((n) => !isDerivedNodeData(n.data)),
          edges: s.edges.filter(
            (e) =>
              e.data?.category !== 'references' &&
              e.data?.category !== 'chain' &&
              e.data?.category !== 'video-chain' &&
              e.data?.category !== 'image',
          ),
        }
        set({
          nodes: next.nodes,
          edges: next.edges,
          historyPast: [...s.historyPast, cur],
          historyFuture: s.historyFuture.slice(0, -1),
          lastSavedAt: Date.now(),
        })
        get().rebuildAssetNodes()
        get().rebuildShotChainNodes()
      },

      ensureVideoThumbnail: async (videoNodeId) => {
        const node = get().nodes.find((n) => n.id === videoNodeId)
        if (!node || !isVideoData(node.data)) return
        const data = node.data
        if (!data.videoUrl || data.thumbnailUrl) return
        const clipId = data.videoClipId
        const generationJobId = data.generationJobId
        const captureKey = clipId && generationJobId ? `${clipId}:${generationJobId}` : videoNodeId
        if (thumbnailInFlight.has(captureKey)) return
        thumbnailInFlight.add(captureKey)
        try {
          const blob = await captureVideoThumbnail(data.videoUrl)
          if (!blob) return

          const current = get().nodes.find((n) => n.id === videoNodeId)
          if (
            !current ||
            !isVideoData(current.data) ||
            current.data.videoUrl !== data.videoUrl ||
            current.data.videoClipId !== clipId ||
            current.data.generationJobId !== generationJobId ||
            current.data.thumbnailUrl
          ) {
            return
          }

          const projectId = get().projectId
          if (clipId && generationJobId && projectId && projectId !== 'default') {
            const form = new FormData()
            form.append('projectId', projectId)
            form.append('type', 'video')
            form.append('entityId', clipId)
            form.append('field', 'thumbnail')
            form.append('generationJobId', generationJobId)
            form.append('file', blob, `${clipId}_thumbnail.jpg`)
            try {
              const res = await fetch('/api/assets/upload-image', {
                method: 'POST',
                body: form,
              })
              if (!res.ok) throw new Error(`HTTP ${res.status}`)
              const { publicUrl } = await res.json()
              if (!publicUrl) throw new Error('Thumbnail upload returned no publicUrl')

              const latest = get().nodes.find((n) => n.id === videoNodeId)
              if (
                latest &&
                isVideoData(latest.data) &&
                latest.data.videoUrl === data.videoUrl &&
                latest.data.videoClipId === clipId &&
                latest.data.generationJobId === generationJobId &&
                !latest.data.thumbnailUrl
              ) {
                get().updateNodeData<'video'>(videoNodeId, { thumbnailUrl: publicUrl })
              }
            } catch (err) {
              console.error('[director-store] thumbnail upload failed:', err)
            }
            return
          }

          // Local object URLs are only valid for truly unpersisted manual nodes.
          if (!clipId) {
            get().updateNodeData<'video'>(videoNodeId, {
              thumbnailUrl: URL.createObjectURL(blob),
            })
          }
        } finally {
          thumbnailInFlight.delete(captureKey)
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
        // upstream asset Image와 legacy 파생 카드는 삭제 대상이 아니다.
        if (isAssetData(node.data) || isDerivedNodeData(node.data)) return
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
      confirmDelete: async () => {
        const info = get().deleteConfirmInfo
        if (!info) return
        await get().deleteNode(info.nodeId)
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

      applyUpdates: (updates, options) => {
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
                  api.updateNodeData<'shot'>(newId, { promptOverride: u.prompt })
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
                const { prompt, ...shotPatch } = u.patch
                api.updateNodeData<'shot'>(id, {
                  ...shotPatch,
                  ...(prompt !== undefined ? { promptOverride: prompt } : {}),
                })
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
                  const eff = getEffectiveVideoConfig(get(), id)
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
                  const eff = getEffectiveVideoConfig(get(), id)
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
                  const eff = getEffectiveVideoConfig(get(), id)
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
              case 'generateImage': {
                // 개별: Shot 노드 지정 / 전체: id 없음 → 미생성 일괄(runRealBatch, 버튼과 동일 경로)
                const pid = get().projectId
                if (!u.id) {
                  // real-batch-client 가 이 스토어를 import 하므로 정적 import 는 순환이 된다.
                  //   전체 일괄은 드문 경로라 지연 로드로 끊는다.
                  if (pid) {
                    void import('@/lib/director/real-batch-client').then((m) =>
                      m.runRealBatch(pid, {
                        traceId: options?.traceId,
                        onJob: options?.onJob,
                      }),
                    )
                    result.applied += 1
                  } else {
                    result.skipped.push({
                      update: u,
                      reason: 'projectId required for batch generation',
                    })
                  }
                  break
                }
                const imgId = resolveId(u.id)
                const imgNode = get().nodes.find((n) => n.id === imgId)
                if (!imgNode || !isShotData(imgNode.data)) {
                  result.skipped.push({
                    update: u,
                    reason: 'generateImage target must be Shot node',
                  })
                  break
                }
                const imageGeneration = options
                  ? get().generateStoryboardImage(imgId, options)
                  : get().generateStoryboardImage(imgId)
                void imageGeneration
                result.applied += 1
                break
              }
              case 'generateVideo': {
                // 영상은 비용이 걸리는 별도 승인·Job 계약이 아직 없으므로, 현재 채팅에서는
                // placeholder 상태만 바꾸지 않고 지원하지 않는 액션으로 명시한다.
                result.skipped.push({
                  update: u,
                  reason: 'video generation from chat requires an explicit approval contract',
                })
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
              case 'connectFrame': {
                const s = resolveId(u.sourceId)
                const t = resolveId(u.targetId)
                if (
                  u.targetHandle !== 'frame-start' &&
                  u.targetHandle !== 'frame-end' &&
                  u.targetHandle !== 'frame-ref'
                ) {
                  result.skipped.push({
                    update: u,
                    reason: 'invalid frame target handle',
                  })
                  break
                }
                const source = get().nodes.find((node) => node.id === s)
                const target = get().nodes.find((node) => node.id === t)
                if (!source || !target) {
                  result.skipped.push({ update: u, reason: 'unknown id' })
                  break
                }
                if (!isVideoData(target.data)) {
                  result.skipped.push({
                    update: u,
                    reason: 'targetId must be Video node',
                  })
                  break
                }
                if (!isFrameSourceNode(source)) {
                  result.skipped.push({
                    update: u,
                    reason: 'sourceId is not frame-capable',
                  })
                  break
                }

                api.wireFrameToVideo(s, t, u.targetHandle)
                const wiredVideo = get().nodes.find((node) => node.id === t)
                const wiredInputs =
                  wiredVideo && isVideoData(wiredVideo.data)
                    ? normalizeFrameInputs(wiredVideo.data.frameInputs)
                    : null
                const inputMatches =
                  wiredInputs !== null &&
                  (u.targetHandle === 'frame-start'
                    ? wiredInputs.start === s
                    : u.targetHandle === 'frame-end'
                      ? wiredInputs.end === s
                      : wiredInputs.refs.includes(s))
                const edgeMatches = get().edges.some(
                  (edge) =>
                    edge.data?.category === 'frame' &&
                    edge.source === s &&
                    edge.target === t &&
                    edge.targetHandle === u.targetHandle,
                )
                if (inputMatches && edgeMatches) {
                  result.applied += 1
                } else {
                  result.skipped.push({
                    update: u,
                    reason: 'frame wiring not reflected',
                  })
                }
                break
              }
              case 'connectVideo': {
                const s = resolveId(u.sourceId)
                const t = resolveId(u.targetId)
                if (u.targetHandle !== 'video-chain') {
                  result.skipped.push({
                    update: u,
                    reason: 'invalid video-chain target handle',
                  })
                  break
                }
                const source = get().nodes.find((node) => node.id === s)
                const target = get().nodes.find((node) => node.id === t)
                if (
                  !source ||
                  !target ||
                  !isVideoData(source.data) ||
                  !isVideoData(target.data)
                ) {
                  result.skipped.push({
                    update: u,
                    reason: 'sourceId and targetId must be Video nodes',
                  })
                  break
                }
                if (
                  source.data.status !== 'completed' ||
                  !usableFrameImageUrl(source.data.videoUrl) ||
                  !source.data.videoClipId ||
                  !source.data.generationJobId ||
                  videoChainWouldCycle(get().nodes, s, t)
                ) {
                  result.skipped.push({
                    update: u,
                    reason: 'source Video must be completed and chainable',
                  })
                  break
                }
                void api.wireVideoChainToVideo(s, t, u.targetHandle)
                const wiredVideo = get().nodes.find((node) => node.id === t)
                const inputMatches =
                  wiredVideo &&
                  isVideoData(wiredVideo.data) &&
                  wiredVideo.data.videoChainInputId === s
                const edgeMatches = get().edges.some(
                  (edge) =>
                    edge.data?.category === 'video-chain' &&
                    edge.source === s &&
                    edge.target === t &&
                    edge.targetHandle === u.targetHandle,
                )
                if (inputMatches && edgeMatches) {
                  result.applied += 1
                } else {
                  result.skipped.push({
                    update: u,
                    reason: 'video chain wiring not reflected',
                  })
                }
                break
              }
              case 'connectImage': {
                const s = resolveId(u.sourceId)
                const t = resolveId(u.targetId)
                if (u.targetHandle !== 'image-reference') {
                  result.skipped.push({
                    update: u,
                    reason: 'invalid image target handle',
                  })
                  break
                }
                const source = get().nodes.find((node) => node.id === s)
                const target = get().nodes.find((node) => node.id === t)
                if (!source || !target) {
                  result.skipped.push({ update: u, reason: 'unknown id' })
                  break
                }
                if (!isShotData(target.data)) {
                  result.skipped.push({
                    update: u,
                    reason: 'targetId must be Shot node',
                  })
                  break
                }
                if (!isImageSourceNode(source)) {
                  result.skipped.push({
                    update: u,
                    reason: 'sourceId is not image-capable',
                  })
                  break
                }

                api.wireImageToShot(s, t, u.targetHandle)
                const wiredShot = get().nodes.find((node) => node.id === t)
                const wiredInputs =
                  wiredShot && isShotData(wiredShot.data)
                    ? normalizeImageInputs(wiredShot.data.imageInputs)
                    : null
                const inputMatches = wiredInputs?.includes(s) ?? false
                const edgeMatches = get().edges.some(
                  (edge) =>
                    edge.data?.category === 'image' &&
                    edge.source === s &&
                    edge.target === t &&
                    edge.targetHandle === u.targetHandle,
                )
                if (inputMatches && edgeMatches) {
                  result.applied += 1
                } else {
                  result.skipped.push({
                    update: u,
                    reason: 'image wiring not reflected',
                  })
                }
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

      reset: () => {
        resetPipelineProgressBatches()
        set({
          nodes: initialNodes,
          edges: initialEdges,
          selectedNodeId: null,
          selectedEdgeId: null,
          viewport: { x: 0, y: 0, zoom: 1 },
          viewportInitialized: get().viewportInitializedProjects[get().projectId] === true,
          popupNodeId: null,
          deleteConfirmInfo: null,
          relationModal: null,
          videoBatchBusy: false,
          videoBatchProgress: null,
          generatingNodeIds: {},
          generationErrors: {},
          playingNodeId: null,
          showUnusedAssets: false,
          historyPast: [],
          historyFuture: [],
          lastSavedAt: Date.now(),
        })
      },
    }),
    {
      // Step 2 (unify-director-store-db): localStorage persist는 이제 오프라인 캐시.
      // 진입 시 hydrateFromDb(projectId)가 DB(canvas_position/video_clips)를 진실로
      // 적용해 캐시를 reconcile한다. 충돌 시 DB가 캐넌.
      name: 'tale-director-v1-default',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        // legacy previz 체인 노드와 재구성 가능한 references/chain 엣지만 persist 제외.
        // frame 엣지는 양 끝이 persisted 노드일 때만 아래 필터를 통과한다.
        // 매 진입 시 sync가 rebuild* 로 재생성하므로 파생물 캐시에 남기면 stale 위험.
        nodes: s.nodes.filter(
          (n) =>
            !isDerivedNodeData(n.data) &&
            (!isVideoData(n.data) || n.data.videoClipId !== null),
        ),
        edges: (() => {
          const persistedNodeIds = new Set(
            s.nodes
              .filter(
                (n) =>
                  !isDerivedNodeData(n.data) &&
                  (!isVideoData(n.data) || n.data.videoClipId !== null),
              )
              .map((n) => n.id),
          )
          return s.edges.filter(
            (e) =>
              e.data?.category !== 'references' &&
              e.data?.category !== 'chain' &&
              e.data?.category !== 'video-chain' &&
              e.data?.category !== 'image' &&
              persistedNodeIds.has(e.source) &&
              persistedNodeIds.has(e.target),
          )
        })(),
        viewport: s.viewport,
        // writer 탭과 동일하게 마지막 뷰와 미디어 모드를 복원한다.
        // Node 첫 진입 애니메이션 완료 표시는 프로젝트별로 저장해 새로고침 때 반복하지 않는다.
        viewportInitialized: s.viewportInitialized,
        viewportInitializedProjects: s.viewportInitializedProjects,
        viewMode: s.viewMode,
        storyboardMediaMode: s.storyboardMediaMode,
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
 * Previz 체인 파생 노드(드래그 불가)를 부모 Shot 위치에 상시 정합시킨다(#previz-chain).


/**
 * 새 Scene 노드 자동 위치 — 가장 아래 Scene 아래로 stacking.
 */
export function nextScenePosition(
  state: Pick<DirectorCanvasState, 'nodes'>,
): XYPosition {
  // 초기 배치를 '자동 정렬'(relayoutCanvas)과 동일하게(#d1 2026-07-18). 그룹 폭·시작 x 에
  //   ASSET_OFFSET_X(좌측 asset 컬럼)를 포함해야 asset 노드가 옆 그룹과 겹치지 않는다.
  //   (옛 nextScenePosition 은 ASSET_OFFSET_X 를 빠뜨려 촘촘한 '예전 layout' 이 됐다.)
  const GROUP_WIDTH = ASSET_OFFSET_X + SHOT_OFFSET_X + VIDEO_OFFSET_X + 400
  const scenes = state.nodes.filter((n) => n.data.kind === 'scene')
  if (scenes.length === 0) return { x: 80 + ASSET_OFFSET_X, y: 80 }
  const maxX = Math.max(...scenes.map((n) => n.position.x))
  return { x: maxX + GROUP_WIDTH, y: 80 }
}

// ============================================================================
// Context serialization for LLM
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
        const prompt = effectivePrompt(shData)
        const promptSnippet =
          prompt.length > 60 ? `${prompt.slice(0, 60)}…` : prompt
        const camActive = (
          ['horizontal', 'vertical', 'pan', 'tilt', 'roll', 'zoom'] as const
        ).filter((k) => shData.camera[k] !== 0).length
        const imageInputs = normalizeImageInputs(shData.imageInputs)
        const imageSuffix =
          imageInputs.length > 0
            ? `, image refs: ${imageInputs.join(',')}`
            : ''
        lines.push(
          `  - [${sh.id}] Shot "${shData.label}" (camera ${camActive}/6 active, light ${shData.lighting.position}, ${shData.provider}${imageSuffix})${shData.stale ? ' [stale]' : ''}: ${promptSnippet || '(빈 prompt)'}`,
        )
        const childVideos = nodes.filter(
          (n) => isVideoData(n.data) && n.data.parentShotNodeId === sh.id,
        )
        childVideos.forEach((v) => {
          if (!isVideoData(v.data)) return
          const vData = v.data
          const ovKeys = Object.keys(vData.override).join(',') || '-'
          const frameInputs = normalizeFrameInputs(vData.frameInputs)
          const frameSlots = [
            frameInputs.start ? `START=${frameInputs.start}` : null,
            frameInputs.end ? `END=${frameInputs.end}` : null,
            frameInputs.refs.length > 0
              ? `REF=${frameInputs.refs.join(',')}`
              : null,
          ].filter((value): value is string => value !== null)
          const frameSuffix =
            frameSlots.length > 0 ? `, frames: ${frameSlots.join('; ')}` : ''
          const videoChainSuffix = vData.videoChainInputId
            ? `, previous-video: ${vData.videoChainInputId}${vData.videoChainFrameUrl ? ' (last frame ready)' : ' (last frame pending)'}`
            : ''
          lines.push(
            `      - [${v.id}] Video "${vData.label}" (${vData.status}${vData.final ? ', ★FINAL' : ''}${vData.stale ? ', stale' : ''}, override: ${ovKeys}${frameSuffix}${videoChainSuffix})`,
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
        const imageInputs = normalizeImageInputs(sh.data.imageInputs)
        const imageSuffix =
          imageInputs.length > 0
            ? ` (image refs: ${imageInputs.join(',')})`
            : ''
        lines.push(`  - [${sh.id}] Shot "${sh.data.label}"${imageSuffix}`)
      })
    }
    const standaloneVideos = videos.filter(
      (node) =>
        isVideoData(node.data) && node.data.parentShotNodeId === null,
    )
    if (standaloneVideos.length > 0) {
      lines.push('- (standalone Videos)')
      standaloneVideos.forEach((video) => {
        if (!isVideoData(video.data) || video.data.parentShotNodeId !== null) return
        const config = normalizeStandaloneVideoConfig(video.data.override)
        const prompt = config?.prompt ?? ''
        const promptSnippet =
          prompt.length > 60 ? `${prompt.slice(0, 60)}…` : prompt
        lines.push(
          `  - [${video.id}] Video "${video.data.label}" (${video.data.status}, ${config?.provider ?? 'invalid config'}, ${config?.durationSeconds ?? '?'}s): ${promptSnippet || '(empty prompt)'}`,
        )
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
        lines.push(`- prompt (full): ${effectivePrompt(sel.data) || '(빈)'}`)
        lines.push(`- camera: ${JSON.stringify(sel.data.camera)}`)
        lines.push(`- lighting: ${JSON.stringify(sel.data.lighting)}`)
        lines.push(`- cameraPreset: ${JSON.stringify(sel.data.cameraPreset)}`)
        lines.push(`- provider: ${sel.data.provider}`)
        lines.push(
          `- image-reference inputs: ${normalizeImageInputs(sel.data.imageInputs).join(', ') || '(none)'}`,
        )
      } else if (isVideoData(sel.data)) {
        lines.push(
          sel.data.parentShotNodeId === null
            ? `- standalone owner: ${sel.data.standaloneVideoKey}`
            : `- parent Shot: ${sel.data.parentShotNodeId}`,
        )
        lines.push(`- override: ${JSON.stringify(sel.data.override)}`)
        lines.push(`- status: ${sel.data.status}`)
        lines.push(`- final: ${sel.data.final}`)
        lines.push(
          `- previous-video input: ${sel.data.videoChainInputId ?? '(none)'}`,
        )
        lines.push(
          `- previous-video last frame: ${sel.data.videoChainFrameUrl ? 'ready' : '(none)'}`,
        )
      } else if (isSceneData(sel.data)) {
        lines.push(`- description: ${sel.data.description || '(빈)'}`)
      }
    }
  }

  return lines.join('\n')
}
