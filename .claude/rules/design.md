---
paths:
  - "src/components/**/*.{tsx,ts,css}"
  - "src/app/**/*.{tsx,ts,css}"
---

# Design rules for UI work in tale-studio

UI 작업 전 반드시 `specs/design.md`와 `specs/design-references.md`를 읽으세요
(아직 이번 세션에 읽지 않았다면). 토큰 값의 source-of-truth는 `src/app/globals.css`.

## 4 hard rules (사용자 명시 지시 없이 위반 금지)
1. **Dark-first with light parity**. light-only 금지.
2. **One accent** — CTA + active state만. 카테고리 색 분기 금지.
3. **Geist Mono** — camera-axis 값, render IDs, frame number 표기 필수.
4. **캔버스 확장 토큰** (`--canvas-*`, `--node-*`, `--edge-*`) 사용. 새 토큰 만들지 말 것.

## 토큰 위치
- shadcn CSS variables → `src/app/globals.css`
- 새 색 추가는 globals.css에만 (decisions #30 — "globals.css 토큰 외 신규 색 금지")

## "We are NOT" exclusion list
- **NOT Higgsfield** — glassmorphism / neon glow 금지
- **NOT consumer-creator** — light-mode-first / marketing gradient 금지
- **NOT n8n-style** — saturated 카테고리 배너 금지
- **NOT Vercel-extreme** — pure `#000` 금지 (warm near-black)

## 5 design 원칙 (decisions #30)
1. 캔버스 제일주의 (패널 보조)
2. globals.css 토큰 외 신규 색 금지
3. 모션은 정보 전달 (장식 아님)
4. 키보드 일등 시민
5. 한 화면 정보 위계 2단까지

## 모션 4-tier
- 100ms — micro-interaction (hover, focus)
- 150ms — small state
- 250ms — modal / popup
- 350ms — layout transition
