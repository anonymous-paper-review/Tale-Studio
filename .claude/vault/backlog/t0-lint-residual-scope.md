# t0-lint-residual-scope — 남은 검사 경고 104건이 정말 전부 실험 코드인가

```yaml
id: t0-lint-residual-scope
source: sweep:claude:05f8aa2f
kind: audit
budget: { usd: 0, runs: 1, wall_min: 20 }
blockers: []
status: done  # 2026-08-12 밤 러너 — 가설 유지(src/ 에러 0, 규칙도 no-explicit-any 하나로 수렴). 기각 조건 미발동. 단 총량 213 vs 기준선 104(+105%, ±20% 밖)를 먼저 보고: 제외 규칙이 `.worktrees/**`인데 실제 중복 사본은 `.claude/worktrees/**`라 70건이 재검사됨 + 오늘 밤 러너 스크립트가 39건 기여. 결과: research/experiments/t0-lint-residual-scope/
priority: normal
```

- **맥락 (사람 언어)**: 어제 코드 검사 대상에서 중복 사본을 빼자 경고가 161건에서 104건으로 줄었다. 그런데 세션이 "**남은 104건은 전부 실험 폴더 것**"이라고 말한 채 문장이 끊기며 끝났다. 이 단정이 맞는지가 생각보다 중요하다. 맞으면 실험 폴더를 검사에서 빼는 결정 하나로 검사가 초록불이 되고, 앞으로 진짜 문제가 생겼을 때 바로 눈에 띈다. 틀리면 **제품 코드의 진짜 문제가 104건 더미에 섞여 가려져 있다는 뜻**이고, 지금은 아무도 그걸 못 보고 있다. 지금은 검사가 항상 빨간불이라 사실상 경보기가 꺼진 상태다.
- **가설**: 잔여 검사 에러 104건은 전부 `research/experiments/` 하위의 `no-explicit-any`이고, 제품 코드(`src/`) 기여분은 0이다.
- **전제**: `.worktrees/**` 제외는 어제 커밋됨(`eslint.config.mjs:17-18`), 검사 파일 1098→564·에러 161→104는 실측됨. **잔여의 경로·규칙별 분해만 미측정.**
- **예측**: 참이면 에러를 경로와 규칙으로 쪼갰을 때 `src/` 기여가 0이고 규칙이 `no-explicit-any` 하나로 수렴한다. 거짓이면 `src/` 에러가 나오거나 다른 규칙이 섞인다 — 그건 지금 가려져 있는 실제 문제다.
- **측정**: `pnpm lint`를 기계 판독 가능한 형식으로 돌려 **에러를 (경로 최상위 디렉토리 × 규칙 이름)으로 교차 집계**한다. 산출: 총 에러 수 / `src/` 에러 수와 그 목록(있으면 파일:라인 전수) / 규칙별 분포. 코드 수정·자동 교정 절대 금지 — 세기만 한다.
- **기각 조건** (사전 등록): `src/` 하위 에러가 **1건이라도** 있으면 가설 기각 — 전건을 파일:라인과 규칙 이름으로 열거한다. 총 에러 수가 104와 크게 다르면(±20% 밖) 그 사실을 먼저 보고한다(그 사이 코드가 바뀐 것).
- **금지**: `--fix` 실행 금지. 규칙 설정 파일 수정 금지(어느 쪽으로 고칠지는 오너 결정 — 카드로 올라가 있다).

## 좌표 (동결)

- 설정: `eslint.config.mjs` (`.worktrees/**` 제외가 17-18행)
- 명령: `pnpm lint` (`package.json:10`)
- 참고: `pnpm build`에는 타입 검사가 포함된다(`next.config.ts`가 비어 있어 `typescript.ignoreBuildErrors` 기본 false) — lint와 별개 축이니 섞지 마라
- 어제 실측 기준선: 검사 파일 564개 / error 104 / warning 34

## 산출 계약

- `research/experiments/t0-lint-residual-scope/{result.md, results.json}`
- 이 티켓 status 갱신 + `.claude/vault/backlog/reports/2026-08-12.md`에 1줄
