import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { supabaseAdmin } from '@/lib/supabase/admin'

/**
 * 생성 모델이 reference 로 가져가는 정적 템플릿 이미지의 public URL.
 *
 * 왜 필요한가: 이 템플릿들은 `public/` 에 있는 고정 자산인데, 지금까지는
 * `resolveWebhookBaseUrl()`(= NEXT_PUBLIC_APP_URL) 로 절대 URL 을 만들어 fal 에 넘겼다.
 * 그러면 **앱이 외부에 공개돼 있어야만** 이미지 생성이 돌아간다. 로컬 개발에서 터널이
 * 죽거나 주소가 바뀌면 fal 이 템플릿을 못 받아 전량 실패한다:
 *
 *   status=422 | {"loc":["body","input.image_urls"],"type":"file_download_error",
 *                 "input":"https://<터널>/rough-storyboard-grid.png"}
 *
 * 2026-08-13 실제로 이 사고로 러프 스토리보드 80건이 연속 실패하고 재시도 루프에 갇혔다.
 * 웹훅 콜백은 본질적으로 외부 도달이 필요해 터널이 불가피하지만, **정적 자산은 아니다.**
 * 이미 모든 생성 이미지가 사는 Supabase `media` 버킷에 올려두면 터널과 무관해진다.
 *
 * 스테일 방지: 저장 경로에 파일 내용 해시를 넣는다. 레포의 PNG 를 교체하면 해시가 바뀌어
 * 자동으로 새 객체가 올라간다 — 수동 재업로드 단계가 없다.
 */

const BUCKET = 'media'
const PREFIX = 'templates'

/** 프로세스당 1회만 해시·업로드하도록 Promise 를 캐시한다. */
const cache = new Map<string, Promise<string | null>>()

async function ensureUploaded(fileName: string): Promise<string | null> {
  try {
    const localPath = path.join(process.cwd(), 'public', fileName)
    const bytes = await readFile(localPath)
    const hash = createHash('sha256').update(bytes).digest('hex').slice(0, 12)

    const ext = path.extname(fileName) || '.png'
    const base = path.basename(fileName, ext)
    const objectPath = `${PREFIX}/${base}-${hash}${ext}`

    // 이미 있으면 1.4MB 를 다시 올리지 않는다(콜드스타트마다 재업로드 방지).
    const { data: existing } = await supabaseAdmin.storage
      .from(BUCKET)
      .list(PREFIX, { search: `${base}-${hash}${ext}`, limit: 1 })

    if (!existing?.length) {
      const { error } = await supabaseAdmin.storage
        .from(BUCKET)
        .upload(objectPath, bytes, { contentType: 'image/png', upsert: true })
      if (error) throw error
    }

    return supabaseAdmin.storage.from(BUCKET).getPublicUrl(objectPath).data.publicUrl
  } catch (error) {
    // 실패해도 던지지 않는다 — 호출부는 templateUrl 이 null 이면 T2I 폴백으로 내려간다.
    const message = error instanceof Error ? error.message : String(error)
    console.error('[template-asset] upload failed', fileName, message.slice(0, 200))
    return null
  }
}

/**
 * `public/<fileName>` 을 스토리지에 올려두고 public URL 을 돌려준다.
 * 실패하면 null — 호출부는 템플릿 없이(T2I) 진행한다.
 */
export function templateAssetUrl(fileName: string): Promise<string | null> {
  const cached = cache.get(fileName)
  if (cached) return cached

  const pending = ensureUploaded(fileName)
  cache.set(fileName, pending)
  return pending
}

export function _clearTemplateAssetCacheForTest(): void {
  cache.clear()
}
