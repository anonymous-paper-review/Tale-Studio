import { toast } from 'sonner'
import type { Shot, VideoClip, AudioTrackClip, AudioSource } from '@/types'
import { translate } from '@/lib/i18n'
import { useLocaleStore } from '@/stores/locale-store'

export interface PersistedEditor {
  /** 1 = 붙은 줄(빈 곳 없음) · 2 = 자유 배치 — 클립마다 줄 · 시작 초(placements)를 함께 적는다(오너 답 1, 2026-11-14). */
  version: number
  /**
   * 서버 편집과 견주는 화면(E2b 고침 뒤)이 쓴 저장본 — 이 표시가 있는 서버 저장본은 이 브라우저의 고침 전 저장본보다 먼저 연다
   *   (검토 c, 2026-11-14). 표시가 없으면 고침 전 저장본끼리라 이 브라우저 것이 먼저다(E2b 로 비워진 프로젝트 되살리기).
   */
  serverAware?: boolean
  shots: Shot[]
  clipOrder: Record<string, string[]>
  /**
   * 사람이 타임라인에서 뺀 원본 샷(검토 c, 2026-11-14) — 영상이 없어져 저절로 빠진 샷은 영상이 생기면 돌아오지만 이 샷들은 돌아오지 않는다.
   *   없으면 고침 전 저장본: 그때는 영상 없는 샷도 빈 칸으로 순서에 있었으니, 저장할 때 있었는데 순서에 없는 샷이 사람이 뺀 샷이다.
   */
  removedShotIds?: string[]
  videoClips: VideoClip[]
  /** 2판: 타임라인에 놓인 클립의 줄(지금은 영상 한 줄 'v1')과 시작 초. 없으면(1판) 지금 보이는 자리 = 붙은 줄. */
  placements?: Record<string, { trackId: string; startSec: number }>
  audioClips: AudioTrackClip[]
  audioSources: AudioSource[]
  audioTracks?: { id: string }[]
  panelSizes: { sourceW: number; previewH: number }
}

// ── localStorage ──────────────────────────────────────────────────────────────

const LS_PREFIX = 'tale:editor:v1:'
const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>()

// 저장해 둔 편집의 오디오 파일(IndexedDB)을 다시 잇기를 기다리는 한도(QA 2026-11-03 밤 "Editor에서 무한 로딩").
//   저장소가 답하지 않거나(다른 탭이 잡고 있음) 고장 나면 그 파일 없이 나머지 편집을 연다 — 기다림이 끝나지 않으면
//   그 뒤의 영상 길이 재기 · 첫 진입 오디오 놓기가 영영 안 됐다. 약속: tests/editor/saved-edit-load.test.ts
export const AUDIO_BLOB_TIMEOUT_MS = 5_000

// 이 브라우저에 쓰지 못했다고(저장 공간이 꽉 참 등) 알린 프로젝트 — 프로젝트당 한 번만(검토 A E2a).
//   예전에는 개발자 콘솔에만 남기고 조용히 실패해, 다시 열면 옛 편집이나 처음 상태가 보였다. 약속: tests/editor/save-size.test.ts
const localFailNotified = new Set<string>()

function writeLocal(projectId: string, data: PersistedEditor): void {
  try {
    localStorage.setItem(LS_PREFIX + projectId, JSON.stringify(data))
  } catch (err) {
    console.warn('[editor-persistence] localStorage write failed', err)
    if (localFailNotified.has(projectId)) return
    localFailNotified.add(projectId)
    toast.error(translate(useLocaleStore.getState().locale, "Couldn't save your edits in this browser. Browser storage may be full."))
  }
}

export function saveEditorState(projectId: string, data: PersistedEditor): void {
  if (typeof window === 'undefined') return

  const existing = debounceTimers.get(projectId)
  if (existing) clearTimeout(existing)

  const timer = setTimeout(() => {
    writeLocal(projectId, data)
    debounceTimers.delete(projectId)
  }, 400)

  debounceTimers.set(projectId, timer)
}

/** 지금 바로 쓴다(기다리던 쓰기는 버린다) — Editor 를 처음 열 때 소리를 다 나눈 결과를 편집 화면을 열기 전에 남긴다(오너 2026-11-10). */
export function saveEditorStateNow(projectId: string, data: PersistedEditor): void {
  if (typeof window === 'undefined') return
  const existing = debounceTimers.get(projectId)
  if (existing) clearTimeout(existing)
  debounceTimers.delete(projectId)
  writeLocal(projectId, data)
}

const BEFORE_V2_PREFIX = 'tale:editor:v1:before-v2:'

/**
 * 이 브라우저 저장본이 옛 형식(1판)이면 새 형식으로 옮겨 적기 전에 따로 칸에 그대로 한 벌 남긴다 — 처음 한 번만 쓰고 덮지 않는다
 *   (리드 2026-11-14, 2단계 위험 2). 서버 저장본 안 한 벌(beforeV2)과 같은 뜻이고, 서버에 못 올린 이 브라우저 고침은 여기에만 남는다.
 *   되살리는 화면은 아직 없다. 약속: tests/editor/free-placement.test.ts
 */
