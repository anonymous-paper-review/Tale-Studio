// 샷 영상 일괄 ZIP 다운로드 (클라이언트 사이드).
//
// Draft Render(FFmpeg 합성)는 Vercel에서 불가하므로, 임시 대안으로 생성된 샷 영상들을
// 타임라인 순서대로 번호를 붙여 하나의 zip으로 받는다. 영상 URL은 FAL CDN(또는 storage)이며,
// 서버 zip은 Vercel 응답 4.5MB 제한에 걸리므로 브라우저에서 직접 fetch→JSZip→다운로드한다.
// CORS 등으로 받지 못한 항목은 _failed.txt에 URL을 남겨 수동 다운로드를 안내한다.
import JSZip from 'jszip'
import { translate } from '@/lib/i18n/translate'
import type { AppLocale } from '@/lib/locale'
import { useLocaleStore } from '@/stores/locale-store'

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
 * 샷 ZIP 에 담을 클립 — 모든 영상 줄의 클립을 시작 초 차례로, 같은 초면 아래 줄 먼저(2단계 ② V2 · V3, 검토 c ② 낮음 5).
 *   영상이 없는 클립(타이틀 카드 등)은 뺀다. 약속: tests/editor/tracks.test.ts
 */
export function zipClips(
  layout: ReadonlyArray<{ shotId: string; startSec: number; trackId: string }>,
  tracks: ReadonlyArray<{ id: string }>,
  videoClips: readonly ClipLike[],
): { shotId: string; url: string }[] {
  const rank = new Map(tracks.map((t, i) => [t.id, i]))
  return [...layout]
    .sort((a, b) => a.startSec - b.startSec || (rank.get(a.trackId) ?? 0) - (rank.get(b.trackId) ?? 0))
    .flatMap((item) => {
      const url = videoClips.find((c) => c.shotId === item.shotId)?.url
      return url ? [{ shotId: item.shotId, url }] : []
    })
}

/**
 * 타임라인 차례(zipClips)대로 샷 영상을 받아 zip 다운로드.
 * 파일명: `NN_<shotId>.<ext>` (NN = 01부터 0패딩).
 */
export async function downloadShotsZip(opts: {
  clips: { shotId: string; url: string }[]
  fileBaseName?: string
}): Promise<ZipExportResult> {
  const ordered = opts.clips

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
    // 화면 언어로 — 부르는 화면(editor/page)은 건드리지 않고 여기서 화면 언어를 읽는다(2026-11-10 오너 "영어 언어에서 한국어 나오는거 수정").
    zip.file('_failed.txt', failedDownloadsNote(failed, useLocaleStore.getState().locale))
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

/** 자동으로 못 받은 영상 목록 파일(_failed.txt)의 글 — 안내 한 줄 + 영상마다 이름 · 주소 · 까닭. */
export function failedDownloadsNote(failed: readonly string[], locale: AppLocale): string {
  const lead = translate(locale, 'These videos could not be downloaded automatically (CORS or network). Open each URL in your browser to save it:')
  return `${lead}\n\n${failed.join('\n')}\n`
}
