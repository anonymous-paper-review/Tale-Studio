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
- CI: `.github/workflows/ci.yml`이 main·dev push와 PR에서 `pnpm typecheck && pnpm test`를 돈다
  (시크릿 불필요 — vitest.setup.ts 스텁). 신호등이지 방벽이 아니다 — Vercel은 CI를 기다리지 않고 배포한다.
  결제 코드 경로(`/api/billing/**`·웹훅)는 테스트 없이 main 금지.
- 결제 워크스트림 원장: `.claude/docs/2026-09-01/` (phase-1~3 + fal 키 풀) · 전체 지도: `specs/payments-readiness.md`
  · 기획 안건: `specs/payments-planner-agenda.html`

## vault 봉인 (2026-09-02)

- 밤 루프(Orca automation)는 2026-09-01부로 폐지됐고, `.claude/vault/`는 2026-09-02부로 **봉인**했다.
  티켓·inbox·아카이브·스크립트 전부 **읽지도 쓰지도 않는다**. `/warp`·`night-*` 스킬과 에이전트도 호출하지 않는다.
  세션에서 남는 미결은 티켓으로 만들지 말고 대화에서 오너에게 직접 보고한다.
- 다시 열 때는 오너가 이 절을 지우고 원장 문장을 되살린다.

## 판단과 연구

- 그림·영상의 최종 품질 판정은 오너만 한다. 실행자는 원본·입력·시점·설정·비교 자료를 남긴다.
- `research/`는 선택적인 로컬 실험 공간이다. 실험 규칙은 `.claude/rules/experiments.md`를 따르며,
  `map:dev`·`map:build`가 사용하는 `research/tools/writer-map`은 유지한다.
