# 한 장에 여러 샷을 그리는 그림의 "칸별 인물 배정"이 실제 생성에 실렸는가

실행: 2026-08-16 밤 · 티켓 `.claude/vault/backlog/verify-f001-grid-identity.md` · 조회만, 지출 0원

## 한 줄 결론

**통과.** 수리 이후 만들어진 일괄 그림 20건 전부에서, 보내는 글에 칸별 인물 배정문과 참고 그림 지정문이
**둘 다** 들어 있었다. 20건 중 20건, 예외 0건.

## 무엇을 물었나

한 장의 종이에 여러 샷을 나란히 그리는 경로가 있다. 예전에는 "몇 번째 칸에 누구를 그려라"라는 말이
보내는 글에 아예 없었다. 그 결함을 고쳤고(커밋 `cb2d56c`), 고친 코드가 실제 생성에 탔는지는
다음 생성물이 나와야만 확인된다. 이 감사는 그 확인이다.

## 어떻게 쟀나 — 티켓에 적힌 자 그대로

티켓 원문: "`generation_jobs` 에서 kind=`storyboard_real_grid`, completed,
created_at ≥ 2026-08-12T11:13Z 인 잡의 `input_snapshot.prompt` 를 읽는다."

실제 질의(스크립트 `probe.mjs`):

```
select id, project_id, kind, status, created_at, input_snapshot, result_url, target, model, provider
from generation_jobs
where kind = 'storyboard_real_grid'
  and created_at >= '2026-08-12T11:13:00Z'
order by created_at asc
```

채점은 코드가 했다. 정규식 두 개:

- `/Column\s+(\d+)\s*:\s*([^\n]+)/gi` — 티켓의 `Column i: <이름>`
- `/reference\s+image\s+(\d+)\s*=\s*([^;.\n]+)/gi` — 티켓의 `reference image N = <이름>`

## 잴 대상이 있었나

티켓이 "조건이 차기 전에는 0건이 정상"이라고 적어둔 항목이다. 조건을 채운 잡은 **21건**이었다.
상태는 완료 20건, 대기 1건. 채점 대상은 완료분 **20건**이다.
가장 이른 것 2026-08-12 14:14:07(UTC), 가장 늦은 것 2026-08-14 03:30:15(UTC).

## 결과

| 세는 것 | 값 |
|---|---|
| 조건에 맞는 잡 | 21건 (완료 20 · 대기 1) |
| 채점한 잡 | 20건 |
| 통과 (배정문 + 참고그림 지정문 둘 다 있음) | **20건** |
| 실패 (하나라도 없음) | 0건 |
| 보내는 글 자체가 기록 안 된 잡 | 0건 |

### 실제로 나온 글 (원문 인용)

잡 `6c8db38a-8390-4721-9156-4ed95fe5dee8` (2026-08-12 14:14:07Z, 프로젝트 `1e166e55`) 의
보내는 글 중 해당 부분:

```
- Character references, in order after the first image: reference image 2 = 소녀.
- Replace every wooden mannequin with the character assigned to ITS OWN column below — never carry a character into a column they are not assigned to:
    * Column 1: 소녀
    * Column 2: 소녀
    * Column 3: 소녀
    * Column 4: 소녀
```

20건 전체에서 나온 배정문을 종류별로 세면 이렇다(같은 문장이 여러 잡에 반복된다):

```
14회 | Column 1: 소녀
13회 | Column 2: 소녀
15회 | Column 3: 소녀
11회 | Column 4: 소녀
 4회 | Column 1: no character — keep this column free of people
 2회 | Column 2: no character — keep this column free of people
 1회 | Column 3: no character — keep this column free of people
 2회 | Column 4: no character — keep this column free of people
 2회 | Column 1: 책사
 2회 | Column 2: 책사
 1회 | Column 3: 책사
 1회 | Column 4: 책사
 2회 | Column 2: 추적자
 2회 | Column 3: 추적자
 1회 | Column 4: 추적자
 1회 | Column 2: 왕국의 추격자들
```

참고 그림 지정문은 이렇게 나왔다:

```
13회 | reference image 2 = 소녀.
 4회 | reference image 2 = 소녀; reference image 3 = 추적자.
 2회 | reference image 2 = 책사.
 1회 | reference image 2 = 소녀; reference image 3 = 왕국의 추격자들.
```

인물이 없는 칸에는 "no character — keep this column free of people"이 들어간다. 즉 배정문이
빠진 게 아니라 "비워두라"는 지시가 들어간 것이라 판정선의 `Column i: <이름>` 규약을 만족한다.

## 판정선 대입

티켓 원문: "`Column i: <이름>` 배정문과 `reference image N = <이름>` 규약이 **둘 다** 있으면 통과.
하나라도 없으면 수리 미배송."

20건 전부 둘 다 있었다 → **통과**. "하나라도 없으면" 쪽에 해당하는 잡은 0건이라
blocked 처리 사유가 발생하지 않았다.

## 추가 관측 — 그림 판정은 하지 않는다

티켓 지시대로 결론은 내지 않고 비교 재료만 정리한다. 20건 중 **한 시트 안에 서로 다른 인물이
섞인 것은 5건**이다. 각각 그림 주소와, 해당 프로젝트의 정본 인물 명단을 함께 남긴다
(전량은 `results.json` 의 `rows` / `characters_by_project`).

