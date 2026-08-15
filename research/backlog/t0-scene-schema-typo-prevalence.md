# t0-scene-schema-typo-prevalence — 장면 데이터 필드 오타가 상시 새고 있는가

```yaml
id: t0-scene-schema-typo-prevalence
source: sweep:gjc:019fef52 (1/2)   # 형제: t0-loose-schema-unguarded-fields
종류: 조사
budget: { usd: 0, runs: 1, wall_min: 40 }
blockers: []
status: 완료  # 2026-08-12 밤 러너 — 가설 유지(위반 2씬/2런, 서로 다른 프로젝트·날짜). 기각 조건 미발동. 2건 중 1건은 완료 런에서 조용히 데이터 유실(key_dialouge 오타). 결과: research/experiments/t0-scene-schema-typo-prevalence/
priority: high
```

- **맥락 (사람 언어)**: 한 사용자의 작업이 중간에 죽었다. 원인을 파보니 서버 장애도 AI 실패도 아니었다 — **장면 하나에서 등장인물 목록의 이름표가 잘못 붙어 있었고**(있어야 할 자리는 비어 있고 엉뚱한 이름의 칸에 값이 들어감), 그걸 아무도 안 걸러서 다음 단계가 빈 값을 만지다 터진 것이다. 어제 확인해보니 **지금 코드에서도 같은 데이터가 그대로 통과한다.** 그래서 물어야 할 게 생겼다 — 이게 그 사람 한 명의 불운인가, 아니면 지금도 조용히 새고 있는가. 이 답에 따라 "검사를 어디에 둘 것인가"라는 설계 결정의 급함이 완전히 달라진다.
- **가설**: 등장인물 목록 필드의 누락·오타는 그 프로젝트 한 건이 아니라, 완료된 여러 런에 걸쳐 존재한다.
- **전제**: 느슨한 스키마가 `scene_id`·`location`·`scene_actions`만 검사하고 `characters_in_scene`·`emotion_beat` 등 하류 필드는 안 본다는 것은 어제 코드로 확인됨. 실제 오타 데이터를 넣었더니 검증을 통과하는 것도 재현됨. **실존 빈도만 미측정.**
- **예측**: 참이면 완료 런 전수에서 `characters_in_scene`이 null·부재이거나 정본에 없는 인물 필드명(`characters_id` 등)을 쓴 씬이 2건 이상, 서로 다른 런에서 나온다. 거짓이면 문제의 그 런에서만 나온다 — 그러면 단발 사고이고 설계 수술의 급함이 내려간다.
- **측정**: Supabase의 완료 writer 런에서 씬 배열을 전수 추출 → 씬마다 (a) `characters_in_scene` 존재·타입 (b) 정본 씬 필드 집합 밖의 키 이름을 **코드로 집계**한다. LLM 판정 없음. 산출: 런 수 / 씬 수 / 위반 씬 수 / 위반 키 이름 분포 / 위반이 걸린 런 ID 목록.
- **기각 조건** (사전 등록): 위반 씬이 **1개 런에만** 존재하면 가설 기각(단발 사고). 위반이 **0건**이면 "이미 해소" — 어제 재현 결과와 모순되므로 재현 스크립트 좌표를 결과에 명기한다.

## 좌표 (동결)

- 소비 지점(터진 자리): `src/lib/writer/pipeline/stages/v3_scene_plan.ts:123` — `characters_in_scene`을 있다고 가정하고 `.join()` 호출
- 스키마 정본: `src/lib/writer/pipeline/schemas.ts` (`StorySceneLooseSchema`, `ScenesSchema`)
- 생성 지점: `src/lib/writer/pipeline/stages/s3_scenes.ts`, 병합 경로 `s1s3_merged.ts`
- 씬 타입 정본: `src/lib/writer/types/pipeline.ts`
- DB 접근 선례: `research/experiments/t0-dynamic-spec-enum-audit/collect.mjs`
- 알려진 위반 사례(대조군): 프로젝트 `test_01`, 실패 시각 2026-07-27 16:34 KST, 실패 단계 `sceneCinematography` 6/13, `scene_8`

## 산출 계약

- `research/experiments/t0-scene-schema-typo-prevalence/{result.md, results.json}`
- 이 티켓 status 갱신 + `research/backlog/reports/2026-08-12.md`에 1줄
