# tale-studio — 문서 지도

> 이 파일은 현재 경로를 가리키는 짧은 인덱스다. 상세 규칙은 `.claude/rules/`,
> 디자인 정본은 `specs/design.md`를 따른다.

## 진실원

- 코드(`src/`)와 live Supabase DB가 진실원이다. 코드에서 유도되는 내용은 문서에 복제하지 않는다.
- 디자인 판별 규칙은 `specs/design.md`, 토큰 값은 `src/app/globals.css`가 소유한다.

## 활성 실행 계약

- `.claude/vault/inbox/<actor>.md`는 오너의 형식 없는 메모 입력이다. 밤은 바이트 스냅샷으로 읽고
  원문을 고치거나 지우지 않는다.
- `.claude/vault/backlog/_NIGHT.md`는 유일한 live 밤 계약이다. 메모와 티켓을 해석해 조사·실험·수리·
  기능 변경을 실행하고 결과를 기록한다.
- `.claude/vault/backlog/tickets/`는 티켓과 결과 카드의 원장이다. `ready`는 실행, `waiting`은 조건 확인,
  `needs-owner`는 사람의 선택, `draft`는 닫힘 조건 보완이 필요하다.
- `runs/<actor>/<run_id>/report.html`은 아침에 읽는 실행 보고서다. 판정 이벤트는
  `feedback/<actor>/<run_id>/`에 남고 다음 밤이 소비한다.
- `.claude/vault/_archive/`는 닫힌 기록과 폐지된 원문의 보관소다. live 입력이나 실행 의존성으로 쓰지 않는다.

## 판단과 연구

- 그림·영상의 최종 품질 판정은 오너만 한다. 밤은 원본·입력·시점·설정·비교 자료를 남긴다.
- `research/`는 선택적인 로컬 실험 공간이다. 실험 규칙은 `.claude/rules/experiments.md`를 따르며,
  `map:dev`·`map:build`가 사용하는 `research/tools/writer-map`은 유지한다.
- 세션 미결과 실측은 `/warp`로 티켓 또는 실험 기록에 붙인다. `/warp`는 inbox 원문을 대신 쓰지 않는다.
