import type { Shot, VideoClip, AudioTrackClip, AudioSource } from '@/types'

export interface PersistedEditor {
  version: number
  shots: Shot[]
  clipOrder: Record<string, string[]>
  videoClips: VideoClip[]
  audioClips: AudioTrackClip[]
  audioSources: AudioSource[]
  panelSizes: { sourceW: number; previewH: number }
}

// ── localStorage ──────────────────────────────────────────────────────────────

const LS_PREFIX = 'tale:editor:v1:'
const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>()

export function saveEditorState(projectId: string, data: PersistedEditor): void {
  if (typeof window === 'undefined') return

  const existing = debounceTimers.get(projectId)
  if (existing) clearTimeout(existing)

  const timer = setTimeout(() => {
    try {
      localStorage.setItem(LS_PREFIX + projectId, JSON.stringify(data))
    } catch (err) {
      console.warn('[editor-persistence] localStorage write failed', err)
    }
    debounceTimers.delete(projectId)
  }, 400)

  debounceTimers.set(projectId, timer)
}

export async function loadEditorState(projectId: string): Promise<PersistedEditor | null> {
  if (typeof window === 'undefined') return null

  let parsed: PersistedEditor | null = null
  try {
    const raw = localStorage.getItem(LS_PREFIX + projectId)
    if (!raw) return null
    parsed = JSON.parse(raw) as PersistedEditor
  } catch {
    return null
  }

  // Rehydrate stale object URLs from IndexedDB blobs
  const rehydrate = async (clip: AudioTrackClip | AudioSource) => {
    const key = (clip as { blobKey?: string }).blobKey
    if (!key) return
    const url = await getAudioBlobURL(key)
    if (url) {
      (clip as { url: string }).url = url
    }
  }

  await Promise.all([
    ...parsed.audioClips.map(rehydrate),
    ...parsed.audioSources.map(rehydrate),
  ])

  return parsed
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
