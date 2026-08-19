import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { mediaList, mediaPublicUrl, mediaRemove, mediaUpload } from '@/lib/storage/media'
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

const PREFIX = 'templates'

/** 프로세스당 1회만 해시·업로드하도록 Promise 를 캐시한다. */
const cache = new Map<string, Promise<string | null>>()

/**
 * 순수 판별(테스트 전용 export): 목록에서 base 의 **스테일 형제**(구판 해시 객체)만 고른다.
 *  - 이름은 `${base}-<12hex>${ext}` 정확 패턴만 — base 가 다른 자산 이름의 접두인 경우
 *    (rough-storyboard-grid ⊂ rough-storyboard-grid-cinema)를 잘못 잡지 않는다.
 *  - protectedUrls(queued 잡의 templateUrl)가 가리키는 객체는 제외한다.
 */
export function _staleSiblings(
  names: string[],
  base: string,
  ext: string,
  currentName: string,
  protectedUrls: string[],
): string[] {
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = new RegExp(`^${esc(base)}-[0-9a-f]{12}${esc(ext)}$`)
  return names.filter(
    (n) =>
      n !== currentName &&
      pattern.test(n) &&
      !protectedUrls.some((u) => u.split('?')[0].endsWith(`/${n}`)),
  )
}

// #template-latest-only(2026-08-18 오너 지시 "최신 버전만 관리"): 새 해시가 자리잡으면 같은
//   base 의 구판 객체를 그 자리에서 지운다 — 수동 청소 스크립트 불요. queued 잡이 참조하는
//   객체는 보호: 제출된 fal 요청은 실행 시점에 URL 을 fetch 하므로 지우면 시트 생성이
//   file_download_error 로 죽는다(2026-08-13 사고와 같은 결). 실패는 무해 — URL 반환을 막지
//   않고, 프로세스 캐시가 풀리는 다음 콜드스타트가 재시도한다. Vercel 에서 fire-and-forget 은
//   응답 후 죽으므로 반드시 await 경로에 둔다.
async function removeStaleSiblings(
  base: string,
  ext: string,
  currentName: string,
  names: string[],
): Promise<void> {
  try {
    if (_staleSiblings(names, base, ext, currentName, []).length === 0) return
    const { data: queued } = await supabaseAdmin
      .from('generation_jobs')
      .select('input_snapshot')
      .eq('status', 'queued')
    const protectedUrls = (queued ?? [])
      .map((r) => (r.input_snapshot as { templateUrl?: string } | null)?.templateUrl)
      .filter((u): u is string => typeof u === 'string')
    const stale = _staleSiblings(names, base, ext, currentName, protectedUrls)
    if (stale.length) {
      const { error } = await mediaRemove(stale.map((n) => `${PREFIX}/${n}`))
      if (error) throw error
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[template-asset] stale cleanup skipped', base, message.slice(0, 200))
  }
}

async function ensureUploaded(fileName: string): Promise<string | null> {
  try {
    const localPath = path.join(process.cwd(), 'public', fileName)
    const bytes = await readFile(localPath)
    const hash = createHash('sha256').update(bytes).digest('hex').slice(0, 12)

    const ext = path.extname(fileName) || '.png'
    const base = path.basename(fileName, ext)
    const objectName = `${base}-${hash}${ext}`
    const objectPath = `${PREFIX}/${objectName}`

    // 형제 목록을 한 번에 — 현재 해시 존재 확인(재업로드 방지) + 구판 청소 후보 수집.
    const { data: siblings } = await mediaList(PREFIX, { search: `${base}-`, limit: 100 })

    if (!siblings?.some((o) => o.name === objectName)) {
      const { error } = await mediaUpload(objectPath, bytes, { contentType: 'image/png', upsert: true })
      if (error) throw error
    }

    await removeStaleSiblings(base, ext, objectName, (siblings ?? []).map((o) => o.name))

    return mediaPublicUrl(objectPath)
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