function keepBeforeV2(projectId: string, raw: string, version: unknown): void {
  if (typeof version === 'number' && version >= 2) return
  try {
    if (localStorage.getItem(BEFORE_V2_PREFIX + projectId) == null) localStorage.setItem(BEFORE_V2_PREFIX + projectId, raw)
  } catch {
    // 저장 공간이 꽉 찼다 — 남기지 못한다. 여는 것은 막지 않는다.
  }
}

export async function loadEditorState(projectId: string): Promise<PersistedEditor | null> {
  if (typeof window === 'undefined') return null

  let parsed: PersistedEditor | null = null
  try {
    const raw = localStorage.getItem(LS_PREFIX + projectId)
    if (!raw) return null
    parsed = JSON.parse(raw) as PersistedEditor
    // 읽을 때 남긴다 — 이 브라우저 저장본은 이것을 읽은 뒤에야 새 형식으로 덮인다.
    keepBeforeV2(projectId, raw, parsed.version)
  } catch {
    return null
  }

  // Rehydrate stale object URLs from IndexedDB blobs — 저장소가 고장 나면 그 파일만 건너뛰고, 한도가 지나면 기다리지 않는다.
  await rehydrateAudioUrls(parsed)
  return parsed
}

/**
 * 저장본의 올린 소리 파일(blobKey) 주소를 이 브라우저 저장소의 파일로 다시 잇는다 — 저장소가 고장 나면 그 파일만 건너뛰고,
 *   한도(AUDIO_BLOB_TIMEOUT_MS)가 지나면 기다리지 않는다.
 *   dropMissing 이면 이 브라우저에 없는 파일의 옛 주소(blob:)를 비운다 — 다른 브라우저에서 올린 소리는 자리 · 파형만 남고
 *   소리는 나지 않는다(E2b, 서버에서 연 편집). 약속: tests/editor/other-browser.test.ts
 */
export async function rehydrateAudioUrls(
  saved: Pick<PersistedEditor, 'audioClips' | 'audioSources'>,
  dropMissing = false,
): Promise<void> {
  const items: Array<AudioTrackClip | AudioSource> = [...(saved.audioClips ?? []), ...(saved.audioSources ?? [])]
  const relinked = new Set<AudioTrackClip | AudioSource>()
  const rehydrate = async (clip: AudioTrackClip | AudioSource) => {
    const key = (clip as { blobKey?: string }).blobKey
    if (!key) return
    const url = await getAudioBlobURL(key).catch(() => null)
    if (url) {
      (clip as { url: string }).url = url
      relinked.add(clip)
    }
  }

  let timer: ReturnType<typeof setTimeout> | undefined
  await Promise.race([
    Promise.all(items.map(rehydrate)),
    new Promise<void>((resolve) => {
      timer = setTimeout(resolve, AUDIO_BLOB_TIMEOUT_MS)
    }),
  ]).finally(() => clearTimeout(timer))

  if (!dropMissing) return
  for (const item of items) {
    if (item.blobKey && !relinked.has(item) && typeof item.url === 'string' && item.url.startsWith('blob:')) {
      (item as { url: string }).url = ''
    }
  }
}

export function clearEditorState(projectId: string): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.removeItem(LS_PREFIX + projectId)
  } catch {
    // swallow
  }
}

// ── IndexedDB ─────────────────────────────────────────────────────────────────

const IDB_NAME = 'tale-editor'
const IDB_VERSION = 1
const IDB_STORE = 'audio'

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, IDB_VERSION)
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE)
      }
    }
    req.onsuccess = (e) => resolve((e.target as IDBOpenDBRequest).result)
    req.onerror = (e) => reject((e.target as IDBOpenDBRequest).error)
  })
}

export async function putAudioBlob(blobKey: string, blob: Blob): Promise<void> {
  if (typeof window === 'undefined' || !window.indexedDB) return
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite')
    const req = tx.objectStore(IDB_STORE).put(blob, blobKey)
    req.onsuccess = () => resolve()
    req.onerror = (e) => reject((e.target as IDBRequest).error)
  })
}

export async function getAudioBlobURL(blobKey: string): Promise<string | null> {
  if (typeof window === 'undefined' || !window.indexedDB) return null
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readonly')
    const req = tx.objectStore(IDB_STORE).get(blobKey)
    req.onsuccess = (e) => {
      const blob = (e.target as IDBRequest<Blob | undefined>).result
      resolve(blob ? URL.createObjectURL(blob) : null)
    }
    req.onerror = (e) => reject((e.target as IDBRequest).error)
  })
}

export async function deleteAudioBlob(blobKey: string): Promise<void> {
  if (typeof window === 'undefined' || !window.indexedDB) return
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite')
    const req = tx.objectStore(IDB_STORE).delete(blobKey)
    req.onsuccess = () => resolve()
    req.onerror = (e) => reject((e.target as IDBRequest).error)
  })
}
