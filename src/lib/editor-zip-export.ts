// 샷 영상 일괄 ZIP 다운로드 (클라이언트 사이드).
//
// Draft Render(FFmpeg 합성)는 Vercel에서 불가하므로, 임시 대안으로 생성된 샷 영상들을
// 타임라인 순서대로 번호를 붙여 하나의 zip으로 받는다. 영상 URL은 FAL CDN(또는 storage)이며,
// 서버 zip은 Vercel 응답 4.5MB 제한에 걸리므로 브라우저에서 직접 fetch→JSZip→다운로드한다.
// CORS 등으로 받지 못한 항목은 _failed.txt에 URL을 남겨 수동 다운로드를 안내한다.
import JSZip from 'jszip'

interface ShotLike {
  shotId: string
  sceneId: string
}
interface ClipLike {
  shotId: string
  url: string | null
}

export interface ZipExportResult {
  total: number // url 있는(다운로드 시도) 클립 수
  downloaded: number
  failed: number
}

function extOf(url: string): string {
  const clean = url.split('?')[0]
  const dot = clean.lastIndexOf('.')
  if (dot < 0) return 'mp4'
  const ext = clean.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, '')
  return ext && ext.length <= 4 ? ext : 'mp4'
}

/**
 * 타임라인 순서(씬 순 × clipOrder)대로 샷 영상을 받아 zip 다운로드.
 * 파일명: `NN_<shotId>.<ext>` (NN = 01부터 0패딩). url 없는 샷은 제외.
 */
export async function downloadShotsZip(opts: {
  shots: ShotLike[]
  videoClips: ClipLike[]
  clipOrder: Record<string, string[]>
  fileBaseName?: string
}): Promise<ZipExportResult> {
  const { shots, videoClips, clipOrder } = opts

  // 씬 순서 = shots(정렬됨)에서 처음 등장 순.
  const sceneOrder: string[] = []
  for (const s of shots) if (!sceneOrder.includes(s.sceneId)) sceneOrder.push(s.sceneId)

  const ordered: { shotId: string; url: string }[] = []
  for (const sceneId of sceneOrder) {
    for (const shotId of clipOrder[sceneId] ?? []) {
      const clip = videoClips.find((c) => c.shotId === shotId)
      if (clip?.url) ordered.push({ shotId, url: clip.url })
    }
  }

  if (ordered.length === 0) return { total: 0, downloaded: 0, failed: 0 }

  const zip = new JSZip()
  const cache = new Map<string, Blob>() // 같은 url 중복 fetch 방지(반복 샷)
  const failed: string[] = []
  let downloaded = 0

  for (let i = 0; i < ordered.length; i++) {
    const { shotId, url } = ordered[i]
    const name = `${String(i + 1).padStart(2, '0')}_${shotId}.${extOf(url)}`
    try {
      let blob = cache.get(url)
      if (!blob) {
        const res = await fetch(url)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        blob = await res.blob()
        cache.set(url, blob)
      }
      zip.file(name, blob)
      downloaded++
    } catch (e) {
      failed.push(`${name}\t${url}\t(${e instanceof Error ? e.message : 'error'})`)
    }
  }

  if (failed.length) {
    zip.file(
      '_failed.txt',
      '아래 영상은 자동 다운로드에 실패했습니다(CORS/네트워크). 브라우저에서 URL을 직접 열어 받으세요:\n\n' +
        failed.join('\n') +
        '\n',
    )
  }

  const blob = await zip.generateAsync({ type: 'blob' })
  const href = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = href
  a.download = `${opts.fileBaseName ?? 'draft_shots'}.zip`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(href)

  return { total: ordered.length, downloaded, failed: failed.length }
}
