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

## 활성 실행 계약

> 밤 루프(Orca automation)는 2026-09-01부로 당분간 중단 — 밤 계약(`_NIGHT.md` · inbox 스냅샷 ·
> `runs/` 아침 보고 · `feedback/` 소비)은 휴면 상태다. 파일은 보존하되 새 실행 의존성을 만들지 않는다.

- `.claude/vault/backlog/tickets/`는 티켓과 결과 카드의 원장이다. `ready`는 실행, `waiting`은 조건 확인,
  `needs-owner`는 사람의 선택, `draft`는 닫힘 조건 보완이 필요하다.
- `.claude/vault/_archive/`는 닫힌 기록과 폐지된 원문의 보관소다. live 입력이나 실행 의존성으로 쓰지 않는다.

## 판단과 연구

- 그림·영상의 최종 품질 판정은 오너만 한다. 실행자는 원본·입력·시점·설정·비교 자료를 남긴다.
- `research/`는 선택적인 로컬 실험 공간이다. 실험 규칙은 `.claude/rules/experiments.md`를 따르며,
  `map:dev`·`map:build`가 사용하는 `research/tools/writer-map`은 유지한다.
- 세션 미결과 실측은 `/warp`로 티켓 또는 실험 기록에 붙인다. `/warp`는 inbox 원문을 대신 쓰지 않는다.
