// 시트 → 대표 얼굴(포트레이트) 파일(서버 전용) — 그림을 새로 그렸을 때(finalize)와 카드 기록에서 예전 그림을 골랐을 때(select-candidate)가 같은 규칙을 쓴다.
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

/** 보관함(또는 바깥 주소)에서 시트 바이트를 읽는다 — 카드 기록에서 고른 예전 그림의 얼굴을 다시 자를 때. */
export async function readSheetBytes(url: string): Promise<{ path: string | null; bytes: Buffer }> {
  const path = mediaPathFromUrl(url)
  if (path) {
    const { data, error } = await mediaDownload(path)
    if (error || !data) throw new Error(`sheet download failed: ${error?.message ?? 'no data'}`)
    return { path, bytes: Buffer.from(await data.arrayBuffer()) }
  }
  const res = await fetch(url)
  if (!res.ok) throw new Error(`sheet fetch failed: ${res.status}`)
  return { path: null, bytes: Buffer.from(await res.arrayBuffer()) }
}
