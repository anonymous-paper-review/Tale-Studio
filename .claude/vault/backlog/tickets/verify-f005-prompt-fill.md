# shots.prompt 채움률 100% 유지 검증 — director 재발 감시

```yaml
id: verify-f005-prompt-fill
source: fixlog:F-005 (원문: .claude/vault/_archive/_FIXLOG.md)
kind: audit
budget: { usd: 0, runs: 1, wall_min: 15 }
blockers: []   # 2026-08-16 밤 — 해제 조건 충족 확인: 0c8c61c(2026-08-12T13:07Z) 이후 생성돼 director 단계인 프로젝트 3036b333(2026-08-13T03:38Z). director 단계 전체는 12건
status: done   # 2026-08-16 밤 — 통과: 연출 단계 프로젝트 12/12 채움률 100%(샷 486행 중 빈 행 0), 인계철선 로그 0건. 남은 것은 오너 육안(하드 리프레시 후). 결과: research/experiments/verify-f005-prompt-fill/result.md
priority: normal
```

- **맥락 (사람 말로)**: 연출 화면에 처음 들어가는 순간, 화면 저장 로직이 항상 빈 값인 옛 필드로
  샷 프롬프트를 덮어써 11개 프로젝트 420행이 조용히 지워진 사고. 코드 수리(`0c8c61c`) + 소급
  복구(420행) + 빈 문자열 쓰기를 에러로 승격하는 인계철선(`shots_prompt_not_blanked`)까지 끝났다.
  남은 건 새 프로젝트에서 재발이 없는지 확인뿐이다.
- **알고 싶은 것**: director 진입 + 카메라·조명 편집을 거친 뒤에도 `shots.prompt` 채움률이 100%인가.
- **어떻게 재나**: `projects.current_stage = 'director'` 인 프로젝트별로
  `count(*) filter (where coalesce(prompt,'') <> '')` / `count(*)`. (사고 당시 이 쿼리가 예외 0건으로
  범인을 갈랐다 — 같은 자로 잰다.)
- **판정선**: 전 프로젝트 100%면 통과. 100% 미만이 하나라도 있으면 재발 — 즉시 아침 리포트 최상단.
  단 인계철선이 걸려 있어 재발 시 쿼리보다 먼저 에러 로그가 울릴 것이다 — 그 로그 확인도 함께.
- **오너 몫 (본문에 남김)**: 복원된 기존 프로젝트 프롬프트 육안 — ⚠ **하드 리프레시 후에 열 것.**
  구 번들 탭에서 director 편집을 하면 복원한 행을 다시 지운다.
- **남기면 끝**: 기계 리포트 한 줄 + status 갱신. 통과면 F-005 완전 종결.
