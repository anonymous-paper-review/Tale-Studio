/**
 * media 버킷 public URL 의 단일 진실원 — 브라우저·서버 양쪽에서 쓴다.
 *
 * 왜 모으는가: public URL 문자열을 만드는 곳과 되짚는 곳이 코드 곳곳에 흩어져 있었다
 * (`getPublicUrl` 17곳, 접두사 하드코딩 3곳). 파일 보관을 다른 회사로 옮기려면 그 전부를
 * 동시에 고쳐야 하고, 하나라도 놓치면 조용히 깨진다 — 특히 `isOwnMediaUrl` 은 모델에게
 * 넘길 주소를 거르는 보안 경계라 실패 방향이 나쁘다(막히거나, 뚫리거나).
 *
 * 이 모듈만 바꾸면 저장 위치를 갈아탈 수 있게 하는 것이 목적이다.
 *
 * 클라이언트 안전: `NEXT_PUBLIC_*` 만 읽는다. 서버 전용 자격증명을 만지지 않으므로
 * 브라우저 번들에 들어가도 된다. 업로드·삭제 같은 쓰기 동작은 `./media` 에 있다.
 */

export const MEDIA_BUCKET = 'media'

// #env-newline(2026-08-24 실사고): Vercel env 값 끝에 개행이 붙어 들어왔다. SDK(getPublicUrl)는
//   조용히 정규화해줬지만 이 모듈은 문자열을 그대로 이어붙여 "https://…co\n/storage/…" 를
//   만들었고 — 판정(mediaPathFromUrl)은 new URL() 이 개행을 벗겨낸 값과 개행 든 접두사를
//   비교하니 **자기가 만든 주소를 자기가 거부**했다(첨부 400 + 채팅 썸네일이 생 URL 로 표시).
//   env 는 신뢰하지 않고 항상 공백·개행을 걷어낸다.
function cleanBase(value: string | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed.replace(/\/+$/, '') : null
}

/**
 * Supabase 파일 보관함의 public 접두사.
 *
 * 이전을 마쳐도 **지우면 안 된다** — DB 에 이미 저장된 9,871개 주소가 이 형태다.
 * 새 주소는 아래 `mediaPublicPrefix()` 가 만들고, 옛 주소는 계속 인식만 한다.
 */
function supabasePublicPrefix(): string | null {
  const base = cleanBase(process.env.NEXT_PUBLIC_SUPABASE_URL)
  if (!base) return null
  return `${base}/storage/v1/object/public/${MEDIA_BUCKET}/`
}

/**
 * 다른 회사 파일 보관함으로 옮겼을 때의 public 접두사.
 *
 * 예: `https://cdn.example.com` → `https://cdn.example.com/`
 *
 * ⚠️ 이 값을 켜는 것은 **업로드 경로까지 그쪽으로 옮긴 뒤**여야 한다. 읽기 주소만 먼저
 * 바꾸면 새로 올린 파일을 아무도 못 받는다.
 */
function overridePublicPrefix(): string | null {
  const base = cleanBase(process.env.NEXT_PUBLIC_MEDIA_PUBLIC_BASE_URL)
  if (!base) return null
  return `${base}/`
}

/** 지금부터 만들 주소가 쓸 접두사. 설정이 없으면 Supabase 형태를 그대로 쓴다. */
export function mediaPublicPrefix(): string | null {
  return overridePublicPrefix() ?? supabasePublicPrefix()
}

/**
 * 우리 것으로 인정하는 접두사 전부.
 *
 * 이전 기간에는 새 주소와 옛 주소가 DB 에 섞여 있다. 되짚기와 보안 검사는 둘 다 통과시켜야
 * 화면이 안 깨진다. 순서는 무관하지만 중복은 제거한다.
 */
export function mediaPublicPrefixes(): string[] {
  const seen = new Set<string>()
  for (const prefix of [overridePublicPrefix(), supabasePublicPrefix()]) {
    if (prefix) seen.add(prefix)
  }
  return [...seen]
}

/**
 * 보관함 경로 → 브라우저가 바로 받을 수 있는 절대 주소.
 *
 * 저장된 경로 9,871개가 전부 `[A-Za-z0-9/._-]` 만 쓰므로(2026-08-19 전수 확인) 이스케이프
 * 없이 이어붙여도 Supabase 가 만들던 주소와 정확히 일치한다. 경로 생성이 전부
 * `storageKeySegment()`(16진수 해시)를 거치기 때문이다.
 */
export function mediaPublicUrl(objectPath: string): string {
  const prefix = mediaPublicPrefix()
  if (!prefix) throw new Error('media public URL 접두사가 설정되지 않았어요') // i18n-ok
  return `${prefix}${objectPath.replace(/^\/+/, '')}`
}

/**
 * public 주소 → 보관함 경로. 우리 주소가 아니면 null.
 *
 * `?v=` 캐시버스트 쿼리는 pathname 밖이라 자동으로 빠진다.
 */
export function mediaPathFromUrl(url: string): string | null {
  let absolute: URL
  try {
    absolute = new URL(url)
  } catch {
    return null
  }
  const withoutQuery = `${absolute.origin}${absolute.pathname}`
  for (const prefix of mediaPublicPrefixes()) {
    if (!withoutQuery.startsWith(prefix)) continue
    const path = decodeURIComponent(withoutQuery.slice(prefix.length))
    if (!path || path.includes('..')) return null
    return path
  }
  return null
}

/**
 * 우리 보관함의 주소인지 검사한다.
 *
 * 보안 경계: 이 주소들은 우리 서버가 아니라 모델 제공자가 가져간다. 검증 없이 통과시키면
 * 사용자가 임의 주소를 넣어 모델에게 대신 가져오게 시킬 수 있다(내부망 주소 포함).
 * 그래서 화이트리스트가 유일한 방어다 — 넓히지 마라.
 */
export function isOwnMediaUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 2048) return false
  return mediaPathFromUrl(value) !== null
}
