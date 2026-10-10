// 그림체 분석 대기(2026-10-10 오너 "writer 생성 파이프라인과 그림체 분석을 병렬로 돌리고, 그림체 분석이 진행 중에는
//   artist 생성이 안 되게 막아두고 끝나면 진행") — 순수 판정만 둔다.
//   그림을 그림체로 고정하면(그림체 등록 창구 lock) 곧 분석기가 돈다는 표시(analysis_pending_at)를 앵커에 남기고, 분석이 성공하면 지운다.
//   Writer 는 기다리지 않는다 — Artist 그림만 이 표시를 보고 미루고, 분석 창구가 끝을 알리며(실패해도) 다시 부른다.

/** 분석 창구 한도(300초) — 이보다 오래된 표시는 멈춘 분석이라 Artist 를 막지 않는다. */
export const STYLE_ANALYSIS_WAIT_MS = 5 * 60_000

/** 이 프로젝트 그림체(custom_style_anchor)의 분석이 아직 도는가 — 결과가 있거나 표시가 없거나 오래됐으면 아니다. */
export function styleAnalysisPending(customStyleAnchor: unknown, now: number = Date.now()): boolean {
  if (!customStyleAnchor || typeof customStyleAnchor !== 'object') return false
  const anchor = customStyleAnchor as { analysis_pending_at?: unknown; facets?: unknown }
  if (anchor.facets) return false
  if (typeof anchor.analysis_pending_at !== 'string') return false
  const at = Date.parse(anchor.analysis_pending_at)
  return Number.isFinite(at) && now - at < STYLE_ANALYSIS_WAIT_MS
}
