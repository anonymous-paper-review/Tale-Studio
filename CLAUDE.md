# tale-studio — 문서 지도

> 이 파일은 인덱스다. 내용을 여기 쓰지 말고 링크 대상 문서를 개정하라.
> 규칙은 `.claude/rules/`(자동 로드), 디자인 가이드는 UI 작업 시 훅이 주입한다.

## 진실원

- 코드(`src/`)와 live Supabase DB가 진실원이다. 코드로 유도 가능한 내용은 문서로 만들지 않는다.
- `specs/design.md` — 유일한 정본 문서 (디자인 판별 규칙. 토큰 값 자체는 `src/app/globals.css`가 진실)
- 2026-08-05 대청소: 코드 유도 가능/레거시 문서 전량 삭제 (docs, specs 일부, research 레거시, databases).
  복구는 git 히스토리 또는 `~/tale-studio-backup-2026-08-05.tar.gz`

## 기록 (날짜 박힌 세션 증류 — 과거 사실)

- `.claude/vault/` — 세션별 실측·삽질·결정 기록 (포맷: `_TEMPLATE.md`). 같은 주제를 다시 팔 때 먼저 검색
- `.claude/vault/2026-08-05-truth-source-cleanup.md` — "문서가 왜 다 없지?"·실험 규칙/대청소의 근거가 궁금하면 먼저

## 실험

- 실험 시작 전 가설 폼: `research/experiments/_HYPOTHESIS.md` (5줄 — 가설/전제/예측/측정/기각 조건)
- 실험 코드 규칙: `.claude/rules/experiments.md` — 복붙 금지·입력 고정·좌표 기록

## 세션 리추얼

- 세션 종료 시 `/wrap` — 코드로 귀결 안 된 것(결정·삽질·미결)을 vault로 증류
- 결정은 vault 파일의 `## 결정` 섹션에. 반복 참조되는 결정만 정본(rules/specs)으로 승격
