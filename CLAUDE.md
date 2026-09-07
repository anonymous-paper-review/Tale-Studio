# tale-studio — 문서 지도

> 이 파일은 현재 경로를 가리키는 짧은 인덱스다. 상세 규칙은 `.claude/rules/`,
> 디자인 정본은 `specs/design.md`를 따른다.

## 진실원

- 코드(`src/`)와 live Supabase DB가 진실원이다. 코드에서 유도되는 내용은 문서에 복제하지 않는다.
- 디자인 판별 규칙은 `specs/design.md`, 토큰 값은 `src/app/globals.css`가 소유한다.

## 개발환경 (2026-09-01 확정 — 결제 준비 phase-1)

- 브랜치 = 환경: `main` → Vercel Production(live) / `dev` → Preview(개발).
  local·dev는 개발 Supabase 프로젝트를 공유하고 live는 main 전용 — live DB를 dev가 바라보게 하지 않는다.
- 스키마는 `supabase/migrations/` 파일로만 바꾼다. 대시보드 직접 수정 금지, 개발 DB 먼저 → live 순서.
- 키 스코프: 개발·샌드박스 키 = Vercel Preview/Development, 라이브 키 = Production에만.
  결제(MoR) 웹훅도 같은 매핑 — 샌드박스 → dev 도메인 / 라이브 → production 도메인.
- CI: `.github/workflows/ci.yml`이 main·dev push와 PR에서 `pnpm typecheck && pnpm lint:design && pnpm test`를 돈다
  (시크릿 불필요 — vitest.setup.ts 스텁). 신호등이지 방벽이 아니다 — Vercel은 CI를 기다리지 않고 배포한다.
  같은 3종을 커밋 전에 로컬 훅(`.githooks/pre-commit`, `pnpm install`이 `core.hooksPath`로 등록)이 먼저 돈다 —
  빨간 스위트는 커밋이 안 된다. 우회는 `--no-verify` + 커밋 메시지에 사유.
  테스트는 셸·`.env.local`의 제품 스위치를 물려받지 않는다(vitest.setup.ts가 지움) — 사람마다 결과가 다르면 안 된다.
  결제 코드 경로(`/api/billing/**`·웹훅)는 테스트 없이 main 금지.
- 테스트 원장: `pnpm test:ledger`(묶음→파일→케이스 이름, 오너용 한국어 표면) · 묶음 실행 `pnpm test:<묶음>` · `test:unsorted`는 분류 부채.
  `pnpm test`가 실패하면 판정 카드(약속 문장 · 실제 결과 · 선택지 3)가 자동으로 찍힌다.
- 결제 워크스트림 원장: `.claude/docs/2026-09-01/` (phase-1~3 + fal 키 풀) · 전체 지도: `specs/payments-readiness.md`
  · 기획 안건: `specs/payments-planner-agenda.html`

## vault 봉인 (2026-09-02)

- 밤 루프(Orca automation)는 2026-09-01부로 폐지됐고, `.claude/vault/`는 2026-09-02부로 **봉인**했다.
  티켓·inbox·아카이브·스크립트 전부 **읽지도 쓰지도 않는다**. `/warp`·`night-*` 스킬과 에이전트도 호출하지 않는다.
  세션에서 남는 미결은 티켓으로 만들지 말고 대화에서 오너에게 직접 보고한다.
- 다시 열 때는 오너가 이 절을 지우고 원장 문장을 되살린다.

## 판단과 연구

- 그림·영상의 최종 품질 판정은 오너만 한다. 실행자는 원본·입력·시점·설정·비교 자료를 남긴다.
- 오너의 검수 표면은 **한국어 문장과 화면 이미지** 둘뿐이다(오너는 코드를 읽지 않는다).
  정책 문장 diff·스크린샷 보드 관문은 `.claude/rules/owner-gates.md`.
- **약속 선행(TDD)** — 기능·수정·버그 어느 슬라이스든 오너와 한국어 약속 문장을 먼저 정하고, 그 문장을
  이름으로 한 테스트(빨강) → 구현(초록) 순서로만 간다. 삼진에 "처음 봄"이 남으면 구현 시작 금지.
  빨간 테스트는 에이전트가 고치거나 지우지 않고 판정 카드를 오너에게 낸다 — `.claude/rules/tdd.md`.
- `research/`는 선택적인 로컬 실험 공간이다. 실험 규칙은 `.claude/rules/experiments.md`를 따르며,
  `map:dev`·`map:build`가 사용하는 `research/tools/writer-map`은 유지한다.
