```yaml
id: tfix-repaint-prompt-repairs
source: .claude/vault/2026-08-10-previz-motion-channel.md §3 "실험 불요 확정 수리 안건 4" 중 ③④ (A1 체계적 결함 2건)
kind: fix
budget: { usd: 0, runs: 1, wall_min: 40 }
blockers: []
status: done  # 2026-08-11 밤 러너 — fix/fal-wiring 브랜치(워크트리 .worktrees/fix-fal-wiring/)에 같이 적용, 커밋 없음. ③ END 패널 도착 상태 전건 done 재현 지시 ④ 원본에 없는 화살표 발명 금지(정지 샷 클린 유지). pnpm test 973 통과 유지. 전/후 프롬프트 원문 대조는 reports/2026-08-11.md. 효과 검증(리페인트 재생성)은 티켓 규정대로 다음 리페인트 실험에 편승 — "검증 대기"
priority: normal
```

수리 티켓 — **브랜치 준비까지만. 머지·커밋 금지.** 효과 검증(리페인트 재생성)은 T2 성격이라 이 티켓 밖 — 다음 리페인트 실험에 편승.
**메인 워크트리 브랜치 전환 금지** — tfix-fal-wiring-repairs와 같은 별도 git worktree에서 작업 (_NIGHT.md 규칙 4).

- **작업 ③**: 2동작 샷의 END 패널 실패 방지 — A1 실측에서 sh_01_09(2동작)의 END 패널이 3반복 전부 실패. buildRealStripPrompt에 END 패널의 도착 상태 충실 재현 지시 보강.
- **작업 ④**: 정지 샷에 없던 화살표 추가 금지 — sh_02_10(STATIC HOLD)에 3반복 모두 화살표가 추가됨. "원본 러프에 없는 화살표를 만들지 말 것" 지시 추가.
- **완료 조건**: 브랜치(fix/fal-wiring에 같이 또는 `fix/repaint-prompt`)에 프롬프트 개정 + 개정 전/후 프롬프트 원문 대조를 리포트에.

## 좌표 (동결)

- `src/lib/director/storyboard-strip.ts:169-213` (buildRealStripPrompt — 화살표 재현 지시 :192, 마네킹 치환 :196, 텍스트 금지 :210).
- 실측 근거: previz-channel-ablation A1 — 블로킹 일치 90%(27/30), 체계 결함이 위 2건에 집중.

## 산출 계약

- 브랜치 diff + 프롬프트 전/후 원문을 reports에. status 갱신. 다음 리페인트 실험 티켓이 생기면 "검증 대기" 표시.
