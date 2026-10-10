// 그림을 분석 모델에 보내도 된다는 동의 문구 판 (2026-10-09). 채팅의 만화 원고 질문과 새 프로젝트의 쓰임새 고르기 —
//   둘 다 그림을 분석 모델로 보낸다는 안내를 읽고 만화 원고(또는 그림체)를 고른 것.
//   그림체 분석(/api/produce/style-facets)과 매체 고르기(/api/produce/anchor-medium)가 같은 판을 받는다.
/** 만화 원고 질문의 안내 문구 판 — 질문의 안내(imageBatchQuestion)를 바꾸면 판도 올린다. */
export const COMIC_ANALYSIS_CONSENT = 'comic-choice-v1'
/** 새 프로젝트 화면의 안내 문구 판 — 만화 원고 · 그림체를 고를 때 보이는 안내(analysisNotice)를 바꾸면 판도 올린다. */
export const CREATION_ANALYSIS_CONSENT = 'creation-choice-v1'

/** 채팅의 그림마다 질문 안내 문구 판(2026-10-10) — 그림체 · 만화 원고를 고르면 분석 모델로 보낸다는 안내를 바꾸면 판도 올린다. */
export const CHAT_IMAGE_ROLE_CONSENT = 'chat-image-role-v1'

/** 스타일 선택 창의 "내 그림체 올리기" 카드 안내 문구 판(2026-10-10) — 카드의 분석 모델 안내를 바꾸면 판도 올린다. */
export const STYLE_PICKER_CONSENT = 'style-picker-v1'

/** 채팅에서 그림을 붙이고 "그림체로 · 스타일로 써 줘"라고 말해 고름(2026-10-10) — 질문의 안내를 보지 않았다. 분석한다는 말은 진행 문장으로 알린다. */
export const CHAT_STYLE_REQUEST_CONSENT = 'chat-style-request-v1'

/** 채팅 모델이 첨부 그림을 그림체로 쓰자고 할 때 묻는 질문의 안내 문구 판(2026-10-10 오너 결정) — 분석 모델로 보내고 고정된다는 안내를 바꾸면 판도 올린다. */
export const CHAT_STYLE_CONFIRM_CONSENT = 'chat-style-confirm-v1'

const ANALYSIS_CONSENTS = new Set([COMIC_ANALYSIS_CONSENT, CREATION_ANALYSIS_CONSENT, CHAT_IMAGE_ROLE_CONSENT, STYLE_PICKER_CONSENT, CHAT_STYLE_REQUEST_CONSENT, CHAT_STYLE_CONFIRM_CONSENT])

export function isAnalysisConsent(consent: unknown): consent is string {
  return typeof consent === 'string' && ANALYSIS_CONSENTS.has(consent)
}
