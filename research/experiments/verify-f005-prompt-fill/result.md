# 샷 프롬프트가 조용히 지워지는 사고가 재발했는가

실행: 2026-08-16 밤 · 티켓 `.claude/vault/backlog/verify-f005-prompt-fill.md` · 조회만, 지출 0원

## 한 줄 결론

**통과.** 연출 단계에 있는 프로젝트 12개 전부에서 샷 프롬프트 채움률이 100%였다.
샷 486행 중 빈 행 0행. 재발을 소리내게 하려고 걸어둔 데이터베이스 제약(인계철선)이 걸린 기록도 0건이다.

## 무엇을 물었나

연출 화면에 처음 들어가는 순간, 화면 저장 로직이 항상 비어 있는 옛 필드로 샷 프롬프트를 덮어써서
11개 프로젝트 420행이 조용히 지워진 사고가 있었다. 코드 수리(커밋 `0c8c61c`)와 소급 복구(420행),
그리고 빈 문자열 쓰기를 즉시 에러로 만드는 제약(`shots_prompt_not_blanked`)까지 끝났다.
남은 확인은 하나 — 그 뒤로 다시 지워지지 않았는가.

## 어떻게 쟀나 — 티켓에 적힌 자 그대로

티켓 원문: "`projects.current_stage = 'director'` 인 프로젝트별로
`count(*) filter (where coalesce(prompt,'') <> '')` / `count(*)`."

실제 질의(스크립트 `probe.mjs`):

```
select id, title, current_stage, created_at, updated_at
from projects
where current_stage = 'director'
order by created_at asc
```

그리고 프로젝트마다:

```
select id, shot_id, scene_id, prompt, source, created_at, updated_at
from shots
where project_id = <각 프로젝트>
```

채움률은 코드가 계산했다 — `(s.prompt ?? '') !== ''` 인 행 수 나누기 전체 행 수.
데이터베이스의 `coalesce(prompt,'') <> ''` 와 같은 자다.

인계철선 확인은 에러가 기록되는 칸을 문자열로 훑었다:

```
generation_jobs.error / generation_jobs.last_error  ilike '%shots_prompt_not_blanked%'
llm_calls.error                                      ilike '%shots_prompt_not_blanked%'
writer_runs.error / writer_runs.error_detail         (JSON 칸이라 전량 받아 코드에서 문자열 검색)
```

## 결과

| 세는 것 | 값 |
|---|---|
| 연출 단계 프로젝트 | **12개** |
| 그중 채움률 100% | **12개** |
| 그중 100% 미만 | **0개** |
| 훑은 샷 행 | 486행 |
| 빈 행(빈 문자열 또는 없음) | **0행** |
| 인계철선이 걸린 기록 | **0건** |

프로젝트별 전량:

| 프로젝트 | 만든 날(UTC) | 채움률 | 채워진 행 / 전체 | 제목 |
|---|---|---|---|---|
| `2beb605c-3892-4fc2-b493-b76b5b071286` | 2026-07-15 | 100% | 84/84 | 에일리언 2 |
| `011fd4bd-9b0a-46fe-b978-35677a4f6ee6` | 2026-08-05 | 100% | 30/30 | writer_test_260805_5 |
| `c86410d7-2e48-4e02-956d-c415e8e7f03b` | 2026-08-05 | 100% | 22/22 | writer_test_260805_6 |
| `9d6efa6d-3216-40b0-8a2c-184ab56f02ec` | 2026-08-06 | 100% | 116/116 | Sample1 |
| `f79546f6-77df-4331-8e31-0b425fc984a5` | 2026-08-07 | 100% | 21/21 | writer_test_260805_7 (viz 테스트) |
| `d78c6dfb-64f2-4023-9f4c-951a0a14a54c` | 2026-08-07 | 100% | 21/21 | writer_test_260805_7 (previz 재생성) |
| `6d66cacd-7f10-47c8-9c0e-b7f5bc6faa2a` | 2026-08-07 | 100% | 21/21 | Sample2 (previz 재생성 2) |
| `e1a9fd08-fbe2-409d-92ed-b4b31b0efecf` | 2026-08-10 | 100% | 23/23 | writer_test_260810 |
| `a5cb2cae-5b18-4cac-9e5b-62ba0382deb5` | 2026-08-11 | 100% | 21/21 | writer_test_260811 |
| `dc531572-50a4-4985-b343-d32e2b4490b0` | 2026-08-12 | 100% | 36/36 | writer_test_260812 |
| `1e166e55-6797-4b77-a7e4-12c22a4c865c` | 2026-08-12 | 100% | 27/27 | writer_test_260812_1 |
| `3036b333-28ae-41c9-a31b-072eb45484e0` | 2026-08-13 | 100% | 64/64 | writer_test_260813 |

빈 문자열 행과 값 없음(NULL) 행을 따로 세어도 **전 프로젝트 0 / 0** 이다. 즉 이번 통과는
"값 없음이 값 있음으로 계산돼서 나온 100%"가 아니라 진짜로 전 행에 글이 들어 있다.

수리 커밋 `0c8c61c`(2026-08-12T13:07Z) 이후에 만들어져 연출 단계까지 온 프로젝트는
`3036b333-28ae-41c9-a31b-072eb45484e0`(2026-08-13 03:38 생성) 하나이고, 이 프로젝트도
64행 전부 채워져 있다. 수리 이전에 만들어진 11개는 소급 복구분이 지워지지 않고 살아 있음을 함께 보여준다.

## 인계철선 확인

에러 기록이 실제로 남아 있는 writer 런은 4건 있었으나, 그중 `shots_prompt_not_blanked` 를
언급하는 것은 0건이었다. `generation_jobs`, `llm_calls` 쪽도 0건.
제약이 한 번도 걸리지 않았다 = 빈 문자열을 쓰려는 시도 자체가 없었다.

## 판정선 대입

티켓 원문: "전 프로젝트 100%면 통과. 100% 미만이 하나라도 있으면 재발 — 즉시 아침 리포트 최상단.
단 인계철선이 걸려 있어 재발 시 쿼리보다 먼저 에러 로그가 울릴 것이다 — 그 로그 확인도 함께."

12개 중 12개가 100% → **통과**. 인계철선 로그도 0건이라 두 자가 같은 방향을 가리킨다.

## 아직 안 끝난 것 (오너 몫 — 티켓 본문에 있던 그대로)

복원된 기존 프로젝트의 프롬프트를 사람이 눈으로 확인하는 일은 남아 있다.
⚠ **하드 리프레시 후에 열 것.** 옛 화면 묶음이 살아 있는 탭에서 연출 편집을 하면 복원한 행을 다시 지운다.

## 좌표 (재현용)

- 대상: `projects.current_stage = 'director'` 인 프로젝트 전량, 그 프로젝트의 `shots` 전량
- 자: `count(*) filter (where coalesce(prompt,'') <> '') / count(*)`
- 인계철선 이름: `shots_prompt_not_blanked`
  (마이그레이션 `supabase/migrations/20260813020000_shots_prompt_not_blanked.sql`)
- 실행 스크립트: `research/experiments/verify-f005-prompt-fill/probe.mjs`
- 원자료: `research/experiments/verify-f005-prompt-fill/results.json`
- 데이터베이스는 읽기만 했다. 쓰기 없음. 생성 호출 없음. 지출 0원.