| 잡 | 시각(UTC) | 프로젝트 | 칸에 배정된 인물 | 참고 그림 지정 |
|---|---|---|---|---|
| `6948d8d3` | 2026-08-12 14:24:26 | `1e166e55` | 소녀, 왕국의 추격자들 | 소녀, 왕국의 추격자들 |
| `c89ed361` | 2026-08-13 06:47:14 | `3036b333` | 소녀, 추적자 | 소녀, 추적자 |
| `ae85b4aa` | 2026-08-13 07:07:18 | `3036b333` | 소녀, 추적자 | 소녀, 추적자 |
| `358718d8` | 2026-08-13 07:07:46 | `3036b333` | (빈 칸), 소녀, 추적자 | 소녀, 추적자 |
| `033d837d` | 2026-08-13 07:11:05 | `3036b333` | 소녀, 추적자 | 소녀, 추적자 |

프로젝트별 정본 인물 명단(전원 대표 그림 보유):

- `1e166e55-6797-4b77-a7e4-12c22a4c865c` — 소녀(사람), 왕국의 추격자들(사람)
- `3036b333-28ae-41c9-a31b-072eb45484e0` — 소녀(사람), 추적자(사람), 책사(사람)

칸에 적힌 이름은 5건 모두 참고 그림 지정 이름과 일치했고, 두 목록 다 정본 인물 명단 안에 있었다.
**그림 속 인물이 실제로 그 인물로 그려졌는지는 사람이 봐야 한다** — 그림 주소는 `results.json` 의
각 행 `result_url` 에 있다.

## 좌표 (재현용)

- 대상 테이블: `generation_jobs` · 종류 `storyboard_real_grid` · 시각 하한 `2026-08-12T11:13:00Z`
- 그림 모델: `openai/gpt-image-2/edit` (20건 전부 동일), 공급자 `fal`
- 격자 형태: `grid4` (20건 전부 동일, 4칸 x 3줄)
- 기록된 입력 항목: `prompt`, `shotIds`, `ref_grid_url`, `style_anchor_key`, `column_characters`,
  `reference_image_urls`, `scene_time_of_day`
- 보내는 글 길이 1,475 ~ 2,868자
- 실행 스크립트: `research/experiments/verify-f001-grid-identity/probe.mjs`
- 원자료: `research/experiments/verify-f001-grid-identity/results.json`
- 데이터베이스는 읽기만 했다. 쓰기 없음. 생성 호출 없음. 지출 0원.

## 부록 — 잡 20건 전량

형식: 시각(UTC) | 프로젝트 앞 8자 | 잡 앞 8자 | 격자 | 판정 | 배정문 수 | 참고그림 지정 쌍 수 | 글 길이

```
2026-08-12 14:14:07 | 1e166e55 | 6c8db38a | grid4 | pass | col4 | ref1 | 1475자
2026-08-12 14:14:24 | 1e166e55 | 7c9b63de | grid4 | pass | col2 | ref1 | 1532자
2026-08-12 14:17:06 | 1e166e55 | 9f7aadd6 | grid4 | pass | col4 | ref1 | 1475자
2026-08-12 14:17:34 | 1e166e55 | 79276146 | grid4 | pass | col3 | ref1 | 1595자
2026-08-12 14:20:21 | 1e166e55 | 49980c3c | grid4 | pass | col4 | ref1 | 1519자
2026-08-12 14:20:45 | 1e166e55 | 47d6304e | grid4 | pass | col3 | ref1 | 1595자
2026-08-12 14:24:01 | 1e166e55 | 80bd839a | grid4 | pass | col4 | ref1 | 1519자
2026-08-12 14:24:26 | 1e166e55 | 6948d8d3 | grid4 | pass | col3 | ref2 | 1587자  (인물 혼재)
2026-08-13 06:15:01 | 3036b333 | 19389711 | grid4 | pass | col4 | ref1 | 1798자
2026-08-13 06:33:44 | 3036b333 | dd256bc2 | grid4 | pass | col4 | ref1 | 1754자
2026-08-13 06:43:49 | 3036b333 | 16668a36 | grid4 | pass | col4 | ref1 | 1798자
2026-08-13 06:44:02 | 3036b333 | 5daeb80e | grid4 | pass | col4 | ref1 | 1798자
2026-08-13 06:44:25 | 3036b333 | 543e6350 | grid4 | pass | col4 | ref1 | 1754자
2026-08-13 06:44:25 | 3036b333 | 8995386f | grid4 | pass | col4 | ref1 | 1754자
2026-08-13 06:47:14 | 3036b333 | c89ed361 | grid4 | pass | col4 | ref2 | 1777자  (인물 혼재)
2026-08-13 07:07:18 | 3036b333 | ae85b4aa | grid4 | pass | col4 | ref2 | 1776자  (인물 혼재)
2026-08-13 07:07:46 | 3036b333 | 358718d8 | grid4 | pass | col4 | ref2 | 1820자  (인물 혼재)
2026-08-13 07:11:05 | 3036b333 | 033d837d | grid4 | pass | col4 | ref2 | 1776자  (인물 혼재)
2026-08-14 03:29:49 | 3036b333 | 2939147d | grid4 | pass | col4 | ref1 | 2836자
2026-08-14 03:30:15 | 3036b333 | b89800ef | grid4 | pass | col3 | ref1 | 2868자
```

참고 그림 지정은 한 줄 안에 세미콜론으로 여러 쌍이 이어지는 형태다
(`reference image 2 = 소녀; reference image 3 = 추적자.`). 그래서 세는 단위를 줄이 아니라
쌍으로 잡았고 `results.json` 의 `refimage_lines` 도 쌍 단위로 쪼개 저장했다.
쌍 1개짜리 15건, 쌍 2개짜리 5건 — 합 20건으로 채점 대상과 일치한다.
