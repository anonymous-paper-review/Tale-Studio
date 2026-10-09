// 그림을 분석 모델에 보내도 된다는 동의 문구 판 (2026-10-09). 채팅의 만화 원고 질문과 새 프로젝트의 쓰임새 고르기 —
//   둘 다 그림을 분석 모델로 보낸다는 안내를 읽고 만화 원고(또는 그림체)를 고른 것.
//   그림체 분석(/api/produce/style-facets)과 매체 고르기(/api/produce/anchor-medium)가 같은 판을 받는다.
/** 만화 원고 질문의 안내 문구 판 — 질문의 안내(imageBatchQuestion)를 바꾸면 판도 올린다. */
export const COMIC_ANALYSIS_CONSENT = 'comic-choice-v1'
/** 새 프로젝트 화면의 안내 문구 판 — 만화 원고 · 그림체를 고를 때 보이는 안내(analysisNotice)를 바꾸면 판도 올린다. */
export const CREATION_ANALYSIS_CONSENT = 'creation-choice-v1'

/** 채팅의 그림마다 질문 안내 문구 판(2026-10-10) — 그림체 · 만화 원고를 고르면 분석 모델로 보낸다는 안내를 바꾸면 판도 올린다. */
export const CHAT_IMAGE_ROLE_CONSENT = 'chat-image-role-v1'

const ANALYSIS_CONSENTS = new Set([COMIC_ANALYSIS_CONSENT, CREATION_ANALYSIS_CONSENT, CHAT_IMAGE_ROLE_CONSENT])

export function isAnalysisConsent(consent: unknown): consent is string {
  return typeof consent === 'string' && ANALYSIS_CONSENTS.has(consent)
}
