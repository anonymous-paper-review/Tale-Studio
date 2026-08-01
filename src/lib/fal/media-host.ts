// fal 미디어 CDN 호스트 판별 (#fal-cdn-host 2026-08-01).
//
// 정적 목록('fal.media', 'v3.fal.media')을 쓰다가, fal 이 새 CDN 호스트 `v3b.fal.media` 로
//   내보내기 시작하면서(같은 모델이 07-15 성공 → 07-31 실패) 정상 생성된 영상이 전부
//   'invalid video url in provider result' 로 죽었다. 호스트 이름은 provider 사정으로 계속
//   늘어나므로(v3 → v3b → …) 개별 이름을 세지 않고 **도메인 소속**으로 판정한다.
//
// SSRF 방어 의도는 그대로다: 우리가 fetch 하는 대상을 provider 도메인 안으로 묶는 것이 목적이지
//   특정 호스트명을 열거하는 것이 목적이 아니었다. 접미사 판정은 반드시 점까지 포함해서 본다 —
//   'evilfal.media' 는 '.fal.media' 로 끝나지 않으므로 통과하지 못한다.

const FAL_MEDIA_DOMAIN = 'fal.media'

/** hostname 이 fal 미디어 도메인(또는 그 서브도메인)인가. 포트/스킴 검사는 호출부 몫. */
export function isFalMediaHost(hostname: string): boolean {
  const host = hostname.trim().toLowerCase()
  return host === FAL_MEDIA_DOMAIN || host.endsWith(`.${FAL_MEDIA_DOMAIN}`)
}
