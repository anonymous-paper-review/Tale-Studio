import JSZip from 'jszip'

import { sanitizeSegment } from './sanitize'
import type { ArtifactFile, ExportResult } from './types'

export function extOfContentType(ct: string | null, url: string): 'png' | 'jpg' | 'mp4' | 'bin' {
  const contentType = (ct ?? '').split(';')[0]?.trim().toLowerCase() ?? ''

  if (contentType === 'image/png' || contentType.endsWith('/png')) return 'png'
  if (
    contentType === 'image/jpeg' ||
    contentType === 'image/jpg' ||
    contentType.endsWith('/jpeg') ||
    contentType.endsWith('/jpg')
  ) {
    return 'jpg'
  }
  if (contentType === 'video/mp4' || contentType.includes('mp4') || contentType.startsWith('video/')) {
    return 'mp4'
  }

  const cleanUrl = url.split(/[?#]/)[0] ?? ''
  const dot = cleanUrl.lastIndexOf('.')
  const ext = dot >= 0 ? cleanUrl.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, '') : ''

  if (ext === 'png') return 'png'
  if (ext === 'jpg' || ext === 'jpeg') return 'jpg'
  if (ext === 'mp4') return 'mp4'

  return 'bin'
}

export async function buildZipBlob(
  files: ArtifactFile[],
): Promise<{ blob: Blob; result: ExportResult }> {
  const zip = new JSZip()
  const mediaByUrl = new Map<string, ArtifactFile[]>()
  const failed: string[] = []
  let downloaded = 0

  for (const file of files) {
    if (file.kind !== 'media' || !file.url) continue

    const group = mediaByUrl.get(file.url)
    if (group) {
      group.push(file)
    } else {
      mediaByUrl.set(file.url, [file])
    }
  }

  const processedUrls = new Set<string>()

  for (const file of files) {
    if (file.kind === 'text') {
      if (file.content == null) {
        failed.push(`${file.path}\t\tmissing content`)
        continue
      }

      zip.file(file.path, file.content)
      downloaded += 1
      continue
    }

    // 클라 생성 바이너리(캔버스 캡처 등) — fetch 없이 바로 zip에 담는다.
    if (file.blob) {
      zip.file(file.path, file.blob)
      downloaded += 1
      continue
    }

    const url = file.url
    if (!url) {
      failed.push(`${file.path}\t\tmissing url`)
      continue
    }

    if (processedUrls.has(url)) continue
    processedUrls.add(url)

    const group = mediaByUrl.get(url) ?? []
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)

      const buffer = await res.arrayBuffer()
      for (const mediaFile of group) {
        zip.file(mediaFile.path, buffer)
        downloaded += 1
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'error'
      for (const mediaFile of group) {
        failed.push(`${mediaFile.path}\t${url}\t${message}`)
      }
    }
  }

  if (failed.length) {
    zip.file('_failed.txt', `${failed.join('\n')}\n`)
  }

  const blob = await zip.generateAsync({ type: 'blob', streamFiles: true })

  return {
    blob,
    result: { total: files.length, downloaded, failed: failed.length },
  }
}

export async function bundleAndDownload(files: ArtifactFile[], zipName: string): Promise<ExportResult> {
  const { blob, result } = await buildZipBlob(files)
  const downloadName = `${sanitizeSegment(zipName.replace(/\.zip$/i, ''))}.zip`

  if (typeof document !== 'undefined') {
    const href = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = href
    a.download = downloadName
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(href)
  }

  return result
}
