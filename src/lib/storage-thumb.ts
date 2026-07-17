import sharp from 'sharp'
import { supabaseAdmin } from '@/lib/supabase/admin'

// 방법 B: 원본을 media 스토리지에 올릴 때 작은 WebP 썸네일을 원본 옆에 함께 만들어 둔다.
// 그리드/노드는 thumbUrl() 로 이 _thumb.webp 를 읽는다(src/lib/image-url.ts).

const THUMB_WIDTH = 512
const THUMB_QUALITY = 72

/** 원본 storage object 경로 → 썸네일 경로 (foo/bar.png → foo/bar_thumb.webp). */
export function thumbObjectPath(path: string): string {
  const slash = path.lastIndexOf('/')
  const dot = path.lastIndexOf('.')
  if (dot <= slash) return `${path}_thumb.webp`
  return `${path.slice(0, dot)}_thumb.webp`
}

/**
 * 원본 이미지 버퍼로 작은 WebP 썸네일을 만들어 media/<path>_thumb.webp 에 업로드 (best-effort).
 * 실패해도 throw 하지 않는다 — 원본은 이미 저장됐고, 읽기 측(ThumbImage)이 onError 로 원본에 폴백한다.
 */
export async function uploadThumbnail(path: string, original: Buffer): Promise<void> {
  try {
    const thumb = await sharp(original)
      .resize(THUMB_WIDTH, THUMB_WIDTH, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: THUMB_QUALITY })
      .toBuffer()
    const { error } = await supabaseAdmin.storage
      .from('media')
      .upload(thumbObjectPath(path), thumb, {
        contentType: 'image/webp',
        upsert: true,
      })
    if (error) throw error
  } catch (err) {
    console.error(
      '[storage-thumb] thumbnail failed:',
      path,
      err instanceof Error ? err.message : err,
    )
  }
}
