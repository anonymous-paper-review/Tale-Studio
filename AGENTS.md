# AGENTS.md — tale-studio 도구 공통 진입점

> gjc·Codex 등 Claude Code 밖의 에이전트도 이 파일을 읽는 것으로 간주한다.
> 정본은 아래 파일들이고 여기에 내용을 복제하지 않는다.

1. **`CLAUDE.md`** — 문서 지도 · 개발환경(브랜치=환경, 키 스코프) · 활성 실행 계약.
2. **`.claude/rules/owner-gates.md`** — 오너 관문. 오너의 검수 표면은 **한국어 문장과 화면
   이미지 둘뿐**이다(오너는 코드를 읽지 않는다). 정책성 슬라이스는 정책 문장 diff,
   UI 슬라이스는 스크린샷 첨부. 오너 승인용 산출물에 코드 파일을 내밀지 않는다.
3. **`.claude/rules/tdd.md`** — 테스트를 먼저 쓴다. 어떤 작업이든 "~이면 ~한다" 한국어 동작 목록을 먼저 정하고
   (같이 정한 것 / 혼자 정한 것으로 나눠서) 그 문장을 이름으로 한 테스트를 먼저 쓴다. 실패한 테스트는
   고치거나 지우지 말고 "결정이 필요한 것"으로 오너에게 낸다. "약속 문장"·"삼진"·"판정 카드" 같은 조어는 쓰지 않는다.
4. **`.claude/rules/`** 나머지(architecture · copy-style · experiments · supabase)와
   **`specs/design.md`**(디자인 판별 규칙 — 토큰 정본은 `src/app/globals.css`).

색상 게이트: `pnpm lint:design`이 CI에서 raw 색(hex·rgb/hsl/oklch)을 막는다.
커밋 전에 로컬로 한 번 돌려라. 의도적 예외는 `eslint-disable-next-line` + 사유 한 줄.
