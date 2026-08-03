// 랜딩 쇼케이스 영상 슬롯 (#landing-v2 2026-08-03).
//
// ★ 동의받은 사용자(배우) 영상이 준비되면 아래 videoUrl 에 URL 만 넣으면 된다 — 코드 수정 불필요.
//   null 이면 랜딩은 시네마틱 그라디언트 플레이스홀더를 대신 그린다(방문자에게 빈 슬롯을
//   드러내지 않음). poster 는 LCP 용 정지 이미지(권장 — 영상보다 먼저 뜬다).
//   호스팅은 Supabase media 버킷 공개 URL 그대로 사용 가능. 히어로 영상은 짧은 루프(<15s)
//   + 강한 압축을 권장 — 모바일 첫 화면 대역폭이 곧 이탈률이다.

export interface ShowcaseSlot {
  videoUrl: string | null
  poster: string | null
}

export const LANDING_SHOWCASE: Record<'hero' | 'previz' | 'collab', ShowcaseSlot> = {
  /** 히어로 배경 — 대표 작품 루프 */
  hero: { videoUrl: null, poster: null },
  /** "목각 → 실사 → 영상" 섹션 — 같은 샷의 변신 과정 */
  previz: { videoUrl: null, poster: null },
  /** 공유·리뷰 섹션 — 협업 장면 or 공유 화면 캡처 */
  collab: { videoUrl: null, poster: null },
}
