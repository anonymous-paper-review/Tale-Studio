// 인물 규칙 줄("Figure rules: …")의 고정 문구 — 조립(style-anchor)과 모델 글 한도 맞추기(fal/prompt-limit)가 함께 쓴다.
//   두 모듈이 서로를 불러오면 고리가 생겨(style-anchor → fal) 여기 따로 둔다. 문구는 style-anchor.ts 가 그대로 다시 내보낸다.

/** 인물 규칙 줄의 머리 — 이 머리로 시작하는 줄이 그 프롬프트의 인물 규칙이다. */
export const FIGURE_RULES_PREFIX = 'Figure rules: '

export const FACET_EXPRESSION_PRIORITY = 'These eye traits describe the relaxed face; when the scene calls for an expression, the expression sets the lid opening and corner angle and takes priority over these defaults, while the iris rendering, the single catchlight (kept even when the eye is narrowed or angry) and the outline colour stay as described.'

// 인물 조각의 비례 수치(약 7.9등신 등)는 그 스타일의 평균적인 성인 기준이다 — 아이 · 노인에게 어른 비례가 실리지 않게(2026-10-08 오너 결정 4).
//   조각 문자열은 인계 산출물 그대로 두고, 스타일마다 숫자가 달라 숫자 없이 어느 스타일에나 맞게 붙인다.
export const FACET_ADULT_PROPORTIONS = 'In this style, the proportions above are those of an average adult; children, elderly people and other body types keep their own natural proportions in the same rendering.'

// 조각에 표정 우선 문장이 이미 있는가(인계 §4 — 있으면 FACET_EXPRESSION_PRIORITY 를 다시 붙이지 않는다). 글 한도를 맞출 때도 이 문장은 남긴다.
export const EXPRESSION_PRIORITY_RE = /expression[^.]*\bpriority\b|\bpriority\b[^.]*expression/i
