/**
 * media 버킷 쓰기·읽기의 단일 관문 — **서버 전용**.
 *
 * 왜 모으는가: 보관함 호출이 12개 파일에 직접 박혀 있었다(업로드 17곳, 주소 생성 17곳,
 * 삭제 3곳, 목록 1곳). 저장 위치를 다른 회사로 옮기려면 그 전부를 동시에 고쳐야 하고,
 * 하나라도 놓치면 새 파일만 엉뚱한 곳에 쌓인다. 이 모듈이 그 이음매다.
 *
 * 이 단계에서는 **동작을 바꾸지 않는다.** 반환 형태(`{ data, error }`)를 Supabase 그대로
 * 유지해 호출부의 오류 처리를 손대지 않았다 — 이음매를 옮기는 일과 오류 규약을 바꾸는 일을
 * 같은 커밋에 섞으면 회귀가 어느 쪽에서 났는지 못 가린다.
 *
 * 클라이언트에서 import 하지 마라. 주소 계산만 필요하면 `./media-url` 을 쓴다.
 */

import { supabaseAdmin } from '@/lib/supabase/admin'
import { MEDIA_BUCKET } from './media-url'

export {
  MEDIA_BUCKET,
  mediaPublicUrl,
  mediaPathFromUrl,
  mediaPublicPrefix,
  mediaPublicPrefixes,
  isOwnMediaUrl,
} from './media-url'

function bucket() {
  return supabaseAdmin.storage.from(MEDIA_BUCKET)
}

/**
 * 브라우저 캐시 기간(초). **숫자로 시작하는 문자열만 넘길 것.**
 *
 * Supabase 가 이 값 앞에 `public, max-age=` 를 자동으로 붙여서 내보낸다. 그래서
 * `'public, max-age=14400'` 처럼 통째로 넘기면 `public, max-age=public, max-age=14400` 이
 * 되고, `max-age=public` 은 해석 불가라 브라우저가 캐시를 **아예 포기한다** — 안 넣느니만
 * 못하다(2026-08-23 실측으로 확인). 기간을 늘리고 싶으면 숫자만 바꾼다.
 *
 * 값의 출처: 우리와 **같은 구조**로 서비스하는 Higgsfield 의 실측값이다
 * (2026-08-23, `cdn.higgsfield.ai` 의 생성 이미지·영상 모두 `public, max-age=14400`).
 * 같은 구조란 CDN 직결 + 추측 불가능한 주소를 뜻한다 — 한 번 나간 공개 주소를 나중에
 * 서버가 끊을 수 없으므로, 자기 API 를 경유시켜 요청마다 권한을 다시 보는 곳들이 쓰는
 * 훨씬 긴 값(TapNow 180일 등)을 그대로 가져오면 안 된다.
 *
 * 이 값이 정하는 것은 **브라우저 캐시뿐이다.** CDN 층은 무관하다 — Smart CDN 이 가능한
 * 한 오래 잡고 있다가 파일이 수정·삭제되면 60초 안에 자동으로 무효화한다.
 */
export const MEDIA_CACHE_CONTROL = '14400'

export interface MediaUploadOptions {
  contentType: string
  /** 같은 경로가 이미 있을 때 덮어쓸지. 생략하면 덮어쓰지 않고 409 를 돌려준다. */
  upsert?: boolean
  /** 브라우저 캐시 기간. 생략하면 `MEDIA_CACHE_CONTROL`. 형식 제약은 그 주석을 볼 것. */
  cacheControl?: string
}

/** 보관함 오류의 상태 코드 — StorageApiError.status / statusCode('520') 어느 쪽이든 읽는다. */
function storageErrorStatus(error: unknown): number | null {
  if (!error || typeof error !== 'object') return null
  const e = error as { status?: unknown; statusCode?: unknown }
  const n = typeof e.status === 'number' ? e.status : Number(e.statusCode)
  return Number.isFinite(n) ? n : null
}

const UPLOAD_RETRY_DELAYS_MS = [400, 900]

/**
 * 객체 하나를 올린다. 실패는 던지지 않고 `{ error }` 로 돌려준다.
 *   서버 쪽 일시 오류(5xx — 실측 2026-09-03 러프 finalize 가 520 으로 실패해 잡이 failed 로 남음)는
 *   짧게 두 번 더 시도한다. 4xx(권한·중복)는 즉시 돌려준다.
 */
export async function mediaUpload(
  path: string,
  data: Buffer | Uint8Array | Blob | ArrayBuffer,
  options: MediaUploadOptions,
) {
  const opts = {
    contentType: options.contentType,
    upsert: options.upsert ?? false,
    cacheControl: options.cacheControl ?? MEDIA_CACHE_CONTROL,
  }
  let res = await bucket().upload(path, data, opts)
  for (let i = 0; res.error && i < UPLOAD_RETRY_DELAYS_MS.length; i++) {
    const status = storageErrorStatus(res.error)
    if (status !== null && status < 500) break
    await new Promise((r) => setTimeout(r, UPLOAD_RETRY_DELAYS_MS[i]))
    res = await bucket().upload(path, data, { ...opts, upsert: true })
  }
  return res
}

/** 객체들을 지운다. 존재하지 않는 경로는 오류가 아니다. */
export function mediaRemove(paths: string[]) {
  return bucket().remove(paths)
}

/** 접두사 아래 객체 목록. */
export function mediaList(
  prefix: string,
  options?: { limit?: number; offset?: number; search?: string },
) {
  return bucket().list(prefix, options)
}

/** 객체 메타데이터(크기·타입). 없으면 `error` 가 채워진다. */
export function mediaInfo(path: string) {
  return bucket().info(path)
}

/** 객체 본문을 내려받는다. */
export function mediaDownload(path: string) {
  return bucket().download(path)
}

/** 버킷 내부 객체를 서버에서 복제한다. 외부 URL을 읽지 않는 스냅샷 경계다. */
export function mediaCopy(sourcePath: string, destinationPath: string) {
  return bucket().copy(sourcePath, destinationPath)
}
