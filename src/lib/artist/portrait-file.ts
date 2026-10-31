// 시트 → 대표 얼굴(포트레이트) 파일(서버 전용) — 그림을 새로 그렸을 때(finalize), 카드 기록에서 예전 그림을 골랐을 때(select-candidate),
//   얼굴 없이 남은 버전을 불러올 때(style-versions-server restoreSnapshot)가 같은 규칙을 쓴다.
//   사람 시트는 좌상단 CHARACTER CONCEPT 칸을 잘라 시트 옆 파일(같은 이름 + _portrait)로 올리고, 사물 · 자를 칸이 없는 그림은 그림 자체가 대표 그림이다.
import { cropTurnaroundPortrait } from '@/lib/artist/portrait'
import { portraitPathForSheet } from '@/lib/artist/image-files'
import { uploadThumbnail } from '@/lib/storage-thumb'
import { mediaDownload, mediaPathFromUrl, mediaPublicUrl, mediaUpload } from '@/lib/storage/media'

/** 대표 얼굴 주소. 올리기에 실패하면 던진다(호출부가 그림 자체는 그대로 둔다). */
export async function portraitUrlForSheet(input: {
  sheetPath: string
  sheetBuf: Buffer
  sheetUrl: string
  entityType: string | null | undefined
}): Promise<string> {
  if (input.entityType === 'object') return input.sheetUrl
  const cropped = await cropTurnaroundPortrait(input.sheetBuf)
  if (!cropped) return input.sheetUrl
  const path = portraitPathForSheet(input.sheetPath)
  const { error } = await mediaUpload(path, cropped, { contentType: 'image/png', upsert: true })
  if (error) throw new Error(`portrait upload failed: ${error.message}`)
  await uploadThumbnail(path, cropped)
  // 같은 시트를 다시 골라도 같은 경로라 캐시 키만 갈아 준다(finalize 의 versionedUrl 과 같은 이유).
  return `${mediaPublicUrl(path)}?v=${Date.now()}`
}

/** 시트 받기를 기다리는 한도 — 보관함 받기가 멈추면 불러오기 전체가 함수 시간 제한까지 기다렸다(2026-10-31 재검토 지적). */
export const SHEET_DOWNLOAD_TIMEOUT_MS = 20_000

function withTimeout<T>(work: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const late = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(`${what} timed out after ${ms}ms`)), ms) })
  return Promise.race([work, late]).finally(() => clearTimeout(timer))
}

/** 보관함(또는 바깥 주소)에서 시트 바이트를 읽는다 — 카드 기록에서 고른 예전 그림 · 불러온 버전 시트의 얼굴을 다시 자를 때. 오래 걸리면 실패로 본다. */
export async function readSheetBytes(url: string, timeoutMs = SHEET_DOWNLOAD_TIMEOUT_MS): Promise<{ path: string | null; bytes: Buffer }> {
  const path = mediaPathFromUrl(url)
  if (path) {
    return withTimeout((async () => {
      const { data, error } = await mediaDownload(path)
      if (error || !data) throw new Error(`sheet download failed: ${error?.message ?? 'no data'}`)
      return { path, bytes: Buffer.from(await data.arrayBuffer()) }
    })(), timeoutMs, 'sheet download')
  }
  return withTimeout((async () => {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) })
    if (!res.ok) throw new Error(`sheet fetch failed: ${res.status}`)
    return { path: null, bytes: Buffer.from(await res.arrayBuffer()) }
  })(), timeoutMs, 'sheet fetch')
}

/** 보관함의 시트 주소로 대표 얼굴을 만든다 — 사물 · 바깥 주소는 시트 자체, 사람은 시트에서 잘라 옆에 올린다. 못 하면 던진다. */
export async function portraitForSheetUrl(sheetUrl: string, entityType: string | null | undefined): Promise<string> {
  if (entityType === 'object') return sheetUrl
  const sheet = await readSheetBytes(sheetUrl)
  if (!sheet.path) return sheetUrl
  return portraitUrlForSheet({ sheetPath: sheet.path, sheetBuf: sheet.bytes, sheetUrl, entityType })
}
