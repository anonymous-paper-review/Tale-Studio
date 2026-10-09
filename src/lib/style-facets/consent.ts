// 그림을 분석 모델에 보내도 된다는 동의 문구 판 (2026-10-09). 지금은 만화 원고 질문 하나다 —
//   그림을 분석 모델로 보낸다는 안내를 읽고 "만화 원고로 그대로 영상화"를 고른 것.
//   그림체 분석(/api/produce/style-facets)과 매체 고르기(/api/produce/anchor-medium)가 같은 판을 받는다.
/** 만화 원고 질문의 안내 문구 판 — 질문의 안내(imageBatchQuestion)를 바꾸면 판도 올린다. */
export const COMIC_ANALYSIS_CONSENT = 'comic-choice-v1'

const ANALYSIS_CONSENTS = new Set([COMIC_ANALYSIS_CONSENT])

export function isAnalysisConsent(consent: unknown): consent is string {
  return typeof consent === 'string' && ANALYSIS_CONSENTS.has(consent)
}
