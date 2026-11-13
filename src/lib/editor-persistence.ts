import { toast } from 'sonner'
import type { Shot, VideoClip, AudioTrackClip, AudioSource } from '@/types'
import { translate } from '@/lib/i18n'
import { useLocaleStore } from '@/stores/locale-store'

export interface PersistedEditor {
  version: number
  shots: Shot[]
  clipOrder: Record<string, string[]>
  videoClips: VideoClip[]
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
