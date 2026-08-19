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

export interface MediaUploadOptions {
  contentType: string
  /** 같은 경로가 이미 있을 때 덮어쓸지. 생략하면 덮어쓰지 않고 409 를 돌려준다. */
  upsert?: boolean
}

/** 객체 하나를 올린다. 실패는 던지지 않고 `{ error }` 로 돌려준다. */
export function mediaUpload(
  path: string,
  data: Buffer | Uint8Array | Blob | ArrayBuffer,
  options: MediaUploadOptions,
) {
  return bucket().upload(path, data, {
    contentType: options.contentType,
    upsert: options.upsert ?? false,
  })
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
