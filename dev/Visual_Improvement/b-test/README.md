# B안 (motion_units 1급 구조) 테스트 하네스

[`../action-unit-camera-alignment.md`](../action-unit-camera-alignment.md) §4.3 **B안**을 실데이터로 검증한다. 앱 코드와 완전 분리 — 루트 tsconfig/eslint에서 `dev/`는 제외되어 빌드·린트에 영향 없음.

**B안의 주장**: 카메라 상태를 행동소 그룹에 타입 수준에서 종속시키면(`motion_units[]`), R1(그룹 내 카메라 상태 변화 금지) 위반이 *구조적으로 불가능*해진다. 측정: ① LLM의 구조 준수력(SCHEMA), ② 규칙 내면화(V2/V3/VB/VS/V4), ③ 분절 일관성(E2-mini, §7).

## 기본 플로우 — 생성은 Claude 서브에이전트

```bash
cd dev/Visual_Improvement/b-test
node --experimental-strip-types src/run.ts prepare      # ① DB → out/inputs/ (context + 씬별 프롬프트)
# ② Claude Code 세션에서: 서브에이전트들이 out/inputs/{scene_id}.prompt.md 를 읽고
#    out/plans/plan-run{N}-{scene_id}.json 에 JSON만 Write (run0/run1 × 씬 = 병렬 4개)
node --experimental-strip-types src/run.ts evaluate     # ③ 검증·채점 → out/report.md
```

Claude에게 시킬 때: "prepare 실행 → 서브에이전트로 계획 생성 → evaluate" — 서브에이전트 지침은 *프롬프트 파일을 Read → JSON 객체 하나 생성 → 지정 경로에 Write (코드펜스·설명 금지, JSON 텍스트만)*.

## 대안: 무인 일괄 실행 (codex / gemini)

```bash
node --experimental-strip-types src/run.ts generate --backend=codex --runs=2
node --experimental-strip-types src/run.ts generate --backend=gemini --runs=2  # 프로덕션 Visual축 동일 모델
```

| 옵션 | 기본값 | 설명 |
|---|---|---|
| `--project` | `1f644223-…` ([TEST] webhook e2e) | 대상 프로젝트 id |
| `--runs` | `2` | (generate) 2 이상이면 run0 vs run1 분절 일관성(E2-mini) 측정 |
| `--label` | `claude-subagent` | (evaluate) 리포트에 표기할 생성 주체 |
| `--env-file` | `Tale-Studio/.env.local` | Supabase·Gemini 키 소스 (읽기 전용) |
| `--out` | `./out` | 산출물 디렉토리 |

## 산출물 (`out/`)

- `inputs/context.json` · `inputs/{scene_id}.prompt.md` — prepare 산출 (오프라인 평가용 스냅샷)
- `plans/plan-run{N}-{scene_id}.json` — 생성 주체가 쓰는 **raw 계획** (LLM JSON 그대로)
- `eval-run{N}-{scene_id}.json` — 정규화 계획 + 위반 + 점수
- `report.md` — 요약·런별 샷 테이블·위반·E2-mini·해석 가이드
- `llm_calls/` — (generate 경로만) LLM 왕복 원문

## 구조

```
src/types.ts     B안 타입 (motion_units 1급 — R1 위반이 표현 불가능한 구조)
src/prompt.ts    씬 단위 생성 프롬프트 + unit budget(시간 예산) 계산
src/validate.ts  SCHEMA·V2(fail)·V3·VB·VS·V4(warn) + alignment score(2·V2+V3)
src/report.ts    md 리포트 + E2-mini 일관성 계산
src/db.ts        Supabase PostgREST 읽기 (zero-dep fetch)  ·  src/env.ts  .env.local 파서(값 비출력)
src/llm.ts       codex exec / Gemini 백엔드 (generate 경로 전용)
src/run.ts       CLI: prepare / evaluate / generate
```

## 주의

- **읽기 전용**: DB는 SELECT만. 앱 코드·DB 비수정.
- **시크릿**: `.env.local`은 파싱만, 값 출력·복사·로깅 금지 (에러도 키 이름만).
- **비용**: LLM 텍스트 호출만. fal 이미지/영상 호출·미디어 재생성 루프 없음.
- R1이 validator에 없는 것은 누락이 아니라 **B안의 검증 포인트** (타입이 위반을 차단).

## 실행 이력

- 2026-06-12 codex(gpt-5.5) runs=2: SCHEMA 0 / V2 0 / V3 1 / 분절 일관성 58% (그룹 수 7/12 일치, 자카드 0.51). 불일치 대부분 "물·기계 = actor vs 환경" 경계 문제로 환원 — env 채널 명시가 다음 실험. (`out/archive-codex-20260612/`)
- 2026-06-12 claude-subagent(Fable 5) runs=2: **전 계획 무위반** (SCHEMA/V2/V3/VB/VS/V4 = 0) / 분절 일관성 **83%** (그룹 수 10/12 일치, 자카드 0.80) / 총 48 units (codex 37 — 더 세밀하되 시간 예산 내). 샷 경계 관통 그룹(R4+match_cut)이 shot_4→5(레버 grip)에서 자발적으로 재현. actor/env 경계 흔들림은 잔존하나 축소 (shot_2/3/5). (`out/`)
